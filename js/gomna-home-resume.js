/**
 * Home "말씀 이어가기" card — storage helpers + home renderer.
 * Reader may call GOMNA_HOME_RESUME.saveRead / saveListen / pushRecent.
 * Does not touch audio-engine queue/playback logic.
 */
(function () {
  'use strict';

  var READ_KEY = 'gomna_resume_read_v1';
  var LISTEN_KEY = 'gomna_resume_listen_v1';
  var RECENT_KEY = 'gomna_recent_scriptures_v1';
  var LEGACY_LAST_READ = 'gomna_last_read';
  var LEGACY_AUDIO_RESUME = 'gomna_audio_bible_resume_v1';
  var RECENT_MAX = 24;
  var RECENT_HOME = 3;

  var KO_BOOK_SHORT = {
    창세기: '창',
    출애굽기: '출',
    레위기: '레',
    민수기: '민',
    신명기: '신',
    여호수아: '수',
    사사기: '삿',
    룻기: '룻',
    사무엘상: '삼상',
    사무엘하: '삼하',
    열왕기상: '왕상',
    열왕기하: '왕하',
    역대상: '대상',
    역대하: '대하',
    에스라: '스',
    느헤미야: '느',
    에스더: '에',
    욥기: '욥',
    시편: '시',
    잠언: '잠',
    전도서: '전',
    아가: '아',
    이사야: '사',
    예레미야: '렘',
    예레미야애가: '애',
    에스겔: '겔',
    다니엘: '단',
    호세아: '호',
    요엘: '욜',
    아모스: '암',
    오바댜: '옵',
    요나: '욘',
    미가: '미',
    나훔: '나',
    하박국: '합',
    스바냐: '습',
    학개: '학',
    스가랴: '슥',
    말라기: '말',
    마태복음: '마',
    마가복음: '막',
    누가복음: '눅',
    요한복음: '요',
    사도행전: '행',
    로마서: '롬',
    고린도전서: '고전',
    고린도후서: '고후',
    갈라디아서: '갈',
    에베소서: '엡',
    빌립보서: '빌',
    골로새서: '골',
    데살로니가전서: '살전',
    데살로니가후서: '살후',
    디모데전서: '딤전',
    디모데후서: '딤후',
    디도서: '딛',
    빌레몬서: '몬',
    히브리서: '히',
    야고보서: '약',
    베드로전서: '벧전',
    베드로후서: '벧후',
    요한일서: '요일',
    요한이서: '요이',
    요한삼서: '요삼',
    유다서: '유',
    요한계시록: '계'
  };

  var BOOK_ID_TO_KO = {
    genesis: '창세기',
    exodus: '출애굽기',
    leviticus: '레위기',
    numbers: '민수기',
    deuteronomy: '신명기',
    joshua: '여호수아',
    judges: '사사기',
    ruth: '룻기',
    '1samuel': '사무엘상',
    '2samuel': '사무엘하',
    '1kings': '열왕기상',
    '2kings': '열왕기하',
    '1chronicles': '역대상',
    '2chronicles': '역대하',
    ezra: '에스라',
    nehemiah: '느헤미야',
    esther: '에스더',
    job: '욥기',
    psalms: '시편',
    proverbs: '잠언',
    ecclesiastes: '전도서',
    song: '아가',
    songofsolomon: '아가',
    isaiah: '이사야',
    jeremiah: '예레미야',
    lamentations: '예레미야애가',
    ezekiel: '에스겔',
    daniel: '다니엘',
    hosea: '호세아',
    joel: '요엘',
    amos: '아모스',
    obadiah: '오바댜',
    jonah: '요나',
    micah: '미가',
    nahum: '나훔',
    habakkuk: '하박국',
    zephaniah: '스바냐',
    haggai: '학개',
    zechariah: '스가랴',
    malachi: '말라기',
    matthew: '마태복음',
    mark: '마가복음',
    luke: '누가복음',
    john: '요한복음',
    acts: '사도행전',
    romans: '로마서',
    '1corinthians': '고린도전서',
    '2corinthians': '고린도후서',
    galatians: '갈라디아서',
    ephesians: '에베소서',
    philippians: '빌립보서',
    colossians: '골로새서',
    '1thessalonians': '데살로니가전서',
    '2thessalonians': '데살로니가후서',
    '1timothy': '디모데전서',
    '2timothy': '디모데후서',
    titus: '디도서',
    philemon: '빌레몬서',
    hebrews: '히브리서',
    james: '야고보서',
    '1peter': '베드로전서',
    '2peter': '베드로후서',
    '1john': '요한일서',
    '2john': '요한이서',
    '3john': '요한삼서',
    jude: '유다서',
    revelation: '요한계시록'
  };

  function safeParse(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeEntry(raw, mode) {
    if (!raw || typeof raw !== 'object') return null;
    var bookName = raw.bookName || raw.book;
    var chapter = parseInt(raw.chapter, 10);
    var verse = parseInt(raw.verse, 10);
    var ts = Number(raw.timestamp);
    if (!bookName || typeof bookName !== 'string') return null;
    if (isNaN(chapter) || chapter < 1) return null;
    if (isNaN(verse) || verse < 1) verse = 1;
    if (isNaN(ts) || ts <= 0) ts = Date.now();
    return {
      bookName: String(bookName),
      chapter: chapter,
      verse: verse,
      timestamp: ts,
      mode: mode || raw.mode || 'read'
    };
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function readJson(key) {
    try {
      return safeParse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function entryKey(entry) {
    return entry.bookName + '|' + entry.chapter + '|' + entry.verse;
  }

  function bookShortName(bookName) {
    if (!bookName) return '';
    if (KO_BOOK_SHORT[bookName]) return KO_BOOK_SHORT[bookName];
    if (
      window.GomnaBibleRef &&
      typeof window.GomnaBibleRef.resolveBookId === 'function'
    ) {
      try {
        var id = window.GomnaBibleRef.resolveBookId(bookName);
        if (id && BOOK_ID_TO_KO[id] && KO_BOOK_SHORT[BOOK_ID_TO_KO[id]]) {
          return KO_BOOK_SHORT[BOOK_ID_TO_KO[id]];
        }
      } catch (e) { /* ignore */ }
    }
    return String(bookName);
  }

  function formatLocation(entry) {
    if (!entry) return '';
    return entry.bookName + ' ' + entry.chapter + '장 ' + entry.verse + '절';
  }

  function formatRecentChip(entry) {
    if (!entry) return '';
    return bookShortName(entry.bookName) + ' ' + entry.chapter + ':' + entry.verse;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDayTimePrefix(ts) {
    var d = new Date(ts);
    var now;
    var today;
    var that;
    var diff;
    var hm;
    if (isNaN(d.getTime())) return '';
    now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    diff = Math.round((today - that) / 86400000);
    hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (diff <= 0) return '오늘 ' + hm;
    if (diff === 1) return '어제 ' + hm;
    if (d.getFullYear() === now.getFullYear()) {
      return d.getMonth() + 1 + '.' + d.getDate() + ' ' + hm;
    }
    return (
      d.getFullYear() +
      '.' +
      pad2(d.getMonth() + 1) +
      '.' +
      pad2(d.getDate()) +
      ' ' +
      hm
    );
  }

  /* Kept for callers; prefer formatReadStamp / formatListenStamp on home. */
  function formatStamp(ts) {
    return formatDayTimePrefix(ts);
  }

  function formatReadStamp(ts) {
    var prefix = formatDayTimePrefix(ts);
    return prefix ? prefix + '에 읽었습니다' : '';
  }

  function formatListenStamp(ts) {
    var prefix = formatDayTimePrefix(ts);
    return prefix ? prefix + '에 들었습니다' : '';
  }

  function formatDayPlacePrefix(ts) {
    var d = new Date(ts);
    var now;
    var today;
    var that;
    var diff;
    if (isNaN(d.getTime())) return '';
    now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    diff = Math.round((today - that) / 86400000);
    if (diff <= 0) return '오늘';
    if (diff === 1) return '어제';
    if (d.getFullYear() === now.getFullYear()) {
      return d.getMonth() + 1 + '.' + d.getDate();
    }
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  function formatReadPlace(ts) {
    var day = formatDayPlacePrefix(ts);
    return day ? ' · ' + day + ' 읽던 곳' : '';
  }

  function formatListenPlace(ts) {
    var day = formatDayPlacePrefix(ts);
    return day ? ' · ' + day + ' 듣던 곳' : '';
  }

  function pushRecent(entry) {
    var normalized = normalizeEntry(entry, entry && entry.mode);
    var list;
    var next;
    var i;
    if (!normalized) return false;
    list = readJson(RECENT_KEY);
    if (!Array.isArray(list)) list = [];
    next = [normalized];
    for (i = 0; i < list.length; i++) {
      var item = normalizeEntry(list[i], list[i] && list[i].mode);
      if (!item) continue;
      if (entryKey(item) === entryKey(normalized)) continue;
      next.push(item);
      if (next.length >= RECENT_MAX) break;
    }
    return writeJson(RECENT_KEY, next);
  }

  function getRecent(limit) {
    var list = readJson(RECENT_KEY);
    var out = [];
    var i;
    var item;
    if (!Array.isArray(list)) return [];
    for (i = 0; i < list.length; i++) {
      item = normalizeEntry(list[i], list[i] && list[i].mode);
      if (!item) continue;
      out.push(item);
      if (out.length >= (limit || RECENT_HOME)) break;
    }
    return out;
  }

  function saveRead(bookName, chapter, verse) {
    var entry = normalizeEntry(
      {
        bookName: bookName,
        chapter: chapter,
        verse: verse || 1,
        timestamp: Date.now(),
        mode: 'read'
      },
      'read'
    );
    if (!entry) return false;
    writeJson(READ_KEY, entry);
    /* Keep legacy home key in sync for older paths. */
    try {
      localStorage.setItem(
        LEGACY_LAST_READ,
        JSON.stringify({
          book: entry.bookName,
          chapter: entry.chapter,
          verse: entry.verse,
          timestamp: entry.timestamp
        })
      );
    } catch (e) { /* ignore */ }
    pushRecent(entry);
    return true;
  }

  function saveListen(bookName, chapter, verse) {
    var entry = normalizeEntry(
      {
        bookName: bookName,
        chapter: chapter,
        verse: verse || 1,
        timestamp: Date.now(),
        mode: 'listen'
      },
      'listen'
    );
    if (!entry) return false;
    writeJson(LISTEN_KEY, entry);
    pushRecent(entry);
    return true;
  }

  function getRead() {
    var entry = normalizeEntry(readJson(READ_KEY), 'read');
    var legacy;
    if (entry) return entry;
    legacy = normalizeEntry(readJson(LEGACY_LAST_READ), 'read');
    return legacy;
  }

  function parseBibleAudioId(audioId) {
    var match = String(audioId || '').match(
      /^([^.]+)\.(\d{3})\.(\d{3})(?:o\d+)?\.bible$/
    );
    if (!match) return null;
    return {
      bookId: match[1],
      chapter: parseInt(match[2], 10),
      verse: parseInt(match[3], 10)
    };
  }

  function bookNameFromAudioId(audioId) {
    var parts = parseBibleAudioId(audioId);
    var ko;
    if (!parts) return null;
    ko = BOOK_ID_TO_KO[parts.bookId];
    if (ko) return ko;
    if (
      window.GomnaBibleRef &&
      typeof window.GomnaBibleRef.bookIdToKorean === 'function'
    ) {
      try {
        return window.GomnaBibleRef.bookIdToKorean(parts.bookId) || null;
      } catch (e) { /* ignore */ }
    }
    if (
      window.GOMNA_AUDIO_BOOK &&
      window.GOMNA_AUDIO_BOOK.KO_BOOK_BY_ID &&
      window.GOMNA_AUDIO_BOOK.KO_BOOK_BY_ID[parts.bookId]
    ) {
      return window.GOMNA_AUDIO_BOOK.KO_BOOK_BY_ID[parts.bookId];
    }
    return null;
  }

  function getListen() {
    var entry = normalizeEntry(readJson(LISTEN_KEY), 'listen');
    var session;
    var parts;
    var bookName;
    if (entry) return entry;
    /* Seed from existing bible resume session if present. */
    session = readJson(LEGACY_AUDIO_RESUME);
    if (!session || !session.currentAudioId) return null;
    parts = parseBibleAudioId(session.currentAudioId);
    bookName = bookNameFromAudioId(session.currentAudioId);
    if (!parts || !bookName) return null;
    return normalizeEntry(
      {
        bookName: bookName,
        chapter: parts.chapter,
        verse: parts.verse,
        timestamp: session.savedAt ? Date.parse(session.savedAt) : Date.now(),
        mode: 'listen'
      },
      'listen'
    );
  }

  function readerUrl(entry, source) {
    if (!entry) return 'reader.html?book=' + encodeURIComponent('창세기') + '&chapter=1&verse=1';
    var url =
      'reader.html?book=' +
      encodeURIComponent(entry.bookName) +
      '&chapter=' +
      encodeURIComponent(entry.chapter) +
      '&verse=' +
      encodeURIComponent(entry.verse || 1);
    if (source) url += '&source=' + encodeURIComponent(source);
    return url;
  }

  function setText(el, text) {
    if (el) el.textContent = text == null ? '' : String(text);
  }

  function renderHomeCard() {
    var root = document.getElementById('homeResumeCard');
    var readLoc = document.getElementById('homeResumeReadLoc');
    var readPlace = document.getElementById('homeResumeReadPlace');
    var readTime = document.getElementById('homeResumeReadTime');
    var listenLoc = document.getElementById('homeResumeListenLoc');
    var listenPlace = document.getElementById('homeResumeListenPlace');
    var listenTime = document.getElementById('homeResumeListenTime');
    var recentLine = document.getElementById('homeResumeRecentLine');
    var read = getRead();
    var listen = getListen();
    var recent = getRecent(RECENT_HOME);
    var chips;
    var i;

    if (!root) return;

    if (read) {
      setText(readLoc, formatLocation(read));
      setText(readPlace, formatReadPlace(read.timestamp));
      setText(readTime, formatReadStamp(read.timestamp));
      root.classList.remove('home-resume--no-read');
    } else {
      setText(readLoc, '성경읽기 시작');
      setText(readPlace, '');
      setText(readTime, '—');
      root.classList.add('home-resume--no-read');
    }

    if (listen) {
      setText(listenLoc, formatLocation(listen));
      setText(listenPlace, formatListenPlace(listen.timestamp));
      setText(listenTime, formatListenStamp(listen.timestamp));
      root.classList.remove('home-resume--no-listen');
    } else {
      setText(listenLoc, '말씀 듣기 시작');
      setText(listenPlace, '');
      setText(listenTime, '—');
      root.classList.add('home-resume--no-listen');
    }

    if (recent.length) {
      chips = [];
      for (i = 0; i < recent.length; i++) {
        chips.push(formatRecentChip(recent[i]));
      }
      setText(recentLine, chips.join(' · '));
      root.classList.remove('home-resume--no-recent');
    } else {
      setText(recentLine, '아직 기록이 없습니다');
      root.classList.add('home-resume--no-recent');
    }
  }

  function openRead() {
    var read = getRead();
    window.location.href = readerUrl(read || null, 'home-resume-read');
  }

  function openListen() {
    var listen = getListen();
    if (!listen) {
      window.location.href = 'reader.html?book=' + encodeURIComponent('창세기') + '&chapter=1&verse=1&source=home-resume-listen';
      return;
    }
    window.location.href = readerUrl(listen, 'home-resume-listen');
  }

  function openRecent() {
    var recent = getRecent(1);
    if (!recent.length) {
      window.location.href =
        'reader.html?book=' +
        encodeURIComponent('창세기') +
        '&chapter=1&verse=1&source=home-resume-recent';
      return;
    }
    /* Navigate only — do not rewrite read/listen keys here. */
    window.location.href = readerUrl(recent[0], 'home-resume-recent');
  }

  function bindHomeCard() {
    var root = document.getElementById('homeResumeCard');
    var readPane = document.getElementById('homeResumeReadPane');
    var listenPane = document.getElementById('homeResumeListenPane');
    var recentBtn = document.getElementById('homeResumeRecent');
    if (!root) return;

    function stop(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    /* No whole-card click — only independent panes + recent. */
    if (readPane) {
      readPane.addEventListener('click', function (e) {
        stop(e);
        openRead();
      });
    }
    if (listenPane) {
      listenPane.addEventListener('click', function (e) {
        stop(e);
        openListen();
      });
    }
    if (recentBtn) {
      recentBtn.addEventListener('click', function (e) {
        stop(e);
        openRecent();
      });
    }
  }

  function initHome() {
    renderHomeCard();
    bindHomeCard();
  }

  window.GOMNA_HOME_RESUME = {
    READ_KEY: READ_KEY,
    LISTEN_KEY: LISTEN_KEY,
    RECENT_KEY: RECENT_KEY,
    saveRead: saveRead,
    saveListen: saveListen,
    pushRecent: pushRecent,
    getRead: getRead,
    getListen: getListen,
    getRecent: getRecent,
    bookShortName: bookShortName,
    formatLocation: formatLocation,
    formatStamp: formatStamp,
    formatReadStamp: formatReadStamp,
    formatListenStamp: formatListenStamp,
    formatReadPlace: formatReadPlace,
    formatListenPlace: formatListenPlace,
    formatRecentChip: formatRecentChip,
    parseBibleAudioId: parseBibleAudioId,
    bookNameFromAudioId: bookNameFromAudioId,
    renderHomeCard: renderHomeCard,
    openRead: openRead,
    openListen: openListen,
    openRecent: openRecent,
    initHome: initHome
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('homeResumeCard')) initHome();
    });
  } else if (document.getElementById('homeResumeCard')) {
    initHome();
  }
})();
