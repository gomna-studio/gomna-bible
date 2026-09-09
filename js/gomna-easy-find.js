/* 쉬운찾기 1차 시안. 새 검색 엔진·새 저장 체계·공용 선택창 UI 변경 없음. */
(function (global) {
  'use strict';

  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var GROUPS = [
    { id: 'begin', title: '성경의 시작', hint: '모세오경', keys: ['pentateuch'], tile: 'wide' },
    { id: 'history', title: '역사 이야기', hint: '역사서', keys: ['history_ot'], tile: 'mid' },
    { id: 'wisdom', title: '시와 지혜', hint: '시가서', keys: ['wisdom'], tile: 'mid' },
    { id: 'gospel', title: '예수님의 생애', hint: '복음서', keys: ['gospels'], tile: 'wide' },
    { id: 'church', title: '교회와 편지', hint: '사도행전·서신서', keys: ['acts', 'pauline', 'general_epistles'], tile: 'tall' },
    { id: 'prophet', title: '예언과 계시', hint: '선지서·계시록', keys: ['major_prophets', 'minor_prophets', 'revelation'], tile: 'tall' }
  ];

  /* 홈 검색 칩 + 상황별 주제 페이지 범위. 클릭은 기존 openWordSearch를 재사용한다.
     face: ribbon | tall | inset | stack | bleed | split | quiet
     순서는 CSS dense 그리드 리듬용: 와이드 → 세로강조+소형 → 쌍 → 와이드 → 쌍 → 일반+소형 → 와이드. */
  var TOPICS = [
    { id: 'love', title: '사랑', query: '사랑', face: 'ribbon' },
    { id: 'prayer', title: '기도', query: '기도', face: 'tall' },
    { id: 'peace', title: '평안', query: '평안', face: 'inset' },
    { id: 'thanks', title: '감사', query: '감사', face: 'quiet' },
    { id: 'heal', title: '치유', query: '고치', face: 'split' },
    { id: 'comfort', title: '위로', query: '위로', face: 'inset' },
    { id: 'family', title: '가족', query: '자녀', face: 'ribbon' },
    { id: 'fear', title: '두려움', query: '두려워', face: 'stack' },
    { id: 'grief', title: '상실', query: '상심', face: 'bleed' },
    { id: 'wisdom', title: '지혜', query: '지혜', face: 'inset' },
    { id: 'faith', title: '믿음', query: '믿음', face: 'quiet' },
    { id: 'hope', title: '소망', query: '소망', face: 'quiet' },
    { id: 'begin', title: '새출발', query: '새 일', face: 'ribbon' }
  ];

  var state = {
    panel: 'home',
    query: '',
    bodyVisible: 30,
    topicId: '',
    scopeTestament: 'all',
    scopeGroup: '',
    scopeBook: '',
    scopeChapter: 0,
    biblePath: '',
    biblePanelOpen: false
  };
  var homeScrollTop = 0;
  var scopeUi = {
    flow: '',
    step: '',
    testament: '',
    groupId: '',
    bookName: ''
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function books() {
    return typeof getAllBooks === 'function' ? getAllBooks() : [];
  }

  function topicById(id) {
    var i;
    for (i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].id === id) return TOPICS[i];
    }
    return null;
  }

  function topicFromQuery(query) {
    var q = String(query || '').trim();
    var i;
    if (!q) return null;
    for (i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].query === q || TOPICS[i].title === q) return TOPICS[i];
    }
    return null;
  }

  function scriptureGroups(testament) {
    var api = global.GomnaBibleExploreGroups;
    var mode = testament === 'new' ? 'new' : 'old';
    if (api && typeof api.get === 'function') {
      try { return api.get(mode) || []; } catch (e) { return []; }
    }
    if (api && api[mode]) return api[mode];
    return [];
  }

  function bibleScopeIsAll() {
    return state.scopeTestament === 'all' && !state.scopeGroup && !state.scopeBook && !state.scopeChapter;
  }

  function bibleFilterOn() {
    return !!state.biblePath || !bibleScopeIsAll();
  }

  function clearBibleScope() {
    state.scopeTestament = 'all';
    state.scopeGroup = '';
    state.scopeBook = '';
    state.scopeChapter = 0;
    state.biblePath = '';
  }

  function resetTopicScope() {
    state.topicId = '';
    state.biblePanelOpen = false;
    clearBibleScope();
    closeScopePopup();
  }

  function groupById(testament, id) {
    var groups = scriptureGroups(testament);
    var i;
    for (i = 0; i < groups.length; i++) {
      if (groups[i].id === id) return groups[i];
    }
    return null;
  }

  function booksFromNames(names) {
    var map = {};
    var out = [];
    books().forEach(function (b) { map[b.name] = b; });
    (names || []).forEach(function (n) {
      if (map[n]) out.push(map[n]);
      else out.push({ name: n, chapters: 0 });
    });
    return out;
  }

  function chapterUnitOf(bookName) {
    try {
      if (typeof getChapterUnit === 'function') return getChapterUnit(bookName);
    } catch (e) { /* ignore */ }
    return '장';
  }

  function initialOf(ch) {
    if (!ch) return '';
    if (typeof getInitialConsonant === 'function') {
      var c = getInitialConsonant(ch);
      if (c === 'ㄲ') return 'ㄱ';
      if (c === 'ㄸ') return 'ㄷ';
      if (c === 'ㅃ') return 'ㅂ';
      if (c === 'ㅆ') return 'ㅅ';
      if (c === 'ㅉ') return 'ㅈ';
      return c;
    }
    var code = ch.charCodeAt(0) - 44032;
    if (code < 0 || code > 11171) {
      if (CHO.indexOf(ch) >= 0) {
        if (ch === 'ㄲ') return 'ㄱ';
        if (ch === 'ㄸ') return 'ㄷ';
        if (ch === 'ㅃ') return 'ㅂ';
        if (ch === 'ㅆ') return 'ㅅ';
        if (ch === 'ㅉ') return 'ㅈ';
        return ch;
      }
      return '';
    }
    var raw = CHO[Math.floor(code / 588)];
    if (raw === 'ㄲ') return 'ㄱ';
    if (raw === 'ㄸ') return 'ㄷ';
    if (raw === 'ㅃ') return 'ㅂ';
    if (raw === 'ㅆ') return 'ㅅ';
    if (raw === 'ㅉ') return 'ㅈ';
    return raw;
  }

  function bookInitials(name) {
    return String(name || '').split('').map(initialOf).join('');
  }

  function isJamoQuery(q) {
    var t = String(q || '').replace(/\s+/g, '');
    if (!t) return false;
    for (var i = 0; i < t.length; i++) {
      if (CHO.indexOf(t.charAt(i)) < 0) return false;
    }
    return true;
  }

  function compact(s) {
    return String(s || '').replace(/\s+/g, '');
  }

  function readExistingJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeStoredPlace(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var bookName = raw.bookName || raw.book;
    var chapter = parseInt(raw.chapter, 10);
    var verse = parseInt(raw.verse, 10);
    var ts = Number(raw.timestamp);
    if (!bookName || typeof bookName !== 'string') return null;
    if (isNaN(chapter) || chapter < 1) return null;
    if (isNaN(verse) || verse < 1) verse = 1;
    if (isNaN(ts) || ts <= 0) ts = 0;
    return { bookName: String(bookName), chapter: chapter, verse: verse, timestamp: ts };
  }

  function isValidTs(ts) {
    var n = Number(ts);
    var d;
    if (ts == null || ts === '' || isNaN(n) || n <= 0) return false;
    d = new Date(n);
    return !isNaN(d.getTime());
  }

  function rawResumeTimestamp(keys, fallback) {
    var i;
    var raw;
    for (i = 0; i < keys.length; i++) {
      raw = readExistingJson(keys[i]);
      if (!raw || typeof raw !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(raw, 'timestamp') || Object.prototype.hasOwnProperty.call(raw, 'savedAt')) {
        if (isValidTs(raw.timestamp)) return Number(raw.timestamp);
        if (raw.savedAt) {
          var parsed = Date.parse(raw.savedAt);
          if (isValidTs(parsed)) return parsed;
        }
        return 0;
      }
    }
    return isValidTs(fallback) ? Number(fallback) : 0;
  }

  function listenFromLegacyAudio() {
    var session = readExistingJson('gomna_audio_bible_resume_v1');
    var api = global.GOMNA_HOME_RESUME;
    var parts = null;
    var bookName = '';
    var ts = 0;
    if (!session || !session.currentAudioId) return null;
    if (api && typeof api.parseBibleAudioId === 'function') {
      try { parts = api.parseBibleAudioId(session.currentAudioId); } catch (e) { parts = null; }
    }
    if (api && typeof api.bookNameFromAudioId === 'function') {
      try { bookName = api.bookNameFromAudioId(session.currentAudioId) || ''; } catch (e2) { bookName = ''; }
    }
    if (!parts) {
      var m = String(session.currentAudioId).match(/^([^.]+)\.(\d{3})\.(\d{3})/);
      if (m) {
        parts = { bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
        if (!bookName && global.GomnaBibleRef && typeof global.GomnaBibleRef.getKoreanBookName === 'function') {
          bookName = global.GomnaBibleRef.getKoreanBookName(parts.bookId) || '';
        }
      }
    }
    if (!parts || !bookName) return null;
    if (session.savedAt) ts = Date.parse(session.savedAt);
    return normalizeStoredPlace({
      bookName: bookName,
      chapter: parts.chapter,
      verse: parts.verse,
      timestamp: isValidTs(ts) ? ts : 0
    });
  }

  function resumeRead() {
    var api = global.GOMNA_HOME_RESUME;
    var entry = null;
    if (api && typeof api.getRead === 'function') {
      try { entry = api.getRead(); } catch (e) { entry = null; }
    }
    if (!entry) {
      entry = normalizeStoredPlace(readExistingJson('gomna_resume_read_v1'))
        || normalizeStoredPlace(readExistingJson('gomna_last_read'));
    }
    if (!entry) return null;
    entry = {
      bookName: entry.bookName,
      chapter: entry.chapter,
      verse: entry.verse || 1,
      timestamp: rawResumeTimestamp(['gomna_resume_read_v1', 'gomna_last_read'], entry.timestamp)
    };
    return entry;
  }

  function resumeListen() {
    var api = global.GOMNA_HOME_RESUME;
    var entry = null;
    if (api && typeof api.getListen === 'function') {
      try { entry = api.getListen(); } catch (e) { entry = null; }
    }
    if (!entry) {
      entry = normalizeStoredPlace(readExistingJson('gomna_resume_listen_v1')) || listenFromLegacyAudio();
    }
    if (!entry) return null;
    entry = {
      bookName: entry.bookName,
      chapter: entry.chapter,
      verse: entry.verse || 1,
      timestamp: rawResumeTimestamp(['gomna_resume_listen_v1', 'gomna_audio_bible_resume_v1'], entry.timestamp)
    };
    return entry;
  }

  function formatPlace(entry) {
    if (!entry || !entry.bookName || !entry.chapter) return '';
    var verse = parseInt(entry.verse, 10);
    if (isNaN(verse) || verse < 1) verse = 1;
    return entry.bookName + ' ' + entry.chapter + ':' + verse;
  }

  function formatResumeWhen(ts, kind) {
    var d;
    var now;
    var today;
    var that;
    var diff;
    var verb = kind === 'listen' ? '들음' : '읽음';
    if (!isValidTs(ts)) return '';
    d = new Date(Number(ts));
    now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    diff = Math.round((today - that) / 86400000);
    if (diff <= 0) return '오늘 ' + verb;
    if (diff === 1) return '어제 ' + verb;
    if (diff >= 2 && diff <= 7) return diff + '일 전 ' + verb;
    if (d.getFullYear() === now.getFullYear()) {
      return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + verb;
    }
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + verb;
  }

  function openResumeRead() {
    var api = global.GOMNA_HOME_RESUME;
    var entry;
    if (api && typeof api.openRead === 'function') {
      api.openRead();
      return;
    }
    entry = resumeRead();
    if (!entry) return;
    window.location.href = 'reader.html?book=' + encodeURIComponent(entry.bookName)
      + '&chapter=' + encodeURIComponent(entry.chapter)
      + '&verse=' + encodeURIComponent(entry.verse || 1)
      + '&source=home-resume-read';
  }

  function openResumeListen() {
    var api = global.GOMNA_HOME_RESUME;
    var entry;
    if (api && typeof api.openListen === 'function') {
      api.openListen();
      return;
    }
    entry = resumeListen();
    if (!entry) {
      window.location.href = 'reader.html?book=' + encodeURIComponent('창세기')
        + '&chapter=1&verse=1&source=home-resume-listen';
      return;
    }
    window.location.href = 'reader.html?book=' + encodeURIComponent(entry.bookName)
      + '&chapter=' + encodeURIComponent(entry.chapter)
      + '&verse=' + encodeURIComponent(entry.verse || 1)
      + '&source=home-resume-listen';
  }

  function parseRef(query) {
    var q = String(query || '').trim();
    var ref;
    var searchRef;
    if (!q) return null;
    if (global.GomnaBibleRef && typeof global.GomnaBibleRef.parseBibleReference === 'function') {
      try { ref = global.GomnaBibleRef.parseBibleReference(q); } catch (e) { ref = null; }
      if (ref && ref.ok && (ref.koBookName || ref.bookId)) {
        return {
          book: ref.koBookName || (typeof global.GomnaBibleRef.getKoreanBookName === 'function'
            ? global.GomnaBibleRef.getKoreanBookName(ref.bookId) : ''),
          chapter: ref.chapter,
          verse: ref.verse || ref.verseStart || 1
        };
      }
    }
    if (global.GomnaBibleSearch && typeof global.GomnaBibleSearch.parseReference === 'function') {
      try { searchRef = global.GomnaBibleSearch.parseReference(q); } catch (e2) { searchRef = null; }
      if (searchRef && searchRef.book) return searchRef;
    }
    return null;
  }

  function matchBooks(query) {
    var q = String(query || '').trim();
    var all = books();
    var cq = compact(q);
    var out = [];
    if (!q || !all.length) return out;
    if (isJamoQuery(q)) {
      all.forEach(function (b) {
        var ini = bookInitials(b.name);
        if (ini === cq || ini.indexOf(cq) === 0) out.push(b);
      });
      return out;
    }
    all.forEach(function (b) {
      if (compact(b.name).indexOf(cq) !== -1) out.push(b);
    });
    return out;
  }

  function booksByGroup(id) {
    var group = null;
    var names = [];
    var seen = {};
    var i;
    var k;
    var got;
    for (i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].id === id) { group = GROUPS[i]; break; }
    }
    if (!group) return [];
    if (global.GomnaBibleCategories && typeof global.GomnaBibleCategories.getBooks === 'function') {
      for (k = 0; k < group.keys.length; k++) {
        got = global.GomnaBibleCategories.getBooks(group.keys[k]) || [];
        got.forEach(function (n) {
          if (!seen[n]) { seen[n] = 1; names.push(n); }
        });
      }
    }
    return books().filter(function (b) { return seen[b.name]; });
  }

  function openChapterPicker(book) {
    if (!book || !book.name) return;
    if (typeof global.openBibleStairPicker !== 'function') return;
    global.openBibleStairPicker({
      mode: book.testament === 'new' ? 'new' : 'old',
      bookName: book.name,
      stage: 'chapter'
    });
  }

  function openStairBookList(mode) {
    if (typeof global.openBibleStairPicker !== 'function') return;
    global.openBibleStairPicker({
      mode: mode === 'new' ? 'new' : 'old',
      layout: 'explore'
    });
  }

  function openStairAllBooks() {
    if (typeof global.openBibleStairPicker !== 'function') return;
    global.openBibleStairPicker({ catalog: 'all', stage: 'book', layout: 'explore' });
  }

  function openPlace(entry) {
    var bookName = entry && (entry.bookName || entry.book);
    var book = null;
    var tst;
    if (!bookName || !entry.chapter) return;
    books().forEach(function (b) { if (b.name === bookName) book = b; });
    tst = (book && book.testament) || 'old';
    if (typeof goToVerse === 'function') {
      goToVerse(bookName, entry.chapter, entry.verse || 1, tst);
    }
  }

  function syncLegacySearchInputs(query) {
    var oldInput = document.getElementById('searchInput');
    var newInput = document.getElementById('searchInputReader');
    if (oldInput) oldInput.value = query;
    if (newInput) newInput.value = query;
  }

  function collectWordHits(query) {
    var topic = [];
    var faith = [];
    var body = [];
    if (typeof searchTopicResults === 'function') {
      try { topic = searchTopicResults(query) || []; } catch (e) { topic = []; }
    }
    if (global.GomnaBibleSearch) {
      if (typeof global.GomnaBibleSearch.buildIndex === 'function'
        && typeof oldTestamentData !== 'undefined'
        && typeof newTestamentData !== 'undefined') {
        try { global.GomnaBibleSearch.buildIndex(oldTestamentData, newTestamentData); } catch (e2) {}
      }
      if (typeof global.GomnaBibleSearch.searchFaithResources === 'function') {
        try { faith = global.GomnaBibleSearch.searchFaithResources(query) || []; } catch (e3) { faith = []; }
      }
      if (typeof global.GomnaBibleSearch.searchBody === 'function') {
        try {
          body = global.GomnaBibleSearch.shouldUseLordPrayerBodyResults
            && global.GomnaBibleSearch.shouldUseLordPrayerBodyResults(query)
            ? (global.GomnaBibleSearch.getLordPrayerBodyResults() || [])
            : (global.GomnaBibleSearch.searchBody(query) || []);
        } catch (e4) { body = []; }
      }
    }
    return { topic: topic, faith: faith, body: body };
  }

  function mergeVerseHits(topic, body) {
    var seen = {};
    var out = [];
    function add(r) {
      var key;
      if (!r || !r.book || !r.chapter) return;
      key = r.book + '|' + r.chapter + '|' + (r.verse || 1);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(r);
    }
    (body || []).forEach(add);
    (topic || []).forEach(add);
    return out;
  }

  function verseCardHtml(r, query) {
    var highlighted = '';
    if (global.GomnaBibleSearch && typeof global.GomnaBibleSearch.highlightText === 'function') {
      highlighted = global.GomnaBibleSearch.highlightText(r.text, query, r.matchType);
    } else {
      highlighted = esc(r.text || '');
    }
    return '<button type="button" class="easy-find-verse" data-easy-go="1" data-book="' + esc(r.book) + '" data-chapter="' + esc(String(r.chapter)) + '" data-verse="' + esc(String(r.verse || 1)) + '" data-testament="' + esc(r.testament || 'old') + '">'
      + '<span class="easy-find-verse-ref">' + esc(r.ref || (r.book + ' ' + r.chapter + ':' + (r.verse || 1))) + '</span>'
      + '<span class="easy-find-verse-text">' + highlighted + '</span>'
      + '</button>';
  }

  function captureHomeScroll() {
    var scroll = document.getElementById('easyFindScroll');
    if (scroll) homeScrollTop = scroll.scrollTop || 0;
  }

  function setSearchActive(on) {
    var view = document.getElementById('easyView');
    var closeBtn = document.getElementById('readerDockTopClose');
    if (view) view.classList.toggle('easy-find-search-active', !!on);
    if (closeBtn && view && view.classList.contains('active')) {
      closeBtn.setAttribute('aria-label', on ? '찾기로' : '홈으로');
    }
  }

  function closeScopePopup() {
    var overlay = document.getElementById('easyFindScopeOverlay');
    if (overlay) overlay.hidden = true;
  }

  function bookInScope(bookName) {
    var name = String(bookName || '');
    var book = null;
    var group;
    if (!name) return false;
    if (state.scopeBook) return name === state.scopeBook;
    if (state.scopeGroup) {
      group = groupById(state.scopeTestament === 'new' ? 'new' : 'old', state.scopeGroup);
      return !!(group && (group.names || []).indexOf(name) >= 0);
    }
    if (state.scopeTestament === 'all') return true;
    books().forEach(function (b) { if (b.name === name) book = b; });
    if (!book) return false;
    return book.testament === state.scopeTestament;
  }

  function verseInScope(row) {
    if (!row || !bookInScope(row.book)) return false;
    if (state.scopeChapter) return Number(row.chapter) === Number(state.scopeChapter);
    return true;
  }

  function relatedInScope(row) {
    if (!row || !row.book) return false;
    return verseInScope({ book: row.book, chapter: row.chapter });
  }

  function faithInScope(card) {
    var rv;
    if (bibleScopeIsAll()) return true;
    if (!card) return false;
    rv = card.relatedVerse;
    if (rv && rv.book) return relatedInScope(rv);
    if (card.relatedVerses && card.relatedVerses.length) {
      return card.relatedVerses.some(relatedInScope);
    }
    return false;
  }

  function applyTopic(query, opts) {
    var topic = topicById(query) || topicFromQuery(query);
    var q = topic ? topic.query : String(query || '').trim();
    var input = document.getElementById('easyFindSearchInput');
    if (!q) return;
    if (opts && opts.resetScope) {
      state.biblePanelOpen = false;
      clearBibleScope();
      closeScopePopup();
    } else {
      state.biblePanelOpen = false;
    }
    state.topicId = topic ? topic.id : '';
    syncLegacySearchInputs(q);
    if (input) input.value = q;
    state.query = q;
    state.bodyVisible = 30;
    renderSearchResults(q);
  }

  function closeSearchToHome() {
    var view = document.getElementById('easyView');
    var input;
    if (!view || !view.classList.contains('active')) return false;
    if (!view.classList.contains('easy-find-search-active') && !String(state.query || '').trim()) return false;
    input = document.getElementById('easyFindSearchInput');
    if (input) input.value = '';
    state.query = '';
    state.bodyVisible = 30;
    resetTopicScope();
    renderSearchResults('', { restoreScroll: homeScrollTop });
    if (typeof syncScriptureDockActive === 'function') {
      try { syncScriptureDockActive('find'); } catch (eDock) { /* ignore */ }
    }
    return true;
  }

  function openWordSearch(query) {
    applyTopic(query, { resetScope: true });
  }

  function bookButtons(list) {
    if (!list.length) return '<div class="easy-find-empty">해당하는 책이 없습니다</div>';
    return '<div class="easy-find-books">' + list.map(function (b) {
      return '<button type="button" class="easy-find-book" data-easy-book="' + esc(b.name) + '">'
        + '<span class="easy-find-book-name">' + esc(b.name) + '</span>'
        + '<span class="easy-find-book-meta">' + esc(String(b.chapters || '') + chapterUnit(b.name)) + '</span>'
        + '</button>';
    }).join('') + '</div>';
  }

  var READ_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.8v13.6"/><path d="M12 5.8C10.5 4.9 8.6 4.4 6.7 4.4 5 4.4 3.4 4.9 2.2 5.7v12.8c1.2-.8 2.8-1.3 4.5-1.3 1.9 0 3.8.5 5.3 1.4"/><path d="M12 5.8C13.5 4.9 15.4 4.4 17.3 4.4c1.7 0 3.3.5 4.5 1.3v12.8c-1.2-.8-2.8-1.3-4.5-1.3-1.9 0-3.8.5-5.3 1.4"/></svg>';
  var LISTEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17.2v-5.4a8 8 0 0116 0v5.4"/><path d="M20 17.6a1.8 1.8 0 01-1.8 1.8h-.8A1.8 1.8 0 0115.6 17.6v-2.4A1.8 1.8 0 0117.4 13.4H20zM4 17.6A1.8 1.8 0 005.8 19.4h.8A1.8 1.8 0 008.4 17.6v-2.4A1.8 1.8 0 006.6 13.4H4z"/></svg>';
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><circle cx="10.5" cy="10.5" r="6.2"/><path d="M14.88 14.88L20.2 20.2"/></svg>';

  function resumeRowHtml(kind, entry) {
    var when = formatResumeWhen(entry && entry.timestamp, kind);
    var isListen = kind === 'listen';
    var place = formatPlace(entry);
    return '<button type="button" class="easy-find-resume-row" data-easy-resume="' + (isListen ? 'listen' : 'read') + '" aria-label="' + esc(place) + (isListen ? ' 이어서 듣기' : ' 이어서 읽기') + '">'
      + '<span class="easy-find-resume-kind" aria-hidden="true">' + (isListen ? LISTEN_ICON : READ_ICON) + '</span>'
      + '<span class="easy-find-resume-main">'
      + '<span class="easy-find-resume-place">' + esc(place) + '</span>'
      + (when ? '<span class="easy-find-resume-when">' + esc(when) + '</span>' : '')
      + '</span>'
      + '<span class="easy-find-resume-cta">' + (isListen ? '계속 듣기 →' : '계속 읽기 →') + '</span>'
      + '</button>';
  }

  function resumeHtml() {
    var read = resumeRead();
    var listen = resumeListen();
    var rows = '';
    if (!read && !listen) return '';
    if (read) rows += resumeRowHtml('read', read);
    if (listen) rows += resumeRowHtml('listen', listen);
    return '<section class="easy-find-section easy-find-resume" id="easyFindResume">'
      + '<h3 class="easy-find-section-title">이어서 하기</h3>'
      + '<div class="easy-find-resume-card">' + rows + '</div>'
      + '</section>';
  }

  function homeHtml() {
    var recent = resumeHtml();
    return '<div class="easy-find-panel" data-easy-panel="home">'
      + '<div class="easy-find-fixed" id="easyFindFixed">'
      + '<div class="easy-find-search">'
      + '<label class="easy-find-search-field" for="easyFindSearchInput">'
      + '<span class="easy-find-search-icon" aria-hidden="true">' + SEARCH_ICON + '</span>'
      + '<input id="easyFindSearchInput" class="easy-find-search-input" type="search" placeholder="무엇을 찾고 계세요?" aria-label="무엇을 찾고 계세요?" autocomplete="off" spellcheck="false">'
      + '<button type="button" class="easy-find-search-clear" data-easy-clear="1" hidden aria-label="검색어 지우기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>'
      + '</label>'
      + '</div>'
      + '<div class="easy-find-filter" id="easyFindFilter" hidden>'
      + '<div class="easy-find-filter-track" id="easyFindFilterTrack" role="list" aria-label="검색 범위와 주제"></div>'
      + '<div class="easy-find-bible-panel" id="easyFindBiblePanel" hidden>'
      + '<button type="button" class="easy-find-filter-chip" data-easy-bible-otnt="1">구약/신약</button>'
      + '<button type="button" class="easy-find-filter-chip" data-easy-bible-canon="1">성경전체</button>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="easy-find-scroll" id="easyFindScroll">'
      + '<div id="easyFindSearchResults" class="easy-find-hits" hidden></div>'
      + '<div id="easyFindHomeBody">'
      + recent
      + '<section class="easy-find-section">'
      + '<h3 class="easy-find-section-title">어디에서 찾으시나요?</h3>'
      + '<div class="easy-find-two">'
      + '<button type="button" class="easy-find-choice" data-easy-tst="old">'
      + '<span class="easy-find-choice-copy"><span class="easy-find-choice-title">구약에서 찾기</span><span class="easy-find-choice-sub">39권</span></span>'
      + '<span class="easy-find-choice-visual" aria-hidden="true"><img class="easy-find-choice-book" src="assets/preview/old-testament-book.png" alt="" width="72" height="104" decoding="async"></span>'
      + '</button>'
      + '<button type="button" class="easy-find-choice" data-easy-tst="new">'
      + '<span class="easy-find-choice-copy"><span class="easy-find-choice-title">신약에서 찾기</span><span class="easy-find-choice-sub">27권</span></span>'
      + '<span class="easy-find-choice-visual" aria-hidden="true"><img class="easy-find-choice-book" src="assets/preview/new-testament-book.png" alt="" width="72" height="104" decoding="async"></span>'
      + '</button>'
      + '</div></section>'
      + '<section class="easy-find-section">'
      + '<h3 class="easy-find-section-title">어떤 말씀이 필요하세요?</h3>'
      + '<div class="easy-find-topics" id="easyFindTopics">'
      + TOPICS.map(function (t) {
        return '<button type="button" class="easy-find-topic is-' + (t.face || 'inset') + ' is-' + t.id + '" data-easy-topic="' + esc(t.query) + '" aria-label="' + esc(t.title) + '">'
          + '<span class="easy-find-topic-glow" aria-hidden="true"></span>'
          + '<span class="easy-find-topic-copy"><span class="easy-find-topic-title">' + esc(t.title) + '</span></span>'
          + '</button>';
      }).join('')
      + '</div></section>'
      + '<section class="easy-find-section">'
      + '<h3 class="easy-find-section-title">책 이름을 잘 모르시나요?</h3>'
      + '<p class="easy-find-section-sub">기억나는 내용의 종류로 찾아보세요.</p>'
      + '<div class="easy-find-groups">'
      + GROUPS.map(function (g) {
        return '<button type="button" class="easy-find-group" data-easy-group="' + g.id + '">'
          + '<span class="easy-find-group-mark easy-find-group-mark--' + g.id + '" aria-hidden="true"></span>'
          + '<span class="easy-find-group-copy">'
          + '<span class="easy-find-group-title">' + esc(g.title) + '</span>'
          + '<span class="easy-find-group-sub">' + esc(g.hint) + '</span>'
          + '</span></button>';
      }).join('')
      + '</div></section>'
      + '<div class="easy-find-all-wrap">'
      + '<button type="button" class="easy-find-all-btn" data-easy-all="1">전체 66권 보기</button>'
      + '</div>'
      + '</div></div></div>';
  }

  function listHtml(title, list, extra) {
    return '<div class="easy-find-panel" data-easy-panel="list">'
      + '<div class="easy-find-fixed">'
      + '<div class="easy-find-list-head">'
      + '<button type="button" class="easy-find-back" data-easy-back="1">← 이전</button>'
      + '<div class="easy-find-list-title">' + esc(title) + '</div>'
      + '</div>'
      + (extra || '')
      + '</div>'
      + '<div class="easy-find-scroll">' + list + '</div>'
      + '</div>';
  }

  function ensureScopeOverlay() {
    var view = document.getElementById('easyView');
    var overlay = document.getElementById('easyFindScopeOverlay');
    if (overlay) return overlay;
    if (!view) return null;
    overlay = document.createElement('div');
    overlay.id = 'easyFindScopeOverlay';
    overlay.className = 'easy-find-scope-overlay';
    overlay.hidden = true;
    overlay.setAttribute('tabindex', '-1');
    overlay.innerHTML = ''
      + '<div class="easy-find-scope-sheet" id="easyFindScopeSheet" role="dialog" aria-modal="true" aria-labelledby="easyFindScopeTitle">'
      + '<div class="easy-find-scope-head">'
      + '<button type="button" class="easy-find-scope-back" id="easyFindScopeBack" data-easy-scope-back="1" hidden aria-label="이전">←</button>'
      + '<div class="easy-find-scope-title" id="easyFindScopeTitle"></div>'
      + '<button type="button" class="easy-find-scope-close" data-easy-scope-close="1" aria-label="닫기">×</button>'
      + '</div>'
      + '<div class="easy-find-scope-list" id="easyFindScopeList"></div>'
      + '</div>';
    view.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeScopePopup();
    });
    return overlay;
  }

  function scopeItemHtml(label, attrs, active) {
    return '<button type="button" class="easy-find-scope-item' + (active ? ' is-active' : '') + '" ' + attrs + '>' + esc(label) + '</button>';
  }

  function applyBibleScope(next) {
    state.scopeTestament = next.testament || 'all';
    state.scopeGroup = next.group || '';
    state.scopeBook = next.book || '';
    state.scopeChapter = next.chapter || 0;
    state.biblePath = next.path || '';
    state.biblePanelOpen = true;
    closeScopePopup();
    state.bodyVisible = 30;
    renderSearchResults(state.query);
  }

  function paintScopeSheet() {
    var overlay = ensureScopeOverlay();
    var title = document.getElementById('easyFindScopeTitle');
    var list = document.getElementById('easyFindScopeList');
    var back = document.getElementById('easyFindScopeBack');
    var html = '';
    var groups;
    var group;
    var book;
    var chapters;
    var i;
    var unit;
    var showBack = false;
    if (!overlay || !title || !list) return;
    if (scopeUi.flow === 'otnt' && scopeUi.step === 'testament') {
      title.textContent = '구약/신약';
      html += scopeItemHtml('구약', 'data-easy-scope-tst-pick="old"', state.scopeTestament === 'old' && state.biblePath === 'otnt');
      html += scopeItemHtml('신약', 'data-easy-scope-tst-pick="new"', state.scopeTestament === 'new' && state.biblePath === 'otnt');
    } else if (scopeUi.flow === 'otnt' && scopeUi.step === 'group') {
      showBack = true;
      title.textContent = scopeUi.testament === 'new' ? '신약 검색 범위' : '구약 검색 범위';
      html += scopeItemHtml(
        scopeUi.testament === 'new' ? '신약 전체' : '구약 전체',
        'data-easy-scope-apply="testament"',
        state.biblePath === 'otnt' && state.scopeTestament === scopeUi.testament && !state.scopeGroup && !state.scopeBook
      );
      groups = scriptureGroups(scopeUi.testament);
      groups.forEach(function (g) {
        html += scopeItemHtml(g.title, 'data-easy-scope-group="' + esc(g.id) + '"', state.scopeGroup === g.id && !state.scopeBook);
      });
    } else if (scopeUi.flow === 'otnt' && scopeUi.step === 'book') {
      showBack = true;
      group = groupById(scopeUi.testament, scopeUi.groupId);
      title.textContent = group ? group.title : '책 선택';
      html += scopeItemHtml(
        (group ? group.title : '그룹') + ' 전체',
        'data-easy-scope-apply="group"',
        state.scopeGroup === scopeUi.groupId && !state.scopeBook
      );
      booksFromNames(group && group.names).forEach(function (b) {
        html += scopeItemHtml(b.name, 'data-easy-scope-book="' + esc(b.name) + '"', state.scopeBook === b.name);
      });
    } else if (scopeUi.flow === 'canon' && scopeUi.step === 'root') {
      title.textContent = '성경전체 검색 범위';
      html += scopeItemHtml('성경 전체', 'data-easy-scope-apply="canon-all"', state.biblePath === 'canon' && bibleScopeIsAll());
      html += scopeItemHtml('특정 책 선택', 'data-easy-scope-canon-books="1"', !!state.scopeBook && state.biblePath === 'canon');
    } else if (scopeUi.flow === 'canon' && scopeUi.step === 'book') {
      showBack = true;
      title.textContent = '책 선택';
      html += '<div class="easy-find-scope-label">구약</div>';
      books().filter(function (b) { return b.testament === 'old'; }).forEach(function (b) {
        html += scopeItemHtml(b.name, 'data-easy-scope-book="' + esc(b.name) + '"', state.scopeBook === b.name);
      });
      html += '<div class="easy-find-scope-label">신약</div>';
      books().filter(function (b) { return b.testament === 'new'; }).forEach(function (b) {
        html += scopeItemHtml(b.name, 'data-easy-scope-book="' + esc(b.name) + '"', state.scopeBook === b.name);
      });
    } else if (scopeUi.flow === 'canon' && scopeUi.step === 'chapter') {
      showBack = true;
      book = bookFromName(scopeUi.bookName);
      unit = chapterUnitOf(scopeUi.bookName);
      title.textContent = scopeUi.bookName || '장 선택';
      html += scopeItemHtml(scopeUi.bookName + ' 전체', 'data-easy-scope-apply="book"', state.scopeBook === scopeUi.bookName && !state.scopeChapter);
      chapters = book && book.chapters ? Number(book.chapters) : 0;
      html += '<div class="easy-find-scope-chapters">';
      for (i = 1; i <= chapters; i++) {
        html += '<button type="button" class="easy-find-scope-chapter' + (state.scopeBook === scopeUi.bookName && Number(state.scopeChapter) === i ? ' is-active' : '') + '" data-easy-scope-chapter="' + i + '">' + i + unit + '</button>';
      }
      html += '</div>';
    }
    if (back) back.hidden = !showBack;
    list.innerHTML = html;
    overlay.hidden = false;
    try { overlay.focus(); } catch (eFocus) { /* ignore */ }
  }

  function openOtNtPopup() {
    scopeUi = { flow: 'otnt', step: 'testament', testament: '', groupId: '', bookName: '' };
    paintScopeSheet();
  }

  function openCanonPopup() {
    scopeUi = { flow: 'canon', step: 'root', testament: '', groupId: '', bookName: '' };
    paintScopeSheet();
  }

  function scopeGoBack() {
    if (scopeUi.flow === 'otnt' && scopeUi.step === 'book') {
      scopeUi.step = 'group';
      scopeUi.bookName = '';
      paintScopeSheet();
      return;
    }
    if (scopeUi.flow === 'otnt' && scopeUi.step === 'group') {
      scopeUi.step = 'testament';
      scopeUi.testament = '';
      scopeUi.groupId = '';
      paintScopeSheet();
      return;
    }
    if (scopeUi.flow === 'canon' && scopeUi.step === 'chapter') {
      scopeUi.step = 'book';
      scopeUi.bookName = '';
      paintScopeSheet();
      return;
    }
    if (scopeUi.flow === 'canon' && scopeUi.step === 'book') {
      scopeUi.step = 'root';
      paintScopeSheet();
      return;
    }
    closeScopePopup();
  }

  function paintBiblePanel() {
    var panel = document.getElementById('easyFindBiblePanel');
    var otnt;
    var canon;
    if (!panel) return;
    panel.hidden = !state.biblePanelOpen;
    otnt = panel.querySelector('[data-easy-bible-otnt]');
    canon = panel.querySelector('[data-easy-bible-canon]');
    if (otnt) {
      otnt.classList.toggle('is-active', state.biblePath === 'otnt');
      otnt.setAttribute('aria-pressed', state.biblePath === 'otnt' ? 'true' : 'false');
    }
    if (canon) {
      canon.classList.toggle('is-active', state.biblePath === 'canon');
      canon.setAttribute('aria-pressed', state.biblePath === 'canon' ? 'true' : 'false');
    }
  }

  function paintResultFilter() {
    var row = document.getElementById('easyFindFilter');
    var track = document.getElementById('easyFindFilterTrack');
    var html = '';
    var scrollLeft = 0;
    var topicOn = !!state.topicId;
    var bibleOn = bibleFilterOn();
    var allOn = !topicOn && !bibleOn;
    var bibleDark = bibleOn && !topicOn;
    var bibleMark = bibleOn && topicOn;
    if (!row || !track) return;
    scrollLeft = track.scrollLeft || 0;
    html += '<button type="button" class="easy-find-filter-chip' + (allOn ? ' is-active' : '') + '" data-easy-scope="all" aria-pressed="' + (allOn ? 'true' : 'false') + '">전체</button>';
    html += '<button type="button" class="easy-find-filter-chip' + (bibleDark ? ' is-active' : '') + (bibleMark ? ' is-scope-on' : '') + '" data-easy-bible-open="1" aria-pressed="' + (bibleOn ? 'true' : 'false') + '">성경</button>';
    TOPICS.forEach(function (t) {
      var on = state.topicId === t.id;
      html += '<button type="button" class="easy-find-filter-chip' + (on ? ' is-active' : '') + '" data-easy-topic-chip="' + esc(t.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + esc(t.title) + '</button>';
    });
    track.innerHTML = html;
    row.hidden = false;
    track.scrollLeft = scrollLeft;
    paintBiblePanel();
    var activeTopic = track.querySelector('.easy-find-filter-chip[data-easy-topic-chip].is-active');
    if (activeTopic && typeof activeTopic.scrollIntoView === 'function') {
      activeTopic.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  function renderSearchResults(query, opts) {
    var host = document.getElementById('easyFindSearchResults');
    var body = document.getElementById('easyFindHomeBody');
    var clearBtn = document.querySelector('#easyView .easy-find-search-clear');
    var scroll = document.getElementById('easyFindScroll');
    var q = String(query || '').trim();
    var html = '';
    var ref;
    var found;
    var word;
    var verses = [];
    var faith = [];
    var visible;
    var count;
    var topic = topicById(state.topicId);
    var searchQ = topic ? topic.query : q;
    var extraQ = (topic && q && q !== topic.query) ? q : '';
    var titleQ = topic ? topic.title : q;
    if (!host || !body) return;
    if (clearBtn) clearBtn.hidden = !q;
    if (!q && !topic) {
      host.hidden = true;
      host.innerHTML = '';
      body.hidden = false;
      state.bodyVisible = 30;
      resetTopicScope();
      var row = document.getElementById('easyFindFilter');
      if (row) row.hidden = true;
      closeScopePopup();
      setSearchActive(false);
      if (scroll) {
        if (opts && opts.restoreScroll != null) scroll.scrollTop = opts.restoreScroll;
        else if (!(opts && opts.keepScroll)) scroll.scrollTop = 0;
      }
      return;
    }
    if (body && !body.hidden) captureHomeScroll();
    setSearchActive(true);
    ref = parseRef(q);
    found = matchBooks(q).filter(function (b) { return bookInScope(b.name); });
    if (ref && ref.book && !verseInScope(ref)) ref = null;
    if (!isJamoQuery(searchQ)) {
      word = collectWordHits(searchQ);
      verses = mergeVerseHits(word.topic, word.body).filter(verseInScope);
      if (extraQ) {
        verses = verses.filter(function (r) {
          return String(r.text || '').indexOf(extraQ) >= 0 || String(r.ref || '').indexOf(extraQ) >= 0;
        });
      }
      faith = (word.faith || []).filter(faithInScope);
    }
    if (ref && ref.book) {
      html += '<button type="button" class="easy-find-hit" data-easy-ref="1">'
        + '<span class="easy-find-hit-k">말씀 주소</span>'
        + esc(ref.book + ' ' + ref.chapter + chapterUnit(ref.book) + ' ' + (ref.verse || 1) + '절')
        + '</button>';
    }
    found.forEach(function (b) {
      html += '<button type="button" class="easy-find-hit" data-easy-book="' + esc(b.name) + '">'
        + '<span class="easy-find-hit-k">성경책</span>' + esc(b.name)
        + '</button>';
    });
    count = verses.length + faith.length;
    if (count) {
      html += '<div class="easy-find-result-title">‘' + esc(titleQ) + '’ 검색 결과 · ' + count + '개</div>';
    } else if (!html && !isJamoQuery(searchQ)) {
      html += '<div class="easy-find-result-title">‘' + esc(titleQ) + '’ 검색 결과</div>';
    }
    visible = Math.min(state.bodyVisible || 30, verses.length);
    verses.slice(0, visible).forEach(function (r) {
      html += verseCardHtml(r, extraQ || searchQ);
    });
    if (verses.length > visible) {
      html += '<button type="button" class="easy-find-more" data-easy-more="1">결과 더 보기</button>';
    }
    if (faith.length && typeof _renderFaithResourceCard === 'function') {
      faith.forEach(function (card) {
        html += '<div class="easy-find-faith">' + _renderFaithResourceCard(card) + '</div>';
      });
    }
    if (!html) html = '<div class="easy-find-empty">찾는 내용이 없습니다</div>';
    host.innerHTML = html;
    host.hidden = false;
    body.hidden = true;
    paintResultFilter();
    if (scroll && !(opts && opts.keepScroll)) scroll.scrollTop = 0;
  }

  function paint() {
    var view = document.getElementById('easyView');
    var inner;
    var group;
    var title;
    if (!view) return;
    view.classList.add('easy-find-ready');
    view.classList.remove('easy-view--ganada', 'easy-view--filtered');
    if (state.panel.indexOf('group:') === 0) {
      group = null;
      GROUPS.forEach(function (g) { if (g.id === state.panel.slice(6)) group = g; });
      title = group ? group.title : '분류';
      inner = listHtml(title, bookButtons(booksByGroup(group && group.id)));
    } else {
      state.panel = 'home';
      inner = homeHtml();
    }
    view.innerHTML = '<div class="easy-find-shell"><div class="easy-find-card" id="easyFindCard">' + inner + '</div></div>';
    bind(view);
    setSearchActive(state.panel === 'home' && !!String(state.query || '').trim());
    if (state.panel === 'home' && state.query) {
      var input = document.getElementById('easyFindSearchInput');
      if (input) input.value = state.query;
      renderSearchResults(state.query);
    }
  }

  function bookFromName(name) {
    var found = null;
    books().forEach(function (b) { if (b.name === name) found = b; });
    return found;
  }

  function onSearchEnter(input) {
    var q;
    var ref;
    var found;
    if (!input) return;
    q = String(input.value || '').trim();
    if (!q) return;
    ref = parseRef(q);
    if (ref && ref.book) { openPlace(ref); return; }
    found = matchBooks(q);
    if (found.length === 1) { openChapterPicker(found[0]); return; }
    if (found.length) return;
    openWordSearch(q);
  }

  function bind(view) {
    if (view.getAttribute('data-easy-find-bound') === '1') return;
    view.setAttribute('data-easy-find-bound', '1');
    view.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      var resumeKind;
      var book;
      var ref;
      if (!btn || !view.contains(btn)) return;
      if (btn.getAttribute('data-easy-scope-close')) {
        closeScopePopup();
        return;
      }
      if (btn.getAttribute('data-easy-scope-back')) {
        scopeGoBack();
        return;
      }
      if (btn.getAttribute('data-easy-scope') === 'all') {
        state.topicId = '';
        state.biblePanelOpen = false;
        clearBibleScope();
        closeScopePopup();
        state.bodyVisible = 30;
        renderSearchResults(state.query);
        return;
      }
      if (btn.getAttribute('data-easy-bible-open')) {
        state.biblePanelOpen = !state.biblePanelOpen;
        paintResultFilter();
        return;
      }
      if (btn.getAttribute('data-easy-bible-otnt')) {
        openOtNtPopup();
        return;
      }
      if (btn.getAttribute('data-easy-bible-canon')) {
        openCanonPopup();
        return;
      }
      if (btn.getAttribute('data-easy-scope-tst-pick')) {
        scopeUi.testament = btn.getAttribute('data-easy-scope-tst-pick') === 'new' ? 'new' : 'old';
        scopeUi.step = 'group';
        paintScopeSheet();
        return;
      }
      if (btn.getAttribute('data-easy-scope-group')) {
        var pickedGroup;
        scopeUi.groupId = btn.getAttribute('data-easy-scope-group') || '';
        pickedGroup = groupById(scopeUi.testament, scopeUi.groupId);
        if (pickedGroup && (pickedGroup.names || []).length <= 1) {
          applyBibleScope({ testament: scopeUi.testament, group: scopeUi.groupId, book: '', chapter: 0, path: 'otnt' });
        } else {
          scopeUi.step = 'book';
          paintScopeSheet();
        }
        return;
      }
      if (btn.getAttribute('data-easy-scope-canon-books')) {
        scopeUi.step = 'book';
        paintScopeSheet();
        return;
      }
      if (btn.getAttribute('data-easy-scope-apply')) {
        var applyKind = btn.getAttribute('data-easy-scope-apply');
        var applyBook;
        if (applyKind === 'canon-all') {
          applyBibleScope({ testament: 'all', group: '', book: '', chapter: 0, path: 'canon' });
        } else if (applyKind === 'testament') {
          applyBibleScope({ testament: scopeUi.testament, group: '', book: '', chapter: 0, path: 'otnt' });
        } else if (applyKind === 'group') {
          applyBibleScope({ testament: scopeUi.testament, group: scopeUi.groupId, book: '', chapter: 0, path: 'otnt' });
        } else if (applyKind === 'book') {
          applyBook = bookFromName(scopeUi.bookName);
          applyBibleScope({
            testament: applyBook && applyBook.testament ? applyBook.testament : 'all',
            group: '',
            book: scopeUi.bookName,
            chapter: 0,
            path: 'canon'
          });
        }
        return;
      }
      if (btn.getAttribute('data-easy-scope-book')) {
        var pickName = btn.getAttribute('data-easy-scope-book');
        var pickBook;
        if (scopeUi.flow === 'canon') {
          scopeUi.bookName = pickName;
          scopeUi.step = 'chapter';
          paintScopeSheet();
        } else {
          pickBook = bookFromName(pickName);
          applyBibleScope({
            testament: scopeUi.testament || (pickBook && pickBook.testament) || 'old',
            group: scopeUi.groupId,
            book: pickName,
            chapter: 0,
            path: 'otnt'
          });
        }
        return;
      }
      if (btn.getAttribute('data-easy-scope-chapter')) {
        var ch = parseInt(btn.getAttribute('data-easy-scope-chapter'), 10) || 0;
        var chBook = bookFromName(scopeUi.bookName);
        applyBibleScope({
          testament: chBook && chBook.testament ? chBook.testament : 'all',
          group: '',
          book: scopeUi.bookName,
          chapter: ch,
          path: 'canon'
        });
        return;
      }
      if (btn.getAttribute('data-easy-topic-chip')) {
        applyTopic(btn.getAttribute('data-easy-topic-chip'), { resetScope: false });
        return;
      }
      if (btn.getAttribute('data-easy-clear')) {
        var clearInput = document.getElementById('easyFindSearchInput');
        if (clearInput) clearInput.value = '';
        state.query = '';
        state.bodyVisible = 30;
        resetTopicScope();
        renderSearchResults('');
        if (clearInput) clearInput.focus();
        return;
      }
      if (btn.getAttribute('data-easy-more')) {
        state.bodyVisible = (state.bodyVisible || 30) + 30;
        renderSearchResults(state.query, { keepScroll: true });
        return;
      }
      if (btn.getAttribute('data-easy-go')) {
        if (typeof goToVerse === 'function') {
          goToVerse(
            btn.getAttribute('data-book'),
            parseInt(btn.getAttribute('data-chapter'), 10),
            parseInt(btn.getAttribute('data-verse'), 10) || 1,
            btn.getAttribute('data-testament') || 'old'
          );
        }
        return;
      }
      if (btn.getAttribute('data-easy-back')) {
        state.panel = 'home';
        state.query = '';
        state.bodyVisible = 30;
        resetTopicScope();
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-tst')) {
        openStairBookList(btn.getAttribute('data-easy-tst'));
        return;
      }
      if (btn.getAttribute('data-easy-group')) {
        state.panel = 'group:' + btn.getAttribute('data-easy-group');
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-all')) {
        openStairAllBooks();
        return;
      }
      resumeKind = btn.getAttribute('data-easy-resume');
      if (resumeKind === 'read') {
        openResumeRead();
        return;
      }
      if (resumeKind === 'listen') {
        openResumeListen();
        return;
      }
      if (btn.getAttribute('data-easy-ref')) {
        ref = parseRef((document.getElementById('easyFindSearchInput') || {}).value || state.query);
        openPlace(ref);
        return;
      }
      if (btn.getAttribute('data-easy-topic')) {
        openWordSearch(btn.getAttribute('data-easy-topic'));
        return;
      }
      if (btn.getAttribute('data-easy-word')) {
        openWordSearch((document.getElementById('easyFindSearchInput') || {}).value || state.query);
        return;
      }
      if (btn.getAttribute('data-easy-book')) {
        book = bookFromName(btn.getAttribute('data-easy-book'));
        openChapterPicker(book);
      }
    });
    view.addEventListener('input', function (e) {
      var input = e.target && e.target.id === 'easyFindSearchInput' ? e.target : null;
      if (!input) return;
      state.query = input.value;
      state.bodyVisible = 30;
      renderSearchResults(input.value);
    });
    view.addEventListener('keydown', function (e) {
      if (!e) return;
      if (e.key === 'Escape') {
        var overlay = document.getElementById('easyFindScopeOverlay');
        if (overlay && !overlay.hidden) {
          e.preventDefault();
          closeScopePopup();
          return;
        }
      }
      if (e.key !== 'Enter') return;
      if (!e.target || e.target.id !== 'easyFindSearchInput') return;
      e.preventDefault();
      onSearchEnter(e.target);
    });
  }

  function render() {
    state.panel = 'home';
    state.query = '';
    state.bodyVisible = 30;
    resetTopicScope();
    paint();
  }

  global.renderGomnaEasyFind = render;
  global.closeGomnaEasyFindSearchToHome = closeSearchToHome;
})(window);
