/**
 * Home "이어서" smart-continue card — storage helpers + home renderer.
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

  function isNativeUiLang(lang) {
    return lang === 'ko' || lang === 'en' || lang === 'ja';
  }

  /**
   * Display language for home resume cards.
   * Priority: explicit app ko/en/ja → valid googtrans target → getLanguage → ko.
   * Do not treat Google-mode getLanguage()==='ko' as the real UI language.
   */
  function uiLang() {
    try {
      var stored = localStorage.getItem('gomna_ui_language');
      if (stored === 'ko' || stored === 'en' || stored === 'ja') return stored;
    } catch (e0) { /* ignore */ }
    try {
      if (
        window.GomnaUII18n &&
        typeof window.GomnaUII18n.readValidGoogTransTarget === 'function'
      ) {
        var gt = window.GomnaUII18n.readValidGoogTransTarget();
        if (gt) return gt;
      }
    } catch (e1) { /* ignore */ }
    try {
      if (window.GomnaUII18n && typeof window.GomnaUII18n.getLanguage === 'function') {
        return window.GomnaUII18n.getLanguage() || 'ko';
      }
    } catch (e2) { /* ignore */ }
    return 'ko';
  }

  /** True when book-name dictionary can localize this lang (not Hangul passthrough). */
  function hasBookNameDict(lang) {
    if (!lang || lang === 'ko') return false;
    if (lang === 'en' || lang === 'ja') return true;
    try {
      if (typeof window.GomnaTranslateBookName !== 'function') return false;
      return window.GomnaTranslateBookName('창세기', lang) !== '창세기';
    } catch (e) {
      return false;
    }
  }

  /** Display-only book label for current UI language (storage stays Korean). */
  function bookDisplayName(bookName) {
    var lang = uiLang();
    if (!bookName) return '';
    if (lang === 'ko') return String(bookName);
    try {
      if (typeof window.GomnaTranslateBookName === 'function') {
        return window.GomnaTranslateBookName(bookName, lang) || bookName;
      }
    } catch (e) { /* ignore */ }
    return String(bookName);
  }

  /** Recent chips: Korean keeps short labels; other langs use full translated names. */
  function bookChipLabel(bookName) {
    var lang = uiLang();
    if (lang === 'ko') return bookShortName(bookName);
    // Never feed Korean abbreviations (창/딤후/요) to Google / dict paths.
    return bookDisplayName(bookName);
  }

  function formatLocation(entry) {
    if (!entry) return '';
    var lang = uiLang();
    try {
      if (
        window.GomnaUII18n &&
        typeof window.GomnaUII18n.formatBookChapterVerse === 'function'
      ) {
        return (
          window.GomnaUII18n.formatBookChapterVerse(
            entry.bookName,
            entry.chapter,
            entry.verse,
            lang
          ) || ''
        );
      }
    } catch (e) { /* ignore */ }
    if (lang === 'ko') {
      return entry.bookName + ' ' + entry.chapter + '장 ' + entry.verse + '절';
    }
    return bookDisplayName(entry.bookName) + ' ' + entry.chapter + ':' + entry.verse;
  }

  function formatRecentChip(entry) {
    if (!entry) return '';
    return bookChipLabel(entry.bookName) + ' ' + entry.chapter + ':' + entry.verse;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function uiT(key, fallback) {
    var lang = uiLang();
    var packLang = isNativeUiLang(lang) ? lang : 'en';
    try {
      if (window.GomnaUII18n && typeof window.GomnaUII18n.t === 'function') {
        var v = window.GomnaUII18n.t(key, packLang);
        if (v) return v;
      }
    } catch (e) { /* ignore */ }
    return fallback || '';
  }

  function formatRelativeDayPart(ts) {
    var d = new Date(ts);
    var now;
    var today;
    var that;
    var diff;
    var lang = uiLang();
    var dayLang = isNativeUiLang(lang) ? lang : 'en';
    if (isNaN(d.getTime())) return '';
    try {
      if (window.GomnaUII18n && typeof window.GomnaUII18n.formatRelativeDay === 'function') {
        return window.GomnaUII18n.formatRelativeDay(ts, dayLang) || '';
      }
    } catch (e) { /* ignore */ }
    now = new Date();
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    diff = Math.round((today - that) / 86400000);
    if (dayLang === 'en') {
      if (diff <= 0) return 'today';
      if (diff === 1) return 'yesterday';
      if (diff >= 2 && diff <= 6) return diff + ' days ago';
      return d.getMonth() + 1 + '/' + d.getDate();
    }
    if (diff <= 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff >= 2 && diff <= 6) return diff + '일 전';
    return d.getMonth() + 1 + '월 ' + d.getDate() + '일';
  }

  /* 한국어 화면에서는 "21:23"을 재생 위치로 오해하지 않도록 오전/오후를 붙인 12시간제로 읽어 준다. */
  function formatClockPart(d) {
    var hour = d.getHours();
    var minute = pad2(d.getMinutes());
    var meridiem;
    if (uiLang() !== 'ko') return pad2(hour) + ':' + minute;
    meridiem = hour < 12 ? '오전' : '오후';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return meridiem + ' ' + hour + ':' + minute;
  }

  /** Home time line: "오늘 · 오후 9:23" / "3일 전 · 오후 9:23" / "7월 20일 · 오후 9:23" */
  function formatResumeTimeLine(ts) {
    var d = new Date(ts);
    var dayPart;
    if (isNaN(d.getTime())) return '';
    dayPart = formatRelativeDayPart(ts);
    if (!dayPart) return '';
    return dayPart + ' · ' + formatClockPart(d);
  }

  function formatDayTimePrefix(ts) {
    return formatResumeTimeLine(ts);
  }

  /* Kept for callers; prefer formatReadStamp / formatListenStamp on home. */
  function formatStamp(ts) {
    return formatResumeTimeLine(ts);
  }

  function formatReadStamp(ts) {
    return formatResumeTimeLine(ts);
  }

  function formatListenStamp(ts) {
    return formatResumeTimeLine(ts);
  }

  function formatDayPlacePrefix(ts) {
    return formatRelativeDayPart(ts);
  }

  function formatReadPlace(ts) {
    return '';
  }

  function formatListenPlace(ts) {
    return '';
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
    if (!entry) {
      var empty =
        'reader.html?book=' +
        encodeURIComponent('창세기') +
        '&chapter=1&verse=1';
      if (source) empty += '&source=' + encodeURIComponent(source);
      return empty;
    }
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

  function setLocalizedText(el, text, lockFromGoogle) {
    if (!el) return;
    el.textContent = text == null ? '' : String(text);
    if (lockFromGoogle) {
      el.setAttribute('translate', 'no');
      if (el.classList && !el.classList.contains('notranslate')) {
        el.classList.add('notranslate');
      }
    } else {
      el.removeAttribute('translate');
      if (el.classList) el.classList.remove('notranslate');
    }
  }

  function renderRecentChips(host, recent) {
    var i;
    var btn;
    var empty;
    var lang = uiLang();
    var lock = lang !== 'ko' && hasBookNameDict(lang);
    if (!host) return;
    host.innerHTML = '';
    if (!recent || !recent.length) {
      empty = document.createElement('span');
      empty.className = 'home-resume-recent-empty';
      empty.setAttribute('data-i18n-key', 'home.resume.recentEmpty');
      empty.textContent = uiT('home.resume.recentEmpty', 'No recent verses yet');
      // Empty copy uses native/en pack; lock when non-ko so Google won't mix.
      if (lang !== 'ko') {
        empty.setAttribute('translate', 'no');
        empty.classList.add('notranslate');
      }
      host.appendChild(empty);
      return;
    }
    for (i = 0; i < recent.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'home-resume-recent-chip';
      btn.setAttribute('data-recent-index', String(i));
      setLocalizedText(btn, formatRecentChip(recent[i]), lock || (lang !== 'ko' && isNativeUiLang(lang)));
      host.appendChild(btn);
    }
  }

  var _homeResumeLangEventsBound = false;

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  /**
   * Most recent activity wins the main card.
   * Uses the timestamps already stored in the existing read/listen resume
   * entries (gomna_resume_read_v1 / gomna_resume_listen_v1 and their legacy
   * fallbacks) — no extra tracking key.
   */
  function pickMainMode(read, listen) {
    if (read && listen) return listen.timestamp > read.timestamp ? 'listen' : 'read';
    if (read) return 'read';
    if (listen) return 'listen';
    return null;
  }

  function renderHomeCard() {
    var root = document.getElementById('homeResumeCard');
    var mainBtn = document.getElementById('homeContinueMain');
    var mainLoc = document.getElementById('homeContinueLoc');
    var mainTime = document.getElementById('homeContinueTime');
    var mainAction = document.getElementById('homeContinueAction');
    var mainMark = document.getElementById('homeContinueActionMark');
    var read = getRead();
    var listen = getListen();
    var lang = uiLang();
    // Lock dictionary-localized dynamic text so GT / applyBookNameI18n cannot mix units.
    var lockDynamic = lang !== 'ko' && (isNativeUiLang(lang) || hasBookNameDict(lang));
    var mainMode = pickMainMode(read, listen);
    var mainEntry = mainMode === 'listen' ? listen : read;
    var actionKey;
    var actionText;

    if (!root) return;

    /* No real resume record → hide the whole area, never a fake card. */
    if (!mainMode) {
      setHidden(mainBtn, true);
      setHidden(root, true);
      return;
    }

    setHidden(root, false);
    setHidden(mainBtn, false);
    if (mainBtn) mainBtn.setAttribute('data-continue-mode', mainMode);
    setLocalizedText(mainLoc, formatLocation(mainEntry), lockDynamic);
    setLocalizedText(mainTime, formatResumeTimeLine(mainEntry.timestamp), lockDynamic);

    actionKey = mainMode === 'listen' ? 'home.continue.listenCta' : 'home.continue.readCta';
    actionText = uiT(actionKey, mainMode === 'listen' ? 'Continue listening' : 'Continue reading');
    if (mainAction) {
      mainAction.setAttribute('data-i18n-key', actionKey);
      mainAction.textContent = actionText;
    }
    if (mainMark) {
      mainMark.innerHTML =
        mainMode === 'listen'
          ? '<span class="home-continue-play">\u25B6</span>'
          : '<svg class="home-resume-read-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"></path></svg>';
    }
    if (mainBtn) {
      mainBtn.setAttribute('aria-label', actionText + ' · ' + formatLocation(mainEntry));
    }
  }

  function openRead() {
    var read = getRead();
    window.location.href = readerUrl(read || null, 'home-resume-read');
  }

  function openBibleTab() {
    var read = getRead();
    window.location.href = readerUrl(read || null, 'bible-tab');
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
    openRecentAt(0);
  }

  function openRecentAt(index) {
    var recent = getRecent(RECENT_HOME);
    var i = parseInt(index, 10);
    if (isNaN(i) || i < 0) i = 0;
    if (!recent.length || !recent[i]) {
      window.location.href =
        'reader.html?book=' +
        encodeURIComponent('창세기') +
        '&chapter=1&verse=1&source=home-resume-recent';
      return;
    }
    /* Navigate only — do not rewrite read/listen keys here. */
    window.location.href = readerUrl(recent[i], 'home-resume-recent');
  }

  function bindHomeCard() {
    var root = document.getElementById('homeResumeCard');
    var mainBtn = document.getElementById('homeContinueMain');
    if (!root || root.getAttribute('data-home-resume-bound') === '1') return;
    root.setAttribute('data-home-resume-bound', '1');

    /* Whole card is the only click target; it reuses the existing resume actions. */
    if (mainBtn) {
      mainBtn.addEventListener('click', function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (mainBtn.getAttribute('data-continue-mode') === 'listen') openListen();
        else openRead();
      });
    }
  }

  function bindHomeLangEvents() {
    if (_homeResumeLangEventsBound) return;
    _homeResumeLangEventsBound = true;
    try {
      window.addEventListener('gomna:ui-language-changed', function () {
        renderHomeCard();
      });
    } catch (e0) { /* ignore */ }
    try {
      window.addEventListener('gomna:reader-translation-settled', function () {
        if (document.getElementById('homeResumeCard')) renderHomeCard();
      });
    } catch (e1) { /* ignore */ }
  }

  function initHome() {
    bindHomeLangEvents();
    renderHomeCard();
    bindHomeCard();
    // translate_feature.js is defer — one re-render after it exposes GomnaTranslateBookName.
    setTimeout(function () {
      if (document.getElementById('homeResumeCard')) renderHomeCard();
    }, 0);
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
    openBibleTab: openBibleTab,
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
