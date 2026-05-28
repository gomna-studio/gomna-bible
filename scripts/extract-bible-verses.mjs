import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const READER_HTML_PATH = path.join(ROOT, 'reader.html');

const BOOKS = {
  genesis: {
    book: '창세기',
    testamentVariable: 'oldTestamentData',
  },
};

function usage() {
  console.error('Usage: node scripts/extract-bible-verses.mjs --book genesis --chapter 1 --language ko-KR --dry-run');
  console.error('   or: node scripts/extract-bible-verses.mjs --book genesis --language ko-KR --dry-run');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    language: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--language') {
      args.language = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !args.language || !args.dryRun) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book id입니다: ${args.bookId}`);
  }

  if (args.chapter !== null && (!Number.isInteger(args.chapter) || args.chapter < 1)) {
    throw new Error(`유효하지 않은 chapter 값입니다: ${args.chapter}`);
  }

  return args;
}

function findObjectLiteralEnd(source, startIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }

  throw new Error('성경 데이터 객체의 끝을 찾지 못했습니다.');
}

function extractJsonObject(source, variableName) {
  const marker = `var ${variableName} =`;
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`${variableName} 선언을 찾지 못했습니다.`);
  }

  const objectStart = source.indexOf('{', markerIndex);
  if (objectStart === -1) {
    throw new Error(`${variableName} 객체 시작 위치를 찾지 못했습니다.`);
  }

  const objectEnd = findObjectLiteralEnd(source, objectStart);
  const objectLiteral = source.slice(objectStart, objectEnd);

  return JSON.parse(objectLiteral);
}

function readBookData(bookId) {
  const bookConfig = BOOKS[bookId];
  const readerHtml = fs.readFileSync(READER_HTML_PATH, 'utf8');
  const testamentData = extractJsonObject(readerHtml, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error(`${bookConfig.book} 데이터를 찾지 못했습니다.`);
  }

  return {
    bookConfig,
    bookData,
  };
}

function normalizeVerse({ bookConfig, bookId, language, chapter, verse }) {
  return {
    language,
    book: bookConfig.book,
    bookId,
    chapter,
    verse: verse.verse,
    text: String(verse.text || '').trim(),
  };
}

function extractVerses({ bookId, chapter, language }) {
  const { bookConfig, bookData } = readBookData(bookId);
  const chapterData = bookData.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`${bookConfig.book} ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData.verses.map((verse) => normalizeVerse({
    bookConfig,
    bookId,
    language,
    chapter,
    verse,
  }));
}

function extractBookVerses({ bookId, language }) {
  const { bookConfig, bookData } = readBookData(bookId);

  return bookData.chapters.flatMap((chapterData) => chapterData.verses.map((verse) => normalizeVerse({
    bookConfig,
    bookId,
    language,
    chapter: chapterData.chapter,
    verse,
  })));
}

function summarizeChapters(verses) {
  const chapterMap = new Map();

  for (const verse of verses) {
    if (!verse.text) {
      throw new Error(`${verse.chapter}장 ${verse.verse}절 본문이 비어 있습니다.`);
    }

    if (!chapterMap.has(verse.chapter)) {
      chapterMap.set(verse.chapter, []);
    }

    chapterMap.get(verse.chapter).push(verse.verse);
  }

  const chapterVerseCounts = Array.from(chapterMap.entries())
    .sort(([chapterA], [chapterB]) => chapterA - chapterB)
    .map(([chapter, verseNumbers]) => ({
      chapter,
      verseCount: verseNumbers.length,
    }));

  const maxChapter = chapterVerseCounts.length > 0
    ? Math.max(...chapterVerseCounts.map((item) => item.chapter))
    : 0;
  const expectedChapters = new Set(Array.from({ length: maxChapter }, (_, index) => index + 1));
  const missingChapters = [];
  const missingVerses = [];

  for (const { chapter } of chapterVerseCounts) {
    expectedChapters.delete(chapter);
  }

  missingChapters.push(...Array.from(expectedChapters));

  for (const [chapter, verseNumbers] of chapterMap.entries()) {
    const maxVerse = Math.max(...verseNumbers);
    const expectedVerses = new Set(Array.from({ length: maxVerse }, (_, index) => index + 1));

    for (const verseNumber of verseNumbers) {
      expectedVerses.delete(verseNumber);
    }

    for (const missingVerse of expectedVerses) {
      missingVerses.push({ chapter, verse: missingVerse });
    }
  }

  missingVerses.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);

  return {
    chapterCount: chapterVerseCounts.length,
    actualCount: verses.length,
    chapterVerseCounts,
    chapterVerseSummary: chapterVerseCounts
      .map((item) => `${item.chapter}:${item.verseCount}`)
      .join(', '),
    missingChapters,
    missingVerses,
    complete: missingChapters.length === 0 && missingVerses.length === 0,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verses = args.chapter === null
    ? extractBookVerses(args)
    : extractVerses(args);
  const summary = summarizeChapters(verses);
  const byChapterAndVerse = new Map(
    verses.map((verse) => [`${verse.chapter}:${verse.verse}`, verse]),
  );
  const lastChapter = Math.max(...summary.chapterVerseCounts.map((item) => item.chapter));
  const lastChapterVerseCount = summary.chapterVerseCounts.find((item) => item.chapter === lastChapter)?.verseCount;

  console.log(JSON.stringify({
    mode: 'dry-run',
    source: path.relative(ROOT, READER_HTML_PATH),
    scope: args.chapter === null ? 'book' : 'chapter',
    language: args.language,
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    chapter: args.chapter,
    chapterCount: summary.chapterCount,
    totalChapters: summary.chapterCount,
    extractedCount: verses.length,
    totalVerses: verses.length,
    chapterVerseCounts: summary.chapterVerseCounts,
    chapterVerseSummary: summary.chapterVerseSummary,
    sampleTexts: {
      genesis001001: byChapterAndVerse.get('1:1')?.text || null,
      genesis001031: byChapterAndVerse.get('1:31')?.text || null,
      genesis050Last: lastChapter && lastChapterVerseCount
        ? byChapterAndVerse.get(`${lastChapter}:${lastChapterVerseCount}`)?.text || null
        : null,
    },
    allVersesExtracted: summary.complete,
    missingChapters: summary.missingChapters,
    missingVerses: summary.missingVerses,
    fileModified: false,
    verses,
  }, null, 2));
}

main();
