import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { BOOKS as BOOK_REGISTRY, TESTAMENT_SOURCES } from './bible-book-registry.mjs';
import {
  getAliasSlotsForTable,
  normalizeCommentaryTableRows,
} from './lib/commentary-card-field-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const LOCALES = {
  'ko-KR': { enabled: true },
  'en-US': { enabled: false },
  'ja-JP': { enabled: false },
  'es-ES': { enabled: false },
};

const BOOKS = new Set(['genesis', 'exodus']);

const COMMENTARY_TYPES = [
  'original-language',
  'history',
  'theology',
  'typology',
  'matthew-henry',
  'sermon',
  'hymn',
  'counseling',
  'cross-reference',
];

// 렌더러가 실제로 낭독에 쓰는 필드. 비어 있으면 문장이 깨진 채 생성된다.
// 세 번째 배열은 대체 스키마 필드다. 이 필드가 모두 채워진 행은
// 생성기가 전용 문장으로 낭독하므로 정규 슬롯이 비어도 결함이 아니다.
const NARRATED_FIELDS_BY_TYPE = {
  'original-language': ['표1_원어분석', ['원어', '의미_문법', '설교포인트'], ['음역', '뜻', '문법', '설명']],
  history: ['표2_역사적배경', ['항목', '내용', '목회적활용'], ['시대적상황', '지리적배경', '문화적맥락', '고고학적발견']],
  theology: ['표3_신학적의미', ['교리', '설명', '관련구절'], ['핵심주제', '하나님의속성', '구속사적의미', '교리적가르침']],
  typology: ['표4_예표론', ['구분', '내용', '그리스도연결'], ['구약예표', '신약성취', '그리스도연결', '적용']],
  'matthew-henry': ['표5_매튜헨리', ['한국어번역', '핵심통찰'], ['핵심해석', '영적교훈', '실천적적용']],
  sermon: ['표6_설교자료', ['대지', '내용', '예화_적용'], ['설교제목', '설교포인트', '예화', '적용질문']],
  hymn: ['표7_찬송가', ['새찬송가', '제목', '선정이유'], null],
  counseling: ['표8_상담적용', ['상황', '성경원리', '실제적용'], ['상담주제', '성경적원리', '실제적조언', '위로의말씀']],
  'cross-reference': ['표9_교차참조', ['구절', '연결점', '구분'], null],
};

const TYPE_TITLES = {
  'original-language': '원어분석',
  history: '역사적배경',
  theology: '신학적의미',
  typology: '예표론',
  'matthew-henry': '매튜헨리',
  sermon: '설교자료',
  hymn: '찬송가',
  counseling: '상담적용',
  'cross-reference': '교차참조',
};

// 절 본문은 첫 유형(원어분석) intro에서만 1회 낭독한다.
const VERSE_TEXT_INTRO_TYPE = COMMENTARY_TYPES[0];

const OLD_TESTAMENT_PATH = path.join(ROOT, TESTAMENT_SOURCES.oldTestamentData.fileName);

const TABLE_HEADER_PATTERNS = [
  '원어',
  '의미_문법',
  '설교포인트',
  '항목',
  '목회적활용',
  '교리',
  '관련구절',
  '구분',
  '그리스도연결',
  '영어원문',
  '한국어번역',
  '핵심통찰',
  '대지',
  '예화_적용',
  '새찬송가',
  '통일찬송가',
  '선정이유',
  '성경원리',
  '실제적용',
  '연결점',
];

function usage() {
  console.error('Usage: node scripts/validate-commentary-tts-scripts.mjs --locale ko-KR --book genesis --chapter 1 --verse 2');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--locale' || arg === '--language') {
      args.locale = argv[++i];
    } else if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--verse') {
      args.verse = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !args.chapter || !args.verse) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }
  if (!LOCALES[args.locale]) {
    throw new Error(`지원하지 않는 locale입니다: ${args.locale}`);
  }
  if (!BOOKS.has(args.bookId)) {
    throw new Error(`지원하지 않는 book입니다: ${args.bookId}`);
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function buildScriptsDir(args) {
  return path.join(
    ROOT,
    'tts-scripts',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(args.verse),
  );
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

// 성경 본문 원천은 Reader와 동일한 개역한글(old_testament.js) 하나뿐이다.
let oldTestamentBooks = null;

function loadOldTestamentBooks() {
  if (oldTestamentBooks) return oldTestamentBooks;

  const sandbox = {
    window: {},
    module: { exports: {} },
    document: { addEventListener() {} },
    console,
  };
  vm.runInNewContext(fs.readFileSync(OLD_TESTAMENT_PATH, 'utf8'), sandbox, {
    filename: TESTAMENT_SOURCES.oldTestamentData.fileName,
  });

  const books = sandbox.oldTestamentData?.books;
  if (!Array.isArray(books) || books.length === 0) {
    throw new Error(`${TESTAMENT_SOURCES.oldTestamentData.fileName}에서 oldTestamentData.books를 읽지 못했습니다.`);
  }

  oldTestamentBooks = books;
  return books;
}

function getBookName(bookId) {
  const bookName = BOOK_REGISTRY[bookId]?.book;
  if (!bookName) {
    throw new Error(`bible-book-registry에 없는 book입니다: ${bookId}`);
  }
  return bookName;
}

function loadVerseText({ bookId, chapter, verse }) {
  const bookName = getBookName(bookId);
  const book = loadOldTestamentBooks().find((item) => item.name === bookName);
  const chapterData = book?.chapters?.find((item) => item.chapter === chapter);
  const verseText = chapterData?.verses?.find((item) => item.verse === verse)?.text;

  if (typeof verseText !== 'string' || !verseText.trim()) {
    throw new Error(
      `개역한글 본문을 찾지 못했습니다: ${TESTAMENT_SOURCES.oldTestamentData.fileName} ${bookName} ${chapter}:${verse}`,
    );
  }

  return verseText.replace(/\s+/g, ' ').trim();
}

let commentaryDataByBook = null;

function loadPastorCommentaryData(bookId) {
  commentaryDataByBook = commentaryDataByBook || new Map();
  const cached = commentaryDataByBook.get(bookId);
  if (cached) return cached;

  const sandbox = { pastorCommentaryData: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, `gomna_data_${bookId}.js`), 'utf8'),
    sandbox,
    { filename: `gomna_data_${bookId}.js` },
  );

  commentaryDataByBook.set(bookId, sandbox.pastorCommentaryData);
  return sandbox.pastorCommentaryData;
}

// 낭독 슬롯이 비는 원인은 두 갈래이고 책임이 다르므로 분리해서 판정한다.
//  - rendered-empty        : 원본에 값이 있는데 렌더러/별칭이 못 집어 비었다 → 코드 결함, 0이어야 한다.
//  - source-missing-blocked: 원본 자체에 값이 없다 → 내용 창작 없이는 복구 불가, 집계만 한다.
function findEmptyNarratedFields({ bookId, bookName, chapter, verse, type }) {
  const [tableKey, fields, altFields] = NARRATED_FIELDS_BY_TYPE[type];
  const data = loadPastorCommentaryData(bookId)[`${bookName}_${chapter}_${verse}`];
  const sourceRows = data?.[tableKey] || [];
  const rows = normalizeCommentaryTableRows(tableKey, 'ko-KR', sourceRows);
  const renderedEmpty = new Set();
  const sourceMissing = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const sourceRow = sourceRows[index] || {};
    if (altFields && altFields.every((field) => String(sourceRow[field] ?? '').trim())) continue;

    // 어떤 정규 슬롯의 별칭에도 걸리지 않은 비어 있지 않은 키가 있으면
    // 값은 존재하는데 별칭이 없어 못 읽은 것이므로 코드 결함이다.
    const aliasSlots = getAliasSlotsForTable(tableKey) || [];
    const mappedKeys = new Set(aliasSlots.flat());
    const hasUnmappedValue = Object.entries(sourceRow).some(
      ([key, value]) => !mappedKeys.has(key) && value != null && String(value).trim() !== '',
    );

    for (const field of fields) {
      if (String(rows[index][field] ?? '').trim()) continue;
      (hasUnmappedValue ? renderedEmpty : sourceMissing).add(`${tableKey}.${field}`);
    }
  }

  return { renderedEmpty: [...renderedEmpty], sourceMissing: [...sourceMissing] };
}

// 본문 원천/낭독 규칙 회귀 방지용 상설 검증.
function validateVerseTextRule(text, ctx) {
  const failures = [];
  const warnings = [];
  const [introLine, ...bodyLines] = text.split('\n');
  const heading = `${ctx.bookName} ${ctx.chapter}장 ${ctx.verse}절, ${TYPE_TITLES[ctx.type]}입니다.`;
  const isVerseTextType = ctx.type === VERSE_TEXT_INTRO_TYPE;
  const expectedIntro = isVerseTextType
    ? `${heading} 본문은 '${ctx.verseText}'입니다.`
    : heading;

  if (introLine !== expectedIntro) {
    failures.push(isVerseTextType ? 'intro-verse-text-mismatch' : 'intro-heading-mismatch');
  }

  // 말씀풀이 body가 해당 절을 인용하는 것은 정상이므로 경고로만 남긴다.
  const bodyQuotes = countOccurrences(bodyLines.join('\n'), ctx.verseText);
  if (bodyQuotes > 0) {
    warnings.push(`verse-text-quoted-in-body:${bodyQuotes}`);
  }

  if (/\bundefined\b/.test(text)) failures.push('undefined-literal');
  if (/\bnull\b/.test(text)) failures.push('null-literal');
  if (text.includes("본문은 ''입니다.")) failures.push('empty-verse-text');

  if (ctx.type === 'matthew-henry') {
    const lastLabelCount = countOccurrences(text, '마지막 영어 원문입니다.');
    if (lastLabelCount > 1) failures.push('matthew-henry-last-label-duplicated');
  }

  const emptyNarrated = findEmptyNarratedFields(ctx);
  for (const field of emptyNarrated.renderedEmpty) {
    failures.push(`rendered-empty:${field}`);
  }
  for (const field of emptyNarrated.sourceMissing) {
    warnings.push(`source-missing-blocked:${field}`);
  }

  return { failures, warnings };
}

function hasTableHeader(text) {
  return TABLE_HEADER_PATTERNS.filter((pattern) => text.includes(pattern));
}

function validateText(text, ctx) {
  const failures = [];
  const warnings = [];
  const trimmed = text.trim();

  if (!trimmed) {
    failures.push('empty-file');
    return { failures, warnings };
  }

  const verseTextRule = validateVerseTextRule(text, ctx);
  failures.push(...verseTextRule.failures);
  warnings.push(...verseTextRule.warnings);

  const hebrewCount = countMatches(text, /[\u0590-\u05FF]/g);
  if (hebrewCount > 8) {
    warnings.push(`hebrew-excessive:${hebrewCount}`);
  }

  const tableHeaders = hasTableHeader(text);
  if (tableHeaders.length > 0) {
    warnings.push(`table-header-left:${tableHeaders.join(',')}`);
  }

  const slashCount = countMatches(text, /\//g);
  if (slashCount > 4) {
    warnings.push(`slash-excessive:${slashCount}`);
  }

  const latinCount = countMatches(text, /[A-Za-z]/g);
  const nonWhitespaceCount = countMatches(text, /\S/g);
  const latinRatio = nonWhitespaceCount > 0 ? latinCount / nonWhitespaceCount : 0;
  if (latinCount > 80 || latinRatio > 0.16) {
    warnings.push(`latin-excessive:${latinCount}`);
  }

  return { failures, warnings };
}

function itemStatus(failures, warnings) {
  if (failures.length > 0) return 'FAIL';
  if (warnings.length > 0) return 'WARN';
  return 'PASS';
}

function overallStatus(items) {
  if (items.some((item) => item.status === 'FAIL')) return 'FAIL';
  if (items.some((item) => item.status === 'WARN')) return 'WARN';
  return 'PASS';
}

function validateFile(filePath, ctx) {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      fileSize: 0,
      characterCount: 0,
      failures: ['missing-file'],
      warnings: [],
      status: 'FAIL',
    };
  }

  const stat = fs.statSync(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const { failures, warnings } = validateText(text, ctx);

  return {
    exists: true,
    fileSize: stat.size,
    characterCount: text.length,
    failures,
    warnings,
    status: itemStatus(failures, warnings),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptsDir = buildScriptsDir(args);
  const bookName = getBookName(args.bookId);
  const verseText = loadVerseText(args);
  const items = COMMENTARY_TYPES.map((type) => {
    const filePath = path.join(scriptsDir, `${type}.txt`);
    const result = validateFile(filePath, {
      type, bookName, bookId: args.bookId, chapter: args.chapter, verse: args.verse, verseText,
    });

    return {
      type,
      path: toRelativePath(filePath),
      ...result,
    };
  });
  const status = overallStatus(items);

  console.log(JSON.stringify({
    status,
    locale: args.locale,
    bookId: args.bookId,
    chapter: args.chapter,
    verse: args.verse,
    scriptsDir: toRelativePath(scriptsDir),
    expectedCount: COMMENTARY_TYPES.length,
    passCount: items.filter((item) => item.status === 'PASS').length,
    warnCount: items.filter((item) => item.status === 'WARN').length,
    failCount: items.filter((item) => item.status === 'FAIL').length,
    verseTextSource: TESTAMENT_SOURCES.oldTestamentData.fileName,
    verseText,
    checks: [
      'all-9-files-exist',
      'non-empty',
      'intro-matches-old-testament',
      'verse-text-read-once-per-verse',
      'no-undefined-or-null',
      'no-rendered-empty-narrated-field',
      'report-source-missing-blocked',
      'hebrew-not-excessive',
      'no-table-headers',
      'slash-not-excessive',
      'latin-not-excessive',
    ],
    items,
  }, null, 2));

  if (status === 'FAIL') {
    process.exitCode = 1;
  }
}

main();
