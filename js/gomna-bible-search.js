/* gomna-bible-search — 성경 본문 검색 (색인 1회 생성, 재사용) */
(function (global) {
  'use strict';

  var verseIndex = null;
  var bookNamesByLength = null;

  var BOOK_NAMES = [
    '창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기',
    '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야',
    '에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가',
    '에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국',
    '스바냐', '학개', '스가랴', '말라기',
    '마태복음', '마가복음', '누가복음', '요한복음', '사도행전', '로마서', '고린도전서', '고린도후서',
    '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서',
    '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서', '베드로전서',
    '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서', '요한계시록'
  ];

  var SCORE_REF = 1000;
  var SCORE_EXACT = 900;
  var SCORE_PHRASE_START = 850;
  var SCORE_PHRASE = 800;
  var SCORE_COMPACT_PHRASE = 750;
  var SCORE_ALL_WORDS = 600;
  var SCORE_NATURAL_CONCEPT_3 = 560;
  var SCORE_NATURAL_CONCEPT_2 = 520;
  var SCORE_NATURAL_CONCEPT_1 = 440;
  var COMPACT_QUERY_MIN_LEN = 4;

  var NATURAL_FILLER_WORDS = {
    '너무': 1, '정말': 1, '그냥': 1, '말씀': 1, '구절': 1,
    '찾아줘': 1, '알려줘': 1, '보여줘': 1, '말라는': 1, '라는': 1, '좀': 1
  };

  var NATURAL_CONCEPTS = [
    {
      id: 'fear',
      triggers: ['무서워', '무섭다', '무서운', '겁나', '겁나다', '두려워', '두렵다', '두려움'],
      expansions: ['두려워', '두려움', '두려워하지', '무서워', '무서움']
    },
    {
      id: 'worry',
      triggers: ['걱정', '걱정돼', '걱정하다', '불안', '불안해', '염려', '근심'],
      expansions: ['걱정', '염려', '근심', '염려하지', '근심하지']
    },
    {
      id: 'together',
      triggers: ['같이 있어', '나랑 같이', '우리와 같이', '함께 있어', '함께', '같이', '곁에', '옆에'],
      expansions: ['같이', '함께', '함께하', '함께 함', '떠나지', '버리지']
    },
    {
      id: 'god',
      triggers: ['하나님', '하느님', '주님', '주께서', '주가'],
      expansions: ['하나님', '주', '여호와']
    },
    {
      id: 'loneliness',
      triggers: [
        '혼자인것같', '혼자남았', '혼자남겨', '혼자야', '혼자인',
        '외로워', '외롭', '너무외로워',
        '곁에아무도없', '내곁에아무도없', '아무도나를',
        '버림받', '버려진', '버린것같', '나를버린것같'
      ],
      expansions: ['혼자', '외로', '홀로', '외롭']
    }
  ];

  var NATURAL_CONCEPTS_BY_ID = {};
  (function () {
    var i;
    for (i = 0; i < NATURAL_CONCEPTS.length; i++) {
      NATURAL_CONCEPTS_BY_ID[NATURAL_CONCEPTS[i].id] = NATURAL_CONCEPTS[i];
    }
  })();

  var NATURAL_INTENT_PROVISION_TRIGGERS = ['돈', '생활비', '재정', '경제', '먹고살', '필요', '물질'];
  var NATURAL_INTENT_INNER_PEACE_TRIGGERS = ['마음', '불안', '초조', '평안하지', '마음이힘들'];
  var NATURAL_INTENT_COMPANIONSHIP_TRIGGERS = [
    '혼자인것같', '혼자남겨', '혼자남았', '너무외로워', '외로워', '외롭',
    '버림받', '버려진',
    '하나님이나를버린', '하나님이버린', '하나님이떠난', '나를버린것같', '버린것같'
  ];
  var NATURAL_INTENT_ABSENCE_COMPANIONSHIP_TRIGGERS = [
    '내곁에아무도없', '곁에아무도없', '아무도내곁에없',
    '아무도나와함께하지', '도와줄사람이없', '나혼자뿐'
  ];

  var NATURAL_HUMAN_COMPANIONSHIP_NARRATIVE = [
    { pattern: '짐을 담당', penalty: 18 },
    { pattern: '짐을 담당하고', penalty: 18 },
    { pattern: '백성의 짐', penalty: 20 },
    { pattern: '혼자 지지 아니', penalty: 16 },
    { pattern: '함께 짐', penalty: 16 },
    { pattern: '함께 일', penalty: 14 },
    { pattern: '장로', penalty: 12 },
    { pattern: '그들이 너와 함께', penalty: 22 },
    { pattern: '그들과 함께', penalty: 18 },
    { pattern: '무리와 함께', penalty: 14 },
    { pattern: '사람들과 함께', penalty: 14 },
    { pattern: '함께 먹었', penalty: 12 },
    { pattern: '함께 모였', penalty: 12 },
    { pattern: '함께 가다가', penalty: 12 },
    { pattern: '홀로 갔', penalty: 12 },
    { pattern: '홀로 앉', penalty: 12 },
    { pattern: '혼자 남았', penalty: 14 },
    { pattern: '혼자 사는 것', penalty: 14 }
  ];

  var NATURAL_COMPANIONSHIP_PHRASES = [
    { phrase: '너와 함께', bonus: 24 },
    { phrase: '너희와 함께', bonus: 24 },
    { phrase: '너희와 항상', bonus: 18 },
    { phrase: '함께 하리라', bonus: 22 },
    { phrase: '함께하리라', bonus: 22 },
    { phrase: '함께 함이라', bonus: 20 },
    { phrase: '함께하시', bonus: 18 },
    { phrase: '떠나지 아니', bonus: 26 },
    { phrase: '떠나지 않', bonus: 24 },
    { phrase: '버리지 아니', bonus: 26 },
    { phrase: '버리지 않', bonus: 24 },
    { phrase: '고아와 같이 버려두지', bonus: 28 },
    { phrase: '가까이 계시', bonus: 18 },
    { phrase: '곁에 계시', bonus: 18 },
    { phrase: '네 오른손을 붙들', bonus: 16 },
    { phrase: '너를 붙들', bonus: 14 },
    { phrase: '도와주리라', bonus: 16 },
    { phrase: '지키리라', bonus: 14 },
    { phrase: '위로하리라', bonus: 14 },
    { phrase: '영접하리라', bonus: 14 },
    { phrase: '두려워하지', bonus: 12 },
    { phrase: '놀라지 말', bonus: 12 },
    { phrase: '담대하라', bonus: 10 },
    { phrase: '환난 중에', bonus: 10 },
    { phrase: '상한 마음', bonus: 12 }
  ];

  var NATURAL_LONELINESS_NARRATIVE_PATTERNS = [
    { phrase: '혼자 남았', penalty: 14 },
    { phrase: '홀로 갔', penalty: 12 },
    { phrase: '홀로 앉았', penalty: 12 },
    { phrase: '다 떠나갔', penalty: 12 },
    { phrase: '홀로 두었', penalty: 12 },
    { phrase: '함께 가다가', penalty: 10 },
    { phrase: '함께 모였더라', penalty: 12 },
    { phrase: '함께 먹었더라', penalty: 12 }
  ];

  var NATURAL_COMFORT_PHRASES = [
    { phrase: '염려하지', bonus: 22 },
    { phrase: '근심하지', bonus: 22 },
    { phrase: '두려워하지', bonus: 20 },
    { phrase: '마음에 근심하지', bonus: 24 },
    { phrase: '맡기', bonus: 16 },
    { phrase: '평안', bonus: 18 },
    { phrase: '평강', bonus: 18 },
    { phrase: '지키시리라', bonus: 16 },
    { phrase: '지키리라', bonus: 14 },
    { phrase: '함께 함', bonus: 14 },
    { phrase: '떠나지', bonus: 12 },
    { phrase: '버리지', bonus: 12 }
  ];

  var NATURAL_PROVISION_PHRASES = [
    { phrase: '무엇을 먹을까', bonus: 20 },
    { phrase: '무엇을 마실까', bonus: 18 },
    { phrase: '무엇을 입을까', bonus: 20 },
    { phrase: '먼저 그의 나라', bonus: 22 },
    { phrase: '더하시리라', bonus: 20 },
    { phrase: '쓸 것을 채우', bonus: 18 },
    { phrase: '있어야 할 것을', bonus: 18 },
    { phrase: '있어야 할', bonus: 20 },
    { phrase: '기르시나니', bonus: 16 },
    { phrase: '입히시', bonus: 14 },
    { phrase: '모든 필요', bonus: 14 },
    { phrase: '먹을 것', bonus: 12 },
    { phrase: '입을 것', bonus: 12 },
    { phrase: '채우시리라', bonus: 18 }
  ];

  var NATURAL_INNER_PEACE_PHRASES = [
    { phrase: '마음과 생각', bonus: 20 },
    { phrase: '마음에 근심하지', bonus: 22 },
    { phrase: '평안을 너희에게', bonus: 22 },
    { phrase: '평강이', bonus: 16 },
    { phrase: '염려를 다', bonus: 20 },
    { phrase: '기도와 간구', bonus: 16 },
    { phrase: '감사함으로', bonus: 14 },
    { phrase: '아무것도 염려하지', bonus: 24 }
  ];

  var NATURAL_NARRATIVE_PENALTY_PATTERNS = [
    { phrase: '근심하매', penalty: 12 },
    { phrase: '근심하여', penalty: 16 },
    { phrase: '심히 근심', penalty: 16 },
    { phrase: '근심이 되었', penalty: 16 },
    { phrase: '근심하였', penalty: 14 },
    { phrase: '슬퍼하매', penalty: 10 },
    { phrase: '슬퍼하여', penalty: 10 },
    { phrase: '마음에 근심이 되었', penalty: 18 },
    { phrase: '근심 중에', penalty: 12 }
  ];

  var STOP_WORDS = {
    '이': 1, '그': 1, '저': 1, '나': 1, '너': 1, '것': 1,
    '의': 1, '에': 1, '을': 1, '를': 1, '은': 1, '는': 1, '가': 1,
    '와': 1, '과': 1, '도': 1, '로': 1, '으로': 1
  };

  function normalizeText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[,.!?;:'"'"\"\"·…\-\(\)\[\]「」『』《》〈〉]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collapseSpaces(text) {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function compactSearchText(text) {
    return normalizeText(text).replace(/\s+/g, '');
  }

  function ensureBookNamesSorted() {
    if (bookNamesByLength) return;
    bookNamesByLength = BOOK_NAMES.slice().sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function resolveBookName(raw) {
    ensureBookNamesSorted();
    var compact = String(raw || '').replace(/\s+/g, '');
    var i;
    for (i = 0; i < bookNamesByLength.length; i++) {
      if (compact === bookNamesByLength[i] || compact.indexOf(bookNamesByLength[i]) === 0) {
        return bookNamesByLength[i];
      }
    }
    return null;
  }

  function parseReference(query) {
    var trimmed = collapseSpaces(query);
    if (!trimmed) return null;

    var m;
    m = trimmed.match(/^(.+?)\s+(\d+)\s*[:：]\s*(\d+)\s*$/);
    if (m) {
      var book1 = resolveBookName(m[1]);
      if (book1) return { book: book1, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    m = trimmed.match(/^(.+?)\s*(\d+)\s*장\s*(\d+)\s*절\s*$/);
    if (m) {
      var book2 = resolveBookName(m[1]);
      if (book2) return { book: book2, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    m = trimmed.match(/^(.+?)\s*(\d+)\s*편\s*(\d+)\s*절\s*$/);
    if (m) {
      var book3 = resolveBookName(m[1]);
      if (book3) return { book: book3, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    var compact = trimmed.replace(/\s+/g, '');
    m = compact.match(/^(.+?)(\d+)[:：](\d+)$/);
    if (m) {
      var book4 = resolveBookName(m[1]);
      if (book4) return { book: book4, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    m = compact.match(/^(.+?)(\d+)장(\d+)절$/);
    if (m) {
      var book5 = resolveBookName(m[1]);
      if (book5) return { book: book5, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    m = compact.match(/^(.+?)(\d+)편(\d+)절$/);
    if (m) {
      var book6 = resolveBookName(m[1]);
      if (book6) return { book: book6, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
    }

    return null;
  }

  function buildIndex(oldData, newData) {
    if (verseIndex) return verseIndex;
    var rows = [];
    [oldData, newData].forEach(function (data, idx) {
      if (!data || !data.books) return;
      data.books.forEach(function (book) {
        book.chapters.forEach(function (chapter) {
          if (!chapter.verses) return;
          chapter.verses.forEach(function (verse) {
            var norm = normalizeText(verse.text);
            rows.push({
              ref: book.name + ' ' + chapter.chapter + ':' + verse.verse,
              text: verse.text,
              norm: norm,
              compactNorm: norm.replace(/\s+/g, ''),
              book: book.name,
              chapter: chapter.chapter,
              verse: verse.verse,
              testament: idx === 0 ? 'old' : 'new'
            });
          });
        });
      });
    });
    verseIndex = rows;
    return verseIndex;
  }

  function findVerseByRef(ref) {
    if (!verseIndex || !ref) return null;
    var i;
    for (i = 0; i < verseIndex.length; i++) {
      var row = verseIndex[i];
      if (row.book === ref.book && row.chapter === ref.chapter && row.verse === ref.verse) {
        return row;
      }
    }
    return null;
  }

  function getVersesInRange(book, chapter, verseStart, verseEnd) {
    if (!verseIndex) return [];
    var rows = [];
    var i;
    for (i = 0; i < verseIndex.length; i++) {
      var row = verseIndex[i];
      if (row.book === book && row.chapter === chapter && row.verse >= verseStart && row.verse <= verseEnd) {
        rows.push(row);
      }
    }
    rows.sort(function (a, b) { return a.verse - b.verse; });
    return rows;
  }

  var LORD_PRAYER_BOOK = '마태복음';
  var LORD_PRAYER_CHAPTER = 6;
  var LORD_PRAYER_VERSE_START = 9;
  var LORD_PRAYER_VERSE_END = 13;
  var LORD_PRAYER_INTRO_PREFIX = '그러므로 너희는 이렇게 기도하라 ';

  var LORD_PRAYER_ALIASES = [
    '주기도문', '주의기도', '하늘에계신우리아버지',
    '오늘우리에게일용할양식을주시옵고', '오늘날우리에게일용할양식을주옵시고',
    '나라와권세와영광'
  ];

  var APOSTLES_CREED_ALIASES = [
    '사도신경', '신앙고백', '전능하사천지를만드신',
    '성령으로잉태하사', '몸이다시사는것과'
  ];

  function compactNorm(text) {
    return compactSearchText(text);
  }

  function queryMatchesAliases(normQuery, aliases) {
    if (!normQuery) return false;
    var compact = normQuery.replace(/\s+/g, '');
    var i;
    for (i = 0; i < aliases.length; i++) {
      var alias = aliases[i];
      if (compact === alias || compact.indexOf(alias) >= 0) {
        return true;
      }
    }
    return false;
  }

  function matchesLordPrayerQuery(query) {
    var normQuery = normalizeText(query);
    if (!normQuery) return false;
    if (queryMatchesAliases(normQuery, LORD_PRAYER_ALIASES)) return true;
    var compactQuery = compactSearchText(query);
    if (compactQuery.length < 6) return false;
    var verses = getVersesInRange(LORD_PRAYER_BOOK, LORD_PRAYER_CHAPTER, LORD_PRAYER_VERSE_START, LORD_PRAYER_VERSE_END);
    var i;
    for (i = 0; i < verses.length; i++) {
      if (verses[i].compactNorm.indexOf(compactQuery) >= 0) {
        return true;
      }
    }
    return false;
  }

  function matchesApostlesCreedQuery(query) {
    return queryMatchesAliases(normalizeText(query), APOSTLES_CREED_ALIASES);
  }

  function getApostlesCreedData() {
    var data = global.GomnaFaithResourcesData;
    if (!data || !data.apostlesCreed || !data.apostlesCreed.text) return null;
    return data.apostlesCreed;
  }

  function buildLordPrayerDisplayText() {
    var verses = getVersesInRange(LORD_PRAYER_BOOK, LORD_PRAYER_CHAPTER, LORD_PRAYER_VERSE_START, LORD_PRAYER_VERSE_END);
    if (!verses.length) return '';
    var parts = [];
    var i;
    for (i = 0; i < verses.length; i++) {
      var text = verses[i].text;
      if (verses[i].verse === LORD_PRAYER_VERSE_START && text.indexOf(LORD_PRAYER_INTRO_PREFIX) === 0) {
        text = text.slice(LORD_PRAYER_INTRO_PREFIX.length);
      }
      parts.push(collapseSpaces(text));
    }
    return parts.join(' ');
  }

  function searchFaithResources(query) {
    var results = [];
    if (matchesLordPrayerQuery(query)) {
      results.push({
        id: 'lords-prayer',
        title: '주기도문',
        category: '기도',
        text: buildLordPrayerDisplayText(),
        relatedLabel: '마태복음 6:9~13',
        relatedVerse: {
          book: LORD_PRAYER_BOOK,
          chapter: LORD_PRAYER_CHAPTER,
          verse: LORD_PRAYER_VERSE_START,
          verseStart: LORD_PRAYER_VERSE_START,
          verseEnd: LORD_PRAYER_VERSE_END,
          testament: 'new'
        }
      });
    }
    if (matchesApostlesCreedQuery(query)) {
      var creed = getApostlesCreedData();
      if (creed) {
        results.push({
          id: 'apostles-creed',
          title: creed.title || '사도신경',
          category: creed.category || '신앙고백',
          text: creed.text,
          relatedVerses: creed.relatedVerses || []
        });
      }
    }
    return results;
  }

  function getLordPrayerBodyResults() {
    var verses = getVersesInRange(LORD_PRAYER_BOOK, LORD_PRAYER_CHAPTER, LORD_PRAYER_VERSE_START, LORD_PRAYER_VERSE_END);
    return verses.map(function (row) {
      return {
        ref: row.ref,
        text: row.text,
        book: row.book,
        chapter: row.chapter,
        verse: row.verse,
        testament: row.testament,
        score: 100
      };
    });
  }

  function shouldUseLordPrayerBodyResults(query) {
    return matchesLordPrayerQuery(query);
  }

  function verseKey(row) {
    return row.book + '|' + row.chapter + '|' + row.verse;
  }

  function getAllWordsTokens(normQuery) {
    var words = normQuery.split(' ').filter(function (w) { return w.length > 0; });
    var meaningful = [];
    var i;
    for (i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.length < 2) continue;
      if (STOP_WORDS[w]) continue;
      meaningful.push(w);
    }
    return meaningful;
  }

  function computeAllWordsCoverage(norm, tokens) {
    if (!tokens.length) return 0;
    var normWords = norm.split(' ').filter(function (w) { return w.length > 0; });
    if (!normWords.length) return 0;
    return tokens.length / normWords.length;
  }

  function matchBodyRow(row, normQuery, compactQuery, allWordsTokens, allowCompact, allowAllWords) {
    if (!normQuery) return null;
    var norm = row.norm;

    if (norm === normQuery) {
      return { score: SCORE_EXACT, matchType: 'exact', coverage: 1 };
    }

    if (normQuery.length >= 2 && norm.indexOf(normQuery) >= 0) {
      return {
        score: norm.indexOf(normQuery) === 0 ? SCORE_PHRASE_START : SCORE_PHRASE,
        matchType: 'phrase',
        coverage: normQuery.length / norm.length
      };
    }

    if (allowCompact && compactQuery.length >= COMPACT_QUERY_MIN_LEN && row.compactNorm.indexOf(compactQuery) >= 0) {
      return {
        score: SCORE_COMPACT_PHRASE,
        matchType: 'compact-phrase',
        coverage: compactQuery.length / row.compactNorm.length
      };
    }

    if (!allowAllWords || allWordsTokens.length < 2) return null;

    var w;
    for (w = 0; w < allWordsTokens.length; w++) {
      if (norm.indexOf(allWordsTokens[w]) < 0) return null;
    }
    return {
      score: SCORE_ALL_WORDS,
      matchType: 'all-words',
      coverage: computeAllWordsCoverage(norm, allWordsTokens)
    };
  }

  function stripNaturalFillers(normQuery) {
    if (!normQuery) return '';
    var words = normQuery.split(' ').filter(function (w) { return w.length > 0; });
    var kept = [];
    var i;
    for (i = 0; i < words.length; i++) {
      if (!NATURAL_FILLER_WORDS[words[i]]) kept.push(words[i]);
    }
    return kept.join(' ');
  }

  function compactQueryForNatural(query) {
    return compactSearchText(stripNaturalFillers(normalizeText(collapseSpaces(query))));
  }

  function detectNaturalIntents(query) {
    var compact = compactQueryForNatural(query);
    if (!compact) return [];
    var intents = [];
    var seen = {};
    var i;
    for (i = 0; i < NATURAL_INTENT_PROVISION_TRIGGERS.length; i++) {
      if (compact.indexOf(NATURAL_INTENT_PROVISION_TRIGGERS[i]) >= 0) {
        seen.provision = 1;
        break;
      }
    }
    for (i = 0; i < NATURAL_INTENT_INNER_PEACE_TRIGGERS.length; i++) {
      var t = NATURAL_INTENT_INNER_PEACE_TRIGGERS[i];
      if (compact.indexOf(t) >= 0) {
        seen['inner-peace'] = 1;
        break;
      }
    }
    if (!seen['inner-peace'] && compact.indexOf('마음') >= 0 && compact.indexOf('힘들') >= 0) {
      seen['inner-peace'] = 1;
    }
    for (i = 0; i < NATURAL_INTENT_COMPANIONSHIP_TRIGGERS.length; i++) {
      if (compact.indexOf(NATURAL_INTENT_COMPANIONSHIP_TRIGGERS[i]) >= 0) {
        seen.companionship = 1;
        break;
      }
    }
    for (i = 0; i < NATURAL_INTENT_ABSENCE_COMPANIONSHIP_TRIGGERS.length; i++) {
      if (compact.indexOf(NATURAL_INTENT_ABSENCE_COMPANIONSHIP_TRIGGERS[i]) >= 0) {
        seen['absence-companionship'] = 1;
        seen.companionship = 1;
        break;
      }
    }
    var conceptIds = detectNaturalConcepts(query);
    if (conceptIds.indexOf('loneliness') >= 0) {
      seen.companionship = 1;
    }
    if (seen.provision) intents.push('provision');
    if (seen['inner-peace']) intents.push('inner-peace');
    if (seen.companionship) intents.push('companionship');
    if (seen['absence-companionship']) intents.push('absence-companionship');
    return intents;
  }

  function rowHasRhetoricalPastEmotion(n) {
    if (!n) return false;
    if (/(근심|염려|두려워|슬퍼)[^\.]{0,48}(하지\s*아니하였|아니하였는가|아니하였느냐|아니하였음이냐)/.test(n)) {
      return true;
    }
    if (/(하지\s*아니하였|아니하였는가|아니하였느냐)[^\.]{0,48}(근심|염려|두려워|슬퍼)/.test(n)) {
      return true;
    }
    return false;
  }

  function verseHasGenuineWorryComfortCommand(row) {
    var n = row.norm;
    if (rowHasRhetoricalPastEmotion(n)) return false;
    if (/근심하지\s*말|마음에\s*근심하지\s*말/.test(n)) return true;
    if (/염려하지\s*말|아무\s*것도\s*염려하지\s*말|아무것도\s*염려하지\s*말/.test(n)) return true;
    if (/두려워\s*말|두려워하지\s*말|놀라지\s*말/.test(n)) return true;
    if (n.indexOf('평안을 너희에게') >= 0) return true;
    if (n.indexOf('염려를 다') >= 0 && n.indexOf('맡') >= 0) return true;
    if (n.indexOf('평강') >= 0 && (n.indexOf('지키') >= 0 || n.indexOf('마음') >= 0)) return true;
    if (n.indexOf('기도와 간구') >= 0 && n.indexOf('염려하지') >= 0 && !rowHasRhetoricalPastEmotion(n)) {
      return true;
    }
    var i;
    for (i = 0; i < NATURAL_COMFORT_PHRASES.length; i++) {
      var ph = NATURAL_COMFORT_PHRASES[i].phrase;
      if (ph.indexOf('하지') >= 0) continue;
      if (n.indexOf(ph) >= 0) return true;
    }
    return false;
  }

  function rowHasHumanCompanionshipNarrative(row) {
    var n = row.norm;
    var i;
    for (i = 0; i < NATURAL_HUMAN_COMPANIONSHIP_NARRATIVE.length; i++) {
      if (n.indexOf(NATURAL_HUMAN_COMPANIONSHIP_NARRATIVE[i].pattern) >= 0) {
        return true;
      }
    }
    return false;
  }

  function rowIsHistoricalDivineDescription(n) {
    if (/없었도다|없었더라|함께\s*한\s*다른\s*신|함께한\s*자\s*없이/.test(n)) return true;
    if (/인도하셨|하셨고|폈으며|베풀었|지으/.test(n) && !/하리|하시리|말라|하리라|하시며\s*너|너를\s*떠나지|너를\s*버리지/.test(n)) {
      return true;
    }
    return false;
  }

  function verseHasDirectDivineCompanionshipPromise(row) {
    var n = row.norm;
    if (rowIsHistoricalDivineDescription(n)) return false;
    if (/너를\s*버리지\s*아니|너희를\s*버리지\s*아니|버리지\s*아니하시|떠나지\s*아니하시|떠나지\s*아니하리|버리지\s*아니하리/.test(n)) {
      return true;
    }
    if (/고아와\s*같이\s*버려두지|결코\s*(버리|떠나)지\s*아니|기업을\s*떠나지\s*아니/.test(n)) {
      return true;
    }
    if (/여호와.*함께|하나님.*함께|주께서.*함께|주가.*함께|여호와께서.*함께/.test(n)) {
      return true;
    }
    if (/너희와\s*항상\s*함께|함께하시리라|함께\s*함이라|함께하리라/.test(n)) {
      return true;
    }
    if (/주께서.*곁|곁에\s*서서|가까이\s*계시|상한\s*마음에\s*가까이/.test(n)) {
      return true;
    }
    if (/내가\s+너와\s+함께|내가\s+너희와\s+함께/.test(n) && !rowHasHumanCompanionshipNarrative(row)) {
      return true;
    }
    if ((n.indexOf('너와') >= 0 || n.indexOf('너희와') >= 0) && n.indexOf('함께') >= 0) {
      if (/그들이?\s*너와\s*함께|그들과\s*함께/.test(n)) return false;
      if (/여호와|하나님|주께|주님|여호와께/.test(n)) return true;
      if (/그가\s+너와\s*함께|하나님\s+여호와\s+그가\s+너/.test(n)) return true;
    }
    if (/도와주리라|너를\s+붙들|붙들|피난처|위로하리라|영접하리라/.test(n)
      && /여호와|하나님|주|내가\s+너/.test(n)
      && !rowHasHumanCompanionshipNarrative(row)) {
      return true;
    }
    return false;
  }

  function verseHasCompanionshipPromise(row) {
    return verseHasDirectDivineCompanionshipPromise(row);
  }

  function computeDirectDivineCompanionshipTierBonus(row) {
    if (!verseHasDirectDivineCompanionshipPromise(row)) return 0;
    var n = row.norm;
    var bonus = 0;
    if (/떠나지\s*아니|버리지\s*아니/.test(n)) bonus += 30;
    if (/여호와|하나님|주께|주님|여호와께/.test(n) && n.indexOf('함께') >= 0) bonus += 24;
    if (/내가\s+너와\s+함께|내가\s+너희와\s+함께/.test(n)) bonus += 20;
    if (/곁에\s*서서|가까이\s*계시|상한\s*마음/.test(n)) bonus += 18;
    if (/도와주리라|붙들|지키/.test(n)) bonus += 12;
    return Math.min(bonus, 58);
  }

  function computeHumanCompanionshipNarrativePenalty(row, intents) {
    if (verseHasDirectDivineCompanionshipPromise(row)) return 0;
    if (!rowHasHumanCompanionshipNarrative(row)) return 0;
    var base = 44;
    if (intents && intents.indexOf('absence-companionship') >= 0) base = 78;
    return base;
  }

  function sumWorryComfortPhraseBonuses(row) {
    var n = row.norm;
    if (rowHasRhetoricalPastEmotion(n)) {
      return sumPhraseBonuses(row, NATURAL_COMFORT_PHRASES.filter(function (p) {
        return p.phrase.indexOf('하지') < 0 && p.phrase.indexOf('근심') < 0 && p.phrase.indexOf('염려') < 0;
      }));
    }
    var total = 0;
    var i;
    for (i = 0; i < NATURAL_COMFORT_PHRASES.length; i++) {
      var ph = NATURAL_COMFORT_PHRASES[i];
      if (n.indexOf(ph.phrase) < 0) continue;
      if (ph.phrase.indexOf('하지') >= 0 && rowHasRhetoricalPastEmotion(n)) continue;
      total += ph.bonus;
    }
    return total;
  }

  function sumInnerPeacePhraseBonuses(row) {
    var n = row.norm;
    if (rowHasRhetoricalPastEmotion(n)) {
      return sumPhraseBonuses(row, NATURAL_INNER_PEACE_PHRASES.filter(function (p) {
        return p.phrase.indexOf('근심') < 0 && p.phrase.indexOf('염려') < 0;
      }));
    }
    var total = 0;
    var i;
    for (i = 0; i < NATURAL_INNER_PEACE_PHRASES.length; i++) {
      var ph = NATURAL_INNER_PEACE_PHRASES[i];
      if (n.indexOf(ph.phrase) < 0) continue;
      if (ph.phrase.indexOf('근심') >= 0 || ph.phrase.indexOf('염려') >= 0) {
        if (!verseHasGenuineWorryComfortCommand(row) && rowHasRhetoricalPastEmotion(n)) continue;
      }
      total += ph.bonus;
    }
    return total;
  }

  function verseHasNaturalComfortExpression(row) {
    return verseHasGenuineWorryComfortCommand(row) || verseHasCompanionshipPromise(row);
  }

  function sumPhraseBonuses(row, phrases) {
    var n = row.norm;
    var total = 0;
    var i;
    for (i = 0; i < phrases.length; i++) {
      if (n.indexOf(phrases[i].phrase) >= 0) total += phrases[i].bonus;
    }
    return total;
  }

  function computeWorryNaturalRankingBonus(row, intents) {
    var comfortBonus = sumWorryComfortPhraseBonuses(row);
    var intentBonus = 0;
    if (intents.indexOf('provision') >= 0) {
      intentBonus += sumPhraseBonuses(row, NATURAL_PROVISION_PHRASES);
    }
    if (intents.indexOf('inner-peace') >= 0) {
      intentBonus += sumInnerPeacePhraseBonuses(row);
    }
    return Math.min(comfortBonus + intentBonus, 100);
  }

  function godAbandonmentReassuranceBonus(row, conceptIds, query) {
    if (conceptIds.indexOf('god') < 0 && conceptIds.indexOf('loneliness') < 0) return 0;
    var compact = compactQueryForNatural(query);
    if (compact.indexOf('버린') < 0 && compact.indexOf('버리') < 0 && compact.indexOf('떠난') < 0) {
      return 0;
    }
    var n = row.norm;
    if (/너를\s*버리지\s*아니|떠나지\s*아니하시|버리지\s*아니하시|고아와\s*같이\s*버려두지/.test(n)) {
      return 52;
    }
    return 0;
  }

  function computeCompanionshipNaturalBonus(row, intents, conceptIds, query) {
    if (intents.indexOf('companionship') < 0 && conceptIds.indexOf('loneliness') < 0) return 0;
    if (rowHasHumanCompanionshipNarrative(row) && !verseHasDirectDivineCompanionshipPromise(row)) {
      return 0;
    }
    var bonus = 0;
    if (verseHasDirectDivineCompanionshipPromise(row)) {
      bonus += sumPhraseBonuses(row, NATURAL_COMPANIONSHIP_PHRASES);
      bonus += computeDirectDivineCompanionshipTierBonus(row);
    }
    var n = row.norm;
    var strongHits = 0;
    if (/떠나지\s*아니|버리지\s*아니/.test(n)) strongHits += 1;
    if (/여호와|하나님|주께/.test(n) && n.indexOf('함께') >= 0 && !/그들이?\s*너와/.test(n)) {
      strongHits += 1;
    }
    if (n.indexOf('함께하리라') >= 0 || n.indexOf('함께 하리라') >= 0) strongHits += 1;
    if (strongHits >= 2) bonus += 22;
    else if (strongHits >= 1) bonus += 10;
    if (intents.indexOf('absence-companionship') >= 0 && verseHasDirectDivineCompanionshipPromise(row)) {
      bonus += 28;
    }
    if (/버렸/.test(n) && !/버리지\s*아니|버리지\s*않/.test(n) && conceptIds.indexOf('god') >= 0) {
      bonus -= 18;
    }
    bonus += godAbandonmentReassuranceBonus(row, conceptIds, query || '');
    return Math.min(Math.max(bonus, 0), 110);
  }

  function computeNaturalRhetoricalPastPenalty(row) {
    if (verseHasGenuineWorryComfortCommand(row)) return 0;
    var n = row.norm;
    if (!rowHasRhetoricalPastEmotion(n)) return 0;
    var penalty = 38;
    if (/아니하였는가|아니하였느냐|아니하였음이냐/.test(n)) penalty += 12;
    return Math.min(penalty, 55);
  }

  function computeLonelinessNarrativePenalty(row, intents) {
    if (verseHasDirectDivineCompanionshipPromise(row)) return 0;
    var humanPen = computeHumanCompanionshipNarrativePenalty(row, intents);
    var n = row.norm;
    var total = humanPen;
    var i;
    for (i = 0; i < NATURAL_LONELINESS_NARRATIVE_PATTERNS.length; i++) {
      if (n.indexOf(NATURAL_LONELINESS_NARRATIVE_PATTERNS[i].phrase) >= 0) {
        total += NATURAL_LONELINESS_NARRATIVE_PATTERNS[i].penalty;
      }
    }
    if (n.indexOf('함께') >= 0 && !verseHasDirectDivineCompanionshipPromise(row) && /더라|하였|하매|하여/.test(n)) {
      total += 10;
    }
    return Math.min(total, 90);
  }

  function provisionIntentAlignBonus(row, intents) {
    if (intents.indexOf('provision') < 0) return 0;
    var n = row.norm;
    var hits = 0;
    if (n.indexOf('무엇을 먹을') >= 0 || n.indexOf('무엇을 입을') >= 0 || n.indexOf('무엇을 마실') >= 0) {
      hits += 1;
    }
    if (n.indexOf('먼저 그의 나라') >= 0) hits += 1;
    if (n.indexOf('더하시리라') >= 0) hits += 1;
    if (n.indexOf('있어야 할') >= 0) hits += 1;
    if (n.indexOf('쓸 것을 채우') >= 0 || n.indexOf('채우시리라') >= 0) hits += 1;
    if (hits >= 2) return 34;
    if (hits >= 1) return 16;
    return 0;
  }

  function computeNaturalNarrativePenalty(row) {
    if (verseHasNaturalComfortExpression(row)) return 0;
    var n = row.norm;
    var total = 0;
    var i;
    for (i = 0; i < NATURAL_NARRATIVE_PENALTY_PATTERNS.length; i++) {
      if (n.indexOf(NATURAL_NARRATIVE_PENALTY_PATTERNS[i].phrase) >= 0) {
        total += NATURAL_NARRATIVE_PENALTY_PATTERNS[i].penalty;
      }
    }
    return Math.min(total, 60);
  }

  function scoreVerseCompanionshipPhraseOnly(row, conceptIds, query, cachedIntents) {
    var intents = cachedIntents || detectNaturalIntents(query);
    if (intents.indexOf('companionship') < 0 && conceptIds.indexOf('loneliness') < 0) return null;
    if (!verseHasDirectDivineCompanionshipPromise(row)) return null;
    var companionshipBonus = computeCompanionshipNaturalBonus(row, intents, conceptIds, query);
    var minBonus = conceptIds.indexOf('god') >= 0 ? 28 : 36;
    if (companionshipBonus < minBonus) return null;
    var lonelinessNarrativePenalty = computeLonelinessNarrativePenalty(row, intents);
    var humanNarrativePenalty = computeHumanCompanionshipNarrativePenalty(row, intents);
    var directDivineBonus = computeDirectDivineCompanionshipTierBonus(row);
    var abandonmentReassuranceBonus = godAbandonmentReassuranceBonus(row, conceptIds, query);
    var baseScore = SCORE_NATURAL_CONCEPT_1 - 20;
    if (conceptIds.indexOf('god') >= 0) baseScore += 25;
    var bonus = companionshipBonus - lonelinessNarrativePenalty;
    bonus += comfortPresencePatternBonus(row, conceptIds);
    var score = Math.min(SCORE_ALL_WORDS - 1, baseScore + bonus);
    return {
      matchedConceptCount: Math.max(1, conceptIds.length),
      score: score,
      matchType: conceptIds.length >= 2 ? 'natural-concept' : 'natural-single-concept',
      coverage: companionshipBonus / 90,
      naturalIntents: intents,
      naturalComfortBonus: companionshipBonus,
      naturalCompanionshipBonus: companionshipBonus,
      naturalDirectDivineBonus: directDivineBonus,
      naturalAbandonmentReassuranceBonus: abandonmentReassuranceBonus,
      naturalHumanNarrativePenalty: humanNarrativePenalty,
      naturalNarrativePenalty: lonelinessNarrativePenalty,
      naturalRhetoricalPenalty: 0
    };
  }

  function scoreVerseWorryIntentPhraseOnly(row, conceptIds, query) {
    if (conceptIds.indexOf('worry') < 0) return null;
    var intents = detectNaturalIntents(query);
    if (!intents.length) return null;
    var phraseBonus = computeWorryNaturalRankingBonus(row, intents);
    var alignBonus = provisionIntentAlignBonus(row, intents);
    if (phraseBonus + alignBonus < 18) return null;
    var narrativePenalty = computeNaturalNarrativePenalty(row);
    var rhetoricalPenalty = computeNaturalRhetoricalPastPenalty(row);
    var bonus = phraseBonus + alignBonus - narrativePenalty - rhetoricalPenalty;
    bonus += queryDontWorryBonus(row, query);
    var baseScore = SCORE_NATURAL_CONCEPT_1 - 30;
    var score = Math.min(SCORE_ALL_WORDS - 1, baseScore + bonus);
    return {
      matchedConceptCount: 1,
      score: score,
      matchType: 'natural-single-concept',
      coverage: phraseBonus / 80,
      naturalIntents: intents,
      naturalComfortBonus: phraseBonus,
      naturalNarrativePenalty: narrativePenalty,
      naturalRhetoricalPenalty: rhetoricalPenalty
    };
  }

  function detectNaturalConcepts(query) {
    var normQuery = normalizeText(collapseSpaces(query));
    var normForDetect = stripNaturalFillers(normQuery);
    if (!normForDetect) return [];
    var compactDetect = compactSearchText(normForDetect);
    var matched = [];
    var seen = {};
    var c;
    for (c = 0; c < NATURAL_CONCEPTS.length; c++) {
      var concept = NATURAL_CONCEPTS[c];
      var triggers = concept.triggers.slice().sort(function (a, b) {
        return compactSearchText(b).length - compactSearchText(a).length;
      });
      var t;
      for (t = 0; t < triggers.length; t++) {
        var triggerCompact = compactSearchText(triggers[t]);
        if (!triggerCompact) continue;
        if (compactDetect.indexOf(triggerCompact) >= 0) {
          if (!seen[concept.id]) {
            seen[concept.id] = 1;
            matched.push(concept.id);
          }
          break;
        }
      }
    }
    return matched;
  }

  function getConceptMatchTerms(conceptId) {
    var concept = NATURAL_CONCEPTS_BY_ID[conceptId];
    if (!concept) return [];
    var raw = concept.triggers.concat(concept.expansions);
    var uniq = [];
    var seen = {};
    var i;
    for (i = 0; i < raw.length; i++) {
      var term = collapseSpaces(raw[i]);
      if (!term || seen[term]) continue;
      seen[term] = 1;
      uniq.push(term);
    }
    uniq.sort(function (a, b) { return b.length - a.length; });
    return uniq;
  }

  function verseNormContainsTerm(row, term) {
    var normTerm = normalizeText(term);
    if (!normTerm) return false;
    if (normTerm === '주') {
      if (row.norm.indexOf('여호와') >= 0) return true;
      if (row.norm.indexOf('하나님') >= 0) return true;
      if (row.norm.indexOf('주님') >= 0) return true;
      if (row.norm.indexOf('주께') >= 0) return true;
      if (row.norm.indexOf('주가') >= 0) return true;
      if (row.norm.indexOf('주는') >= 0) return true;
      if (row.norm.indexOf('주를') >= 0) return true;
      if (row.norm.indexOf('주의') >= 0) return true;
      return false;
    }
    if (normTerm.length >= 2 && row.norm.indexOf(normTerm) >= 0) return true;
    var compactTerm = compactSearchText(term);
    if (compactTerm.length >= COMPACT_QUERY_MIN_LEN && row.compactNorm.indexOf(compactTerm) >= 0) {
      return true;
    }
    return false;
  }

  function conceptTermWeight(conceptId, term) {
    var normTerm = normalizeText(term);
    if (conceptId === 'god') {
      if (normTerm === '하나님' || normTerm === '여호와' || normTerm === '하느님') return 4;
      if (normTerm === '주') return 2;
      return 1;
    }
    if (conceptId === 'together') {
      if (normTerm.indexOf('함께') >= 0) return 4;
      if (normTerm === '같이') return 1;
      return 2;
    }
    if (conceptId === 'fear') {
      if (normTerm.indexOf('두려') >= 0) return 3;
      if (normTerm.indexOf('무서') >= 0) return 3;
      return 2;
    }
    if (conceptId === 'worry') {
      if (normTerm.indexOf('염려') >= 0) return 3;
      if (normTerm.indexOf('근심') >= 0) return 3;
      if (normTerm.indexOf('걱정') >= 0) return 2;
      return 2;
    }
    if (conceptId === 'loneliness') {
      if (normTerm.indexOf('외로') >= 0) return 3;
      if (normTerm.indexOf('혼자') >= 0) return 3;
      return 2;
    }
    return 1;
  }

  function comfortPresencePatternBonus(row, conceptIds) {
    if (conceptIds.indexOf('god') < 0 || conceptIds.indexOf('together') < 0) return 0;
    var n = row.norm;
    var hasGod = /하나님|여호와|하느님/.test(n);
    var hasWithYouTogether = (n.indexOf('너와') >= 0 || n.indexOf('너희와') >= 0) && n.indexOf('함께') >= 0;
    if (!hasGod || !hasWithYouTogether) return 0;
    var hasDontFear = /두려워\s*말|무서워\s*말|놀라지\s*말/.test(n);
    if (hasDontFear) return 35;
    return 10;
  }

  function queryTogetherPresenceBonus(row, query, conceptIds) {
    var compactQuery = compactSearchText(stripNaturalFillers(normalizeText(query)));
    if (!compactQuery) return 0;
    if (compactQuery.indexOf('나랑') < 0 && compactQuery.indexOf('나와') < 0 && compactQuery.indexOf('우리') < 0) {
      return 0;
    }
    var hasWithYou = row.compactNorm.indexOf('너와') >= 0 || row.compactNorm.indexOf('너희와') >= 0;
    if (!hasWithYou) return 0;
    var bonus = 25;
    if (row.norm.indexOf('함께') >= 0) bonus += 20;
    var hasGod = conceptIds.indexOf('god') >= 0;
    var hasTogether = conceptIds.indexOf('together') >= 0;
    if (hasGod && hasTogether && /두려워|무서워/.test(row.norm)) {
      bonus += 15;
    }
    return bonus;
  }

  function queryDontWorryBonus(row, query) {
    var compactQuery = compactSearchText(stripNaturalFillers(normalizeText(query)));
    if (!compactQuery) return 0;
    var wantsNotWorry = compactQuery.indexOf('말') >= 0 || compactQuery.indexOf('하지') >= 0;
    if (!wantsNotWorry) return 0;
    if (compactQuery.indexOf('걱정') < 0 && compactQuery.indexOf('염려') < 0 && compactQuery.indexOf('근심') < 0) {
      return 0;
    }
    if (row.norm.indexOf('염려하지') >= 0 || row.norm.indexOf('근심하지') >= 0) {
      return 30;
    }
    return 0;
  }

  function scoreVerseNaturalConcepts(row, conceptIds, query) {
    var matchedConceptCount = 0;
    var quality = 0;
    var maxQuality = 0;
    var matchedConceptIds = [];
    var i;
    for (i = 0; i < conceptIds.length; i++) {
      var conceptId = conceptIds[i];
      var terms = getConceptMatchTerms(conceptId);
      var conceptMax = 0;
      var conceptBest = 0;
      var t;
      for (t = 0; t < terms.length; t++) {
        var w = conceptTermWeight(conceptId, terms[t]);
        if (w > conceptMax) conceptMax = w;
        if (verseNormContainsTerm(row, terms[t]) && w > conceptBest) {
          conceptBest = w;
        }
      }
      maxQuality += conceptMax;
      if (conceptBest > 0) {
        matchedConceptCount += 1;
        matchedConceptIds.push(conceptId);
        quality += conceptBest;
      }
    }
    if (!matchedConceptCount) return null;
    if (conceptIds.indexOf('loneliness') >= 0 && matchedConceptIds.indexOf('loneliness') < 0) {
      if (!verseHasCompanionshipPromise(row)) return null;
    }
    var baseScore = naturalConceptScore(matchedConceptCount);
    var bonus = Math.min(79, quality * 5);
    bonus += queryTogetherPresenceBonus(row, query, conceptIds);
    bonus += queryDontWorryBonus(row, query);
    var comfortBonus = comfortPresencePatternBonus(row, conceptIds);
    bonus += comfortBonus;

    var intents = detectNaturalIntents(query);
    var worryComfortBonus = 0;
    var companionshipBonus = 0;
    var narrativePenalty = 0;
    var rhetoricalPenalty = 0;
    var lonelinessNarrativePenalty = 0;
    var humanNarrativePenalty = 0;
    var directDivineBonus = 0;
    var abandonmentReassuranceBonus = 0;
    if (conceptIds.indexOf('worry') >= 0) {
      worryComfortBonus = computeWorryNaturalRankingBonus(row, intents);
      bonus += worryComfortBonus;
      bonus += provisionIntentAlignBonus(row, intents);
      rhetoricalPenalty = computeNaturalRhetoricalPastPenalty(row);
      narrativePenalty = computeNaturalNarrativePenalty(row);
      bonus -= rhetoricalPenalty;
      bonus -= narrativePenalty;
    }
    if (conceptIds.indexOf('loneliness') >= 0 || intents.indexOf('companionship') >= 0) {
      directDivineBonus = computeDirectDivineCompanionshipTierBonus(row);
      abandonmentReassuranceBonus = godAbandonmentReassuranceBonus(row, conceptIds, query);
      companionshipBonus = computeCompanionshipNaturalBonus(row, intents, conceptIds, query);
      bonus += companionshipBonus;
      humanNarrativePenalty = computeHumanCompanionshipNarrativePenalty(row, intents);
      lonelinessNarrativePenalty = computeLonelinessNarrativePenalty(row, intents);
      bonus -= lonelinessNarrativePenalty;
    }

    var score = Math.min(SCORE_ALL_WORDS - 1, baseScore + bonus);
    var matchType = matchedConceptCount >= 2 ? 'natural-concept' : 'natural-single-concept';
    var coverageDenom = maxQuality + 35 + (worryComfortBonus || companionshipBonus ? 40 : 0);
    var coverage = coverageDenom
      ? (quality + comfortBonus + worryComfortBonus + companionshipBonus) / coverageDenom
      : matchedConceptCount / conceptIds.length;
    return {
      matchedConceptCount: matchedConceptCount,
      score: score,
      matchType: matchType,
      coverage: coverage,
      naturalIntents: intents,
      naturalComfortBonus: worryComfortBonus + companionshipBonus,
      naturalCompanionshipBonus: companionshipBonus,
      naturalDirectDivineBonus: directDivineBonus,
      naturalAbandonmentReassuranceBonus: abandonmentReassuranceBonus,
      naturalHumanNarrativePenalty: humanNarrativePenalty,
      naturalNarrativePenalty: narrativePenalty + lonelinessNarrativePenalty,
      naturalRhetoricalPenalty: rhetoricalPenalty
    };
  }

  function bestExistingBodyScore(bestByKey) {
    var keys = Object.keys(bestByKey);
    if (!keys.length) return 0;
    var best = 0;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (bestByKey[keys[i]].score > best) best = bestByKey[keys[i]].score;
    }
    return best;
  }

  function shouldRunNaturalBodySearch(query, bestByKey) {
    var conceptIds = detectNaturalConcepts(query);
    if (!conceptIds.length) return null;
    if (!Object.keys(bestByKey).length) return conceptIds;
    if (bestExistingBodyScore(bestByKey) >= SCORE_ALL_WORDS) return null;
    return conceptIds;
  }

  function naturalConceptScore(matchedConceptCount) {
    if (matchedConceptCount >= 3) return SCORE_NATURAL_CONCEPT_3;
    if (matchedConceptCount >= 2) return SCORE_NATURAL_CONCEPT_2;
    return SCORE_NATURAL_CONCEPT_1;
  }

  function appendNaturalBodyHits(query, bestByKey, conceptIds) {
    if (!verseIndex || !conceptIds || !conceptIds.length) return;
    var queryIntents = detectNaturalIntents(query);
    var i;
    for (i = 0; i < verseIndex.length; i++) {
      var row = verseIndex[i];
      var natural = scoreVerseNaturalConcepts(row, conceptIds, query);
      if (!natural) {
        natural = scoreVerseCompanionshipPhraseOnly(row, conceptIds, query, queryIntents);
      }
      if (!natural) {
        natural = scoreVerseWorryIntentPhraseOnly(row, conceptIds, query);
      }
      if (!natural) continue;

      var score = natural.score;
      var matchType = natural.matchType;
      var coverage = natural.coverage;
      var key = verseKey(row);
      var existing = bestByKey[key];
      var candidate = {
        ref: row.ref,
        text: row.text,
        book: row.book,
        chapter: row.chapter,
        verse: row.verse,
        testament: row.testament,
        score: score,
        matchType: matchType,
        coverage: coverage,
        naturalConcepts: conceptIds.join('+'),
        naturalIntents: natural.naturalIntents && natural.naturalIntents.length
          ? natural.naturalIntents.join('+') : '',
        naturalComfortBonus: natural.naturalComfortBonus || 0,
        naturalCompanionshipBonus: natural.naturalCompanionshipBonus || 0,
        naturalDirectDivineBonus: natural.naturalDirectDivineBonus || 0,
        naturalAbandonmentReassuranceBonus: natural.naturalAbandonmentReassuranceBonus || 0,
        naturalHumanNarrativePenalty: natural.naturalHumanNarrativePenalty || 0,
        naturalNarrativePenalty: natural.naturalNarrativePenalty || 0,
        naturalRhetoricalPenalty: natural.naturalRhetoricalPenalty || 0
      };
      if (!existing) {
        bestByKey[key] = candidate;
      } else if (candidate.score > existing.score
        || (candidate.score === existing.score && candidate.coverage > existing.coverage)
        || (candidate.score === existing.score && candidate.coverage === existing.coverage && row.text.length < existing.text.length)) {
        bestByKey[key] = candidate;
      }
    }
  }

  function sortBodyHits(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    if (a.text.length !== b.text.length) return a.text.length - b.text.length;
    if (a.book !== b.book) return a.book < b.book ? -1 : 1;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  }

  function searchBody(query) {
    if (!verseIndex) return [];
    var trimmed = collapseSpaces(query);
    if (!trimmed) return [];

    var ref = parseReference(trimmed);
    if (ref) {
      var exactRef = findVerseByRef(ref);
      if (exactRef) {
        return [{
          ref: exactRef.ref,
          text: exactRef.text,
          book: exactRef.book,
          chapter: exactRef.chapter,
          verse: exactRef.verse,
          testament: exactRef.testament,
          score: SCORE_REF,
          matchType: 'ref'
        }];
      }
    }

    var normQuery = normalizeText(trimmed);
    if (!normQuery) return [];

    var compactQuery = normQuery.replace(/\s+/g, '');
    var allowCompact = compactQuery.length >= COMPACT_QUERY_MIN_LEN;
    var allWordsTokens = getAllWordsTokens(normQuery);
    var allowAllWords = allWordsTokens.length >= 2;
    var bestByKey = {};
    var i;

    for (i = 0; i < verseIndex.length; i++) {
      var row = verseIndex[i];
      var match = matchBodyRow(row, normQuery, compactQuery, allWordsTokens, allowCompact, allowAllWords);
      if (!match) continue;

      var key = verseKey(row);
      var existing = bestByKey[key];
      if (!existing || match.score > existing.score
        || (match.score === existing.score && match.coverage > existing.coverage)
        || (match.score === existing.score && match.coverage === existing.coverage && row.text.length < existing.text.length)) {
        bestByKey[key] = {
          ref: row.ref,
          text: row.text,
          book: row.book,
          chapter: row.chapter,
          verse: row.verse,
          testament: row.testament,
          score: match.score,
          matchType: match.matchType,
          coverage: match.coverage
        };
      }
    }

    var naturalConceptIds = shouldRunNaturalBodySearch(trimmed, bestByKey);
    if (naturalConceptIds) {
      appendNaturalBodyHits(trimmed, bestByKey, naturalConceptIds);
    }

    var hits = Object.keys(bestByKey).map(function (k) { return bestByKey[k]; });
    hits.sort(sortBodyHits);

    return hits;
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, query, matchType) {
    var raw = String(text || '');
    var trimmed = collapseSpaces(query);
    if (!trimmed) return escapeHtml(raw);

    var useAllWords = matchType === 'all-words';
    var useNatural = matchType === 'natural-concept' || matchType === 'natural-single-concept';
    if (matchType === 'compact-phrase') {
      return escapeHtml(raw);
    }
    if (useNatural) {
      var conceptTerms = [];
      NATURAL_CONCEPTS.forEach(function (concept) {
        concept.expansions.forEach(function (term) {
          if (conceptTerms.indexOf(term) < 0) conceptTerms.push(term);
        });
        concept.triggers.forEach(function (term) {
          if (conceptTerms.indexOf(term) < 0) conceptTerms.push(term);
        });
      });
      conceptTerms.sort(function (a, b) { return b.length - a.length; });
      var outNatural = escapeHtml(raw);
      var n;
      for (n = 0; n < conceptTerms.length; n++) {
        var cterm = conceptTerms[n];
        if (cterm.length < 2) continue;
        var reN = new RegExp('(' + escapeRegExp(cterm) + ')', 'gi');
        outNatural = outNatural.replace(reN, '<mark>$1</mark>');
      }
      return outNatural;
    }
    if (!useAllWords) {
      var lowerRaw = raw.toLowerCase();
      var lowerQ = trimmed.toLowerCase();
      var idx = lowerRaw.indexOf(lowerQ);
      if (idx >= 0) {
        return escapeHtml(raw.slice(0, idx))
          + '<mark>' + escapeHtml(raw.slice(idx, idx + trimmed.length)) + '</mark>'
          + escapeHtml(raw.slice(idx + trimmed.length));
      }

      var normRaw = normalizeText(raw);
      var normQ = normalizeText(trimmed);
      if (normQ && normRaw.indexOf(normQ) >= 0) {
        var approxLen = Math.max(1, Math.round(trimmed.length * (raw.length / Math.max(normRaw.length, 1))));
        var start = Math.max(0, Math.floor((raw.length - approxLen) / 2));
        return escapeHtml(raw.slice(0, start))
          + '<mark>' + escapeHtml(raw.slice(start, start + approxLen)) + '</mark>'
          + escapeHtml(raw.slice(start + approxLen));
      }
    }

    var normQuery = normalizeText(trimmed);
    var words = useAllWords ? getAllWordsTokens(normQuery) : trimmed.split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) return escapeHtml(raw);

    var out = escapeHtml(raw);
    var p;
    for (p = 0; p < words.length; p++) {
      var word = words[p];
      var re = new RegExp('(' + escapeRegExp(word) + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  global.GomnaBibleSearch = {
    buildIndex: buildIndex,
    searchBody: searchBody,
    searchFaithResources: searchFaithResources,
    getLordPrayerBodyResults: getLordPrayerBodyResults,
    shouldUseLordPrayerBodyResults: shouldUseLordPrayerBodyResults,
    highlightText: highlightText,
    normalizeText: normalizeText,
    compactSearchText: compactSearchText,
    parseReference: parseReference,
    detectNaturalConcepts: detectNaturalConcepts,
    detectNaturalIntents: detectNaturalIntents
  };
})(typeof window !== 'undefined' ? window : globalThis);
