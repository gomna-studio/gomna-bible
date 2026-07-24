/*!
 * gomna home native UI i18n (ko / en / ja)
 * Sync IIFE — no fetch, no import, no build step.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'gomna_ui_language';
  var SUPPORTED = ['ko', 'en', 'ja'];
  var ATTRS = [
    ['data-i18n-key', 'text'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria'],
    ['data-i18n-title', 'title']
  ];
  var OWNED_ATTR = 'data-gomna-native-translate-owned';
  var active = false;
  var currentLang = 'ko';
  var bootCleared = false;

  var STRINGS = {
    ko: {
      'brand.title': '은혜의말씀',
      'brand.subtitle': 'Holy Bible · Korean Revised',
      'brand.logoAlt': '은혜의말씀',
      'home.greeting.morning': '— 좋은 아침입니다 —',
      'home.greeting.afternoon': '— 평안한 오후입니다 —',
      'home.greeting.evening': '— 고요한 저녁입니다 —',
      'home.continue.start': '처음부터 성경 읽기',
      'home.continue.resume': '이어서 읽기',
      'home.continue.aria': '이어서 읽기',
      'home.todayWord.tag': '오늘의 말씀',
      'home.todayWord.backToday': '오늘로 돌아가기',
      'home.todayWord.otherDate': '다른 날짜 보기',
      'home.todayWord.open': '오늘의 말씀 묵상하기',
      'home.todayWord.openNote': '오늘 말씀 기준으로 읽고 묵상하기',
      'home.quick.read': '성경읽기',
      'home.quick.readDesc': '책·장·절로',
      'home.quick.audio': '오디오',
      'home.quick.audioDesc': '듣고 묵상하기',
      'home.quick.topics': '주제별',
      'home.quick.topicsDesc': '말씀 찾아보기',
      'home.quick.archive': '보관함',
      'home.quick.archiveDesc': '저장한 말씀',
      'home.commentary.title': '말씀풀이 듣기',
      'home.commentary.badge': '오디오 확장버젼 준비중',
      'home.commentary.desc': '원어·역사·신학·교차참조 9개 표',
      'home.oldTestament.title': '구약 39권',
      'home.newTestament.title': '신약 27권',
      'home.testament.readByChapter': '장·절로 읽기 ›',
      'home.easyFind.title': '말씀 바로찾기',
      'home.easyFind.desc': '분류별로 찾기 ›',
      'search.placeholder.home': '성경 말씀 찾기 (예: 사랑, 믿음, 로마서 8장)',
      'search.inputAria': '성경 검색어 입력',
      'search.submitAria': '검색 실행',
      'search.topicsAria': '검색창 안 주제별 검색',
      'search.chip.love': '#사랑',
      'search.chip.faith': '#믿음',
      'search.chip.hope': '#소망',
      'search.chip.peace': '#평안',
      'search.chip.comfort': '#위로',
      'search.chip.gratitude': '#감사',
      'search.chip.prayer': '#기도',
      'home.sheet.oldTestament': '구약',
      'home.sheet.newTestament': '신약',
      'home.sheet.easyFind': '쉬운찾기',
      'home.sheet.archive': '내 보관함',
      'common.home': '← 홈으로',
      'common.close': '닫기',
      'settings.fontSize': '글자 크기 설정',
      'settings.openAria': '설정',
      'home.calendar.previousMonth': '이전 달',
      'home.calendar.nextMonth': '다음 달',
      'home.calendar.hint': '날짜를 누르면 그날의 말씀이 표시됩니다 (1~30일 순환)',
      'home.calendar.weekday.sun': '일',
      'home.calendar.weekday.mon': '월',
      'home.calendar.weekday.tue': '화',
      'home.calendar.weekday.wed': '수',
      'home.calendar.weekday.thu': '목',
      'home.calendar.weekday.fri': '금',
      'home.calendar.weekday.sat': '토',
      'home.bookmark.emptyTitle': '아직 저장한 말씀이 없습니다.',
      'home.bookmark.emptyDesc': '마음에 닿은 구절을 ★로 저장해보세요.',
      'home.cookie.aria': '분석 쿠키 동의 안내',
      'home.cookie.text': '서비스 개선을 위한 방문 통계 수집에 동의하시겠습니까? 거부해도 이용 제한은 없습니다.',
      'home.cookie.reject': '거부',
      'home.cookie.accept': '동의',
      'language.short': '언어',
      'language.openAria': '언어 선택',
      'home.relative.today': '오늘',
      'home.relative.yesterday': '어제',
      'home.continue.lastReadSuffix': '읽던 곳',
      'home.continue.readAt': '{day} {time}에 읽었습니다'
    },
    en: {
      'brand.title': 'Word of Grace',
      'brand.subtitle': 'Holy Bible · Korean Revised Version',
      'brand.logoAlt': 'Word of Grace',
      'home.greeting.morning': '— Good morning —',
      'home.greeting.afternoon': '— Have a peaceful afternoon —',
      'home.greeting.evening': '— Have a quiet evening —',
      'home.continue.start': 'Start Reading the Bible',
      'home.continue.resume': 'Continue Reading',
      'home.continue.aria': 'Continue reading',
      'home.todayWord.tag': 'Verse of the Day',
      'home.todayWord.backToday': 'Back to Today',
      'home.todayWord.otherDate': 'View Another Date',
      'home.todayWord.open': 'Reflect on Today’s Verse',
      'home.todayWord.openNote': 'Read and reflect on today’s verse',
      'home.quick.read': 'Bible Reading',
      'home.quick.readDesc': 'By Book, Chapter, and Verse',
      'home.quick.audio': 'Audio',
      'home.quick.audioDesc': 'Listen and Reflect',
      'home.quick.topics': 'Topics',
      'home.quick.topicsDesc': 'Find Scripture',
      'home.quick.archive': 'Saved',
      'home.quick.archiveDesc': 'Saved Verses',
      'home.commentary.title': 'Listen to Bible Commentary',
      'home.commentary.badge': 'Expanded Audio Coming Soon',
      'home.commentary.desc': '9 Study Views: Original Languages, History, Theology, Cross-References, and More',
      'home.oldTestament.title': 'Old Testament · 39 Books',
      'home.newTestament.title': 'New Testament · 27 Books',
      'home.testament.readByChapter': 'Read by Chapter and Verse ›',
      'home.easyFind.title': 'Quick Scripture Finder',
      'home.easyFind.desc': 'Browse by Category ›',
      'search.placeholder.home': 'Search Scripture (e.g., love, faith, Romans 8)',
      'search.inputAria': 'Enter a Scripture search',
      'search.submitAria': 'Search',
      'search.topicsAria': 'Topic suggestions',
      'search.chip.love': '#Love',
      'search.chip.faith': '#Faith',
      'search.chip.hope': '#Hope',
      'search.chip.peace': '#Peace',
      'search.chip.comfort': '#Comfort',
      'search.chip.gratitude': '#Gratitude',
      'search.chip.prayer': '#Prayer',
      'home.sheet.oldTestament': 'Old Testament',
      'home.sheet.newTestament': 'New Testament',
      'home.sheet.easyFind': 'Quick Find',
      'home.sheet.archive': 'My Saved Verses',
      'common.home': '← Home',
      'common.close': 'Close',
      'settings.fontSize': 'Font Size',
      'settings.openAria': 'Settings',
      'home.calendar.previousMonth': 'Previous month',
      'home.calendar.nextMonth': 'Next month',
      'home.calendar.hint': 'Tap a date to view that day’s verse (cycles through days 1–30)',
      'home.calendar.weekday.sun': 'Sun',
      'home.calendar.weekday.mon': 'Mon',
      'home.calendar.weekday.tue': 'Tue',
      'home.calendar.weekday.wed': 'Wed',
      'home.calendar.weekday.thu': 'Thu',
      'home.calendar.weekday.fri': 'Fri',
      'home.calendar.weekday.sat': 'Sat',
      'home.bookmark.emptyTitle': 'No saved verses yet.',
      'home.bookmark.emptyDesc': 'Save a verse that speaks to your heart with ★.',
      'home.cookie.aria': 'Analytics cookie consent',
      'home.cookie.text': 'Allow anonymous visit statistics to help improve the service? You can continue using the service if you decline.',
      'home.cookie.reject': 'Decline',
      'home.cookie.accept': 'Allow',
      'language.short': 'Language',
      'language.openAria': 'Choose language',
      'home.relative.today': 'today',
      'home.relative.yesterday': 'yesterday',
      'home.continue.lastReadSuffix': 'Last read',
      'home.continue.readAt': 'Read {day} at {time}'
    },
    ja: {
      'brand.title': '恵みのみことば',
      'brand.subtitle': '聖書・韓国語改訳版',
      'brand.logoAlt': '恵みのみことば',
      'home.greeting.morning': '— おはようございます —',
      'home.greeting.afternoon': '— 穏やかな午後をお過ごしください —',
      'home.greeting.evening': '— 静かな夜をお過ごしください —',
      'home.continue.start': '聖書を最初から読む',
      'home.continue.resume': '続きを読む',
      'home.continue.aria': '続きを読む',
      'home.todayWord.tag': '今日の聖句',
      'home.todayWord.backToday': '今日に戻る',
      'home.todayWord.otherDate': '別の日を見る',
      'home.todayWord.open': '今日の聖句を黙想する',
      'home.todayWord.openNote': '今日の聖句を読み、黙想します',
      'home.quick.read': '聖書を読む',
      'home.quick.readDesc': '書・章・節から',
      'home.quick.audio': 'オーディオ',
      'home.quick.audioDesc': '聴いて黙想する',
      'home.quick.topics': 'テーマ別',
      'home.quick.topicsDesc': '聖句を探す',
      'home.quick.archive': '保存済み',
      'home.quick.archiveDesc': '保存した聖句',
      'home.commentary.title': '聖書解説を聴く',
      'home.commentary.badge': '拡張オーディオ版 準備中',
      'home.commentary.desc': '原語・歴史・神学・引照など9つの学習項目',
      'home.oldTestament.title': '旧約聖書 39巻',
      'home.newTestament.title': '新約聖書 27巻',
      'home.testament.readByChapter': '章・節から読む ›',
      'home.easyFind.title': '聖句をすぐ探す',
      'home.easyFind.desc': '分類から探す ›',
      'search.placeholder.home': '聖書を検索（例：愛、信仰、ローマ8章）',
      'search.inputAria': '聖書の検索語を入力',
      'search.submitAria': '検索',
      'search.topicsAria': 'テーマ別の検索候補',
      'search.chip.love': '#愛',
      'search.chip.faith': '#信仰',
      'search.chip.hope': '#希望',
      'search.chip.peace': '#平安',
      'search.chip.comfort': '#慰め',
      'search.chip.gratitude': '#感謝',
      'search.chip.prayer': '#祈り',
      'home.sheet.oldTestament': '旧約聖書',
      'home.sheet.newTestament': '新約聖書',
      'home.sheet.easyFind': 'かんたん検索',
      'home.sheet.archive': '保存した聖句',
      'common.home': '← ホームへ',
      'common.close': '閉じる',
      'settings.fontSize': '文字サイズ設定',
      'settings.openAria': '設定',
      'home.calendar.previousMonth': '前の月',
      'home.calendar.nextMonth': '次の月',
      'home.calendar.hint': '日付をタップすると、その日の聖句が表示されます（1～30日を循環）',
      'home.calendar.weekday.sun': '日',
      'home.calendar.weekday.mon': '月',
      'home.calendar.weekday.tue': '火',
      'home.calendar.weekday.wed': '水',
      'home.calendar.weekday.thu': '木',
      'home.calendar.weekday.fri': '金',
      'home.calendar.weekday.sat': '土',
      'home.bookmark.emptyTitle': '保存した聖句はまだありません。',
      'home.bookmark.emptyDesc': '心に響いた聖句を★で保存してみましょう。',
      'home.cookie.aria': 'アクセス解析Cookieの同意',
      'home.cookie.text': 'サービス改善のため、匿名の利用統計を収集してもよろしいですか。拒否しても利用制限はありません。',
      'home.cookie.reject': '拒否',
      'home.cookie.accept': '同意する',
      'language.short': '言語',
      'language.openAria': '言語を選択',
      'home.relative.today': '今日',
      'home.relative.yesterday': '昨日',
      'home.continue.lastReadSuffix': 'に読んだ箇所',
      'home.continue.readAt': '{day} {time}に読みました'
    }
  };

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  var RECENT_FOREIGN_KEY = 'gomna_recent_foreign_language';
  var DEFAULT_QUICK_FOREIGN = 'en';
  var GT_CLEAR_GUARD_KEY = 'gomna_first_visit_gt_cleared';

  function clearIncompleteGoogTrans() {
    try {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      if (typeof location !== 'undefined' && location.hostname) {
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + location.hostname;
        var host = String(location.hostname || '');
        if (host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
          var parts = host.split('.');
          var dom = '.' + parts.slice(-2).join('.');
          document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + dom;
        }
      }
    } catch (e) { /* ignore */ }
  }

  function clearStaleGoogTransOnce() {
    try {
      if (sessionStorage.getItem(GT_CLEAR_GUARD_KEY) === '1') return;
      sessionStorage.setItem(GT_CLEAR_GUARD_KEY, '1');
    } catch (eGuard) { /* ignore */ }
    clearIncompleteGoogTrans();
  }

  function readGoogTransTarget() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (!m) return '';
      var raw = decodeURIComponent(m[1] || '');
      var parts = String(raw || '').split('/');
      var target = parts[2] || '';
      if (!target || target === 'null' || target === 'undefined') {
        clearIncompleteGoogTrans();
        return '';
      }
      return target;
    } catch (e) {
      return '';
    }
  }

  function setGoogTransCookie(targetLang) {
    if (!targetLang || targetLang === 'ko') {
      clearIncompleteGoogTrans();
      return;
    }
    try {
      var value = '/ko/' + targetLang;
      var maxAge = '; max-age=' + (60 * 60 * 24 * 365);
      document.cookie = 'googtrans=' + value + '; path=/' + maxAge;
      if (typeof location !== 'undefined' && location.hostname) {
        var host = String(location.hostname || '');
        if (host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
          var parts = host.split('.');
          var dom = '.' + parts.slice(-2).join('.');
          document.cookie = 'googtrans=' + value + '; path=/; domain=' + dom + maxAge;
        }
      }
    } catch (e) { /* ignore */ }
  }

  var QUICK_LANGUAGES = ['ko', 'en'];
  var GOOGLE_HOME_LANGS = {
    es: 1, pt: 1, fr: 1, de: 1, vi: 1, hi: 1, id: 1, tl: 1, sw: 1, af: 1,
    zh: 1, 'zh-cn': 1, 'zh-tw': 1
  };

  /**
   * Browser / phone preferred language for first-visit home only.
   * Quick buttons are separate and always KO·EN.
   */
  function detectBrowserPreferredLanguage() {
    var list = [];
    try {
      if (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length) {
        for (var i = 0; i < navigator.languages.length; i++) list.push(navigator.languages[i]);
      }
    } catch (e0) { /* ignore */ }
    try {
      if (typeof navigator !== 'undefined') {
        list.push(navigator.language || navigator.userLanguage || '');
      }
    } catch (e1) { /* ignore */ }

    for (var j = 0; j < list.length; j++) {
      var raw = String(list[j] || '').toLowerCase().replace(/_/g, '-');
      if (!raw) continue;
      if (raw.indexOf('ko') === 0) return { lang: 'ko', mode: 'native' };
      if (raw.indexOf('en') === 0) return { lang: 'en', mode: 'native' };
      if (raw.indexOf('ja') === 0) return { lang: 'ja', mode: 'native' };
      if (raw.indexOf('zh') === 0) {
        var zh =
          raw.indexOf('tw') !== -1 ||
          raw.indexOf('hk') !== -1 ||
          raw.indexOf('hant') !== -1
            ? 'zh-TW'
            : 'zh-CN';
        return { lang: zh, mode: 'google' };
      }
      var primary = raw.split('-')[0];
      if (primary && GOOGLE_HOME_LANGS[primary]) {
        return { lang: primary, mode: 'google' };
      }
    }
    // Unsupported / undetectable → English home.
    return { lang: 'en', mode: 'native' };
  }

  /** Seed EN when empty. Never auto-seed JA from device/home language. */
  function ensureDefaultQuickForeign() {
    try {
      var existing = localStorage.getItem(RECENT_FOREIGN_KEY);
      if (!existing || existing === 'ko') {
        localStorage.setItem(RECENT_FOREIGN_KEY, DEFAULT_QUICK_FOREIGN);
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Unified initial home language decision.
   * 1) explicit localStorage ko/en/ja (app UI selection) — keep forever
   * 2) no app selection → browser/phone language (not leftover googtrans alone)
   * 3) ko/en/ja → native; known other → Google; unknown → en
   * Quick languages are always ["ko","en"] and are not derived from detection.
   */
  function resolveInitialHomeLanguage() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (isSupported(stored)) {
        ensureDefaultQuickForeign();
        return { lang: stored, mode: 'native', active: true, persisted: true };
      }
    } catch (e) { /* ignore */ }

    // First visit / no explicit app selection: ignore leftover googtrans as authority.
    clearStaleGoogTransOnce();
    var detected = detectBrowserPreferredLanguage();

    if (detected.mode === 'native' && isSupported(detected.lang)) {
      // Display-only auto detect — do NOT write gomna_ui_language.
      if (detected.lang === 'ko') clearIncompleteGoogTrans();
      else setGoogTransCookie(detected.lang);
      ensureDefaultQuickForeign();
      return { lang: detected.lang, mode: 'native', active: true, persisted: false };
    }

    if (detected.mode === 'google' && detected.lang) {
      setGoogTransCookie(detected.lang);
      ensureDefaultQuickForeign();
      return { lang: detected.lang, mode: 'google', active: false, persisted: false };
    }

    setGoogTransCookie('en');
    ensureDefaultQuickForeign();
    return { lang: 'en', mode: 'native', active: true, persisted: false };
  }

  function resolveLanguage() {
    var resolved = resolveInitialHomeLanguage();
    if (resolved.mode === 'native' && resolved.lang) {
      return {
        lang: resolved.lang,
        active: true,
        persisted: !!resolved.persisted
      };
    }
    return { lang: null, active: false, persisted: false };
  }

  function t(key, lang) {
    var code = isSupported(lang) ? lang : (active ? currentLang : 'ko');
    var pack = STRINGS[code] || STRINGS.ko;
    if (pack[key] != null && pack[key] !== '') return pack[key];
    if (STRINGS.ko[key] != null) return STRINGS.ko[key];
    return '';
  }

  function localeTag(lang) {
    if (lang === 'en') return 'en-US';
    if (lang === 'ja') return 'ja-JP';
    return 'ko-KR';
  }

  function translateBookName(bookKo, lang) {
    if (!bookKo) return bookKo;
    if (typeof global.GomnaTranslateBookName === 'function') {
      try { return global.GomnaTranslateBookName(bookKo, lang) || bookKo; } catch (e) { /* ignore */ }
    }
    return bookKo;
  }

  function formatBookChapter(bookKo, chapter, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var name = translateBookName(bookKo, code);
    var ch = String(chapter);
    if (code === 'en') return name + ' ' + ch;
    if (code === 'ja') return name + ' ' + ch + '章';
    return name + ' ' + ch + '장';
  }

  function formatRelativeDay(ts, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - that) / 86400000);
    if (diff <= 0) return t('home.relative.today', code);
    if (diff === 1) return t('home.relative.yesterday', code);
    try {
      return new Intl.DateTimeFormat(localeTag(code), { month: 'long', day: 'numeric' }).format(d);
    } catch (e) {
      return (d.getMonth() + 1) + '/' + d.getDate();
    }
  }

  function formatContinueTitle(bookKo, chapter, dayWord, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var base = formatBookChapter(bookKo, chapter, code);
    if (!dayWord) return base;
    if (code === 'en') {
      return base + ' · ' + t('home.continue.lastReadSuffix', code) + ' ' + dayWord;
    }
    if (code === 'ja') {
      return base + ' · ' + dayWord + t('home.continue.lastReadSuffix', code);
    }
    return base + ' · ' + dayWord + ' ' + t('home.continue.lastReadSuffix', code);
  }

  function formatContinueSub(dayWord, hhmm, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var template = t('home.continue.readAt', code);
    return template.replace('{day}', dayWord || '').replace('{time}', hhmm || '').replace(/\s+/g, ' ').trim();
  }

  function formatCalendarMonth(year, monthIndex, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var d = new Date(year, monthIndex, 1);
    try {
      if (code === 'ko') {
        return year + '년 ' + (monthIndex + 1) + '월';
      }
      return new Intl.DateTimeFormat(localeTag(code), { year: 'numeric', month: 'long' }).format(d);
    } catch (e) {
      return year + '/' + (monthIndex + 1);
    }
  }

  function formatCalendarDayAria(month1to12, day, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var d = new Date(2000, month1to12 - 1, day);
    try {
      if (code === 'ko') return month1to12 + '월 ' + day + '일';
      return new Intl.DateTimeFormat(localeTag(code), { month: 'long', day: 'numeric' }).format(d);
    } catch (e) {
      return month1to12 + '/' + day;
    }
  }

  function formatChapterCount(n, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var num = String(n);
    if (code === 'en') return num;
    if (code === 'ja') return num + '章';
    return num + '장';
  }

  function markOwned(el) {
    if (!el || !el.getAttribute) return;
    if (el.getAttribute(OWNED_ATTR) !== '1') el.setAttribute(OWNED_ATTR, '1');
    if (el.getAttribute('translate') !== 'no') el.setAttribute('translate', 'no');
    if (!el.classList.contains('notranslate')) el.classList.add('notranslate');
  }

  function clearOwned(el) {
    if (!el || !el.getAttribute) return;
    if (el.getAttribute(OWNED_ATTR) === '1') {
      el.removeAttribute('translate');
      el.removeAttribute(OWNED_ATTR);
      el.classList.remove('notranslate');
    }
  }

  function applyAttr(el, kind, value) {
    if (!el || value == null || value === '') return;
    if (kind === 'text') {
      if (el.tagName === 'IMG') {
        if (el.getAttribute('alt') !== value) el.setAttribute('alt', value);
      } else if ((el.textContent || '') !== value) {
        el.textContent = value;
      }
    } else if (kind === 'placeholder') {
      if (el.getAttribute('placeholder') !== value) el.setAttribute('placeholder', value);
    } else if (kind === 'aria') {
      if (el.getAttribute('aria-label') !== value) el.setAttribute('aria-label', value);
    } else if (kind === 'title') {
      if (el.getAttribute('title') !== value) el.setAttribute('title', value);
    }
  }

  function applyToTree(root, lang) {
    if (!root || !root.querySelectorAll) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var attr = ATTRS[a][0];
      var kind = ATTRS[a][1];
      var nodes = root.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var key = el.getAttribute(attr);
        if (!key) continue;
        var value = t(key, lang);
        if (!value) value = t(key, 'ko');
        if (!value) continue;
        applyAttr(el, kind, value);
        markOwned(el);
      }
    }
  }

  function clearBoot() {
    bootCleared = true;
    try { document.documentElement.classList.remove('gomna-ui-i18n-boot'); } catch (e) { /* ignore */ }
  }

  function apply(lang, opts) {
    var code = isSupported(lang) ? lang : 'ko';
    var persist = !(opts && opts.persist === false);
    currentLang = code;
    active = true;
    // Only explicit user choices (persist:true) write gomna_ui_language.
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    }

    var html = document.documentElement;
    if (html.lang !== (code === 'ja' ? 'ja' : (code === 'en' ? 'en' : 'ko'))) {
      html.lang = code === 'ja' ? 'ja' : (code === 'en' ? 'en' : 'ko');
    }
    if (!html.classList.contains('gomna-native-i18n-active')) {
      html.classList.add('gomna-native-i18n-active');
    }
    if (html.getAttribute('data-gomna-ui-lang') !== code) {
      html.setAttribute('data-gomna-ui-lang', code);
    }

    applyToTree(document, code);
    clearBoot();

    try {
      global.dispatchEvent(new CustomEvent('gomna:ui-language-changed', {
        bubbles: true,
        detail: { lang: code, source: persist ? 'native' : 'auto-detect', persisted: persist }
      }));
    } catch (e2) {
      try {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('gomna:ui-language-changed', true, true, { lang: code, source: persist ? 'native' : 'auto-detect' });
        global.dispatchEvent(ev);
      } catch (e3) { /* ignore */ }
    }
    return code;
  }

  function setLanguage(lang) {
    if (!isSupported(lang)) return getLanguage();
    return apply(lang, { persist: true });
  }

  function deactivate() {
    active = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    var html = document.documentElement;
    html.classList.remove('gomna-native-i18n-active');
    html.removeAttribute('data-gomna-ui-lang');
    var owned = document.querySelectorAll('[' + OWNED_ATTR + '="1"]');
    for (var i = 0; i < owned.length; i++) clearOwned(owned[i]);
    clearBoot();
  }

  function getLanguage() {
    try {
      var attr = document.documentElement.getAttribute('data-gomna-ui-lang');
      if (isSupported(attr)) return attr;
    } catch (e) { /* ignore */ }
    if (active && isSupported(currentLang)) return currentLang;
    var resolved = resolveLanguage();
    if (resolved.active && resolved.lang) return resolved.lang;
    return 'ko';
  }

  function boot() {
    var resolved = resolveLanguage();
    if (!resolved.active || !resolved.lang) {
      active = false;
      clearBoot();
      return;
    }
    var applyOpts = { persist: !!resolved.persisted };
    if (document.body) {
      apply(resolved.lang, applyOpts);
    } else {
      currentLang = resolved.lang;
      active = true;
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady);
        apply(resolved.lang, applyOpts);
      });
    }
    setTimeout(clearBoot, 800);
  }

  global.GomnaUII18n = {
    supportedLanguages: SUPPORTED.slice(),
    quickLanguages: QUICK_LANGUAGES.slice(),
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    apply: apply,
    deactivate: deactivate,
    clearBoot: clearBoot,
    t: t,
    formatBookChapter: formatBookChapter,
    formatRelativeDay: formatRelativeDay,
    formatContinueTitle: formatContinueTitle,
    formatContinueSub: formatContinueSub,
    formatCalendarMonth: formatCalendarMonth,
    formatCalendarDayAria: formatCalendarDayAria,
    formatChapterCount: formatChapterCount,
    isActive: function () {
      try {
        if (document.documentElement.classList.contains('gomna-native-i18n-active')) return true;
      } catch (e) { /* ignore */ }
      return !!active;
    },
    resolveLanguage: resolveLanguage,
    resolveInitialHomeLanguage: resolveInitialHomeLanguage,
    detectBrowserPreferredLanguage: detectBrowserPreferredLanguage
  };

  boot();
})(typeof window !== 'undefined' ? window : this);
