(function() {
  'use strict';

  var AUDIO_TYPE = 'bible';
  var DEV_TEST_AUDIO_ID = 'genesis.001.001.bible';
  var BUTTON_MARK_ATTR = 'data-gomna-audio-verse-button';
  var observer = null;
  var retryTimers = [];
  var syncTimer = null;
  var BOOK_AUDIO_ID_FALLBACKS = {
    '창세기': 'genesis',
    '출애굽기': 'exodus',
    '레위기': 'leviticus',
    '민수기': 'numbers',
    '신명기': 'deuteronomy',
    '여호수아': 'joshua',
    '사사기': 'judges',
    '룻기': 'ruth',
    '사무엘상': '1samuel',
    '사무엘하': '2samuel',
    '열왕기상': '1kings',
    '열왕기하': '2kings',
    '역대상': '1chronicles',
    '역대하': '2chronicles',
    '에스라': 'ezra',
    '느헤미야': 'nehemiah',
    '에스더': 'esther',
    '욥기': 'job',
    '시편': 'psalms',
    '잠언': 'proverbs',
    '전도서': 'ecclesiastes',
    '아가': 'song',
    '이사야': 'isaiah',
    '예레미야': 'jeremiah',
    '예레미야애가': 'lamentations',
    '에스겔': 'ezekiel',
    '다니엘': 'daniel',
    '호세아': 'hosea',
    '요엘': 'joel',
    '아모스': 'amos',
    '오바댜': 'obadiah',
    '요나': 'jonah',
    '미가': 'micah',
    '나훔': 'nahum',
    '하박국': 'habakkuk',
    '스바냐': 'zephaniah',
    '학개': 'haggai',
    '스가랴': 'zechariah',
    '말라기': 'malachi'
  };
  var BUTTON_STATES = {
    idle: {
      icon: '▶',
      label: '듣기'
    },
    playing: {
      icon: '⏸',
      label: '일시정지'
    },
    paused: {
      icon: '▶',
      label: '이어듣기'
    }
  };

  function getSearchRoot() {
    return document.getElementById('verseView') || document.body;
  }

  function pad3(value) {
    return String(value).padStart(3, '0');
  }

  function getBookAudioId(bookName) {
    var map = window.BOOK_FILE_MAP;

    if (map && map[bookName]) {
      return map[bookName];
    }

    if (BOOK_AUDIO_ID_FALLBACKS[bookName]) {
      return BOOK_AUDIO_ID_FALLBACKS[bookName];
    }

    return null;
  }

  function buildAudioId(verse, context) {
    context = context || getCurrentContext();
    if (!context) return null;

    return context.bookId + '.' + pad3(context.chapter) + '.' + pad3(verse) + '.' + AUDIO_TYPE;
  }

  function isDevTestAudioId(audioId) {
    return audioId === DEV_TEST_AUDIO_ID;
  }

  function getCurrentContext() {
    var book = window.currentBook;
    var chapter = Number(window.currentChapter);
    var bookId;

    if (!book || !book.name || !chapter) {
      return null;
    }

    bookId = getBookAudioId(book.name);
    if (!bookId) {
      return null;
    }

    return {
      bookName: book.name,
      bookId: bookId,
      chapter: chapter
    };
  }

  function getManifestAudios() {
    var config = window.GOMNA_AUDIO_CONFIG;
    if (!config || !config.manifestData || !config.manifestData.audios) {
      return null;
    }

    return config.manifestData.audios;
  }

  function getPublishedBibleEntry(audioId, verse, context) {
    var audios = getManifestAudios();
    var entry = audios && audios[audioId];

    context = context || getCurrentContext();

    if (!entry || !context) return null;
    if (entry.status !== 'published' && !isDevTestAudioId(audioId)) return null;
    if (entry.bookId !== context.bookId) return null;
    if (entry.chapter !== context.chapter) return null;
    if (entry.verse !== verse) return null;
    if (entry.type !== AUDIO_TYPE) return null;
    if (!entry.filePath) return null;

    return entry;
  }

  function createListenButton(audioId, verse, context) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-verse-button';
    btn.setAttribute(BUTTON_MARK_ATTR, 'true');
    btn.setAttribute('data-audio-id', audioId);
    btn.setAttribute('data-audio-action', 'play-verse-to-end');
    btn.setAttribute(
      'aria-label',
      context.bookName + ' ' + context.chapter + '장 ' + verse + '절 본문 듣기'
    );

    btn.innerHTML =
      '<span class="gomna-audio-verse-icon" aria-hidden="true">▶</span>' +
      '<span class="gomna-audio-verse-label">듣기</span>';
    setButtonDisplayState(btn, 'idle');

    return btn;
  }

  function getEngineState() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    return engine && engine.getState ? engine.getState() : null;
  }

  function setButtonDisplayState(btn, stateName) {
    var state = BUTTON_STATES[stateName] || BUTTON_STATES.idle;
    var iconEl = btn && btn.querySelector('.gomna-audio-verse-icon');
    var labelEl = btn && btn.querySelector('.gomna-audio-verse-label');

    if (!btn) return;

    if (iconEl && iconEl.textContent !== state.icon) {
      iconEl.textContent = state.icon;
    }

    if (labelEl && labelEl.textContent !== state.label) {
      labelEl.textContent = state.label;
    }

    btn.setAttribute('data-gomna-audio-state', stateName || 'idle');
    btn.classList.toggle('gomna-audio-active', stateName === 'playing' || stateName === 'paused');
  }

  function getButtonStateName(btn, state) {
    var audioId = btn && btn.getAttribute('data-audio-id');
    var resumeManager = window.GOMNA_AUDIO_BIBLE_RESUME;

    if (!audioId) {
      return 'idle';
    }

    if (state && state.currentAudioId) {
      if (state.currentAudioId !== audioId) {
        return 'idle';
      }

      if (state.isPlaying) {
        return 'playing';
      }

      if (state.isPaused) {
        return 'paused';
      }

      return 'idle';
    }

    if (
      resumeManager &&
      resumeManager.getSessionForAudioId &&
      resumeManager.getSessionForAudioId(audioId)
    ) {
      return 'paused';
    }

    return 'idle';
  }

  function syncVerseButtonLabels() {
    var root = getSearchRoot();
    var buttons;
    var state;

    if (!root) return;

    buttons = root.querySelectorAll('.gomna-audio-verse-button[' + BUTTON_MARK_ATTR + '="true"]');
    state = getEngineState();

    for (var i = 0; i < buttons.length; i++) {
      setButtonDisplayState(buttons[i], getButtonStateName(buttons[i], state));
    }
  }

  function isButtonInCorrectPosition(btn, actions) {
    actions = actions || (btn && btn.parentNode);
    if (!actions || !actions.classList || !actions.classList.contains('verse-actions')) return false;

    var commentaryButton = findCommentaryButton(actions);
    return !!commentaryButton && btn.nextElementSibling === commentaryButton;
  }

  function removeButton(btn) {
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
  }

  function removeManagedButtons(root) {
    var buttons = root.querySelectorAll('.gomna-audio-verse-button[' + BUTTON_MARK_ATTR + '="true"]');

    for (var i = 0; i < buttons.length; i++) {
      removeButton(buttons[i]);
    }
  }

  function findCommentaryButton(actions) {
    if (!actions) return null;

    var buttons = actions.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if ((buttons[i].textContent || '').indexOf('말씀풀이') !== -1) {
        return buttons[i];
      }
    }

    return null;
  }

  function getActionsRow(verseItem) {
    if (!verseItem) return null;

    var actions = verseItem.querySelector('.verse-actions');
    var commentaryButton = findCommentaryButton(actions);
    if (!commentaryButton) return null;

    var actionText = actions.textContent || '';
    if (actionText.indexOf('공유') === -1) return null;
    if (actionText.indexOf('보관') === -1) return null;

    return actions;
  }

  function getVerseNumber(verseItem) {
    var raw = verseItem && verseItem.getAttribute('data-verse');
    var verse = parseInt(raw, 10);
    return isNaN(verse) ? null : verse;
  }

  function removeDuplicateButtons(actions, keepButton) {
    var buttons = actions.querySelectorAll('.gomna-audio-verse-button[' + BUTTON_MARK_ATTR + '="true"]');

    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i] !== keepButton) {
        removeButton(buttons[i]);
      }
    }
  }

  function markVerseTarget(verseItem, audioId) {
    var textEl = verseItem.querySelector('.verse-text');
    if (textEl) {
      textEl.setAttribute('data-audio-target', audioId);
    }
  }

  function clearVerseTarget(verseItem) {
    var textEl = verseItem.querySelector('.verse-text');
    if (textEl) {
      textEl.removeAttribute('data-audio-target');
    }
  }

  function ensureVerseButton(verseItem, context) {
    var verse = getVerseNumber(verseItem);
    if (!verse) return false;

    context = context || getCurrentContext();
    if (!context) return false;

    var audioId = buildAudioId(verse, context);
    if (!audioId) return false;

    var entry = getPublishedBibleEntry(audioId, verse, context);
    var actions = getActionsRow(verseItem);
    var existing = actions && actions.querySelector('.gomna-audio-verse-button[' + BUTTON_MARK_ATTR + '="true"]');

    if (!entry || !actions) {
      clearVerseTarget(verseItem);
      removeDuplicateButtons(actions || verseItem, null);
      return false;
    }

    var commentaryButton = findCommentaryButton(actions);
    var button = existing;

    if (!button) {
      button = createListenButton(audioId, verse, context);
    } else {
      button.setAttribute('data-audio-id', audioId);
      button.setAttribute('data-audio-action', 'play-verse-to-end');
      button.setAttribute(
        'aria-label',
        context.bookName + ' ' + context.chapter + '장 ' + verse + '절 본문 듣기'
      );
    }

    if (!isButtonInCorrectPosition(button, actions)) {
      actions.insertBefore(button, commentaryButton);
    }

    removeDuplicateButtons(actions, button);
    markVerseTarget(verseItem, audioId);

    return true;
  }

  function syncButtons() {
    syncTimer = null;

    var root = getSearchRoot();
    if (!root) return false;

    if (!getCurrentContext()) {
      removeManagedButtons(root);
      return false;
    }

    var verseItems = root.querySelectorAll('.verse-item[data-verse]');
    var addedCount = 0;

    for (var i = 0; i < verseItems.length; i++) {
      if (ensureVerseButton(verseItems[i], getCurrentContext())) {
        addedCount++;
      }
    }

    if (addedCount > 0) {
      var ctx = getCurrentContext();
      console.log(
        '[GOMNA_AUDIO] ' + (ctx ? ctx.bookName + ' ' + ctx.chapter : '?') + '장 본문 듣기 버튼 동기화:',
        addedCount,
        '개'
      );
    }

    syncVerseButtonLabels();
    return addedCount > 0;
  }

  function queueSync() {
    if (syncTimer) return;

    syncTimer = setTimeout(syncButtons, 0);
  }

  function scheduleRetries() {
    retryTimers.push(setTimeout(syncButtons, 500));
    retryTimers.push(setTimeout(syncButtons, 1500));
    retryTimers.push(setTimeout(syncButtons, 3000));
  }

  function startObserver() {
    if (!window.MutationObserver || observer) return;

    observer = new MutationObserver(function() {
      queueSync();
    });

    var root = getSearchRoot();
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  function init() {
    syncButtons();
    scheduleRetries();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('gomna:manifest_loaded', syncButtons);
  window.addEventListener('gomna:verse_list_rendered', syncButtons);
  window.addEventListener('audio:start', syncVerseButtonLabels);
  window.addEventListener('audio:pause', syncVerseButtonLabels);
  window.addEventListener('audio:resume', syncVerseButtonLabels);
  window.addEventListener('audio:end', syncVerseButtonLabels);
  window.addEventListener('audio:error', syncVerseButtonLabels);
  window.addEventListener('gomna:bible_resume_session_changed', syncVerseButtonLabels);

  console.log('[GOMNA_AUDIO] gomna-audio-listen-button.js loaded');
})();
