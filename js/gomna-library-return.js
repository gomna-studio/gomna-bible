/* Return only to the Bible library detail that opened this Reader. */
(function () {
  'use strict';
  var p = new URLSearchParams(location.search);
  var kind = p.get('libraryKind'), id = p.get('libraryId'), name = p.get('libraryName');
  if (!/^(people|stories)$/.test(kind || '') || !/^[a-z-]+$/.test(id || '') || !name || name.length > 80) return;
  var book = p.get('book'), chapter = Number(p.get('chapter'));
  var start = Number(p.get('verseStart')), end = Number(p.get('verseEnd'));
  if (!book || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start) return;
  var listening = p.get('listen') === '1', finished = false;
  function samePlace() {
    return typeof currentBook !== 'undefined' && currentBook && currentBook.name === book &&
      typeof currentChapter !== 'undefined' && Number(currentChapter) === chapter;
  }
  function render() {
    var view = document.getElementById('verseView');
    if (!view) return;
    var anchor = document.querySelector('#verseList .verse-item[data-verse="' + end + '"]');
    if (!anchor) return;
    var box = document.getElementById('gomnaLibraryReturn');
    if (!box) {
      box = document.createElement('div'); box.id = 'gomnaLibraryReturn';
      box.style.cssText = 'margin:0;padding:0;';
      var link = document.createElement('a');
      link.href = './?v=bible-stories-34#bible-library/' + kind + '/' + id;
      link.className = 'daily-word-return-btn';
      link.setAttribute('data-daily-word-return', '1');
      link.textContent = '← ' + name + (kind === 'stories' ? ' 이야기' : '') + '로 돌아가기';
      link.style.cssText = 'text-decoration:none;';
      box.appendChild(link); anchor.insertAdjacentElement('afterend', box);
    }
    box.hidden = !samePlace() || (listening && !finished);
  }
  var source = 'bible-library:' + kind + ':' + id;
  function isActive() {
    return listening && samePlace() &&
      (typeof isReaderVerseViewActive !== 'function' || isReaderVerseViewActive());
  }
  function expectedIds() {
    return typeof getChapterAudioIds === 'function'
      ? getChapterAudioIds({startVerse:start, endVerse:end}) : [];
  }
  function playIds(ids, restart) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    if (!engine || !ids.length) return true;
    if (typeof clearBibleContinuousChapterPlayback === 'function') clearBibleContinuousChapterPlayback();
    if (typeof closeVerseListenModeMenu === 'function') closeVerseListenModeMenu();
    engine.playAudioQueue(ids, {source:source, forceRestart:!!restart});
    return true;
  }
  window.gomnaLibraryListen = {
    source: source,
    isActive: isActive,
    range: function () { return isActive() ? {start:start, end:end} : null; },
    play: function () {
      if (!isActive()) return false;
      if (window.gomnaReaderWaitForAudioManifest &&
          window.gomnaReaderWaitForAudioManifest(window.gomnaLibraryListen.play)) return true;
      return playIds(expectedIds(), false);
    },
    jump: function (verse) {
      if (!isActive()) return false;
      if (verse < start || verse > end) return true;
      var ids = getChapterAudioIds({startVerse:verse, endVerse:end});
      return playIds(ids, true);
    },
    jumpAudio: function (audioId) {
      if (!isActive()) return false;
      var ids = expectedIds(), index = ids.indexOf(audioId);
      return index < 0 ? true : playIds(ids.slice(index), true);
    }
  };
  window.addEventListener('audio:start', function () {
    var engine = window.GOMNA_AUDIO_ENGINE, state = engine && engine.getState();
    if (!isActive() || !state || state.queueSource !== source) return;
    finished = false;
    render();
  });
  window.addEventListener('audio:end', function (event) {
    var detail = event.detail || {}, ids = detail.queueAudioIds || [];
    if (!isActive() || detail.reason !== 'queue_completed' || detail.queueSource !== source || !ids.length) return;
    var expected = expectedIds(), offset = expected.indexOf(ids[0]);
    // A deliberate in-range seek can start later, but must still end at the
    // final highlighted verse, with no failed/skipped tracks in that queue.
    if (offset < 0 || JSON.stringify(ids) !== JSON.stringify(expected.slice(offset)) ||
        JSON.stringify(ids) !== JSON.stringify(detail.completedAudioIds)) return;
    finished = true;
    render();
    var box = document.getElementById('gomnaLibraryReturn');
    var lastVerse = document.querySelector('#verseList .verse-item[data-verse="' + end + '"]');
    if (box && lastVerse && typeof window.__gomnaPlainVerseGestureScrollToRange === 'function' &&
        window.__gomnaPlainVerseGestureScrollToRange(lastVerse, box, {centerRatio:0.5})) return;
    if (box && box.scrollIntoView) box.scrollIntoView({behavior:'smooth', block:'nearest'});
  });
  window.addEventListener('gomna:verse_list_rendered', render);
  window.addEventListener('pageshow', render);
  render();
})();
