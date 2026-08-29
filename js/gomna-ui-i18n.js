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
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': '은혜의말씀',
      'home.greeting.morning': '— 좋은 아침입니다 —',
      'home.greeting.afternoon': '— 평안한 오후입니다 —',
      'home.greeting.evening': '— 고요한 저녁입니다 —',
      'home.continue.start': '처음부터 성경 읽기',
      'home.continue.sectionTitle': '이어서',
      'home.continue.readCta': '계속 읽기',
      'home.continue.listenCta': '계속 듣기',
      'home.continue.resume': '이어서 읽기',
      'home.continue.aria': '이어서 읽기',
      'home.todayWord.tag': '오늘의 말씀',
      'home.todayWord.backToday': '오늘로 돌아가기',
      'home.todayWord.otherDate': '다른 날짜 보기',
      'home.todayWord.open': '묵상하기',
      'home.todayWord.openNote': '오늘 말씀 기준으로 읽고 묵상하기',
      'home.quick.read': '읽기',
      'home.quick.readDesc': '책·장·절로',
      'home.quick.audio': '듣기',
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
      'home.easyFind.title': '쉬운 찾기',
      'home.easyFind.desc': '분류별로 찾기 ›',
      'search.placeholder.home': '말씀 찾기 (예: 사랑, 믿음, 요한복음 3장 16절)',
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
      /* 홈 하단 메뉴 행 오른쪽의 작은 「열기」 알약 */
      'home.menu.openCta': '열기',
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
      'home.relative.daysAgo': '{n}일 전',
      'home.continue.lastReadSuffix': '읽던 곳',
      'home.continue.readAt': '{day} {time}에 읽었습니다',
      'home.resume.readPlace': '읽던 곳',
      'home.resume.listenPlace': '듣던 곳',
      'home.resume.listenCta': '이어서 듣기',
      'home.resume.listenAria': '이어서 듣기',
      'home.resume.recent': '최근 말씀',
      'home.resume.recentEmpty': '아직 기록이 없습니다',
      'home.resume.readStart': '성경읽기 시작',
      'home.resume.listenStart': '말씀 듣기 시작'
    },
    en: {
      'brand.title': 'Word of Grace',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': 'Word of Grace',
      'home.greeting.morning': '— Good morning —',
      'home.greeting.afternoon': '— Have a peaceful afternoon —',
      'home.greeting.evening': '— Have a quiet evening —',
      'home.continue.start': 'Start Reading the Bible',
      'home.continue.sectionTitle': 'Continue',
      'home.continue.readCta': 'Continue reading',
      'home.continue.listenCta': 'Continue listening',
      'home.continue.resume': 'Continue Reading',
      'home.continue.aria': 'Continue reading',
      'home.todayWord.tag': 'Verse of the Day',
      'home.todayWord.backToday': 'Back to Today',
      'home.todayWord.otherDate': 'View Another Date',
      'home.todayWord.open': 'Reflect',
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
      'home.menu.openCta': 'Open',
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
      'home.relative.daysAgo': '{n} days ago',
      'home.continue.lastReadSuffix': 'Last read',
      'home.continue.readAt': 'Read {day} at {time}',
      'home.resume.readPlace': 'Last read',
      'home.resume.listenPlace': 'Last listened',
      'home.resume.listenCta': 'Continue Listening',
      'home.resume.listenAria': 'Continue listening',
      'home.resume.recent': 'Recent',
      'home.resume.recentEmpty': 'No recent verses yet',
      'home.resume.readStart': 'Start Bible reading',
      'home.resume.listenStart': 'Start listening'
    },
    ja: {
      'brand.title': '恵みのみことば',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': '恵みのみことば',
      'home.greeting.morning': '— おはようございます —',
      'home.greeting.afternoon': '— 穏やかな午後をお過ごしください —',
      'home.greeting.evening': '— 静かな夜をお過ごしください —',
      'home.continue.start': '聖書を最初から読む',
      'home.continue.sectionTitle': '続きから',
      'home.continue.readCta': '続きを読む',
      'home.continue.listenCta': '続きを聴く',
      'home.continue.resume': '続きを読む',
      'home.continue.aria': '続きを読む',
      'home.todayWord.tag': '今日の聖句',
      'home.todayWord.backToday': '今日に戻る',
      'home.todayWord.otherDate': '別の日を見る',
      'home.todayWord.open': '黙想する',
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
      'home.menu.openCta': '開く',
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
      'home.relative.daysAgo': '{n}日前',
      'home.continue.lastReadSuffix': 'に読んだ箇所',
      'home.continue.readAt': '{day} {time}に読みました',
      'home.resume.readPlace': '読んだ箇所',
      'home.resume.listenPlace': '聴いた箇所',
      'home.resume.listenCta': '続きを聴く',
      'home.resume.listenAria': '続きを聴く',
      'home.resume.recent': '最近の聖句',
      'home.resume.recentEmpty': 'まだ記録がありません',
      'home.resume.readStart': '聖書を読み始める',
      'home.resume.listenStart': 'みことばを聴き始める'
    }
  };

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  var RECENT_FOREIGN_KEY = 'gomna_recent_foreign_language';
  var DEFAULT_QUICK_FOREIGN = 'en';
  // Supported Google targets from COUNTRIES (non-ko). Keep valid user choices.
  var GT_TARGET_SET = {
    af: 1, am: 1, ar: 1, az: 1, be: 1, bg: 1, bn: 1, bs: 1, cs: 1, da: 1,
    de: 1, el: 1, en: 1, es: 1, et: 1, fa: 1, fi: 1, fr: 1, hi: 1, hr: 1,
    hu: 1, hy: 1, id: 1, is: 1, it: 1, iw: 1, ja: 1, ka: 1, kk: 1, km: 1,
    lo: 1, lt: 1, lv: 1, mg: 1, mk: 1, mn: 1, ms: 1, mt: 1, my: 1, ne: 1,
    nl: 1, no: 1, pl: 1, ps: 1, pt: 1, ro: 1, ru: 1, rw: 1, si: 1, sk: 1,
    sl: 1, so: 1, sq: 1, sr: 1, sv: 1, sw: 1, th: 1, tl: 1, tr: 1, uk: 1,
    ur: 1, uz: 1, vi: 1, 'zh-CN': 1, 'zh-TW': 1
  };

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

  function normalizeGoogTransTarget(rawTarget) {
    var t = String(rawTarget || '').trim();
    if (!t) return '';
    if (t === 'zh-cn' || t === 'zh_cn') return 'zh-CN';
    if (t === 'zh-tw' || t === 'zh_tw') return 'zh-TW';
    if (/^[a-z]{2}$/i.test(t)) return t.toLowerCase();
    return t;
  }

  // Keep valid /ko/<target> user choices. Incomplete/unsupported → ''.
  function readValidGoogTransTarget() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (!m) return '';
      var raw = decodeURIComponent(m[1] || '');
      var parts = String(raw || '').split('/');
      var source = parts[1] || '';
      var target = normalizeGoogTransTarget(parts[2] || '');
      if (!source || !target) return '';
      if (target === 'ko' || target === 'null' || target === 'undefined') return '';
      if (!GT_TARGET_SET[target]) return '';
      return target;
    } catch (e) {
      return '';
    }
  }

  function readGoogTransTarget() {
    var valid = readValidGoogTransTarget();
    if (valid) return valid;
    try {
      if (/(?:^|;\s*)googtrans=/.test(document.cookie || '')) clearIncompleteGoogTrans();
    } catch (eClear) { /* ignore */ }
    return '';
  }

  function clearInvalidGoogTransOnly() {
    try {
      if (!/(?:^|;\s*)googtrans=/.test(document.cookie || '')) return;
      if (readValidGoogTransTarget()) return;
      clearIncompleteGoogTrans();
    } catch (eInv) { /* ignore */ }
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
   * 2) valid googtrans user choice (/ko/tl|/ko/en|/ko/ja|/ko/vi…) — keep
   * 3) no app/cookie selection → app default language (never browser auto-switch)
   * 브라우저 선호 언어는 홈 헤더의 스마트 언어 제안 힌트로만 쓴다.
   * Quick languages are always ["ko","en"] and are not derived from detection.
   */
  function resolveInitialHomeLanguage() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (isSupported(stored)) {
        if (stored === 'ko') clearIncompleteGoogTrans();
        ensureDefaultQuickForeign();
        return { lang: stored, mode: 'native', active: true, persisted: true };
      }
    } catch (e) { /* ignore */ }

    // Honor explicit Google target before browser-ko auto-detect clears it.
    var validGt = readValidGoogTransTarget();
    if (validGt) {
      ensureDefaultQuickForeign();
      if (validGt === 'en' || validGt === 'ja') {
        return { lang: validGt, mode: 'native', active: true, persisted: false };
      }
      return { lang: validGt, mode: 'google', active: false, persisted: false };
    }

    clearInvalidGoogTransOnly();
    ensureDefaultQuickForeign();
    return { lang: SUPPORTED[0], mode: 'native', active: true, persisted: false };
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
    var code = lang || currentLang || 'ko';
    var name = translateBookName(bookKo, code);
    var ch = String(chapter);
    if (code === 'ko') return name + ' ' + ch + '장';
    if (code === 'ja') return name + ' ' + ch + '章';
    // en + Google targets (tl/vi/…): localized book + bare chapter (no Korean units)
    return name + ' ' + ch;
  }

  /** Full scripture location for home resume cards (display-only). */
  function formatBookChapterVerse(bookKo, chapter, verse, lang) {
    var code = lang || currentLang || 'ko';
    var name = translateBookName(bookKo, code);
    var ch = String(chapter);
    var v = String(verse);
    if (code === 'ko') return name + ' ' + ch + '장 ' + v + '절';
    if (code === 'ja') return name + ' ' + ch + '章 ' + v + '節';
    // en + Google targets: localized book + ch:v (avoids leftover 장/절)
    return name + ' ' + ch + ':' + v;
  }

  function formatRelativeDay(ts, lang) {
    // Native packs: ko/en/ja. Other Google targets fall back to en (never ko leftovers).
    var code = isSupported(lang) ? lang : 'en';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - that) / 86400000);
    if (diff <= 0) return t('home.relative.today', code);
    if (diff === 1) return t('home.relative.yesterday', code);
    if (diff >= 2 && diff <= 6) {
      return String(t('home.relative.daysAgo', code) || '{n}일 전').replace('{n}', String(diff));
    }
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
    try {
      if (global.__gomnaUiI18nBootFailsafe) {
        clearTimeout(global.__gomnaUiI18nBootFailsafe);
        global.__gomnaUiI18nBootFailsafe = null;
      }
    } catch (eFs) { /* ignore */ }
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
    try {
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
          try {
            apply(resolved.lang, applyOpts);
          } catch (eApply) {
            clearBoot();
          }
        });
      }
    } catch (eBoot) {
      try { clearBoot(); } catch (eClear) { /* ignore */ }
    } finally {
      // Always schedule a late clear so exceptions cannot leave i18n-boot stuck.
      setTimeout(clearBoot, 800);
    }
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
    formatBookChapterVerse: formatBookChapterVerse,
    formatRelativeDay: formatRelativeDay,
    formatContinueTitle: formatContinueTitle,
    formatContinueSub: formatContinueSub,
    formatCalendarMonth: formatCalendarMonth,
    formatCalendarDayAria: formatCalendarDayAria,
    formatChapterCount: formatChapterCount,
    readValidGoogTransTarget: readValidGoogTransTarget,
    isActive: function () {
      try {
        if (document.documentElement.classList.contains('gomna-native-i18n-active')) return true;
      } catch (e) { /* ignore */ }
      return !!active;
    },
    resolveLanguage: resolveLanguage,
    resolveInitialHomeLanguage: resolveInitialHomeLanguage
  };

  boot();
})(typeof window !== 'undefined' ? window : this);
