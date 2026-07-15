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
  var COMPACT_QUERY_MIN_LEN = 4;

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

    var hits = Object.keys(bestByKey).map(function (k) { return bestByKey[k]; });
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      if (a.text.length !== b.text.length) return a.text.length - b.text.length;
      if (a.book !== b.book) return a.book < b.book ? -1 : 1;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

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
    if (matchType === 'compact-phrase') {
      return escapeHtml(raw);
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
    parseReference: parseReference
  };
})(typeof window !== 'undefined' ? window : globalThis);
