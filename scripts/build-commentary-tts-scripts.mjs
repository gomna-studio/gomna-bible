import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const BOOKS = {
  genesis: {
    bookNameByLocale: {
      'ko-KR': '창세기',
    },
    commentaryDataPath: path.join(ROOT, 'gomna_data_genesis.js'),
  },
};

const LOCALES = {
  'ko-KR': {
    scriptLocale: 'ko-KR',
    defaultEnabled: true,
  },
  'en-US': { scriptLocale: 'en-US', defaultEnabled: false },
  'ja-JP': { scriptLocale: 'ja-JP', defaultEnabled: false },
  'es-ES': { scriptLocale: 'es-ES', defaultEnabled: false },
};

const CURRENT_WRITE_SCOPE = {
  locale: 'ko-KR',
  bookId: 'genesis',
  chapter: 1,
  verse: 2,
};

const COMMENTARY_TYPES = [
  { type: 'original-language', title: '원어분석', tableKey: '표1_원어분석' },
  { type: 'history', title: '역사적배경', tableKey: '표2_역사적배경' },
  { type: 'theology', title: '신학적의미', tableKey: '표3_신학적의미' },
  { type: 'typology', title: '예표론', tableKey: '표4_예표론' },
  { type: 'matthew-henry', title: '매튜헨리', tableKey: '표5_매튜헨리' },
  { type: 'sermon', title: '설교자료', tableKey: '표6_설교자료' },
  { type: 'hymn', title: '찬송가', tableKey: '표7_찬송가' },
  { type: 'counseling', title: '상담적용', tableKey: '표8_상담적용' },
  { type: 'cross-reference', title: '교차참조', tableKey: '표9_교차참조' },
];

function usage() {
  console.error('Usage: node scripts/build-commentary-tts-scripts.mjs --locale ko-KR --book genesis --chapter 1 --verse 2 --dry-run');
  console.error('   or: node scripts/build-commentary-tts-scripts.mjs --locale ko-KR --book genesis --chapter 1 --verse 2 --write');
  console.error('Default mode is --dry-run. Current write scope is ko-KR genesis 1:2 only.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    dryRun: true,
    write: false,
  };
  let dryRunExplicit = false;
  let writeExplicit = false;

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
    } else if (arg === '--dry-run') {
      dryRunExplicit = true;
      args.dryRun = true;
    } else if (arg === '--write') {
      writeExplicit = true;
      args.write = true;
      args.dryRun = false;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (dryRunExplicit && writeExplicit) {
    throw new Error('--dry-run과 --write는 동시에 사용할 수 없습니다.');
  }
  if (!args.bookId || !args.chapter || !args.verse) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }
  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book입니다: ${args.bookId}`);
  }
  if (!LOCALES[args.locale]) {
    throw new Error(`지원하지 않는 locale입니다: ${args.locale}`);
  }

  return args;
}

function assertWriteScope(args) {
  if (!args.write) return;

  if (
    args.locale !== CURRENT_WRITE_SCOPE.locale ||
    args.bookId !== CURRENT_WRITE_SCOPE.bookId ||
    args.chapter !== CURRENT_WRITE_SCOPE.chapter ||
    args.verse !== CURRENT_WRITE_SCOPE.verse
  ) {
    throw new Error('현재 --write는 ko-KR 창세기 1장 2절에만 허용됩니다.');
  }
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function buildOutputDir(args) {
  return path.join(
    ROOT,
    'tts-scripts',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(args.verse),
  );
}

function loadPastorCommentaryData(bookId) {
  const bookConfig = BOOKS[bookId];
  const source = fs.readFileSync(bookConfig.commentaryDataPath, 'utf8');
  const sandbox = { pastorCommentaryData: {} };
  vm.runInNewContext(source, sandbox, {
    filename: toRelativePath(bookConfig.commentaryDataPath),
  });
  return sandbox.pastorCommentaryData;
}

function getBookName(args) {
  const bookConfig = BOOKS[args.bookId];
  const bookName = bookConfig.bookNameByLocale[args.locale];

  if (!bookName) {
    throw new Error(`${args.locale}용 ${args.bookId} 책 이름 설정이 없습니다.`);
  }

  return bookName;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHebrew(value) {
  return cleanText(value).replace(/[\u0590-\u05FF]/g, '').replace(/\s+/g, ' ').trim();
}

function termForSpeech(value) {
  const text = String(value || '');
  const parenthetical = text.match(/\(([^)]+)\)/);
  if (parenthetical) return cleanText(parenthetical[1]);
  return stripHebrew(text).replace(/[()]/g, '').trim();
}

function sentence(value) {
  const text = cleanText(value);
  if (!text) return '';
  return /[.!?。！？다요죠음함됨임니다라]$/.test(text) ? text : `${text}.`;
}

function lastHangulSyllable(value) {
  const chars = Array.from(String(value || '').replace(/['"’”)\]\s]+$/g, '')).reverse();
  return chars.find((char) => /[가-힣]/.test(char)) || '';
}

function hasFinalConsonant(value) {
  const char = lastHangulSyllable(value);
  if (!char) return false;
  return (char.charCodeAt(0) - 0xac00) % 28 !== 0;
}

function withObjectParticle(value) {
  return `${value}${hasFinalConsonant(value) ? '을' : '를'}`;
}

function intro({ args, data, title, bookName }) {
  return `${bookName} ${args.chapter}장 ${args.verse}절, ${title}입니다. 본문은 '${data.korean_text}'입니다.`;
}

function renderOriginalLanguage(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const term = termForSpeech(row.원어);
    const meaning = cleanText(row.의미_문법);
    const point = sentence(row.설교포인트);
    lines.push(`${term}는 ${meaning}라는 뜻입니다. ${point}`);
  }

  lines.push('', '이 구절은 혼돈과 공허 속에서도 하나님의 영이 일하고 계심을 보여 줍니다.');
  return lines.join('\n');
}

function renderHistory(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${withObjectParticle(row.항목)} 생각해 볼 수 있습니다. ${sentence(row.내용)} ${sentence(row.목회적활용)}`);
  }

  return lines.join('\n');
}

function renderTheology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.교리}의 의미가 드러납니다. ${sentence(row.설명)} 관련해서 ${row.관련구절}을 함께 볼 수 있습니다.`);
  }

  return lines.join('\n');
}

function renderTypology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.구분}의 관점에서 보면, ${sentence(row.내용)} 이것은 ${sentence(row.그리스도연결)}`);
  }

  return lines.join('\n');
}

function renderMatthewHenry(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`매튜 헨리는 이 말씀을 이렇게 풀어 줍니다. ${sentence(row.한국어번역)} 핵심 통찰은 ${sentence(row.핵심통찰)}`);
  }

  return lines.join('\n');
}

function renderSermon(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const heading = cleanText(row.대지).replace(/^\d+대지:\s*/, '');
    lines.push(`${heading}입니다. ${sentence(row.내용)} 적용 예로는 ${sentence(row.예화_적용)}`);
  }

  return lines.join('\n');
}

function renderHymn(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const hymnTitle = `'${row.제목}'`;
    lines.push(`새찬송가 ${row.새찬송가}, ${withObjectParticle(hymnTitle)} 함께 묵상할 수 있습니다. 선정 이유는 ${sentence(row.선정이유)}`);
  }

  return lines.join('\n');
}

function renderCounseling(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.상황}에게 이 말씀을 적용할 수 있습니다. 성경 원리는 ${sentence(row.성경원리)} 실제 적용은 ${sentence(row.실제적용)}`);
  }

  return lines.join('\n');
}

function renderCrossReference(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.구절}은 ${row.구분}의 연결 구절입니다. 연결점은 ${sentence(row.연결점)}`);
  }

  return lines.join('\n');
}

const RENDERERS = {
  'original-language': renderOriginalLanguage,
  history: renderHistory,
  theology: renderTheology,
  typology: renderTypology,
  'matthew-henry': renderMatthewHenry,
  sermon: renderSermon,
  hymn: renderHymn,
  counseling: renderCounseling,
  'cross-reference': renderCrossReference,
};

function buildPlans(args) {
  const bookName = getBookName(args);
  const dataKey = `${bookName}_${args.chapter}_${args.verse}`;
  const commentaryData = loadPastorCommentaryData(args.bookId);
  const data = commentaryData[dataKey];

  if (!data) {
    throw new Error(`말씀풀이 데이터를 찾지 못했습니다: pastorCommentaryData["${dataKey}"]`);
  }

  const outputDir = buildOutputDir(args);

  return COMMENTARY_TYPES.map((item) => {
    const rows = data[item.tableKey];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`${dataKey}의 ${item.tableKey} 데이터가 비어 있습니다.`);
    }

    const text = `${RENDERERS[item.type]({ args, data, title: item.title, bookName }, rows).trim()}\n`;
    const outputPath = path.join(outputDir, `${item.type}.txt`);

    return {
      type: item.type,
      title: item.title,
      tableKey: item.tableKey,
      outputPath,
      relativeOutputPath: toRelativePath(outputPath),
      preview: text.slice(0, 180).replace(/\s+/g, ' ').trim(),
      characterCount: text.length,
      text,
    };
  });
}

function writePlans(plans) {
  for (const plan of plans) {
    fs.mkdirSync(path.dirname(plan.outputPath), { recursive: true });
    fs.writeFileSync(plan.outputPath, plan.text, 'utf8');
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertWriteScope(args);

  const plans = buildPlans(args);

  if (args.write) {
    writePlans(plans);
  }

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    fileModified: args.write,
    locale: args.locale,
    bookId: args.bookId,
    chapter: args.chapter,
    verse: args.verse,
    outputDir: toRelativePath(buildOutputDir(args)),
    targetCount: plans.length,
    note: 'Future multilingual expansion should move manifest lookup to audiosByLocale or locale-qualified IDs to avoid audioId collisions.',
    scripts: plans.map((plan) => ({
      type: plan.type,
      title: plan.title,
      tableKey: plan.tableKey,
      outputPath: plan.relativeOutputPath,
      characterCount: plan.characterCount,
      preview: plan.preview,
    })),
  }, null, 2));
}

main();
