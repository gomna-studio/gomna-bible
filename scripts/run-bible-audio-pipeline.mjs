import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const OLD_TESTAMENT_JS_PATH = path.join(ROOT, 'old_testament.js');
const REPORT_DIR = path.join(ROOT, 'reports', 'bible-audio-pipeline');
const GENERATE_SCRIPT = path.join(ROOT, 'scripts', 'generate-bible-audio-batch.mjs');

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
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --stage audio --write');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --from-verse 1 --to-verse 1 --voice calm --language ko-KR --stage sample --write --overwrite');
  console.error('Optional: --from-verse 1 --to-verse 26 --overwrite');
  console.error('Default mode: --dry-run');
}

const ALLOWED_STAGES = ['audio', 'sample'];

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    fromVerse: null,
    toVerse: null,
    language: null,
    voicePreset: null,
    stage: null,
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
    } else if (arg === '--stage') {
      args.stage = argv[++i];
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

  if (args.write && !ALLOWED_STAGES.includes(args.stage)) {
    throw new Error('--write는 --stage audio 또는 --stage sample과 함께 사용해야 합니다.');
  }

  if (args.stage && !ALLOWED_STAGES.includes(args.stage)) {
    throw new Error(`지원하지 않는 stage입니다: ${args.stage}`);
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

function resolveExecutionRange(args, chapterData) {
  if (args.stage === 'sample' && args.fromVerse === null && args.toVerse === null) {
    return resolveVerseRange(
      {
        ...args,
        fromVerse: 1,
        toVerse: 1,
      },
      chapterData,
    );
  }

  return resolveVerseRange(args, chapterData);
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

function buildSummary(items, args, execution = {}) {
  const existingLocalCount = items.filter((item) => item.localExists).length;
  const missingLocalCount = items.length - existingLocalCount;
  const zeroByteLocalCount = items.filter((item) => item.localZeroByte).length;
  const plannedGenerationCount = items.filter((item) => (
    item.actions.audio === 'generate-planned' || item.actions.audio === 'regenerate-planned'
  )).length;
  const skippedExistingCount = items.filter((item) => item.actions.audio === 'skip-existing').length;
  const plannedUploadCount = items.filter((item) => item.actions.upload === 'upload-planned').length;
  const generatedCount = execution.generatedCount || 0;
  const failedGenerationCount = execution.failedCount || 0;

  return {
    targetCount: items.length,
    existingLocalCount,
    missingLocalCount,
    zeroByteLocalCount,
    plannedGenerationCount,
    skippedExistingCount,
    plannedUploadCount,
    generatedCount,
    failedGenerationCount,
    plannedVerifiedAppendCount: 0,
    plannedManifestPublishCount: 0,
    fileModified: generatedCount > 0,
    mp3Generated: generatedCount > 0,
    uploadPerformed: false,
    manifestWritten: false,
    verifiedListModified: false,
    overwrite: args.overwrite,
    validateLocalPass: execution.validateLocalPass ?? null,
  };
}

function buildPipelineTargetKey(args, range) {
  return `${args.language}:${args.bookId}:${args.chapter}:${range.fromVerse}-${range.toVerse}`;
}

function buildPipelineEnv(args, range) {
  return {
    GOMNA_BIBLE_PIPELINE: '1',
    GOMNA_BIBLE_ALLOWED_TARGET: buildPipelineTargetKey(args, range),
  };
}

function buildAudioBatchCommand(args, range) {
  const scriptArgs = [
    path.relative(ROOT, GENERATE_SCRIPT),
    '--book',
    args.bookId,
    '--chapter',
    String(args.chapter),
    '--from-verse',
    String(range.fromVerse),
    '--to-verse',
    String(range.toVerse),
    '--language',
    args.language,
    '--voice',
    args.voicePreset,
    '--write',
  ];

  if (args.overwrite) {
    scriptArgs.push('--overwrite');
  }

  return {
    command: 'node',
    args: scriptArgs,
    display: ['node', ...scriptArgs].join(' '),
    env: buildPipelineEnv(args, range),
  };
}

function runGenerationStage(args, range, stageName) {
  const commandSpec = buildAudioBatchCommand(args, range);
  const startedAt = new Date().toISOString();
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...commandSpec.env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const finishedAt = new Date().toISOString();

  let parsedStdout = null;
  try {
    parsedStdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsedStdout = null;
  }

  return {
    stage: stageName,
    startedAt,
    finishedAt,
    command: commandSpec.display,
    env: commandSpec.env,
    exitCode: result.status,
    signal: result.signal,
    stderr: result.stderr,
    parsedStdout,
    generatedCount: parsedStdout?.generatedCount ?? 0,
    failedCount: parsedStdout?.failedCount ?? 0,
    skippedExistingCount: parsedStdout?.skippedExistingCount ?? 0,
  };
}

function runAudioStage(args, range) {
  return runGenerationStage(args, range, 'audio');
}

function runSampleStage(args, range) {
  return runGenerationStage(args, range, 'sample');
}

function refreshItems({ args, verses }) {
  return verses.map((verseData) => buildPipelineItem({ args, verseData }));
}

function validateLocalFiles(items) {
  const missingItems = items.filter((item) => !item.localExists);
  const zeroByteItems = items.filter((item) => item.localZeroByte);
  const pass = missingItems.length === 0 && zeroByteItems.length === 0;

  return {
    status: pass ? 'pass' : 'fail',
    pass,
    expectedCount: items.length,
    actualCount: items.length - missingItems.length,
    missingCount: missingItems.length,
    zeroByteCount: zeroByteItems.length,
    missingIds: missingItems.map((item) => item.id),
    zeroByteIds: zeroByteItems.map((item) => item.id),
  };
}

function applyPostAudioItemState(items, audioExecution) {
  return items.map((item) => {
    const localInfo = inspectLocalFile(item.localRelativePath);
    const validLocal = localInfo.localExists && !localInfo.localZeroByte;

    let audioAction = item.actions.audio;
    if (audioExecution?.exitCode === 0) {
      if (validLocal) {
        audioAction = item.actions.audio === 'skip-existing' ? 'skip-existing' : 'generated';
      } else if (item.actions.audio === 'generate-planned' || item.actions.audio === 'regenerate-planned') {
        audioAction = 'failed';
      }
    }

    return {
      ...item,
      localExists: localInfo.localExists,
      localFileSize: localInfo.localFileSize,
      localZeroByte: localInfo.localZeroByte,
      actions: {
        ...item.actions,
        audio: audioAction,
        upload: validLocal ? 'upload-planned' : 'pending-local',
      },
    };
  });
}

function buildStages({ summary, args, generationExecution, validateLocal }) {
  const generationExecuted = Boolean(generationExecution);
  const generationStatus = !generationExecuted
    ? 'planned'
    : generationExecution.exitCode === 0 && summary.failedGenerationCount === 0
      ? 'pass'
      : 'fail';

  const validateStatus = generationExecuted
    ? validateLocal.status
    : summary.zeroByteLocalCount > 0
      ? 'fail'
      : summary.existingLocalCount === summary.targetCount
        ? 'pass'
        : 'planned';

  const sampleExecuted = generationExecuted && args.stage === 'sample';
  const audioExecuted = generationExecuted && args.stage === 'audio';

  return [
    {
      stage: 'prepare',
      status: 'pass',
      executed: true,
    },
    {
      stage: 'sample',
      status: sampleExecuted ? generationStatus : 'planned',
      executed: sampleExecuted,
      reason: sampleExecuted ? null : args.stage === 'sample' && args.dryRun ? 'dry-run' : 'not-requested',
      plannedGenerationCount: summary.plannedGenerationCount,
      skippedExistingCount: summary.skippedExistingCount,
      generatedCount: sampleExecuted ? summary.generatedCount : 0,
      failedGenerationCount: sampleExecuted ? summary.failedGenerationCount : 0,
      command: sampleExecuted ? generationExecution?.command ?? null : null,
    },
    {
      stage: 'audio',
      status: audioExecuted ? generationStatus : 'planned',
      executed: audioExecuted,
      reason: audioExecuted ? null : args.dryRun ? 'dry-run' : 'not-requested',
      plannedGenerationCount: summary.plannedGenerationCount,
      skippedExistingCount: summary.skippedExistingCount,
      generatedCount: audioExecuted ? summary.generatedCount : 0,
      failedGenerationCount: audioExecuted ? summary.failedGenerationCount : 0,
      command: audioExecuted ? generationExecution?.command ?? null : null,
    },
    {
      stage: 'validate-local',
      status: validateStatus,
      executed: true,
      expectedCount: validateLocal?.expectedCount ?? summary.targetCount,
      actualCount: validateLocal?.actualCount ?? summary.existingLocalCount,
      zeroByteCount: validateLocal?.zeroByteCount ?? summary.zeroByteLocalCount,
      missingCount: validateLocal?.missingCount ?? summary.missingLocalCount,
    },
    {
      stage: 'upload',
      status: summary.plannedUploadCount > 0 ? 'planned' : 'blocked',
      executed: false,
      reason: generationExecuted ? 'phase-2-audio-only' : args.dryRun ? 'dry-run' : 'depends-on-local-files',
      uploadMode: STORAGE.uploadMode,
    },
    {
      stage: 'verified',
      status: 'blocked',
      executed: false,
      reason: generationExecuted ? 'phase-2-audio-only' : 'dry-run',
    },
    {
      stage: 'manifest',
      status: 'planned',
      executed: false,
      reason: generationExecuted ? 'phase-2-audio-only' : 'dry-run',
    },
  ];
}

function resolveReportMode(args) {
  if (!args.write) {
    return 'dry-run';
  }

  if (args.stage === 'sample') {
    return 'sample-write';
  }

  if (args.stage === 'audio') {
    return 'audio-write';
  }

  return 'dry-run';
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const chapter3 = pad3(report.target.chapter);
  const modeSuffix = report.mode;
  const fileName = `${timestampForFileName(new Date(report.finishedAt))}-${report.target.bookId}-${chapter3}-${modeSuffix}.json`;
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
  const chapterData = readGenesisChapter(args);
  const range = resolveExecutionRange(args, chapterData);
  let items = range.verses.map((verseData) => buildPipelineItem({ args, verseData }));

  let generationExecution = null;
  let validateLocal = null;

  if (args.write && args.stage === 'audio') {
    generationExecution = runAudioStage(args, range);
    items = applyPostAudioItemState(refreshItems({ args, verses: range.verses }), generationExecution);
    validateLocal = validateLocalFiles(items);
  } else if (args.write && args.stage === 'sample') {
    generationExecution = runSampleStage(args, range);
    items = applyPostAudioItemState(refreshItems({ args, verses: range.verses }), generationExecution);
    validateLocal = validateLocalFiles(items);
  } else {
    validateLocal = validateLocalFiles(items);
  }

  const summary = buildSummary(items, args, {
    generatedCount: generationExecution?.generatedCount ?? 0,
    failedCount: generationExecution?.failedCount ?? 0,
    validateLocalPass: validateLocal.pass,
  });
  const finishedAt = new Date().toISOString();
  const mode = resolveReportMode(args);

  const report = {
    mode,
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
      stage: args.stage,
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
    stages: buildStages({ summary, args, generationExecution, validateLocal }),
    validateLocal,
    generationExecution,
    items,
    safety: {
      writeAllowed: args.write && ALLOWED_STAGES.includes(args.stage),
      approvedTarget: buildPipelineTargetKey(args, range),
      pipelineEnv: args.write && ALLOWED_STAGES.includes(args.stage) ? buildPipelineEnv(args, range) : null,
      blockers: [],
    },
  };

  report.reportPath = writeReport(report);

  console.log(JSON.stringify(report, null, 2));

  if (args.write && ALLOWED_STAGES.includes(args.stage)) {
    if (generationExecution.exitCode !== 0 || summary.failedGenerationCount > 0) {
      process.exitCode = 1;
    } else if (!validateLocal.pass) {
      process.exitCode = 1;
    }
  }
}

main();
