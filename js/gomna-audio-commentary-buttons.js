(function() {
  'use strict';

  var FLAG_ATTR = 'data-gomna-audio-commentary-button-added';
  var ALL_TABS_AUDIO_ATTR = 'data-gomna-commentary-sequence-bound';
  var ALL_TABS_BUTTON_SELECTOR = '[data-gomna-commentary-sequence-button="true"]';
  var SEQUENCE_IDLE_LABEL = '▶ 전체 말씀풀이 이어듣기';
  var SEQUENCE_PLAYING_LABEL = '⏸ 전체 말씀풀이 일시정지';
  var pendingTimer = null;
  var observer = null;
  var completedAudioId = null;

  var currentContext = null;
  var currentCommentaryItems = [];
  var currentCommentaryAudioIds = [];
  var currentSequenceSource = '';

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

  function syncCommentaryItemsForContext(ctx) {
    var key = contextKey(ctx);

    if (currentContext && contextKey(currentContext) === key) {
      return;
    }

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
    if (!existing) return;

    existing.remove();
    section.removeAttribute(FLAG_ATTR);
    section.removeAttribute('data-audio-target');
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
    }
  }

  function bindAllTabsAudio(content) {
    var allTabsButton = content.querySelector(ALL_TABS_BUTTON_SELECTOR);
    var publishedIds = getPublishedSequenceAudioIds();

    if (!allTabsButton) return;

    if (!publishedIds.length) {
      allTabsButton.disabled = true;
      allTabsButton.classList.add('gomna-audio-commentary-button--pending');
      allTabsButton.textContent = '준비 중';
      return;
    }

    allTabsButton.disabled = false;
    allTabsButton.classList.remove('gomna-audio-commentary-button--pending');

    if (allTabsButton.getAttribute(ALL_TABS_AUDIO_ATTR) === 'true') return;

    allTabsButton.setAttribute(ALL_TABS_AUDIO_ATTR, 'true');
    allTabsButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();

      var engine = window.GOMNA_AUDIO_ENGINE;
      var ids = getPublishedSequenceAudioIds();

      if (!engine || !engine.playAudioSequence || !ids.length) return;

      engine.playAudioSequence(ids, {
        source: currentSequenceSource
      });
    });
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

  function updateCommentaryButtonLabels() {
    var content = getContent();
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!content) return;

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      var item = currentCommentaryItems[i];
      var button = content.querySelector(
        '[data-audio-id="' + item.audioId + '"].gomna-audio-commentary-button'
      );
      if (!button) continue;

      if (!item.published) {
        button.textContent = '준비 중';
        continue;
      }

      if (state && state.currentAudioId === item.audioId) {
        button.textContent = state.isPaused ? '▶ 이어듣기' : '⏸ 일시정지';
      } else if (completedAudioId === item.audioId) {
        button.textContent = '↻ 다시 듣기';
      } else {
        button.textContent = '▶ 듣기';
      }
    }

    var allTabsButton = content.querySelector(ALL_TABS_BUTTON_SELECTOR);
    if (!allTabsButton) return;

    var publishedIds = getPublishedSequenceAudioIds();
    if (!publishedIds.length) {
      allTabsButton.textContent = '준비 중';
      return;
    }

    var sequenceActive = !!(state && state.queueActive && state.queueSource === currentSequenceSource);
    if (sequenceActive) {
      allTabsButton.textContent = state.isPaused ? SEQUENCE_IDLE_LABEL : SEQUENCE_PLAYING_LABEL;
    } else {
      allTabsButton.textContent = SEQUENCE_IDLE_LABEL;
    }
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

    refreshPublishedFlags();

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      insertButtonForItem(content, currentCommentaryItems[i]);
    }

    removeLegacySequenceControls(content);
    bindAllTabsAudio(content);
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

    if (getItemByAudioId(detail.audioId)) {
      completedAudioId = null;
    }

    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:pause', updateCommentaryButtonLabels);
  window.addEventListener('audio:resume', updateCommentaryButtonLabels);

  window.addEventListener('audio:end', function(e) {
    var detail = e.detail || {};

    if (getItemByAudioId(detail.audioId)) {
      completedAudioId = detail.audioId;
    }

    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:error', updateCommentaryButtonLabels);

  window.GOMNA_AUDIO_COMMENTARY_BUTTONS = {
    isCommentaryAudioId: isCommentaryAudioId,
    isCommentarySequenceSource: function(source) {
      return source === currentSequenceSource;
    },
    stopIfCommentaryAudio: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine && engine.getState ? engine.getState() : null;

      if (!engine || !engine.stopAudio || !state) return false;

      if (state.queueActive && state.queueSource === currentSequenceSource) {
        completedAudioId = null;
        engine.stopAudio();
        updateCommentaryButtonLabels();
        return true;
      }

      if (isCommentaryAudioId(state.currentAudioId)) {
        completedAudioId = null;
        engine.stopAudio();
        updateCommentaryButtonLabels();
        return true;
      }

      return false;
    },
    getSequenceAudioIds: function() {
      return getPublishedSequenceAudioIds().slice();
    }
  };

  console.log('[GOMNA_AUDIO] gomna-audio-commentary-buttons.js loaded');
})();
