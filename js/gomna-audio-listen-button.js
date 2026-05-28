(function() {
  'use strict';

  var TARGET_BOOK_NAME = '창세기';
  var TARGET_BOOK_ID = 'genesis';
  var TARGET_CHAPTER = 1;
  var AUDIO_TYPE = 'bible';
  var DEV_TEST_AUDIO_ID = 'genesis.001.001.bible';
  var BUTTON_MARK_ATTR = 'data-gomna-audio-verse-button';
  var observer = null;
  var retryTimers = [];
  var syncTimer = null;

  function getSearchRoot() {
    return document.getElementById('verseView') || document.body;
  }

  function pad3(value) {
    return String(value).padStart(3, '0');
  }

  function buildAudioId(verse) {
    return TARGET_BOOK_ID + '.' + pad3(TARGET_CHAPTER) + '.' + pad3(verse) + '.' + AUDIO_TYPE;
  }

  function isDevTestAudioId(audioId) {
    return audioId === DEV_TEST_AUDIO_ID;
  }

  function getCurrentContext() {
    var book = window.currentBook;
    var chapter = window.currentChapter;

    if (!book || book.name !== TARGET_BOOK_NAME || chapter !== TARGET_CHAPTER) {
      return null;
    }

    return {
      bookName: book.name,
      bookId: TARGET_BOOK_ID,
      chapter: TARGET_CHAPTER
    };
  }

  function getManifestAudios() {
    var config = window.GOMNA_AUDIO_CONFIG;
    if (!config || !config.manifestData || !config.manifestData.audios) {
      return null;
    }

    return config.manifestData.audios;
  }

  function getPublishedBibleEntry(audioId, verse) {
    var audios = getManifestAudios();
    var entry = audios && audios[audioId];

    if (!entry) return null;
    if (entry.status !== 'published' && !isDevTestAudioId(audioId)) return null;
    if (entry.bookId !== TARGET_BOOK_ID) return null;
    if (entry.chapter !== TARGET_CHAPTER) return null;
    if (entry.verse !== verse) return null;
    if (entry.type !== AUDIO_TYPE) return null;
    if (!entry.filePath) return null;

    return entry;
  }

  function createListenButton(audioId, verse) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-verse-button';
    btn.setAttribute(BUTTON_MARK_ATTR, 'true');
    btn.setAttribute('data-audio-id', audioId);
    btn.setAttribute('data-audio-action', 'play');
    btn.setAttribute('aria-label', '창세기 1장 ' + verse + '절 본문 듣기');

    btn.innerHTML =
      '<span class="gomna-audio-verse-icon" aria-hidden="true">▶</span>' +
      '<span class="gomna-audio-verse-label">듣기</span>';

    return btn;
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

  function ensureVerseButton(verseItem) {
    var verse = getVerseNumber(verseItem);
    if (!verse) return false;

    var audioId = buildAudioId(verse);
    var entry = getPublishedBibleEntry(audioId, verse);
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
      button = createListenButton(audioId, verse);
    } else {
      button.setAttribute('data-audio-id', audioId);
      button.setAttribute('aria-label', '창세기 1장 ' + verse + '절 본문 듣기');
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
      if (ensureVerseButton(verseItems[i])) {
        addedCount++;
      }
    }

    if (addedCount > 0) {
      console.log('[GOMNA_AUDIO] 창세기 1장 본문 듣기 버튼 동기화:', addedCount, '개');
    }

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

  console.log('[GOMNA_AUDIO] gomna-audio-listen-button.js loaded');
})();
