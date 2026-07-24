/* translate_feature.js — Globe (🌐) language switcher for 은혜의말씀
 * - Adds a globe button immediately to the left of `.settings-btn` in the header.
 * - Opens a panel with: auto-detected language, recently used, 8 popular flags, and full search (120+ countries).
 * - Selecting a country redirects to Google Translate (translate.goog full-page mode) for that language.
 * - Adapts to both light header (index.html) and dark header (reader.html) automatically.
 */
(function () {
  'use strict';

  if (window.__gtFeatureInited) return;
  window.__gtFeatureInited = true;

  // ------------------------------------------------------------------
  // Country / language data
  // Tuple shape: [ISO2, koCountry, enCountry, googleTranslateLangCode, koLanguage, nativeLanguage]
  // ------------------------------------------------------------------
  const COUNTRIES = [
    ['US', '미국', 'United States', 'en', '영어', 'English'],
    ['GB', '영국', 'United Kingdom', 'en', '영어', 'English'],
    ['CA', '캐나다', 'Canada', 'en', '영어', 'English'],
    ['AU', '호주', 'Australia', 'en', '영어', 'English'],
    ['NZ', '뉴질랜드', 'New Zealand', 'en', '영어', 'English'],
    ['IE', '아일랜드', 'Ireland', 'en', '영어', 'English'],
    ['SG', '싱가포르', 'Singapore', 'en', '영어', 'English'],
    ['NG', '나이지리아', 'Nigeria', 'en', '영어', 'English'],
    ['GH', '가나', 'Ghana', 'en', '영어', 'English'],
    ['ZW', '짐바브웨', 'Zimbabwe', 'en', '영어', 'English'],
    ['KE', '케냐', 'Kenya', 'sw', '스와힐리어', 'Kiswahili'],
    ['TZ', '탄자니아', 'Tanzania', 'sw', '스와힐리어', 'Kiswahili'],
    ['UG', '우간다', 'Uganda', 'sw', '스와힐리어', 'Kiswahili'],
    ['RW', '르완다', 'Rwanda', 'rw', '키냐르완다어', 'Kinyarwanda'],
    ['ZA', '남아프리카공화국', 'South Africa', 'af', '아프리칸스어', 'Afrikaans'],
    ['ET', '에티오피아', 'Ethiopia', 'am', '암하라어', 'አማርኛ'],
    ['SO', '소말리아', 'Somalia', 'so', '소말리아어', 'Soomaali'],
    ['MG', '마다가스카르', 'Madagascar', 'mg', '말라가시어', 'Malagasy'],
    ['SN', '세네갈', 'Senegal', 'fr', '프랑스어', 'Français'],
    ['CI', '코트디부아르', 'Ivory Coast', 'fr', '프랑스어', 'Français'],
    ['MA', '모로코', 'Morocco', 'ar', '아랍어', 'العربية'],
    ['DZ', '알제리', 'Algeria', 'ar', '아랍어', 'العربية'],
    ['TN', '튀니지', 'Tunisia', 'ar', '아랍어', 'العربية'],
    ['LY', '리비아', 'Libya', 'ar', '아랍어', 'العربية'],
    ['SD', '수단', 'Sudan', 'ar', '아랍어', 'العربية'],
    ['EG', '이집트', 'Egypt', 'ar', '아랍어', 'العربية'],
    ['SA', '사우디아라비아', 'Saudi Arabia', 'ar', '아랍어', 'العربية'],
    ['AE', '아랍에미리트', 'UAE', 'ar', '아랍어', 'العربية'],
    ['SY', '시리아', 'Syria', 'ar', '아랍어', 'العربية'],
    ['JO', '요르단', 'Jordan', 'ar', '아랍어', 'العربية'],
    ['LB', '레바논', 'Lebanon', 'ar', '아랍어', 'العربية'],
    ['IQ', '이라크', 'Iraq', 'ar', '아랍어', 'العربية'],
    ['KW', '쿠웨이트', 'Kuwait', 'ar', '아랍어', 'العربية'],
    ['QA', '카타르', 'Qatar', 'ar', '아랍어', 'العربية'],
    ['BH', '바레인', 'Bahrain', 'ar', '아랍어', 'العربية'],
    ['OM', '오만', 'Oman', 'ar', '아랍어', 'العربية'],
    ['YE', '예멘', 'Yemen', 'ar', '아랍어', 'العربية'],
    ['IL', '이스라엘', 'Israel', 'iw', '히브리어', 'עברית'],
    ['IR', '이란', 'Iran', 'fa', '페르시아어', 'فارسی'],
    ['AF', '아프가니스탄', 'Afghanistan', 'ps', '파슈토어', 'پښتو'],
    ['PK', '파키스탄', 'Pakistan', 'ur', '우르두어', 'اردو'],
    ['IN', '인도', 'India', 'hi', '힌디어', 'हिन्दी'],
    ['BD', '방글라데시', 'Bangladesh', 'bn', '벵골어', 'বাংলা'],
    ['LK', '스리랑카', 'Sri Lanka', 'si', '싱할라어', 'සිංහල'],
    ['NP', '네팔', 'Nepal', 'ne', '네팔어', 'नेपाली'],
    ['MM', '미얀마', 'Myanmar', 'my', '미얀마어', 'မြန်မာ'],
    ['KH', '캄보디아', 'Cambodia', 'km', '크메르어', 'ខ្មែរ'],
    ['LA', '라오스', 'Laos', 'lo', '라오어', 'ລາວ'],
    ['TH', '태국', 'Thailand', 'th', '태국어', 'ไทย'],
    ['VN', '베트남', 'Vietnam', 'vi', '베트남어', 'Tiếng Việt'],
    ['MY', '말레이시아', 'Malaysia', 'ms', '말레이어', 'Melayu'],
    ['ID', '인도네시아', 'Indonesia', 'id', '인도네시아어', 'Bahasa Indonesia'],
    ['PH', '필리핀', 'Philippines', 'tl', '필리핀어', 'Filipino'],
    ['MN', '몽골', 'Mongolia', 'mn', '몽골어', 'Монгол'],
    ['CN', '중국', 'China', 'zh-CN', '중국어 (간체)', '简体中文'],
    ['TW', '대만', 'Taiwan', 'zh-TW', '중국어 (번체)', '繁體中文'],
    ['HK', '홍콩', 'Hong Kong', 'zh-TW', '중국어 (번체)', '繁體中文'],
    ['MO', '마카오', 'Macau', 'zh-TW', '중국어 (번체)', '繁體中文'],
    ['JP', '일본', 'Japan', 'ja', '일본어', '日本語'],
    ['KR', '한국', 'South Korea', 'ko', '한국어', '한국어'],
    ['KZ', '카자흐스탄', 'Kazakhstan', 'kk', '카자흐어', 'Қазақша'],
    ['UZ', '우즈베키스탄', 'Uzbekistan', 'uz', '우즈베크어', 'Oʻzbekcha'],
    ['AZ', '아제르바이잔', 'Azerbaijan', 'az', '아제르바이잔어', 'Azərbaycanca'],
    ['GE', '조지아', 'Georgia', 'ka', '조지아어', 'ქართული'],
    ['AM', '아르메니아', 'Armenia', 'hy', '아르메니아어', 'Հայերեն'],
    ['TR', '튀르키예', 'Turkey', 'tr', '튀르키예어', 'Türkçe'],
    ['CY', '키프로스', 'Cyprus', 'el', '그리스어', 'Ελληνικά'],
    ['GR', '그리스', 'Greece', 'el', '그리스어', 'Ελληνικά'],
    ['MT', '몰타', 'Malta', 'mt', '몰타어', 'Malti'],
    ['AL', '알바니아', 'Albania', 'sq', '알바니아어', 'Shqip'],
    ['MK', '북마케도니아', 'North Macedonia', 'mk', '마케도니아어', 'Македонски'],
    ['BA', '보스니아', 'Bosnia and Herzegovina', 'bs', '보스니아어', 'Bosanski'],
    ['RS', '세르비아', 'Serbia', 'sr', '세르비아어', 'Српски'],
    ['ME', '몬테네그로', 'Montenegro', 'sr', '세르비아어', 'Српски'],
    ['HR', '크로아티아', 'Croatia', 'hr', '크로아티아어', 'Hrvatski'],
    ['SI', '슬로베니아', 'Slovenia', 'sl', '슬로베니아어', 'Slovenščina'],
    ['BG', '불가리아', 'Bulgaria', 'bg', '불가리아어', 'Български'],
    ['RO', '루마니아', 'Romania', 'ro', '루마니아어', 'Română'],
    ['MD', '몰도바', 'Moldova', 'ro', '루마니아어', 'Română'],
    ['HU', '헝가리', 'Hungary', 'hu', '헝가리어', 'Magyar'],
    ['SK', '슬로바키아', 'Slovakia', 'sk', '슬로바키아어', 'Slovenčina'],
    ['CZ', '체코', 'Czech Republic', 'cs', '체코어', 'Čeština'],
    ['PL', '폴란드', 'Poland', 'pl', '폴란드어', 'Polski'],
    ['LT', '리투아니아', 'Lithuania', 'lt', '리투아니아어', 'Lietuvių'],
    ['LV', '라트비아', 'Latvia', 'lv', '라트비아어', 'Latviešu'],
    ['EE', '에스토니아', 'Estonia', 'et', '에스토니아어', 'Eesti'],
    ['BY', '벨라루스', 'Belarus', 'be', '벨라루스어', 'Беларуская'],
    ['UA', '우크라이나', 'Ukraine', 'uk', '우크라이나어', 'Українська'],
    ['RU', '러시아', 'Russia', 'ru', '러시아어', 'Русский'],
    ['FI', '핀란드', 'Finland', 'fi', '핀란드어', 'Suomi'],
    ['SE', '스웨덴', 'Sweden', 'sv', '스웨덴어', 'Svenska'],
    ['NO', '노르웨이', 'Norway', 'no', '노르웨이어', 'Norsk'],
    ['DK', '덴마크', 'Denmark', 'da', '덴마크어', 'Dansk'],
    ['IS', '아이슬란드', 'Iceland', 'is', '아이슬란드어', 'Íslenska'],
    ['NL', '네덜란드', 'Netherlands', 'nl', '네덜란드어', 'Nederlands'],
    ['BE', '벨기에', 'Belgium', 'nl', '네덜란드어', 'Nederlands'],
    ['DE', '독일', 'Germany', 'de', '독일어', 'Deutsch'],
    ['AT', '오스트리아', 'Austria', 'de', '독일어', 'Deutsch'],
    ['CH', '스위스', 'Switzerland', 'de', '독일어', 'Deutsch'],
    ['LU', '룩셈부르크', 'Luxembourg', 'fr', '프랑스어', 'Français'],
    ['FR', '프랑스', 'France', 'fr', '프랑스어', 'Français'],
    ['IT', '이탈리아', 'Italy', 'it', '이탈리아어', 'Italiano'],
    ['VA', '바티칸', 'Vatican City', 'it', '이탈리아어', 'Italiano'],
    ['ES', '스페인', 'Spain', 'es', '스페인어', 'Español'],
    ['MX', '멕시코', 'Mexico', 'es', '스페인어', 'Español'],
    ['AR', '아르헨티나', 'Argentina', 'es', '스페인어', 'Español'],
    ['CL', '칠레', 'Chile', 'es', '스페인어', 'Español'],
    ['CO', '콜롬비아', 'Colombia', 'es', '스페인어', 'Español'],
    ['PE', '페루', 'Peru', 'es', '스페인어', 'Español'],
    ['VE', '베네수엘라', 'Venezuela', 'es', '스페인어', 'Español'],
    ['EC', '에콰도르', 'Ecuador', 'es', '스페인어', 'Español'],
    ['CU', '쿠바', 'Cuba', 'es', '스페인어', 'Español'],
    ['UY', '우루과이', 'Uruguay', 'es', '스페인어', 'Español'],
    ['PY', '파라과이', 'Paraguay', 'es', '스페인어', 'Español'],
    ['BO', '볼리비아', 'Bolivia', 'es', '스페인어', 'Español'],
    ['CR', '코스타리카', 'Costa Rica', 'es', '스페인어', 'Español'],
    ['PA', '파나마', 'Panama', 'es', '스페인어', 'Español'],
    ['GT', '과테말라', 'Guatemala', 'es', '스페인어', 'Español'],
    ['HN', '온두라스', 'Honduras', 'es', '스페인어', 'Español'],
    ['NI', '니카라과', 'Nicaragua', 'es', '스페인어', 'Español'],
    ['SV', '엘살바도르', 'El Salvador', 'es', '스페인어', 'Español'],
    ['DO', '도미니카공화국', 'Dominican Republic', 'es', '스페인어', 'Español'],
    ['PR', '푸에르토리코', 'Puerto Rico', 'es', '스페인어', 'Español'],
    ['BR', '브라질', 'Brazil', 'pt', '포르투갈어', 'Português'],
    ['PT', '포르투갈', 'Portugal', 'pt', '포르투갈어', 'Português']
  ];

  // Popular flags — 4×5 = 20 countries, grouped by region.
  // Selection criteria: large Protestant Christian populations × high mobile
  // internet reach. Each region has exactly 4 flags so the grid stays a
  // clean 4-column layout on every device.
  const POPULAR_REGIONS = [
    { key: 'asia',     codes: ['KR', 'IN', 'JP', 'CN'] },
    { key: 'seasia',   codes: ['VN', 'ID', 'PH', 'AU'] },
    { key: 'americas', codes: ['US', 'CA', 'BR', 'MX'] },
    { key: 'europe',   codes: ['GB', 'FR', 'DE', 'ES'] },
    { key: 'africa',   codes: ['NG', 'KE', 'ZA', 'GH'] }
  ];

  // Flat list (used for backward-compatible iteration in a few helpers).
  const POPULAR_CODES = POPULAR_REGIONS.reduce(function (acc, r) {
    return acc.concat(r.codes);
  }, []);

  // Region header labels. Column order matches BOOK_LANG_IDX:
  // 0:ko 1:en 2:es 3:pt 4:zh 5:fr 6:de 7:ja 8:vi
  const REGION_LABELS = {
    asia:     ['아시아',            'Asia',                       'Asia',                          'Ásia',                          '亚洲',         'Asie',                       'Asien',                     'アジア',                 'Châu Á',                'एशिया',                          'Asia',                  'Asya',                         'Asia',                              'Asië'],
    seasia:   ['동남아·오세아니아',  'SE Asia & Oceania',          'Sudeste Asiático y Oceanía',    'Sudeste Asiático e Oceania',    '东南亚·大洋洲', 'Asie du SE & Océanie',       'Südostasien & Ozeanien',    '東南アジア・オセアニア',  'ĐNÁ & Châu Đại Dương',  'दक्षिण-पूर्व एशिया · ओशिनिया',  'Asia Tenggara & Oseania', 'Timog-silangang Asya · Oseanya', 'Asia ya Kusini Mashariki · Oceania', 'Suidoos-Asië & Oseanië'],
    americas: ['아메리카',          'Americas',                   'América',                       'Américas',                      '美洲',         'Amériques',                  'Amerika',                   '南北アメリカ',           'Châu Mỹ',                'अमेरिका',                       'Amerika',                'Amerika',                       'Amerika',                            'Amerika'],
    europe:   ['유럽',              'Europe',                     'Europa',                        'Europa',                        '欧洲',         'Europe',                     'Europa',                    'ヨーロッパ',             'Châu Âu',                'यूरोप',                          'Eropa',                  'Europa',                        'Ulaya',                              'Europa'],
    africa:   ['아프리카',          'Africa',                     'África',                        'África',                        '非洲',         'Afrique',                    'Afrika',                    'アフリカ',               'Châu Phi',               'अफ्रीका',                        'Afrika',                 'Africa',                        'Afrika',                             'Afrika']
  };

  // Per-language anchor country — used to highlight the user's current
  // language in the grid. If the user is viewing in Spanish, we want the
  // Mexico flag to glow (rather than just "any Spanish-speaking country").
  // KR is anchor for Korean, US for English, etc. Anchors match flags
  // that actually appear in POPULAR_REGIONS above.
  const LANG_ANCHOR = {
    'ko': 'KR', 'en': 'US', 'es': 'MX', 'pt': 'BR',
    'zh': 'CN', 'zh-CN': 'CN', 'zh-TW': 'CN',
    'fr': 'FR', 'de': 'DE', 'ja': 'JP', 'vi': 'VN',
    'hi': 'IN', 'id': 'ID', 'tl': 'PH', 'sw': 'KE',
    'af': 'ZA'
  };

  const STORAGE_KEY = 'gomna_translate_recent';

  // ------------------------------------------------------------------
  // Language modal i18n (KO / EN / JA; other app langs → English fallback).
  // Decided once when the modal opens — not from Google-translated DOM.
  // ------------------------------------------------------------------
  const MODAL_UI = {
    ko: {
      title: '언어 선택',
      popular: '인기 언어',
      viewAll: '🌐 125개국 전체 보기 〉',
      backPopular: '〈 인기 언어로 돌아가기',
      searchLabel: '국가 또는 언어 검색',
      searchPlaceholder: '국가명이나 언어를 입력하세요',
      noResults: '검색 결과 없음',
      detected: '자동 감지됨',
      recent: '최근 사용',
      footer: '© Gomna Studio, Inc. · Google 번역 제공 · 125개국 지원',
      close: '닫기',
      selected: '현재 언어',
      asia: '아시아',
      seasia: '동남아시아·오세아니아',
      americas: '아메리카',
      europe: '유럽',
      africa: '아프리카'
    },
    en: {
      title: 'Select Language',
      popular: 'Popular Languages',
      viewAll: '🌐 View All 125 Countries 〉',
      backPopular: '〈 Back to Popular Languages',
      searchLabel: 'Search by Country or Language',
      searchPlaceholder: 'Enter a country or language',
      noResults: 'No results found',
      detected: 'Detected',
      recent: 'Recent',
      footer: '© Gomna Studio, Inc. · Powered by Google Translate · 125 countries supported',
      close: 'Close',
      selected: 'Current language',
      asia: 'Asia',
      seasia: 'Southeast Asia & Oceania',
      americas: 'Americas',
      europe: 'Europe',
      africa: 'Africa'
    },
    ja: {
      title: '言語を選択',
      popular: '人気の言語',
      viewAll: '🌐 125か国をすべて表示 〉',
      backPopular: '〈 人気の言語に戻る',
      searchLabel: '国名または言語で検索',
      searchPlaceholder: '国名または言語を入力してください',
      noResults: '検索結果がありません',
      detected: '自動検出',
      recent: '最近使用',
      footer: '© Gomna Studio, Inc. · Google翻訳提供 · 125か国対応',
      close: '閉じる',
      selected: '現在の言語',
      asia: 'アジア',
      seasia: '東南アジア・オセアニア',
      americas: 'アメリカ',
      europe: 'ヨーロッパ',
      africa: 'アフリカ'
    }
  };

  // Full-list regional grouping for the same COUNTRIES dataset (no second list).
  const COUNTRY_REGION = (function () {
    var map = {};
    var groups = {
      africa: ['NG', 'GH', 'ZW', 'KE', 'TZ', 'UG', 'RW', 'ZA', 'ET', 'SO', 'MG', 'SN', 'CI', 'MA', 'DZ', 'TN', 'LY', 'SD', 'EG'],
      seasia: ['MM', 'KH', 'LA', 'TH', 'VN', 'MY', 'ID', 'PH', 'SG', 'AU', 'NZ'],
      americas: ['US', 'CA', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'CU', 'UY', 'PY', 'BO', 'CR', 'PA', 'GT', 'HN', 'NI', 'SV', 'DO', 'PR', 'BR'],
      europe: ['GB', 'IE', 'CY', 'GR', 'MT', 'AL', 'MK', 'BA', 'RS', 'ME', 'HR', 'SI', 'BG', 'RO', 'MD', 'HU', 'SK', 'CZ', 'PL', 'LT', 'LV', 'EE', 'BY', 'UA', 'RU', 'FI', 'SE', 'NO', 'DK', 'IS', 'NL', 'BE', 'DE', 'AT', 'CH', 'LU', 'FR', 'IT', 'VA', 'ES', 'PT'],
      asia: ['KR', 'IN', 'JP', 'CN', 'TW', 'HK', 'MO', 'MN', 'BD', 'LK', 'NP', 'PK', 'AF', 'IR', 'IL', 'SA', 'AE', 'SY', 'JO', 'LB', 'IQ', 'KW', 'QA', 'BH', 'OM', 'YE', 'KZ', 'UZ', 'AZ', 'GE', 'AM', 'TR']
    };
    Object.keys(groups).forEach(function (key) {
      groups[key].forEach(function (code) { map[code] = key; });
    });
    return map;
  })();

  const ALL_REGION_ORDER = ['asia', 'seasia', 'americas', 'europe', 'africa'];

  // Rare DisplayNames edge cases only (not a full triple-name table).
  const COUNTRY_NAME_EXCEPTIONS = {
    CI: { ko: '코트디부아르', en: 'Ivory Coast', ja: 'コートジボワール' },
    VA: { ko: '바티칸', en: 'Vatican City', ja: 'バチカン' },
    TW: { ko: '대만', en: 'Taiwan', ja: '台湾' },
    HK: { ko: '홍콩', en: 'Hong Kong', ja: '香港' },
    MO: { ko: '마카오', en: 'Macau', ja: 'マカオ' }
  };

  const COUNTRY_SEARCH_ALIASES = {
    US: ['usa', 'america', 'united states of america', '미국', 'アメリカ', '英語'],
    GB: ['uk', 'britain', 'england', 'great britain', '영국', 'イギリス'],
    KR: ['korea', 'south korea', '한국', '대한민국', '韓国', '韓国語', '한국어'],
    JP: ['japan', '일본', '日本', '日本語'],
    CN: ['china', 'prc', '중국', '中国', '中国語'],
    ZA: ['rsa', 's. africa', 'south africa', '남아공', '남아프리카', '南アフリカ'],
    AE: ['uae', 'emirates', '아랍에미리트', 'アラブ首長国連邦']
  };

  var _gtModalUiLang = 'ko';
  var _gtModalView = 'popular';
  var _displayNamesCache = {};

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function flag(code) {
    if (!code) return '🏳️';
    return code.toUpperCase().replace(/./g, function (c) {
      return String.fromCodePoint(127397 + c.charCodeAt(0));
    });
  }

  function findByCode(code) {
    for (let i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i][0] === code) return COUNTRIES[i];
    return null;
  }

  function resolveModalUiLang() {
    var code = 'ko';
    try {
      if (window.GomnaReaderLangBridge &&
          typeof window.GomnaReaderLangBridge.getActiveLanguage === 'function') {
        code = window.GomnaReaderLangBridge.getActiveLanguage() || 'ko';
      } else {
        code = getActiveLangCode() || 'ko';
      }
    } catch (e) {
      try { code = getActiveLangCode() || 'ko'; } catch (e2) { code = 'ko'; }
    }
    code = String(code || 'ko').toLowerCase();
    if (code === 'ko' || code.indexOf('ko-') === 0) return 'ko';
    if (code === 'en' || code.indexOf('en-') === 0) return 'en';
    if (code === 'ja' || code.indexOf('ja-') === 0) return 'ja';
    return 'en';
  }

  function getModalUi() {
    return MODAL_UI[_gtModalUiLang] || MODAL_UI.en;
  }

  function getModalRegionLabel(key) {
    var ui = getModalUi();
    return ui[key] || key;
  }

  function getLocalizedCountryName(iso2, uiLang, countryRow) {
    var lang = uiLang || 'en';
    var ex = COUNTRY_NAME_EXCEPTIONS[iso2];
    if (ex) {
      if (lang === 'ko') return ex.ko;
      if (lang === 'ja') return ex.ja;
      return ex.en;
    }
    var locale = (lang === 'ko') ? 'ko-KR' : (lang === 'ja') ? 'ja-JP' : 'en';
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        if (!_displayNamesCache[locale]) {
          _displayNamesCache[locale] = new Intl.DisplayNames([locale], { type: 'region' });
        }
        var named = _displayNamesCache[locale].of(iso2);
        if (named) return named;
      }
    } catch (e) { /* fall through */ }
    var c = countryRow || findByCode(iso2);
    if (!c) return iso2;
    return (lang === 'ko') ? c[1] : c[2];
  }

  var _langNamesCache = {};
  function getLocalizedLanguageName(gtCode, uiLang) {
    if (!gtCode) return '';
    var code = (gtCode === 'iw') ? 'he' : String(gtCode);
    var locale = (uiLang === 'ko') ? 'ko' : (uiLang === 'ja') ? 'ja' : 'en';
    var cacheKey = locale + ':' + code;
    if (_langNamesCache[cacheKey] != null) return _langNamesCache[cacheKey];
    var named = '';
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        named = new Intl.DisplayNames([locale], { type: 'language' }).of(code) || '';
      }
    } catch (e) { named = ''; }
    _langNamesCache[cacheKey] = named;
    return named;
  }

  function getCountrySearchNames(c) {
    var names = [c[0], c[1], c[2], c[3], c[4], c[5]];
    try {
      names.push(getLocalizedCountryName(c[0], 'ko', c));
      names.push(getLocalizedCountryName(c[0], 'en', c));
      names.push(getLocalizedCountryName(c[0], 'ja', c));
      names.push(getLocalizedLanguageName(c[3], 'ko'));
      names.push(getLocalizedLanguageName(c[3], 'en'));
      names.push(getLocalizedLanguageName(c[3], 'ja'));
    } catch (e) { /* ignore */ }
    var aliases = COUNTRY_SEARCH_ALIASES[c[0]];
    if (aliases) names = names.concat(aliases);
    return names;
  }

  function getRecent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? findByCode(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveRecent(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
  }

  function detectLanguage() {
    const nav = ((navigator.language || navigator.userLanguage || 'en') + '').toLowerCase();
    if (nav.startsWith('ko')) return null; // already Korean — no need to suggest
    let match = COUNTRIES.find(function (c) { return c[3].toLowerCase() === nav; });
    if (match) return match;
    const part = nav.split('-')[0];
    match = COUNTRIES.find(function (c) { return c[3].toLowerCase().split('-')[0] === part; });
    return match || null;
  }

  // ----------------------------------------------------------------
  // Bible book name i18n (66 books × 8 languages).
  // Google Translate is unreliable for proper-noun Bible book names
  // (e.g., translates "신약" → "new drug"). We override with curated names
  // based on the standard translation in each language.
  // ----------------------------------------------------------------
  // Row tuple: [ko, en, es, pt, zh, fr, de, ja, vi]
  const BIBLE_BOOK_NAMES = [
['창세기', 'Genesis', 'Génesis', 'Gênesis', '创世记', 'Genèse', '1. Mose', '創世記', 'Sáng Thế Ký', 'उत्पत्ति', 'Kejadian', 'Genesis', 'Mwanzo', 'Genesis'],
    ['출애굽기', 'Exodus', 'Éxodo', 'Êxodo', '出埃及记', 'Exode', '2. Mose', '出エジプト記', 'Xuất Ê-díp-tô Ký', 'निर्गमन', 'Keluaran', 'Exodo', 'Kutoka', 'Eksodus'],
    ['레위기', 'Leviticus', 'Levítico', 'Levítico', '利未记', 'Lévitique', '3. Mose', 'レビ記', 'Lê-vi Ký', 'लैव्यव्यवस्था', 'Imamat', 'Levitico', 'Mambo ya Walawi', 'Levitikus'],
    ['민수기', 'Numbers', 'Números', 'Números', '民数记', 'Nombres', '4. Mose', '民数記', 'Dân Số Ký', 'गिनती', 'Bilangan', 'Mga Bilang', 'Hesabu', 'Numeri'],
    ['신명기', 'Deuteronomy', 'Deuteronomio', 'Deuteronômio', '申命记', 'Deutéronome', '5. Mose', '申命記', 'Phục Truyền Luật Lệ Ký', 'व्यवस्थाविवरण', 'Ulangan', 'Deuteronomio', 'Kumbukumbu la Torati', 'Deuteronomium'],
    ['여호수아', 'Joshua', 'Josué', 'Josué', '约书亚记', 'Josué', 'Josua', 'ヨシュア記', 'Giô-suê', 'यहोशू', 'Yosua', 'Josue', 'Yoshua', 'Josua'],
    ['사사기', 'Judges', 'Jueces', 'Juízes', '士师记', 'Juges', 'Richter', '士師記', 'Các Quan Xét', 'न्यायियों', 'Hakim-hakim', 'Mga Hukom', 'Waamuzi', 'Rigters'],
    ['룻기', 'Ruth', 'Rut', 'Rute', '路得记', 'Ruth', 'Rut', 'ルツ記', 'Ru-tơ', 'रूत', 'Rut', 'Ruth', 'Ruthu', 'Rut'],
    ['사무엘상', '1 Samuel', '1 Samuel', '1 Samuel', '撒母耳记上', '1 Samuel', '1. Samuel', 'サムエル記第一', '1 Sa-mu-ên', '1 शमूएल', '1 Samuel', '1 Samuel', '1 Samweli', '1 Samuel'],
    ['사무엘하', '2 Samuel', '2 Samuel', '2 Samuel', '撒母耳记下', '2 Samuel', '2. Samuel', 'サムエル記第二', '2 Sa-mu-ên', '2 शमूएल', '2 Samuel', '2 Samuel', '2 Samweli', '2 Samuel'],
    ['열왕기상', '1 Kings', '1 Reyes', '1 Reis', '列王纪上', '1 Rois', '1. Könige', '列王記第一', '1 Các Vua', '1 राजाओं', '1 Raja-raja', '1 Mga Hari', '1 Wafalme', '1 Konings'],
    ['열왕기하', '2 Kings', '2 Reyes', '2 Reis', '列王纪下', '2 Rois', '2. Könige', '列王記第二', '2 Các Vua', '2 राजाओं', '2 Raja-raja', '2 Mga Hari', '2 Wafalme', '2 Konings'],
    ['역대상', '1 Chronicles', '1 Crónicas', '1 Crônicas', '历代志上', '1 Chroniques', '1. Chronik', '歴代誌第一', '1 Sử Ký', '1 इतिहास', '1 Tawarikh', '1 Mga Cronica', '1 Mambo ya Nyakati', '1 Kronieke'],
    ['역대하', '2 Chronicles', '2 Crónicas', '2 Crônicas', '历代志下', '2 Chroniques', '2. Chronik', '歴代誌第二', '2 Sử Ký', '2 इतिहास', '2 Tawarikh', '2 Mga Cronica', '2 Mambo ya Nyakati', '2 Kronieke'],
    ['에스라', 'Ezra', 'Esdras', 'Esdras', '以斯拉记', 'Esdras', 'Esra', 'エズラ記', 'E-xơ-ra', 'एज्रा', 'Ezra', 'Ezra', 'Ezra', 'Esra'],
    ['느헤미야', 'Nehemiah', 'Nehemías', 'Neemias', '尼希米记', 'Néhémie', 'Nehemia', 'ネヘミヤ記', 'Nê-hê-mi', 'नहेमायाह', 'Nehemia', 'Nehemias', 'Nehemia', 'Nehemia'],
    ['에스더', 'Esther', 'Ester', 'Ester', '以斯帖记', 'Esther', 'Ester', 'エステル記', 'Ê-xơ-tê', 'एस्तेर', 'Ester', 'Ester', 'Esta', 'Ester'],
    ['욥기', 'Job', 'Job', 'Jó', '约伯记', 'Job', 'Hiob', 'ヨブ記', 'Gióp', 'अय्यूब', 'Ayub', 'Job', 'Ayubu', 'Job'],
    ['시편', 'Psalms', 'Salmos', 'Salmos', '诗篇', 'Psaumes', 'Psalmen', '詩篇', 'Thi Thiên', 'भजन संहिता', 'Mazmur', 'Mga Awit', 'Zaburi', 'Psalms'],
    ['잠언', 'Proverbs', 'Proverbios', 'Provérbios', '箴言', 'Proverbes', 'Sprüche', '箴言', 'Châm Ngôn', 'नीतिवचन', 'Amsal', 'Mga Kawikaan', 'Mithali', 'Spreuke'],
    ['전도서', 'Ecclesiastes', 'Eclesiastés', 'Eclesiastes', '传道书', 'Ecclésiaste', 'Prediger', '伝道者の書', 'Truyền Đạo', 'सभोपदेशक', 'Pengkhotbah', 'Mangangaral', 'Mhubiri', 'Prediker'],
    ['아가', 'Song of Songs', 'Cantares', 'Cânticos', '雅歌', 'Cantique des Cantiques', 'Hohelied', '雅歌', 'Nhã Ca', 'श्रेष्ठगीत', 'Kidung Agung', 'Awit ni Solomon', 'Wimbo Ulio Bora', 'Hooglied'],
    ['이사야', 'Isaiah', 'Isaías', 'Isaías', '以赛亚书', 'Ésaïe', 'Jesaja', 'イザヤ書', 'Ê-sai', 'यशायाह', 'Yesaya', 'Isaias', 'Isaya', 'Jesaja'],
    ['예레미야애가', 'Lamentations', 'Lamentaciones', 'Lamentações', '耶利米哀歌', 'Lamentations', 'Klagelieder', '哀歌', 'Ca Thương', 'विलापगीत', 'Ratapan', 'Panaghoy', 'Maombolezo', 'Klaagliedere'],
    ['예레미야', 'Jeremiah', 'Jeremías', 'Jeremias', '耶利米书', 'Jérémie', 'Jeremia', 'エレミヤ書', 'Giê-rê-mi', 'यिर्मयाह', 'Yeremia', 'Jeremias', 'Yeremia', 'Jeremia'],
    ['에스겔', 'Ezekiel', 'Ezequiel', 'Ezequiel', '以西结书', 'Ézéchiel', 'Hesekiel', 'エゼキエル書', 'Ê-xê-chi-ên', 'यहेजकेल', 'Yehezkiel', 'Ezekiel', 'Ezekieli', 'Esegiël'],
    ['다니엘', 'Daniel', 'Daniel', 'Daniel', '但以理书', 'Daniel', 'Daniel', 'ダニエル書', 'Đa-ni-ên', 'दानिय्येल', 'Daniel', 'Daniel', 'Danieli', 'Daniël'],
    ['호세아', 'Hosea', 'Oseas', 'Oséias', '何西阿书', 'Osée', 'Hosea', 'ホセア書', 'Ô-sê', 'होशे', 'Hosea', 'Oseas', 'Hosea', 'Hosea'],
    ['요엘', 'Joel', 'Joel', 'Joel', '约珥书', 'Joël', 'Joel', 'ヨエル書', 'Giô-ên', 'योएल', 'Yoel', 'Joel', 'Yoeli', 'Joël'],
    ['아모스', 'Amos', 'Amós', 'Amós', '阿摩司书', 'Amos', 'Amos', 'アモス書', 'A-mốt', 'आमोस', 'Amos', 'Amos', 'Amosi', 'Amos'],
    ['오바댜', 'Obadiah', 'Abdías', 'Obadias', '俄巴底亚书', 'Abdias', 'Obadja', 'オバデヤ書', 'Áp-đia', 'ओबद्याह', 'Obaja', 'Obadias', 'Obadia', 'Obadja'],
    ['요나', 'Jonah', 'Jonás', 'Jonas', '约拿书', 'Jonas', 'Jona', 'ヨナ書', 'Giô-na', 'योना', 'Yunus', 'Jonas', 'Yona', 'Jona'],
    ['미가', 'Micah', 'Miqueas', 'Miquéias', '弥迦书', 'Michée', 'Micha', 'ミカ書', 'Mi-chê', 'मीका', 'Mikha', 'Mikas', 'Mika', 'Miga'],
    ['나훔', 'Nahum', 'Nahúm', 'Naum', '那鸿书', 'Nahum', 'Nahum', 'ナホム書', 'Na-hum', 'नहूम', 'Nahum', 'Nahum', 'Nahumu', 'Nahum'],
    ['하박국', 'Habakkuk', 'Habacuc', 'Habacuque', '哈巴谷书', 'Habacuc', 'Habakuk', 'ハバクク書', 'Ha-ba-cúc', 'हबक्कूक', 'Habakuk', 'Habakuk', 'Habakuki', 'Habakuk'],
    ['스바냐', 'Zephaniah', 'Sofonías', 'Sofonias', '西番雅书', 'Sophonie', 'Zephanja', 'ゼパニヤ書', 'Sô-phô-ni', 'सपन्याह', 'Zefanya', 'Sofonias', 'Sefania', 'Sefanja'],
    ['학개', 'Haggai', 'Hageo', 'Ageu', '哈该书', 'Aggée', 'Haggai', 'ハガイ書', 'A-ghê', 'हाग्गै', 'Hagai', 'Hageo', 'Hagai', 'Haggai'],
    ['스가랴', 'Zechariah', 'Zacarías', 'Zacarias', '撒迦利亚书', 'Zacharie', 'Sacharja', 'ゼカリヤ書', 'Xa-cha-ri', 'जकर्याह', 'Zakharia', 'Zacarias', 'Zekaria', 'Sagaria'],
    ['말라기', 'Malachi', 'Malaquías', 'Malaquias', '玛拉基书', 'Malachie', 'Maleachi', 'マラキ書', 'Ma-la-chi', 'मलाकी', 'Maleakhi', 'Malakias', 'Malaki', 'Maleagi'],
    ['마태복음', 'Matthew', 'Mateo', 'Mateus', '马太福音', 'Matthieu', 'Matthäus', 'マタイの福音書', 'Ma-thi-ơ', 'मत्ती', 'Matius', 'Mateo', 'Mathayo', 'Matteus'],
    ['마가복음', 'Mark', 'Marcos', 'Marcos', '马可福音', 'Marc', 'Markus', 'マルコの福音書', 'Mác', 'मरकुस', 'Markus', 'Marcos', 'Marko', 'Markus'],
    ['누가복음', 'Luke', 'Lucas', 'Lucas', '路加福音', 'Luc', 'Lukas', 'ルカの福音書', 'Lu-ca', 'लूका', 'Lukas', 'Lucas', 'Luka', 'Lukas'],
    ['요한복음', 'John', 'Juan', 'João', '约翰福音', 'Jean', 'Johannes', 'ヨハネの福音書', 'Giăng', 'यूहन्ना', 'Yohanes', 'Juan', 'Yohana', 'Johannes'],
    ['사도행전', 'Acts', 'Hechos', 'Atos', '使徒行传', 'Actes', 'Apostelgeschichte', '使徒の働き', 'Công Vụ Các Sứ Đồ', 'प्रेरितों के काम', 'Kisah Para Rasul', 'Mga Gawa', 'Matendo ya Mitume', 'Handelinge'],
    ['로마서', 'Romans', 'Romanos', 'Romanos', '罗马书', 'Romains', 'Römer', 'ローマ人への手紙', 'Rô-ma', 'रोमियों', 'Roma', 'Mga Taga-Roma', 'Warumi', 'Romeine'],
    ['고린도전서', '1 Corinthians', '1 Corintios', '1 Coríntios', '哥林多前书', '1 Corinthiens', '1. Korinther', 'コリント人への第一の手紙', '1 Cô-rinh-tô', '1 कुरिन्थियों', '1 Korintus', '1 Mga Taga-Corinto', '1 Wakorintho', '1 Korintiërs'],
    ['고린도후서', '2 Corinthians', '2 Corintios', '2 Coríntios', '哥林多后书', '2 Corinthiens', '2. Korinther', 'コリント人への第二の手紙', '2 Cô-rinh-tô', '2 कुरिन्थियों', '2 Korintus', '2 Mga Taga-Corinto', '2 Wakorintho', '2 Korintiërs'],
    ['갈라디아서', 'Galatians', 'Gálatas', 'Gálatas', '加拉太书', 'Galates', 'Galater', 'ガラテヤ人への手紙', 'Ga-la-ti', 'गलातियों', 'Galatia', 'Mga Taga-Galacia', 'Wagalatia', 'Galasiërs'],
    ['에베소서', 'Ephesians', 'Efesios', 'Efésios', '以弗所书', 'Éphésiens', 'Epheser', 'エペソ人への手紙', 'Ê-phê-sô', 'इफिसियों', 'Efesus', 'Mga Taga-Efeso', 'Waefeso', 'Efesiërs'],
    ['빌립보서', 'Philippians', 'Filipenses', 'Filipenses', '腓立比书', 'Philippiens', 'Philipper', 'ピリピ人への手紙', 'Phi-líp', 'फिलिप्पियों', 'Filipi', 'Mga Taga-Filipos', 'Wafilipi', 'Filippense'],
    ['골로새서', 'Colossians', 'Colosenses', 'Colossenses', '歌罗西书', 'Colossiens', 'Kolosser', 'コロサイ人への手紙', 'Cô-lô-se', 'कुलुस्सियों', 'Kolose', 'Mga Taga-Colosas', 'Wakolosai', 'Kolossense'],
    ['데살로니가전서', '1 Thessalonians', '1 Tesalonicenses', '1 Tessalonicenses', '帖撒罗尼迦前书', '1 Thessaloniciens', '1. Thessalonicher', 'テサロニケ人への第一の手紙', '1 Tê-sa-lô-ni-ca', '1 थिस्सलुनीकियों', '1 Tesalonika', '1 Mga Taga-Tesalonica', '1 Wathesalonike', '1 Tessalonisense'],
    ['데살로니가후서', '2 Thessalonians', '2 Tesalonicenses', '2 Tessalonicenses', '帖撒罗尼迦后书', '2 Thessaloniciens', '2. Thessalonicher', 'テサロニケ人への第二の手紙', '2 Tê-sa-lô-ni-ca', '2 थिस्सलुनीकियों', '2 Tesalonika', '2 Mga Taga-Tesalonica', '2 Wathesalonike', '2 Tessalonisense'],
    ['디모데전서', '1 Timothy', '1 Timoteo', '1 Timóteo', '提摩太前书', '1 Timothée', '1. Timotheus', 'テモテへの第一の手紙', '1 Ti-mô-thê', '1 तीमुथियुस', '1 Timotius', '1 Timoteo', '1 Timotheo', '1 Timoteus'],
    ['디모데후서', '2 Timothy', '2 Timoteo', '2 Timóteo', '提摩太后书', '2 Timothée', '2. Timotheus', 'テモテへの第二の手紙', '2 Ti-mô-thê', '2 तीमुथियुस', '2 Timotius', '2 Timoteo', '2 Timotheo', '2 Timoteus'],
    ['디도서', 'Titus', 'Tito', 'Tito', '提多书', 'Tite', 'Titus', 'テトスへの手紙', 'Tít', 'तीतुस', 'Titus', 'Tito', 'Tito', 'Titus'],
    ['빌레몬서', 'Philemon', 'Filemón', 'Filemom', '腓利门书', 'Philémon', 'Philemon', 'ピレモンへの手紙', 'Phi-lê-môn', 'फिलेमोन', 'Filemon', 'Filemon', 'Filemoni', 'Filemon'],
    ['히브리서', 'Hebrews', 'Hebreos', 'Hebreus', '希伯来书', 'Hébreux', 'Hebräer', 'ヘブル人への手紙', 'Hê-bơ-rơ', 'इब्रानियों', 'Ibrani', 'Mga Hebreo', 'Waebrania', 'Hebreërs'],
    ['야고보서', 'James', 'Santiago', 'Tiago', '雅各书', 'Jacques', 'Jakobus', 'ヤコブの手紙', 'Gia-cơ', 'याकूब', 'Yakobus', 'Santiago', 'Yakobo', 'Jakobus'],
    ['베드로전서', '1 Peter', '1 Pedro', '1 Pedro', '彼得前书', '1 Pierre', '1. Petrus', 'ペテロの第一の手紙', '1 Phi-e-rơ', '1 पतरस', '1 Petrus', '1 Pedro', '1 Petro', '1 Petrus'],
    ['베드로후서', '2 Peter', '2 Pedro', '2 Pedro', '彼得后书', '2 Pierre', '2. Petrus', 'ペテロの第二の手紙', '2 Phi-e-rơ', '2 पतरस', '2 Petrus', '2 Pedro', '2 Petro', '2 Petrus'],
    ['요한일서', '1 John', '1 Juan', '1 João', '约翰一书', '1 Jean', '1. Johannes', 'ヨハネの第一の手紙', '1 Giăng', '1 यूहन्ना', '1 Yohanes', '1 Juan', '1 Yohana', '1 Johannes'],
    ['요한이서', '2 John', '2 Juan', '2 João', '约翰二书', '2 Jean', '2. Johannes', 'ヨハネの第二の手紙', '2 Giăng', '2 यूहन्ना', '2 Yohanes', '2 Juan', '2 Yohana', '2 Johannes'],
    ['요한삼서', '3 John', '3 Juan', '3 João', '约翰三书', '3 Jean', '3. Johannes', 'ヨハネの第三の手紙', '3 Giăng', '3 यूहन्ना', '3 Yohanes', '3 Juan', '3 Yohana', '3 Johannes'],
    ['유다서', 'Jude', 'Judas', 'Judas', '犹大书', 'Jude', 'Judas', 'ユダの手紙', 'Giu-đe', 'यहूदा', 'Yudas', 'Judas', 'Yuda', 'Judas'],
    ['요한계시록', 'Revelation', 'Apocalipsis', 'Apocalipse', '启示录', 'Apocalypse', 'Offenbarung', 'ヨハネの黙示録', 'Khải Huyền', 'प्रकाशितवाक्य', 'Wahyu', 'Pahayag', 'Ufunuo wa Yohana', 'Openbaring']
  ];

  // Map a Google Translate language code → column index in the row above.
  const BOOK_LANG_IDX = {
    'en': 1, 'es': 2, 'pt': 3,
    'zh-CN': 4, 'zh': 4, 'zh-TW': 4,
    'fr': 5, 'de': 6, 'ja': 7, 'vi': 8,
    'hi': 9, 'id': 10, 'tl': 11, 'sw': 12, 'af': 13
  };

  // Same column mapping is reused for category/UI/welcome i18n tables below.
  // Index 0 = ko (default for unsupported / Korean view).
  function getLangIdx(lang) {
    if (!lang) return 0;
    return BOOK_LANG_IDX[lang] || 0;
  }

  // ----------------------------------------------------------------
  // Bible category groupings — 10 universal biblical categories.
  // Each tuple: [key, emoji, [koBookNames]]
  // ----------------------------------------------------------------
  const BIBLE_CATEGORIES = [
    ['pentateuch',       '📜', ['창세기', '출애굽기', '레위기', '민수기', '신명기']],
    ['history_ot',       '🏛', ['여호수아', '사사기', '룻기', '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더']],
    ['wisdom',           '🎵', ['욥기', '시편', '잠언', '전도서', '아가']],
    ['major_prophets',   '🔥', ['이사야', '예레미야', '예레미야애가', '에스겔', '다니엘']],
    ['minor_prophets',   '⚡', ['호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기']],
    ['gospels',          '✝️', ['마태복음', '마가복음', '누가복음', '요한복음']],
    ['acts',             '🚀', ['사도행전']],
    ['pauline',          '📨', ['로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서']],
    ['general_epistles', '💌', ['히브리서', '야고보서', '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서']],
    ['revelation',       '🌟', ['요한계시록']]
  ];

  // Long category labels (for modal titles). Order: ko, en, es, pt, zh, fr, de, ja, vi
  const CATEGORY_LABELS = {
    'pentateuch': ['모세오경',   'Pentateuch',         'Pentateuco',           'Pentateuco',           '摩西五经',  'Pentateuque',           'Pentateuch',          'モーセ五書', 'Ngũ Kinh Môi-se', 'मूसा की पाँच पुस्तकें', 'Lima Kitab Musa', 'Pentateuko', 'Pentateuko (Vitabu Vitano vya Musa)', 'Pentateug'],
    'history_ot': ['역사서',     'History',            'Históricos',           'Históricos',           '历史书',    'Livres historiques',    'Geschichtsbücher',    '歴史書',     'Sách Lịch Sử', 'ऐतिहासिक पुस्तकें', 'Kitab-kitab Sejarah', 'Mga Aklat Pangkasaysayan', 'Vitabu vya Historia', 'Historiese Boeke'],
    'wisdom': ['시가서',     'Wisdom',             'Sapienciales',         'Sapienciais',          '诗歌智慧书', 'Livres de sagesse',     'Weisheitsliteratur',  '詩歌・知恵',  'Sách Văn Thơ', 'काव्य पुस्तकें', 'Kitab Hikmat', 'Mga Aklat ng Karunungan', 'Vitabu vya Hekima', 'Wysheidsboeke'],
    'major_prophets': ['대선지서',   'Major Prophets',     'Profetas Mayores',     'Profetas Maiores',     '大先知书',  'Grands Prophètes',      'Große Propheten',     '大預言書',   'Đại Tiên Tri', 'बड़े भविष्यवक्ता', 'Nabi-nabi Besar', 'Mga Pangunahing Propeta', 'Manabii Wakuu', 'Groot Profete'],
    'minor_prophets': ['소선지서',   'Minor Prophets',     'Profetas Menores',     'Profetas Menores',     '小先知书',  'Petits Prophètes',      'Kleine Propheten',    '小預言書',   'Tiểu Tiên Tri', 'छोटे भविष्यवक्ता', 'Nabi-nabi Kecil', 'Mga Maliliit na Propeta', 'Manabii Wadogo', 'Klein Profete'],
    'gospels': ['복음서',     'Gospels',            'Evangelios',           'Evangelhos',           '福音书',    'Évangiles',             'Evangelien',          '福音書',     'Sách Phúc Âm', 'सुसमाचार', 'Injil', 'Mga Ebanghelyo', 'Injili', 'Evangelies'],
    'acts': ['사도행전',   'Acts',               'Hechos',               'Atos',                 '使徒行传',  'Actes',                 'Apostelgeschichte',   '使徒の働き', 'Công Vụ Sứ Đồ', 'प्रेरितों के काम', 'Kisah Para Rasul', 'Mga Gawa', 'Matendo ya Mitume', 'Handelinge'],
    'pauline': ['바울서신',   'Pauline Epistles',   'Cartas Paulinas',      'Cartas Paulinas',      '保罗书信',  'Épîtres pauliniennes',  'Paulusbriefe',        'パウロ書簡', 'Thư Phao-lô', 'पौलुस की पत्रियाँ', 'Surat-surat Paulus', 'Mga Sulat ni Pablo', 'Nyaraka za Paulo', 'Paulus se Briewe'],
    'general_epistles': ['공동서신',   'General Epistles',   'Cartas Generales',     'Cartas Gerais',        '普通书信',  'Épîtres générales',     'Katholische Briefe',  '公同書簡',   'Thư Tổng Quát', 'सामान्य पत्रियाँ', 'Surat-surat Umum', 'Pangkalahatang Sulat', 'Nyaraka za Kawaida', 'Algemene Briewe'],
    'revelation': ['계시록',     'Revelation',         'Apocalipsis',          'Apocalipse',           '启示录',    'Apocalypse',            'Offenbarung',         '黙示録',     'Sách Khải Huyền', 'प्रकाशितवाक्य', 'Wahyu', 'Pahayag', 'Ufunuo', 'Openbaring']
  };

  // Short category labels (for tight keypad buttons). Same column order.
  const CATEGORY_SHORT = {
    'pentateuch': ['모세오경',   'Pentateuch',  'Pentat.',     'Pentat.',     '五经',     'Pentat.',       'Pentat.',     'モーセ五書', 'Ngũ Kinh', 'पंचग्रंथ', 'Pentateukh', 'Pentateuko', 'Pentateuko', 'Pentateug'],
    'history_ot': ['역사서',     'History',     'Histórico',   'Histórico',   '历史',     'Histor.',       'Hist.',       '歴史書',     'Sử Ký', 'इतिहास', 'Sejarah', 'Kasaysayan', 'Historia', 'Geskiedenis'],
    'wisdom': ['시가서',     'Wisdom',      'Sapienc.',    'Sapienc.',    '诗歌',     'Sagesse',       'Weisheit',    '詩歌書',     'Văn Thơ', 'काव्य', 'Hikmat', 'Karunungan', 'Hekima', 'Wysheid'],
    'major_prophets': ['대선지서',   'Maj. Proph.', 'Prof. May.',  'Prof. Mai.',  '大先知',   'Gd. Proph.',    'Gr. Proph.',  '大預言',     'Đại Tiên Tri', 'बड़े नबी', 'Nabi Besar', 'Maj. Propeta', 'Manabii Wakuu', 'Groot Profete'],
    'minor_prophets': ['소선지서',   'Min. Proph.', 'Prof. Men.',  'Prof. Men.',  '小先知',   'Pt. Proph.',    'Kl. Proph.',  '小預言',     'Tiểu Tiên Tri', 'छोटे नबी', 'Nabi Kecil', 'Min. Propeta', 'Manabii Wadogo', 'Klein Profete'],
    'gospels': ['복음서',     'Gospels',     'Evangelios',  'Evangelhos',  '福音',     'Évangiles',     'Evangelien',  '福音書',     'Phúc Âm', 'सुसमाचार', 'Injil', 'Ebanghelyo', 'Injili', 'Evangelies'],
    'acts': ['사도행전',   'Acts',        'Hechos',      'Atos',        '使徒',     'Actes',         'Apostelg.',   '使徒',       'Công Vụ', 'प्रेरितों', 'Kisah', 'Gawa', 'Matendo', 'Handelinge'],
    'pauline': ['바울서신',   'Pauline',     'Paulinas',    'Paulinas',    '保罗书信', 'Pauliniennes',  'Paulus.',     'パウロ書簡', 'Thư Phao-lô', 'पौलुस', 'Paulus', 'Pablo', 'Paulo', 'Paulus'],
    'general_epistles': ['공동서신',   'General',     'Generales',   'Gerais',      '普通书信', 'Générales',     'Kathol.',     '公同書簡',   'Thư Chung', 'सामान्य', 'Umum', 'Pangkalahatan', 'Kawaida', 'Algemeen'],
    'revelation': ['계시록',     'Revelation',  'Apocalipsis', 'Apocalipse',  '启示录',   'Apocalypse',    'Offenbarung', '黙示録',     'Khải Huyền', 'प्रकाशित', 'Wahyu', 'Pahayag', 'Ufunuo', 'Openbaring']
  };

  // UI label translations. Same column order: ko, en, es, pt, zh, fr, de, ja, vi
  const UI_LABELS = {
    'find_word': ['말씀 바로찾기',  'Find the Word',     'Buscar Palabra',      'Encontre a Palavra', '寻找经文',     'Trouver la Parole',  'Wort finden',       'み言葉を探す',     'Tìm Lời', 'वचन ढूँढें', 'Cari Firman', 'Hanapin ang Salita', 'Tafuta Neno', 'Vind die Woord'],
    'by_category': ['분류별로 ›',     'By category ›',     'Por categoría ›',     'Por categoria ›',    '按分类 ›',     'Par catégorie ›',    'Nach Kategorie ›',  'カテゴリ別 ›',     'Theo phân loại ›', 'श्रेणी अनुसार ›', 'Per kategori ›', 'Ayon sa kategorya ›', 'Kwa kategoria ›', 'Volgens kategorie ›'],
    'choose_category': ['분류 선택',     'Choose category',   'Elige categoría',     'Escolha categoria',  '选择分类',     'Choisir catégorie',  'Kategorie wählen',  'カテゴリを選択',   'Chọn phân loại', 'श्रेणी चुनें', 'Pilih kategori', 'Pumili ng kategorya', 'Chagua kategoria', 'Kies kategorie'],
    'verse_view_other': ['다른 날짜 보기','View other dates',  'Ver otras fechas',    'Ver outras datas',   '查看其他日期',  'Voir d\'autres dates','Andere Daten ansehen','他の日付を見る',  'Xem ngày khác', 'अन्य तिथियाँ देखें', 'Lihat tanggal lain', 'Tingnan ang ibang petsa', 'Ona tarehe nyingine', 'Bekyk ander datums'],
    'verse_back_today': ['오늘로 돌아가기','Back to today',     'Volver a hoy',        'Voltar para hoje',   '回到今天',     'Retour à aujourd\'hui','Zurück zu heute',  '今日に戻る',       'Quay lại hôm nay', 'आज पर वापस', 'Kembali ke hari ini', 'Bumalik sa ngayon', 'Rudi leo', 'Terug na vandag']
  };

  // Welcome message translations. Index 0 = ko, 1 = en, etc.
  const WELCOME_I18N = {
    line1: [
      '은혜의말씀 안에서',
      'In the Word of Grace,',
      'En las Palabras de Gracia,',
      'Nas Palavras da Graça,',
      '在恩典之言中，',
      'Dans les Paroles de Grâce,',
      'In den Worten der Gnade,',
      '恵みの言葉の中で、',
      'Trong Lời Ân Điển,',
      'अनुग्रह के वचनों में,',
      'Dalam Sabda Anugerah,',
      'Sa mga Salita ng Biyaya,',
      'Katika Maneno ya Neema,',
      'In die Woorde van Genade,'
    ],
    line2: [
      '하나님의 놀라운 세계가 펼쳐집니다',
      "God's wondrous world unfolds.",
      'el mundo maravilloso de Dios se despliega.',
      'o mundo maravilhoso de Deus se desdobra.',
      '神奇妙的世界为您展开。',
      'le monde merveilleux de Dieu se déploie.',
      'entfaltet sich Gottes wunderbare Welt.',
      '神の素晴らしい世界が広がります。',
      'thế giới kỳ diệu của Đức Chúa Trời mở ra.',
      'परमेश्वर का अद्भुत संसार खुलता है।',
      'dunia ajaib Tuhan terbentang.',
      'ang kahanga-hangang mundo ng Diyos ay nabubuksan.',
      'ulimwengu wa ajabu wa Mungu hufunuliwa.',
      'ontvou God se wonderlike wêreld.'
    ]
  };

  // Expose category data globally so index.html / reader.html can render.
  window.GomnaBibleCategories = {
    list: BIBLE_CATEGORIES,
    labels: CATEGORY_LABELS,
    shortLabels: CATEGORY_SHORT,
    getLabel: function (key, lang) {
      const e = CATEGORY_LABELS[key];
      return e ? e[getLangIdx(lang)] : key;
    },
    getShort: function (key, lang) {
      const e = CATEGORY_SHORT[key];
      return e ? e[getLangIdx(lang)] : key;
    },
    getEmoji: function (key) {
      for (let i = 0; i < BIBLE_CATEGORIES.length; i++) {
        if (BIBLE_CATEGORIES[i][0] === key) return BIBLE_CATEGORIES[i][1];
      }
      return '';
    },
    getBooks: function (key) {
      for (let i = 0; i < BIBLE_CATEGORIES.length; i++) {
        if (BIBLE_CATEGORIES[i][0] === key) return BIBLE_CATEGORIES[i][2].slice();
      }
      return [];
    }
  };

  // Apply category labels, UI labels, and welcome message based on cookie lang.
  // Targets elements marked with data-i18n-category, data-i18n-cat-short,
  // data-i18n-ui, or data-i18n-welcome attributes.
  function applyUiTextI18n(lang) {
    window.__gomnaLastLang = lang;
    const idx = getLangIdx(lang);

    // Body-level mode flag.
    //   Korean mode (or no cookie) → foreign-line VISIBLE
    //     ("English helper" line on top of the Korean main label).
    //   Other languages → foreign-line HIDDEN, only the main label shown
    //     in that language (one line).
    const isForeign = !!(lang && lang !== 'ko');
    if (document.body) {
      if (isForeign) document.body.setAttribute('data-i18n-mode', 'foreign');
      else document.body.removeAttribute('data-i18n-mode');
    }

    // Category long labels (modal titles, etc.)
    document.querySelectorAll('[data-i18n-category]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-category');
      const e = CATEGORY_LABELS[k];
      if (e && e[idx]) el.textContent = e[idx];
    });

    // Category short labels (legacy attribute, current language).
    document.querySelectorAll('[data-i18n-cat-short]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-cat-short');
      const e = CATEGORY_SHORT[k];
      if (e && e[idx]) el.textContent = e[idx];
    });

    // [data-i18n-cat-name] — main keypad button label, set to the CURRENT
    // language's long label. In Korean mode this is the Korean name (e.g.
    // "모세오경"); in any other mode it becomes the matching foreign name
    // (e.g. "Pentateuco" in Spanish).
    document.querySelectorAll('[data-i18n-cat-name]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-cat-name');
      const e = CATEGORY_LABELS[k];
      if (e && e[idx]) el.textContent = e[idx];
    });

    // [data-i18n-cat-foreign] — small "English helper" line shown on top of
    // category buttons in Korean mode only. Always set to ENGLISH (idx 1)
    // regardless of the user's current language; CSS hides it in foreign
    // mode anyway.
    document.querySelectorAll('[data-i18n-cat-foreign]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-cat-foreign');
      const e = CATEGORY_LABELS[k];
      if (e && e[1]) el.textContent = e[1];
    });

    // Helper "All Books" English line for the "전체" banner button in
    // reader.html (Korean mode only, hidden in foreign mode).
    document.querySelectorAll('[data-i18n-foreign-all]').forEach(function (el) {
      el.textContent = 'All Books';
    });

    // Old / New Testament column headers — single line in current language.
    const TESTAMENT_LABELS = {
      ot: ['구약', 'Old Testament', 'Antiguo Testamento', 'Antigo Testamento',
           '旧约', 'Ancien Testament', 'Altes Testament', '旧約', 'Cựu Ước',
           'पुराना नियम', 'Perjanjian Lama', 'Lumang Tipan', 'Agano la Kale', 'Ou Testament'],
      nt: ['신약', 'New Testament', 'Nuevo Testamento', 'Novo Testamento',
           '新约', 'Nouveau Testament', 'Neues Testament', '新約', 'Tân Ước',
           'नया नियम', 'Perjanjian Baru', 'Bagong Tipan', 'Agano Jipya', 'Nuwe Testament']
    };
    document.querySelectorAll('[data-i18n-testament]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-testament');
      const arr = TESTAMENT_LABELS[k];
      if (arr && arr[idx]) el.textContent = arr[idx];
    });

    // Book-count badges on the home widget (e.g., "5권" / "5 books" /
    // "5 libros" / "5 卷"). Number stays the same across languages, only
    // the unit changes. English/Spanish/Portuguese/French/German use
    // singular vs plural; CJK languages use a single counter character.
    function formatCount(n, l) {
      const num = String(n);
      const one = num === '1';
      switch (l) {
        case 'en':    return num + (one ? ' book'   : ' books');
        case 'es':    return num + (one ? ' libro'  : ' libros');
        case 'pt':    return num + (one ? ' livro'  : ' livros');
        case 'fr':    return num + (one ? ' livre'  : ' livres');
        case 'de':    return num + (one ? ' Buch'   : ' Bücher');
        case 'vi':    return num + (one ? ' sách'   : ' sách');
        case 'hi':    return num + (one ? ' पुस्तक'  : ' पुस्तकें');
        case 'id':    return num + ' kitab';
        case 'tl':    return num + (one ? ' aklat'  : ' aklat');
        case 'sw':    return num + (one ? ' kitabu' : ' vitabu');
        case 'af':    return num + (one ? ' boek'   : ' boeke');
        case 'zh-CN':
        case 'zh':
        case 'zh-TW': return num + '卷';
        case 'ja':    return num + '巻';
        case 'ko':
        default:      return num + '권';
      }
    }
    const cuLang = lang || 'ko';
    document.querySelectorAll('[data-cat-count]').forEach(function (el) {
      const n = el.getAttribute('data-cat-count');
      el.textContent = formatCount(n, cuLang);
    });

    // Generic UI labels
    document.querySelectorAll('[data-i18n-ui]').forEach(function (el) {
      if (el.getAttribute('data-gomna-native-translate-owned') === '1') return;
      if (document.documentElement.classList.contains('gomna-native-i18n-active') &&
          (el.hasAttribute('data-i18n-key') ||
           el.hasAttribute('data-i18n-placeholder') ||
           el.hasAttribute('data-i18n-aria-label') ||
           el.hasAttribute('data-i18n-title'))) {
        return;
      }
      const k = el.getAttribute('data-i18n-ui');
      const e = UI_LABELS[k];
      if (e && e[idx] && (el.textContent || '') !== e[idx]) el.textContent = e[idx];
    });

    // Welcome message — stored in data-text so the existing typing animation
    // in index.html can read it.
    document.querySelectorAll('[data-i18n-welcome]').forEach(function (el) {
      const k = el.getAttribute('data-i18n-welcome');
      const arr = WELCOME_I18N[k];
      if (arr && arr[idx]) {
        el.dataset.text = arr[idx];
        // If the element is currently empty (initial render hasn't fired),
        // populate with text immediately so it isn't blank for a moment.
        if (!el.textContent || el.textContent.trim() === '') {
          el.textContent = arr[idx];
        }
      }
    });

    // If the home page exposes a re-render hook, call it so dynamic UI
    // (e.g. the welcome animation, category modal) refreshes with new lang.
    if (typeof window.__gomnaOnLangApplied === 'function') {
      try { window.__gomnaOnLangApplied(lang, idx); } catch (e) { /* ignore */ }
    }

    // Auto-shrink category labels so foreign-language text never overflows
    // its button. Long labels (e.g. German "Geschichtsbücher",
    // French "Pentateuque") are clipped at the card boundary because words
    // can't break. Strategy: 1) shrink the font down to a readable minimum,
    // 2) if still overflowing, swap to the matching CATEGORY_SHORT label,
    // 3) shrink that short label too if it still doesn't fit.
    autoShrinkCategoryLabels(idx, lang);
  }

  function autoShrinkCategoryLabels(idx, lang) {
    if (typeof document === 'undefined') return;
    const isForeign = !!(lang && lang !== 'ko');
    // Match both index.html (.easy-key.cat-key) and reader.html (.consonant-btn.cat-btn).
    document.querySelectorAll('.cat-label[data-i18n-cat-name]').forEach(function (lbl) {
      const btn = lbl.closest('.easy-key.cat-key, .consonant-btn.cat-btn, button, .cat-btn');
      if (!btn) return;
      const cnt = btn.querySelector('.cat-count');
      const k   = lbl.getAttribute('data-i18n-cat-name');
      const longLabel  = (CATEGORY_LABELS[k] || [])[idx] || lbl.textContent;
      const shortLabel = (CATEGORY_SHORT[k]  || [])[idx] || longLabel;

      // Reset to long label and clear any inline font-size from a previous
      // language so the CSS-determined max applies.
      lbl.textContent = longLabel;
      lbl.style.fontSize = '';
      // In Korean mode the CSS already keeps things tight; nothing to shrink.
      if (!isForeign) return;

      const csMax = parseFloat(getComputedStyle(lbl).fontSize) || 11.5;
      const minFont = 6;
      // Reset cnt's inline display we may have hidden on a previous run.
      if (cnt) cnt.style.display = '';

      function fits() {
        const node = lbl.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) return true;
        const r = document.createRange();
        r.selectNodeContents(node);
        const tr = r.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        const tol = 0.5;
        if (tr.right  > br.right  + tol) return false;
        if (tr.left   < br.left   - tol) return false;
        if (tr.top    < br.top    - tol) return false;
        if (tr.bottom > br.bottom + tol) return false;
        if (cnt && getComputedStyle(cnt).display !== 'none') {
          const cr = cnt.getBoundingClientRect();
          if (cr.bottom > br.bottom + tol) return false;
          if (cr.top    < br.top    - tol) return false;
        }
        return true;
      }
      function shrink() {
        let cur = csMax;
        while (!fits() && cur > minFont) {
          cur -= 0.25;
          lbl.style.fontSize = cur + 'px';
        }
      }

      // Pass 1: shrink long label until it fits or hits min.
      shrink();
      // Pass 2: still overflowing → fall back to short label and re-shrink.
      if (!fits() && shortLabel && shortLabel !== longLabel) {
        lbl.textContent = shortLabel;
        lbl.style.fontSize = '';
        shrink();
      }
      // Pass 3: last resort — hide the small "N권" count line to free up
      // vertical space (very narrow screens / unbreakable phrases like
      // Vietnamese "Tiểu Tiên Tri"). Keeps the most important info (the
      // category name) legible at the cost of the secondary count.
      if (!fits() && cnt && getComputedStyle(cnt).display !== 'none') {
        cnt.style.display = 'none';
        lbl.style.fontSize = '';
        shrink();
      }
    });
  }

  // Re-run auto-shrink when the viewport changes (orientation / split-view).
  // Throttle with requestAnimationFrame so we never run on every resize tick.
  let __shrinkRaf = 0;
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () {
      const lang = window.__gomnaLastLang;
      if (!lang) return;
      if (__shrinkRaf) cancelAnimationFrame(__shrinkRaf);
      __shrinkRaf = requestAnimationFrame(function () {
        __shrinkRaf = 0;
        autoShrinkCategoryLabels(getLangIdx(lang), lang);
      });
    });
  }

  window.GomnaApplyUiI18n = applyUiTextI18n;

  // ─────────────────────────────────────────────────────────────────────
  // Daily-verse i18n helpers (used by index.html "오늘의 말씀" feature).
  // Strategy (Plan C — hybrid):
  //   • Verse body text (the actual scripture)  → translated by Google
  //     Translate widget (we drop translate="no" on the body element).
  //   • Verse reference (e.g. "마태복음 11:28") → we translate the Korean
  //     book name with our own 66-book table so it always reads
  //     "Matthew 11:28" / "Mateo 11:28" / "馬太福音 11:28" etc., regardless
  //     of whether Google's widget has scanned that line yet.
  //   • Verse tag ("오늘의 말씀" / "X월 Y일의 말씀") → custom locale-aware
  //     formatting using Intl.DateTimeFormat for the date portion.
  // ─────────────────────────────────────────────────────────────────────

  const VERSE_TODAY_LABEL = {
    'ko': '오늘의 말씀',
    'en': 'Verse of the Day',
    'es': 'Palabra de Hoy',
    'pt': 'Palavra de Hoje',
    'zh': '今日金句', 'zh-CN': '今日金句', 'zh-TW': '今日金句',
    'fr': 'Parole du Jour',
    'de': 'Wort des Tages',
    'ja': '今日の聖句',
    'vi': 'Lời Hôm Nay',
    'hi': 'आज का वचन',
    'id': 'Firman Hari Ini',
    'tl': 'Salita ng Araw',
    'sw': 'Neno la Leo',
    'af': 'Woord van die Dag'
  };

  function _localeFor(lang) {
    const m = {
      'ko':'ko-KR','en':'en-US','es':'es-ES','pt':'pt-BR',
      'zh':'zh-CN','zh-CN':'zh-CN','zh-TW':'zh-TW',
      'fr':'fr-FR','de':'de-DE','ja':'ja-JP','vi':'vi-VN',
      'hi':'hi-IN','id':'id-ID','tl':'tl-PH','sw':'sw-KE','af':'af-ZA'
    };
    return m[lang] || 'ko-KR';
  }

  function translateVerseTag(d, lang, isToday) {
    const code = lang || 'ko';
    if (isToday) return VERSE_TODAY_LABEL[code] || VERSE_TODAY_LABEL.ko;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat(_localeFor(code),
              { month: 'long', day: 'numeric' }).format(d);
    } catch (e) {
      fmt = m + '/' + day;
    }
    switch (code) {
      case 'ko':                              return m + '월 ' + day + '일의 말씀';
      case 'en':                              return 'Verse for ' + fmt;
      case 'es':                              return 'Palabra para el ' + fmt;
      case 'pt':                              return 'Palavra para ' + fmt;
      case 'zh': case 'zh-CN': case 'zh-TW':  return m + '月' + day + '日的金句';
      case 'fr':                              return 'Parole pour le ' + fmt;
      case 'de':                              return 'Wort für den ' + fmt;
      case 'ja':                              return m + '月' + day + '日の聖句';
      case 'vi':                              return 'Lời cho ngày ' + day + ' tháng ' + m;
      case 'hi':                              return fmt + ' का वचन';
      case 'id':                              return 'Firman untuk ' + fmt;
      case 'tl':                              return 'Salita para sa ' + fmt;
      case 'sw':                              return 'Neno la ' + fmt;
      case 'af':                              return 'Woord vir ' + fmt;
      default:                                return m + '월 ' + day + '일의 말씀';
    }
  }

  // Exposed for index.html's _setVerseDOM(). Translates the Korean book
  // name embedded in a reference like "마태복음 11:28" → "Matthew 11:28".
  window.GomnaTranslateBookRef = function (refKo, lang) {
    if (!refKo) return refKo;
    return translateBookText(refKo, lang || window.__gomnaLastLang || 'ko');
  };

  window.GomnaTranslateVerseTag = function (d, isToday, lang) {
    if (!d) return '';
    return translateVerseTag(d, lang || window.__gomnaLastLang || 'ko', !!isToday);
  };

  window.GomnaTranslateBookName = function (bookKo, lang) {
    if (!bookKo) return bookKo;
    return translateBookText(bookKo, lang || window.__gomnaLastLang || 'ko');
  };

  // Common-prefix safety: longest names first so that "예레미야애가"
  // matches before "예레미야".
  const BOOK_NAMES_SORTED = BIBLE_BOOK_NAMES.map(function (r) { return r[0]; })
    .sort(function (a, b) { return b.length - a.length; });

  const BOOK_MAP = (function () {
    const m = {};
    BIBLE_BOOK_NAMES.forEach(function (r) { m[r[0]] = r; });
    return m;
  })();

  let _bookRegex = null;
  function getBookRegex() {
    if (_bookRegex) return _bookRegex;
    const escaped = BOOK_NAMES_SORTED.map(function (n) {
      return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    _bookRegex = new RegExp('(' + escaped.join('|') + ')(?:\\s*(\\d+)(장|편))?', 'g');
    return _bookRegex;
  }

  function translateBookText(text, lang) {
    const idx = BOOK_LANG_IDX[lang];
    if (!idx || !text || text.indexOf) {
      // fast bail-out — if no Hangul present, no need to run regex
      // (Hangul Syllables U+AC00-U+D7A3)
      if (!/[\uAC00-\uD7A3]/.test(text)) return text;
    }
    if (!idx) return text;
    const re = getBookRegex();
    re.lastIndex = 0;
    return text.replace(re, function (match, koBook, chapter, unit) {
      const row = BOOK_MAP[koBook];
      if (!row) return match;
      const localized = row[idx];
      if (!localized) return match;
      if (chapter && unit) {
        if (lang === 'zh-CN' || lang === 'zh' || lang === 'zh-TW' || lang === 'ja') {
          const u = (unit === '편') ? '篇' : '章';
          return localized + chapter + u;
        }
        return localized + ' ' + chapter;
      }
      return localized;
    });
  }

  function getCurrentTargetLang() {
    const m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (!m) return null;
    const v = decodeURIComponent(m[1]).split('/');
    return v[2] || null;
  }

  function isHomePage() {
    return !!(document.body && document.body.getAttribute('data-gomna-page') === 'home');
  }

  function isReaderPage() {
    try {
      if (document.body && document.body.getAttribute('data-gomna-page') === 'reader') return true;
      var path = String(location.pathname || '').toLowerCase();
      return path.indexOf('reader.html') !== -1 || /(^|\/)reader\/?$/.test(path);
    } catch (e) {
      return false;
    }
  }

  function getNativeHomeLanguage() {
    try {
      var stored = localStorage.getItem('gomna_ui_language');
      if (stored === 'ko' || stored === 'en' || stored === 'ja') return stored;
    } catch (e) { /* ignore */ }
    return null;
  }

  function isNativeHomeLanguage(lang) {
    return lang === 'ko' || lang === 'en' || lang === 'ja';
  }

  /**
   * Resolve home display language as one coherent state.
   * Delegates to GomnaUII18n.resolveInitialHomeLanguage when available.
   */
  // Quick pair is always KO·EN — never seeded from device/home language.
  var QUICK_LANGUAGES = ['ko', 'en'];
  var GOOGLE_HOME_LANGS = {
    es: 1, pt: 1, fr: 1, de: 1, vi: 1, hi: 1, id: 1, tl: 1, sw: 1, af: 1,
    zh: 1, 'zh-cn': 1, 'zh-tw': 1
  };

  function ensureDefaultQuickForeignLanguage() {
    try {
      var existing = localStorage.getItem('gomna_recent_foreign_language');
      // Seed EN when empty. Never auto-write ja from device/home language.
      // Quick buttons are KO·EN constants and do not depend on this value.
      if (!existing || existing === 'ko') {
        localStorage.setItem('gomna_recent_foreign_language', 'en');
      }
    } catch (e) { /* ignore */ }
  }

  function detectBrowserPreferredHomeLanguage() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        for (var i = 0; i < navigator.languages.length; i++) list.push(navigator.languages[i]);
      }
    } catch (e0) { /* ignore */ }
    try { list.push(navigator.language || navigator.userLanguage || ''); } catch (e1) { /* ignore */ }
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
      var matched = primary ? findAnchorForLang(primary) : null;
      if (matched && matched[3] && matched[3] !== 'ko' && matched[3] !== 'en' && matched[3] !== 'ja') {
        return { lang: matched[3], mode: 'google' };
      }
      if (primary && GOOGLE_HOME_LANGS[primary]) {
        return { lang: primary, mode: 'google' };
      }
    }
    // Unsupported / undetectable → English home.
    return { lang: 'en', mode: 'native' };
  }

  function resolveHomeDisplayLanguage() {
    if (window.GomnaUII18n && typeof window.GomnaUII18n.resolveInitialHomeLanguage === 'function') {
      var shared = window.GomnaUII18n.resolveInitialHomeLanguage();
      if (shared && shared.mode === 'native' && isNativeHomeLanguage(shared.lang)) {
        ensureDefaultQuickForeignLanguage();
        return { lang: shared.lang, mode: 'native', persisted: !!shared.persisted };
      }
      if (shared && shared.mode === 'google' && shared.lang) {
        ensureDefaultQuickForeignLanguage();
        return { lang: shared.lang, mode: 'google', persisted: false };
      }
    }

    try {
      var stored = localStorage.getItem('gomna_ui_language');
      if (isNativeHomeLanguage(stored)) {
        ensureDefaultQuickForeignLanguage();
        return { lang: stored, mode: 'native', persisted: true };
      }
    } catch (e) { /* ignore */ }

    // No explicit app selection: browser/phone language wins over leftover googtrans.
    // Display-only — never write gomna_ui_language from auto-detect.
    var detected = detectBrowserPreferredHomeLanguage();
    if (detected.mode === 'native' && isNativeHomeLanguage(detected.lang)) {
      if (detected.lang === 'ko') clearGoogTransCookie();
      else setGoogTransCookie(detected.lang);
      ensureDefaultQuickForeignLanguage();
      return { lang: detected.lang, mode: 'native', persisted: false };
    }
    if (detected.mode === 'google' && detected.lang) {
      setGoogTransCookie(detected.lang);
      ensureDefaultQuickForeignLanguage();
      return { lang: detected.lang, mode: 'google', persisted: false };
    }
    setGoogTransCookie('en');
    ensureDefaultQuickForeignLanguage();
    return { lang: 'en', mode: 'native', persisted: false };
  }

  var _homeLangRestoreRaf1 = 0;
  var _homeLangRestoreRaf2 = 0;
  var _homeLangRestoreBound = false;
  var _homeLangRestoreRunning = false;

  function restoreHomeLanguageState(reason) {
    if (!isHomePage()) return;
    if (_homeLangRestoreRunning) return;
    _homeLangRestoreRunning = true;
    try {
      var resolved = resolveHomeDisplayLanguage();
      var html = document.documentElement;

      // Stuck boot hides every [data-i18n-key] leaf — always clear on home restore.
      try { html.classList.remove('gomna-ui-i18n-boot'); } catch (e0) { /* ignore */ }
      if (window.GomnaUII18n && typeof window.GomnaUII18n.clearBoot === 'function') {
        try { window.GomnaUII18n.clearBoot(); } catch (e1) { /* ignore */ }
      }

      if (resolved.mode === 'native') {
        // Native home must not keep Google pending / observers alive.
        endTranslationPending({ immediate: true });

        if (resolved.lang === 'ko') clearGoogTransCookie();
        else setGoogTransCookie(resolved.lang);

        if (window.GomnaUII18n && typeof window.GomnaUII18n.apply === 'function') {
          window.GomnaUII18n.apply(resolved.lang, { persist: !!resolved.persisted });
        } else {
          html.classList.add('gomna-native-i18n-active');
          html.setAttribute('data-gomna-ui-lang', resolved.lang);
        }

        applyUiTextI18n(resolved.lang);
        if (typeof window.__gomnaRefreshHomeI18n === 'function') {
          try { window.__gomnaRefreshHomeI18n(); } catch (e2) { /* ignore */ }
        }
        return;
      }

      // Google fallback languages: preserve cookie/pending; never force en/ja native copy.
      if (html.classList.contains('gomna-native-i18n-active') &&
          window.GomnaUII18n && typeof window.GomnaUII18n.deactivate === 'function') {
        // Only deactivate if storage was already cleared for unsupported langs.
        try {
          if (!getNativeHomeLanguage()) window.GomnaUII18n.deactivate();
        } catch (e3) { /* ignore */ }
      }
    } finally {
      _homeLangRestoreRunning = false;
    }
  }

  function scheduleHomeLanguageRestore(reason) {
    if (!isHomePage()) return;
    if (_homeLangRestoreRaf1) {
      cancelAnimationFrame(_homeLangRestoreRaf1);
      _homeLangRestoreRaf1 = 0;
    }
    if (_homeLangRestoreRaf2) {
      cancelAnimationFrame(_homeLangRestoreRaf2);
      _homeLangRestoreRaf2 = 0;
    }
    _homeLangRestoreRaf1 = requestAnimationFrame(function () {
      _homeLangRestoreRaf1 = 0;
      _homeLangRestoreRaf2 = requestAnimationFrame(function () {
        _homeLangRestoreRaf2 = 0;
        restoreHomeLanguageState(reason || 'scheduled');
      });
    });
  }

  function bindHomeLanguageRestoreEvents() {
    if (_homeLangRestoreBound) return;
    _homeLangRestoreBound = true;
    window.addEventListener('pageshow', function (e) {
      if (!isHomePage()) return;
      restoreHomeLanguageState(e && e.persisted ? 'pageshow-bfcache' : 'pageshow');
      if (e && e.persisted) scheduleHomeLanguageRestore('pageshow-bfcache-raf');
    });
    window.addEventListener('popstate', function () {
      if (!isHomePage()) return;
      scheduleHomeLanguageRestore('popstate');
    });
  }

  window.restoreHomeLanguageState = restoreHomeLanguageState;

  function isGoogleTranslatedDom() {
    var html = document.documentElement;
    return !!(html && (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')));
  }

  // Resolves the "active" language code (cookie target, or "ko" if no cookie).
  function getActiveLangCode() {
    if (isHomePage()) {
      var native = getNativeHomeLanguage();
      if (native) return native;
      if (window.GomnaUII18n && typeof window.GomnaUII18n.isActive === 'function' &&
          window.GomnaUII18n.isActive() && typeof window.GomnaUII18n.getLanguage === 'function') {
        return window.GomnaUII18n.getLanguage() || 'ko';
      }
    }
    if (isReaderPage() && typeof window.getReaderUiLangCode === 'function') {
      try {
        var readerUi = window.getReaderUiLangCode();
        if (readerUi === 'ko' || readerUi === 'en' || readerUi === 'ja') return readerUi;
      } catch (e) { /* ignore */ }
    }
    return getCurrentTargetLang() || 'ko';
  }

  // Resolves the anchor country (code) for a given target language code.
  // Used to highlight the user's current selection in the popular grid.
  function findAnchorForLang(langCode) {
    if (!langCode) return null;
    const anchor = LANG_ANCHOR[langCode];
    if (anchor) {
      const c = findByCode(anchor);
      if (c) return c;
    }
    return COUNTRIES.find(function (c) { return c[3] === langCode; }) || null;
  }

  // Region label localized to the user's current language.
  function getRegionLabel(key, lang) {
    const row = REGION_LABELS[key];
    if (!row) return key;
    const idx = getLangIdx(lang);
    return row[idx] || row[0];
  }

  let _bookObserver = null;
  let _bookLangActive = null;

  function applyBookNameI18n(lang) {
    if (!BOOK_LANG_IDX[lang]) return;
    if (_bookLangActive === lang && _bookObserver) return; // already running
    _bookLangActive = lang;

    function isInsideCommentaryPopup(node) {
      var el = node;
      if (!el) return false;
      if (el.nodeType === 3) el = el.parentNode;
      try {
        return !!(el && el.closest && el.closest('#commentaryPopup'));
      } catch (e) {
        return false;
      }
    }

    function visit(node) {
      if (!node) return;
      if (isInsideCommentaryPopup(node)) return;
      if (node.nodeType === 3) {
        const p = node.parentNode;
        if (!p) return;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') return;
        const t = translateBookText(node.nodeValue, lang);
        if (t !== node.nodeValue) node.nodeValue = t;
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.id === 'commentaryPopup') return;
      if (node.classList && node.classList.contains('notranslate')) return;
      if (node.getAttribute && node.getAttribute('translate') === 'no') return;
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' ||
          tag === 'INPUT' || tag === 'TEXTAREA') return;
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) visit(children[i]);
    }

    function doInitial() {
      try { visit(document.body); } catch (e) { /* ignore */ }
    }
    if (window.requestIdleCallback) {
      window.requestIdleCallback(doInitial, { timeout: 1500 });
    } else {
      setTimeout(doInitial, 50);
    }

    if (_bookObserver) _bookObserver.disconnect();
    _bookObserver = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          if (isInsideCommentaryPopup(m.target)) continue;
          const p = m.target.parentNode;
          if (!p) continue;
          const tag = p.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
          const t = translateBookText(m.target.nodeValue, lang);
          if (t !== m.target.nodeValue) m.target.nodeValue = t;
        } else if (m.type === 'childList') {
          if (isInsideCommentaryPopup(m.target)) continue;
          for (let j = 0; j < m.addedNodes.length; j++) visit(m.addedNodes[j]);
        }
      }
    });
    _bookObserver.observe(document.body, {
      childList: true, subtree: true, characterData: true
    });
  }

  // ----------------------------------------------------------------
  // In-page translation via Google Translate Element widget.
  // Works on any page size (incl. 20MB reader.html), works on localhost,
  // keeps the user on the original domain, and persists across visits
  // via the `googtrans` cookie that Google's widget reads on init.
  // ----------------------------------------------------------------
  function setGoogTransCookie(targetLang) {
    const value = '/ko/' + targetLang;
    const maxAge = '; max-age=' + (60 * 60 * 24 * 365); // 1 year
    document.cookie = 'googtrans=' + value + '; path=/' + maxAge;
    const host = location.hostname;
    if (host && host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
      const parts = host.split('.');
      const dom = '.' + parts.slice(-2).join('.');
      document.cookie = 'googtrans=' + value + '; path=/; domain=' + dom + maxAge;
    }
  }

  function clearGoogTransCookie() {
    const expire = '; max-age=0';
    document.cookie = 'googtrans=; path=/' + expire;
    const host = location.hostname;
    if (host && host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
      const parts = host.split('.');
      const dom = '.' + parts.slice(-2).join('.');
      document.cookie = 'googtrans=; path=/; domain=' + dom + expire;
    }
  }

  function hasGoogTransCookie() {
    return /(?:^|;\s*)googtrans=/.test(document.cookie || '');
  }

  // ----------------------------------------------------------------
  // Home language-flash pending: hide Korean source until GT finishes.
  // Separate from `_bookObserver` (book-name i18n).
  // ----------------------------------------------------------------
  var _gtPendingObserver = null;
  var _gtPendingStableTimer = null;
  var _gtPendingRaf1 = 0;
  var _gtPendingRaf2 = 0;
  var _gtPendingBaselines = null;
  var _gtPendingWatching = false;
  var _gtPendingFirstChangeMs = 0;
  var _gtPendingLastRelevantChangeMs = 0;
  var _gtPendingLastChangedCount = 0;
  var _gtReaderBootRaf1 = 0;
  var _gtReaderBootRaf2 = 0;
  var _gtReaderBootFadeTimer = 0;
  var GT_PENDING_STABLE_MS = 900;
  var GT_PENDING_MIN_MS = 1200;
  var GT_READER_STABLE_MS = 600;
  var GT_READER_MIN_MS = 550;
  var GT_READER_BOOT_FADE_MS = 150;
  var GT_PENDING_HANGUL_RE = /[\uAC00-\uD7A3]/;

  function getPendingStableMs() {
    return isReaderPage() ? GT_READER_STABLE_MS : GT_PENDING_STABLE_MS;
  }

  function getPendingMinMs() {
    return isReaderPage() ? GT_READER_MIN_MS : GT_PENDING_MIN_MS;
  }

  function startTranslationPending() {
    try {
      document.documentElement.classList.add('gt-translation-pending');
      if (window.__gomnaTranslationPendingFailsafe) {
        clearTimeout(window.__gomnaTranslationPendingFailsafe);
        window.__gomnaTranslationPendingFailsafe = null;
      }
      window.__gomnaTranslationPendingFailsafe = setTimeout(function () {
        endTranslationPending();
      }, 6000);
    } catch (e) { /* ignore */ }
  }

  // Reader-only: fade out beige skeleton overlay after translated DOM is painted.
  // Safe to call multiple times; no-op on home / when boot class is absent.
  function releaseReaderBootOverlay(opts) {
    var immediate = !!(opts && opts.immediate);
    try {
      var html = document.documentElement;
      if (!html) return;
      var pending = html.classList.contains('gomna-reader-boot-pending') ||
        html.classList.contains('gomna-reader-boot-leaving') ||
        /* legacy class from earlier gate — clear if still present */
        html.classList.contains('gt-reader-prepaint-pending');
      if (!pending) {
        html.removeAttribute('data-gomna-reader-target-lang');
        return;
      }
      if (_gtReaderBootRaf1) {
        cancelAnimationFrame(_gtReaderBootRaf1);
        _gtReaderBootRaf1 = 0;
      }
      if (_gtReaderBootRaf2) {
        cancelAnimationFrame(_gtReaderBootRaf2);
        _gtReaderBootRaf2 = 0;
      }
      if (_gtReaderBootFadeTimer) {
        clearTimeout(_gtReaderBootFadeTimer);
        _gtReaderBootFadeTimer = 0;
      }
      function clearBoot() {
        _gtReaderBootRaf1 = 0;
        _gtReaderBootRaf2 = 0;
        _gtReaderBootFadeTimer = 0;
        try {
          html.classList.remove('gomna-reader-boot-pending');
          html.classList.remove('gomna-reader-boot-leaving');
          html.classList.remove('gt-reader-prepaint-pending');
          html.removeAttribute('data-gomna-reader-target-lang');
        } catch (e2) { /* ignore */ }
      }
      if (immediate) {
        clearBoot();
        return;
      }
      _gtReaderBootRaf1 = requestAnimationFrame(function () {
        _gtReaderBootRaf1 = 0;
        _gtReaderBootRaf2 = requestAnimationFrame(function () {
          _gtReaderBootRaf2 = 0;
          try { html.classList.add('gomna-reader-boot-leaving'); } catch (e3) { /* ignore */ }
          _gtReaderBootFadeTimer = setTimeout(clearBoot, GT_READER_BOOT_FADE_MS);
        });
      });
    } catch (e) { /* ignore */ }
  }

  function endTranslationPending(opts) {
    try {
      document.documentElement.classList.remove('gt-translation-pending');
      clearApplyInFlight(null);
      if (window.__gomnaTranslationPendingFailsafe) {
        clearTimeout(window.__gomnaTranslationPendingFailsafe);
        window.__gomnaTranslationPendingFailsafe = null;
      }
      if (_gtPendingStableTimer) {
        clearTimeout(_gtPendingStableTimer);
        _gtPendingStableTimer = null;
      }
      if (_gtPendingRaf1) {
        cancelAnimationFrame(_gtPendingRaf1);
        _gtPendingRaf1 = 0;
      }
      if (_gtPendingRaf2) {
        cancelAnimationFrame(_gtPendingRaf2);
        _gtPendingRaf2 = 0;
      }
      if (_gtPendingObserver) {
        _gtPendingObserver.disconnect();
        _gtPendingObserver = null;
      }
      _gtPendingBaselines = null;
      _gtPendingWatching = false;
      _gtPendingFirstChangeMs = 0;
      _gtPendingLastRelevantChangeMs = 0;
      _gtPendingLastChangedCount = 0;
      /* Spinner/banner often become visible the moment pending lifts — reinforce hide once. */
      try { injectWidgetHideStyles(); } catch (e2) { /* ignore */ }
      try { unlockReaderScrollLocks(); } catch (eUnlock) { /* ignore */ }
      /* Reader boot skeleton: fade out after paint (immediate for ko / no-cookie). */
      if (isReaderPage()) {
        var immediate = !!(opts && opts.immediate);
        var tlNow = getCurrentTargetLang();
        if (!hasGoogTransCookie() || !tlNow || tlNow === 'ko') immediate = true;
        /* Already-translated cookie boot: never keep the blocking overlay. */
        if (isGoogleTranslatedDom()) immediate = true;
        releaseReaderBootOverlay({ immediate: immediate });
        try {
          window.dispatchEvent(new CustomEvent('gomna:reader-translation-settled', {
            detail: { lang: tlNow || null }
          }));
        } catch (e3) { /* ignore */ }
        try { window.__gomnaBridgeDisplayLang = null; } catch (ePendClr) { /* ignore */ }
        if (window.GomnaReaderLangBridge && typeof window.GomnaReaderLangBridge.syncAllBridges === 'function') {
          try { window.GomnaReaderLangBridge.syncAllBridges(); } catch (eSyncBr) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
  }

  function isGtPendingI18nManagedEl(el) {
    if (!el || !el.closest) return true;
    if (el.closest('[translate="no"], .notranslate')) return true;
    if (el.closest(
      '[data-i18n-ui],[data-i18n-category],[data-i18n-cat-short],[data-i18n-cat-name],' +
      '[data-i18n-cat-foreign],[data-i18n-foreign-all],[data-i18n-testament],[data-i18n-welcome]'
    )) return true;
    if (document.documentElement.classList.contains('gomna-native-i18n-active') &&
        el.closest('[data-i18n-key],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-title]')) {
      return true;
    }
    if (el.getAttribute && (
      el.getAttribute('translate') === 'no' ||
      el.hasAttribute('data-i18n-ui') ||
      el.hasAttribute('data-i18n-category') ||
      el.hasAttribute('data-i18n-cat-short') ||
      el.hasAttribute('data-i18n-cat-name') ||
      el.hasAttribute('data-i18n-cat-foreign') ||
      el.hasAttribute('data-i18n-foreign-all') ||
      el.hasAttribute('data-i18n-testament') ||
      el.hasAttribute('data-i18n-welcome') ||
      (document.documentElement.classList.contains('gomna-native-i18n-active') && (
        el.hasAttribute('data-i18n-key') ||
        el.hasAttribute('data-i18n-placeholder') ||
        el.hasAttribute('data-i18n-aria-label') ||
        el.hasAttribute('data-i18n-title')
      ))
    )) return true;
    return false;
  }

  function isGtPendingIgnoredMutationTarget(node) {
    var el = node;
    if (!el) return true;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || !el.closest) return true;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' ||
        tag === 'IFRAME' || tag === 'SVG' || tag === 'PATH' || tag === 'CIRCLE' ||
        tag === 'IMG' || tag === 'SOURCE') return true;
    if (el.getAttribute && (
      el.getAttribute('aria-hidden') === 'true' ||
      el.hasAttribute('hidden')
    )) return true;
    if (el.closest('[aria-hidden="true"], [hidden]')) return true;
    if (el.closest('svg')) return true;
    if (el.closest(
      '#google_translate_element,#gt-feature-toast,#gtModal,.gt-modal,' +
      '#goog-gt-tt,.goog-te-banner-frame,.VIpgJd-ZVi9od-aZ2wEe-wOHMyf,' +
      '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf-ti6hGc,.VIpgJd-ZVi9od-ORHb-OEVmcd'
    )) return true;
    if (el.closest('iframe.skiptranslate, .skiptranslate > iframe')) return true;
    if (isGtPendingI18nManagedEl(el)) return true;
    return false;
  }

  function isGtPendingVisibleProbeEl(el) {
    if (!el || !el.getAttribute) return false;
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return false;
    if (el.closest && el.closest('[aria-hidden="true"], [hidden]')) return false;
    /* Do not use getComputedStyle visibility: pending CSS sets body>*{visibility:hidden}. */
    try {
      if (el.style && el.style.display === 'none') return false;
    } catch (e) { /* ignore */ }
    return true;
  }

  function getTranslationProbeEls() {
    var sels = [
      '.title',
      '.sub',
      '#greeting',
      '#continueLabel',
      '.gm-btn-today-open',
      '#verse-tag',
      '.card.old .card-name',
      '.card.old .card-desc',
      '.card.new .card-name',
      '.card.new .card-desc',
      '.card.easy .card-desc',
      '.quick-item .quick-name',
      '.quick-item .quick-desc',
      '.commentary-slim-name',
      '.commentary-slim-desc',
      /* reader.html: chrome + verse UI labels used for GT completion probes */
      '#verseReadTitleText',
      '#readerDockTopTitle',
      '.scripture-dock-label',
      '#opt4BottomPrev',
      '#opt4BottomNext',
      '#opt4BottomChapters',
      '#opt4VerseListen',
      '#opt4VerseCommentary',
      '.home-btn',
      '.logo-text',
      '.verse-text'
    ];
    var out = [];
    var seen = [];
    for (var i = 0; i < sels.length; i++) {
      var nodes = document.querySelectorAll(sels[i]);
      for (var j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        if (!el || isGtPendingI18nManagedEl(el)) continue;
        if (!isGtPendingVisibleProbeEl(el)) continue;
        var text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);
        out.push(el);
      }
    }
    return out;
  }

  function captureTranslationBaselines() {
    var els = getTranslationProbeEls();
    var map = [];
    for (var i = 0; i < els.length; i++) {
      map.push({
        el: els[i],
        text: String(els[i].textContent || '').replace(/\s+/g, ' ').trim()
      });
    }
    return map;
  }

  function hasTranslatedDirClass() {
    var html = document.documentElement;
    return !!(html && (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')));
  }

  function countChangedProbes() {
    var changed = 0;
    var total = 0;
    if (!_gtPendingBaselines) return { changed: 0, total: 0 };
    for (var i = 0; i < _gtPendingBaselines.length; i++) {
      var item = _gtPendingBaselines[i];
      if (!item || !item.el) continue;
      total += 1;
      var now = String(item.el.textContent || '').replace(/\s+/g, ' ').trim();
      if (now !== item.text) changed += 1;
    }
    return { changed: changed, total: total };
  }

  function hasProbeThresholdMet() {
    var c = countChangedProbes();
    /* Reader: require at least 2 probes to leave Korean source text. */
    if (isReaderPage()) return c.changed >= 2;
    if (c.total >= 5) return c.changed >= Math.ceil(c.total / 2);
    if (c.total >= 3) return c.changed >= 3;
    return false;
  }

  function canCompleteWithSparseProbes() {
    if (isReaderPage()) return false;
    var c = countChangedProbes();
    /* 1–2 probes: never finish on probe count alone; require DOM text churn + stability. */
    return c.total > 0 && c.total <= 2 && c.changed >= 1 && !!_gtPendingFirstChangeMs;
  }

  function probesStillHaveHangul() {
    if (!_gtPendingBaselines || !_gtPendingBaselines.length) return false;
    for (var i = 0; i < _gtPendingBaselines.length; i++) {
      var item = _gtPendingBaselines[i];
      if (!item || !item.el) continue;
      if (!item.el.isConnected) continue;
      if (isGtPendingI18nManagedEl(item.el)) continue;
      if (!isGtPendingVisibleProbeEl(item.el)) continue;
      var now = String(item.el.textContent || '');
      if (GT_PENDING_HANGUL_RE.test(now)) return true;
    }
    return false;
  }

  function noteRelevantTranslationChange() {
    var now = Date.now();
    if (!_gtPendingFirstChangeMs) _gtPendingFirstChangeMs = now;
    _gtPendingLastRelevantChangeMs = now;
    scheduleTranslationPendingRecheck(getPendingStableMs());
  }

  function scheduleTranslationPendingRecheck(delay) {
    if (_gtPendingStableTimer) {
      clearTimeout(_gtPendingStableTimer);
      _gtPendingStableTimer = null;
    }
    _gtPendingStableTimer = setTimeout(function () {
      _gtPendingStableTimer = null;
      tryFinishTranslationPending();
    }, Math.max(20, delay || getPendingStableMs()));
  }

  function tryFinishTranslationPending() {
    if (!document.documentElement.classList.contains('gt-translation-pending')) return;
    if (!hasTranslatedDirClass()) return;

    var probeOk = hasProbeThresholdMet() || canCompleteWithSparseProbes();
    if (!probeOk) return;
    /* Multi-wave mobile GT: keep pending while probe UI labels still contain Hangul. */
    if (probesStillHaveHangul()) {
      scheduleTranslationPendingRecheck(getPendingStableMs());
      return;
    }
    /*
     * Cookie-boot / already-translated pages never emit a post-baseline mutation,
     * so firstChangeMs stays 0. Without this, reader boot overlay
     * (pointer-events:auto) can leave the page unscrollable until failsafe.
     */
    if (!_gtPendingFirstChangeMs) {
      _gtPendingFirstChangeMs = Date.now();
      _gtPendingLastRelevantChangeMs = _gtPendingFirstChangeMs;
    }

    var now = Date.now();
    var sinceFirst = now - _gtPendingFirstChangeMs;
    var sinceLast = now - (_gtPendingLastRelevantChangeMs || _gtPendingFirstChangeMs);
    var minMs = getPendingMinMs();
    var stableMs = getPendingStableMs();
    if (sinceFirst < minMs) {
      scheduleTranslationPendingRecheck(minMs - sinceFirst + 20);
      return;
    }
    if (sinceLast < stableMs) {
      scheduleTranslationPendingRecheck(stableMs - sinceLast + 20);
      return;
    }

    _gtPendingRaf1 = requestAnimationFrame(function () {
      _gtPendingRaf1 = 0;
      _gtPendingRaf2 = requestAnimationFrame(function () {
        _gtPendingRaf2 = 0;
        if (probesStillHaveHangul()) {
          scheduleTranslationPendingRecheck(getPendingStableMs());
          return;
        }
        endTranslationPending();
      });
    });
  }

  function mutationHasRelevantTextChange(mutations) {
    if (!mutations || !mutations.length) return false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData') {
        if (!isGtPendingIgnoredMutationTarget(m.target)) return true;
        continue;
      }
      if (m.type === 'childList') {
        var nodes = [];
        var a;
        for (a = 0; a < m.addedNodes.length; a++) nodes.push(m.addedNodes[a]);
        for (a = 0; a < m.removedNodes.length; a++) nodes.push(m.removedNodes[a]);
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (!node) continue;
          if (node.nodeType === 3) {
            if (String(node.nodeValue || '').replace(/\s+/g, '').length &&
                !isGtPendingIgnoredMutationTarget(node)) return true;
            continue;
          }
          if (node.nodeType !== 1) continue;
          if (isGtPendingIgnoredMutationTarget(node)) continue;
          var text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) return true;
        }
      }
    }
    return false;
  }

  function maybeRefreshReaderVerseBaselines() {
    if (!isReaderPage() || !_gtPendingBaselines) return;
    var verses = document.querySelectorAll('.verse-text');
    if (!verses.length) return;
    var hasVerseBaseline = false;
    for (var i = 0; i < _gtPendingBaselines.length; i++) {
      var el = _gtPendingBaselines[i] && _gtPendingBaselines[i].el;
      if (el && el.classList && el.classList.contains('verse-text')) {
        hasVerseBaseline = true;
        break;
      }
    }
    if (!hasVerseBaseline) {
      _gtPendingBaselines = captureTranslationBaselines();
      var initial = countChangedProbes();
      _gtPendingLastChangedCount = initial.changed;
    }
  }

  function onTranslationPendingMutations(mutations) {
    maybeRefreshReaderVerseBaselines();
    var contentChanged = mutationHasRelevantTextChange(mutations);
    var probe = countChangedProbes();
    var probeIncreased = probe.changed > _gtPendingLastChangedCount;
    if (probeIncreased) _gtPendingLastChangedCount = probe.changed;
    if (contentChanged || probeIncreased) noteRelevantTranslationChange();
    else if (hasTranslatedDirClass()) tryFinishTranslationPending();
  }

  function watchTranslationPendingComplete() {
    if (_gtPendingWatching) return;
    if (!document.documentElement.classList.contains('gt-translation-pending')) return;
    _gtPendingWatching = true;
    _gtPendingFirstChangeMs = 0;
    _gtPendingLastRelevantChangeMs = 0;
    _gtPendingLastChangedCount = 0;
    _gtPendingBaselines = captureTranslationBaselines();
    try {
      _gtPendingObserver = new MutationObserver(function (mutations) {
        onTranslationPendingMutations(mutations);
      });
      _gtPendingObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      var root = document.querySelector('.container') ||
        document.querySelector('.phone-frame') ||
        document.body;
      if (root) {
        _gtPendingObserver.observe(root, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
      /* Class may already be present; probe may already differ. */
      var initial = countChangedProbes();
      _gtPendingLastChangedCount = initial.changed;
      if (initial.changed > 0 || hasTranslatedDirClass()) {
        if (initial.changed > 0) noteRelevantTranslationChange();
        else tryFinishTranslationPending();
      }
    } catch (e) {
      /* failsafe timer will clear pending */
    }
  }

  function injectWidgetHideStyles() {
    var css =
      /* Keep page from being pushed down by Google banner.
       * Also neutralize GT inline height/min-height so EN/JA match KO scroll layout. */
      'html.translated-ltr,html.translated-rtl{' +
        'height:auto!important' +
      '}' +
      'html body,html.translated-ltr body,html.translated-rtl body{' +
        'top:0!important;margin-top:0!important;position:static!important;' +
        'min-height:0!important' +
      '}' +
      /* Classic banner / tooltip chrome. */
      '.goog-te-banner-frame,.goog-te-banner-frame.skiptranslate,' +
      'iframe.goog-te-banner-frame,#goog-gt-tt,.goog-te-balloon-frame,' +
      '.VIpgJd-yAWNEb-L7lbkb,#goog-gt-vt,' +
      '.skiptranslate>iframe,' +
      'iframe.VIpgJd-ZVi9od-ORHb-OEVmcd,.VIpgJd-ZVi9od-ORHb-OEVmcd{' +
        'display:none!important;visibility:hidden!important;opacity:0!important;' +
        'pointer-events:none!important;width:0!important;height:0!important;border:0!important' +
      '}' +
      /* Body-direct banner host only (not .goog-te-gadget / tooltips with ids). */
      'body > .skiptranslate:not(.goog-te-gadget):not(#goog-gt-tt):not(.VIpgJd-yAWNEb-L7lbkb){' +
        'display:none!important;visibility:hidden!important;opacity:0!important;' +
        'pointer-events:none!important;height:0!important;overflow:hidden!important' +
      '}' +
      /* Blue circular Google Translate loading badge (observed outside #google_translate_element). */
      '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf,' +
      '.VIpgJd-ZVi9od-aZ2wEe-wOHMyf-ti6hGc,' +
      '.VIpgJd-ZVi9od-aZ2wEe-OiiCO,' +
      '.VIpgJd-ZVi9od-aZ2wEe-OiiCO-ti6hGc,' +
      'svg.VIpgJd-ZVi9od-aZ2wEe,' +
      '.VIpgJd-ZVi9od-aZ2wEe-Jt5cK,' +
      '.goog-te-spinner-pos,.goog-te-spinner-animation,.goog-te-spinner,.goog-te-spinner-image{' +
        'display:none!important;visibility:hidden!important;opacity:0!important;' +
        'pointer-events:none!important;width:0!important;height:0!important' +
      '}' +
      '.goog-text-highlighted{background:transparent!important;box-shadow:none!important;border:0!important}' +
      'font[style*="vertical-align"]{vertical-align:baseline!important}' +
      '#google_translate_element{' +
        'position:fixed!important;left:-9999px!important;top:-9999px!important;' +
        'width:1px!important;height:1px!important;overflow:hidden!important;' +
        'visibility:hidden!important;pointer-events:none!important;opacity:0!important' +
      '}';

    var s = document.getElementById('gt-widget-hide');
    if (!s) {
      s = document.createElement('style');
      s.id = 'gt-widget-hide';
      document.head.appendChild(s);
    }
    s.textContent = css;
    /* Re-append last so later Google-injected sheets do not outrank these hides. */
    if (s.parentNode) s.parentNode.appendChild(s);
  }

  /**
   * Strip Google Translate inline styles that Korean mode never has, so EN/JA
   * keep the same document scroll / plain-verse gesture layout as KO.
   */
  function normalizeReaderScrollStylesToKoreanBaseline() {
    if (!isReaderPage()) return;
    try {
      var html = document.documentElement;
      var body = document.body;
      if (!html || !body) return;

      /* GT sets: position:relative; min-height:100%; top:40px */
      body.style.removeProperty('position');
      body.style.removeProperty('top');
      body.style.removeProperty('min-height');
      body.style.removeProperty('margin-top');
      if (body.style.overflow === 'hidden') body.style.removeProperty('overflow');
      if (body.style.overflowX === 'hidden') body.style.removeProperty('overflowX');
      if (body.style.overflowY === 'hidden') body.style.removeProperty('overflowY');
      if (body.style.touchAction === 'none') body.style.removeProperty('touch-action');
      if (!(body.getAttribute('style') || '').trim()) body.removeAttribute('style');

      /* GT sets html style height:100% which KO never has. */
      if (html.style.height === '100%') html.style.removeProperty('height');
    } catch (e) { /* ignore */ }
  }

  var _gtTriggerSeq = 0;
  var _gtApplyInFlightLang = null;
  var _gtApplyInFlightUntil = 0;
  var _gtReloadArmedForToken = 0;
  var _gtPrevBodyOverflow = null;
  var GT_TRIGGER_MAX_ATTEMPTS = 40; /* ~6s — align with pending failsafe */

  function cancelWidgetLanguageTrigger() {
    _gtTriggerSeq += 1;
  }

  function clearApplyInFlight(lang) {
    if (lang == null || _gtApplyInFlightLang === lang) {
      _gtApplyInFlightLang = null;
      _gtApplyInFlightUntil = 0;
    }
  }

  function markApplyInFlight(lang) {
    _gtApplyInFlightLang = lang || null;
    _gtApplyInFlightUntil = Date.now() + 8000;
  }

  function isApplyInFlight(lang) {
    return !!(
      lang &&
      _gtApplyInFlightLang === lang &&
      Date.now() < _gtApplyInFlightUntil
    );
  }

  function ensureTranslateWidget() {
    if (window.__gtWidgetLoaded) return;
    if (window.__gtWidgetLoading) return;

    injectWidgetHideStyles();

    if (!document.getElementById('google_translate_element')) {
      const wrapper = document.createElement('div');
      wrapper.id = 'google_translate_element';
      document.body.appendChild(wrapper);
    }

    window.googleTranslateElementInit = function () {
      try {
        if (!window.__gtWidgetLoaded && window.google && google.translate && google.translate.TranslateElement) {
          new google.translate.TranslateElement({
            pageLanguage: 'ko',
            autoDisplay: false,
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE
          }, 'google_translate_element');
          window.__gtWidgetLoaded = true;
        }
      } catch (e) { /* swallow — trigger / reload paths recover */ }
      window.__gtWidgetLoading = false;
      /* Widget init injects banner/spinner nodes + sheets; reinforce hide CSS once. */
      try { injectWidgetHideStyles(); } catch (e2) { /* ignore */ }
    };

    var existingScript = document.querySelector('script[src*="translate_a/element.js"]');
    if (existingScript) {
      window.__gtWidgetLoading = true;
      /* Script already present; callback may have run or will run. */
      if (window.google && google.translate && google.translate.TranslateElement) {
        try { window.googleTranslateElementInit(); } catch (eInit) { /* ignore */ }
      }
      return;
    }

    window.__gtWidgetLoading = true;
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.setAttribute('data-gomna-gt-element', '1');
    script.onerror = function () {
      window.__gtWidgetLoading = false;
      window.__gtWidgetLoaded = false;
      showToast('번역 서비스 로드 실패 · Translation service failed to load');
      endTranslationPending({ immediate: true });
      clearApplyInFlight(null);
      try { unlockReaderScrollLocks(); } catch (eUnlockErr) { /* ignore */ }
    };
    document.head.appendChild(script);
  }

  function unlockReaderScrollLocks() {
    try {
      if (document.body) {
        if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
        if (document.body.style.overflowX === 'hidden') document.body.style.overflowX = '';
        if (document.body.style.overflowY === 'hidden') document.body.style.overflowY = '';
        if (document.body.style.touchAction === 'none') document.body.style.touchAction = '';
      }
    } catch (e0) { /* ignore */ }
    try { injectWidgetHideStyles(); } catch (e1) { /* ignore */ }
    try { normalizeReaderScrollStylesToKoreanBaseline(); } catch (eNorm) { /* ignore */ }
    try {
      var html = document.documentElement;
      if (
        html &&
        (html.classList.contains('gomna-reader-boot-pending') ||
          html.classList.contains('gomna-reader-boot-leaving') ||
          html.classList.contains('gt-reader-prepaint-pending')) &&
        (isGoogleTranslatedDom() || !hasGoogTransCookie() || getCurrentTargetLang() === 'ko')
      ) {
        releaseReaderBootOverlay({ immediate: true });
      }
    } catch (e2) { /* ignore */ }
  }

  function beginWidgetLanguageTrigger(targetLang) {
    var token = ++_gtTriggerSeq;
    triggerWidgetLanguage(targetLang, 0, token);
    return token;
  }

  function triggerWidgetLanguage(targetLang, attempts, token) {
    if (token == null) token = ++_gtTriggerSeq;
    if (token !== _gtTriggerSeq) return false; /* superseded by a newer request */
    attempts = attempts || 0;

    /* Target no longer desired (user switched / cookie cleared) — exit quietly. */
    var cookieLang = getCurrentTargetLang();
    if (targetLang && targetLang !== 'ko') {
      if (!hasGoogTransCookie() || cookieLang !== targetLang) {
        return false;
      }
    }

    const select = document.querySelector('select.goog-te-combo');
    if (select) {
      select.value = targetLang;
      // Native event so Google's listener picks it up.
      const evt = (typeof Event === 'function') ? new Event('change', { bubbles: true }) : (function () {
        const e = document.createEvent('HTMLEvents'); e.initEvent('change', true, true); return e;
      })();
      select.dispatchEvent(evt);
      clearApplyInFlight(targetLang);
      return true;
    }
    /*
     * InlineLayout.SIMPLE no longer exposes select.goog-te-combo.
     * Cookie + widget init often still applies translation (translated-ltr).
     * Treat matching applied DOM as success so we do not false-fail.
     */
    if (targetLang && targetLang !== 'ko' && isGoogleTranslatedDom()) {
      var applied = getCurrentTargetLang();
      if (applied === targetLang) {
        try {
          endTranslationPending({ immediate: true });
          unlockReaderScrollLocks();
        } catch (eOk) { /* ignore */ }
        clearApplyInFlight(targetLang);
        return true;
      }
    }
    if (attempts < GT_TRIGGER_MAX_ATTEMPTS) {
      setTimeout(function () { triggerWidgetLanguage(targetLang, attempts + 1, token); }, 150);
      return false;
    }
    if (token !== _gtTriggerSeq) return false;

    /*
     * iPhone / no-combo path: cookie is already set; reload lets Google apply
     * on boot when the in-place combo trigger cannot run.
     * At most one reload per trigger token (no infinite reload loop).
     */
    if (
      isReaderPage() &&
      targetLang &&
      targetLang !== 'ko' &&
      hasGoogTransCookie() &&
      getCurrentTargetLang() === targetLang &&
      _gtReloadArmedForToken !== token
    ) {
      _gtReloadArmedForToken = token;
      try {
        endTranslationPending({ immediate: true });
        unlockReaderScrollLocks();
      } catch (eReload) { /* ignore */ }
      showToast('🌐 번역 적용 중... · Applying translation...');
      setTimeout(function () {
        if (token !== _gtTriggerSeq) return;
        location.reload();
      }, 200);
      return false;
    }

    /* Only surface a hard failure when this request is still current and unmet. */
    if (token !== _gtTriggerSeq) return false;
    if (targetLang && targetLang !== 'ko' && isGoogleTranslatedDom() && getCurrentTargetLang() === targetLang) {
      clearApplyInFlight(targetLang);
      return true;
    }
    try {
      endTranslationPending({ immediate: true });
      unlockReaderScrollLocks();
    } catch (eFail) { /* ignore */ }
    clearApplyInFlight(targetLang);
    showToast('번역 적용 실패 · Could not apply translation');
    return false;
  }

  var _gtReaderRetranslateTimer = null;
  function retranslateReaderBody(reason) {
    if (!isReaderPage()) return false;
    var lang = getCurrentTargetLang();
    if (!lang || lang === 'ko') return false;
    if (!hasGoogTransCookie()) return false;
    ensureTranslateWidget();
    if (_gtReaderRetranslateTimer) {
      clearTimeout(_gtReaderRetranslateTimer);
      _gtReaderRetranslateTimer = null;
    }
    /* Debounce rapid chapter jumps; keep reading position (caller restores separately). */
    _gtReaderRetranslateTimer = setTimeout(function () {
      _gtReaderRetranslateTimer = null;
      var still = getCurrentTargetLang();
      if (!still || still === 'ko' || !hasGoogTransCookie()) return;
      try {
        var select = document.querySelector('select.goog-te-combo');
        if (select) {
          /* Force Google to notice Korean source DOM inserted after prior translation. */
          var prev = select.value;
          if (prev === still) {
            select.value = '';
            try {
              select.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e0) { /* ignore */ }
            setTimeout(function () { beginWidgetLanguageTrigger(still); }, 30);
          } else {
            beginWidgetLanguageTrigger(still);
          }
        } else {
          beginWidgetLanguageTrigger(still);
        }
        if (BOOK_LANG_IDX[still]) {
          setTimeout(function () { applyBookNameI18n(still); }, 800);
        }
        applyUiTextI18n(still);
      } catch (e1) { /* ignore */ }
    }, reason === 'renderVerses' ? 80 : 0);
    return true;
  }
  window.GomnaReaderRetranslateBody = retranslateReaderBody;
  window.GomnaNormalizeReaderScrollStyles = normalizeReaderScrollStylesToKoreanBaseline;

  function showToast(msg) {
    let t = document.getElementById('gt-feature-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gt-feature-toast';
      t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(20,12,4,.92);color:#fff5e0;padding:12px 22px;border-radius:20px;font-size:13px;font-weight:500;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90%;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window.__gtToastTimer);
    window.__gtToastTimer = setTimeout(function () { t.style.display = 'none'; }, 2500);
  }

  function saveRecentForeignLanguage(langCode) {
    if (!langCode || langCode === 'ko') return;
    try { localStorage.setItem('gomna_recent_foreign_language', langCode); } catch (e) { /* ignore */ }
    if (window.GomnaReaderLangBridge && typeof window.GomnaReaderLangBridge.setRecentForeignLanguage === 'function') {
      try { window.GomnaReaderLangBridge.setRecentForeignLanguage(langCode); } catch (e2) { /* ignore */ }
    }
  }

  function dispatchReaderLanguageChange(activeLanguage, source) {
    var recent = null;
    try { recent = localStorage.getItem('gomna_recent_foreign_language'); } catch (e) { /* ignore */ }
    // Do not promote active JA (or other UI langs) into the quick-foreign slot.
    if (!recent || recent === 'ko') recent = 'en';
    try {
      window.dispatchEvent(new CustomEvent('gomna:languagechange', {
        detail: {
          activeLanguage: activeLanguage || 'ko',
          recentForeignLanguage: recent,
          quickForeignLanguage: 'en',
          source: source || 'translate_feature'
        }
      }));
    } catch (e2) { /* ignore */ }
    if (window.GomnaReaderLangBridge && typeof window.GomnaReaderLangBridge.syncAllBridges === 'function') {
      try { window.GomnaReaderLangBridge.syncAllBridges(); } catch (e3) { /* ignore */ }
    }
  }

  function prepareReaderLanguageTransition(nextLang, source) {
    if (!isReaderPage()) return;
    if (window.GomnaReaderLangBridge && typeof window.GomnaReaderLangBridge.prepareTransition === 'function') {
      try { window.GomnaReaderLangBridge.prepareTransition(nextLang, source || 'translate_feature'); } catch (e) { /* ignore */ }
    }
  }

  function syncReaderUiLanguageStorage(nextLang) {
    if (!isReaderPage()) return;
    try {
      if (nextLang === 'ko' || nextLang === 'en' || nextLang === 'ja') {
        localStorage.setItem('gomna_ui_language', nextLang);
      } else {
        localStorage.removeItem('gomna_ui_language');
      }
    } catch (e) { /* ignore */ }
  }

  function applyLanguage(country, opts) {
    if (!country) return;
    opts = opts || {};
    var applySource = opts.source || 'language-modal';
    saveRecent(country[0]);

    const nextLang = country[3];
    const currentLang = getActiveLangCode();
    const homeNative = isHomePage() && isNativeHomeLanguage(nextLang);
    const readerNativePair = isReaderPage() && isNativeHomeLanguage(nextLang);

    if (nextLang && nextLang !== 'ko') {
      saveRecentForeignLanguage(nextLang);
    }

    // No-op: same language already active (unless cleaning a Google-translated DOM).
    // Capture current BEFORE any optimistic display flag so EN/JA taps are not no-ops.
    // Reader en/ja can report "active" via gomna_ui_language while the verse body is
    // still Korean (Google not applied) — do not no-op in that stuck state.
    var readerBodyNeedsGoogle =
      readerNativePair &&
      nextLang !== 'ko' &&
      !isGoogleTranslatedDom();
    if (
      currentLang === nextLang &&
      !readerBodyNeedsGoogle &&
      !(homeNative && isGoogleTranslatedDom()) &&
      !(readerNativePair && nextLang === 'ko' && isGoogleTranslatedDom())
    ) {
      closeModal();
      try { window.__gomnaBridgeDisplayLang = null; } catch (ePend2) { /* ignore */ }
      dispatchReaderLanguageChange(nextLang, applySource + '-noop');
      return;
    }

    /* Drop duplicate in-flight applies for the same target (rapid globe / bridge taps). */
    if (isApplyInFlight(nextLang) && !readerBodyNeedsGoogle) {
      closeModal();
      return;
    }
    cancelWidgetLanguageTrigger();
    markApplyInFlight(nextLang);

    try { window.__gomnaBridgeDisplayLang = nextLang; } catch (ePend) { /* ignore */ }

    if (window.GomnaAnalytics) {
      GomnaAnalytics.trackChangeTranslation(currentLang || 'ko', nextLang);
    }

    // Home ko/en/ja: instant native UI swap (no pending / no Google widget).
    if (homeNative) {
      try { localStorage.setItem('gomna_ui_language', nextLang); } catch (e) { /* ignore */ }
      if (nextLang === 'ko') clearGoogTransCookie();
      else setGoogTransCookie(nextLang);
      closeModal();

      // Leaving a Google-translated DOM for native mode needs one cleanup reload.
      if (isGoogleTranslatedDom()) {
        location.reload();
        return;
      }

      if (window.GomnaUII18n && typeof window.GomnaUII18n.setLanguage === 'function') {
        window.GomnaUII18n.setLanguage(nextLang);
      }
      applyUiTextI18n(nextLang);
      if (typeof window.__gomnaRefreshHomeI18n === 'function') {
        try { window.__gomnaRefreshHomeI18n(); } catch (e2) { /* ignore */ }
      }
      try { window.__gomnaBridgeDisplayLang = null; } catch (ePend3) { /* ignore */ }
      endTranslationPending();
      dispatchReaderLanguageChange(nextLang, applySource + '-home-native');
      return;
    }

    // Home + unsupported language: drop native mode, use Google Translate path.
    if (isHomePage()) {
      try { localStorage.removeItem('gomna_ui_language'); } catch (e3) { /* ignore */ }
      if (window.GomnaUII18n && typeof window.GomnaUII18n.deactivate === 'function') {
        window.GomnaUII18n.deactivate();
      }
    }

    syncReaderUiLanguageStorage(nextLang);
    prepareReaderLanguageTransition(nextLang, applySource);

    /*
     * Reader ko/en/ja:
     * - No full EN/JA Bible verse datasets exist in this repo (Korean bodies only).
     * - Body text uses Google Translate Element.
     * - KO→EN / KO→JA: in-place widget trigger (no reload) for immediate response.
     * - EN↔JA or any already-translated → other: reload (widget cannot reliably retranslate).
     * - →KO: reload to restore clean Korean source DOM.
     */
    if (readerNativePair) {
      closeModal();
      dispatchReaderLanguageChange(nextLang, applySource + '-reader-native');

      if (nextLang === 'ko') {
        var wasTranslatedDom = isGoogleTranslatedDom();
        clearGoogTransCookie();
        if (wasTranslatedDom) {
          showToast('🌐 한국어로 복원 중... · Restoring Korean...');
          setTimeout(function () { location.reload(); }, 200);
          return;
        }
        try { window.__gomnaBridgeDisplayLang = null; } catch (ePend4) { /* ignore */ }
        if (typeof window.syncReaderNativeUiLangClass === 'function') {
          try { window.syncReaderNativeUiLangClass(); } catch (eSync) { /* ignore */ }
        }
        if (typeof window.updateOpt4BottomBar === 'function') {
          try { window.updateOpt4BottomBar(); } catch (eBar) { /* ignore */ }
        }
        endTranslationPending({ immediate: true });
        return;
      }

      /* en / ja */
      setGoogTransCookie(nextLang);
      var needReload = isGoogleTranslatedDom() && currentLang && currentLang !== 'ko' && currentLang !== nextLang;
      if (needReload) {
        startTranslationPending();
        showToast('🌐 ' + country[1] + ' · ' + country[4] + ' 적용 중...');
        setTimeout(function () { location.reload(); }, 200);
        return;
      }

      startTranslationPending();
      ensureTranslateWidget();
      beginWidgetLanguageTrigger(nextLang);
      watchTranslationPendingComplete();
      if (BOOK_LANG_IDX[nextLang]) {
        setTimeout(function () { applyBookNameI18n(nextLang); }, 900);
      }
      setTimeout(function () { applyUiTextI18n(nextLang); }, 400);
      if (typeof window.syncReaderNativeUiLangClass === 'function') {
        try { window.syncReaderNativeUiLangClass(); } catch (eSync2) { /* ignore */ }
      }
      if (typeof window.updateOpt4BottomBar === 'function') {
        try { window.updateOpt4BottomBar(); } catch (eBar2) { /* ignore */ }
      }
      if (typeof window.updateVerseToolbar === 'function') {
        try { window.updateVerseToolbar(); } catch (eTb) { /* ignore */ }
      }
      if (window.GomnaCommentaryI18n && typeof window.GomnaCommentaryI18n.apply === 'function') {
        try { window.GomnaCommentaryI18n.apply(); } catch (eCi) { /* ignore */ }
      }
      return;
    }

    // Korean = source language → undo translation (non-native / Google-only langs).
    if (nextLang === 'ko') {
      clearGoogTransCookie();
      closeModal();
      showToast('🌐 한국어로 복원 중... · Restoring Korean...');
      dispatchReaderLanguageChange('ko', applySource);
      setTimeout(function () { location.reload(); }, 250);
      return;
    }

    // Set the cookie + reload. This is the most reliable way to switch
    // between any two languages — the Google Translate widget reads the
    // `googtrans` cookie during init() on the next page load and applies
    // the saved language automatically. The widget cannot reliably
    // retranslate an already-translated DOM (e.g. ENG → ESP), so reload
    // is required to go from any source → any target.
    startTranslationPending();
    setGoogTransCookie(nextLang);
    closeModal();
    showToast('🌐 ' + country[1] + ' · ' + country[4] + ' 적용 중...');
    dispatchReaderLanguageChange(nextLang, applySource);
    setTimeout(function () { location.reload(); }, 250);
  }

  function applyLanguageByCode(langCode, source) {
    var code = (langCode || '').toLowerCase();
    if (!code) return;
    var country = findAnchorForLang(code) || COUNTRIES.find(function (c) { return c[3] === code; });
    if (!country && code === 'ko') country = findByCode('KR');
    if (!country) return;
    applyLanguage(country, { source: source || 'apply-by-code' });
  }

  function searchCountries(query) {
    const qRaw = (query || '').trim();
    if (!qRaw) return [];
    const q = qRaw.toLowerCase();
    const out = [];
    for (let i = 0; i < COUNTRIES.length; i++) {
      const c = COUNTRIES[i];
      const names = getCountrySearchNames(c);
      let score = 0;
      for (let n = 0; n < names.length; n++) {
        if (!names[n]) continue;
        const hay = String(names[n]).toLowerCase();
        if (hay === q) score = Math.max(score, 100);
        else if (hay.startsWith(q)) score = Math.max(score, 80);
        else if (hay.indexOf(q) >= 0) score = Math.max(score, 60);
      }
      if (score > 0) out.push([score, c]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, 40).map(function (x) { return x[1]; });
  }

  function escapeHtml(s) {
    return (s + '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ------------------------------------------------------------------
  // Styles
  // ------------------------------------------------------------------
  const CSS = '\
.gt-btn{position:relative;isolation:isolate;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;background:transparent;border:none;padding:0;margin-right:2px;font-family:inherit;border-radius:50%;-webkit-tap-highlight-color:transparent}\
.gt-btn::after{content:"";position:absolute;top:50%;left:50%;width:40px;height:40px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(150,205,255,.55) 18%,rgba(120,180,255,.32) 38%,rgba(255,225,160,.18) 58%,rgba(255,225,160,0) 75%);filter:blur(2px);z-index:0;pointer-events:none;animation:gtGlobeBreath 3.6s ease-in-out infinite;will-change:opacity,transform}\
.gt-btn .gt-globe-img{position:relative;z-index:1;width:30px;height:30px;border-radius:50%;display:block;object-fit:cover;animation:gtGlobeSpin 30s linear infinite;will-change:transform;filter:drop-shadow(0 1px 2px rgba(0,0,0,.22)) drop-shadow(0 0 3px rgba(140,200,255,.35));transition:filter .3s ease, width .2s ease, height .2s ease}\
@keyframes gtGlobeSpin{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}\
@keyframes gtGlobeBreath{0%,100%{opacity:.78;transform:translate(-50%,-50%) scale(.96)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}}\
@media (prefers-reduced-motion:reduce){.gt-btn .gt-globe-img{animation:none}.gt-btn::after{animation:none;opacity:.85}}\
.gt-btn:hover .gt-globe-img{animation-duration:14s;filter:drop-shadow(0 2px 4px rgba(0,0,0,.28)) drop-shadow(0 0 6px rgba(140,200,255,.55))}\
.gt-btn:hover::after{animation-duration:2.2s}\
.gt-btn:active .gt-globe-img{transform:scale(.92)}\
.gt-btn.gt-on-dark{background:rgba(255,255,255,.15);width:36px;height:36px}\
.gt-btn.gt-on-dark .gt-globe-img{width:26px;height:26px}\
.gt-btn.gt-on-dark::after{width:36px;height:36px;background:radial-gradient(circle,rgba(180,220,255,.6) 18%,rgba(140,200,255,.35) 40%,rgba(255,225,160,.15) 60%,rgba(255,225,160,0) 78%)}\
.gt-modal{position:fixed;inset:0;display:none;z-index:9999;align-items:center;justify-content:center;padding:20px;background:rgba(20,12,4,.78);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}\
.gt-modal.show{display:flex;animation:gtFadeIn .3s ease}\
@keyframes gtFadeIn{from{opacity:0}to{opacity:1}}\
.gt-sheet{background:#faf6ed;border-radius:24px;max-width:480px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25);animation:gtSlide .4s cubic-bezier(.16,1,.3,1);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#3d2818}\
@keyframes gtSlide{from{transform:translateY(20px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}\
.gt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:.5px solid rgba(180,140,90,.25);flex-shrink:0}\
.gt-head-title{font-size:15px;font-weight:600;line-height:1.3}\
.gt-close{background:rgba(0,0,0,.07);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;color:#3d2818;font-size:14px;flex-shrink:0;font-family:inherit}\
.gt-close:active{transform:scale(.9);opacity:.6}\
.gt-body{padding:14px 18px 22px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch}\
.gt-section-label{font-size:11px;font-weight:600;color:#a87a35;margin:14px 0 8px;letter-spacing:.4px;text-transform:uppercase}\
.gt-section-label:first-child{margin-top:0}\
.gt-suggested{display:flex;align-items:center;gap:12px;padding:12px 14px;background:linear-gradient(135deg,#fff8eb 0%,#f5e8d0 100%);border-radius:14px;cursor:pointer;border:.5px solid rgba(200,152,73,.4);transition:all .2s;font-family:inherit;width:100%;text-align:left}\
.gt-suggested:hover{background:linear-gradient(135deg,#fff5e0 0%,#f0dfba 100%)}\
.gt-suggested:active{transform:scale(.98);opacity:.85}\
.gt-suggested-flag{font-size:30px;line-height:1;flex-shrink:0}\
.gt-suggested-info{flex:1;min-width:0}\
.gt-suggested-tag{font-size:10px;color:#a87a35;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px}\
.gt-suggested-name{font-size:14px;font-weight:600;color:#3d2818;line-height:1.25}\
.gt-suggested-arrow{font-size:18px;color:#a87a35;flex-shrink:0}\
.gt-regions{display:flex;flex-direction:column;gap:12px}\
.gt-region{position:relative}\
.gt-region-head{display:flex;align-items:center;gap:6px;margin:0 2px 6px;padding:0 2px}\
.gt-region-emoji{font-size:13px;line-height:1;flex-shrink:0;filter:saturate(.9)}\
.gt-region-name{font-size:11px;font-weight:700;color:#8a5a2a;letter-spacing:.2px;line-height:1.25;text-transform:none;flex-shrink:0;max-width:calc(100% - 22px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.gt-region-rule{flex:1;min-width:8px;height:1px;background:linear-gradient(90deg,rgba(200,152,73,.35),rgba(200,152,73,0));margin-left:2px;align-self:center}\
.gt-popular-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}\
.gt-pop-btn{position:relative;background:#fff;border:1px solid rgba(180,140,90,.3);border-radius:12px;padding:9px 4px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .2s;font-family:inherit;overflow:hidden}\
.gt-pop-btn:hover{background:#fff5e0;border-color:#c89849;transform:translateY(-1px);box-shadow:0 2px 6px rgba(200,152,73,.18)}\
.gt-pop-btn:active{transform:scale(.95);opacity:.7}\
.gt-pop-btn-active{background:linear-gradient(135deg,#fff5e0 0%,#f8e3b8 100%);border-color:#c89849;border-width:1.5px;box-shadow:0 0 0 2px rgba(200,152,73,.18),0 2px 8px rgba(200,152,73,.25)}\
.gt-pop-btn-active .gt-pop-label{color:#3d2818;font-weight:700}\
.gt-pop-check{position:absolute;top:4px;right:4px;width:15px;height:15px;border-radius:50%;background:#c89849;color:#fff;font-size:9px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.18);font-family:inherit}\
.gt-pop-flag{font-size:26px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.08))}\
.gt-pop-label{font-size:10.5px;color:#5a3818;font-weight:500;line-height:1.2;text-align:center;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}\
.gt-search-wrap{position:relative;margin-bottom:10px}\
.gt-search-input{width:100%;padding:11px 14px 11px 38px;border-radius:24px;border:.5px solid rgba(180,140,90,.4);background:#fff;font-family:inherit;font-size:14px;color:#3d2818;outline:none;-webkit-appearance:none;appearance:none}\
.gt-search-input::placeholder{color:#a89890}\
.gt-search-input:focus{border-color:#c89849;box-shadow:0 0 0 3px rgba(200,152,73,.15)}\
.gt-search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;opacity:.55;pointer-events:none}\
.gt-results{max-height:360px;overflow-y:auto;-webkit-overflow-scrolling:touch}\
.gt-result{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;cursor:pointer;transition:background .15s;font-family:inherit;width:100%;text-align:left;border:none;background:transparent}\
.gt-result:hover{background:#fff5e0}\
.gt-result:active{transform:scale(.98);opacity:.7}\
.gt-result-flag{font-size:22px;line-height:1;flex-shrink:0}\
.gt-result-info{flex:1;min-width:0}\
.gt-result-country{font-size:13.5px;font-weight:600;color:#3d2818;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.gt-result-lang{font-size:11.5px;color:#a87a35;margin-top:1px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.gt-no-results{text-align:center;padding:18px;color:#a89890;font-size:13px}\
.gt-foot{padding:8px 18px 14px;text-align:center;font-size:10.5px;color:#a89890;border-top:.5px solid rgba(180,140,90,.18)}\
.gt-view-all-btn{display:flex;align-items:center;justify-content:center;width:100%;margin:12px 0 2px;padding:12px 14px;border-radius:14px;border:.5px solid rgba(200,152,73,.45);background:linear-gradient(135deg,#fff8eb 0%,#f5e8d0 100%);color:#3d2818;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}\
.gt-view-all-btn:active{transform:scale(.98);opacity:.85}\
.gt-back-btn{display:flex;align-items:center;gap:4px;width:100%;margin:0 0 8px;padding:8px 2px;border:none;background:transparent;color:#8a5a2a;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;-webkit-tap-highlight-color:transparent}\
.gt-back-btn:active{opacity:.7}\
.gt-all-sticky{position:sticky;top:0;z-index:2;background:#faf6ed;padding:2px 0 8px;margin:0 0 2px}\
.gt-all-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}\
.gt-all-grid .gt-pop-label{white-space:normal;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.25;max-height:2.6em;text-overflow:ellipsis}\
@media (max-width:480px){\
.gt-modal{padding:0;align-items:flex-end}\
.gt-sheet{max-width:100%;max-height:90vh;border-radius:24px 24px 0 0}\
.gt-popular-grid{grid-template-columns:repeat(4,1fr);gap:5px}\
.gt-pop-btn{padding:8px 3px 7px;border-radius:11px}\
.gt-pop-flag{font-size:24px}\
.gt-pop-label{font-size:10px}\
.gt-region-name{font-size:10.5px}\
.gt-all-grid{grid-template-columns:repeat(3,1fr);gap:5px}\
}\
@media (max-width:360px){\
.gt-popular-grid{gap:4px}\
.gt-pop-btn{padding:7px 2px 6px}\
.gt-pop-flag{font-size:22px}\
.gt-pop-label{font-size:9.5px;letter-spacing:-.2px}\
.gt-all-grid{grid-template-columns:repeat(2,1fr);gap:5px}\
}\
@media (min-width:420px){\
.gt-all-grid{grid-template-columns:repeat(4,1fr)}\
}';

  function injectStyles() {
    if (document.getElementById('gt-styles')) return;
    const style = document.createElement('style');
    style.id = 'gt-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // Modal rendering
  // ------------------------------------------------------------------
  function renderSuggested(label, country) {
    var uiLang = _gtModalUiLang;
    var name = getLocalizedCountryName(country[0], uiLang, country);
    return '<div class="gt-section-label">' + escapeHtml(label) + '</div>' +
      '<button type="button" class="gt-suggested" data-code="' + country[0] + '">' +
      '<div class="gt-suggested-flag">' + flag(country[0]) + '</div>' +
      '<div class="gt-suggested-info">' +
      '<div class="gt-suggested-tag">' + escapeHtml(country[5]) + '</div>' +
      '<div class="gt-suggested-name">' + escapeHtml(name) + ' · ' + escapeHtml(country[4]) + '</div>' +
      '</div>' +
      '<div class="gt-suggested-arrow">›</div>' +
      '</button>';
  }

  // Each region's emoji prefix in the header. Visual hint only.
  const REGION_EMOJI = {
    asia: '🌏', seasia: '🌴', americas: '🌎', europe: '🌍', africa: '🌍'
  };

  // Shorter button labels for countries whose full names overflow a
  // 4-column grid on narrow phones. Only the listed codes are overridden.
  const POPULAR_NAME_OVERRIDE = {
    'ZA': { ko: '남아공', en: 'S. Africa', ja: '南ア' },
    'GB': { ko: '영국', en: 'UK', ja: '英国' },
    'US': { ko: '미국', en: 'USA', ja: '米国' }
  };

  function getPopularLabel(c, uiLang) {
    const ov = POPULAR_NAME_OVERRIDE[c[0]];
    if (ov) {
      if (uiLang === 'ko') return ov.ko;
      if (uiLang === 'ja') return ov.ja;
      return ov.en;
    }
    return getLocalizedCountryName(c[0], uiLang || 'en', c);
  }

  function renderCountryCard(c, uiLang, activeAnchorCode) {
    const isActive = (c[0] === activeAnchorCode);
    const cls = 'gt-pop-btn' + (isActive ? ' gt-pop-btn-active' : '');
    const label = getPopularLabel(c, uiLang);
    const ui = getModalUi();
    return '<button type="button" class="' + cls + '" data-code="' + c[0] + '"' +
      (isActive ? ' aria-current="true"' : '') + '>' +
      (isActive ? '<div class="gt-pop-check" aria-label="' + escapeHtml(ui.selected) + '">✓</div>' : '') +
      '<div class="gt-pop-flag">' + flag(c[0]) + '</div>' +
      '<div class="gt-pop-label">' + escapeHtml(label) + '</div>' +
      '</button>';
  }

  function renderRegionBlock(regionKey, codes, uiLang, activeAnchorCode, gridClass) {
    if (!codes || !codes.length) return '';
    let html = '<div class="gt-region">' +
      '<div class="gt-region-head">' +
      '<span class="gt-region-emoji" aria-hidden="true">' + (REGION_EMOJI[regionKey] || '') + '</span>' +
      '<span class="gt-region-name">' + escapeHtml(getModalRegionLabel(regionKey)) + '</span>' +
      '<span class="gt-region-rule" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="' + (gridClass || 'gt-popular-grid') + '">';
    codes.forEach(function (code) {
      const c = findByCode(code);
      if (!c) return;
      html += renderCountryCard(c, uiLang, activeAnchorCode);
    });
    html += '</div></div>';
    return html;
  }

  function renderPopularRegions() {
    const activeLang = getActiveLangCode();
    const activeAnchorCode = (LANG_ANCHOR[activeLang] || '');
    const uiLang = _gtModalUiLang;
    let html = '<div class="gt-regions">';
    POPULAR_REGIONS.forEach(function (region) {
      html += renderRegionBlock(region.key, region.codes, uiLang, activeAnchorCode, 'gt-popular-grid');
    });
    html += '</div>';
    return html;
  }

  function renderAllCountriesView(filterQuery) {
    const ui = getModalUi();
    const uiLang = _gtModalUiLang;
    const activeLang = getActiveLangCode();
    const activeAnchorCode = (LANG_ANCHOR[activeLang] || '');
    const q = (filterQuery || '').trim();
    const matched = q ? searchCountries(q) : COUNTRIES.slice();
    const matchedSet = {};
    matched.forEach(function (c) { matchedSet[c[0]] = true; });

    let html = '<div class="gt-all-view">' +
      '<button type="button" class="gt-back-btn" data-gt-view="popular">' +
      escapeHtml(ui.backPopular) + '</button>' +
      '<div class="gt-all-sticky">' +
      '<div class="gt-section-label">' + escapeHtml(ui.searchLabel) + '</div>' +
      '<div class="gt-search-wrap">' +
      '<svg class="gt-search-icon" viewBox="0 0 24 24" fill="none" stroke="#3d2818" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="search" class="gt-search-input" id="gtSearchInput" placeholder="' +
      escapeHtml(ui.searchPlaceholder) + '" autocomplete="off" value="' + escapeHtml(q) + '">' +
      '</div></div>';

    if (q && matched.length === 0) {
      html += '<div class="gt-no-results">' + escapeHtml(ui.noResults) + '</div></div>';
      return html;
    }

    html += '<div class="gt-regions gt-all-regions">';
    ALL_REGION_ORDER.forEach(function (regionKey) {
      const codes = [];
      COUNTRIES.forEach(function (c) {
        if (COUNTRY_REGION[c[0]] !== regionKey) return;
        if (q && !matchedSet[c[0]]) return;
        codes.push(c[0]);
      });
      html += renderRegionBlock(regionKey, codes, uiLang, activeAnchorCode, 'gt-all-grid');
    });

    const orphanCodes = [];
    COUNTRIES.forEach(function (c) {
      if (COUNTRY_REGION[c[0]]) return;
      if (q && !matchedSet[c[0]]) return;
      orphanCodes.push(c[0]);
    });
    if (orphanCodes.length) {
      html += renderRegionBlock('asia', orphanCodes, uiLang, activeAnchorCode, 'gt-all-grid');
    }

    html += '</div></div>';
    return html;
  }

  function renderPopularBody() {
    const ui = getModalUi();
    const detected = detectLanguage();
    const recent = getRecent();
    const activeLang = getActiveLangCode();
    const activeCountry = (activeLang && activeLang !== 'ko') ? findAnchorForLang(activeLang) : null;
    let html = '';

    function sameLang(a, b) { return a && b && a[3] === b[3]; }

    if (detected && !sameLang(detected, activeCountry)) {
      html += renderSuggested(ui.detected, detected);
    }
    if (recent && !sameLang(recent, detected) && !sameLang(recent, activeCountry)) {
      html += renderSuggested(ui.recent, recent);
    }

    html += '<div class="gt-section-label">' + escapeHtml(ui.popular) + '</div>';
    html += renderPopularRegions();

    html += '<button type="button" class="gt-view-all-btn" data-gt-view="all">' +
      escapeHtml(ui.viewAll) + '</button>';

    html += '<div class="gt-section-label">' + escapeHtml(ui.searchLabel) + '</div>' +
      '<div class="gt-search-wrap">' +
      '<svg class="gt-search-icon" viewBox="0 0 24 24" fill="none" stroke="#3d2818" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="search" class="gt-search-input" id="gtSearchInput" placeholder="' +
      escapeHtml(ui.searchPlaceholder) + '" autocomplete="off">' +
      '</div>' +
      '<div class="gt-results" id="gtResults"></div>';

    return html;
  }

  function renderBody() {
    if (_gtModalView === 'all') return renderAllCountriesView('');
    return renderPopularBody();
  }

  function renderResults(query) {
    const ui = getModalUi();
    if (_gtModalView === 'all') {
      const body = document.querySelector('#gtModal .gt-body');
      if (!body) return;
      body.innerHTML = renderAllCountriesView(query);
      const input = document.getElementById('gtSearchInput');
      if (input) {
        input.focus();
        try {
          var len = input.value.length;
          input.setSelectionRange(len, len);
        } catch (e) { /* ignore */ }
      }
      return;
    }
    const list = searchCountries(query);
    const el = document.getElementById('gtResults');
    if (!el) return;
    if (!query.trim()) { el.innerHTML = ''; return; }
    if (list.length === 0) {
      el.innerHTML = '<div class="gt-no-results">' + escapeHtml(ui.noResults) + '</div>';
      return;
    }
    const uiLang = _gtModalUiLang;
    el.innerHTML = list.map(function (c) {
      var name = getLocalizedCountryName(c[0], uiLang, c);
      return '<button type="button" class="gt-result" data-code="' + c[0] + '">' +
        '<div class="gt-result-flag">' + flag(c[0]) + '</div>' +
        '<div class="gt-result-info">' +
        '<div class="gt-result-country">' + escapeHtml(name) + '</div>' +
        '<div class="gt-result-lang">' + escapeHtml(c[4]) + ' / ' + escapeHtml(c[5]) + '</div>' +
        '</div>' +
        '</button>';
    }).join('');
  }

  function applyModalChrome() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    const ui = getModalUi();
    modal.setAttribute('aria-label', ui.title);
    modal.setAttribute('translate', 'no');
    modal.classList.add('notranslate');
    const title = modal.querySelector('.gt-head-title');
    if (title) title.textContent = '🌐 ' + ui.title;
    const closeBtn = modal.querySelector('.gt-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', ui.close);
    const foot = modal.querySelector('.gt-foot');
    if (foot) foot.textContent = ui.footer;
    const sheet = modal.querySelector('.gt-sheet');
    if (sheet) {
      sheet.setAttribute('translate', 'no');
      sheet.classList.add('notranslate');
    }
  }

  function refreshModalBody() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    const body = modal.querySelector('.gt-body');
    if (!body) return;
    body.innerHTML = renderBody();
    applyModalChrome();
  }

  var _gtModalDelegatesBound = false;
  var _gtModalEscapeBound = false;
  var _gtModalOpener = null;

  function injectModal() {
    if (document.getElementById('gtModal')) return;
    const modal = document.createElement('div');
    modal.id = 'gtModal';
    modal.className = 'gt-modal notranslate';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-label', 'Select Language');
    modal.setAttribute('translate', 'no');
    modal.innerHTML =
      '<div class="gt-sheet notranslate" translate="no">' +
      '<div class="gt-head">' +
      '<div class="gt-head-title">🌐 Select Language</div>' +
      '<button type="button" class="gt-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="gt-body"></div>' +
      '<div class="gt-foot">© Gomna Studio, Inc.</div>' +
      '</div>';
    document.body.appendChild(modal);

    if (!_gtModalDelegatesBound) {
      _gtModalDelegatesBound = true;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          closeModal();
          return;
        }
        const closeBtn = e.target.closest && e.target.closest('.gt-close');
        if (closeBtn && modal.contains(closeBtn)) {
          closeModal();
          return;
        }
        const viewBtn = e.target.closest && e.target.closest('[data-gt-view]');
        if (viewBtn && modal.contains(viewBtn)) {
          const next = viewBtn.getAttribute('data-gt-view');
          _gtModalView = (next === 'all') ? 'all' : 'popular';
          refreshModalBody();
          return;
        }
        const item = e.target.closest && e.target.closest('[data-code]');
        if (!item || !modal.contains(item)) return;
        const c = findByCode(item.getAttribute('data-code'));
        if (c) applyLanguage(c);
      });
    }

    if (!_gtModalEscapeBound) {
      _gtModalEscapeBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
      });
    }
  }

  function isCommentaryPopupOpen() {
    try {
      var pop = document.getElementById('commentaryPopup');
      return !!(pop && pop.classList.contains('show'));
    } catch (e) {
      return false;
    }
  }

  function openModal() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    _gtModalUiLang = resolveModalUiLang();
    _gtModalView = 'popular';
    const body = modal.querySelector('.gt-body');
    body.innerHTML = renderBody();
    applyModalChrome();

    if (body.getAttribute('data-gt-search-delegate') !== '1') {
      body.setAttribute('data-gt-search-delegate', '1');
      body.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'gtSearchInput') renderResults(e.target.value);
      });
    }

    const input = document.getElementById('gtSearchInput');
    _gtModalOpener = document.activeElement;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    /* Keep commentary open under the language modal; restore overflow on close. */
    _gtPrevBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    setTimeout(function () { if (input && window.matchMedia('(min-width:481px)').matches) input.focus(); }, 250);
  }

  function closeModal() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    // Pure dismiss: never clear language storage, googtrans, Google state, or reload.
    _gtModalView = 'popular';
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (isCommentaryPopupOpen()) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = _gtPrevBodyOverflow || '';
    }
    _gtPrevBodyOverflow = null;
    var opener = _gtModalOpener;
    _gtModalOpener = null;
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      try { opener.focus(); } catch (e) { /* ignore */ }
    } else {
      var gtBtn = document.querySelector('.gt-btn');
      if (gtBtn && typeof gtBtn.focus === 'function') {
        try { gtBtn.focus(); } catch (e2) { /* ignore */ }
      }
    }
    if (isHomePage()) {
      restoreHomeLanguageState('language-modal-close');
    }
  }

  // ------------------------------------------------------------------
  // Globe button injection
  // ------------------------------------------------------------------
  function isLightOnDark(btn) {
    try {
      const c = getComputedStyle(btn).color;
      const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return false;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      return lum > 0.6;
    } catch (e) { return false; }
  }

  function injectButtons() {
    const settingsBtns = document.querySelectorAll('.settings-btn');
    if (!settingsBtns.length) return false;
    let injected = false;
    settingsBtns.forEach(function (btn) {
      if (btn.previousElementSibling && btn.previousElementSibling.classList.contains('gt-btn')) return;
      const onDark = isLightOnDark(btn);
      const globe = document.createElement('button');
      globe.type = 'button';
      globe.className = 'gt-btn' + (onDark ? ' gt-on-dark' : '');
      globe.title = '언어 / Language';
      globe.setAttribute('aria-label', '언어 선택');
      globe.innerHTML =
        '<img class="gt-globe-img" src="assets/globe_3d_256.webp" ' +
        'alt="" aria-hidden="true" decoding="async" loading="eager" ' +
        'onerror="this.onerror=null;this.src=\'assets/globe_3d_128.png\';">';
      globe.addEventListener('click', openModal);
      btn.parentNode.insertBefore(globe, btn);
      injected = true;
    });
    return injected;
  }

  function init() {
    injectStyles();
    injectModal();
    bindHomeLanguageRestoreEvents();
    if (!injectButtons()) {
      // Header may render later — retry briefly.
      let tries = 0;
      const t = setInterval(function () {
        tries += 1;
        if (injectButtons() || tries > 20) clearInterval(t);
      }, 150);
    }

    // Home native ko/en/ja: apply local bundle only — no Google widget / pending.
    if (isHomePage()) {
      var homeResolved = resolveHomeDisplayLanguage();
      ensureDefaultQuickForeignLanguage();
      if (homeResolved.mode === 'native' && isNativeHomeLanguage(homeResolved.lang)) {
        restoreHomeLanguageState('init');
        return;
      }
      // Google home languages: re-normalize quick foreign after widget boot can briefly
      // disrupt storage during first paint. Quick pair stays KO·EN.
      setTimeout(function () {
        try { ensureDefaultQuickForeignLanguage(); } catch (eSeed) { /* ignore */ }
      }, 1200);
    }

    // Apply curated UI text (categories, welcome message) for the current
    // language — runs both for Korean (default) and translated pages.
    const tl = hasGoogTransCookie() ? getCurrentTargetLang() : null;
    applyUiTextI18n(tl);

    // If user previously chose a non-Korean language, the googtrans cookie
    // is still set — load the widget so the page is auto-translated.
    if (hasGoogTransCookie()) {
      ensureTranslateWidget();
      var needsPending = document.documentElement.classList.contains('gt-translation-pending') ||
        (isReaderPage() && tl && tl !== 'ko') ||
        (isReaderPage() && (
          document.documentElement.classList.contains('gomna-reader-boot-pending') ||
          document.documentElement.classList.contains('gt-reader-prepaint-pending')
        ));
      if (needsPending) {
        if (!document.documentElement.classList.contains('gt-translation-pending')) {
          startTranslationPending();
        } else {
          // Re-arm failsafe so observer/timers are cleaned on timeout (not only class remove).
          if (window.__gomnaTranslationPendingFailsafe) {
            clearTimeout(window.__gomnaTranslationPendingFailsafe);
            window.__gomnaTranslationPendingFailsafe = null;
          }
          window.__gomnaTranslationPendingFailsafe = setTimeout(function () {
            endTranslationPending();
          }, 6000);
        }
        watchTranslationPendingComplete();
      } else if (isReaderPage()) {
        // ko / no target: never keep reader boot skeleton visible.
        releaseReaderBootOverlay({ immediate: true });
      }
      if (tl && BOOK_LANG_IDX[tl]) {
        // Wait briefly for the widget to perform its initial pass so our
        // book-name replacements aren't immediately overwritten.
        setTimeout(function () { applyBookNameI18n(tl); }, 1200);
        // Also re-apply UI text after the widget pass, in case Google rewrote
        // any of our managed elements that were not protected by translate="no".
        setTimeout(function () { applyUiTextI18n(tl); }, 1400);
      }
    } else {
      endTranslationPending({ immediate: true });
    }

    // bfcache / back-forward: only force-reveal for Korean / no googtrans.
    // Do NOT release on translated-* alone — GT may still be mid-pass.
    if (isReaderPage()) {
      window.addEventListener('pageshow', function () {
        try {
          var tlPs = getCurrentTargetLang();
          if (!hasGoogTransCookie() || !tlPs || tlPs === 'ko') {
            releaseReaderBootOverlay({ immediate: true });
          }
        } catch (e) { /* ignore */ }
      });
    }
  }

  window.GomnaOpenLanguageModal = openModal;
  window.GomnaCloseLanguageModal = closeModal;
  window.GomnaApplyLanguageByCode = applyLanguageByCode;
  window.GomnaGetActiveLangCode = getActiveLangCode;
  window.GomnaFindAnchorForLang = findAnchorForLang;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
