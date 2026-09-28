/* Return only to the Bible library detail that opened this Reader. */
(function () {
  'use strict';
  var p = new URLSearchParams(location.search);
  var kind = p.get('libraryKind'), id = p.get('libraryId'), name = p.get('libraryName');
  if (!/^(people|stories)$/.test(kind || '') || !/^[a-z-]+$/.test(id || '') || !name || name.length > 80) return;
  var book = p.get('book'), chapter = Number(p.get('chapter'));
  var start = Number(p.get('verseStart')), end = Number(p.get('verseEnd'));
  if (!book || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start) return;
  var listening = p.get('listen') === '1', finished = false, active = null;
  function samePlace() {
    return typeof currentBook !== 'undefined' && currentBook && currentBook.name === book &&
      typeof currentChapter !== 'undefined' && Number(currentChapter) === chapter;
  }
  function render() {
    var view = document.getElementById('verseView');
    if (!view) return;
    var box = document.getElementById('gomnaLibraryReturn');
    if (!box) {
      box = document.createElement('div'); box.id = 'gomnaLibraryReturn';
      box.style.cssText = 'padding:20px 16px 32px;text-align:center;';
      var link = document.createElement('a');
      link.href = './?v=bible-stories-30#bible-library/' + kind + '/' + id;
      link.textContent = '‹ ' + name + (kind === 'stories' ? ' 이야기' : '') + '로 돌아가기';
      link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;box-sizing:border-box;border:1px solid #c4c4c8;border-radius:999px;background:#ececec;color:#191a1b;font:inherit;font-size:15px;text-decoration:none;';
      box.appendChild(link); view.appendChild(box);
    }
    box.hidden = !samePlace() || (listening && !finished);
  }
  window.addEventListener('audio:start', function (event) {
    if (!listening || finished) return;
    var previous = active; active = null;
    var engine = window.GOMNA_AUDIO_ENGINE, state = engine && engine.getState();
    if (!samePlace() || !state || typeof getChapterAudioIds !== 'function') return;
    var expected = getChapterAudioIds({startVerse:start, endVerse:end});
    var signature = JSON.stringify(expected);
    if (!expected.length || signature !== JSON.stringify(state.queueAudioIds)) return;
    var media = engine._state.currentAudio, epoch = engine._state.queueEpoch;
    var audioId = (event.detail || {}).audioId;
    if (!media || expected[state.queueIndex] !== audioId) return;
    var item = active = {epoch:epoch, media:media, id:audioId, index:state.queueIndex,
      signature:signature, count:expected.length, played:!media.paused && media.readyState >= 2,
      completed:previous && previous.epoch === epoch && previous.signature === signature ? previous.completed : {}};
    media.addEventListener('playing', function () { if (active === item) item.played = true; }, {once:true});
    media.addEventListener('ended', function () {
      if (active === item && item.played && media.ended && !media.error &&
          engine._state.queueEpoch === epoch && !engine._state.playbackCancelled) item.completed[item.index] = true;
    }, {once:true, capture:true});
  });
  window.addEventListener('audio:end', function (event) {
    var item = active; active = null;
    var engine = window.GOMNA_AUDIO_ENGINE, detail = event.detail || {};
    if (!item || !samePlace() || detail.reason !== 'queue_completed' || detail.audioId !== item.id ||
        !engine || engine._state.queueEpoch !== item.epoch || engine._state.playbackCancelled ||
        engine._state.currentAudioId || engine._state.currentAudio !== item.media ||
        Object.keys(item.completed).length !== item.count) return;
    finished = true; render();
  });
  window.addEventListener('audio:error', function () { active = null; });
  window.addEventListener('gomna:bible-listen-closed', function () { active = null; });
  window.addEventListener('gomna:verse_list_rendered', function () { active = null; render(); });
  window.addEventListener('pageshow', render);
  render();
})();
