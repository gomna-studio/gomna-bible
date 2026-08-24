/* 쉬운찾기 1차 시안. 새 검색 엔진·새 저장 체계·공용 선택창 UI 변경 없음. */
(function (global) {
  'use strict';

  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var GROUPS = [
    { id: 'begin', title: '성경의 시작', hint: '모세오경', keys: ['pentateuch'] },
    { id: 'history', title: '역사 이야기', hint: '역사서', keys: ['history_ot'] },
    { id: 'wisdom', title: '시와 지혜', hint: '시가서', keys: ['wisdom'] },
    { id: 'gospel', title: '예수님의 생애', hint: '복음서', keys: ['gospels'] },
    { id: 'church', title: '교회와 편지', hint: '사도행전·서신서', keys: ['acts', 'pauline', 'general_epistles'] },
    { id: 'prophet', title: '예언과 계시', hint: '선지서·계시록', keys: ['major_prophets', 'minor_prophets', 'revelation'] }
  ];

  var state = { panel: 'home', query: '', allMode: 'bible' };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function books() {
    return typeof getAllBooks === 'function' ? getAllBooks() : [];
  }

  function chapterUnit(name) {
    return typeof getChapterUnit === 'function' ? getChapterUnit(name) : (name === '시편' ? '편' : '장');
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
    var unit = chapterUnit(entry.bookName);
    var verse = parseInt(entry.verse, 10);
    if (isNaN(verse) || verse < 1) verse = 1;
    return entry.bookName + ' ' + entry.chapter + unit + ' ' + verse + '절';
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

  function booksByTestament(tst) {
    return books().filter(function (b) { return b.testament === tst; });
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
    if (typeof global.openScriptureQuickMove !== 'function') return;
    global.openScriptureQuickMove({
      bookName: book.name,
      testament: book.testament === 'new' ? 'new' : 'old',
      stage: 'chapter',
      resetPlace: true
    });
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

  function openWordSearch(query) {
    var q = String(query || '').trim();
    var oldInput = document.getElementById('searchInput');
    var newInput = document.getElementById('searchInputReader');
    if (!q) return;
    if (oldInput) oldInput.value = q;
    if (newInput) newInput.value = q;
    if (typeof doSearch === 'function') doSearch();
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

  function ganadaHtml(list) {
    var order = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    var groups = {};
    var html = '';
    order.forEach(function (c) { groups[c] = []; });
    list.forEach(function (b) {
      var c = initialOf(b.name.charAt(0));
      if (groups[c]) groups[c].push(b);
    });
    order.forEach(function (c) {
      if (!groups[c].length) return;
      html += '<section class="easy-find-ganada-group"><h3 class="easy-find-ganada-h">' + c + '</h3>';
      html += bookButtons(groups[c]);
      html += '</section>';
    });
    return html || '<div class="easy-find-empty">해당하는 책이 없습니다</div>';
  }

  var READ_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.3v13"/><path d="M12 6.3C10.8 5.5 9.2 5 7.5 5S4.2 5.5 3 6.3v13C4.2 18.5 5.8 18 7.5 18s3.3.5 4.5 1.3"/><path d="M12 6.3C13.2 5.5 14.8 5 16.5 5s3.3.5 4.5 1.3v13C19.8 18.5 18.2 18 16.5 18s-3.3.5-4.5 1.3"/></svg>';
  var LISTEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>';

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
      + '<span class="easy-find-resume-cta">' + (isListen ? '계속 듣기 ▶' : '계속 읽기 →') + '</span>'
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
      + '<div class="easy-find-search">'
      + '<input id="easyFindSearchInput" class="easy-find-search-input" type="search" placeholder="무엇을 찾고 계세요?" aria-label="무엇을 찾고 계세요?" autocomplete="off" spellcheck="false">'
      + '<p class="easy-find-search-hint">예: 요한복음 · 요 3:16 · 사랑</p>'
      + '<p class="easy-find-search-jamo">초성으로도 찾을 수 있어요: ㅊ → 창세기·출애굽기</p>'
      + '</div>'
      + '<div id="easyFindSearchResults" class="easy-find-hits" hidden></div>'
      + '<div id="easyFindHomeBody">'
      + recent
      + '<section class="easy-find-section">'
      + '<h3 class="easy-find-section-title">어디에서 찾으시나요?</h3>'
      + '<div class="easy-find-two">'
      + '<button type="button" class="easy-find-choice" data-easy-tst="old"><img class="easy-find-choice-icon" src="assets/preview/old-testament-book.png" alt="" width="32" height="46" decoding="async" aria-hidden="true"><span class="easy-find-choice-title">구약에서 찾기</span><span class="easy-find-choice-sub">39권</span></button>'
      + '<button type="button" class="easy-find-choice" data-easy-tst="new"><img class="easy-find-choice-icon" src="assets/preview/new-testament-book.png" alt="" width="32" height="46" decoding="async" aria-hidden="true"><span class="easy-find-choice-title">신약에서 찾기</span><span class="easy-find-choice-sub">27권</span></button>'
      + '</div></section>'
      + '<section class="easy-find-section">'
      + '<h3 class="easy-find-section-title">책 이름을 잘 모르시나요?</h3>'
      + '<p class="easy-find-section-sub">기억나는 내용의 종류로 찾아보세요.</p>'
      + '<div class="easy-find-groups">'
      + GROUPS.map(function (g) {
        return '<button type="button" class="easy-find-group" data-easy-group="' + g.id + '">'
          + '<span class="easy-find-group-title">' + esc(g.title) + '</span>'
          + '<span class="easy-find-group-sub">' + esc(g.hint) + '</span>'
          + '</button>';
      }).join('')
      + '</div></section>'
      + '<div class="easy-find-all-wrap">'
      + '<button type="button" class="easy-find-all-btn" data-easy-all="1">전체 66권 보기</button>'
      + '</div>'
      + '</div></div>';
  }

  function listHtml(title, list, extra) {
    return '<div class="easy-find-panel" data-easy-panel="list">'
      + '<div class="easy-find-list-head">'
      + '<button type="button" class="easy-find-back" data-easy-back="1">← 이전</button>'
      + '<div class="easy-find-list-title">' + esc(title) + '</div>'
      + '</div>'
      + (extra || '')
      + list
      + '</div>';
  }

  function renderSearchResults(query) {
    var host = document.getElementById('easyFindSearchResults');
    var body = document.getElementById('easyFindHomeBody');
    var q = String(query || '').trim();
    var html = '';
    var ref;
    var found;
    if (!host || !body) return;
    if (!q) {
      host.hidden = true;
      host.innerHTML = '';
      body.hidden = false;
      return;
    }
    ref = parseRef(q);
    found = matchBooks(q);
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
    if (!isJamoQuery(q) && !ref) {
      html += '<button type="button" class="easy-find-hit" data-easy-word="1">'
        + '<span class="easy-find-hit-k">말씀 찾기</span>'
        + '‘' + esc(q) + '’ 검색 결과 보기'
        + '</button>';
    }
    if (!html) html = '<div class="easy-find-empty">찾는 내용이 없습니다</div>';
    host.innerHTML = html;
    host.hidden = false;
    body.hidden = true;
  }

  function paint() {
    var view = document.getElementById('easyView');
    var inner;
    var group;
    var list;
    var title;
    if (!view) return;
    view.classList.add('easy-find-ready');
    view.classList.remove('easy-view--ganada', 'easy-view--filtered');
    if (state.panel === 'old') {
      inner = listHtml('구약 39권', bookButtons(booksByTestament('old')));
    } else if (state.panel === 'new') {
      inner = listHtml('신약 27권', bookButtons(booksByTestament('new')));
    } else if (state.panel.indexOf('group:') === 0) {
      group = null;
      GROUPS.forEach(function (g) { if (g.id === state.panel.slice(6)) group = g; });
      title = group ? group.title : '분류';
      inner = listHtml(title, bookButtons(booksByGroup(group && group.id)));
    } else if (state.panel === 'all') {
      list = books();
      inner = listHtml(
        '전체 66권',
        state.allMode === 'ganada' ? ganadaHtml(list) : bookButtons(list),
        '<div class="easy-find-sort" role="tablist" aria-label="전체 목록 정렬">'
          + '<button type="button" class="easy-find-sort-btn' + (state.allMode === 'bible' ? ' is-on' : '') + '" data-easy-sort="bible">성경순</button>'
          + '<button type="button" class="easy-find-sort-btn' + (state.allMode === 'ganada' ? ' is-on' : '') + '" data-easy-sort="ganada">가나다순</button>'
          + '</div>'
      );
    } else {
      state.panel = 'home';
      inner = homeHtml();
    }
    view.innerHTML = '<div class="easy-find-shell"><div class="easy-find-card" id="easyFindCard">' + inner + '</div></div>';
    bind(view);
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
      if (btn.getAttribute('data-easy-back')) {
        state.panel = 'home';
        state.query = '';
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-tst')) {
        state.panel = btn.getAttribute('data-easy-tst');
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-group')) {
        state.panel = 'group:' + btn.getAttribute('data-easy-group');
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-all')) {
        state.panel = 'all';
        state.allMode = 'bible';
        paint();
        return;
      }
      if (btn.getAttribute('data-easy-sort')) {
        state.allMode = btn.getAttribute('data-easy-sort') === 'ganada' ? 'ganada' : 'bible';
        paint();
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
      renderSearchResults(input.value);
    });
    view.addEventListener('keydown', function (e) {
      if (!e || e.key !== 'Enter') return;
      if (!e.target || e.target.id !== 'easyFindSearchInput') return;
      e.preventDefault();
      onSearchEnter(e.target);
    });
  }

  function render() {
    state.panel = 'home';
    state.query = '';
    state.allMode = 'bible';
    paint();
  }

  global.renderGomnaEasyFind = render;
})(window);
