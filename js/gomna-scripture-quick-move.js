/* Shared scripture quick-move card. Reader and Home use the same overlay, renderers, and data. */
(function(){
  'use strict';
  if (window.__GOMNA_SCRIPTURE_QUICK_MOVE__) return;
  window.__GOMNA_SCRIPTURE_QUICK_MOVE__ = true;

  var OVERLAY_HTML = ''
    + '<div class="scripture-quick-move-sheet" id="scriptureQuickMoveSheet" tabindex="-1">'
    +   '<div class="scripture-quick-move-head">'
    +     '<h2 class="scripture-quick-move-title" id="scriptureQuickMoveTitle">성경 빠른 이동</h2>'
    +     '<button type="button" class="scripture-quick-move-close" id="scriptureQuickMoveClose" aria-label="닫기">'
    +       '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>'
    +     '</button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-seg" id="scriptureQuickMoveSeg" role="tablist" aria-label="구약 신약 선택">'
    +     '<button type="button" class="scripture-quick-move-seg-btn" role="tab" data-qm-testament="old" aria-selected="true">구약</button>'
    +     '<button type="button" class="scripture-quick-move-seg-btn" role="tab" data-qm-testament="new" aria-selected="false">신약</button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-address" id="scriptureQuickMoveAddress">'
    +     '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrBook" data-qm-stage="book"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrBookText">책 선택</span></button>'
    +     '<span class="scripture-quick-move-addr-sep" aria-hidden="true">›</span>'
    +     '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrChapter" data-qm-stage="chapter"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrChapterText">장 선택</span></button>'
    +     '<span class="scripture-quick-move-addr-sep" aria-hidden="true">›</span>'
    +     '<button type="button" class="scripture-quick-move-addr-btn" id="scriptureQuickMoveAddrVerse" data-qm-stage="verse"><span class="scripture-quick-move-addr-text" id="scriptureQuickMoveAddrVerseText">절 선택</span></button>'
    +   '</div>'
    +   '<div class="scripture-quick-move-body" id="scriptureQuickMoveBody"></div>'
    + '</div>';

  var staged = { testament: 'old', bookName: '', chapter: 0 };
  var stage = 'book';
  var lastFocusEl = null;
  var closeTimer = null;
  var bodyBound = false;
  var moveTag = null;
  var chromeBound = false;

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function ensureOverlay(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scriptureQuickMoveOverlay';
    overlay.className = 'scripture-quick-move-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'scriptureQuickMoveTitle');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.innerHTML = OVERLAY_HTML;
    document.body.appendChild(overlay);
    return overlay;
  }

  function langCode(){
    try { return typeof getReaderUiLangCode === 'function' ? getReaderUiLangCode() : 'ko'; }
    catch (e) { return 'ko'; }
  }
  function nativeUi(lang){
    try { return typeof isReaderNativeUiLang === 'function' ? isReaderNativeUiLang(lang) : (lang === 'ko'); }
    catch (e) { return lang === 'ko'; }
  }
  function labels(lang){
    if (lang === 'en') return {
      title: 'Quick Move', old: 'Old Testament', neo: 'New Testament',
      find: 'Find Bible', close: 'Close', open: 'Open quick move',
      bookSlot: 'Book', chapterSlot: 'Chapter', verseSlot: 'Verse',
      againBook: 'choose book again', againChapter: 'choose chapter again',
      openRange: 'open verse range picker',
      chapterAddr: function(ch){ return 'Ch. ' + ch; }
    };
    if (lang === 'ja') return {
      title: '聖書クイック移動', old: '旧約', neo: '新約',
      find: '聖書を探す', close: '閉じる', open: 'クイック移動を開く',
      bookSlot: '書を選択', chapterSlot: '章を選択', verseSlot: '節を選択',
      againBook: '書を選び直す', againChapter: '章を選び直す',
      openRange: '節の範囲を選択',
      chapterAddr: function(ch){ return ch + '章'; }
    };
    return {
      title: '성경 빠른 이동', old: '구약', neo: '신약',
      find: '성경 찾기', close: '닫기', open: '성경 빠른 이동 열기',
      bookSlot: '책 선택', chapterSlot: '장 선택', verseSlot: '절 선택',
      againBook: '책 다시 선택', againChapter: '장 다시 선택',
      openRange: '구절 범위 선택 열기',
      chapterAddr: function(ch, unit){ return ch + (unit || '장'); }
    };
  }
  function chapterUnit(bookName){
    try { return typeof getChapterUnit === 'function' ? getChapterUnit(bookName) : '장'; }
    catch (e) { return '장'; }
  }
  function bookDisplay(bookName, lang){
    if ((lang === 'en' || lang === 'ja') && window.GomnaTranslateBookName) {
      try { return window.GomnaTranslateBookName(bookName, lang) || bookName; } catch (e) { /* ignore */ }
    }
    return bookName;
  }
  function chapterDisplay(bookName, chapter, lang){
    var label = bookDisplay(bookName, lang);
    if (lang === 'en') return label + ' ' + chapter;
    if (lang === 'ja') return label + chapter + '章';
    return bookName + ' ' + chapter + chapterUnit(bookName);
  }
  function testamentData(testament){
    return testament === 'old' ? window.oldTestamentData : window.newTestamentData;
  }
  function catalogBooks(){
    var all = [];
    try { all = typeof getAllBooks === 'function' ? getAllBooks() : []; } catch (e) { all = []; }
    return all || [];
  }
  function booksOf(testament){
    return catalogBooks().filter(function(b){ return b && b.testament === testament; });
  }
  function chapterCountOf(bookName, testament){
    if (!bookName) return 0;
    try {
      var bd = typeof findBook === 'function' ? findBook(testamentData(testament), bookName) : null;
      if (bd && typeof getDisplayedChapterCount === 'function') return getDisplayedChapterCount(bd);
    } catch (e) { /* fall through to catalog */ }
    var all = catalogBooks();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].name === bookName) return Number(all[i].chapters) || 0;
    }
    return 0;
  }
  function esc(v){ return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function testamentOf(bookName){
    var all = catalogBooks();
    if (!bookName) return '';
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].name === bookName) return all[i].testament;
    }
    return '';
  }

  function recentReadPlace(){
    var api = window.GOMNA_HOME_RESUME;
    var entry = null;
    if (!api || typeof api.getRead !== 'function') return null;
    try { entry = api.getRead(); } catch (e) { entry = null; }
    if (!entry || !entry.bookName || !entry.chapter) return null;
    return { bookName: String(entry.bookName), chapter: Number(entry.chapter), testament: '' };
  }

  function toolbarPlace(){
    var book = window.currentBook;
    if (book && book.name && window.currentChapter) {
      return { bookName: book.name, chapter: Number(window.currentChapter),
               testament: book.testament === 'new' ? 'new' : 'old' };
    }
    return recentReadPlace() || { bookName: '창세기', chapter: 1, testament: 'old' };
  }

  function syncLocationButton(){
    var btn = document.getElementById('verseToolbarLocationButton');
    var txt = document.getElementById('verseToolbarLocationText');
    if (!btn || !txt) return;
    var lang = langCode();
    var t = labels(nativeUi(lang) ? lang : 'ko');
    var label = t.find;
    var hasPlace = !!(window.currentBook && window.currentBook.name && window.currentChapter);
    if (hasPlace) label = chapterDisplay(window.currentBook.name, window.currentChapter, nativeUi(lang) ? lang : 'ko');
    else if (document.documentElement.classList.contains('reader-books-toolbar')) {
      var listPlace = toolbarPlace();
      label = chapterDisplay(listPlace.bookName, listPlace.chapter, nativeUi(lang) ? lang : 'ko');
    }
    txt.textContent = label;
    btn.setAttribute('aria-label', label + ' · ' + t.open);
    if (typeof markReaderOwnedTranslate === 'function') markReaderOwnedTranslate(btn, nativeUi(lang));
  }
  window.__gomnaSyncScriptureLocationButton = syncLocationButton;

  function syncSheetChrome(){
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    var t = labels(lang);
    var title = document.getElementById('scriptureQuickMoveTitle');
    var closeBtn = document.getElementById('scriptureQuickMoveClose');
    if (title) title.textContent = t.title;
    if (closeBtn) closeBtn.setAttribute('aria-label', t.close);
    document.querySelectorAll('#scriptureQuickMoveSeg .scripture-quick-move-seg-btn').forEach(function(btn){
      var tst = btn.getAttribute('data-qm-testament');
      btn.textContent = tst === 'old' ? t.old : t.neo;
      var on = tst === staged.testament;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function chapterAddrLabel(t, lang){
    return lang === 'ko' ? t.chapterAddr(staged.chapter, chapterUnit(staged.bookName)) : t.chapterAddr(staged.chapter);
  }

  function renderAddress(lang, t){
    var slots = [
      { id: 'Book', stage: 'book', filled: !!staged.bookName,
        text: staged.bookName ? bookDisplay(staged.bookName, lang) : t.bookSlot },
      { id: 'Chapter', stage: 'chapter', filled: !!(staged.bookName && staged.chapter),
        text: (staged.bookName && staged.chapter) ? chapterAddrLabel(t, lang) : t.chapterSlot },
      { id: 'Verse', stage: 'verse', filled: !!(staged.bookName && staged.chapter), text: t.verseSlot }
    ];
    slots.forEach(function(slot){
      var btn = document.getElementById('scriptureQuickMoveAddr' + slot.id);
      var txt = document.getElementById('scriptureQuickMoveAddr' + slot.id + 'Text');
      if (!btn || !txt) return;
      txt.textContent = slot.text;
      btn.classList.toggle('is-current', stage === slot.stage);
      btn.classList.toggle('is-empty', !slot.filled && stage !== slot.stage);
      btn.setAttribute('aria-current', stage === slot.stage ? 'step' : 'false');
      var aria = slot.text;
      if (slot.stage === 'book' && staged.bookName) aria = slot.text + ', ' + t.againBook;
      else if (slot.stage === 'chapter' && slot.filled) aria = slot.text + ', ' + t.againChapter;
      else if (slot.stage === 'verse' && slot.filled) aria = slot.text + ', ' + t.openRange;
      btn.setAttribute('aria-label', aria);
      if (typeof markReaderOwnedTranslate === 'function') markReaderOwnedTranslate(btn, nativeUi(langCode()));
    });
  }

  function renderBookStage(lang, t){
    var html = '<p class="scripture-quick-move-stage-title">' + esc(t.bookSlot) + '</p><div class="scripture-quick-move-books">';
    booksOf(staged.testament).forEach(function(b){
      var sel = b.name === staged.bookName ? ' is-selected' : '';
      html += '<button type="button" class="scripture-quick-move-item' + sel + '" data-qm-book="' + esc(b.name) + '"'
        + (sel ? ' aria-current="true"' : '') + '>' + esc(bookDisplay(b.name, lang)) + '</button>';
    });
    return html + '</div>';
  }

  function renderChapterStage(lang, t){
    var chCount = chapterCountOf(staged.bookName, staged.testament);
    var html = '<p class="scripture-quick-move-stage-title">' + esc(t.chapterSlot) + '</p><div class="scripture-quick-move-nums">';
    for (var c = 1; c <= chCount; c++) {
      var sel = c === staged.chapter ? ' is-selected' : '';
      html += '<button type="button" class="scripture-quick-move-item' + sel + '" data-qm-chapter="' + c + '"'
        + (sel ? ' aria-current="true"' : '') + '>' + c + '</button>';
    }
    return html + '</div>';
  }

  function ensureMoveTag(){
    if (moveTag) return moveTag;
    moveTag = document.createElement('button');
    moveTag.type = 'button';
    moveTag.id = 'quickMoveChapterMoveAction';
    moveTag.className = 'verse-range-move-action';
    moveTag.textContent = typeof VERSE_MOVE_ACTION_TEXT === 'string' ? VERSE_MOVE_ACTION_TEXT : '이동 →';
    moveTag.setAttribute('data-move-bound', '1');
    moveTag.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      goToStagedChapterStart();
    });
    return moveTag;
  }

  function syncMoveTag(){
    var grid = document.querySelector('#scriptureQuickMoveBody .scripture-quick-move-nums');
    var selected = grid ? grid.querySelector('.scripture-quick-move-item.is-selected') : null;
    if (!grid || !selected) {
      if (moveTag && moveTag.parentNode) moveTag.parentNode.removeChild(moveTag);
      return;
    }
    var tag = ensureMoveTag();
    var rowLast = selected;
    var next = selected.nextElementSibling;
    while (next && next !== tag && next.offsetTop === selected.offsetTop) {
      rowLast = next;
      next = next.nextElementSibling;
    }
    if (rowLast.nextSibling !== tag) grid.insertBefore(tag, rowLast.nextSibling);
    var gridRect = grid.getBoundingClientRect();
    var selRect = selected.getBoundingClientRect();
    var max = Math.max(0, gridRect.width - tag.offsetWidth);
    tag.style.marginLeft = Math.round(Math.min(Math.max(selRect.left - gridRect.left, 0), max)) + 'px';
  }

  function revealMoveTag(){
    var scroller = document.getElementById('scriptureQuickMoveBody');
    if (!scroller || !moveTag || !moveTag.parentNode) return;
    var over = moveTag.getBoundingClientRect().bottom - (scroller.getBoundingClientRect().bottom - 4);
    if (over > 0) scroller.scrollTop += over;
  }

  function readerHref(bookName, chapter, verse){
    return 'reader.html?book=' + encodeURIComponent(bookName)
      + '&chapter=' + encodeURIComponent(chapter)
      + '&verse=' + encodeURIComponent(verse || 1);
  }

  function goToSelectedPlace(bookName, chapter, verse, testament){
    if (typeof goToVerse === 'function') {
      goToVerse(bookName, chapter, verse || 1, testament);
      if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
      return;
    }
    window.location.href = readerHref(bookName, chapter, verse || 1);
  }

  function goToStagedChapterStart(){
    if (!staged.bookName || !staged.chapter) return;
    var bookName = staged.bookName;
    var chapter = staged.chapter;
    var testament = staged.testament;
    close();
    goToSelectedPlace(bookName, chapter, 1, testament);
  }

  function render(){
    var body = document.getElementById('scriptureQuickMoveBody');
    if (!body) return;
    var lang = nativeUi(langCode()) ? langCode() : 'ko';
    var t = labels(lang);
    if (!staged.bookName) stage = 'book';
    syncSheetChrome();
    renderAddress(lang, t);
    var seg = document.getElementById('scriptureQuickMoveSeg');
    if (seg) seg.hidden = false;
    if (stage === 'chapter') body.innerHTML = renderChapterStage(lang, t);
    else body.innerHTML = renderBookStage(lang, t);
    syncMoveTag();
    if (!bodyBound) {
      body.addEventListener('click', onBodyClick);
      bodyBound = true;
    }
  }

  function setStage(next){
    stage = next;
    render();
    var body = document.getElementById('scriptureQuickMoveBody');
    if (body) body.scrollTop = 0;
  }

  function onBodyClick(e){
    var target = e.target && e.target.closest ? e.target.closest('[data-qm-book],[data-qm-chapter]') : null;
    if (!target) return;
    var bookName = target.getAttribute('data-qm-book');
    if (bookName) {
      if (bookName !== staged.bookName) staged.chapter = 0;
      staged.bookName = bookName;
      setStage('chapter');
      return;
    }
    var ch = target.getAttribute('data-qm-chapter');
    if (ch) {
      var body = document.getElementById('scriptureQuickMoveBody');
      var keep = body ? body.scrollTop : 0;
      staged.chapter = parseInt(ch, 10) || 0;
      render();
      if (body) body.scrollTop = keep;
      revealMoveTag();
    }
  }

  function onAddressClick(e){
    var btn = e.target && e.target.closest ? e.target.closest('[data-qm-stage]') : null;
    if (!btn) return;
    var want = btn.getAttribute('data-qm-stage');
    if (want === 'verse') {
      if (staged.bookName && staged.chapter) { openStagedVerseRange(); return; }
      want = staged.bookName ? 'chapter' : 'book';
    } else if (want === 'chapter' && !staged.bookName) {
      want = 'book';
    }
    setStage(want);
  }

  function openStagedVerseRange(){
    if (!staged.bookName || !staged.chapter) return;
    var bookName = staged.bookName;
    var chapter = staged.chapter;
    var testament = staged.testament;
    if (typeof chooseVerseListenTargetMode === 'function' && typeof goToVerse === 'function') {
      var sameChapter = !!(window.currentBook && window.currentBook.name === bookName
        && Number(window.currentChapter) === Number(chapter));
      close();
      if (sameChapter) { chooseVerseListenTargetMode('range'); return; }
      goToVerse(bookName, chapter, 1, testament);
      if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
      requestAnimationFrame(function(){ chooseVerseListenTargetMode('range'); });
      return;
    }
    close();
    window.location.href = readerHref(bookName, chapter, 1) + '#verse-range';
  }

  function goToToolbarPlace(){
    var place = toolbarPlace();
    var vv = document.getElementById('verseView');
    var tst;
    if (typeof goToVerse !== 'function') return;
    if (window.currentBook && window.currentBook.name === place.bookName
      && Number(window.currentChapter) === place.chapter
      && vv && vv.classList.contains('active')) return;
    tst = place.testament || testamentOf(place.bookName);
    if (!tst) { place = { bookName: '창세기', chapter: 1 }; tst = testamentOf('창세기') || 'old'; }
    goToVerse(place.bookName, place.chapter, 1, tst);
    if (typeof resetVerseViewScroll === 'function') resetVerseViewScroll();
  }

  function hasRenderedVerseContext(){
    return !!(window.currentBook && window.currentChapter
      && document.querySelector('#verseView #verseList .verse-item'));
  }

  function onBooksToolbarClick(e){
    if (!document.documentElement.classList.contains('reader-books-toolbar')) return;
    var btn = e.target && e.target.closest
      ? e.target.closest('#opt4VerseListen,#opt4VerseCommentary,#opt4VerseMore')
      : null;
    if (!btn) return;
    if (btn.id === 'opt4VerseMore' && hasRenderedVerseContext()) return;
    goToToolbarPlace();
  }

  function focusables(){
    var sheet = document.getElementById('scriptureQuickMoveSheet');
    if (!sheet) return [];
    return Array.prototype.filter.call(
      sheet.querySelectorAll('button:not([disabled]):not([hidden])'),
      function(el){ return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  function onKeydown(e){
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    var sheet = document.getElementById('scriptureQuickMoveSheet');
    if (e.shiftKey && (active === first || !sheet || !sheet.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function isOpen(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    return !!(overlay && overlay.classList.contains('is-open'));
  }

  function open(opts){
    if (!opts || typeof opts !== 'object' || typeof opts.preventDefault === 'function') opts = {};
    var overlay = ensureOverlay();
    bindChrome();
    if (!overlay || isOpen()) return;
    if (typeof closeUnifiedBookChapterModal === 'function') closeUnifiedBookChapterModal();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    lastFocusEl = document.activeElement;
    var book = window.currentBook;
    var wantTestament = (opts.testament === 'old' || opts.testament === 'new') ? opts.testament : '';
    if (wantTestament) {
      staged.testament = wantTestament;
      if (opts.resetPlace || !book || !book.name || ((book.testament === 'new' ? 'new' : 'old') !== wantTestament)) {
        staged.bookName = '';
        staged.chapter = 0;
      } else {
        staged.bookName = book.name;
        staged.chapter = window.currentChapter ? Number(window.currentChapter) : 0;
      }
    } else if (book && book.name) {
      staged.testament = book.testament === 'new' ? 'new' : 'old';
      staged.bookName = book.name;
      staged.chapter = window.currentChapter ? Number(window.currentChapter) : 0;
    } else {
      staged.testament = (typeof currentTab === 'string' && currentTab === 'new') ? 'new' : 'old';
      staged.bookName = '';
      staged.chapter = 0;
    }
    stage = (!staged.bookName || opts.stage === 'book') ? 'book' : (opts.stage === 'chapter' ? 'chapter' : 'book');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    render();
    document.documentElement.classList.add('scripture-quick-move-lock');
    var locBtn = document.getElementById('verseReadTitleBtn');
    if (locBtn) locBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeydown, true);
    var body = document.getElementById('scriptureQuickMoveBody');
    if (body) body.scrollTop = 0;
    requestAnimationFrame(function(){
      overlay.classList.add('is-open');
      var sheet = document.getElementById('scriptureQuickMoveSheet');
      if (sheet) sheet.focus({ preventScroll: true });
      if (body) body.scrollTop = 0;
    });
  }

  function close(){
    var overlay = document.getElementById('scriptureQuickMoveOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('scripture-quick-move-lock');
    document.removeEventListener('keydown', onKeydown, true);
    var locBtn = document.getElementById('verseReadTitleBtn');
    if (locBtn) locBtn.setAttribute('aria-expanded', 'false');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function(){
      closeTimer = null;
      if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    }, 280);
    if (lastFocusEl && document.contains(lastFocusEl) && lastFocusEl.offsetParent !== null) {
      try { lastFocusEl.focus(); } catch (e) { /* ignore */ }
    }
    lastFocusEl = null;
  }

  function bindChrome(){
    if (chromeBound) return;
    var overlay = ensureOverlay();
    if (!overlay) return;
    chromeBound = true;
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    var closeBtn = document.getElementById('scriptureQuickMoveClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var seg = document.getElementById('scriptureQuickMoveSeg');
    if (seg) {
      seg.addEventListener('click', function(e){
        var btn = e.target && e.target.closest ? e.target.closest('[data-qm-testament]') : null;
        if (!btn) return;
        var tst = btn.getAttribute('data-qm-testament');
        if (tst === staged.testament) return;
        staged.testament = tst;
        staged.bookName = '';
        staged.chapter = 0;
        setStage('book');
      });
    }
    var address = document.getElementById('scriptureQuickMoveAddress');
    if (address) address.addEventListener('click', onAddressClick);
    window.addEventListener('resize', function(){
      if (isOpen() && stage === 'chapter') syncMoveTag();
    });
    var bottomBar = document.getElementById('opt4BottomBar');
    if (bottomBar) bottomBar.addEventListener('click', onBooksToolbarClick, true);
    syncLocationButton();
  }

  onReady(bindChrome);

  window.openScriptureQuickMove = open;
  window.closeScriptureQuickMove = close;
})();
