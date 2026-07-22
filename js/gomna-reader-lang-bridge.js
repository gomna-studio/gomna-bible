/* gomna-reader-lang-bridge.js — KO ⇄ LANG 🌐 bridge in the sticky reader header
 *
 * Shared reader-language state controller. Synchronizes the header bridge,
 * commentary header chip, existing language modal, and Google/native apply paths.
 *
 * Storage:
 *   gomna_recent_foreign_language — most recent non-Korean language code
 *   gomna_reader_lang_bridge_snapshot — short-lived session snapshot across Google reloads
 *
 * Event:
 *   gomna:languagechange — detail: { activeLanguage, recentForeignLanguage, source }
 */
(function () {
  'use strict';

  if (window.GomnaReaderLangBridge) return;

  var RECENT_FOREIGN_KEY = 'gomna_recent_foreign_language';
  var SNAPSHOT_KEY = 'gomna_reader_lang_bridge_snapshot';
  var EVENT_NAME = 'gomna:languagechange';
  var SNAPSHOT_VERSION = 1;
  var SNAPSHOT_TTL_MS = 180000;
  var DEFAULT_FOREIGN = 'en';
  var FIXED_ID = 'gomnaReaderLangBridge';
  var COMMENTARY_ID = 'gomnaReaderLangBridgeCommentary';
  var ROOT_COMMENTARY_CLASS = 'gomna-lang-bridge-in-commentary';

  var _restoreConsumed = false;
  var _restoreRunning = false;
  var _pendingSnapshot = null;
  var _bound = false;
  var _commentaryObserver = null;

  function normalizeLangCode(code) {
    if (!code) return null;
    var c = String(code).toLowerCase().replace(/_/g, '-').trim();
    if (!c || c === 'auto') return null;
    if (c === 'zh-cn' || c === 'zh-tw' || c.indexOf('zh-') === 0) return c;
    var primary = c.split('-')[0];
    return primary || null;
  }

  function displayCode(code) {
    var n = normalizeLangCode(code) || DEFAULT_FOREIGN;
    return String(n).toUpperCase();
  }

  function readRecentForeign() {
    try {
      var n = normalizeLangCode(localStorage.getItem(RECENT_FOREIGN_KEY));
      if (n && n !== 'ko') return n;
    } catch (e) { /* ignore */ }
    return DEFAULT_FOREIGN;
  }

  function writeRecentForeign(code) {
    var n = normalizeLangCode(code);
    if (!n || n === 'ko') return;
    try { localStorage.setItem(RECENT_FOREIGN_KEY, n); } catch (e) { /* ignore */ }
  }

  function readCookieLang() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (!m) return null;
      return normalizeLangCode(decodeURIComponent(m[1]).split('/')[2] || null);
    } catch (e) {
      return null;
    }
  }

  function getActiveLanguage() {
    try {
      var display = window.__gomnaBridgeDisplayLang;
      if (display) {
        var dNorm = normalizeLangCode(display);
        if (dNorm) return dNorm;
      }
    } catch (ePend) { /* ignore */ }
    if (typeof window.getReaderUiLangCode === 'function') {
      try {
        var ui = window.getReaderUiLangCode();
        if (ui === 'ko' || ui === 'en' || ui === 'ja') return ui;
        if (ui == null) {
          var cookie = readCookieLang();
          if (cookie && cookie !== 'ko') return cookie;
        }
      } catch (e0) { /* ignore */ }
    }
    if (typeof window.GomnaGetActiveLangCode === 'function') {
      try {
        var active = normalizeLangCode(window.GomnaGetActiveLangCode());
        if (active) return active;
      } catch (e1) { /* ignore */ }
    }
    var cookieLang = readCookieLang();
    if (cookieLang) return cookieLang;
    try {
      var stored = normalizeLangCode(localStorage.getItem('gomna_ui_language'));
      if (stored) return stored;
    } catch (e2) { /* ignore */ }
    return 'ko';
  }

  function getState() {
    var active = getActiveLanguage() || 'ko';
    var recent = readRecentForeign();
    if (active && active !== 'ko') recent = active;
    return {
      activeLanguage: active,
      recentForeignLanguage: recent || DEFAULT_FOREIGN
    };
  }

  function dispatchLanguageChange(source) {
    var state = getState();
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: {
          activeLanguage: state.activeLanguage,
          recentForeignLanguage: state.recentForeignLanguage,
          source: source || 'unknown'
        }
      }));
    } catch (e) { /* ignore */ }
    syncAllBridges();
  }

  function noteLanguageApplied(nextLang, source) {
    var n = normalizeLangCode(nextLang) || 'ko';
    if (n !== 'ko') writeRecentForeign(n);
    dispatchLanguageChange(source || 'apply');
  }

  function isReaderPage() {
    try {
      var path = (location.pathname || '').toLowerCase();
      return path.indexOf('reader') !== -1;
    } catch (e) {
      return false;
    }
  }

  function captureReadingContext() {
    var book = window.currentBook || null;
    var chapter = window.currentChapter || null;
    var selectedNums = Array.isArray(window.selectedVerseNums) ? window.selectedVerseNums.slice() : [];
    var selectedOne = window.selectedVerseNum || null;
    var rangeStart = window.opt4RangeStart || null;
    var rangeEnd = window.opt4RangeEnd || null;
    var listenMode = window.verseListenMode || null;
    var userChoice = window.userVerseTargetChoice || null;
    var commentaryOpen = false;
    var commentaryVerse = null;
    var commentaryTab = null;
    var relatedReturn = null;
    try {
      var pop = document.getElementById('commentaryPopup');
      commentaryOpen = !!(pop && pop.classList.contains('show'));
    } catch (e0) { /* ignore */ }
    if (commentaryOpen) {
      commentaryVerse = window.currentCommentaryVerseForRelated || selectedOne || null;
      commentaryTab = window.currentCommentaryTab || null;
      if (window.relatedCommentaryReturnState) {
        try {
          relatedReturn = JSON.parse(JSON.stringify(window.relatedCommentaryReturnState));
        } catch (e1) {
          relatedReturn = window.relatedCommentaryReturnState;
        }
      }
    }

    var dailyWord = false;
    try {
      dailyWord = document.documentElement.classList.contains('is-daily-word-view');
    } catch (e2) { /* ignore */ }

    var entrySource = null;
    try {
      entrySource = new URLSearchParams(location.search).get('source') || null;
    } catch (e3) { /* ignore */ }

    var nearestVerse = null;
    var verseOffset = 0;
    try {
      var scrollEl = typeof window.getBibleListScrollContainer === 'function'
        ? window.getBibleListScrollContainer()
        : (document.scrollingElement || document.documentElement);
      var items = document.querySelectorAll('#verseList .verse-item[data-verse]');
      var viewportTop = 0;
      if (scrollEl === document.scrollingElement || scrollEl === document.documentElement || scrollEl === document.body) {
        viewportTop = 0;
      } else if (scrollEl && scrollEl.getBoundingClientRect) {
        viewportTop = scrollEl.getBoundingClientRect().top;
      }
      var bestDist = Infinity;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var rect = el.getBoundingClientRect();
        var dist = Math.abs(rect.top - viewportTop - 8);
        if (rect.bottom < viewportTop - 40) continue;
        if (dist < bestDist) {
          bestDist = dist;
          nearestVerse = parseInt(el.getAttribute('data-verse'), 10) || null;
          verseOffset = rect.top - viewportTop;
        }
      }
    } catch (e4) { /* ignore */ }

    var scrollY = 0;
    try {
      var se = typeof window.getBibleListScrollContainer === 'function'
        ? window.getBibleListScrollContainer()
        : (document.scrollingElement || document.documentElement);
      scrollY = se && typeof se.scrollTop === 'number' ? se.scrollTop : (window.scrollY || 0);
    } catch (e5) { /* ignore */ }

    return {
      version: SNAPSHOT_VERSION,
      ts: Date.now(),
      bookName: book && book.name ? book.name : null,
      testament: book && book.testament ? book.testament : null,
      chapters: book && book.chapters ? book.chapters : null,
      chapter: chapter,
      selectedVerseNums: selectedNums,
      selectedVerseNum: selectedOne,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      verseListenMode: listenMode,
      userVerseTargetChoice: userChoice,
      nearestVerse: nearestVerse,
      verseOffset: verseOffset,
      scrollY: scrollY,
      dailyWord: dailyWord,
      entrySource: entrySource,
      commentaryOpen: commentaryOpen,
      commentaryVerse: commentaryVerse,
      commentaryTab: commentaryTab,
      relatedCommentaryReturnState: relatedReturn,
      href: location.href
    };
  }

  function prepareTransition(nextLang, source) {
    if (!isReaderPage()) return;
    var snap = captureReadingContext();
    snap.nextLang = normalizeLangCode(nextLang) || null;
    snap.source = source || 'transition';
    _restoreConsumed = false;
    _restoreRunning = false;
    _pendingSnapshot = snap;
    try {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch (e) { /* ignore */ }
    if (nextLang && normalizeLangCode(nextLang) !== 'ko') {
      writeRecentForeign(nextLang);
    }
  }

  function readSnapshot() {
    try {
      var raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      var snap = JSON.parse(raw);
      if (!snap || snap.version !== SNAPSHOT_VERSION) return null;
      if (!snap.ts || (Date.now() - snap.ts) > SNAPSHOT_TTL_MS) return null;
      if (!snap.bookName || !snap.chapter) return null;
      return snap;
    } catch (e) {
      return null;
    }
  }

  function clearSnapshot() {
    try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch (e) { /* ignore */ }
  }

  function findBookMeta(bookName) {
    if (!bookName) return null;
    try {
      var findFn = typeof window.findBook === 'function' ? window.findBook : null;
      var oldData = window.oldTestamentData;
      var newData = window.newTestamentData;
      if (findFn && oldData) {
        var oldB = findFn(oldData, bookName);
        if (oldB) return { bookData: oldB, testament: 'old', name: bookName };
      }
      if (findFn && newData) {
        var newB = findFn(newData, bookName);
        if (newB) return { bookData: newB, testament: 'new', name: bookName };
      }
      /* Fallback: scan books arrays by Korean name */
      function scan(data, testament) {
        if (!data || !data.books) return null;
        for (var i = 0; i < data.books.length; i++) {
          if (data.books[i].name === bookName) {
            return { bookData: data.books[i], testament: testament, name: bookName };
          }
        }
        return null;
      }
      return scan(oldData, 'old') || scan(newData, 'new');
    } catch (e) { /* ignore */ }
    return null;
  }

  function restoreVisibleAnchor(snap) {
    if (!snap || !snap.nearestVerse) return;
    var item = document.querySelector('#verseList .verse-item[data-verse="' + snap.nearestVerse + '"]');
    if (!item) return;
    try {
      var scrollEl = typeof window.getBibleListScrollContainer === 'function'
        ? window.getBibleListScrollContainer()
        : (document.scrollingElement || document.documentElement);
      var viewportTop = 0;
      if (scrollEl === document.scrollingElement || scrollEl === document.documentElement || scrollEl === document.body) {
        viewportTop = 0;
      } else if (scrollEl && scrollEl.getBoundingClientRect) {
        viewportTop = scrollEl.getBoundingClientRect().top;
      }
      var rect = item.getBoundingClientRect();
      var currentOffset = rect.top - viewportTop;
      var delta = currentOffset - (typeof snap.verseOffset === 'number' ? snap.verseOffset : 0);
      if (scrollEl && typeof scrollEl.scrollTop === 'number') {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
      } else {
        window.scrollBy(0, delta);
      }
    } catch (e) {
      if (typeof window.scrollVerseIntoView === 'function') {
        window.scrollVerseIntoView(snap.nearestVerse);
      }
    }
  }

  function applySelection(snap) {
    if (!snap) return;
    try {
      if (typeof snap.rangeStart === 'number' && typeof snap.rangeEnd === 'number' &&
          typeof window.applyRange === 'function') {
        window.applyRange(snap.rangeStart, snap.rangeEnd);
      }
      if (snap.userVerseTargetChoice != null) {
        window.userVerseTargetChoice = snap.userVerseTargetChoice;
      }
      if (snap.verseListenMode) {
        window.verseListenMode = snap.verseListenMode;
      }
      if (Array.isArray(snap.selectedVerseNums) && snap.selectedVerseNums.length &&
          typeof window.restoreVerseSelection === 'function') {
        window.restoreVerseSelection(snap.selectedVerseNums);
      } else if (Array.isArray(snap.selectedVerseNums) && snap.selectedVerseNums.length) {
        window.selectedVerseNums = snap.selectedVerseNums.slice();
        window.selectedVerseNum = snap.selectedVerseNum || snap.selectedVerseNums[snap.selectedVerseNums.length - 1];
        if (typeof window.applyVerseSelectionHighlight === 'function') {
          window.applyVerseSelectionHighlight();
        }
        if (typeof window.updateOpt4BottomBar === 'function') {
          window.updateOpt4BottomBar();
        }
      } else if (snap.selectedVerseNum && typeof window.restoreVerseSelection === 'function') {
        window.restoreVerseSelection([snap.selectedVerseNum]);
      }
    } catch (e) { /* ignore */ }
  }

  function applyCommentary(snap) {
    if (!snap || !snap.commentaryOpen || !snap.commentaryVerse) return;
    try {
      if (snap.relatedCommentaryReturnState) {
        window.relatedCommentaryReturnState = snap.relatedCommentaryReturnState;
      }
      if (snap.commentaryTab) {
        window.currentCommentaryTab = snap.commentaryTab;
      }
      if (typeof window.showCommentary === 'function') {
        window.showCommentary(snap.commentaryVerse);
      }
      if (snap.commentaryTab) {
        setTimeout(function () {
          try {
            var btn = document.querySelector('.commentary-tab[onclick*="' + snap.commentaryTab + '"]') ||
              document.querySelector('.commentary-tab[data-tab="' + snap.commentaryTab + '"]');
            if (btn && typeof window.switchCommentaryTab === 'function') {
              window.switchCommentaryTab(btn, snap.commentaryTab);
            } else {
              var target = document.getElementById(snap.commentaryTab);
              if (target) {
                var tabs = document.querySelectorAll('.commentary-tab');
                for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
                var contents = document.querySelectorAll('.tab-content');
                for (var j = 0; j < contents.length; j++) {
                  contents[j].classList.remove('active');
                  contents[j].style.display = 'none';
                }
                target.classList.add('active');
                target.style.display = 'block';
                window.currentCommentaryTab = snap.commentaryTab;
              }
            }
          } catch (e2) { /* ignore */ }
        }, 40);
      }
    } catch (e) { /* ignore */ }
  }

  function applyDailyWord(snap) {
    if (!snap || !snap.dailyWord) return;
    try {
      document.documentElement.classList.add('is-daily-word-view');
      var focusVerse = snap.selectedVerseNum || snap.nearestVerse || snap.commentaryVerse;
      if (focusVerse) {
        var item = document.querySelector('#verseList .verse-item[data-verse="' + focusVerse + '"]');
        if (item) item.classList.add('verse-item--daily-word-focus');
      }
    } catch (e) { /* ignore */ }
  }

  function restoreFromSnapshot(snap) {
    if (!snap || _restoreRunning || _restoreConsumed) return false;
    _restoreRunning = true;
    try {
      var meta = findBookMeta(snap.bookName);
      if (!meta) {
        _restoreRunning = false;
        return false;
      }
      var needNav = true;
      try {
        if (window.currentBook && window.currentBook.name === snap.bookName &&
            window.currentChapter === snap.chapter) {
          needNav = false;
        }
      } catch (e0) { /* ignore */ }

      if (needNav) {
        var chCount = snap.chapters;
        if (!chCount && meta.bookData) {
          chCount = typeof window.getDisplayedChapterCount === 'function'
            ? window.getDisplayedChapterCount(meta.bookData)
            : (meta.bookData.chapters ? meta.bookData.chapters.length : 1);
        }
        window.currentBook = {
          name: snap.bookName,
          chapters: chCount,
          testament: snap.testament || meta.testament
        };
        window.currentChapter = snap.chapter;
        window.currentTab = snap.testament || meta.testament;
        document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
        var verseView = document.getElementById('verseView');
        if (verseView) verseView.classList.add('active');
        if (typeof window.renderVerses === 'function') {
          window.renderVerses(snap.nearestVerse || snap.selectedVerseNum || 1);
        }
        if (typeof window.loadCommentaryData === 'function') {
          try { window.loadCommentaryData(); } catch (e1) { /* ignore */ }
        }
        if (typeof window.syncReaderChapterLayout === 'function') {
          try { window.syncReaderChapterLayout(); } catch (e2) { /* ignore */ }
        }
      }

      applySelection(snap);
      applyDailyWord(snap);

      requestAnimationFrame(function () {
        restoreVisibleAnchor(snap);
        requestAnimationFrame(function () {
          restoreVisibleAnchor(snap);
          applyCommentary(snap);
          _restoreConsumed = true;
          _restoreRunning = false;
          clearSnapshot();
          syncAllBridges();
        });
      });
      return true;
    } catch (e) {
      _restoreRunning = false;
      return false;
    }
  }

  function tryRestorePending() {
    if (_restoreConsumed) return;
    var snap = _pendingSnapshot || readSnapshot();
    if (!snap) return;
    _pendingSnapshot = snap;
    if (!window.currentBook && !(window.oldTestamentData || window.newTestamentData)) return;
    restoreFromSnapshot(snap);
  }

  function openLanguageModal() {
    if (typeof window.GomnaOpenLanguageModal === 'function') {
      window.GomnaOpenLanguageModal();
      return;
    }
    var btn = document.querySelector('.gt-btn');
    if (btn) btn.click();
  }

  function applyLanguageCode(langCode, source) {
    var code = normalizeLangCode(langCode) || 'ko';
    if (code !== 'ko') writeRecentForeign(code);
    try { window.__gomnaBridgeDisplayLang = code; } catch (e0) { /* ignore */ }
    dispatchLanguageChange(source || 'bridge-optimistic');
    prepareTransition(code, source || 'bridge');
    if (typeof window.GomnaApplyLanguageByCode === 'function') {
      window.GomnaApplyLanguageByCode(code, source || 'bridge');
      return;
    }
    openLanguageModal();
  }

  function bridgeHtml(compact) {
    var state = getState();
    var foreign = displayCode(state.recentForeignLanguage);
    var active = state.activeLanguage || 'ko';
    var koActive = active === 'ko';
    var foreignActive = !koActive;
    var cls = 'gomna-lang-bridge' + (compact ? ' gomna-lang-bridge--compact' : '');
    return (
      '<div class="' + cls + '" role="group" aria-label="Reading language">' +
        '<button type="button" class="gomna-lang-bridge-btn gomna-lang-bridge-ko' + (koActive ? ' is-active' : '') + '" data-bridge-action="ko" aria-label="Switch to Korean" aria-pressed="' + (koActive ? 'true' : 'false') + '">KO</button>' +
        '<button type="button" class="gomna-lang-bridge-btn gomna-lang-bridge-swap" data-bridge-action="swap" aria-label="Toggle between Korean and ' + foreign + '">⇄</button>' +
        '<button type="button" class="gomna-lang-bridge-btn gomna-lang-bridge-foreign' + (foreignActive ? ' is-active' : '') + '" data-bridge-action="foreign" aria-label="Switch to ' + foreign + '" aria-pressed="' + (foreignActive ? 'true' : 'false') + '">' + foreign + '</button>' +
        '<button type="button" class="gomna-lang-bridge-btn gomna-lang-bridge-globe" data-bridge-action="globe" aria-label="Open language selector">🌐</button>' +
      '</div>'
    );
  }

  function bindBridgeRoot(root) {
    if (!root || root.getAttribute('data-bridge-bound') === '1') return;
    root.setAttribute('data-bridge-bound', '1');
    root.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-bridge-action]') : null;
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      var action = btn.getAttribute('data-bridge-action');
      var state = getState();
      if (action === 'ko') {
        applyLanguageCode('ko', 'bridge-ko');
      } else if (action === 'foreign') {
        applyLanguageCode(state.recentForeignLanguage || DEFAULT_FOREIGN, 'bridge-foreign');
      } else if (action === 'swap') {
        if ((state.activeLanguage || 'ko') === 'ko') {
          applyLanguageCode(state.recentForeignLanguage || DEFAULT_FOREIGN, 'bridge-swap');
        } else {
          applyLanguageCode('ko', 'bridge-swap');
        }
      } else if (action === 'globe') {
        openLanguageModal();
      }
    });
  }

  function ensureHeaderBridge() {
    var header = document.getElementById('verseReadHeader');
    var el = document.getElementById(FIXED_ID);
    var nextBtn = document.getElementById('verseReadNextBtn');
    if (!el) {
      el = document.createElement('div');
      el.id = FIXED_ID;
      el.className = 'gomna-reader-lang-bridge-host notranslate';
      el.setAttribute('translate', 'no');
      if (header && nextBtn) header.insertBefore(el, nextBtn);
      else if (header) header.appendChild(el);
      else document.body.appendChild(el);
    } else if (header && nextBtn && el.nextElementSibling !== nextBtn) {
      header.insertBefore(el, nextBtn);
    } else if (header && el.parentNode !== header) {
      if (nextBtn) header.insertBefore(el, nextBtn);
      else header.appendChild(el);
    }
    el.classList.add('gomna-reader-lang-bridge-host', 'notranslate');
    el.setAttribute('translate', 'no');
    el.removeAttribute('aria-hidden');
    el.innerHTML = bridgeHtml(false);
    bindBridgeRoot(el);
    return el;
  }

  function ensureCommentaryBridge() {
    var header = document.getElementById('popupDragHeader');
    if (!header) return null;
    var el = document.getElementById(COMMENTARY_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = COMMENTARY_ID;
      el.className = 'gomna-reader-lang-bridge-host gomna-reader-lang-bridge-host--commentary notranslate';
      el.setAttribute('translate', 'no');
      var slot = header.querySelector('.gomna-commentary-lang-bridge-slot');
      if (slot) {
        slot.innerHTML = '';
        slot.appendChild(el);
      } else {
        var spacer = header.firstElementChild;
        if (spacer && spacer.tagName === 'DIV' && !spacer.id) {
          spacer.style.width = 'auto';
          spacer.style.minWidth = '0';
          spacer.style.flex = '0 0 auto';
          spacer.innerHTML = '';
          spacer.appendChild(el);
        } else {
          header.insertBefore(el, header.firstChild);
        }
      }
    }
    el.innerHTML = bridgeHtml(true);
    bindBridgeRoot(el);
    return el;
  }

  function isCommentaryOpen() {
    try {
      var pop = document.getElementById('commentaryPopup');
      return !!(pop && pop.classList.contains('show'));
    } catch (e) {
      return false;
    }
  }

  function syncAllBridges() {
    if (!isReaderPage()) return;
    var root = document.documentElement;
    var commentaryOpen = isCommentaryOpen();
    root.classList.toggle(ROOT_COMMENTARY_CLASS, commentaryOpen);

    var headerBridge = ensureHeaderBridge();
    if (commentaryOpen) {
      ensureCommentaryBridge();
      if (headerBridge) headerBridge.setAttribute('hidden', '');
    } else {
      var cHost = document.getElementById(COMMENTARY_ID);
      if (cHost) cHost.setAttribute('hidden', '');
      if (headerBridge) headerBridge.removeAttribute('hidden');
    }
    if (commentaryOpen) {
      var cEl = document.getElementById(COMMENTARY_ID);
      if (cEl) {
        cEl.removeAttribute('hidden');
        cEl.innerHTML = bridgeHtml(true);
        bindBridgeRoot(cEl);
      }
    }
    if (headerBridge && !headerBridge.hasAttribute('hidden')) {
      headerBridge.innerHTML = bridgeHtml(false);
      bindBridgeRoot(headerBridge);
    }
  }

  function observeCommentary() {
    if (_commentaryObserver) return;
    var pop = document.getElementById('commentaryPopup');
    if (!pop) return;
    _commentaryObserver = new MutationObserver(function () {
      syncAllBridges();
    });
    _commentaryObserver.observe(pop, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    if (!isReaderPage() || _bound) return;
    _bound = true;

    try {
      var activeNow = getActiveLanguage();
      if (activeNow && activeNow !== 'ko') writeRecentForeign(activeNow);
    } catch (eSeed) { /* ignore */ }

    var snap = readSnapshot();
    if (snap) {
      _pendingSnapshot = snap;
      /* Keep until successful restore; cleared in restoreFromSnapshot. */
    }

    ensureHeaderBridge();
    syncAllBridges();
    observeCommentary();

    window.addEventListener(EVENT_NAME, function () {
      syncAllBridges();
    });
    window.addEventListener('gomna:reader-translation-settled', function () {
      tryRestorePending();
      syncAllBridges();
    });
    window.addEventListener('gomna:verse_list_rendered', function () {
      tryRestorePending();
      syncAllBridges();
    });

    document.addEventListener('DOMContentLoaded', function () {
      syncAllBridges();
      observeCommentary();
      setTimeout(tryRestorePending, 0);
    });

    if (document.readyState !== 'loading') {
      setTimeout(tryRestorePending, 50);
      setTimeout(tryRestorePending, 400);
    }

    /* If page is Korean / already settled, still attempt restore once data is ready. */
    setTimeout(function () {
      if (!_restoreConsumed && _pendingSnapshot) tryRestorePending();
      syncAllBridges();
    }, 900);
  }

  window.GomnaReaderLangBridge = {
    RECENT_FOREIGN_KEY: RECENT_FOREIGN_KEY,
    SNAPSHOT_KEY: SNAPSHOT_KEY,
    EVENT_NAME: EVENT_NAME,
    getState: getState,
    getActiveLanguage: getActiveLanguage,
    getRecentForeignLanguage: readRecentForeign,
    setRecentForeignLanguage: writeRecentForeign,
    noteLanguageApplied: noteLanguageApplied,
    prepareTransition: prepareTransition,
    captureReadingContext: captureReadingContext,
    dispatchLanguageChange: dispatchLanguageChange,
    applyLanguageCode: applyLanguageCode,
    openLanguageModal: openLanguageModal,
    syncAllBridges: syncAllBridges,
    displayCode: displayCode,
    normalizeLangCode: normalizeLangCode
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
