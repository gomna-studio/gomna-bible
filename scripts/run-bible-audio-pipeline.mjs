import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const OLD_TESTAMENT_JS_PATH = path.join(ROOT, 'old_testament.js');
const REPORT_DIR = path.join(ROOT, 'reports', 'bible-audio-pipeline');

const PIPELINE_VERSION = '2.0.0';

const BOOKS = {
  genesis: {
    book: '창세기',
    testamentVariable: 'oldTestamentData',
  },
};

const STORAGE = {
  localBaseDirectory: path.join(ROOT, 'audio', 'v1'),
  r2Bucket: 'gomna-bible-audio-prod',
  r2KeyBase: 'bible/ko/gae/genesis',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
  uploadMode: 'remote-only',
};

const AUDIO_TYPE = 'bible';

function usage() {
  console.error('Usage: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --dry-run');
  console.error('Optional: --from-verse 1 --to-verse 26');
  console.error('Default mode: --dry-run');
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
    dryRun: true,
    write: false,
  };

  let dryRunExplicit = false;
  let writeExplicit = false;

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
    } else if (arg === '--language' || arg === '--locale') {
      args.language = argv[++i];
    } else if (arg === '--voice') {
      args.voicePreset = argv[++i];
    } else if (arg === '--overwrite') {
      args.overwrite = true;
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
      usage();
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (dryRunExplicit && writeExplicit) {
    throw new Error('--dry-run과 --write는 동시에 사용할 수 없습니다.');
  }

  if (!args.bookId || !args.chapter || !args.language || !args.voicePreset) {
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

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
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

function readGenesisChapter({ bookId, chapter }) {
  const bookConfig = BOOKS[bookId];
  const oldTestamentJs = fs.readFileSync(OLD_TESTAMENT_JS_PATH, 'utf8');
  const testamentData = extractJsonObject(oldTestamentJs, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error('old_testament.js oldTestamentData에서 창세기를 찾지 못했습니다.');
  }

  const chapterData = bookData.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`old_testament.js oldTestamentData에서 창세기 ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData;
}

function resolveVerseRange(args, chapterData) {
  const verseNumbers = chapterData.verses
    .map((verse) => verse.verse)
    .filter((verse) => Number.isInteger(verse) && verse >= 1)
    .sort((a, b) => a - b);

  if (!verseNumbers.length) {
    throw new Error(`창세기 ${args.chapter}장에 유효한 절이 없습니다.`);
  }

  const minVerse = verseNumbers[0];
  const maxVerse = verseNumbers[verseNumbers.length - 1];
  const fromVerse = args.fromVerse == null ? minVerse : args.fromVerse;
  const toVerse = args.toVerse == null ? maxVerse : args.toVerse;

  if (fromVerse < minVerse || toVerse > maxVerse) {
    throw new Error(`절 범위가 창세기 ${args.chapter}장 유효 범위(${minVerse}~${maxVerse})를 벗어났습니다.`);
  }

  const verses = chapterData.verses
    .filter((verse) => verse.verse >= fromVerse && verse.verse <= toVerse)
    .map((verse) => {
      const text = String(verse.text || '').trim();

      if (!text) {
        throw new Error(`창세기 ${args.chapter}장 ${verse.verse}절 본문이 비어 있습니다.`);
      }

      return {
        chapter: args.chapter,
        verse: verse.verse,
        preview: text,
      };
    });

  if (!verses.length) {
    throw new Error(`창세기 ${args.chapter}장 ${fromVerse}~${toVerse}절 대상이 없습니다.`);
  }

  return {
    fromVerse,
    toVerse,
    verseCount: verses.length,
    chapterVerseCount: verseNumbers.length,
    verses,
  };
}

function buildLocalFileName(voicePreset) {
  return `bible-${voicePreset}.mp3`;
}

function buildAudioId(bookId, chapter, verse) {
  return `${bookId}.${pad3(chapter)}.${pad3(verse)}.${AUDIO_TYPE}`;
}

function buildLocalRelativePath({ language, bookId, chapter, verse, voicePreset }) {
  return path.posix.join(
    'audio',
    'v1',
    language,
    bookId,
    pad3(chapter),
    pad3(verse),
    buildLocalFileName(voicePreset),
  );
}

function buildR2Key(chapter, verse) {
  return `${STORAGE.r2KeyBase}/${pad3(chapter)}/${pad3(verse)}.mp3`;
}

function buildPublicUrl(chapter, verse) {
  return `${STORAGE.publicBaseUrl}/${buildR2Key(chapter, verse)}`;
}

function inspectLocalFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const exists = fs.existsSync(absolutePath);

  if (!exists) {
    return {
      localRelativePath: relativePath,
      localExists: false,
      localFileSize: 0,
      localZeroByte: false,
    };
  }

  const fileSize = fs.statSync(absolutePath).size;

  return {
    localRelativePath: relativePath,
    localExists: true,
    localFileSize: fileSize,
    localZeroByte: fileSize === 0,
  };
}

function buildPipelineItem({ args, verseData }) {
  const localRelativePath = buildLocalRelativePath({
    language: args.language,
    bookId: args.bookId,
    chapter: verseData.chapter,
    verse: verseData.verse,
    voicePreset: args.voicePreset,
  });
  const localInfo = inspectLocalFile(localRelativePath);
  const r2Key = buildR2Key(verseData.chapter, verseData.verse);
  const exists = localInfo.localExists;
  const zeroByte = localInfo.localZeroByte;
  const validLocal = exists && !zeroByte;

  let audioAction = 'generate-planned';
  if (validLocal && !args.overwrite) {
    audioAction = 'skip-existing';
  } else if (validLocal && args.overwrite) {
    audioAction = 'regenerate-planned';
  }

  return {
    id: buildAudioId(args.bookId, verseData.chapter, verseData.verse),
    chapter: verseData.chapter,
    verse: verseData.verse,
    preview: verseData.preview,
    localRelativePath: localInfo.localRelativePath,
    localExists: localInfo.localExists,
    localFileSize: localInfo.localFileSize,
    localZeroByte: localInfo.localZeroByte,
    r2Key,
    publicUrl: buildPublicUrl(verseData.chapter, verseData.verse),
    actions: {
      audio: audioAction,
      upload: validLocal ? 'upload-planned' : 'pending-local',
      verified: 'pending',
      manifest: 'draft-planned',
    },
  };
}

function buildSummary(items, args) {
  const existingLocalCount = items.filter((item) => item.localExists).length;
  const missingLocalCount = items.length - existingLocalCount;
  const zeroByteLocalCount = items.filter((item) => item.localZeroByte).length;
  const plannedGenerationCount = items.filter((item) => (
    item.actions.audio === 'generate-planned' || item.actions.audio === 'regenerate-planned'
  )).length;
  const skippedExistingCount = items.filter((item) => item.actions.audio === 'skip-existing').length;
  const plannedUploadCount = items.filter((item) => item.actions.upload === 'upload-planned').length;

  return {
    targetCount: items.length,
    existingLocalCount,
    missingLocalCount,
    zeroByteLocalCount,
    plannedGenerationCount,
    skippedExistingCount,
    plannedUploadCount,
    plannedVerifiedAppendCount: 0,
    plannedManifestPublishCount: 0,
    fileModified: false,
    mp3Generated: false,
    uploadPerformed: false,
    manifestWritten: false,
    verifiedListModified: false,
    overwrite: args.overwrite,
  };
}

function buildStages(summary) {
  const validateStatus = summary.zeroByteLocalCount > 0 ? 'fail' : 'planned';

  return [
    {
      stage: 'prepare',
      status: 'pass',
      executed: true,
    },
    {
      stage: 'audio',
      status: 'planned',
      executed: false,
      reason: 'phase-1-dry-run-only',
      plannedGenerationCount: summary.plannedGenerationCount,
      skippedExistingCount: summary.skippedExistingCount,
    },
    {
      stage: 'validate-local',
      status: validateStatus,
      executed: true,
      expectedCount: summary.targetCount,
      actualCount: summary.existingLocalCount,
      zeroByteCount: summary.zeroByteLocalCount,
    },
    {
      stage: 'upload',
      status: summary.plannedUploadCount > 0 ? 'planned' : 'blocked',
      executed: false,
      reason: summary.plannedUploadCount > 0 ? 'phase-1-dry-run-only' : 'depends-on-local-files',
      uploadMode: STORAGE.uploadMode,
    },
    {
      stage: 'verified',
      status: 'blocked',
      executed: false,
      reason: 'phase-1-dry-run-only',
    },
    {
      stage: 'manifest',
      status: 'planned',
      executed: false,
      reason: 'phase-1-dry-run-only',
    },
  ];
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const chapter3 = pad3(report.target.chapter);
  const fileName = `${timestampForFileName(new Date(report.finishedAt))}-${report.target.bookId}-${chapter3}-dry-run.json`;
  const reportPath = path.join(REPORT_DIR, fileName);

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return toRelativePath(reportPath);
}

function main() {
  if (process.argv.slice(2).length === 0) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));

  if (args.write) {
    throw new Error('이번 1차 구현에서는 --write를 지원하지 않습니다. --dry-run만 사용하세요.');
  }

  const chapterData = readGenesisChapter(args);
  const range = resolveVerseRange(args, chapterData);
  const items = range.verses.map((verseData) => buildPipelineItem({ args, verseData }));
  const summary = buildSummary(items, args);
  const finishedAt = new Date().toISOString();

  const report = {
    mode: 'dry-run',
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
    finishedAt,
    target: {
      bookId: args.bookId,
      book: BOOKS[args.bookId].book,
      chapter: args.chapter,
      fromVerse: range.fromVerse,
      toVerse: range.toVerse,
      verseCount: range.verseCount,
      chapterVerseCount: range.chapterVerseCount,
      language: args.language,
      voicePreset: args.voicePreset,
      overwrite: args.overwrite,
    },
    source: {
      textSource: toRelativePath(OLD_TESTAMENT_JS_PATH),
      textVariable: BOOKS[args.bookId].testamentVariable,
    },
    storage: {
      localBase: path.posix.join('audio', 'v1', args.language, args.bookId),
      localFileName: buildLocalFileName(args.voicePreset),
      r2Bucket: STORAGE.r2Bucket,
      r2KeyBase: STORAGE.r2KeyBase,
      publicBaseUrl: STORAGE.publicBaseUrl,
      uploadMode: STORAGE.uploadMode,
    },
    summary,
    stages: buildStages(summary),
    items,
    safety: {
      writeAllowed: false,
      approvedTarget: args.bookId === 'genesis' && args.chapter === 4,
      blockers: [],
    },
  };

  report.reportPath = writeReport(report);

  console.log(JSON.stringify(report, null, 2));
}

main();
