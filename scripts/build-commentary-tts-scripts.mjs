import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { TESTAMENT_SOURCES } from './bible-book-registry.mjs';
import { normalizeCommentaryTableRows } from './lib/commentary-card-field-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const BOOKS = {
  genesis: {
    bookNameByLocale: {
      'ko-KR': '창세기',
    },
    commentaryDataPath: path.join(ROOT, 'gomna_data_genesis.js'),
  },
  exodus: {
    bookNameByLocale: {
      'ko-KR': '출애굽기',
    },
    commentaryDataPath: path.join(ROOT, 'gomna_data_exodus.js'),
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

// 같은 절의 성경 본문은 첫 유형에서만 1회 낭독하고, 나머지 8유형은 반복하지 않는다.
const VERSE_TEXT_INTRO_TYPE = COMMENTARY_TYPES[0].type;

const OLD_TESTAMENT_PATH = path.join(ROOT, TESTAMENT_SOURCES.oldTestamentData.fileName);

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

// 서론·결론 원본이 완결 문장인 행이 있어, 목적격 조사를 붙이면 종결 뒤에 조사가 온다.
// '자'로 끝나는 명사(여호와의 사자 등)는 조사가 정상이므로 문장 판정에서 뺀다.
const SENTENCE_TAIL_PATTERN = /(입니다|습니다|니다|습니까|십니까|니까|나요|네요|지요|죠|시오|소서|다|라|는가|은가|인가|던가)$/;
const NOUN_TAILS_ENDING_IN_JA = new Set([
  '사자', '동반자', '상속자', '신자', '남자', '여자', '부자', '의자', '장자', '목자', '저자', '제자', '학자',
]);

function isCompleteSentence(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (/[.!?。！？]\s*$/.test(text)) return true;
  if (/[.!?。！？]\s+\S/.test(text)) return true;
  if (text.endsWith('자')) return !NOUN_TAILS_ENDING_IN_JA.has(text.split(/\s+/).pop());
  return SENTENCE_TAIL_PATTERN.test(text);
}

// 부사격·보조사로 끝난 생략형 값에 목적격 조사를 붙이면 조사가 겹친다.
// '통로'처럼 조사 글자가 명사 일부인 경우를 배제하려고 어간 음절 수로 가른다.
function syllableCount(value) {
  return (String(value || '').match(/[가-힣]/g) || []).length;
}

function endsWithAdverbialParticle(value) {
  const token = cleanText(value).split(/\s+/).pop() || '';
  if (/으로$/.test(token)) return syllableCount(token) >= 3;
  if (/대로$/.test(token)) return syllableCount(token.slice(0, -2)) >= 2;
  if (/(까지|부터|에게|처럼|같이|만큼|조차|밖에|에서)$/.test(token)) return syllableCount(token.slice(0, -2)) >= 1;
  if (/로$/.test(token)) return syllableCount(token.slice(0, -1)) >= 2;
  return false;
}

function withPeriod(value) {
  const text = cleanText(value);
  if (!text) return '';
  return /[.!?。！？]$/.test(text) ? text : `${text}.`;
}

// 대지·제목 원본이 이미 '…합니다'처럼 종결형인 행이 있어 '입니다'를 덧붙이면 종결이 겹친다.
function withDeclarativeEnding(value) {
  const text = String(value ?? '');
  if (!text) return text;
  return /(입니다|습니다|합니다|됩니다|십니다)$/.test(text) ? `${text}.` : `${text}입니다.`;
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
  // 값이 이미 '연결'로 끝나면 같은 뜻의 연결어를 덧붙이지 않고 종결만 맞춘다.
  if (/연결$/.test(text)) {
    return /(과|와|에게|께|으로|로)\s*연결$/.test(text) ? `${text}됩니다.` : `${text}입니다.`;
  }
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

const MATTHEW_HENRY_ORDINALS = ['첫 번째', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째', '여덟 번째', '아홉 번째', '열 번째'];

function matthewHenryEnglishIntro(index, total) {
  if (index === 0) return '매튜 헨리의 영어 원문입니다.';
  if (index === 1) return '두 번째 영어 원문입니다.';
  if (index === total - 1) return '마지막 영어 원문입니다.';
  const ordinal = MATTHEW_HENRY_ORDINALS[index];
  if (!ordinal) {
    throw new Error(`매튜헨리 영어 원문 순서를 ${index + 1}번째까지 읽을 수 없습니다.`);
  }
  return `${ordinal} 영어 원문입니다.`;
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

// 창세기 일부 절은 같은 표를 전혀 다른 필드 구성으로 저장해 두었다.
// 정규 슬롯에 억지로 끼워 넣으면 의미가 뒤틀리므로, 존재하는 필드를 그대로 낭독한다.
function altRow(row, fields) {
  const values = fields.map((field) => cleanText(row[field]));
  if (values.some((value) => !value)) return null;
  return values;
}

// 대체 스키마 값은 서술형·명령형·명사형이 섞여 있다. 값은 고치지 않고 종결만 붙인다.
function altSentence(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (/[.!?。！？]$/.test(text)) return text;

  const reference = text.match(/\s*\([^()]*\)$/);
  const head = reference ? text.slice(0, text.length - reference[0].length) : text;
  const tail = reference ? reference[0] : '';
  const bare = head.replace(/['"’”\s]+$/, '');

  // '통치자'처럼 명사로 끝나는 값과 겹치므로 청유형 '-자'는 종결로 보지 않는다.
  if (/(다|라|오|요|죠|까|네|군|랴)$/.test(bare)) return `${head}${tail}.`;
  // '~하셨듯이'처럼 연결어미로 끝나는 값에는 서술격을 붙일 수 없다.
  if (/(듯이|처럼|같이|라도|면서|으며|하며|이며|든지|거나|다가)$/.test(bare)) return `${head}${tail}.`;
  // 동사에서 파생된 명사형(-ㅁ/-음)은 서술격도 '합니다'도 붙일 수 없다.
  if ((lastHangulSyllable(bare).charCodeAt(0) - 0xac00) % 28 === 16) return `${head}${tail}.`;
  // '~을 강조'처럼 목적격·주격 뒤에 오는 서술성 명사는 서술격을 붙일 수 없다.
  if (/[을를]\s+[가-힣]{2,3}$/.test(bare)) return `${head}${tail}합니다.`;
  if (/[이가]\s+[가-힣]{2,3}$/.test(bare)) return `${head}${tail}.`;
  return `${head}${tail}입니다.`;
}

function backgroundForSpeech(value) {
  const text = cleanText(value).replace(/^조로아스터 등과 구별$/, '조로아스터교 등과 구별');
  if (!text) return '';
  if (text.endsWith('구별')) return `${text}되는 배경이 있습니다.`;
  return `${text}${hasFinalConsonant(text) ? '이라는' : '라는'} 배경이 있습니다.`;
}

// 성경 본문 원천은 Reader와 동일한 개역한글(old_testament.js) 하나뿐이다.
// gomna_data_*.js는 말씀풀이 body 전용이며 절 본문 낭독에 쓰지 않는다.
const oldTestamentVerseIndexByBook = new Map();
let oldTestamentBooks = null;

function loadOldTestamentBooks() {
  if (oldTestamentBooks) return oldTestamentBooks;

  const source = fs.readFileSync(OLD_TESTAMENT_PATH, 'utf8');
  const sandbox = {
    window: {},
    module: { exports: {} },
    document: { addEventListener() {} },
    console,
  };
  vm.runInNewContext(source, sandbox, {
    filename: toRelativePath(OLD_TESTAMENT_PATH),
  });

  const books = sandbox.oldTestamentData?.books;
  if (!Array.isArray(books) || books.length === 0) {
    throw new Error(`${TESTAMENT_SOURCES.oldTestamentData.fileName}에서 oldTestamentData.books를 읽지 못했습니다.`);
  }

  oldTestamentBooks = books;
  return books;
}

function loadOldTestamentVerseIndex(bookName) {
  const cached = oldTestamentVerseIndexByBook.get(bookName);
  if (cached) return cached;

  const book = loadOldTestamentBooks().find((item) => item.name === bookName);
  if (!book || !Array.isArray(book.chapters)) {
    throw new Error(`${TESTAMENT_SOURCES.oldTestamentData.fileName}에 ${bookName} 본문이 없습니다.`);
  }

  const index = new Map();
  for (const chapter of book.chapters) {
    if (!Array.isArray(chapter.verses)) {
      throw new Error(`${bookName} ${chapter.chapter}장의 verses 구조가 올바르지 않습니다.`);
    }
    for (const verse of chapter.verses) {
      index.set(`${chapter.chapter}_${verse.verse}`, verse.text);
    }
  }

  oldTestamentVerseIndexByBook.set(bookName, index);
  return index;
}

function resolveVerseText({ args, bookName }) {
  const verseKey = `${args.chapter}_${args.verse}`;
  const verseText = loadOldTestamentVerseIndex(bookName).get(verseKey);

  if (typeof verseText !== 'string' || !verseText.trim()) {
    throw new Error(
      `개역한글 본문을 찾지 못했습니다: ${TESTAMENT_SOURCES.oldTestamentData.fileName} ${bookName} ${verseKey}`,
    );
  }

  // 개역한글 문구는 그대로 두고 공백만 정규화한다.
  return verseText.replace(/\s+/g, ' ').trim();
}

function intro({ args, title, bookName, type }) {
  const heading = `${bookName} ${args.chapter}장 ${args.verse}절, ${title}입니다.`;
  if (type !== VERSE_TEXT_INTRO_TYPE) return heading;
  return `${heading} 본문은 '${resolveVerseText({ args, bookName })}'입니다.`;
}

function renderOriginalLanguage(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    // 히브리어 글자는 정규 스키마에서도 낭독하지 않고 음역만 읽는다.
    const alt = altRow(row, ['음역', '뜻', '문법', '설명']);
    if (alt) {
      const [transliteration, meaning, grammar, explanation] = alt;
      lines.push(`${topicParticle(transliteration)} ${meaningPhrase(meaning)} 뜻이고, 문법으로는 ${altSentence(grammar)} ${altSentence(explanation)}`);
      continue;
    }

    const term = termForSpeech(row.원어);
    const meaning = meaningForSpeech(row.의미_문법);
    const point = phraseAsPoint(row.설교포인트);
    // 음역이 없는 행은 낭독할 낱말이 없다. 없는 음역을 만들지 않고 조사만 뺀다.
    lines.push(term ? `${topicParticle(term)} ${meaning}. ${point}` : `${meaning}. ${point}`);
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
    const alt = altRow(row, ['시대적상황', '지리적배경', '문화적맥락', '고고학적발견']);
    if (alt) {
      const [era, geography, culture, archaeology] = alt;
      lines.push(`시대적으로는 ${altSentence(era)} 지리적으로는 ${altSentence(geography)} 문화적으로는 ${altSentence(culture)} 고고학적으로는 ${altSentence(archaeology)}`);
      continue;
    }

    lines.push(`${withObjectParticle(row.항목)} 생각해 볼 수 있습니다. ${backgroundForSpeech(row.내용)} 이 점은 ${withObjectParticle(row.목회적활용)} 생각하게 합니다.`);
  }

  return lines.join('\n');
}

function renderTheology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const alt = altRow(row, ['핵심주제', '하나님의속성', '구속사적의미', '교리적가르침']);
    if (alt) {
      const [topic, attribute, redemptive, doctrine] = alt;
      lines.push(`핵심 주제는 ${altSentence(topic)} 여기서 하나님의 속성이 드러납니다. ${altSentence(attribute)} 구속사적으로는 ${altSentence(redemptive)} 교리적으로는 ${altSentence(doctrine)}`);
      continue;
    }

    // 교리 값이 이미 '의미'·'뜻'으로 끝나는 행이 있어 고정 문구와 겹친다.
    const doctrine = String(row.교리 ?? '');
    const doctrineLead = /(의미|뜻)\s*$/.test(doctrine)
      ? `${doctrine}${hasFinalConsonant(doctrine) ? '이' : '가'} 드러납니다.`
      : `${doctrine}의 의미가 드러납니다.`;
    lines.push(`${doctrineLead} ${phraseAsPoint(row.설명)} 관련해서 ${scriptureRefForSpeech(row.관련구절)}을 함께 볼 수 있습니다.`);
  }

  return lines.join('\n');
}

function renderTypology(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const alt = altRow(row, ['구약예표', '신약성취', '그리스도연결', '적용']);
    if (alt) {
      const [shadow, fulfillment, connection, application] = alt;
      lines.push(`구약의 예표로는 ${altSentence(shadow)} 신약의 성취는 ${altSentence(fulfillment)} 이것은 ${altSentence(connection)} 적용하면 이렇습니다. ${altSentence(application)}`);
      continue;
    }

    lines.push(`${row.구분}의 관점에서 보면, ${phraseAsConnection(row.내용)} 이것은 ${christConnectionForSpeech(row.그리스도연결)}`);
  }

  return lines.join('\n');
}

function renderMatthewHenry(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const alt = altRow(row, ['핵심해석', '영적교훈', '실천적적용']);
    if (alt) {
      const [reading, lesson, practice] = alt;
      lines.push(`매튜 헨리는 이 말씀을 이렇게 풀어 줍니다. ${altSentence(reading)} 영적 교훈은 이렇습니다. ${altSentence(lesson)} 실천적 적용은 이렇습니다. ${altSentence(practice)}`);
      continue;
    }

    const englishOriginal = cleanText(row.영어원문);

    if (!englishOriginal) {
      console.warn(`[WARN] 매튜헨리 영어원문 필드가 없습니다: ${ctx.bookName} ${ctx.args.chapter}:${ctx.args.verse} row ${i + 1}`);
      lines.push(`매튜 헨리는 이 말씀을 이렇게 풀어 줍니다. ${sentence(row.한국어번역)} 여기서 핵심은 ${withObjectParticle(row.핵심통찰)} 보여 준다는 점입니다.`);
      continue;
    }

    lines.push(`${matthewHenryEnglishIntro(i, rows.length)}
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
    const alt = altRow(row, ['설교제목', '설교포인트', '예화', '적용질문']);
    if (alt) {
      const [title, points, illustration, question] = alt;
      lines.push(`설교 제목은 ${altSentence(title)} 설교 포인트는 이렇습니다. ${altSentence(points)} 예화로는 ${altSentence(illustration)} 적용 질문은 이렇습니다. ${altSentence(question)}`);
      continue;
    }

    const heading = cleanText(row.대지).replace(/^\d+대지:\s*/, '');
    // 예화_적용 원본이 없는 행이 있어, 없는 값을 지어내지 않고 해당 절만 생략한다.
    const example = cleanText(row.예화_적용)
      ? ` 적용 예로는 ${withObjectParticle(row.예화_적용)} 들 수 있습니다.`
      : '';

    if (heading === '제목') {
      lines.push(`설교 제목은 ${withDeclarativeEnding(sentence(row.내용).replace(/\.$/, ''))}${example}`);
    } else if (heading === '서론') {
      lines.push(isCompleteSentence(row.내용) || endsWithAdverbialParticle(row.내용)
        ? `서론에서는 이렇게 말합니다. ${withPeriod(row.내용)}${example}`
        : `서론에서는 ${withObjectParticle(row.내용)} 이야기합니다.${example}`);
    } else if (heading === '결론') {
      lines.push(isCompleteSentence(row.내용) || endsWithAdverbialParticle(row.내용)
        ? `결론에서는 이렇게 전합니다. ${withPeriod(row.내용)}${example}`
        : `결론에서는 ${withObjectParticle(row.내용)} 메시지로 전합니다.${example}`);
    } else {
      lines.push(`${withDeclarativeEnding(heading)} ${phraseAsPoint(row.내용)}${example}`);
    }
  }

  return lines.join('\n');
}

function renderHymn(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const hymnTitle = `'${row.제목}'`;
    // 찬송가 번호를 '찬송가 338장'처럼 라벨까지 담아 둔 행이 있어 낭독 시 라벨이 겹친다.
    const hymnNumber = String(row.새찬송가).replace(/^(새찬송가|찬송가)\s+/, '');
    lines.push(`새찬송가 ${hymnNumber}, ${withObjectParticle(hymnTitle)} 함께 묵상할 수 있습니다. 이 찬송은 ${withObjectParticle(row.선정이유)} 떠올리게 한다는 점에서 본문과 연결됩니다.`);
  }

  return lines.join('\n');
}

function renderCounseling(ctx, rows) {
  const lines = [intro(ctx), ''];

  for (const row of rows) {
    const alt = altRow(row, ['상담주제', '성경적원리', '실제적조언', '위로의말씀']);
    if (alt) {
      const [topic, principle, advice, comfort] = alt;
      lines.push(`상담 주제는 ${altSentence(topic)} 성경적 원리는 이렇습니다. ${altSentence(principle)} 실제적인 조언은 이렇습니다. ${altSentence(advice)} 위로의 말씀을 전합니다. ${altSentence(comfort)}`);
      continue;
    }

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
    const sourceRows = data[item.tableKey];
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
      throw new Error(`${dataKey}의 ${item.tableKey} 데이터가 비어 있습니다.`);
    }

    // 일부 절은 같은 내용을 다른 필드명으로 저장해 두었다. 값은 옮기기만 하고 고치지 않는다.
    // 대체 스키마 전용 렌더링이 원본 필드를 그대로 봐야 하므로 원본 키도 함께 남긴다.
    const normalizedRows = normalizeCommentaryTableRows(item.tableKey, args.locale, sourceRows);
    const rows = sourceRows.map((sourceRow, index) => ({ ...sourceRow, ...normalizedRows[index] }));

    const text = `${RENDERERS[item.type]({
      args, data, title: item.title, bookName, type: item.type,
    }, rows).trim()}\n`;
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
