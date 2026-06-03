(function() {
  'use strict';

  var FLAG_ATTR = 'data-gomna-audio-commentary-button-added';
  var ALL_TABS_AUDIO_ATTR = 'data-gomna-commentary-sequence-bound';
  var TAB_AUDIO_ATTR = 'data-gomna-commentary-tab-audio-bound';
  var ALL_TABS_BUTTON_SELECTOR = '[data-gomna-commentary-sequence-button="true"]';
  var SEQUENCE_IDLE_LABEL = '▶ 전체듣기';
  var SEQUENCE_PLAYING_LABEL = '⏸ 전체 일시정지';
  var SEQUENCE_PAUSED_LABEL = '▶ 전체 이어듣기';
  var ACTIVE_BUTTON_CLASS = 'gomna-audio-commentary-button--active';
  var ACTIVE_TAB_CLASS = 'gomna-audio-commentary-tab--active';
  var ACTIVE_SECTION_CLASS = 'gomna-audio-commentary-section--active';
  var ACTIVE_CUE_CLASS = 'gomna-commentary-cue--active';
  var REPLAY_BUTTON_CLASS = 'gomna-audio-commentary-replay-button';
  var SEQUENCE_BUTTON_CLASS = 'gomna-audio-commentary-sequence-button';
  var pendingTimer = null;
  var observer = null;
  var completedAudioIds = {};
  var lastSequenceQueueIndex = -1;
  var replayGuardAudioId = null;
  var currentCueKey = null;

  var currentContext = null;
  var currentCommentaryItems = [];
  var currentCommentaryAudioIds = [];
  var currentSequenceSource = '';

  // Future Matthew Henry audio option:
  // English originals can later be generated with a separate en-US voice,
  // split from Korean exposition, or exposed as a dedicated English button.
  // For now, commentary audio remains a ko-KR Korean exposition track.
  var COMMENTARY_TYPE_TEMPLATES = [
    { title: '원어분석', tabId: 'tab-원어분석', type: 'original-language' },
    { title: '역사적배경', tabId: 'tab-역사적배경', type: 'history' },
    { title: '신학적의미', tabId: 'tab-신학적의미', type: 'theology' },
    { title: '예표론', tabId: 'tab-예표론', type: 'typology' },
    { title: '매튜헨리', tabId: 'tab-매튜헨리', type: 'matthew-henry' },
    { title: '설교자료', tabId: 'tab-설교자료', type: 'sermon' },
    { title: '찬송가', tabId: 'tab-찬송가', type: 'hymn' },
    { title: '상담적용', tabId: 'tab-상담적용', type: 'counseling' },
    { title: '교차참조', tabId: 'tab-교차참조', type: 'cross-reference' }
  ];

  // TODO: 추후 매튜헨리 영어 원문 클릭 재생은 자동 cue point 방식으로 확장한다.
  // 유력한 저장 구조는 audio/cues/ko-KR/genesis/001/001/commentary-cues.json 같은 별도 JSON이며,
  // manifest에는 나중에 cuePath만 추가하는 방향을 검토한다.
  var COMMENTARY_MANUAL_CUES = {
    'genesis.001.001.matthew-henry': {
      'mh-en-1': 7.2,
      'mh-en-2': 27.8,
      'mh-en-3': 44.4
    },
    'genesis.001.002.matthew-henry': {
      'mh-en-1': 9.2,
      'mh-en-2': 23.6,
      'mh-en-3': 36.4
    },
    'genesis.001.003.matthew-henry': {
      'mh-en-1': 8.4,
      'mh-en-2': 22.8,
      'mh-en-3': 36.2
    }
  };

  var COMMENTARY_MANUAL_CUE_TEXTS = {
    'genesis.001.001.matthew-henry': {
      'mh-en-1': 'The first verse of the Bible gives us a satisfying account of the origin of the universe.',
      'mh-en-2': 'We have here the work of creation and the author of that work.',
      'mh-en-3': 'By faith we understand that the worlds were framed by the word of God.'
    },
    'genesis.001.002.matthew-henry': {
      'mh-en-1': 'The Spirit of God was the first mover.',
      'mh-en-2': 'Chaos makes way for cosmos when God speaks.',
      'mh-en-3': 'Darkness serves to magnify the light that follows.'
    },
    'genesis.001.003.matthew-henry': {
      'mh-en-1': "God's word created the first daybreak.",
      'mh-en-2': 'No creature can resist His fiat.',
      'mh-en-3': 'Light is the first blessing He bestows.'
    }
  };

  function pad3(num) {
    var s = String(num);
    while (s.length < 3) {
      s = '0' + s;
    }
    return s;
  }

  function buildCommentaryAudioId(bookId, chapter, verse, type) {
    return bookId + '.' + pad3(chapter) + '.' + pad3(verse) + '.' + type;
  }

  function getPopup() {
    return document.getElementById('commentaryPopup');
  }

  function getContent() {
    return document.getElementById('commentaryContent');
  }

  function getManifestAudios() {
    var config = window.GOMNA_AUDIO_CONFIG;
    if (!config || !config.manifestData || !config.manifestData.audios) {
      return null;
    }

    return config.manifestData.audios;
  }

  function isPublishedAudioId(audioId) {
    var audios = getManifestAudios();
    var entry = audios && audios[audioId];

    return !!(
      entry &&
      entry.status === 'published' &&
      entry.filePath &&
      String(entry.filePath).trim()
    );
  }

  function getPublishedSequenceAudioIds() {
    var ids = [];

    for (var i = 0; i < currentCommentaryAudioIds.length; i++) {
      if (isPublishedAudioId(currentCommentaryAudioIds[i])) {
        ids.push(currentCommentaryAudioIds[i]);
      }
    }

    return ids;
  }

  function getCommentaryContext() {
    var content = getContent();
    var pick = content && content.querySelector('.commentary-nav-pick-txt');
    var text = pick ? pick.textContent.replace(/\s+/g, ' ').trim() : '';
    var match = text.match(/^(.+?)\s+(\d+):(\d+)$/);

    if (match) {
      var bookName = match[1];
      var bookId = window.BOOK_FILE_MAP && window.BOOK_FILE_MAP[bookName];

      if (bookId) {
        return {
          bookName: bookName,
          bookId: bookId,
          chapter: parseInt(match[2], 10),
          verse: parseInt(match[3], 10)
        };
      }
    }

    if (window.currentBook && window.currentChapter) {
      var bookIdFromCurrent = window.BOOK_FILE_MAP && window.BOOK_FILE_MAP[window.currentBook.name];

      if (bookIdFromCurrent && match) {
        return {
          bookName: window.currentBook.name,
          bookId: bookIdFromCurrent,
          chapter: window.currentChapter,
          verse: parseInt(match[3], 10)
        };
      }
    }

    return null;
  }

  function contextKey(ctx) {
    return ctx.bookId + '.' + pad3(ctx.chapter) + '.' + pad3(ctx.verse);
  }

  function markCommentaryCompleted(audioId) {
    if (audioId) {
      completedAudioIds[audioId] = true;
    }
  }

  function clearCommentaryCompleted(audioId) {
    if (audioId) {
      delete completedAudioIds[audioId];
    }
  }

  function resetCommentaryPlaybackState() {
    completedAudioIds = {};
    lastSequenceQueueIndex = -1;
    replayGuardAudioId = null;
    currentCueKey = null;
  }

  function isCommentaryCompleted(audioId) {
    return !!completedAudioIds[audioId];
  }

  function hasActiveCommentaryPlayback(state) {
    return !!(
      state &&
      isCommentaryAudioId(state.currentAudioId) &&
      (state.isPlaying || state.isPaused)
    );
  }

  function hasActiveCommentarySequence(state) {
    return !!(
      state &&
      state.queueActive &&
      state.queueSource === currentSequenceSource &&
      (state.isPlaying || state.isPaused)
    );
  }

  function buildCueKey(audioId, cueId) {
    return audioId + '#' + cueId;
  }

  function syncCommentaryItemsForContext(ctx) {
    var key = contextKey(ctx);

    if (currentContext && contextKey(currentContext) === key) {
      return;
    }

    resetCommentaryPlaybackState();
    currentContext = ctx;
    currentCommentaryItems = COMMENTARY_TYPE_TEMPLATES.map(function(template) {
      var audioId = buildCommentaryAudioId(ctx.bookId, ctx.chapter, ctx.verse, template.type);

      return {
        title: template.title,
        tabId: template.tabId,
        type: template.type,
        audioId: audioId,
        published: isPublishedAudioId(audioId)
      };
    });
    currentCommentaryAudioIds = currentCommentaryItems.map(function(item) {
      return item.audioId;
    });
    currentSequenceSource =
      'commentary:' + ctx.bookId + '.' + pad3(ctx.chapter) + '.' + pad3(ctx.verse);
  }

  function isCommentaryTabsPopup(popup) {
    if (!popup || !popup.classList.contains('show')) return false;

    var content = getContent();
    if (!content || !content.querySelector('.commentary-tabs')) return false;

    var ctx = getCommentaryContext();
    if (!ctx) return false;

    syncCommentaryItemsForContext(ctx);
    return true;
  }

  function createButton(item) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-commentary-button';
    btn.setAttribute('data-audio-id', item.audioId);

    if (item.published) {
      btn.setAttribute('data-audio-action', 'play');
      btn.setAttribute('aria-label', item.title + ' 듣기');
      btn.textContent = '▶ 듣기';
    } else {
      btn.className += ' gomna-audio-commentary-button--pending';
      btn.disabled = true;
      btn.setAttribute('aria-label', item.title + ' 준비 중');
      btn.textContent = '준비 중';
    }

    return btn;
  }

  function createReplayButton(item) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-commentary-button ' + REPLAY_BUTTON_CLASS;
    btn.setAttribute('data-audio-replay-id', item.audioId);

    if (item.published) {
      btn.disabled = false;
      btn.setAttribute('aria-label', item.title + ' 처음부터 다시듣기');
      btn.textContent = '↻ 다시듣기';
    } else {
      btn.disabled = true;
      btn.classList.add('gomna-audio-commentary-button--pending');
      btn.setAttribute('aria-label', item.title + ' 준비 중');
      btn.textContent = '준비 중';
    }

    return btn;
  }

  function findTitleHost(section, title) {
    var candidates = section.querySelectorAll('h3, h4, h5, strong, div, button');

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();

      if (text.indexOf(title) === -1) continue;
      if (el.querySelector && el.querySelector('.gomna-audio-commentary-button')) continue;
      if (el.children && el.children.length > 3) continue;

      return el;
    }

    return null;
  }

  function removeExistingCommentaryButton(section) {
    var existing = section.querySelector('.gomna-audio-commentary-button');
    var replay = section.querySelector('.' + REPLAY_BUTTON_CLASS);

    if (existing) existing.remove();
    if (replay) replay.remove();
    section.removeAttribute(FLAG_ATTR);
    section.removeAttribute('data-audio-target');
  }

  function ensureReplayButton(titleHost, item) {
    var existingReplay = titleHost.querySelector(
      '[data-audio-replay-id="' + item.audioId + '"].' + REPLAY_BUTTON_CLASS
    );

    if (!existingReplay) {
      existingReplay = createReplayButton(item);
      titleHost.appendChild(existingReplay);
    }

    updateReplayButton(existingReplay, item);
  }

  function getActionHostForItem(content, item) {
    var button;

    if (!content || !item) return null;

    button = content.querySelector(
      '[data-audio-id="' + item.audioId + '"].gomna-audio-commentary-button'
    );

    return button ? button.parentNode : null;
  }

  function insertButtonForItem(content, item) {
    var section = document.getElementById(item.tabId);
    if (!section || !content.contains(section)) {
      console.warn('[GOMNA_AUDIO] 주석 섹션을 찾지 못했습니다:', item.title);
      return false;
    }

    var existingBtn = section.querySelector('.gomna-audio-commentary-button');
    if (existingBtn) {
      var existingId = existingBtn.getAttribute('data-audio-id');
      if (existingId === item.audioId) {
        updateSingleCommentaryButton(existingBtn, item);
        ensureReplayButton(existingBtn.parentNode, item);
        return true;
      }
      removeExistingCommentaryButton(section);
    }

    var titleHost = findTitleHost(section, item.title);
    if (!titleHost) {
      console.warn('[GOMNA_AUDIO] 주석 제목 영역을 찾지 못했습니다:', item.title);
      return false;
    }

    section.setAttribute('data-audio-target', item.audioId);
    section.setAttribute(FLAG_ATTR, 'true');

    var btn = createButton(item);

    titleHost.classList.add('gomna-audio-commentary-header');
    titleHost.appendChild(btn);
    ensureReplayButton(titleHost, item);

    return true;
  }

  function updateSingleCommentaryButton(button, item) {
    button.setAttribute('data-audio-id', item.audioId);

    if (item.published) {
      button.disabled = false;
      button.classList.remove('gomna-audio-commentary-button--pending');
      button.setAttribute('data-audio-action', 'play');
      button.setAttribute('aria-label', item.title + ' 듣기');
    } else {
      button.disabled = true;
      button.classList.add('gomna-audio-commentary-button--pending');
      button.removeAttribute('data-audio-action');
      button.setAttribute('aria-label', item.title + ' 준비 중');
      button.textContent = '준비 중';
      button.classList.remove(ACTIVE_BUTTON_CLASS);
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function updateReplayButton(button, item) {
    if (!button) return;

    button.setAttribute('data-audio-replay-id', item.audioId);

    if (item.published) {
      button.disabled = false;
      button.classList.remove('gomna-audio-commentary-button--pending');
      button.setAttribute('aria-label', item.title + ' 처음부터 다시듣기');
      button.textContent = '↻ 다시듣기';
    } else {
      button.disabled = true;
      button.classList.add('gomna-audio-commentary-button--pending');
      button.setAttribute('aria-label', item.title + ' 준비 중');
      button.textContent = '준비 중';
      button.classList.remove(ACTIVE_BUTTON_CLASS);
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function enhanceManualCueTargets(content) {
    var section = document.getElementById('tab-매튜헨리');
    var audioId;
    var cueTexts;
    var cueIds;
    var cells;

    if (!section || !content || !content.contains(section)) return;
    if (!currentContext) return;

    audioId = buildCommentaryAudioId(
      currentContext.bookId,
      currentContext.chapter,
      currentContext.verse,
      'matthew-henry'
    );
    cueTexts = COMMENTARY_MANUAL_CUE_TEXTS[audioId];

    if (!cueTexts || !COMMENTARY_MANUAL_CUES[audioId]) return;

    cueIds = Object.keys(cueTexts);
    cells = section.querySelectorAll('td.col1');

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();

      if (cell.querySelector('.gomna-commentary-cue')) continue;

      for (var j = 0; j < cueIds.length; j++) {
        var cueId = cueIds[j];

        if (text !== cueTexts[cueId]) continue;

        var span = document.createElement('span');
        span.className = 'gomna-commentary-cue';
        span.setAttribute('data-audio-id', audioId);
        span.setAttribute('data-cue-id', cueId);
        span.setAttribute('role', 'button');
        span.setAttribute('tabindex', '0');
        span.setAttribute('aria-label', '매튜헨리 영어 원문 구간 다시듣기');
        span.textContent = text;

        cell.textContent = '';
        cell.appendChild(span);
        break;
      }
    }
  }

  function updateManualCueHighlights(content) {
    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(content.querySelectorAll('.gomna-commentary-cue'), function(cue) {
      var cueKey = buildCueKey(cue.getAttribute('data-audio-id'), cue.getAttribute('data-cue-id'));
      var active = currentCueKey && cueKey === currentCueKey;

      cue.classList.toggle(ACTIVE_CUE_CLASS, !!active);
      cue.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function bindAllTabsAudio(content) {
    var allTabsButton = content.querySelector(ALL_TABS_BUTTON_SELECTOR);
    var publishedIds = getPublishedSequenceAudioIds();
    var firstItem = currentCommentaryItems[0];
    var firstActionHost = getActionHostForItem(content, firstItem);

    if (!allTabsButton) return;

    allTabsButton.classList.remove('commentary-tab', 'active');
    allTabsButton.classList.add('gomna-audio-commentary-button', SEQUENCE_BUTTON_CLASS);
    allTabsButton.setAttribute('aria-label', '전체 말씀풀이 듣기');

    if (firstActionHost && allTabsButton.parentNode !== firstActionHost) {
      firstActionHost.appendChild(allTabsButton);
    }

    if (!publishedIds.length) {
      allTabsButton.disabled = true;
      allTabsButton.classList.add('gomna-audio-commentary-button--pending');
      allTabsButton.textContent = '준비 중';
      return;
    }

    allTabsButton.disabled = false;
    allTabsButton.classList.remove('gomna-audio-commentary-button--pending');
    allTabsButton.textContent = SEQUENCE_IDLE_LABEL;

    if (allTabsButton.getAttribute(ALL_TABS_AUDIO_ATTR) === 'true') return;

    allTabsButton.setAttribute(ALL_TABS_AUDIO_ATTR, 'true');
    allTabsButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      CommentaryAudioController.playFullSequence();
    });
  }

  function handleCommentaryButtonClick(event) {
    var cueEl = event.target.closest('.gomna-commentary-cue[data-audio-id][data-cue-id]');
    var replayBtn = event.target.closest('.' + REPLAY_BUTTON_CLASS + '[data-audio-replay-id]');
    var btn = event.target.closest('.gomna-audio-commentary-button[data-audio-id]');
    var content = getContent();
    var audioId;
    var item;

    if (cueEl) {
      if (!content || !content.contains(cueEl)) return;

      audioId = cueEl.getAttribute('data-audio-id');
      item = getItemByAudioId(audioId);
      if (!item || !item.published) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      CommentaryAudioController.playCue(audioId, cueEl.getAttribute('data-cue-id'));
      return;
    }

    if (replayBtn) {
      if (!content || !content.contains(replayBtn)) return;

      audioId = replayBtn.getAttribute('data-audio-replay-id');
      item = getItemByAudioId(audioId);
      if (!item || !item.published) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      CommentaryAudioController.replaySingle(audioId);
      return;
    }

    if (!btn || btn.matches(ALL_TABS_BUTTON_SELECTOR)) return;
    if (!content || !content.contains(btn)) return;

    audioId = btn.getAttribute('data-audio-id');
    item = getItemByAudioId(audioId);
    if (!item || !item.published) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    CommentaryAudioController.playSingle(audioId);
  }

  function bindCommentaryButtonReplayHandler() {
    if (bindCommentaryButtonReplayHandler.bound) return;

    bindCommentaryButtonReplayHandler.bound = true;
    document.addEventListener('click', handleCommentaryButtonClick, true);
    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      handleCommentaryButtonClick(event);
    }, true);
  }

  function bindCommentaryTabQueueNavigation(content) {
    var tabs = content.querySelectorAll('.commentary-tab');

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].matches(ALL_TABS_BUTTON_SELECTOR)) continue;
      if (tabs[i].getAttribute(TAB_AUDIO_ATTR) === 'true') continue;

      tabs[i].setAttribute(TAB_AUDIO_ATTR, 'true');
      tabs[i].addEventListener('click', function() {
        var item = getItemByTabButton(content, this);

        if (!item) return;
        jumpSequenceToItemIfActive(item);
      });
    }
  }

  function getItemByTabButton(content, tab) {
    if (!tab) return null;

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      var item = currentCommentaryItems[i];
      if (getTabButtonForItem(content, item) === tab) {
        return item;
      }
    }

    return null;
  }

  function jumpSequenceToItemIfActive(item) {
    return CommentaryAudioController.playFromTab(item);
  }

  function isCommentaryAudioId(audioId) {
    return !!getItemByAudioId(audioId);
  }

  function getItemByAudioId(audioId) {
    for (var i = 0; i < currentCommentaryItems.length; i++) {
      if (currentCommentaryItems[i].audioId === audioId) {
        return currentCommentaryItems[i];
      }
    }

    return null;
  }

  var CommentaryAudioController = {
    getEngine: function() {
      return window.GOMNA_AUDIO_ENGINE || null;
    },

    getState: function() {
      var engine = this.getEngine();
      return engine && engine.getState ? engine.getState() : null;
    },

    isSequenceActive: function(state) {
      return hasActiveCommentarySequence(state);
    },

    markTransitionStop: function(state) {
      if (state && isCommentaryAudioId(state.currentAudioId)) {
        replayGuardAudioId = state.currentAudioId;
      }
    },

    stopForTransition: function(engine, state) {
      if (!engine || !engine.stopAudio || !state || !state.currentAudioId) return;

      this.markTransitionStop(state);
      engine.stopAudio();
    },

    playSingle: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;

      if (state && state.currentAudioId === audioId) {
        if (state.isPlaying && engine.pauseAudio) {
          engine.pauseAudio();
          updateCommentaryButtonLabels();
          return true;
        }

        if (state.isPaused && engine.resumeAudio) {
          engine.resumeAudio();
          updateCommentaryButtonLabels();
          return true;
        }
      }

      this.startSingleFromBeginning(audioId);
      return true;
    },

    replaySingle: function(audioId) {
      return this.startSingleFromBeginning(audioId);
    },

    startSingleFromBeginning: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = null;
      lastSequenceQueueIndex = -1;
      this.stopForTransition(engine, state);
      engine.playAudioById(audioId, { startTime: 0 });
      updateCommentaryButtonLabels();
      return true;
    },

    playFullSequence: function() {
      var engine = this.getEngine();
      var state = this.getState();
      var ids = getPublishedSequenceAudioIds();

      if (!engine || !engine.playAudioSequence || !ids.length) return false;

      currentCueKey = null;

      if (!this.isSequenceActive(state)) {
        this.stopForTransition(engine, state);
      }

      lastSequenceQueueIndex = 0;
      engine.playAudioSequence(ids, {
        source: currentSequenceSource,
        startIndex: 0
      });
      updateCommentaryButtonLabels();
      return true;
    },

    playSequenceFrom: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();
      var ids = getPublishedSequenceAudioIds();
      var startIndex = ids.indexOf(audioId);

      if (!engine || !engine.playAudioSequence || startIndex < 0) return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = null;
      lastSequenceQueueIndex = startIndex;
      this.stopForTransition(engine, state);
      engine.playAudioSequence(ids, {
        source: currentSequenceSource,
        startIndex: startIndex,
        startTime: 0
      });
      updateCommentaryButtonLabels();
      return true;
    },

    playFromTab: function(item) {
      var state = this.getState();

      if (!item || !item.published) return false;

      if (this.isSequenceActive(state)) {
        return this.playSequenceFrom(item.audioId);
      }

      if (hasActiveCommentaryPlayback(state)) {
        return this.startSingleFromBeginning(item.audioId);
      }

      return false;
    },

    playCue: function(audioId, cueId) {
      var engine = this.getEngine();
      var state = this.getState();
      var cues = COMMENTARY_MANUAL_CUES[audioId];
      var startTime = cues && cues[cueId];
      var ids = getPublishedSequenceAudioIds();
      var startIndex = ids.indexOf(audioId);

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;
      if (typeof startTime !== 'number') return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = buildCueKey(audioId, cueId);

      if (this.isSequenceActive(state) && engine.playAudioSequence && startIndex >= 0) {
        lastSequenceQueueIndex = startIndex;
        this.stopForTransition(engine, state);
        engine.playAudioSequence(ids, {
          source: currentSequenceSource,
          startIndex: startIndex,
          startTime: startTime
        });
      } else {
        lastSequenceQueueIndex = -1;
        this.stopForTransition(engine, state);
        engine.playAudioById(audioId, { startTime: startTime });
      }

      updateCommentaryButtonLabels();
      return true;
    },

    stopIfCurrentCommentary: function() {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.stopAudio || !state) return false;

      if (this.isSequenceActive(state) || isCommentaryAudioId(state.currentAudioId)) {
        lastSequenceQueueIndex = -1;
        currentCueKey = null;
        this.stopForTransition(engine, state);
        updateCommentaryButtonLabels();
        return true;
      }

      return false;
    }
  };

  function syncSequenceCompletedFromQueue(state) {
    var ids;
    var idx;
    var previousIndex;

    if (!state || !state.queueActive || state.queueSource !== currentSequenceSource) {
      return;
    }

    ids = getPublishedSequenceAudioIds();
    idx = state.queueIndex;

    if (lastSequenceQueueIndex < 0 || idx <= lastSequenceQueueIndex) {
      lastSequenceQueueIndex = idx;
      return;
    }

    for (previousIndex = lastSequenceQueueIndex; previousIndex < idx; previousIndex++) {
      if (ids[previousIndex]) {
        markCommentaryCompleted(ids[previousIndex]);
      }
    }

    lastSequenceQueueIndex = idx;
  }

  function updateCommentaryButtonLabels() {
    var content = getContent();
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var activeAudioId = hasActiveCommentaryPlayback(state)
      ? state.currentAudioId
      : null;

    if (!content) return;

    syncSequenceCompletedFromQueue(state);
    clearActiveCommentaryDisplay(content);

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      var item = currentCommentaryItems[i];
      var button = content.querySelector(
        '[data-audio-id="' + item.audioId + '"].gomna-audio-commentary-button'
      );
      if (!button) continue;

      if (!item.published) {
        button.textContent = '준비 중';
        button.removeAttribute('data-audio-action');
        button.classList.remove(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'false');
        updateReplayButton(getReplayButtonForItem(content, item), item);
        continue;
      }

      button.setAttribute('data-audio-action', 'play');
      updateReplayButton(getReplayButtonForItem(content, item), item);

      if (activeAudioId === item.audioId) {
        button.textContent = state.isPaused ? '▶ 이어듣기' : '⏸ 일시정지';
        button.setAttribute('aria-label', item.title + (state.isPaused ? ' 이어듣기' : ' 일시정지'));
      } else if (isCommentaryCompleted(item.audioId)) {
        button.textContent = '↻ 다시듣기';
        button.setAttribute('aria-label', item.title + ' 다시듣기');
      } else {
        button.textContent = '▶ 듣기';
        button.setAttribute('aria-label', item.title + ' 듣기');
      }

      if (activeAudioId === item.audioId) {
        button.classList.add(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'true');
        markActiveCommentaryTab(content, item);
        markActiveCommentarySection(content, item);
      } else {
        button.classList.remove(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'false');
      }
    }

    updateManualCueHighlights(content);

    var allTabsButton = content.querySelector(ALL_TABS_BUTTON_SELECTOR);
    if (!allTabsButton) return;

    var publishedIds = getPublishedSequenceAudioIds();
    if (!publishedIds.length) {
      allTabsButton.textContent = '준비 중';
      return;
    }

    var sequenceActive = hasActiveCommentarySequence(state);
    if (sequenceActive) {
      allTabsButton.textContent = state.isPaused ? SEQUENCE_PAUSED_LABEL : SEQUENCE_PLAYING_LABEL;
      allTabsButton.classList.add(ACTIVE_TAB_CLASS);
      allTabsButton.setAttribute('aria-pressed', state.isPaused ? 'false' : 'true');
    } else {
      allTabsButton.textContent = SEQUENCE_IDLE_LABEL;
      allTabsButton.classList.remove(ACTIVE_TAB_CLASS);
      allTabsButton.setAttribute('aria-pressed', 'false');
    }
  }

  function clearActiveCommentaryDisplay(content) {
    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(
      content.querySelectorAll('.' + ACTIVE_SECTION_CLASS),
      function(section) {
        section.classList.remove(ACTIVE_SECTION_CLASS);
        section.removeAttribute('aria-current');
      }
    );

    Array.prototype.forEach.call(
      content.querySelectorAll('.' + ACTIVE_TAB_CLASS + ':not(' + ALL_TABS_BUTTON_SELECTOR + ')'),
      function(tab) {
        tab.classList.remove(ACTIVE_TAB_CLASS);
        tab.removeAttribute('aria-current');
      }
    );
  }

  function getTabButtonForItem(content, item) {
    var tabs = content.querySelectorAll('.commentary-tab');

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].matches(ALL_TABS_BUTTON_SELECTOR)) continue;
      if ((tabs[i].textContent || '').replace(/\s+/g, ' ').trim() === item.title) {
        return tabs[i];
      }
    }

    return null;
  }

  function getReplayButtonForItem(content, item) {
    return content.querySelector(
      '[data-audio-replay-id="' + item.audioId + '"].' + REPLAY_BUTTON_CLASS
    );
  }

  function markActiveCommentaryTab(content, item) {
    var tab = getTabButtonForItem(content, item);

    if (!tab) return;

    if (!tab.classList.contains('active') && typeof window.switchCommentaryTab === 'function') {
      window.switchCommentaryTab(tab, item.tabId);
    }

    tab.classList.add(ACTIVE_TAB_CLASS);
    tab.setAttribute('aria-current', 'true');
  }

  function markActiveCommentarySection(content, item) {
    var section = document.getElementById(item.tabId);

    if (!section || !content.contains(section)) return;

    section.classList.add(ACTIVE_SECTION_CLASS);
    section.setAttribute('aria-current', 'true');
  }

  function removeLegacySequenceControls(content) {
    var guideText = '원어분석부터 교차참조까지 9개 말씀풀이를 순서대로 듣습니다.';

    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(content.querySelectorAll('button, div, p, span'), function(el) {
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();

      if (text === guideText) {
        el.remove();
      } else if (text === '전체 말씀풀이 이어듣기' && !el.matches(ALL_TABS_BUTTON_SELECTOR)) {
        el.remove();
      } else if (text === '주석풀이전체듣기' && !el.matches(ALL_TABS_BUTTON_SELECTOR)) {
        el.remove();
      }
    });
  }

  function refreshPublishedFlags() {
    if (!currentCommentaryItems.length) return;

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      currentCommentaryItems[i].published = isPublishedAudioId(currentCommentaryItems[i].audioId);
    }
  }

  function addCommentaryButtons() {
    var popup = getPopup();
    var content = getContent();

    if (!popup || !content) return;
    if (!isCommentaryTabsPopup(popup)) return;

    if (!content.querySelector('.gomna-audio-commentary-button[data-audio-id]')) {
      resetCommentaryPlaybackState();
    }

    refreshPublishedFlags();

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      insertButtonForItem(content, currentCommentaryItems[i]);
    }

    enhanceManualCueTargets(content);
    removeLegacySequenceControls(content);
    bindAllTabsAudio(content);
    bindCommentaryButtonReplayHandler();
    bindCommentaryTabQueueNavigation(content);
    updateCommentaryButtonLabels();
  }

  function scheduleAddCommentaryButtons() {
    if (pendingTimer) return;

    pendingTimer = setTimeout(function() {
      pendingTimer = null;
      addCommentaryButtons();
    }, 50);
  }

  function startObserver() {
    var popup = getPopup();
    if (!popup || !window.MutationObserver || observer) return;

    observer = new MutationObserver(function() {
      scheduleAddCommentaryButtons();
    });

    observer.observe(popup, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true
    });
  }

  function init() {
    addCommentaryButtons();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('gomna:manifest_loaded', scheduleAddCommentaryButtons);

  window.addEventListener('audio:start', function(e) {
    var detail = e.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (getItemByAudioId(detail.audioId)) {
      clearCommentaryCompleted(detail.audioId);
      if (!currentCueKey || currentCueKey.indexOf(detail.audioId + '#') !== 0) {
        currentCueKey = null;
      }
      replayGuardAudioId = null;
    }

    if (
      state &&
      state.queueActive &&
      state.queueSource === currentSequenceSource &&
      typeof state.queueIndex === 'number'
    ) {
      if (lastSequenceQueueIndex < 0) {
        lastSequenceQueueIndex = state.queueIndex;
      }
    } else {
      lastSequenceQueueIndex = -1;
    }

    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:pause', updateCommentaryButtonLabels);
  window.addEventListener('audio:resume', updateCommentaryButtonLabels);

  window.addEventListener('audio:end', function(e) {
    var detail = e.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!getItemByAudioId(detail.audioId)) {
      updateCommentaryButtonLabels();
      return;
    }

    if (detail.audioId === replayGuardAudioId) {
      updateCommentaryButtonLabels();
      return;
    }

    if (currentCueKey && currentCueKey.indexOf(detail.audioId + '#') === 0) {
      currentCueKey = null;
    }

    if (state && state.queueActive && state.queueSource === currentSequenceSource) {
      updateCommentaryButtonLabels();
      return;
    }

    markCommentaryCompleted(detail.audioId);
    lastSequenceQueueIndex = -1;
    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:error', updateCommentaryButtonLabels);

  window.GOMNA_AUDIO_COMMENTARY_BUTTONS = {
    isCommentaryAudioId: isCommentaryAudioId,
    isCommentarySequenceSource: function(source) {
      return source === currentSequenceSource;
    },
    stopIfCommentaryAudio: function() {
      return CommentaryAudioController.stopIfCurrentCommentary();
    },
    getSequenceAudioIds: function() {
      return getPublishedSequenceAudioIds().slice();
    }
  };

  console.log('[GOMNA_AUDIO] gomna-audio-commentary-buttons.js loaded');
})();
