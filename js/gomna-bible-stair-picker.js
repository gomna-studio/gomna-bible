/* Home/쉬운찾기 책→장 stair picker. */
(function(){
  'use strict';

  var state = { mode: 'old', catalog: 'old', stage: 'book', bookName: '', chapter: 0 };
  var bound = false;
  var lastFocus = null;

  function esc(v){
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function allBooks(){
    var all = [];
    try { all = typeof getAllBooks === 'function' ? getAllBooks() : []; } catch (e) { all = []; }
    return all || [];
  }

  function bookByName(bookName){
    var list = allBooks();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === bookName) return list[i];
    }
    return null;
  }

  function booksOf(mode){
    var all = allBooks();
    if (state.catalog === 'all') return all;
    return all.filter(function(b){ return b && b.testament === (mode || state.mode); });
  }

  function chapterCountOf(bookName){
    var found = bookByName(bookName);
    return found ? Number(found.chapters) || 0 : 0;
  }

  function verseCountOf(){
    return 0;
  }

  function titleOf(mode){
    if (state.catalog === 'all' && state.stage === 'book') return '성경';
    return mode === 'new' ? '신약성경' : '구약성경';
  }

  function chapterUnit(bookName){
    try { return typeof getChapterUnit === 'function' ? getChapterUnit(bookName) : '장'; }
    catch (e) { return '장'; }
  }

  function readerHref(bookName, chapter, verse){
    return 'reader.html?book=' + encodeURIComponent(bookName)
      + '&chapter=' + encodeURIComponent(chapter)
      + '&verse=' + encodeURIComponent(verse || 1);
  }

  function ensure(){
    var overlay = document.getElementById('bibleStairOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'bibleStairOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bibleStairTitle');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.innerHTML = ''
      + '<div class="bible-stair-panel" id="bibleStairPanel" tabindex="-1">'
      +   '<h2 class="bible-stair-title" id="bibleStairTitle">구약성경</h2>'
      +   '<div id="bibleStairSteps" hidden></div>'
      +   '<div id="bibleStairBody"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderSteps(){
    var host = document.getElementById('bibleStairSteps');
    if (!host) return;
    var html = '';
    if (state.bookName) {
      html += '<button type="button" class="bible-stair-step is-selected-book" id="bibleStairStepBook" data-stair-back="book">'
        + esc(state.bookName) + '</button>';
    }
    if (state.bookName && state.chapter && state.stage === 'verse') {
      html += '<button type="button" class="bible-stair-step" id="bibleStairStepChapter" data-stair-back="chapter">'
        + esc(state.chapter + chapterUnit(state.bookName)) + '</button>';
    }
    host.innerHTML = html;
    host.hidden = !html;
  }

  function renderBody(){
    var body = document.getElementById('bibleStairBody');
    if (!body) return;
    var html = '';
    var i;
    var n;
    if (state.stage === 'book') {
      html += '<div class="bible-stair-books" id="bibleStairBookGrid">';
      booksOf(state.mode).forEach(function(b){
        var cur = b.name === state.bookName ? ' is-cur' : '';
        html += '<button type="button" class="bible-stair-item' + cur + '" data-stair-book="' + esc(b.name) + '">'
          + esc(b.name) + '</button>';
      });
      html += '</div>';
    } else if (state.stage === 'chapter') {
      n = chapterCountOf(state.bookName);
      html += '<div class="bible-stair-nums" id="bibleStairChapterGrid">';
      for (i = 1; i <= n; i++) {
        var chCur = i === state.chapter ? ' is-cur' : '';
        html += '<button type="button" class="bible-stair-item' + chCur + '" data-stair-chapter="' + i + '">' + i + '</button>';
      }
      html += '</div>';
    } else {
      n = verseCountOf(state.bookName, state.chapter, state.mode);
      html += '<div class="bible-stair-nums" id="bibleStairVerseGrid">';
      for (i = 1; i <= n; i++) {
        html += '<button type="button" class="bible-stair-item" data-stair-verse="' + i + '">' + i + '</button>';
      }
      html += '</div>';
    }
    body.innerHTML = html;
    body.classList.remove('is-stage-in');
    void body.offsetWidth;
    body.classList.add('is-stage-in');
    body.scrollTop = 0;
  }

  function render(){
    var title = document.getElementById('bibleStairTitle');
    if (title) title.textContent = titleOf(state.mode);
    renderSteps();
    renderBody();
  }

  function setStage(next){
    state.stage = next;
    render();
  }

  function close(){
    var overlay = document.getElementById('bibleStairOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('bible-stair-lock');
    document.removeEventListener('keydown', onKey, true);
    overlay.hidden = true;
    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    lastFocus = null;
  }

  function onKey(e){
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function goReader(verse){
    var href = readerHref(state.bookName, state.chapter, verse);
    close();
    window.location.href = href;
  }

  function bind(){
    if (bound) return;
    var overlay = ensure();
    bound = true;
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) close();
    });
    overlay.addEventListener('click', function(e){
      var back = e.target && e.target.closest ? e.target.closest('[data-stair-back]') : null;
      var book = e.target && e.target.closest ? e.target.closest('[data-stair-book]') : null;
      var chapter = e.target && e.target.closest ? e.target.closest('[data-stair-chapter]') : null;
      var verse = e.target && e.target.closest ? e.target.closest('[data-stair-verse]') : null;
      if (back) {
        if (back.getAttribute('data-stair-back') === 'book') {
          state.chapter = 0;
          setStage('book');
        } else {
          setStage('chapter');
        }
        return;
      }
      if (book) {
        state.bookName = book.getAttribute('data-stair-book') || '';
        var picked = bookByName(state.bookName);
        if (picked && picked.testament) state.mode = picked.testament === 'new' ? 'new' : 'old';
        state.chapter = 0;
        setStage('chapter');
        return;
      }
      if (chapter) {
        state.chapter = parseInt(chapter.getAttribute('data-stair-chapter'), 10) || 0;
        if (state.chapter < 1) return;
        /* Home path: chapter tap goes to Reader at verse 1. Verse-stage code stays unused. */
        goReader(1);
        return;
      }
      if (verse) {
        goReader(parseInt(verse.getAttribute('data-stair-verse'), 10) || 1);
      }
    });
  }

  function open(modeOrOpts){
    var opts = (modeOrOpts && typeof modeOrOpts === 'object') ? modeOrOpts : { mode: modeOrOpts };
    var found;
    bind();
    lastFocus = document.activeElement;
    state.catalog = opts.catalog === 'all' ? 'all' : (opts.mode === 'new' ? 'new' : 'old');
    state.mode = opts.mode === 'new' ? 'new' : 'old';
    state.bookName = String(opts.bookName || '').trim();
    if (state.bookName) {
      found = bookByName(state.bookName);
      if (found && found.testament) state.mode = found.testament === 'new' ? 'new' : 'old';
    }
    state.stage = (opts.stage === 'chapter' && state.bookName) ? 'chapter' : 'book';
    state.chapter = 0;
    var overlay = ensure();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    render();
    document.documentElement.classList.add('bible-stair-lock');
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function(){
      overlay.classList.add('is-open');
      var panel = document.getElementById('bibleStairPanel');
      if (panel) {
        try { panel.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    });
  }

  window.openBibleStairPicker = open;
  window.closeBibleStairPicker = close;
})();
