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

const AUDIO_TYPE = {
  type: 'bible',
  fileNamePrefix: 'bible',
};

function usage() {
  console.error('Usage: node scripts/generate-bible-audio-batch.mjs --book genesis --chapter 1 --language ko-KR --voice calm --dry-run');
  console.error('Optional: --from-verse 1 --to-verse 2');
  console.error('Optional dry-run planning flag: --overwrite');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    fromVerse: null,
    toVerse: null,
    language: null,
    voicePreset: null,
    overwrite: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--language') {
      args.language = argv[++i];
    } else if (arg === '--voice') {
      args.voicePreset = argv[++i];
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--write') {
      throw new Error('--write는 아직 구현하지 않습니다. 이번 단계는 --dry-run 전용입니다.');
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !args.chapter || !args.language || !args.voicePreset || !args.dryRun) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book id입니다: ${args.bookId}`);
  }

  if (!Number.isInteger(args.chapter) || args.chapter < 1) {
    throw new Error(`유효하지 않은 chapter 값입니다: ${args.chapter}`);
  }

  if (args.fromVerse !== null && (!Number.isInteger(args.fromVerse) || args.fromVerse < 1)) {
    throw new Error(`유효하지 않은 from-verse 값입니다: ${args.fromVerse}`);
  }

  if (args.toVerse !== null && (!Number.isInteger(args.toVerse) || args.toVerse < 1)) {
    throw new Error(`유효하지 않은 to-verse 값입니다: ${args.toVerse}`);
  }

  if (args.fromVerse !== null && args.toVerse !== null && args.fromVerse > args.toVerse) {
    throw new Error('--from-verse 값은 --to-verse 값보다 클 수 없습니다.');
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
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

function readChapterVerses({ bookId, chapter, language, fromVerse, toVerse }) {
  const bookConfig = BOOKS[bookId];
  const readerHtml = fs.readFileSync(READER_HTML_PATH, 'utf8');
  const testamentData = extractJsonObject(readerHtml, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error(`${bookConfig.book} 데이터를 찾지 못했습니다.`);
  }

  const chapterData = bookData.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`${bookConfig.book} ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData.verses
    .filter((verse) => fromVerse === null || verse.verse >= fromVerse)
    .filter((verse) => toVerse === null || verse.verse <= toVerse)
    .map((verse) => {
      const text = String(verse.text || '').trim();

      if (!text) {
        throw new Error(`${bookConfig.book} ${chapter}장 ${verse.verse}절 본문이 비어 있습니다.`);
      }

      return {
        language,
        book: bookConfig.book,
        bookId,
        chapter,
        verse: verse.verse,
        text,
      };
    });
}

function buildPlannedAudio(verse, voicePreset, overwrite) {
  const chapter3 = pad3(verse.chapter);
  const verse3 = pad3(verse.verse);
  const audioId = `${verse.bookId}.${chapter3}.${verse3}.${AUDIO_TYPE.type}`;
  const fileName = `${AUDIO_TYPE.fileNamePrefix}-${voicePreset}.mp3`;
  const filePath = `/audio/v1/${verse.language}/${verse.bookId}/${chapter3}/${verse3}/${fileName}`;
  const localFilePath = path.join(
    ROOT,
    'audio',
    'v1',
    verse.language,
    verse.bookId,
    chapter3,
    verse3,
    fileName,
  );
  const tmpLocalFilePath = `${localFilePath}.tmp`;
  const exists = fs.existsSync(localFilePath);
  const action = exists && !overwrite ? 'skip-existing' : 'generate-planned';

  return {
    id: audioId,
    language: verse.language,
    book: verse.book,
    bookId: verse.bookId,
    chapter: verse.chapter,
    verse: verse.verse,
    voicePreset,
    text: verse.text,
    filePath,
    localFilePath: path.relative(ROOT, localFilePath),
    tmpLocalFilePath: path.relative(ROOT, tmpLocalFilePath),
    exists,
    action,
    wouldCallTts: action === 'generate-planned',
    wouldWriteFile: false,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verses = readChapterVerses(args);
  const plannedAudios = verses.map((verse) => buildPlannedAudio(verse, args.voicePreset, args.overwrite));
  const skipped = plannedAudios.filter((item) => item.action === 'skip-existing');
  const plannedForGeneration = plannedAudios.filter((item) => item.action === 'generate-planned');

  console.log(JSON.stringify({
    mode: 'dry-run',
    fileModified: false,
    mp3Generated: false,
    ttsApiCalled: false,
    source: path.relative(ROOT, READER_HTML_PATH),
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    language: args.language,
    voicePreset: args.voicePreset,
    overwrite: args.overwrite,
    skipExisting: !args.overwrite,
    targetCount: plannedAudios.length,
    plannedGenerationCount: plannedForGeneration.length,
    skippedExistingCount: skipped.length,
    tmpFilePolicy: 'write to .tmp first, then rename to .mp3 only after a successful TTS response in a future --write implementation',
    failureReportPath: `reports/audio-generation-${args.language}.json`,
    plannedAudios,
  }, null, 2));
}

main();
