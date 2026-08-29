
(function () {
  'use strict';

  // Verified structure (2026-07-14):
  // reader.html tab IDs (9): tab-원어분석, tab-역사적배경, tab-신학적의미, tab-예표론,
  //   tab-매튜헨리, tab-설교자료, tab-찬송가, tab-상담적용, tab-교차참조
  // gomna-audio-commentary-buttons.js types (9): original-language, history, theology,
  //   typology, matthew-henry, sermon, hymn, counseling, cross-reference
  // TTS files under tts-scripts/ko-KR/{book}/{chapter}/{verse}/:
  //   original-language.txt, history.txt, theology.txt, typology.txt, matthew-henry.txt,
  //   sermon.txt, hymn.txt, counseling.txt, cross-reference.txt
  //
  // original-language DOM (verified):
  // #tab-원어분석 > table.commentary-table > tbody > tr[data-verse-ref]
  // Each tr = one numbered item; td.col1 / td.col2 / td.col3
  //
  // original-language TTS (verified genesis/001/001/original-language.txt):
  // intro paragraph → row paragraphs (one per 표1_원어분석 row) → optional closing
  // matthew-henry TTS (verified genesis/001/001/matthew-henry.txt):
  // intro → per card: guide + English + Korean (paragraphsPerItem: 3) → optional closing
  //
  // Verified scroll area (css/gomna-audio-player.css):
  // #commentaryPopupBox (flex column, overflow:hidden)
  //   .popup-drag-header (fixed)
  //   #commentaryContent (flex:1, overflow-y:auto — actual vertical scroll parent)
  //   .gomna-commentary-inline-controls (fixed bottom buttons)
  //
  // exactCueTest=1 URL param (manual sync verification only):
  // Patches GOMNA_AUDIO_CONFIG.manifestData.audios filePath in memory for
  // genesis 1:1 commentary IDs before audio-engine reads entry.filePath.

  var EXACT_CUE_TEST_AUDIO_MAP = {
    'genesis.001.001.original-language': '/audio/highlight-test/ko-KR/genesis/001/001/original-language-study.mp3',
    'genesis.001.001.history': '/audio/highlight-test/ko-KR/genesis/001/001/history-warm.mp3',
    'genesis.001.001.theology': '/audio/highlight-test/ko-KR/genesis/001/001/theology-warm.mp3',
    'genesis.001.001.typology': '/audio/highlight-test/ko-KR/genesis/001/001/typology-study.mp3',
    'genesis.001.001.matthew-henry': '/audio/highlight-test/ko-KR/genesis/001/001/matthew-henry-calm.mp3',
    'genesis.001.001.sermon': '/audio/highlight-test/ko-KR/genesis/001/001/sermon-strong.mp3',
    'genesis.001.001.hymn': '/audio/highlight-test/ko-KR/genesis/001/001/hymn-soft.mp3',
    'genesis.001.001.counseling': '/audio/highlight-test/ko-KR/genesis/001/001/counseling-warm.mp3',
    'genesis.001.001.cross-reference': '/audio/highlight-test/ko-KR/genesis/001/001/cross-reference-calm.mp3'
  };

  function isExactCueTestMode() {
    try {
      return new URLSearchParams(window.location.search).get('exactCueTest') === '1';
    } catch (e) {
      return false;
    }
  }

  function applyExactCueTestManifestOverrides() {
    var config = window.GOMNA_AUDIO_CONFIG;
    var audios = config && config.manifestData && config.manifestData.audios;
    var audioId;
    var entry;
    var applied = 0;

    if (!audios) return 0;

    for (audioId in EXACT_CUE_TEST_AUDIO_MAP) {
      if (!Object.prototype.hasOwnProperty.call(EXACT_CUE_TEST_AUDIO_MAP, audioId)) continue;

      entry = audios[audioId];
      if (!entry) continue;

      if (!entry._exactCueTestOriginalFilePath) {
        entry._exactCueTestOriginalFilePath = entry.filePath;
      }

      entry.filePath = EXACT_CUE_TEST_AUDIO_MAP[audioId];
      applied += 1;
    }

    return applied;
  }

  function initExactCueTestManifestOverrides() {
    var applied;

    if (!isExactCueTestMode()) return;

    applied = applyExactCueTestManifestOverrides();
    if (applied > 0) {
      console.log('[GOMNA_CUE_TEST] exactCueTest=1 manifest overrides applied:', applied);
      return;
    }

    window.addEventListener('gomna:manifest_loaded', function onManifestLoaded() {
      window.removeEventListener('gomna:manifest_loaded', onManifestLoaded);
      applied = applyExactCueTestManifestOverrides();
      if (applied > 0) {
        console.log('[GOMNA_CUE_TEST] exactCueTest=1 manifest overrides applied:', applied);
      }
    });
  }

  var ACTIVE_CLASS = 'gomna-commentary-card-active';
  /* Near-center band ~±15% of visible height (mobile commentary auto-follow). */
  var CENTER_TOP_RATIO = 0.35;
  var CENTER_BOTTOM_RATIO = 0.65;
  var USER_IDLE_RESUME_MS = 1400;
  /*
   * Cue timing correction (seconds). Default 0 — only change after measured
   * same-direction lag across multiple KO/EN/JA samples. Cap ±0.12s.
   */
  var CUE_TIME_OFFSET_BY_LOCALE = {
    'ko-KR': 0,
    'en-US': 0,
    'ja-JP': 0
  };
  var CUE_TIME_OFFSET_DEFAULT = 0;

  var isUserInteracting = false;
  var isAutoCentering = false;
  var isHeaderPullDragging = false;
  var isSeekUiActive = false;
  var autoCenterGeneration = 0;
  var autoCenterToken = 0;
  var resumeFollowTimerId = null;
  var lastUserInputAt = 0;
  var lastFollowedKey = '';
  var lastFollowedAudioId = '';
  var deferredFollowRafId = 0;
  var deferredFollowTimerId = null;
  var autoCenterListenersBound = false;
  var ignoreProgrammaticScrollUntil = 0;

  function normalizeCompact(text) {
    return String(text || '').replace(/\s+/g, '');
  }

  function refNumbersPresent(ref, text) {
    var nums = String(ref || '').match(/\d+/g);
    var i;

    if (!nums || !nums.length) return false;

    for (i = 0; i < nums.length; i++) {
      if (text.indexOf(nums[i]) < 0) return false;
    }

    return true;
  }

  var COMMENTARY_TYPE_CONFIG = {
    'original-language': {
      tabId: 'tab-원어분석',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'original-language.txt',
      typeTitle: '원어분석'
    },
    history: {
      tabId: 'tab-역사적배경',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'history.txt',
      typeTitle: '역사적배경'
    },
    theology: {
      tabId: 'tab-신학적의미',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'theology.txt',
      typeTitle: '신학적의미'
    },
    typology: {
      tabId: 'tab-예표론',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'typology.txt',
      typeTitle: '예표론'
    },
    'matthew-henry': {
      tabId: 'tab-매튜헨리',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'matthew-henry.txt',
      typeTitle: '매튜헨리',
      paragraphsPerItem: 3
    },
    sermon: {
      tabId: 'tab-설교자료',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'sermon.txt',
      typeTitle: '설교자료',
      validateTtsRows: function (rowTexts, rows) {
        var i;
        var hint;
        var heading;
        var text;

        for (i = 0; i < rows.length; i++) {
          text = normalizeCompact(rowTexts[i]);
          hint = normalizeCompact(rows[i].내용 || '');
          heading = normalizeCompact(
            String(rows[i].대지 || '').replace(/^\d+대지:\s*/, '')
          );

          if (hint.length >= 4 && text.indexOf(hint.slice(0, 6)) >= 0) {
            continue;
          }

          if (heading.length >= 2 && text.indexOf(heading.slice(0, 4)) >= 0) {
            continue;
          }

          return false;
        }

        return true;
      }
    },
    hymn: {
      tabId: 'tab-찬송가',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'hymn.txt',
      typeTitle: '찬송가',
      validateTtsRows: function (rowTexts, rows) {
        var i;
        var title;
        var text;

        for (i = 0; i < rows.length; i++) {
          title = normalizeCompact(rows[i].제목 || '');
          text = normalizeCompact(rowTexts[i]);

          if (!title || title.length < 2 || text.indexOf(title.slice(0, 4)) < 0) {
            return false;
          }
        }

        return true;
      }
    },
    counseling: {
      tabId: 'tab-상담적용',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'counseling.txt',
      typeTitle: '상담적용'
    },
    'cross-reference': {
      tabId: 'tab-교차참조',
      itemSelector: 'tr[data-verse-ref]',
      cellSelector: 'td.col1, td.col2, td.col3',
      minCells: 3,
      textFile: 'cross-reference.txt',
      typeTitle: '교차참조',
      validateTtsRows: function (rowTexts, rows) {
        var i;

        for (i = 0; i < rows.length; i++) {
          if (!refNumbersPresent(rows[i].구절, rowTexts[i])) {
            return false;
          }
        }

        return true;
      }
    }
  };

  var boundAudio = null;
  var boundAudioId = null;
  var lastRowIndex = -1;
  var lastRowIndicesKey = '';
  var activeAudioId = null;
  var activeConfig = null;
  var segmentsByAudioId = {};
  var spokenTextsByAudioId = {};
  var playbackVisualRafId = null;

  function isCrossReferenceAudioId(audioId) {
    return getTypeFromAudioId(audioId) === 'cross-reference';
  }

  function getLivePlaybackAudio(state) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var live = engine && engine._state ? engine._state.currentAudio : null;
    var liveId = engine && engine._state ? engine._state.currentAudioId : null;

    if (
      live &&
      state &&
      state.currentAudioId &&
      liveId === state.currentAudioId
    ) {
      return live;
    }

    if (boundAudio && boundAudioId && state && boundAudioId === state.currentAudioId) {
      return boundAudio;
    }

    return live || boundAudio || null;
  }

  function getCueTimeOffsetSeconds(audioId) {
    var parsed = parseCommentaryHighlightAudioId(audioId);
    var locale = parsed && parsed.locale ? parsed.locale : '';
    var offset = Object.prototype.hasOwnProperty.call(CUE_TIME_OFFSET_BY_LOCALE, locale)
      ? CUE_TIME_OFFSET_BY_LOCALE[locale]
      : CUE_TIME_OFFSET_DEFAULT;
    if (!Number.isFinite(offset)) return 0;
    if (offset > 0.12) return 0.12;
    if (offset < -0.12) return -0.12;
    return offset;
  }

  function getPlaybackCurrentTime(state, audio) {
    var element = audio || getLivePlaybackAudio(state);
    var t = 0;
    var offset = 0;
    if (element && Number.isFinite(element.currentTime)) {
      t = element.currentTime;
    } else {
      t = state ? (Number(state.currentTime) || 0) : 0;
    }
    offset = getCueTimeOffsetSeconds(state && state.currentAudioId);
    return Math.max(0, t + offset);
  }

  function parseCommentaryHighlightAudioId(audioId) {
    var raw;
    var match;
    var bookId;
    var chapter;
    var verse;
    var type;
    var locale;
    var baseAudioId;

    if (typeof audioId !== 'string' || !audioId) return null;

    raw = audioId;
    match = raw.match(
      /^([a-z0-9]+)\.(\d+)\.(\d+)\.([a-z0-9-]+)(?:\.(en-US|ja-JP))?$/
    );
    if (!match) return null;

    bookId = match[1];
    chapter = match[2];
    verse = match[3];
    type = match[4];
    locale = match[5] || 'ko-KR';
    baseAudioId = bookId + '.' + chapter + '.' + verse + '.' + type;

    return {
      audioId: raw,
      baseAudioId: baseAudioId,
      bookId: bookId,
      chapter: chapter,
      verse: verse,
      verseNum: parseInt(verse, 10),
      type: type,
      locale: locale
    };
  }

  function getTypeFromAudioId(audioId) {
    var parsed = parseCommentaryHighlightAudioId(audioId);
    return parsed ? parsed.type : null;
  }

  function getConfigForAudioId(audioId) {
    var type = getTypeFromAudioId(audioId);
    return type ? COMMENTARY_TYPE_CONFIG[type] || null : null;
  }

  function getSection(config) {
    return config ? document.getElementById(config.tabId) : null;
  }

  function extractVerseNumFromRef(ref) {
    var text = String(ref || '').replace(/\s+/g, ' ').trim();
    var match;

    if (!text) return null;

    match = text.match(/(\d+)\s*:\s*(\d+)\s*$/);
    if (match) return parseInt(match[2], 10);

    match = text.match(/(?:^|\s)(\d+)\s*(?:절|節)(?:\s|$)/);
    if (match) return parseInt(match[1], 10);

    return null;
  }

  function rowMatchesAudioVerse(row, parsed) {
    var sourceVerse;
    var displayVerse;

    if (!row || !parsed || !parsed.verseNum) return true;

    sourceVerse = extractVerseNumFromRef(row.getAttribute('data-commentary-source-ref'));
    if (sourceVerse != null) return sourceVerse === parsed.verseNum;

    displayVerse = extractVerseNumFromRef(row.getAttribute('data-verse-ref'));
    if (displayVerse != null) return displayVerse === parsed.verseNum;

    return true;
  }

  function getRows(section, config) {
    if (!section || !config) return [];
    return Array.prototype.filter.call(
      section.querySelectorAll(config.itemSelector),
      function (item) {
        return item.querySelectorAll(config.cellSelector).length >= config.minCells;
      }
    );
  }

  function getRowsForAudioId(audioId, section, config) {
    var parsed = parseCommentaryHighlightAudioId(audioId);
    var rows = getRows(section, config);
    var matched;

    if (!parsed || !rows.length) return rows;

    matched = rows.filter(function (row) {
      return rowMatchesAudioVerse(row, parsed);
    });

    // If the panel was rebuilt for the playing verse, matched === rows.
    // If stale rows from another verse linger, keep only the playing verse.
    return matched.length ? matched : rows;
  }

  function resetHighlightForAudioId(audioId) {
    if (activeAudioId === audioId) return;
    clearHighlight();
    activeAudioId = audioId || null;
    lastRowIndex = -1;
    lastRowIndicesKey = '';
  }

  function getScrollBehavior() {
    var prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return prefersReducedMotion ? 'auto' : 'smooth';
  }

  function isDocumentScrollContainer(container) {
    return (
      !container ||
      container === document.documentElement ||
      container === document.body ||
      container === document.scrollingElement
    );
  }

  function isCommentaryPopupContext() {
    var pop = document.getElementById('commentaryPopup');
    if (document.body.classList.contains('gomna-commentary-popup-open')) return true;
    if (pop && pop.classList.contains('show')) return true;
    return !!document.getElementById('commentaryScrollArea');
  }

  function isMobileAutoCenterEnvironment() {
    try {
      if (typeof window.matchMedia === 'function') {
        if (window.matchMedia('(max-width: 900px)').matches) return true;
        if (window.matchMedia('(pointer: coarse)').matches) return true;
      }
    } catch (eMatch) { /* ignore */ }
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function isLanguageModalOpen() {
    var modal =
      document.getElementById('gomnaLangSheet') ||
      document.querySelector('.gomna-lang-sheet.is-open, .gomna-lang-modal.show, [data-gomna-lang-modal].show');
    if (!modal) return false;
    var style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getCommentaryScrollHost() {
    return document.getElementById('commentaryScrollArea');
  }

  function getScrollableParent(element) {
    var host;
    var parent;
    var style;
    var overflowY;

    if (!element) return null;

    host = getCommentaryScrollHost();
    if (host && host.contains(element)) return host;

    parent = element.parentElement;
    while (parent) {
      style = window.getComputedStyle(parent);
      overflowY = style.overflowY;
      if (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        parent.scrollHeight > parent.clientHeight + 1
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function getVisibleCenterY(scrollContainer) {
    var containerRect = scrollContainer.getBoundingClientRect();
    var footer =
      document.getElementById('gomnaCommentaryInlineControls') ||
      document.querySelector('#commentaryPopupBox > .gomna-audio-commentary-controls-footer');
    var visibleBottom = containerRect.bottom;
    var footerTop;
    if (footer && isCommentaryPopupContext()) {
      footerTop = footer.getBoundingClientRect().top;
      if (footerTop > containerRect.top && footerTop < visibleBottom) {
        visibleBottom = footerTop;
      }
    }
    return (containerRect.top + visibleBottom) / 2;
  }

  function isCardNearCenter(element, scrollContainer) {
    var containerHeight;
    var relativeCenter;
    var elementRect;
    var containerRect;
    var visibleCenter;
    var band;

    if (!element) return false;

    scrollContainer = scrollContainer || getScrollableParent(element);
    if (!scrollContainer) return false;

    elementRect = element.getBoundingClientRect();

    if (isDocumentScrollContainer(scrollContainer)) {
      containerHeight = window.innerHeight;
      relativeCenter = elementRect.top + (elementRect.height / 2);
      return (
        relativeCenter >= containerHeight * CENTER_TOP_RATIO &&
        relativeCenter <= containerHeight * CENTER_BOTTOM_RATIO
      );
    }

    containerRect = scrollContainer.getBoundingClientRect();
    containerHeight = scrollContainer.clientHeight;
    visibleCenter = getVisibleCenterY(scrollContainer) - containerRect.top;
    relativeCenter =
      (elementRect.top + (elementRect.height / 2)) - containerRect.top;
    band = Math.max(50, Math.min(90, containerHeight * 0.15));
    return Math.abs(relativeCenter - visibleCenter) <= band;
  }

  function cancelResumeFollowTimer() {
    if (resumeFollowTimerId != null) {
      clearTimeout(resumeFollowTimerId);
      resumeFollowTimerId = null;
    }
  }

  function cancelAutoCentering() {
    var host;
    autoCenterToken += 1;
    if (isAutoCentering) {
      host = getCommentaryScrollHost();
      if (host) {
        try {
          host.scrollTo({ top: host.scrollTop, behavior: 'auto' });
        } catch (eStop) {
          host.scrollTop = host.scrollTop;
        }
      }
    }
    isAutoCentering = false;
  }

  function noteUserInteraction(reason) {
    lastUserInputAt = Date.now();
    isUserInteracting = true;
    autoCenterGeneration += 1;
    cancelAutoCentering();
    cancelResumeFollowTimer();
    scheduleResumeFollowAfterIdle();
    return reason || '';
  }

  function scheduleResumeFollowAfterIdle() {
    var gen = autoCenterGeneration;
    cancelResumeFollowTimer();
    resumeFollowTimerId = window.setTimeout(function () {
      var active;
      resumeFollowTimerId = null;
      if (gen !== autoCenterGeneration) return;
      isUserInteracting = false;
      isHeaderPullDragging = false;
      lastUserInputAt = 0;
      if (!shouldAutoCenterActiveCommentaryCard()) return;
      active = document.querySelector('#commentaryContent .' + ACTIVE_CLASS);
      if (!active) return;
      followActiveCard(active, { force: true, fromIdleResume: true });
    }, USER_IDLE_RESUME_MS);
  }

  function onHeaderPullStart() {
    isHeaderPullDragging = true;
    noteUserInteraction('header-pull-start');
  }

  function onHeaderPullEnd() {
    isHeaderPullDragging = false;
    noteUserInteraction('header-pull-end');
  }

  function shouldAutoCenterActiveCommentaryCard() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!state || !state.currentAudioId || !activeConfig) return false;
    if (!getConfigForAudioId(state.currentAudioId)) return false;
    if (!state.isPlaying) return false;
    if (lastRowIndex < 0) return false;
    if (!isCommentaryPopupContext()) return false;
    /*
     * Same rule as the bible verse follow (canAutoCenterBibleCard in
     * gomna-audio-highlight.js): desktop and mobile both center the card,
     * only user input suspends it.
     */
    if (isLanguageModalOpen()) return false;
    if (isSeekUiActive) return false;
    if (isHeaderPullDragging) return false;
    if (isUserInteracting) return false;
    if (Date.now() - lastUserInputAt < USER_IDLE_RESUME_MS && lastUserInputAt > 0) {
      return false;
    }
    return true;
  }

  window.shouldAutoCenterActiveCommentaryCard = shouldAutoCenterActiveCommentaryCard;

  function centerActiveCard(element, scrollContainer) {
    var behavior;
    var containerRect;
    var elementRect;
    var cardCenterY;
    var visibleCenterY;
    var nextTop;
    var maxTop;
    var token;
    var alignTop;
    var verseItem;
    var verseNumber;

    if (!element) return;

    behavior = getScrollBehavior();

    /*
     * Plain-verse gesture (iPhone): document scroll is locked; panY owns motion.
     * Reuse the same center entry + smooth behavior as MacBook, and only adapt
     * the scroll target to __gomnaPlainVerseGestureScrollToVerse.
     */
    if (
      document.documentElement.classList.contains('plain-verse-gesture-active') &&
      typeof window.__gomnaPlainVerseGestureScrollToVerse === 'function' &&
      element.closest
    ) {
      verseItem = element.closest('#verseList .verse-item');
      if (verseItem) {
        verseNumber = parseInt(
          verseItem.getAttribute('data-verse') ||
            verseItem.getAttribute('data-verse-number') ||
            '',
          10
        );
        if (!isNaN(verseNumber) && verseNumber > 0) {
          try {
            window.__gomnaPlainVerseGestureScrollToVerse(verseNumber, {
              centerRatio: 0.5,
              reason: 'audio-highlight',
              behavior: behavior
            });
          } catch (eGestureScroll) {
            /* Visual adapter only — never escalate to audio:error. */
          }
          return;
        }
      }
    }

    scrollContainer = scrollContainer || getScrollableParent(element);
    if (!scrollContainer) return;

    if (isDocumentScrollContainer(scrollContainer)) {
      /* Commentary must never scroll the page/document. */
      if (isCommentaryPopupContext()) return;
      element.scrollIntoView({
        behavior: behavior,
        block: 'center',
        inline: 'nearest'
      });
      return;
    }

    containerRect = scrollContainer.getBoundingClientRect();
    elementRect = element.getBoundingClientRect();
    alignTop = elementRect.height > scrollContainer.clientHeight * 0.9;
    if (alignTop) {
      nextTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - 12;
    } else {
      cardCenterY = elementRect.top + (elementRect.height / 2);
      visibleCenterY = getVisibleCenterY(scrollContainer);
      nextTop = scrollContainer.scrollTop + (cardCenterY - visibleCenterY);
    }
    maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    nextTop = Math.max(0, Math.min(nextTop, maxTop));

    if (Math.abs(nextTop - scrollContainer.scrollTop) < 2) return;

    token = ++autoCenterToken;
    isAutoCentering = true;
    ignoreProgrammaticScrollUntil = Date.now() + (behavior === 'smooth' ? 520 : 80);
    scrollContainer.scrollTo({
      top: nextTop,
      behavior: behavior
    });

    window.setTimeout(function () {
      if (token !== autoCenterToken) return;
      isAutoCentering = false;
      ignoreProgrammaticScrollUntil = Date.now() + 80;
    }, behavior === 'smooth' ? 480 : 64);
  }

  function canAutoScroll() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!state || !state.currentAudioId || !activeConfig) return false;
    if (!getConfigForAudioId(state.currentAudioId)) return false;
    if (!state.isPlaying) return false;
    if (lastRowIndex < 0) return false;

    if (isCommentaryPopupContext()) {
      return shouldAutoCenterActiveCommentaryCard();
    }

    return true;
  }

  function cancelDeferredFollow() {
    if (deferredFollowRafId) {
      window.cancelAnimationFrame(deferredFollowRafId);
      deferredFollowRafId = 0;
    }
    if (deferredFollowTimerId != null) {
      clearTimeout(deferredFollowTimerId);
      deferredFollowTimerId = null;
    }
  }

  /*
   * A new audio may have just switched the commentary panel, so the first
   * measurement can run before the panel reflows. Re-measure after layout,
   * the same deferral the bible verse follow uses (centerBibleVerseCard in
   * gomna-audio-highlight.js).
   */
  function centerActiveCardAfterLayout(audioId) {
    var gen = autoCenterGeneration;

    cancelDeferredFollow();

    deferredFollowRafId = window.requestAnimationFrame(function () {
      deferredFollowRafId = 0;
      deferredFollowTimerId = window.setTimeout(function () {
        var engine = window.GOMNA_AUDIO_ENGINE;
        var state = engine && engine.getState ? engine.getState() : null;
        var active;

        deferredFollowTimerId = null;

        if (gen !== autoCenterGeneration) return;
        if (!state || state.currentAudioId !== audioId) return;
        if (!shouldAutoCenterActiveCommentaryCard()) return;

        active = document.querySelector('#commentaryContent .' + ACTIVE_CLASS);
        if (!active || isCardNearCenter(active)) return;

        centerActiveCard(active);
      }, 320);
    });
  }

  function followActiveCard(element, options) {
    var scrollContainer;
    var opts = options || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var audioId = state && state.currentAudioId;
    var followKey = lastRowIndicesKey || String(lastRowIndex);
    var audioChanged = !!audioId && lastFollowedAudioId !== audioId;

    if (!element || !canAutoScroll()) return;

    scrollContainer = getScrollableParent(element);
    if (!scrollContainer) return;
    if (isCardNearCenter(element, scrollContainer)) {
      lastFollowedKey = followKey;
      lastFollowedAudioId = audioId || '';
      return;
    }

    if (
      !opts.force &&
      audioId &&
      lastFollowedAudioId === audioId &&
      lastFollowedKey === followKey
    ) {
      return;
    }

    lastFollowedKey = followKey;
    lastFollowedAudioId = audioId || '';

    /*
     * 새 오디오는 방금 탭 내용을 바꿔 놓았으므로 지금 재는 위치는 reflow 전 값이다.
     * 여기서 한 번 스크롤하고 320ms 뒤 또 교정하면 화면이 두 번 크게 튄다.
     * 전환 순간에는 레이아웃이 반영된 뒤 한 번만 중앙정렬한다.
     * 같은 오디오 안에서 cue 카드가 바뀌는 정상 추종은 아래 즉시 경로를 그대로 쓴다.
     */
    if (audioChanged) {
      centerActiveCardAfterLayout(audioId);
      return;
    }

    centerActiveCard(element, scrollContainer);
  }

  function isCommentaryControlInteractionTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      '#gomnaCommentaryInlineControls, ' +
      '.gomna-audio-commentary-controls-footer, ' +
      '.gomna-commentary-legacy-close-wrap, ' +
      '.gomna-audio-player, ' +
      '[data-audio-progress], ' +
      '[data-audio-action], ' +
      '.commentary-tab, ' +
      '.gomna-commentary-cue, ' +
      'button.gomna-commentary-header-close'
    );
  }

  function bindCommentaryAutoCenterListeners() {
    var host;
    if (autoCenterListenersBound) return;
    autoCenterListenersBound = true;

    function onUserPointer(e) {
      if (!isCommentaryPopupContext()) return;
      if (!e.target || !e.target.closest) return;
      if (!e.target.closest('#commentaryPopup, #commentaryScrollArea, #commentaryContent, #popupDragHeader')) {
        return;
      }
      /* Listen/close/seek controls must not suspend auto-center for 1400ms. */
      if (isCommentaryControlInteractionTarget(e.target)) return;
      if (e.type === 'touchstart' && e.touches && e.touches.length >= 2) {
        noteUserInteraction('pinch');
        return;
      }
      if (isAutoCentering) cancelAutoCentering();
      noteUserInteraction(e.type);
    }

    function onWheel(e) {
      if (!isCommentaryPopupContext()) return;
      if (!e.target || !e.target.closest) return;
      if (!e.target.closest('#commentaryPopup')) return;
      if (isCommentaryControlInteractionTarget(e.target)) return;
      noteUserInteraction('wheel');
    }

    document.addEventListener('touchstart', onUserPointer, { passive: true, capture: true });
    document.addEventListener('pointerdown', onUserPointer, { passive: true, capture: true });
    document.addEventListener('wheel', onWheel, { passive: true, capture: true });

    function onCommentaryScroll(e) {
      var t = e && e.target;
      if (!isCommentaryPopupContext()) return;
      if (isAutoCentering) return;
      if (Date.now() < ignoreProgrammaticScrollUntil) return;
      if (t && t.id && t.id !== 'commentaryScrollArea') return;
      noteUserInteraction('scroll');
    }

    host = getCommentaryScrollHost();
    if (host) {
      host.addEventListener('scroll', onCommentaryScroll, { passive: true });
    }
    document.addEventListener('scroll', function (e) {
      var t = e.target;
      if (!t || t.id !== 'commentaryScrollArea') return;
      onCommentaryScroll(e);
    }, { passive: true, capture: true });
  }

  window.GOMNA_COMMENTARY_AUTO_CENTER = {
    noteUserInteraction: noteUserInteraction,
    onHeaderPullStart: onHeaderPullStart,
    onHeaderPullEnd: onHeaderPullEnd,
    shouldAutoCenter: shouldAutoCenterActiveCommentaryCard,
    /* 자동 중앙정렬이 만든 스크롤인지 알려 준다. 하단 액션 바처럼 scroll 이벤트로
     * 사용자 의도를 읽는 쪽이 프로그램 스크롤에 반응하지 않도록 이 신호를 쓴다.
     */
    isProgrammaticScroll: function () {
      return isAutoCentering || Date.now() < ignoreProgrammaticScrollUntil;
    },
    /* 최근에 실제 손가락·마우스·휠 입력이 있었는지. 이미 touchstart/pointerdown/wheel을
     * 잡아 두고 있으므로 그 기록을 그대로 알려 준다.
     */
    hasRecentUserInput: function (withinMs) {
      var span = Number(withinMs) || USER_IDLE_RESUME_MS;
      if (isUserInteracting) return true;
      return lastUserInputAt > 0 && Date.now() - lastUserInputAt <= span;
    },
    setSeekUiActive: function (active) {
      isSeekUiActive = !!active;
      if (active) noteUserInteraction('seek-ui');
    },
    cancelAll: function () {
      autoCenterGeneration += 1;
      cancelResumeFollowTimer();
      cancelAutoCentering();
      isUserInteracting = false;
      isHeaderPullDragging = false;
      isSeekUiActive = false;
      lastUserInputAt = 0;
    }
  };

  function speechWeight(text) {
    return Math.max(1, String(text || '').replace(/\s+/g, '').length);
  }

  function rowDomWeight(item, config) {
    var cells = item.querySelectorAll(config.cellSelector);
    var text = '';
    for (var i = 0; i < cells.length; i++) {
      text += cells[i].textContent || '';
    }
    return speechWeight(text);
  }

  function audioIdToTtsPath(audioId, config) {
    var parsed = parseCommentaryHighlightAudioId(audioId);
    if (!parsed || !config || !config.textFile) return null;
    return (
      '/tts-scripts/' +
      parsed.locale +
      '/' +
      parsed.bookId +
      '/' +
      parsed.chapter +
      '/' +
      parsed.verse +
      '/' +
      config.textFile
    );
  }

  function audioIdToCuePath(audioId) {
    var parsed = parseCommentaryHighlightAudioId(audioId);
    if (!parsed) return null;
    return (
      '/audio/cues/' +
      parsed.locale +
      '/' +
      parsed.bookId +
      '/' +
      parsed.chapter +
      '/' +
      parsed.verse +
      '/' +
      parsed.type +
      '.json'
    );
  }

  function rowIndicesKey(indices) {
    if (!indices || !indices.length) return '';
    return indices.join(',');
  }

  function getManifestEntry(audioId) {
    var config = window.GOMNA_AUDIO_CONFIG;
    var audios = config && config.manifestData && config.manifestData.audios;
    return audios ? audios[audioId] : null;
  }

  function buildIntroFromManifest(audioId, config) {
    var entry = getManifestEntry(audioId);
    if (!entry || !config) return '';
    var preview = entry.preview || '';
    return entry.book + ' ' + entry.chapter + '장 ' + entry.verse + '절, ' + config.typeTitle + '입니다.' +
      (preview ? " 본문은 '" + preview + "'입니다." : '');
  }

  function buildSegmentsFromTtsText(ttsText, rowCount, config, rows) {
    var paragraphs = String(ttsText || '')
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(Boolean);

    if (!paragraphs.length || rowCount < 1) return null;

    var paragraphsPerItem = config && config.paragraphsPerItem;
    var intro = paragraphs[0];
    var rowTexts;
    var closing = null;
    var bodyParagraphs;
    var cardBlockSize;
    var leftover;
    var i;
    var start;
    var end;
    var combined;

    if (paragraphsPerItem && paragraphsPerItem > 1) {
      bodyParagraphs = paragraphs.slice(1);
      cardBlockSize = rowCount * paragraphsPerItem;
      leftover = bodyParagraphs.length - cardBlockSize;

      if (leftover !== 0 && leftover !== 1) return null;

      if (leftover === 1) {
        closing = bodyParagraphs[bodyParagraphs.length - 1];
        bodyParagraphs = bodyParagraphs.slice(0, cardBlockSize);
      }

      if (bodyParagraphs.length !== cardBlockSize) return null;

      rowTexts = [];
      for (i = 0; i < rowCount; i++) {
        start = i * paragraphsPerItem;
        end = start + paragraphsPerItem;
        combined = bodyParagraphs.slice(start, end).join(' ');
        rowTexts.push(combined);
      }
    } else {
      if (paragraphs.length >= rowCount + 2) {
        rowTexts = paragraphs.slice(1, 1 + rowCount);
        closing = paragraphs[paragraphs.length - 1];
      } else if (paragraphs.length >= rowCount + 1) {
        rowTexts = paragraphs.slice(1, 1 + rowCount);
      } else {
        return null;
      }

      if (rowTexts.length !== rowCount) return null;
    }

    if (
      config &&
      typeof config.validateTtsRows === 'function' &&
      rows &&
      !config.validateTtsRows(rowTexts, rows)
    ) {
      return null;
    }

    var segments = [
      { type: 'intro', weight: speechWeight(intro), rowIndex: -1 }
    ];

    for (i = 0; i < rowTexts.length; i++) {
      segments.push({
        type: 'row',
        weight: speechWeight(rowTexts[i]),
        rowIndex: i
      });
    }

    if (closing) {
      segments.push({
        type: 'closing',
        weight: speechWeight(closing),
        rowIndex: -1
      });
    }

    return segments;
  }

  function buildSegmentsFromDom(rows, audioId, config) {
    var segments = [
      { type: 'intro', weight: speechWeight(buildIntroFromManifest(audioId, config)), rowIndex: -1 }
    ];

    for (var i = 0; i < rows.length; i++) {
      segments.push({
        type: 'row',
        weight: rowDomWeight(rows[i], config),
        rowIndex: i
      });
    }

    return segments;
  }

  function loadWeightSegments(audioId, config, rows) {
    var ttsPath = audioIdToTtsPath(audioId, config);

    if (!ttsPath || !rows.length) {
      segmentsByAudioId[audioId] = {
        mode: 'weight',
        segments: buildSegmentsFromDom(rows, audioId, config)
      };
      return Promise.resolve(segmentsByAudioId[audioId]);
    }

    return fetch(ttsPath)
      .then(function (response) {
        if (!response.ok) throw new Error('tts fetch failed');
        return response.text();
      })
      .then(function (text) {
        var parsed = buildSegmentsFromTtsText(text, rows.length, config, rows);
        if (!parsed) throw new Error('tts parse failed');
        segmentsByAudioId[audioId] = {
          mode: 'weight',
          segments: parsed
        };
        return segmentsByAudioId[audioId];
      })
      .catch(function () {
        segmentsByAudioId[audioId] = {
          mode: 'weight',
          segments: buildSegmentsFromDom(rows, audioId, config)
        };
        return segmentsByAudioId[audioId];
      });
  }

  function loadSegments(audioId, config) {
    if (segmentsByAudioId[audioId]) {
      return Promise.resolve(segmentsByAudioId[audioId]);
    }

    var section = getSection(config);
    var rows = getRowsForAudioId(audioId, section, config);
    var cuePath = audioIdToCuePath(audioId);

    if (!cuePath) {
      return loadWeightSegments(audioId, config, rows);
    }

    var cueUrl = cuePath;
    var assetVersion = '';
    try {
      assetVersion = String(window.GOMNA_ASSET_VERSION || '').trim();
    } catch (e) {}
    if (assetVersion) {
      cueUrl += (cueUrl.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(assetVersion);
    }

    return fetch(cueUrl, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('cue fetch failed');
        return response.json();
      })
      .then(function (cue) {
        if (!cue || !Array.isArray(cue.segments) || !cue.segments.length) {
          throw new Error('cue invalid');
        }
        segmentsByAudioId[audioId] = {
          mode: 'cue',
          duration: cue.duration,
          segments: cue.segments,
          words: Array.isArray(cue.words) ? cue.words : null,
          parsed: parseCommentaryHighlightAudioId(audioId)
        };
        return segmentsByAudioId[audioId];
      })
      .catch(function () {
        return loadWeightSegments(audioId, config, rows);
      });
  }

  function rowIndexAtTimeFromCue(segments, currentTime) {
    var i;
    var seg;
    var indices;

    if (!segments || !segments.length) {
      return { rowIndex: -1, rowIndices: [] };
    }

    for (i = 0; i < segments.length; i++) {
      seg = segments[i];
      if (currentTime >= seg.start && currentTime < seg.end) {
        if (seg.type === 'item' && seg.itemIndex >= 0) {
          indices = seg.itemIndices || [seg.itemIndex];
          return {
            rowIndex: indices[0],
            rowIndices: indices
          };
        }
        return { rowIndex: -1, rowIndices: [] };
      }
    }

    return { rowIndex: -1, rowIndices: [] };
  }

  function rowIndexAtTimeFromWeight(segments, currentTime, duration) {
    var total = 0;
    var target;
    var sum = 0;
    var i;

    if (!segments || !segments.length || !duration || duration <= 0) {
      return { rowIndex: -1, rowIndices: [] };
    }

    for (i = 0; i < segments.length; i++) {
      total += segments[i].weight;
    }

    target = Math.max(0, Math.min(1, currentTime / duration)) * total;
    sum = 0;

    for (i = 0; i < segments.length; i++) {
      sum += segments[i].weight;
      if (target < sum) {
        return {
          rowIndex: segments[i].rowIndex,
          rowIndices: segments[i].rowIndex >= 0 ? [segments[i].rowIndex] : []
        };
      }
    }

    return {
      rowIndex: segments[segments.length - 1].rowIndex,
      rowIndices: segments[segments.length - 1].rowIndex >= 0
        ? [segments[segments.length - 1].rowIndex]
        : []
    };
  }

  function startTimeForRowIndex(data, rowIndex, audioId) {
    var segments = data && data.segments;
    var entry;
    var duration;
    var total = 0;
    var sum = 0;
    var indices;
    var i;

    if (!segments || !segments.length || rowIndex < 0) return null;

    if (data.mode === 'cue') {
      for (i = 0; i < segments.length; i++) {
        if (segments[i].type !== 'item') continue;
        indices = segments[i].itemIndices || [segments[i].itemIndex];
        if (indices.indexOf(rowIndex) < 0) continue;
        return typeof segments[i].start === 'number' ? segments[i].start : null;
      }
      return null;
    }

    /* Weight mode is the same proportional map rowIndexAtTimeFromWeight reads,
     * just inverted: sum the weights before the card.
     */
    entry = getManifestEntry(audioId);
    duration = data.duration || (entry && entry.duration) || 0;
    if (!duration) return null;

    for (i = 0; i < segments.length; i++) {
      total += segments[i].weight;
    }
    if (!total) return null;

    for (i = 0; i < segments.length; i++) {
      if (segments[i].rowIndex === rowIndex) {
        return (sum / total) * duration;
      }
      sum += segments[i].weight;
    }

    return null;
  }

  /* Card click → cue start of that card. Uses the same rows and cue segments
   * the playback highlight already resolves, so 01/02/03 map to their own cue.
   */
  function getRowStartTime(audioId, rowEl) {
    var config = getConfigForAudioId(audioId);
    var section = getSection(config);
    var rows = config ? getRowsForAudioId(audioId, section, config) : [];
    var rowIndex = rows.indexOf(rowEl);

    if (!config || rowIndex < 0) return Promise.resolve(null);

    return loadSegments(audioId, config)
      .then(function (data) {
        return startTimeForRowIndex(data, rowIndex, audioId);
      })
      .catch(function () {
        return null;
      });
  }

  function clearHighlight() {
    /* Scope to commentary content so bible verse cards can reuse ACTIVE_CLASS. */
    var items = document.querySelectorAll('#commentaryContent .' + ACTIVE_CLASS);
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove(ACTIVE_CLASS);
    }
    lastRowIndex = -1;
    lastRowIndicesKey = '';
    lastFollowedKey = '';
    lastFollowedAudioId = '';
  }

  function applyRowIndex(rows, rowIndex, shouldFollow, rowIndices) {
    var activeRow;
    var indices = rowIndices && rowIndices.length
      ? rowIndices
      : (rowIndex >= 0 ? [rowIndex] : []);
    var indicesKey = rowIndicesKey(indices);
    var i;

    for (i = 0; i < rows.length; i++) {
      rows[i].classList.toggle(ACTIVE_CLASS, indices.indexOf(i) >= 0);
    }

    lastRowIndex = indices.length ? indices[0] : -1;
    lastRowIndicesKey = indicesKey;

    if (!shouldFollow || !indices.length) return;

    activeRow = rows[indices[0]];
    if (activeRow) {
      followActiveCard(activeRow);
    }
  }

  function refreshCardHighlight(options) {
    var opts = options || {};
    var shouldFollow = opts.shouldFollow !== false;
    var allowWhenPaused = !!opts.allowWhenPaused;
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var audioId = state && state.currentAudioId;
    var config = audioId ? getConfigForAudioId(audioId) : null;
    var section;
    var rows;
    var segmentBundle;
    var segments;
    var timing;
    var indicesKey;
    var currentTime;
    var liveAudio;

    if (!state || !audioId || !config) {
      clearHighlight();
      return;
    }

    // Playing audio ID is the only source of truth for verse/type/locale.
    if (activeAudioId !== audioId) {
      resetHighlightForAudioId(audioId);
      activeConfig = config;
    }

    if (!allowWhenPaused && !state.isPlaying) {
      return;
    }

    section = getSection(config);
    rows = getRowsForAudioId(audioId, section, config);
    if (!rows.length) {
      clearHighlight();
      return;
    }

    segmentBundle = segmentsByAudioId[audioId];
    if (!segmentBundle || !segmentBundle.segments) return;

    segments = segmentBundle.segments;
    liveAudio = getLivePlaybackAudio(state);
    currentTime = getPlaybackCurrentTime(state, liveAudio);

    if (segmentBundle.mode === 'cue') {
      timing = rowIndexAtTimeFromCue(segments, currentTime);
    } else {
      timing = rowIndexAtTimeFromWeight(segments, currentTime, state.duration);
    }

    indicesKey = rowIndicesKey(timing.rowIndices);

    if (indicesKey === lastRowIndicesKey) return;
    if (timing.rowIndex < 0 || !timing.rowIndices.length) {
      clearHighlight();
      return;
    }

    applyRowIndex(rows, timing.rowIndex, shouldFollow, timing.rowIndices);
  }

  function playbackVisualTick() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    playbackVisualRafId = null;

    if (!state || !state.isPlaying) {
      return;
    }

    if (isHighlightableActive(state)) {
      refreshCardHighlight({ shouldFollow: true, allowWhenPaused: false });
    }

    if (window.GOMNA_AUDIO_UI && typeof window.GOMNA_AUDIO_UI.updateHeroCaptionFromState === 'function') {
      window.GOMNA_AUDIO_UI.updateHeroCaptionFromState();
    }

    playbackVisualRafId = window.requestAnimationFrame(playbackVisualTick);
  }

  function startPlaybackVisualTick() {
    if (playbackVisualRafId != null) return;
    playbackVisualRafId = window.requestAnimationFrame(playbackVisualTick);
  }

  function stopPlaybackVisualTick() {
    if (playbackVisualRafId == null) return;
    window.cancelAnimationFrame(playbackVisualRafId);
    playbackVisualRafId = null;
  }

  function startCrossRefHighlightTick() {
    startPlaybackVisualTick();
  }

  function stopCrossRefHighlightTick() {
    stopPlaybackVisualTick();
  }

  function handlePlaybackSeeked() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!state) {
      return;
    }

    lastFollowedKey = '';
    if (isHighlightableActive(state)) {
      refreshCardHighlight({
        shouldFollow: !!state.isPlaying,
        allowWhenPaused: true
      });
    }

    if (window.GOMNA_AUDIO_UI && typeof window.GOMNA_AUDIO_UI.updateHeroCaptionFromState === 'function') {
      window.GOMNA_AUDIO_UI.updateHeroCaptionFromState();
    }
  }

  function handlePlaybackRateChange() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    if (!state || !isHighlightableActive(state)) return;
    lastFollowedKey = '';
    refreshCardHighlight({
      shouldFollow: !!state.isPlaying,
      allowWhenPaused: true
    });
  }

  function unbindAudio() {
    stopPlaybackVisualTick();
    if (boundAudio) {
      boundAudio.removeEventListener('seeked', handlePlaybackSeeked);
      boundAudio.removeEventListener('ratechange', handlePlaybackRateChange);
    }
    boundAudio = null;
    boundAudioId = null;
  }

  function bindAudio(audio, audioId) {
    if (boundAudio === audio && boundAudioId === audioId) return;
    unbindAudio();
    if (!audio) return;
    boundAudio = audio;
    boundAudioId = audioId || null;
    boundAudio.addEventListener('seeked', handlePlaybackSeeked);
    boundAudio.addEventListener('ratechange', handlePlaybackRateChange);
  }

  function isHighlightableActive(state) {
    return !!(state && state.currentAudioId && getConfigForAudioId(state.currentAudioId));
  }

  function syncBinding() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var audio = engine && engine._state ? engine._state.currentAudio : null;
    var audioId = state && state.currentAudioId;
    var config = audioId ? getConfigForAudioId(audioId) : null;

    if (!isHighlightableActive(state)) {
      activeAudioId = null;
      activeConfig = null;
      unbindAudio();
      clearHighlight();
      return;
    }

    if (activeAudioId !== audioId) {
      resetHighlightForAudioId(audioId);
    }
    activeConfig = config;

    if (state.isPlaying) {
      bindAudio(audio, audioId);
      startPlaybackVisualTick();
      refreshCardHighlight({ shouldFollow: true, allowWhenPaused: false });
      return;
    }

    if (state.isPaused) {
      bindAudio(audio, audioId);
      return;
    }

    unbindAudio();
    clearHighlight();
  }

  function onCommentaryStart(detail) {
    var audioId = detail && detail.audioId;
    var config = getConfigForAudioId(audioId);
    if (!audioId || !config) return;

    // New play target: drop previous verse highlight/cue binding immediately.
    resetHighlightForAudioId(audioId);
    activeAudioId = audioId;
    activeConfig = config;
    lastFollowedKey = '';
    lastFollowedAudioId = '';
    loadSegments(audioId, config).then(function () {
      if (activeAudioId !== audioId) return;
      refreshCardHighlight({ shouldFollow: true, allowWhenPaused: true });
    });
    loadSpokenTexts(audioId, config);
    syncBinding();
  }

  function parseSpokenTextsFromTts(ttsText, rowCount, config, rows, audioId) {
    var paragraphs = String(ttsText || '')
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
    var paragraphsPerItem = config && config.paragraphsPerItem;
    var intro = '';
    var rowTexts = [];
    var closing = '';
    var bodyParagraphs;
    var cardBlockSize;
    var leftover;
    var i;
    var start;
    var end;
    var combined;

    if (!paragraphs.length) {
      return {
        intro: buildIntroFromManifest(audioId, config),
        rows: [],
        closing: ''
      };
    }

    intro = paragraphs[0];

    if (paragraphsPerItem && paragraphsPerItem > 1) {
      bodyParagraphs = paragraphs.slice(1);
      cardBlockSize = rowCount * paragraphsPerItem;
      leftover = bodyParagraphs.length - cardBlockSize;

      if (leftover === 1) {
        closing = bodyParagraphs[bodyParagraphs.length - 1];
        bodyParagraphs = bodyParagraphs.slice(0, cardBlockSize);
      }

      if (bodyParagraphs.length === cardBlockSize) {
        for (i = 0; i < rowCount; i++) {
          start = i * paragraphsPerItem;
          end = start + paragraphsPerItem;
          combined = bodyParagraphs.slice(start, end).join(' ');
          rowTexts.push(combined);
        }
      }
    } else if (rowCount > 0) {
      if (paragraphs.length >= rowCount + 2) {
        rowTexts = paragraphs.slice(1, 1 + rowCount);
        closing = paragraphs[paragraphs.length - 1];
      } else if (paragraphs.length >= rowCount + 1) {
        rowTexts = paragraphs.slice(1, 1 + rowCount);
      }
    }

    if (
      rowTexts.length &&
      config &&
      typeof config.validateTtsRows === 'function' &&
      rows &&
      !config.validateTtsRows(rowTexts, rows)
    ) {
      rowTexts = [];
    }

    return {
      intro: intro || buildIntroFromManifest(audioId, config),
      rows: rowTexts,
      closing: closing
    };
  }

  function loadSpokenTexts(audioId, config) {
    var section;
    var rows;
    var ttsPath;

    if (spokenTextsByAudioId[audioId]) {
      return Promise.resolve(spokenTextsByAudioId[audioId]);
    }

    section = getSection(config);
    rows = getRows(section, config);
    ttsPath = audioIdToTtsPath(audioId, config);

    if (!ttsPath) {
      spokenTextsByAudioId[audioId] = {
        intro: buildIntroFromManifest(audioId, config),
        rows: rows.map(function (row) {
          return extractRowDomText(row, config);
        }),
        closing: ''
      };
      return Promise.resolve(spokenTextsByAudioId[audioId]);
    }

    return fetch(ttsPath)
      .then(function (response) {
        if (!response.ok) throw new Error('tts fetch failed');
        return response.text();
      })
      .then(function (text) {
        spokenTextsByAudioId[audioId] = parseSpokenTextsFromTts(
          text,
          rows.length,
          config,
          rows,
          audioId
        );
        return spokenTextsByAudioId[audioId];
      })
      .catch(function () {
        spokenTextsByAudioId[audioId] = {
          intro: buildIntroFromManifest(audioId, config),
          rows: rows.map(function (row) {
            return extractRowDomText(row, config);
          }),
          closing: ''
        };
        return spokenTextsByAudioId[audioId];
      });
  }

  function extractRowDomText(row, config) {
    var cells;
    var parts = [];
    var i;
    var text;

    if (!row || !config) return '';

    cells = row.querySelectorAll(config.cellSelector);
    for (i = 0; i < cells.length; i++) {
      text = (cells[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }

    return parts.join(' ');
  }

  function segmentAtTimeFromCue(segments, currentTime) {
    var i;
    var seg;
    var lastSeg;

    if (!segments || !segments.length) return null;

    lastSeg = segments[segments.length - 1];

    for (i = 0; i < segments.length; i++) {
      seg = segments[i];
      if (currentTime >= seg.start && currentTime < seg.end) {
        return seg;
      }
    }

    if (lastSeg && currentTime >= lastSeg.start) {
      return lastSeg;
    }

    return segments[0] || null;
  }

  function segmentAtTimeFromWeight(segments, currentTime, duration) {
    var total = 0;
    var target;
    var sum = 0;
    var i;

    if (!segments || !segments.length) {
      return null;
    }

    if (!duration || duration <= 0) {
      return segments[0];
    }

    for (i = 0; i < segments.length; i++) {
      total += segments[i].weight;
    }

    target = Math.max(0, Math.min(1, currentTime / duration)) * total;
    sum = 0;

    for (i = 0; i < segments.length; i++) {
      sum += segments[i].weight;
      if (target < sum) {
        return segments[i];
      }
    }

    return segments[segments.length - 1] || null;
  }

  function resolveSegmentSpeechText(audioId, segment, config, rows) {
    var spoken;
    var rowIndex;
    var text;

    if (!segment || !config) return '';

    spoken = spokenTextsByAudioId[audioId];

    if (segment.type === 'intro' || (segment.itemIndex != null && segment.itemIndex < 0 && segment.type !== 'item')) {
      if (spoken && spoken.intro) return spoken.intro;
      return buildIntroFromManifest(audioId, config);
    }

    if (segment.type === 'closing') {
      if (spoken && spoken.closing) return spoken.closing;
      return '';
    }

    if (segment.type === 'row' && segment.rowIndex != null && segment.rowIndex >= 0) {
      rowIndex = segment.rowIndex;
    } else if (segment.itemIndex != null && segment.itemIndex >= 0) {
      rowIndex = segment.itemIndex;
    } else {
      rowIndex = segment.rowIndex;
    }

    if (rowIndex == null || rowIndex < 0) {
      if (spoken && spoken.intro) return spoken.intro;
      return buildIntroFromManifest(audioId, config);
    }

    if (spoken && spoken.rows && spoken.rows[rowIndex]) {
      return spoken.rows[rowIndex];
    }

    if (rows[rowIndex]) {
      text = extractRowDomText(rows[rowIndex], config);
      if (text) return text;
    }

    return '';
  }

  function getBibleCaptionText(audioId) {
    var entry = getManifestEntry(audioId);
    var previewEl = document.querySelector('[data-audio-current-preview-expanded], [data-audio-current-preview]');

    if (entry && entry.preview) {
      return entry.preview;
    }

    if (previewEl && previewEl.textContent) {
      return previewEl.textContent.trim();
    }

    return '';
  }

  function getFirstCaptionText(audioId, config, rows) {
    var spoken;
    var text;

    if (audioId && /\.bible$/.test(audioId)) {
      text = getBibleCaptionText(audioId);
      return text || CAPTION_DEFAULT_TEXT;
    }

    if (!config) return CAPTION_DEFAULT_TEXT;

    spoken = spokenTextsByAudioId[audioId];
    if (spoken && spoken.intro) return spoken.intro;
    if (spoken && spoken.rows && spoken.rows[0]) return spoken.rows[0];
    if (rows && rows[0]) {
      text = extractRowDomText(rows[0], config);
      if (text) return text;
    }

    text = buildIntroFromManifest(audioId, config);
    return text || CAPTION_DEFAULT_TEXT;
  }

  function getCaptionSegmentKey(segment) {
    if (!segment) return 'none';

    return [
      segment.type || 'segment',
      segment.itemIndex != null ? segment.itemIndex : segment.rowIndex,
      segment.start,
      segment.end
    ].join(':');
  }

  function getCaptionForState(state, options) {
    var opts = options || {};
    var audioId = state && state.currentAudioId;
    var config;
    var section;
    var rows;
    var segmentBundle;
    var segments;
    var currentTime;
    var segment;
    var text;
    var engine;

    if (!audioId) {
      return {
        text: CAPTION_DEFAULT_TEXT,
        segmentKey: 'idle'
      };
    }

    if (/\.bible$/.test(audioId)) {
      text = getBibleCaptionText(audioId);
      return {
        text: text || CAPTION_DEFAULT_TEXT,
        segmentKey: 'bible:' + audioId
      };
    }

    config = getConfigForAudioId(audioId);
    if (!config) {
      text = getBibleCaptionText(audioId);
      return {
        text: text || CAPTION_DEFAULT_TEXT,
        segmentKey: 'fallback:' + audioId
      };
    }

    section = getSection(config);
    rows = getRows(section, config);
    segmentBundle = segmentsByAudioId[audioId];

    if (!segmentBundle || !segmentBundle.segments || !segmentBundle.segments.length) {
      return {
        text: getFirstCaptionText(audioId, config, rows),
        segmentKey: 'pending:' + audioId
      };
    }

    if (!opts.allowWhenPaused && state && !state.isPlaying) {
      return {
        text: getFirstCaptionText(audioId, config, rows),
        segmentKey: 'idle:' + audioId
      };
    }

    segments = segmentBundle.segments;
    engine = window.GOMNA_AUDIO_ENGINE;
    currentTime = isCrossReferenceAudioId(audioId)
      ? getPlaybackCurrentTime(state, engine && engine._state ? engine._state.currentAudio : boundAudio)
      : (Number(state.currentTime) || 0);

    if (segmentBundle.mode === 'cue') {
      segment = segmentAtTimeFromCue(segments, currentTime);
    } else {
      segment = segmentAtTimeFromWeight(segments, currentTime, state.duration);
    }

    text = resolveSegmentSpeechText(audioId, segment, config, rows);
    if (!text) {
      text = getFirstCaptionText(audioId, config, rows);
    }

    return {
      text: text,
      segmentKey: getCaptionSegmentKey(segment)
    };
  }

  function ensureCaptionLoaded(audioId) {
    var config = getConfigForAudioId(audioId);
    if (!audioId || !config) return Promise.resolve(null);
    return Promise.all([
      loadSegments(audioId, config),
      loadSpokenTexts(audioId, config)
    ]);
  }

  function wordsForSegment(words, segment) {
    var i;
    var word;

    if (!words || !words.length || !segment) return [];

    return words.filter(function (item) {
      return item.start >= segment.start - 0.001 && item.start < segment.end + 0.001;
    });
  }

  function readWordCountAtTime(words, currentTime) {
    var count = 0;
    var i;

    for (i = 0; i < words.length; i++) {
      if (currentTime >= words[i].start) {
        count = i + 1;
      } else {
        break;
      }
    }

    return count;
  }

  function getWordCaptionForState(state, options) {
    var base = getCaptionForState(state, options);
    var audioId = state && state.currentAudioId;
    var segmentBundle = segmentsByAudioId[audioId];
    var allWords;
    var segment;
    var segmentWords;
    var currentTime;
    var engine;
    var fullText;
    var readCount;

    if (!audioId || !segmentBundle || !segmentBundle.words || !segmentBundle.words.length) {
      return {
        text: base.text,
        fullText: base.text,
        words: null,
        readCount: 0,
        segmentKey: base.segmentKey,
        hasWordCues: false
      };
    }

    allWords = segmentBundle.words;
    engine = window.GOMNA_AUDIO_ENGINE;
    currentTime = isCrossReferenceAudioId(audioId)
      ? getPlaybackCurrentTime(state, engine && engine._state ? engine._state.currentAudio : boundAudio)
      : (Number(state.currentTime) || 0);

    if (segmentBundle.mode === 'cue') {
      segment = segmentAtTimeFromCue(segmentBundle.segments, currentTime);
    } else {
      segment = segmentAtTimeFromWeight(segmentBundle.segments, currentTime, state.duration);
    }

    segmentWords = wordsForSegment(allWords, segment);
    if (!segmentWords.length) {
      return {
        text: base.text,
        fullText: base.text,
        words: null,
        readCount: 0,
        segmentKey: base.segmentKey,
        hasWordCues: false
      };
    }

    fullText = segmentWords.map(function (item) { return item.text; }).join(' ');
    readCount = readWordCountAtTime(segmentWords, currentTime);

    return {
      text: base.text,
      fullText: fullText || base.text,
      words: segmentWords.map(function (item) { return item.text; }),
      readCount: readCount,
      segmentKey: base.segmentKey,
      hasWordCues: true
    };
  }

  var CAPTION_DEFAULT_TEXT = '말씀을 듣고 계십니다';

  window.GOMNA_AUDIO_CAPTION = {
    DEFAULT_TEXT: CAPTION_DEFAULT_TEXT,
    ensureLoaded: ensureCaptionLoaded,
    getCaptionForState: getCaptionForState,
    getWordCaptionForState: getWordCaptionForState,
    getFirstCaptionText: function(audioId) {
      var config = getConfigForAudioId(audioId);
      var section = config ? getSection(config) : null;
      var rows = config ? getRows(section, config) : [];
      return getFirstCaptionText(audioId, config, rows);
    }
  };

  window.addEventListener('audio:start', function (e) {
    onCommentaryStart(e.detail || {});
  });

  window.addEventListener('audio:resume', syncBinding);

  window.addEventListener('audio:pause', function () {
    stopCrossRefHighlightTick();
    cancelResumeFollowTimer();
    cancelAutoCentering();
    // Keep current row highlight while paused; do not auto-scroll.
  });

  window.addEventListener('audio:end', function () {
    stopCrossRefHighlightTick();
    if (window.GOMNA_COMMENTARY_AUTO_CENTER) {
      window.GOMNA_COMMENTARY_AUTO_CENTER.cancelAll();
    }
    activeAudioId = null;
    activeConfig = null;
    unbindAudio();
    clearHighlight();
  });

  window.addEventListener('audio:error', function () {
    stopCrossRefHighlightTick();
    if (window.GOMNA_COMMENTARY_AUTO_CENTER) {
      window.GOMNA_COMMENTARY_AUTO_CENTER.cancelAll();
    }
    activeAudioId = null;
    activeConfig = null;
    unbindAudio();
    clearHighlight();
  });

  var style = document.createElement('style');
  var cssRules = [];
  var type;

  cssRules.push(
    '#commentaryContent .commentary-table td{' +
      'transition:background-color 100ms ease;' +
    '}'
  );

  for (type in COMMENTARY_TYPE_CONFIG) {
    if (!Object.prototype.hasOwnProperty.call(COMMENTARY_TYPE_CONFIG, type)) continue;
    cssRules.push(
      '#commentaryContent #' + COMMENTARY_TYPE_CONFIG[type].tabId +
      ' .commentary-table ' +
      COMMENTARY_TYPE_CONFIG[type].itemSelector.split('[')[0] + '.' + ACTIVE_CLASS + ' td{' +
        'background-color:#D8C18A !important;' +
        'transition:background-color 100ms ease;' +
      '}'
    );
  }

  /* Same active color as commentary cards, reused for bible verse items. */
  cssRules.push(
    '#verseList .verse-item.' + ACTIVE_CLASS + '{' +
      'background-color:#D8C18A !important;' +
      'transition:background-color 100ms ease;' +
    '}'
  );

  style.textContent = cssRules.join('');
  document.head.appendChild(style);

  initExactCueTestManifestOverrides();
  bindCommentaryAutoCenterListeners();

  window.GOMNA_CARD_HIGHLIGHT = {
    startPlaybackVisualTick: startPlaybackVisualTick,
    stopPlaybackVisualTick: stopPlaybackVisualTick,
    clearHighlight: clearHighlight,
    centerActiveCard: centerActiveCard,
    getRowStartTime: getRowStartTime,
    ACTIVE_CLASS: ACTIVE_CLASS,
    shouldAutoCenterActiveCommentaryCard: shouldAutoCenterActiveCommentaryCard
  };

  // Compatibility alias used by commentary tab selection cleanup.
  window.GomnaCardHighlightTest = window.GOMNA_CARD_HIGHLIGHT;
})();
