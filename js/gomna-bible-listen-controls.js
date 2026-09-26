/* Selected Bible playback completion, close intent, and pending feedback. */
(function () {
  'use strict';
  var closedSelection = null;
  var activeSingle = null;
  var completedChoice = false;
  function openFollowupMenu() {
    openVerseListenModeMenu();
    if (completedChoice) {
      var daily = document.getElementById('opt4VerseListenModeDaily');
      if (daily) daily.hidden = true;
    }
  }
  function topicEntry() {
    return /^topic(?:-|$)/.test(new URLSearchParams(location.search).get('source') || '');
  }
  function focusedVerse() {
    var nodes = document.querySelectorAll('#verseList .verse-item--entry-focus[data-verse]');
    if (nodes.length !== 1) return null;
    var n = Number(nodes[0].getAttribute('data-verse'));
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function selectionKey() {
    return JSON.stringify([
      typeof currentBook !== 'undefined' && currentBook ? currentBook.name : '',
      typeof currentChapter !== 'undefined' ? currentChapter : '',
      typeof getSortedUniqueSelectedVerseNums === 'function' ? getSortedUniqueSelectedVerseNums() : [],
      typeof selectedVerseOccurrence !== 'undefined' ? selectedVerseOccurrence : 1,
      focusedVerse()
    ]);
  }
  window.addEventListener('gomna:bible-listen-closed', function () {
    completedChoice = false;
    closedSelection = selectionKey();
  });
  window.gomnaBibleListenControlsHandleListen = function () {
    if (closedSelection !== null) {
      if (closedSelection === selectionKey()) {
        if (isVerseListenModeMenuOpen()) closeVerseListenModeMenu();
        else openFollowupMenu();
        return true;
      }
      closedSelection = null;
    }
    return false;
  };
  window.addEventListener('audio:start', function (event) {
    var previous = activeSingle;
    activeSingle = null;
    closedSelection = null;
    completedChoice = false;
    closeVerseListenModeMenu();
    if (topicEntry()) return;
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState();
    var id = (event.detail || {}).audioId;
    if (!state || !/^bible-(?:single-verse|multi-select):/.test(state.queueSource || '') ||
        !state.queueAudioIds.length || state.queueAudioIds[state.queueIndex] !== id) return;
    var key = selectionKey();
    var epoch = engine._state.queueEpoch;
    var signature = JSON.stringify(state.queueAudioIds);
    var same = previous && previous.key === key && previous.epoch === epoch && previous.signature === signature;
    var completed = same ? previous.completed : {};
    var media = engine._state.currentAudio;
    var item = activeSingle = { id: id, key: key, epoch: epoch, signature: signature,
      media: media, index: state.queueIndex, count: state.queueAudioIds.length, completed: completed,
      played: !state.isLoading && !!media && media.readyState >= 2 && !media.paused };
    if (!media) return;
    media.addEventListener('playing', function () {
      if (activeSingle === item) item.played = true;
    }, { once: true });
    // Observe the native end before the engine changes src or moves the queue.
    media.addEventListener('ended', function () {
      if (activeSingle !== item || !item.played || media.error || !media.ended ||
          engine._state.queueEpoch !== item.epoch || engine._state.playbackCancelled) return;
      item.completed[item.index] = true;
    }, { once: true, capture: true });
  });
  window.addEventListener('audio:end', function (event) {
    var item = activeSingle;
    activeSingle = null;
    var detail = event.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    if (!item || detail.reason !== 'queue_completed' || detail.audioId !== item.id ||
        item.key !== selectionKey() || !engine || engine._state.queueEpoch !== item.epoch ||
        engine._state.playbackCancelled || engine._state.currentAudioId ||
        engine._state.currentAudio !== item.media ||
        Object.keys(item.completed).length !== item.count) return;
    var view = document.getElementById('verseView');
    if (!view || !view.classList.contains('active')) return;
    if (document.querySelector('#settingsPopup.show, .gomna-acc-overlay:not([hidden]), [role="dialog"][aria-modal="true"][aria-hidden="false"]:not([hidden])')) return;
    clearVerseSelection();
    clearEntryFocusHighlight();
    completedChoice = true;
    closedSelection = selectionKey();
    openFollowupMenu();
  });
  function discardSession() { activeSingle = null; closedSelection = null; completedChoice = false; }
  window.addEventListener('audio:error', function () { activeSingle = null; });
  window.addEventListener('gomna:verse_list_rendered', discardSession);
  window.addEventListener('pagehide', discardSession);
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.verse-item[data-verse], [data-ubc-verse]')) discardSession();
  }, true);
  function pendingFeedback() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState();
    var pending = !!(state && state.isLoading);
    document.querySelectorAll('[data-audio-action="toggle"]').forEach(function (button) {
      var mark = button.querySelector('[data-audio-pending-icon]');
      if (!mark) { mark = document.createElement('span'); mark.setAttribute('data-audio-pending-icon', ''); mark.textContent = '…'; button.appendChild(mark); }
      mark.hidden = !pending;
      button.setAttribute('aria-busy', String(pending));
      button.setAttribute('aria-label', pending ? '음성 준비 중' : state && state.isPlaying ? '일시정지' : '재생');
      button.querySelectorAll('[data-audio-play-icon]').forEach(function (icon) { icon.hidden = pending || !!(state && state.isPlaying); });
      button.querySelectorAll('[data-audio-pause-icon]').forEach(function (icon) { icon.hidden = pending || !(state && state.isPlaying); });
    });
  }
  window.addEventListener('audio:start', function () {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var media = engine && engine._state.currentAudio;
    if (media) media.addEventListener('playing', pendingFeedback, { once: true });
  });
  ['audio:start', 'audio:ready', 'audio:pause', 'audio:resume', 'audio:end', 'audio:error'].forEach(function (name) {
    window.addEventListener(name, pendingFeedback);
  });

}());
