
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
  var CENTER_TOP_RATIO = 0.35;
  var CENTER_BOTTOM_RATIO = 0.65;

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
  var lastRowIndex = -1;
  var lastRowIndicesKey = '';
  var activeAudioId = null;
  var activeConfig = null;
  var segmentsByAudioId = {};
  var crossRefHighlightRafId = null;

  function isCrossReferenceAudioId(audioId) {
    return getTypeFromAudioId(audioId) === 'cross-reference';
  }

  function getPlaybackCurrentTime(state, audio) {
    var element = audio || boundAudio;
    if (element && Number.isFinite(element.currentTime)) {
      return element.currentTime;
    }
    return state ? (Number(state.currentTime) || 0) : 0;
  }

  function getTypeFromAudioId(audioId) {
    var parts = String(audioId || '').split('.');
    return parts.length >= 4 ? parts[parts.length - 1] : null;
  }

  function getConfigForAudioId(audioId) {
    var type = getTypeFromAudioId(audioId);
    return type ? COMMENTARY_TYPE_CONFIG[type] || null : null;
  }

  function getSection(config) {
    return config ? document.getElementById(config.tabId) : null;
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

  function getScrollableParent(element) {
    var parent;
    var style;
    var overflowY;

    if (!element) return null;

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

  function isCardNearCenter(element, scrollContainer) {
    var containerHeight;
    var relativeCenter;
    var elementRect;
    var containerRect;

    if (!element) return false;

    scrollContainer = scrollContainer || getScrollableParent(element);
    if (!scrollContainer) return false;

    elementRect = element.getBoundingClientRect();

    if (isDocumentScrollContainer(scrollContainer)) {
      containerHeight = window.innerHeight;
      relativeCenter = elementRect.top + (elementRect.height / 2);
    } else {
      containerRect = scrollContainer.getBoundingClientRect();
      containerHeight = scrollContainer.clientHeight;
      relativeCenter =
        (elementRect.top + (elementRect.height / 2)) - containerRect.top;
    }

    return (
      relativeCenter >= containerHeight * CENTER_TOP_RATIO &&
      relativeCenter <= containerHeight * CENTER_BOTTOM_RATIO
    );
  }

  function centerActiveCard(element, scrollContainer) {
    var behavior;
    var containerRect;
    var elementRect;
    var cardCenterY;
    var containerCenterY;
    var nextTop;
    var maxTop;

    if (!element) return;

    scrollContainer = scrollContainer || getScrollableParent(element);
    if (!scrollContainer) return;

    behavior = getScrollBehavior();

    if (isDocumentScrollContainer(scrollContainer)) {
      element.scrollIntoView({
        behavior: behavior,
        block: 'center',
        inline: 'nearest'
      });
      return;
    }

    containerRect = scrollContainer.getBoundingClientRect();
    elementRect = element.getBoundingClientRect();
    cardCenterY = elementRect.top + (elementRect.height / 2);
    containerCenterY = containerRect.top + (scrollContainer.clientHeight / 2);
    nextTop = scrollContainer.scrollTop + (cardCenterY - containerCenterY);
    maxTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;

    scrollContainer.scrollTo({
      top: Math.max(0, Math.min(nextTop, maxTop)),
      behavior: behavior
    });
  }

  function canAutoScroll() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!state || !state.currentAudioId || !activeConfig) return false;
    if (!getConfigForAudioId(state.currentAudioId)) return false;
    if (!state.isPlaying) return false;
    if (lastRowIndex < 0) return false;

    return true;
  }

  function followActiveCard(element) {
    var scrollContainer;

    if (!element || !canAutoScroll()) return;

    scrollContainer = getScrollableParent(element);
    if (!scrollContainer) return;
    if (isCardNearCenter(element, scrollContainer)) return;

    centerActiveCard(element, scrollContainer);
  }

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
    var match = String(audioId || '').match(/^([a-z]+)\.(\d+)\.(\d+)\.[^.]+$/);
    if (!match || !config || !config.textFile) return null;
    return '/tts-scripts/ko-KR/' + match[1] + '/' + match[2] + '/' + match[3] + '/' + config.textFile;
  }

  function audioIdToCuePath(audioId) {
    var match = String(audioId || '').match(/^([a-z]+)\.(\d+)\.(\d+)\.([^.]+)$/);
    if (!match) return null;
    return '/audio/cues/ko-KR/' + match[1] + '/' + match[2] + '/' + match[3] + '/' + match[4] + '.json';
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
    var rows = getRows(section, config);
    var cuePath = audioIdToCuePath(audioId);

    if (!cuePath) {
      return loadWeightSegments(audioId, config, rows);
    }

    return fetch(cuePath)
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
          segments: cue.segments
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

  function clearHighlight() {
    var items = document.querySelectorAll('.' + ACTIVE_CLASS);
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove(ACTIVE_CLASS);
    }
    lastRowIndex = -1;
    lastRowIndicesKey = '';
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
    var config = state ? getConfigForAudioId(state.currentAudioId) : null;
    var section;
    var rows;
    var segmentBundle;
    var segments;
    var timing;
    var indicesKey;
    var currentTime;

    if (!state || !state.currentAudioId || !config) {
      clearHighlight();
      return;
    }

    if (!allowWhenPaused && !state.isPlaying) {
      return;
    }

    section = getSection(config);
    rows = getRows(section, config);
    if (!rows.length) {
      clearHighlight();
      return;
    }

    segmentBundle = segmentsByAudioId[state.currentAudioId];
    if (!segmentBundle || !segmentBundle.segments) return;

    segments = segmentBundle.segments;
    currentTime = isCrossReferenceAudioId(state.currentAudioId)
      ? getPlaybackCurrentTime(state, boundAudio)
      : (Number(state.currentTime) || 0);

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

  function handleTimeUpdate() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (state && isCrossReferenceAudioId(state.currentAudioId)) {
      return;
    }

    refreshCardHighlight({ shouldFollow: true, allowWhenPaused: false });
  }

  function crossRefHighlightTick() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    crossRefHighlightRafId = null;

    if (!state || !state.isPlaying || !isCrossReferenceAudioId(state.currentAudioId)) {
      return;
    }

    refreshCardHighlight({ shouldFollow: true, allowWhenPaused: false });
    crossRefHighlightRafId = window.requestAnimationFrame(crossRefHighlightTick);
  }

  function startCrossRefHighlightTick() {
    if (crossRefHighlightRafId != null) return;
    crossRefHighlightRafId = window.requestAnimationFrame(crossRefHighlightTick);
  }

  function stopCrossRefHighlightTick() {
    if (crossRefHighlightRafId == null) return;
    window.cancelAnimationFrame(crossRefHighlightRafId);
    crossRefHighlightRafId = null;
  }

  function handleCrossRefSeeked() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!state || !isCrossReferenceAudioId(state.currentAudioId)) {
      return;
    }

    refreshCardHighlight({
      shouldFollow: !!state.isPlaying,
      allowWhenPaused: true
    });
  }

  function unbindAudio() {
    stopCrossRefHighlightTick();
    if (boundAudio) {
      boundAudio.removeEventListener('timeupdate', handleTimeUpdate);
      boundAudio.removeEventListener('seeked', handleCrossRefSeeked);
    }
    boundAudio = null;
  }

  function bindAudio(audio, audioId) {
    var useCrossRefTiming = isCrossReferenceAudioId(audioId);

    if (boundAudio === audio) return;
    unbindAudio();
    if (!audio) return;
    boundAudio = audio;

    if (useCrossRefTiming) {
      boundAudio.addEventListener('seeked', handleCrossRefSeeked);
      return;
    }

    boundAudio.addEventListener('timeupdate', handleTimeUpdate);
  }

  function isHighlightableActive(state) {
    return !!(state && state.currentAudioId && getConfigForAudioId(state.currentAudioId));
  }

  function syncBinding() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var audio = engine && engine._state ? engine._state.currentAudio : null;
    var config = state ? getConfigForAudioId(state.currentAudioId) : null;

    if (!isHighlightableActive(state)) {
      activeAudioId = null;
      activeConfig = null;
      unbindAudio();
      clearHighlight();
      return;
    }

    activeConfig = config;

    if (state.isPlaying) {
      bindAudio(audio, state.currentAudioId);
      if (isCrossReferenceAudioId(state.currentAudioId)) {
        startCrossRefHighlightTick();
        refreshCardHighlight({ shouldFollow: true, allowWhenPaused: false });
      } else {
        handleTimeUpdate();
      }
      return;
    }

    if (state.isPaused) {
      bindAudio(audio, state.currentAudioId);
      return;
    }

    unbindAudio();
    clearHighlight();
  }

  function onCommentaryStart(detail) {
    var audioId = detail && detail.audioId;
    var config = getConfigForAudioId(audioId);
    if (!audioId || !config) return;

    activeAudioId = audioId;
    activeConfig = config;
    loadSegments(audioId, config).then(function () {
      if (activeAudioId !== audioId) return;
      if (isCrossReferenceAudioId(audioId)) {
        refreshCardHighlight({ shouldFollow: true, allowWhenPaused: true });
      } else {
        handleTimeUpdate();
      }
    });
    syncBinding();
  }

  window.addEventListener('audio:start', function (e) {
    onCommentaryStart(e.detail || {});
  });

  window.addEventListener('audio:resume', syncBinding);

  window.addEventListener('audio:pause', function () {
    stopCrossRefHighlightTick();
    // Keep current row highlight while paused; do not auto-scroll.
  });

  window.addEventListener('audio:end', function () {
    stopCrossRefHighlightTick();
    activeAudioId = null;
    activeConfig = null;
    unbindAudio();
    clearHighlight();
  });

  window.addEventListener('audio:error', function () {
    stopCrossRefHighlightTick();
    activeAudioId = null;
    activeConfig = null;
    unbindAudio();
    clearHighlight();
  });

  var style = document.createElement('style');
  var cssRules = [];
  var type;

  for (type in COMMENTARY_TYPE_CONFIG) {
    if (!Object.prototype.hasOwnProperty.call(COMMENTARY_TYPE_CONFIG, type)) continue;
    cssRules.push(
      '#commentaryContent #' + COMMENTARY_TYPE_CONFIG[type].tabId +
      ' .commentary-table ' +
      COMMENTARY_TYPE_CONFIG[type].itemSelector.split('[')[0] + '.' + ACTIVE_CLASS + ' td{' +
        'background-color:#D8C18A !important;' +
      '}'
    );
  }

  style.textContent = cssRules.join('');
  document.head.appendChild(style);

  initExactCueTestManifestOverrides();
})();
