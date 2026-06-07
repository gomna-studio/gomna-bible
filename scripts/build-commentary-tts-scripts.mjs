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
  verse: 4,
};

const ORIGINAL_LANGUAGE_CLOSINGS = {
  '1:2': '이 구절은 혼돈과 공허 속에서도 하나님의 영이 일하고 계심을 보여 줍니다.',
  '1:3': '이 구절은 하나님의 말씀이 곧 빛을 창조하시는 능력을 보여 줍니다.',
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
  console.error('Default mode is --dry-run. Current write scope is ko-KR genesis 1:4 only.');
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

  if (!isCurrentWriteScope(args) && !isPipelineAllowedTarget(args)) {
    throw new Error('현재 --write는 ko-KR 창세기 1장 4절 또는 master pipeline이 정확히 허용한 대상에만 허용됩니다.');
  }
}

function targetKey(args) {
  return `${args.locale}:${args.bookId}:${args.chapter}:${args.verse}`;
}

function isCurrentWriteScope(args) {
  return (
    args.locale === CURRENT_WRITE_SCOPE.locale &&
    args.bookId === CURRENT_WRITE_SCOPE.bookId &&
    args.chapter === CURRENT_WRITE_SCOPE.chapter &&
    args.verse === CURRENT_WRITE_SCOPE.verse
  );
}

function isPipelineAllowedTarget(args) {
  return (
    process.env.GOMNA_COMMENTARY_PIPELINE === '1' &&
    process.env.GOMNA_COMMENTARY_ALLOWED_TARGET === targetKey(args)
  );
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

function topicParticle(value) {
  return `${value}${hasFinalConsonant(value) ? '은' : '는'}`;
}

function phraseAsPoint(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (/[.!?。！？다요죠음함됨임니다라]$/.test(text)) return text;
  if (text.endsWith('강조')) return `${text}합니다.`;
  if (text.endsWith('선포')) return `${text}합니다.`;
  return `${withObjectParticle(text)} 보여 줍니다.`;
}

function phraseAsConnection(value) {
  const text = connectionSubjectForSpeech(value);
  if (!text) return '';
  if (/[.!?。！？다요죠음함됨임니다라]$/.test(text)) return text;
  return `${withAndParticle(text)} 연결됩니다.`;
}

function scriptureRefForSpeech(value) {
  const text = cleanText(value);
  const match = text.match(/^([가-힣]+)\s*(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return text;

  const [, book, chapter, verseStart, verseEnd] = match;
  const bookNames = {
    시: '시편',
    사: '이사야',
    욥: '욥기',
    말: '말라기',
    요: '요한복음',
    고후: '고린도후서',
    엡: '에베소서',
    계: '요한계시록',
    히: '히브리서',
    골: '골로새서',
  };
  const bookName = bookNames[book] || book;
  const chapterUnit = bookName === '시편' ? '편' : '장';
  const verseText = verseEnd ? `${verseStart}절부터 ${verseEnd}절` : `${verseStart}절`;

  return `${bookName} ${chapter}${chapterUnit} ${verseText}`;
}

function christConnectionForSpeech(value) {
  const text = cleanText(value);
  const reference = scriptureRefForSpeech(text);
  if (reference !== text) return `${withAndParticle(reference, '도')} 이어집니다.`;
  return phraseAsConnection(text);
}

function matthewHenryEnglishIntro(index) {
  if (index === 0) return '매튜 헨리의 영어 원문입니다.';
  if (index === 1) return '두 번째 영어 원문입니다.';
  return '마지막 영어 원문입니다.';
}

function meaningForSpeech(value) {
  const parts = cleanText(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return `${meaningPhrase(cleanText(value))} 뜻입니다`;

  const lexical = parts[0];
  const grammar = parts.slice(1).join(' ');

  if (/명령/.test(grammar)) return `${meaningPhrase(lexical)} 뜻의 명령형 동사입니다`;
  if (/완료/.test(grammar)) return `${meaningPhrase(lexical)} 뜻의 완료형 동사입니다`;
  if (/동사/.test(grammar)) return `${meaningPhrase(lexical)} 뜻의 동사입니다`;
  if (/형용사/.test(grammar)) return `${meaningPhrase(lexical)} 뜻의 형용사입니다`;
  if (/복수형.*단수 의미|단수 의미/.test(grammar)) {
    return `${meaningPhrase(lexical)} 뜻의 명사이며, 복수형이지만 단수 의미로 쓰입니다`;
  }
  if (/명사/.test(grammar)) return `${meaningPhrase(lexical)} 뜻의 명사입니다`;

  return `${meaningPhrase(lexical)} 뜻으로, ${grammar}입니다`;
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

function meaningPhrase(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (text.endsWith('다')) return `“${text}”는`;
  return `“${text}”${hasFinalConsonant(text) ? '이라는' : '라는'}`;
}

function withObjectParticle(value) {
  const text = cleanText(value);
  return `${text}${hasFinalConsonant(text) ? '을' : '를'}`;
}

function withAndParticle(value, suffix = '') {
  const text = cleanText(value);
  return `${text}${hasFinalConsonant(text) ? '과' : '와'}${suffix}`;
}

function connectionSubjectForSpeech(value) {
  return cleanText(value)
    .replace(/^출애굽 시\s+/, '출애굽 때 ')
    .replace(/고센 땅 빛$/, '고센 땅의 빛');
}

function backgroundForSpeech(value) {
  const text = cleanText(value).replace(/^조로아스터 등과 구별$/, '조로아스터교 등과 구별');
  if (!text) return '';
  if (text.endsWith('구별')) return `${text}되는 배경이 있습니다.`;
  return `${text}${hasFinalConsonant(text) ? '이라는' : '라는'} 배경이 있습니다.`;
}

function intro({ args, data, title, bookName }) {
  return `${bookName} ${args.chapter}장 ${args.verse}절, ${title}입니다. 본문은 '${data.korean_text}'입니다.`;
}

function renderOriginalLanguage(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const term = termForSpeech(row.원어);
    const meaning = meaningForSpeech(row.의미_문법);
    const point = phraseAsPoint(row.설교포인트);
    lines.push(`${topicParticle(term)} ${meaning}. ${point}`);
  }

  const closingKey = `${ctx.args.chapter}:${ctx.args.verse}`;
  const closing = ORIGINAL_LANGUAGE_CLOSINGS[closingKey];
  if (closing) {
    lines.push('', closing);
  }

  return lines.join('\n');
}

function renderHistory(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${withObjectParticle(row.항목)} 생각해 볼 수 있습니다. ${backgroundForSpeech(row.내용)} 이 점은 ${withObjectParticle(row.목회적활용)} 생각하게 합니다.`);
  }

  return lines.join('\n');
}

function renderTheology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.교리}의 의미가 드러납니다. ${phraseAsPoint(row.설명)} 관련해서 ${scriptureRefForSpeech(row.관련구절)}을 함께 볼 수 있습니다.`);
  }

  return lines.join('\n');
}

function renderTypology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.구분}의 관점에서 보면, ${phraseAsConnection(row.내용)} 이것은 ${christConnectionForSpeech(row.그리스도연결)}`);
  }

  return lines.join('\n');
}

function renderMatthewHenry(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const englishOriginal = cleanText(row.영어원문);

    if (!englishOriginal) {
      console.warn(`[WARN] 매튜헨리 영어원문 필드가 없습니다: ${ctx.bookName} ${ctx.args.chapter}:${ctx.args.verse} row ${i + 1}`);
      lines.push(`매튜 헨리는 이 말씀을 이렇게 풀어 줍니다. ${sentence(row.한국어번역)} 여기서 핵심은 ${withObjectParticle(row.핵심통찰)} 보여 준다는 점입니다.`);
      continue;
    }

    lines.push(`${matthewHenryEnglishIntro(i)}
${englishOriginal}
${sentence(row.한국어번역)} 여기서 핵심은 ${withObjectParticle(row.핵심통찰)} 보여 준다는 점입니다.`);
  }

  return lines.join('\n');
}

function assertMatthewHenryEnglishIncluded({ dataKey, rows, text }) {
  for (let i = 0; i < rows.length; i++) {
    const englishOriginal = cleanText(rows[i].영어원문);

    if (englishOriginal && !text.includes(englishOriginal)) {
      throw new Error(`${dataKey}의 표5_매튜헨리 ${i + 1}번째 영어원문이 TTS txt에 포함되지 않았습니다.`);
    }
  }
}

function renderSermon(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const heading = cleanText(row.대지).replace(/^\d+대지:\s*/, '');
    if (heading === '제목') {
      lines.push(`설교 제목은 ${sentence(row.내용).replace(/\.$/, '')}입니다. 적용 예로는 ${withObjectParticle(row.예화_적용)} 들 수 있습니다.`);
    } else if (heading === '서론') {
      lines.push(`서론에서는 ${withObjectParticle(row.내용)} 이야기합니다. 적용 예로는 ${withObjectParticle(row.예화_적용)} 들 수 있습니다.`);
    } else if (heading === '결론') {
      lines.push(`결론에서는 ${withObjectParticle(row.내용)} 메시지로 전합니다. 적용 예로는 ${withObjectParticle(row.예화_적용)} 들 수 있습니다.`);
    } else {
      lines.push(`${heading}입니다. ${phraseAsPoint(row.내용)} 적용 예로는 ${withObjectParticle(row.예화_적용)} 들 수 있습니다.`);
    }
  }

  return lines.join('\n');
}

function renderHymn(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const hymnTitle = `'${row.제목}'`;
    lines.push(`새찬송가 ${row.새찬송가}, ${withObjectParticle(hymnTitle)} 함께 묵상할 수 있습니다. 이 찬송은 ${withObjectParticle(row.선정이유)} 떠올리게 한다는 점에서 본문과 연결됩니다.`);
  }

  return lines.join('\n');
}

function renderCounseling(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${row.상황}에게 이 말씀을 적용할 수 있습니다. 성경 원리는 ${withObjectParticle(row.성경원리)} 붙드는 것입니다. 실제 적용으로는 ${withObjectParticle(row.실제적용)} 제안할 수 있습니다.`);
  }

  return lines.join('\n');
}

function renderCrossReference(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    lines.push(`${scriptureRefForSpeech(row.구절)}은 ${row.구분}의 연결 구절입니다. 이 구절은 ${withObjectParticle(row.연결점)} 보여 준다는 점에서 본문과 연결됩니다.`);
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

    if (item.type === 'matthew-henry') {
      assertMatthewHenryEnglishIncluded({ dataKey, rows, text });
    }

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
