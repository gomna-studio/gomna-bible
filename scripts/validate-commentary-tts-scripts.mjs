import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const LOCALES = {
  'ko-KR': { enabled: true },
  'en-US': { enabled: false },
  'ja-JP': { enabled: false },
  'es-ES': { enabled: false },
};

const BOOKS = new Set(['genesis']);

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

function hasTableHeader(text) {
  return TABLE_HEADER_PATTERNS.filter((pattern) => text.includes(pattern));
}

function validateText(text) {
  const failures = [];
  const warnings = [];
  const trimmed = text.trim();

  if (!trimmed) {
    failures.push('empty-file');
    return { failures, warnings };
  }

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

function validateFile(filePath) {
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
  const { failures, warnings } = validateText(text);

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
  const items = COMMENTARY_TYPES.map((type) => {
    const filePath = path.join(scriptsDir, `${type}.txt`);
    const result = validateFile(filePath);

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
    checks: [
      'all-9-files-exist',
      'non-empty',
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
