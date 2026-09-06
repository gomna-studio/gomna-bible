/* Home/쉬운찾기 책→장 stair picker. */
(function(){
  'use strict';

  var state = { mode: 'old', catalog: 'old', stage: 'book', bookName: '', chapter: 0, layout: '' };
  var bound = false;
  var lastFocus = null;
  var OT_EXPLORE_GROUPS = [
    { id: 'pentateuch', title: '모세오경', names: ['창세기', '출애굽기', '레위기', '민수기', '신명기'] },
    { id: 'history', title: '역사서', names: ['여호수아', '사사기', '룻기', '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더'] },
    { id: 'wisdom', title: '시가서', names: ['욥기', '시편', '잠언', '전도서', '아가'] },
    { id: 'major', title: '대선지서', names: ['이사야', '예레미야', '예레미야애가', '에스겔', '다니엘'] },
    { id: 'minor', title: '소선지서', names: ['호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기'] }
  ];
  var NT_EXPLORE_GROUPS = [
    { id: 'gospel', title: '복음서', names: ['마태복음', '마가복음', '누가복음', '요한복음'] },
    { id: 'history', title: '역사서', names: ['사도행전'] },
    { id: 'paul', title: '바울서신', names: ['로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서'] },
    { id: 'general', title: '공동서신', names: ['야고보서', '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서'] },
    { id: 'prophecy', title: '예언서', names: ['요한계시록'] }
  ];

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

  function isExplore(){
    return state.layout === 'explore';
  }

  function titleOf(mode){
    if (isExplore() && state.stage === 'chapter' && state.bookName) return state.bookName;
    if (isExplore() && state.catalog === 'all' && state.stage === 'book') return '성경 66권';
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

  function exploreGroupsOf(mode){
    return mode === 'new' ? NT_EXPLORE_GROUPS : OT_EXPLORE_GROUPS;
  }

  function booksForExplore(mode){
    return allBooks().filter(function(b){ return b && b.testament === (mode === 'new' ? 'new' : 'old'); });
  }

  function groupedExploreBooks(mode){
    var available = {};
    var leftover = [];
    var used = {};
    var groups = [];
    booksForExplore(mode).forEach(function(b){
      if (b && b.name) available[b.name] = b;
    });
    exploreGroupsOf(mode).forEach(function(g){
      var books = [];
      g.names.forEach(function(name){
        if (available[name]) {
          books.push(available[name]);
          used[name] = true;
        }
      });
      if (books.length) groups.push({ id: g.id, title: g.title, books: books });
    });
    Object.keys(available).forEach(function(name){
      if (!used[name]) leftover.push(available[name]);
    });
    if (leftover.length) groups.push({ id: 'more', title: '그 외', books: leftover });
    return groups;
  }

  function bookButtonHtml(b){
    var cur = b.name === state.bookName ? ' is-cur' : '';
    return '<button type="button" class="bible-explore-book' + cur + '" data-stair-book="' + esc(b.name) + '">'
      + esc(b.name) + '</button>';
  }

  function ensure(){
    var overlay = document.getElementById('bibleStairOverlay');
    if (overlay) {
      if (!document.getElementById('bibleStairClose')) upgradeHead(overlay);
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = 'bibleStairOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bibleStairTitle');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.innerHTML = ''
      + '<div class="bible-stair-panel" id="bibleStairPanel" tabindex="-1">'
      +   '<div class="bible-stair-head" id="bibleStairHead">'
      +     '<div class="bible-stair-head-copy">'
      +       '<h2 class="bible-stair-title" id="bibleStairTitle">구약성경</h2>'
      +       '<p class="bible-stair-kicker" id="bibleStairKicker" hidden>원하는 책을 선택하세요</p>'
      +     '</div>'
      +     '<button type="button" class="bible-stair-close" id="bibleStairClose" data-stair-close="1" aria-label="닫기">×</button>'
      +   '</div>'
      +   '<div id="bibleStairSteps" hidden></div>'
      +   '<div id="bibleStairBody"></div>'
      + '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function upgradeHead(overlay){
    var panel = overlay.querySelector('#bibleStairPanel');
    var title = overlay.querySelector('#bibleStairTitle');
    if (!panel || !title || title.closest('#bibleStairHead')) return;
    var head = document.createElement('div');
    head.className = 'bible-stair-head';
    head.id = 'bibleStairHead';
    var copy = document.createElement('div');
    copy.className = 'bible-stair-head-copy';
    var kicker = document.createElement('p');
    kicker.className = 'bible-stair-kicker';
    kicker.id = 'bibleStairKicker';
    kicker.hidden = true;
    kicker.textContent = '원하는 책을 선택하세요';
    panel.insertBefore(head, title);
    copy.appendChild(title);
    copy.appendChild(kicker);
    head.appendChild(copy);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'bible-stair-close';
    closeBtn.id = 'bibleStairClose';
    closeBtn.setAttribute('data-stair-close', '1');
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '×';
    head.appendChild(closeBtn);
  }

  function syncExploreChrome(overlay){
    var kicker = document.getElementById('bibleStairKicker');
    if (overlay) overlay.classList.toggle('is-explore', isExplore());
    if (kicker) {
      kicker.hidden = !(isExplore() && state.stage === 'book');
      kicker.textContent = state.catalog === 'all' ? '창세기부터 요한계시록까지' : '원하는 책을 선택하세요';
    }
  }

  function renderSteps(){
    var host = document.getElementById('bibleStairSteps');
    if (!host) return;
    var html = '';
    if (isExplore() && state.stage === 'chapter' && state.bookName) {
      html += '<button type="button" class="bible-explore-back" data-stair-back="book">← '
        + (state.catalog === 'all' ? '성경 66권' : (state.mode === 'new' ? '신약성경' : '구약성경')) + '</button>';
    } else if (!isExplore() && state.bookName) {
      html += '<button type="button" class="bible-stair-step is-selected-book" id="bibleStairStepBook" data-stair-back="book">'
        + esc(state.bookName) + '</button>';
    }
    if (!isExplore() && state.bookName && state.chapter && state.stage === 'verse') {
      html += '<button type="button" class="bible-stair-step" id="bibleStairStepChapter" data-stair-back="chapter">'
        + esc(state.chapter + chapterUnit(state.bookName)) + '</button>';
    }
    host.innerHTML = html;
    host.hidden = !html;
  }

  function renderExploreGroupsHtml(mode){
    var html = '';
    groupedExploreBooks(mode).forEach(function(group){
      html += '<section class="bible-explore-group" data-explore-group="' + esc(group.id) + '">';
      html += '<h3 class="bible-explore-label">' + esc(group.title) + '</h3>';
      html += '<div class="bible-explore-grid">';
      group.books.forEach(function(b){ html += bookButtonHtml(b); });
      html += '</div></section>';
    });
    return html;
  }

  function renderExploreAllBookBody(){
    var html = '<div class="bible-explore is-all" id="bibleStairBookGrid">';
    html += '<section class="bible-explore-testament" data-explore-testament="old">';
    html += '<h2 class="bible-explore-testament-label">구약성경</h2>';
    html += renderExploreGroupsHtml('old');
    html += '</section>';
    html += '<section class="bible-explore-testament" data-explore-testament="new">';
    html += '<h2 class="bible-explore-testament-label">신약성경</h2>';
    html += renderExploreGroupsHtml('new');
    html += '</section>';
    html += '</div>';
    return html;
  }

  function renderExploreSwitchHtml(){
    if (state.catalog === 'all') return '';
    if (state.mode === 'old') {
      return '<div class="bible-explore-switch-wrap">'
        + '<button type="button" class="bible-explore-switch" data-stair-switch="new">신약으로 가기 →</button>'
        + '</div>';
    }
    if (state.mode === 'new') {
      return '<div class="bible-explore-switch-wrap">'
        + '<button type="button" class="bible-explore-switch" data-stair-switch="old">← 구약으로 가기</button>'
        + '</div>';
    }
    return '';
  }

  function renderExploreBookBody(){
    if (state.catalog === 'all') return renderExploreAllBookBody();
    var html = '<div class="bible-explore" id="bibleStairBookGrid">';
    html += renderExploreGroupsHtml(state.mode);
    html += '</div>';
    html += renderExploreSwitchHtml();
    return html;
  }

  function renderBody(){
    var body = document.getElementById('bibleStairBody');
    if (!body) return;
    var html = '';
    var i;
    var n;
    if (state.stage === 'book') {
      if (isExplore()) {
        html = renderExploreBookBody();
      } else {
        html += '<div class="bible-stair-books" id="bibleStairBookGrid">';
        booksOf(state.mode).forEach(function(b){
          var cur = b.name === state.bookName ? ' is-cur' : '';
          html += '<button type="button" class="bible-stair-item' + cur + '" data-stair-book="' + esc(b.name) + '">'
            + esc(b.name) + '</button>';
        });
        html += '</div>';
      }
    } else if (state.stage === 'chapter') {
      n = chapterCountOf(state.bookName);
      html += '<div class="bible-stair-nums' + (isExplore() ? ' is-explore-nums' : '') + '" id="bibleStairChapterGrid">';
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
    var overlay = document.getElementById('bibleStairOverlay');
    if (title) title.textContent = titleOf(state.mode);
    syncExploreChrome(overlay);
    renderSteps();
    renderBody();
  }

  function setStage(next){
    state.stage = next;
    render();
  }

  function switchExploreTestament(mode){
    if (!isExplore()) return;
    state.mode = mode === 'new' ? 'new' : 'old';
    state.catalog = state.mode;
    state.stage = 'book';
    state.bookName = '';
    state.chapter = 0;
    render();
  }

  function close(){
    var overlay = document.getElementById('bibleStairOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    overlay.classList.remove('is-explore');
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
    if (typeof window.navigateFromHomeBiblePicker === 'function' &&
        window.navigateFromHomeBiblePicker(state.bookName, state.chapter, verse, state.mode)) {
      return;
    }
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
      var closer = e.target && e.target.closest ? e.target.closest('[data-stair-close]') : null;
      var back = e.target && e.target.closest ? e.target.closest('[data-stair-back]') : null;
      var switcher = e.target && e.target.closest ? e.target.closest('[data-stair-switch]') : null;
      var book = e.target && e.target.closest ? e.target.closest('[data-stair-book]') : null;
      var chapter = e.target && e.target.closest ? e.target.closest('[data-stair-chapter]') : null;
      var verse = e.target && e.target.closest ? e.target.closest('[data-stair-verse]') : null;
      if (closer) {
        close();
        return;
      }
      if (switcher) {
        switchExploreTestament(switcher.getAttribute('data-stair-switch'));
        return;
      }
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
    state.layout = opts.layout === 'explore' ? 'explore' : '';
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
  window.GomnaBibleExploreGroups = {
    old: OT_EXPLORE_GROUPS,
    new: NT_EXPLORE_GROUPS,
    get: function(mode){ return mode === 'new' ? NT_EXPLORE_GROUPS : OT_EXPLORE_GROUPS; }
  };
})();
