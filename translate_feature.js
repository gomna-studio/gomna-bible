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

  // 8 popular flags, in the exact order the user requested.
  const POPULAR_CODES = ['US', 'ES', 'BR', 'CN', 'FR', 'DE', 'JP', 'VN'];

  const STORAGE_KEY = 'gomna_translate_recent';

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
    ['창세기', 'Genesis', 'Génesis', 'Gênesis', '创世记', 'Genèse', '1. Mose', '創世記', 'Sáng Thế Ký'],
    ['출애굽기', 'Exodus', 'Éxodo', 'Êxodo', '出埃及记', 'Exode', '2. Mose', '出エジプト記', 'Xuất Ê-díp-tô Ký'],
    ['레위기', 'Leviticus', 'Levítico', 'Levítico', '利未记', 'Lévitique', '3. Mose', 'レビ記', 'Lê-vi Ký'],
    ['민수기', 'Numbers', 'Números', 'Números', '民数记', 'Nombres', '4. Mose', '民数記', 'Dân Số Ký'],
    ['신명기', 'Deuteronomy', 'Deuteronomio', 'Deuteronômio', '申命记', 'Deutéronome', '5. Mose', '申命記', 'Phục Truyền Luật Lệ Ký'],
    ['여호수아', 'Joshua', 'Josué', 'Josué', '约书亚记', 'Josué', 'Josua', 'ヨシュア記', 'Giô-suê'],
    ['사사기', 'Judges', 'Jueces', 'Juízes', '士师记', 'Juges', 'Richter', '士師記', 'Các Quan Xét'],
    ['룻기', 'Ruth', 'Rut', 'Rute', '路得记', 'Ruth', 'Rut', 'ルツ記', 'Ru-tơ'],
    ['사무엘상', '1 Samuel', '1 Samuel', '1 Samuel', '撒母耳记上', '1 Samuel', '1. Samuel', 'サムエル記第一', '1 Sa-mu-ên'],
    ['사무엘하', '2 Samuel', '2 Samuel', '2 Samuel', '撒母耳记下', '2 Samuel', '2. Samuel', 'サムエル記第二', '2 Sa-mu-ên'],
    ['열왕기상', '1 Kings', '1 Reyes', '1 Reis', '列王纪上', '1 Rois', '1. Könige', '列王記第一', '1 Các Vua'],
    ['열왕기하', '2 Kings', '2 Reyes', '2 Reis', '列王纪下', '2 Rois', '2. Könige', '列王記第二', '2 Các Vua'],
    ['역대상', '1 Chronicles', '1 Crónicas', '1 Crônicas', '历代志上', '1 Chroniques', '1. Chronik', '歴代誌第一', '1 Sử Ký'],
    ['역대하', '2 Chronicles', '2 Crónicas', '2 Crônicas', '历代志下', '2 Chroniques', '2. Chronik', '歴代誌第二', '2 Sử Ký'],
    ['에스라', 'Ezra', 'Esdras', 'Esdras', '以斯拉记', 'Esdras', 'Esra', 'エズラ記', 'E-xơ-ra'],
    ['느헤미야', 'Nehemiah', 'Nehemías', 'Neemias', '尼希米记', 'Néhémie', 'Nehemia', 'ネヘミヤ記', 'Nê-hê-mi'],
    ['에스더', 'Esther', 'Ester', 'Ester', '以斯帖记', 'Esther', 'Ester', 'エステル記', 'Ê-xơ-tê'],
    ['욥기', 'Job', 'Job', 'Jó', '约伯记', 'Job', 'Hiob', 'ヨブ記', 'Gióp'],
    ['시편', 'Psalms', 'Salmos', 'Salmos', '诗篇', 'Psaumes', 'Psalmen', '詩篇', 'Thi Thiên'],
    ['잠언', 'Proverbs', 'Proverbios', 'Provérbios', '箴言', 'Proverbes', 'Sprüche', '箴言', 'Châm Ngôn'],
    ['전도서', 'Ecclesiastes', 'Eclesiastés', 'Eclesiastes', '传道书', 'Ecclésiaste', 'Prediger', '伝道者の書', 'Truyền Đạo'],
    ['아가', 'Song of Songs', 'Cantares', 'Cânticos', '雅歌', 'Cantique des Cantiques', 'Hohelied', '雅歌', 'Nhã Ca'],
    ['이사야', 'Isaiah', 'Isaías', 'Isaías', '以赛亚书', 'Ésaïe', 'Jesaja', 'イザヤ書', 'Ê-sai'],
    ['예레미야애가', 'Lamentations', 'Lamentaciones', 'Lamentações', '耶利米哀歌', 'Lamentations', 'Klagelieder', '哀歌', 'Ca Thương'],
    ['예레미야', 'Jeremiah', 'Jeremías', 'Jeremias', '耶利米书', 'Jérémie', 'Jeremia', 'エレミヤ書', 'Giê-rê-mi'],
    ['에스겔', 'Ezekiel', 'Ezequiel', 'Ezequiel', '以西结书', 'Ézéchiel', 'Hesekiel', 'エゼキエル書', 'Ê-xê-chi-ên'],
    ['다니엘', 'Daniel', 'Daniel', 'Daniel', '但以理书', 'Daniel', 'Daniel', 'ダニエル書', 'Đa-ni-ên'],
    ['호세아', 'Hosea', 'Oseas', 'Oséias', '何西阿书', 'Osée', 'Hosea', 'ホセア書', 'Ô-sê'],
    ['요엘', 'Joel', 'Joel', 'Joel', '约珥书', 'Joël', 'Joel', 'ヨエル書', 'Giô-ên'],
    ['아모스', 'Amos', 'Amós', 'Amós', '阿摩司书', 'Amos', 'Amos', 'アモス書', 'A-mốt'],
    ['오바댜', 'Obadiah', 'Abdías', 'Obadias', '俄巴底亚书', 'Abdias', 'Obadja', 'オバデヤ書', 'Áp-đia'],
    ['요나', 'Jonah', 'Jonás', 'Jonas', '约拿书', 'Jonas', 'Jona', 'ヨナ書', 'Giô-na'],
    ['미가', 'Micah', 'Miqueas', 'Miquéias', '弥迦书', 'Michée', 'Micha', 'ミカ書', 'Mi-chê'],
    ['나훔', 'Nahum', 'Nahúm', 'Naum', '那鸿书', 'Nahum', 'Nahum', 'ナホム書', 'Na-hum'],
    ['하박국', 'Habakkuk', 'Habacuc', 'Habacuque', '哈巴谷书', 'Habacuc', 'Habakuk', 'ハバクク書', 'Ha-ba-cúc'],
    ['스바냐', 'Zephaniah', 'Sofonías', 'Sofonias', '西番雅书', 'Sophonie', 'Zephanja', 'ゼパニヤ書', 'Sô-phô-ni'],
    ['학개', 'Haggai', 'Hageo', 'Ageu', '哈该书', 'Aggée', 'Haggai', 'ハガイ書', 'A-ghê'],
    ['스가랴', 'Zechariah', 'Zacarías', 'Zacarias', '撒迦利亚书', 'Zacharie', 'Sacharja', 'ゼカリヤ書', 'Xa-cha-ri'],
    ['말라기', 'Malachi', 'Malaquías', 'Malaquias', '玛拉基书', 'Malachie', 'Maleachi', 'マラキ書', 'Ma-la-chi'],
    ['마태복음', 'Matthew', 'Mateo', 'Mateus', '马太福音', 'Matthieu', 'Matthäus', 'マタイの福音書', 'Ma-thi-ơ'],
    ['마가복음', 'Mark', 'Marcos', 'Marcos', '马可福音', 'Marc', 'Markus', 'マルコの福音書', 'Mác'],
    ['누가복음', 'Luke', 'Lucas', 'Lucas', '路加福音', 'Luc', 'Lukas', 'ルカの福音書', 'Lu-ca'],
    ['요한복음', 'John', 'Juan', 'João', '约翰福音', 'Jean', 'Johannes', 'ヨハネの福音書', 'Giăng'],
    ['사도행전', 'Acts', 'Hechos', 'Atos', '使徒行传', 'Actes', 'Apostelgeschichte', '使徒の働き', 'Công Vụ Các Sứ Đồ'],
    ['로마서', 'Romans', 'Romanos', 'Romanos', '罗马书', 'Romains', 'Römer', 'ローマ人への手紙', 'Rô-ma'],
    ['고린도전서', '1 Corinthians', '1 Corintios', '1 Coríntios', '哥林多前书', '1 Corinthiens', '1. Korinther', 'コリント人への第一の手紙', '1 Cô-rinh-tô'],
    ['고린도후서', '2 Corinthians', '2 Corintios', '2 Coríntios', '哥林多后书', '2 Corinthiens', '2. Korinther', 'コリント人への第二の手紙', '2 Cô-rinh-tô'],
    ['갈라디아서', 'Galatians', 'Gálatas', 'Gálatas', '加拉太书', 'Galates', 'Galater', 'ガラテヤ人への手紙', 'Ga-la-ti'],
    ['에베소서', 'Ephesians', 'Efesios', 'Efésios', '以弗所书', 'Éphésiens', 'Epheser', 'エペソ人への手紙', 'Ê-phê-sô'],
    ['빌립보서', 'Philippians', 'Filipenses', 'Filipenses', '腓立比书', 'Philippiens', 'Philipper', 'ピリピ人への手紙', 'Phi-líp'],
    ['골로새서', 'Colossians', 'Colosenses', 'Colossenses', '歌罗西书', 'Colossiens', 'Kolosser', 'コロサイ人への手紙', 'Cô-lô-se'],
    ['데살로니가전서', '1 Thessalonians', '1 Tesalonicenses', '1 Tessalonicenses', '帖撒罗尼迦前书', '1 Thessaloniciens', '1. Thessalonicher', 'テサロニケ人への第一の手紙', '1 Tê-sa-lô-ni-ca'],
    ['데살로니가후서', '2 Thessalonians', '2 Tesalonicenses', '2 Tessalonicenses', '帖撒罗尼迦后书', '2 Thessaloniciens', '2. Thessalonicher', 'テサロニケ人への第二の手紙', '2 Tê-sa-lô-ni-ca'],
    ['디모데전서', '1 Timothy', '1 Timoteo', '1 Timóteo', '提摩太前书', '1 Timothée', '1. Timotheus', 'テモテへの第一の手紙', '1 Ti-mô-thê'],
    ['디모데후서', '2 Timothy', '2 Timoteo', '2 Timóteo', '提摩太后书', '2 Timothée', '2. Timotheus', 'テモテへの第二の手紙', '2 Ti-mô-thê'],
    ['디도서', 'Titus', 'Tito', 'Tito', '提多书', 'Tite', 'Titus', 'テトスへの手紙', 'Tít'],
    ['빌레몬서', 'Philemon', 'Filemón', 'Filemom', '腓利门书', 'Philémon', 'Philemon', 'ピレモンへの手紙', 'Phi-lê-môn'],
    ['히브리서', 'Hebrews', 'Hebreos', 'Hebreus', '希伯来书', 'Hébreux', 'Hebräer', 'ヘブル人への手紙', 'Hê-bơ-rơ'],
    ['야고보서', 'James', 'Santiago', 'Tiago', '雅各书', 'Jacques', 'Jakobus', 'ヤコブの手紙', 'Gia-cơ'],
    ['베드로전서', '1 Peter', '1 Pedro', '1 Pedro', '彼得前书', '1 Pierre', '1. Petrus', 'ペテロの第一の手紙', '1 Phi-e-rơ'],
    ['베드로후서', '2 Peter', '2 Pedro', '2 Pedro', '彼得后书', '2 Pierre', '2. Petrus', 'ペテロの第二の手紙', '2 Phi-e-rơ'],
    ['요한일서', '1 John', '1 Juan', '1 João', '约翰一书', '1 Jean', '1. Johannes', 'ヨハネの第一の手紙', '1 Giăng'],
    ['요한이서', '2 John', '2 Juan', '2 João', '约翰二书', '2 Jean', '2. Johannes', 'ヨハネの第二の手紙', '2 Giăng'],
    ['요한삼서', '3 John', '3 Juan', '3 João', '约翰三书', '3 Jean', '3. Johannes', 'ヨハネの第三の手紙', '3 Giăng'],
    ['유다서', 'Jude', 'Judas', 'Judas', '犹大书', 'Jude', 'Judas', 'ユダの手紙', 'Giu-đe'],
    ['요한계시록', 'Revelation', 'Apocalipsis', 'Apocalipse', '启示录', 'Apocalypse', 'Offenbarung', 'ヨハネの黙示録', 'Khải Huyền']
  ];

  // Map a Google Translate language code → column index in the row above.
  const BOOK_LANG_IDX = {
    'en': 1, 'es': 2, 'pt': 3,
    'zh-CN': 4, 'zh': 4, 'zh-TW': 4,
    'fr': 5, 'de': 6, 'ja': 7, 'vi': 8
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
    'pentateuch':       ['모세오경',   'Pentateuch',         'Pentateuco',           'Pentateuco',           '摩西五经',  'Pentateuque',           'Pentateuch',          'モーセ五書', 'Ngũ Kinh Môi-se'],
    'history_ot':       ['역사서',     'History',            'Históricos',           'Históricos',           '历史书',    'Livres historiques',    'Geschichtsbücher',    '歴史書',     'Sách Lịch Sử'],
    'wisdom':           ['시가서',     'Wisdom',             'Sapienciales',         'Sapienciais',          '诗歌智慧书', 'Livres de sagesse',     'Weisheitsliteratur',  '詩歌・知恵',  'Sách Văn Thơ'],
    'major_prophets':   ['대선지서',   'Major Prophets',     'Profetas Mayores',     'Profetas Maiores',     '大先知书',  'Grands Prophètes',      'Große Propheten',     '大預言書',   'Đại Tiên Tri'],
    'minor_prophets':   ['소선지서',   'Minor Prophets',     'Profetas Menores',     'Profetas Menores',     '小先知书',  'Petits Prophètes',      'Kleine Propheten',    '小預言書',   'Tiểu Tiên Tri'],
    'gospels':          ['복음서',     'Gospels',            'Evangelios',           'Evangelhos',           '福音书',    'Évangiles',             'Evangelien',          '福音書',     'Sách Phúc Âm'],
    'acts':             ['사도행전',   'Acts',               'Hechos',               'Atos',                 '使徒行传',  'Actes',                 'Apostelgeschichte',   '使徒の働き', 'Công Vụ Sứ Đồ'],
    'pauline':          ['바울서신',   'Pauline Epistles',   'Cartas Paulinas',      'Cartas Paulinas',      '保罗书信',  'Épîtres pauliniennes',  'Paulusbriefe',        'パウロ書簡', 'Thư Phao-lô'],
    'general_epistles': ['공동서신',   'General Epistles',   'Cartas Generales',     'Cartas Gerais',        '普通书信',  'Épîtres générales',     'Katholische Briefe',  '公同書簡',   'Thư Tổng Quát'],
    'revelation':       ['계시록',     'Revelation',         'Apocalipsis',          'Apocalipse',           '启示录',    'Apocalypse',            'Offenbarung',         '黙示録',     'Sách Khải Huyền']
  };

  // Short category labels (for tight keypad buttons). Same column order.
  const CATEGORY_SHORT = {
    'pentateuch':       ['모세오경',   'Pentateuch',  'Pentat.',     'Pentat.',     '五经',     'Pentat.',       'Pentat.',     'モーセ五書', 'Ngũ Kinh'],
    'history_ot':       ['역사서',     'History',     'Histórico',   'Histórico',   '历史',     'Histor.',       'Hist.',       '歴史書',     'Sử Ký'],
    'wisdom':           ['시가서',     'Wisdom',      'Sapienc.',    'Sapienc.',    '诗歌',     'Sagesse',       'Weisheit',    '詩歌書',     'Văn Thơ'],
    'major_prophets':   ['대선지서',   'Maj. Proph.', 'Prof. May.',  'Prof. Mai.',  '大先知',   'Gd. Proph.',    'Gr. Proph.',  '大預言',     'Đại Tiên Tri'],
    'minor_prophets':   ['소선지서',   'Min. Proph.', 'Prof. Men.',  'Prof. Men.',  '小先知',   'Pt. Proph.',    'Kl. Proph.',  '小預言',     'Tiểu Tiên Tri'],
    'gospels':          ['복음서',     'Gospels',     'Evangelios',  'Evangelhos',  '福音',     'Évangiles',     'Evangelien',  '福音書',     'Phúc Âm'],
    'acts':             ['사도행전',   'Acts',        'Hechos',      'Atos',        '使徒',     'Actes',         'Apostelg.',   '使徒',       'Công Vụ'],
    'pauline':          ['바울서신',   'Pauline',     'Paulinas',    'Paulinas',    '保罗书信', 'Pauliniennes',  'Paulus.',     'パウロ書簡', 'Thư Phao-lô'],
    'general_epistles': ['공동서신',   'General',     'Generales',   'Gerais',      '普通书信', 'Générales',     'Kathol.',     '公同書簡',   'Thư Chung'],
    'revelation':       ['계시록',     'Revelation',  'Apocalipsis', 'Apocalipse',  '启示录',   'Apocalypse',    'Offenbarung', '黙示録',     'Khải Huyền']
  };

  // UI label translations. Same column order: ko, en, es, pt, zh, fr, de, ja, vi
  const UI_LABELS = {
    'find_word':    ['말씀 바로찾기',  'Find the Word',     'Buscar Palabra',      'Encontre a Palavra', '寻找经文',     'Trouver la Parole',  'Wort finden',       'み言葉を探す',     'Tìm Lời'],
    'by_category':  ['분류별로 ›',     'By category ›',     'Por categoría ›',     'Por categoria ›',    '按分类 ›',     'Par catégorie ›',    'Nach Kategorie ›',  'カテゴリ別 ›',     'Theo phân loại ›'],
    'choose_category': ['분류 선택',     'Choose category',   'Elige categoría',     'Escolha categoria',  '选择分类',     'Choisir catégorie',  'Kategorie wählen',  'カテゴリを選択',   'Chọn phân loại'],
    'verse_view_other':['다른 날짜 보기','View other dates',  'Ver otras fechas',    'Ver outras datas',   '查看其他日期',  'Voir d\'autres dates','Andere Daten ansehen','他の日付を見る',  'Xem ngày khác'],
    'verse_back_today':['오늘로 돌아가기','Back to today',     'Volver a hoy',        'Voltar para hoje',   '回到今天',     'Retour à aujourd\'hui','Zurück zu heute',  '今日に戻る',       'Quay lại hôm nay']
  };

  // Welcome message translations. Index 0 = ko, 1 = en, etc.
  const WELCOME_I18N = {
    line1: [
      '은혜의말씀 안에서',
      'In the Words of Grace,',
      'En las Palabras de Gracia,',
      'Nas Palavras da Graça,',
      '在恩典之言中，',
      'Dans les Paroles de Grâce,',
      'In den Worten der Gnade,',
      '恵みの言葉の中で、',
      'Trong Lời Ân Điển,'
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
      'thế giới kỳ diệu của Đức Chúa Trời mở ra.'
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
           '旧约', 'Ancien Testament', 'Altes Testament', '旧約', 'Cựu Ước'],
      nt: ['신약', 'New Testament', 'Nuevo Testamento', 'Novo Testamento',
           '新约', 'Nouveau Testament', 'Neues Testament', '新約', 'Tân Ước']
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
        case 'en':    return num + (one ? ' book'  : ' books');
        case 'es':    return num + (one ? ' libro' : ' libros');
        case 'pt':    return num + (one ? ' livro' : ' livros');
        case 'fr':    return num + (one ? ' livre' : ' livres');
        case 'de':    return num + (one ? ' Buch'  : ' Bücher');
        case 'vi':    return num + (one ? ' sách'  : ' sách');
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
      const k = el.getAttribute('data-i18n-ui');
      const e = UI_LABELS[k];
      if (e && e[idx]) el.textContent = e[idx];
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
    'en': "Today's Word",
    'es': 'Palabra de Hoy',
    'pt': 'Palavra de Hoje',
    'zh': '今日金句', 'zh-CN': '今日金句', 'zh-TW': '今日金句',
    'fr': 'Parole du Jour',
    'de': 'Wort des Tages',
    'ja': '今日のみことば',
    'vi': 'Lời Hôm Nay'
  };

  function _localeFor(lang) {
    const m = {
      'ko':'ko-KR','en':'en-US','es':'es-ES','pt':'pt-BR',
      'zh':'zh-CN','zh-CN':'zh-CN','zh-TW':'zh-TW',
      'fr':'fr-FR','de':'de-DE','ja':'ja-JP','vi':'vi-VN'
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
      case 'en':                              return 'Word for ' + fmt;
      case 'es':                              return 'Palabra para el ' + fmt;
      case 'pt':                              return 'Palavra para ' + fmt;
      case 'zh': case 'zh-CN': case 'zh-TW':  return m + '月' + day + '日的金句';
      case 'fr':                              return 'Parole pour le ' + fmt;
      case 'de':                              return 'Wort für den ' + fmt;
      case 'ja':                              return m + '月' + day + '日のみことば';
      case 'vi':                              return 'Lời cho ngày ' + day + ' tháng ' + m;
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

  let _bookObserver = null;
  let _bookLangActive = null;

  function applyBookNameI18n(lang) {
    if (!BOOK_LANG_IDX[lang]) return;
    if (_bookLangActive === lang && _bookObserver) return; // already running
    _bookLangActive = lang;

    function visit(node) {
      if (!node) return;
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
          const p = m.target.parentNode;
          if (!p) continue;
          const tag = p.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
          const t = translateBookText(m.target.nodeValue, lang);
          if (t !== m.target.nodeValue) m.target.nodeValue = t;
        } else if (m.type === 'childList') {
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

  function injectWidgetHideStyles() {
    if (document.getElementById('gt-widget-hide')) return;
    const s = document.createElement('style');
    s.id = 'gt-widget-hide';
    s.textContent =
      'body{top:0!important;position:static!important}' +
      '.goog-te-banner-frame,.goog-te-banner-frame.skiptranslate,iframe.goog-te-banner-frame,#goog-gt-tt,.goog-te-balloon-frame,.skiptranslate>iframe{display:none!important;visibility:hidden!important}' +
      '.goog-text-highlighted{background:transparent!important;box-shadow:none!important;border:0!important}' +
      'font[style*="vertical-align"]{vertical-align:baseline!important}' +
      '#google_translate_element{position:fixed!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}';
    document.head.appendChild(s);
  }

  function ensureTranslateWidget() {
    if (window.__gtWidgetLoaded || window.__gtWidgetLoading) return;
    window.__gtWidgetLoading = true;
    injectWidgetHideStyles();

    if (!document.getElementById('google_translate_element')) {
      const wrapper = document.createElement('div');
      wrapper.id = 'google_translate_element';
      document.body.appendChild(wrapper);
    }

    window.googleTranslateElementInit = function () {
      try {
        new google.translate.TranslateElement({
          pageLanguage: 'ko',
          autoDisplay: false,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        }, 'google_translate_element');
        window.__gtWidgetLoaded = true;
      } catch (e) { /* swallow — retry logic below will keep polling */ }
    };

    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.onerror = function () { showToast('번역 서비스 로드 실패 · Translation service failed to load'); };
    document.head.appendChild(script);
  }

  function triggerWidgetLanguage(targetLang, attempts) {
    attempts = attempts || 0;
    const select = document.querySelector('select.goog-te-combo');
    if (select) {
      select.value = targetLang;
      // Native event so Google's listener picks it up.
      const evt = (typeof Event === 'function') ? new Event('change', { bubbles: true }) : (function () {
        const e = document.createEvent('HTMLEvents'); e.initEvent('change', true, true); return e;
      })();
      select.dispatchEvent(evt);
      return true;
    }
    if (attempts < 50) { // up to ~7.5s
      setTimeout(function () { triggerWidgetLanguage(targetLang, attempts + 1); }, 150);
      return false;
    }
    showToast('번역 적용 실패 · Could not apply translation');
    return false;
  }

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

  function applyLanguage(country) {
    if (!country) return;
    saveRecent(country[0]);

    const currentLang = getCurrentTargetLang();

    // No-op: same language already active.
    if (currentLang === country[3]) {
      closeModal();
      return;
    }

    // Korean = source language → undo translation.
    if (country[3] === 'ko') {
      clearGoogTransCookie();
      closeModal();
      showToast('🌐 한국어로 복원 중... · Restoring Korean...');
      setTimeout(function () { location.reload(); }, 250);
      return;
    }

    // Set the cookie + reload. This is the most reliable way to switch
    // between any two languages — the Google Translate widget reads the
    // `googtrans` cookie during init() on the next page load and applies
    // the saved language automatically. The widget cannot reliably
    // retranslate an already-translated DOM (e.g. ENG → ESP), so reload
    // is required to go from any source → any target.
    setGoogTransCookie(country[3]);
    closeModal();
    showToast('🌐 ' + country[1] + ' · ' + country[4] + ' 적용 중...');
    setTimeout(function () { location.reload(); }, 250);
  }

  function searchCountries(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (let i = 0; i < COUNTRIES.length; i++) {
      const c = COUNTRIES[i];
      const ko = c[1].toLowerCase();
      const en = c[2].toLowerCase();
      const langKo = c[4].toLowerCase();
      const langNative = c[5].toLowerCase();
      let score = 0;
      if (ko === q || en === q) score = 100;
      else if (ko.startsWith(q) || en.startsWith(q)) score = 80;
      else if (langKo === q || langNative === q) score = 75;
      else if (ko.indexOf(q) >= 0 || en.indexOf(q) >= 0) score = 60;
      else if (langKo.indexOf(q) >= 0 || langNative.indexOf(q) >= 0) score = 40;
      if (score > 0) out.push([score, c]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, 30).map(function (x) { return x[1]; });
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
.gt-popular-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}\
.gt-pop-btn{background:#fff;border:.5px solid rgba(180,140,90,.3);border-radius:12px;padding:10px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .2s;font-family:inherit}\
.gt-pop-btn:hover{background:#fff5e0;border-color:#c89849}\
.gt-pop-btn:active{transform:scale(.95);opacity:.7}\
.gt-pop-flag{font-size:24px;line-height:1}\
.gt-pop-label{font-size:11px;color:#5a3818;font-weight:500;line-height:1.2;text-align:center}\
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
@media (max-width:480px){\
.gt-modal{padding:0;align-items:flex-end}\
.gt-sheet{max-width:100%;max-height:90vh;border-radius:24px 24px 0 0}\
.gt-popular-grid{grid-template-columns:repeat(4,1fr)}\
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
    return '<div class="gt-section-label">' + label + '</div>' +
      '<button type="button" class="gt-suggested" data-code="' + country[0] + '">' +
      '<div class="gt-suggested-flag">' + flag(country[0]) + '</div>' +
      '<div class="gt-suggested-info">' +
      '<div class="gt-suggested-tag">' + escapeHtml(country[5]) + '</div>' +
      '<div class="gt-suggested-name">' + escapeHtml(country[1]) + ' · ' + escapeHtml(country[4]) + '</div>' +
      '</div>' +
      '<div class="gt-suggested-arrow">›</div>' +
      '</button>';
  }

  function renderBody() {
    const detected = detectLanguage();
    const recent = getRecent();
    let html = '';

    if (detected) html += renderSuggested('자동 감지됨 · Detected', detected);
    if (recent && (!detected || recent[0] !== detected[0])) html += renderSuggested('최근 사용 · Recent', recent);

    html += '<div class="gt-section-label">인기 언어 · Popular</div><div class="gt-popular-grid">';
    POPULAR_CODES.forEach(function (code) {
      const c = findByCode(code);
      if (!c) return;
      html += '<button type="button" class="gt-pop-btn" data-code="' + c[0] + '">' +
        '<div class="gt-pop-flag">' + flag(c[0]) + '</div>' +
        '<div class="gt-pop-label">' + escapeHtml(c[4]) + '</div>' +
        '</button>';
    });
    html += '</div>';

    html += '<div class="gt-section-label">전체 검색 · Search (' + COUNTRIES.length + '+ 나라)</div>' +
      '<div class="gt-search-wrap">' +
      '<svg class="gt-search-icon" viewBox="0 0 24 24" fill="none" stroke="#3d2818" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="search" class="gt-search-input" id="gtSearchInput" placeholder="나라 입력 (예: Vietnam, 베트남, 영어)" autocomplete="off">' +
      '</div>' +
      '<div class="gt-results" id="gtResults"></div>';

    return html;
  }

  function renderResults(query) {
    const list = searchCountries(query);
    const el = document.getElementById('gtResults');
    if (!el) return;
    if (!query.trim()) { el.innerHTML = ''; return; }
    if (list.length === 0) {
      el.innerHTML = '<div class="gt-no-results">검색 결과가 없습니다 · No results</div>';
      return;
    }
    el.innerHTML = list.map(function (c) {
      return '<button type="button" class="gt-result" data-code="' + c[0] + '">' +
        '<div class="gt-result-flag">' + flag(c[0]) + '</div>' +
        '<div class="gt-result-info">' +
        '<div class="gt-result-country">' + escapeHtml(c[1]) + ' · ' + escapeHtml(c[2]) + '</div>' +
        '<div class="gt-result-lang">' + escapeHtml(c[4]) + ' / ' + escapeHtml(c[5]) + '</div>' +
        '</div>' +
        '</button>';
    }).join('');
  }

  function injectModal() {
    if (document.getElementById('gtModal')) return;
    const modal = document.createElement('div');
    modal.id = 'gtModal';
    modal.className = 'gt-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '언어 선택');
    modal.innerHTML =
      '<div class="gt-sheet">' +
      '<div class="gt-head">' +
      '<div class="gt-head-title">🌐 언어 선택 · Choose your language</div>' +
      '<button type="button" class="gt-close" aria-label="닫기">✕</button>' +
      '</div>' +
      '<div class="gt-body"></div>' +
      '<div class="gt-foot">Powered by Google Translate · ' + COUNTRIES.length + '개국 지원</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector('.gt-close').addEventListener('click', closeModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
    });
  }

  function openModal() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    const body = modal.querySelector('.gt-body');
    body.innerHTML = renderBody();

    body.addEventListener('click', function (e) {
      const item = e.target.closest('[data-code]');
      if (!item) return;
      const c = findByCode(item.getAttribute('data-code'));
      if (c) applyLanguage(c);
    });

    const input = document.getElementById('gtSearchInput');
    if (input) {
      input.addEventListener('input', function (e) { renderResults(e.target.value); });
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { if (input && window.matchMedia('(min-width:481px)').matches) input.focus(); }, 250);
  }

  function closeModal() {
    const modal = document.getElementById('gtModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
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
    if (!injectButtons()) {
      // Header may render later — retry briefly.
      let tries = 0;
      const t = setInterval(function () {
        tries += 1;
        if (injectButtons() || tries > 20) clearInterval(t);
      }, 150);
    }
    // Apply curated UI text (categories, welcome message) for the current
    // language — runs both for Korean (default) and translated pages.
    const tl = hasGoogTransCookie() ? getCurrentTargetLang() : null;
    applyUiTextI18n(tl);

    // If user previously chose a non-Korean language, the googtrans cookie
    // is still set — load the widget so the page is auto-translated.
    if (hasGoogTransCookie()) {
      ensureTranslateWidget();
      if (tl && BOOK_LANG_IDX[tl]) {
        // Wait briefly for the widget to perform its initial pass so our
        // book-name replacements aren't immediately overwritten.
        setTimeout(function () { applyBookNameI18n(tl); }, 1200);
        // Also re-apply UI text after the widget pass, in case Google rewrote
        // any of our managed elements that were not protected by translate="no".
        setTimeout(function () { applyUiTextI18n(tl); }, 1400);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
