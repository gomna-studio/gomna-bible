import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const OLD_TESTAMENT_JS_PATH = path.join(ROOT, 'old_testament.js');
const REPORT_DIR = path.join(ROOT, 'reports', 'bible-audio-pipeline');
const GENERATE_SCRIPT = path.join(ROOT, 'scripts', 'generate-bible-audio-batch.mjs');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');
const VERIFIED_LIST_PATH = path.join(ROOT, 'reports', 'verified-audio-ko-KR.json');

const PIPELINE_VERSION = '2.0.0';

const WRANGLER = {
  package: 'wrangler@4.107.0',
  contentType: 'audio/mpeg',
};

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
const TYPE_KR = '본문';

function usage() {
  console.error('Usage: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --dry-run');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --from-chapter 5 --to-chapter 10 --voice calm --language ko-KR --dry-run');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --stage audio --write');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --from-verse 1 --to-verse 1 --voice calm --language ko-KR --stage sample --write --overwrite');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --stage upload --write --upload');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --chapter 4 --voice calm --language ko-KR --stage publish --write --upload');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --from-chapter 5 --to-chapter 10 --voice calm --language ko-KR --stage audio --write');
  console.error('   or: node scripts/run-bible-audio-pipeline.mjs --book genesis --from-chapter 5 --to-chapter 10 --voice calm --language ko-KR --stage upload --write --upload');
  console.error('Optional: --from-verse 1 --to-verse 26 --overwrite');
  console.error('Default mode: --dry-run');
  console.error('Range mode supports --dry-run, --stage audio --write, and --stage upload --write --upload.');
}

const ALLOWED_STAGES = ['audio', 'sample', 'upload', 'publish'];
const WRITE_STAGES = ['audio', 'sample', 'upload', 'publish'];

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    fromChapter: null,
    toChapter: null,
    fromVerse: null,
    toVerse: null,
    language: null,
    voicePreset: null,
    stage: null,
    overwrite: false,
    dryRun: true,
    write: false,
    upload: false,
  };

  let dryRunExplicit = false;
  let writeExplicit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--from-chapter') {
      args.fromChapter = Number(argv[++i]);
    } else if (arg === '--to-chapter') {
      args.toChapter = Number(argv[++i]);
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
    } else if (arg === '--upload') {
      args.upload = true;
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

  const hasSingleChapter = args.chapter !== null;
  const hasChapterRange = args.fromChapter !== null || args.toChapter !== null;
  args.rangeMode = hasChapterRange;

  if (!args.bookId || !args.language || !args.voicePreset) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book id입니다: ${args.bookId}`);
  }

  if (hasSingleChapter && hasChapterRange) {
    throw new Error('--chapter와 --from-chapter/--to-chapter는 동시에 사용할 수 없습니다.');
  }

  if (!hasSingleChapter && !hasChapterRange) {
    usage();
    throw new Error('--chapter 또는 --from-chapter/--to-chapter가 필요합니다.');
  }

  if (hasChapterRange) {
    if (!Number.isInteger(args.fromChapter) || args.fromChapter < 1) {
      throw new Error(`유효하지 않은 from-chapter 값입니다: ${args.fromChapter}`);
    }

    if (!Number.isInteger(args.toChapter) || args.toChapter < 1) {
      throw new Error(`유효하지 않은 to-chapter 값입니다: ${args.toChapter}`);
    }

    if (args.fromChapter > args.toChapter) {
      throw new Error('--from-chapter 값은 --to-chapter 값보다 클 수 없습니다.');
    }

    if (args.fromVerse !== null || args.toVerse !== null) {
      throw new Error('range mode에서는 --from-verse/--to-verse를 사용할 수 없습니다. 각 장 전체를 대상으로 합니다.');
    }

    if (args.write && args.stage !== 'audio' && args.stage !== 'upload') {
      throw new Error('range mode --write는 현재 --stage audio 또는 --stage upload만 지원합니다. publish는 단일 장 --chapter를 사용하세요.');
    }
  } else {
    if (!Number.isInteger(args.chapter) || args.chapter < 1) {
      throw new Error(`유효하지 않은 chapter 값입니다: ${args.chapter}`);
    }
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

  if (args.write && !WRITE_STAGES.includes(args.stage)) {
    throw new Error('--write는 --stage audio, sample, upload 또는 publish와 함께 사용해야 합니다.');
  }

  if (args.write && args.stage === 'upload' && !args.upload) {
    throw new Error('upload stage --write는 --upload가 필요합니다.');
  }

  if (args.write && args.stage === 'publish' && !args.upload) {
    throw new Error('publish stage --write는 --upload가 필요합니다.');
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

function readBookData(bookId) {
  const bookConfig = BOOKS[bookId];
  const oldTestamentJs = fs.readFileSync(OLD_TESTAMENT_JS_PATH, 'utf8');
  const testamentData = extractJsonObject(oldTestamentJs, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error(`old_testament.js ${bookConfig.testamentVariable}에서 ${bookConfig.book}를 찾지 못했습니다.`);
  }

  return bookData;
}

function readGenesisChapter({ bookId, chapter, bookData = null }) {
  const bookConfig = BOOKS[bookId];
  const resolvedBookData = bookData || readBookData(bookId);
  const chapterData = resolvedBookData.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`old_testament.js ${bookConfig.testamentVariable}에서 ${bookConfig.book} ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData;
}

function countPublishedManifestEntries({ bookId, chapter }) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return 0;
  }

  const manifest = readJson(MANIFEST_PATH);
  const audios = manifest.audios || {};

  return Object.values(audios).filter((entry) => (
    entry &&
    entry.bookId === bookId &&
    entry.chapter === chapter &&
    entry.type === AUDIO_TYPE &&
    entry.status === 'published'
  )).length;
}

function buildChapterPlan(args, chapter, bookData) {
  const chapterArgs = {
    ...args,
    chapter,
    fromVerse: null,
    toVerse: null,
  };
  const chapterData = readGenesisChapter({ bookId: args.bookId, chapter, bookData });
  const range = resolveVerseRange(chapterArgs, chapterData);
  const items = range.verses.map((verseData) => buildPipelineItem({ args: chapterArgs, verseData }));
  const summary = buildSummary(items, chapterArgs);
  const publishedManifestCount = countPublishedManifestEntries({
    bookId: args.bookId,
    chapter,
  });

  return {
    chapter,
    fromVerse: range.fromVerse,
    toVerse: range.toVerse,
    targetCount: summary.targetCount,
    existingLocalCount: summary.existingLocalCount,
    missingLocalCount: summary.missingLocalCount,
    zeroByteLocalCount: summary.zeroByteLocalCount,
    plannedGenerationCount: summary.plannedGenerationCount,
    skippedExistingCount: summary.skippedExistingCount,
    publishedManifestCount,
    items,
  };
}

function buildRangeDryRunReport({ args, startedAt, chapterPlans }) {
  const finishedAt = new Date().toISOString();
  const chapters = chapterPlans.map((plan) => ({
    chapter: plan.chapter,
    fromVerse: plan.fromVerse,
    toVerse: plan.toVerse,
    targetCount: plan.targetCount,
    existingLocalCount: plan.existingLocalCount,
    missingLocalCount: plan.missingLocalCount,
    zeroByteLocalCount: plan.zeroByteLocalCount,
    plannedGenerationCount: plan.plannedGenerationCount,
    skippedExistingCount: plan.skippedExistingCount,
    publishedManifestCount: plan.publishedManifestCount,
  }));

  const summary = {
    chapterCount: chapters.length,
    totalTargetCount: chapters.reduce((sum, chapter) => sum + chapter.targetCount, 0),
    totalExistingLocalCount: chapters.reduce((sum, chapter) => sum + chapter.existingLocalCount, 0),
    totalMissingLocalCount: chapters.reduce((sum, chapter) => sum + chapter.missingLocalCount, 0),
    totalZeroByteLocalCount: chapters.reduce((sum, chapter) => sum + chapter.zeroByteLocalCount, 0),
    totalPlannedGenerationCount: chapters.reduce((sum, chapter) => sum + chapter.plannedGenerationCount, 0),
    totalSkippedExistingCount: chapters.reduce((sum, chapter) => sum + chapter.skippedExistingCount, 0),
    totalPublishedManifestCount: chapters.reduce((sum, chapter) => sum + chapter.publishedManifestCount, 0),
    fileModified: false,
    mp3Generated: false,
    uploadPerformed: false,
    manifestWritten: false,
    verifiedListModified: false,
  };

  return {
    mode: 'range-dry-run',
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
    finishedAt,
    target: {
      bookId: args.bookId,
      book: BOOKS[args.bookId].book,
      fromChapter: args.fromChapter,
      toChapter: args.toChapter,
      language: args.language,
      voicePreset: args.voicePreset,
      stage: args.stage,
      upload: args.upload,
      overwrite: args.overwrite,
      rangeMode: true,
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
      wranglerPackage: WRANGLER.package,
      contentType: WRANGLER.contentType,
    },
    summary,
    chapters,
    safety: {
      writeAllowed: false,
      rangeWriteSupported: false,
      blockers: args.write ? ['range-write-not-supported'] : [],
    },
  };
}

function runRangeDryRun(args, startedAt) {
  const bookData = readBookData(args.bookId);
  const chapterPlans = [];

  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    chapterPlans.push(buildChapterPlan(args, chapter, bookData));
  }

  const report = buildRangeDryRunReport({ args, startedAt, chapterPlans });
  report.reportPath = writeReport(report);
  return report;
}

function runRangeChapterAudioWrite(args, chapter, bookData) {
  const chapterArgs = {
    ...args,
    chapter,
    fromVerse: null,
    toVerse: null,
    rangeMode: false,
  };
  const chapterData = readGenesisChapter({ bookId: args.bookId, chapter, bookData });
  const range = resolveVerseRange(chapterArgs, chapterData);

  const generationExecution = runAudioStage(chapterArgs, range);
  const items = applyPostAudioItemState(
    range.verses.map((verseData) => buildPipelineItem({ args: chapterArgs, verseData })),
    generationExecution,
  );
  const validateLocal = validateLocalFiles(items);

  const generationPass = generationExecution.exitCode === 0 && generationExecution.failedCount === 0;
  const pass = generationPass && validateLocal.pass;

  return {
    chapter,
    fromVerse: range.fromVerse,
    toVerse: range.toVerse,
    targetCount: items.length,
    pipelineTarget: buildPipelineTargetKey(chapterArgs, range),
    command: generationExecution.command,
    exitCode: generationExecution.exitCode,
    generatedCount: generationExecution.generatedCount,
    failedCount: generationExecution.failedCount,
    skippedExistingCount: generationExecution.skippedExistingCount,
    stderr: generationExecution.exitCode === 0 ? undefined : generationExecution.stderr,
    validateLocal,
    pass,
  };
}

function runRangeAudioWrite(args, startedAt) {
  const bookData = readBookData(args.bookId);
  const chapterResults = [];
  let aborted = false;
  let abortedAtChapter = null;

  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    const chapterResult = runRangeChapterAudioWrite(args, chapter, bookData);
    chapterResults.push(chapterResult);

    if (!chapterResult.pass) {
      aborted = true;
      abortedAtChapter = chapter;
      break;
    }
  }

  const totalValidateLocal = {
    expectedCount: 0,
    actualCount: 0,
    missingCount: 0,
    zeroByteCount: 0,
    missingIds: [],
    zeroByteIds: [],
  };

  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    const chapterData = readGenesisChapter({ bookId: args.bookId, chapter, bookData });
    const chapterArgs = { ...args, chapter, fromVerse: null, toVerse: null };
    const range = resolveVerseRange(chapterArgs, chapterData);
    const items = range.verses.map((verseData) => buildPipelineItem({ args: chapterArgs, verseData }));
    const validateLocal = validateLocalFiles(items);

    totalValidateLocal.expectedCount += validateLocal.expectedCount;
    totalValidateLocal.actualCount += validateLocal.actualCount;
    totalValidateLocal.missingCount += validateLocal.missingCount;
    totalValidateLocal.zeroByteCount += validateLocal.zeroByteCount;
    totalValidateLocal.missingIds.push(...validateLocal.missingIds);
    totalValidateLocal.zeroByteIds.push(...validateLocal.zeroByteIds);
  }

  totalValidateLocal.pass = totalValidateLocal.missingCount === 0 && totalValidateLocal.zeroByteCount === 0;
  totalValidateLocal.status = totalValidateLocal.pass ? 'pass' : 'fail';

  const summary = {
    chapterCount: args.toChapter - args.fromChapter + 1,
    processedChapterCount: chapterResults.length,
    totalTargetCount: totalValidateLocal.expectedCount,
    totalGeneratedCount: chapterResults.reduce((sum, chapter) => sum + chapter.generatedCount, 0),
    totalFailedCount: chapterResults.reduce((sum, chapter) => sum + chapter.failedCount, 0),
    totalSkippedExistingCount: chapterResults.reduce((sum, chapter) => sum + chapter.skippedExistingCount, 0),
    totalExistingLocalCount: totalValidateLocal.actualCount,
    totalMissingLocalCount: totalValidateLocal.missingCount,
    totalZeroByteLocalCount: totalValidateLocal.zeroByteCount,
    validateLocalPass: totalValidateLocal.pass,
    aborted,
    abortedAtChapter,
    fileModified: chapterResults.some((chapter) => chapter.generatedCount > 0),
    mp3Generated: chapterResults.some((chapter) => chapter.generatedCount > 0),
    uploadPerformed: false,
    manifestWritten: false,
    verifiedListModified: false,
    overwrite: args.overwrite,
  };

  const pass = !aborted && chapterResults.every((chapter) => chapter.pass) && totalValidateLocal.pass;

  const report = {
    mode: 'range-audio-write',
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    target: {
      bookId: args.bookId,
      book: BOOKS[args.bookId].book,
      fromChapter: args.fromChapter,
      toChapter: args.toChapter,
      language: args.language,
      voicePreset: args.voicePreset,
      stage: args.stage,
      upload: args.upload,
      overwrite: args.overwrite,
      rangeMode: true,
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
      wranglerPackage: WRANGLER.package,
      contentType: WRANGLER.contentType,
    },
    summary,
    validateLocal: totalValidateLocal,
    chapters: chapterResults,
    pass,
    safety: {
      writeAllowed: true,
      rangeWriteSupported: true,
      approvedTargets: chapterResults.map((chapter) => chapter.pipelineTarget),
      blockers: aborted ? [`chapter-${abortedAtChapter}-failed`] : [],
    },
  };

  report.reportPath = writeReport(report);
  return report;
}

function buildRangeChapterItems(args, chapter, bookData) {
  const chapterArgs = {
    ...args,
    chapter,
    fromVerse: null,
    toVerse: null,
    rangeMode: false,
  };
  const chapterData = readGenesisChapter({ bookId: args.bookId, chapter, bookData });
  const range = resolveVerseRange(chapterArgs, chapterData);
  const items = range.verses.map((verseData) => buildPipelineItem({ args: chapterArgs, verseData }));

  return { chapterArgs, range, items };
}

function computeRangeValidateLocal(args, bookData) {
  const totalValidateLocal = {
    expectedCount: 0,
    actualCount: 0,
    missingCount: 0,
    zeroByteCount: 0,
    missingIds: [],
    zeroByteIds: [],
  };
  const chapterValidations = [];

  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    const { items } = buildRangeChapterItems(args, chapter, bookData);
    const validateLocal = validateLocalFiles(items);

    chapterValidations.push({ chapter, validateLocal });
    totalValidateLocal.expectedCount += validateLocal.expectedCount;
    totalValidateLocal.actualCount += validateLocal.actualCount;
    totalValidateLocal.missingCount += validateLocal.missingCount;
    totalValidateLocal.zeroByteCount += validateLocal.zeroByteCount;
    totalValidateLocal.missingIds.push(...validateLocal.missingIds);
    totalValidateLocal.zeroByteIds.push(...validateLocal.zeroByteIds);
  }

  totalValidateLocal.pass = totalValidateLocal.missingCount === 0 && totalValidateLocal.zeroByteCount === 0;
  totalValidateLocal.status = totalValidateLocal.pass ? 'pass' : 'fail';

  return { totalValidateLocal, chapterValidations };
}

function buildRangeReportShell({ args, mode, startedAt }) {
  return {
    mode,
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    target: {
      bookId: args.bookId,
      book: BOOKS[args.bookId].book,
      fromChapter: args.fromChapter,
      toChapter: args.toChapter,
      language: args.language,
      voicePreset: args.voicePreset,
      stage: args.stage,
      upload: args.upload,
      overwrite: args.overwrite,
      rangeMode: true,
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
      wranglerPackage: WRANGLER.package,
      contentType: WRANGLER.contentType,
    },
  };
}

async function runRangeUploadWrite(args, startedAt) {
  const bookData = readBookData(args.bookId);
  const { totalValidateLocal, chapterValidations } = computeRangeValidateLocal(args, bookData);
  const chapterResults = [];
  let aborted = false;
  let abortedAtChapter = null;
  let blocked = false;

  if (!totalValidateLocal.pass) {
    blocked = true;
  } else {
    for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
      const { chapterArgs, range, items } = buildRangeChapterItems(args, chapter, bookData);
      const uploadExecution = await runUploadStage(items);

      chapterResults.push({
        chapter,
        fromVerse: range.fromVerse,
        toVerse: range.toVerse,
        targetCount: items.length,
        pipelineTarget: buildPipelineTargetKey(chapterArgs, range),
        uploadedCount: uploadExecution.uploadedCount,
        urlVerifiedCount: uploadExecution.urlVerifiedCount,
        failedCount: uploadExecution.failedCount,
        pass: uploadExecution.pass,
        results: uploadExecution.results,
      });

      if (!uploadExecution.pass) {
        aborted = true;
        abortedAtChapter = chapter;
        break;
      }
    }
  }

  const summary = {
    chapterCount: args.toChapter - args.fromChapter + 1,
    processedChapterCount: chapterResults.length,
    totalTargetCount: totalValidateLocal.expectedCount,
    totalExistingLocalCount: totalValidateLocal.actualCount,
    totalMissingLocalCount: totalValidateLocal.missingCount,
    totalZeroByteLocalCount: totalValidateLocal.zeroByteCount,
    totalUploadedCount: chapterResults.reduce((sum, chapter) => sum + chapter.uploadedCount, 0),
    totalUrlVerifiedCount: chapterResults.reduce((sum, chapter) => sum + chapter.urlVerifiedCount, 0),
    totalUploadFailedCount: chapterResults.reduce((sum, chapter) => sum + chapter.failedCount, 0),
    validateLocalPass: totalValidateLocal.pass,
    aborted,
    abortedAtChapter,
    blocked,
    blockedReason: blocked ? 'validate-local-failed' : null,
    fileModified: false,
    mp3Generated: false,
    uploadPerformed: chapterResults.some((chapter) => chapter.uploadedCount > 0),
    manifestWritten: false,
    verifiedListModified: false,
    overwrite: args.overwrite,
  };

  const pass =
    !blocked &&
    !aborted &&
    totalValidateLocal.pass &&
    chapterResults.length === summary.chapterCount &&
    chapterResults.every((chapter) => chapter.pass) &&
    summary.totalUrlVerifiedCount === summary.totalTargetCount;

  const report = {
    ...buildRangeReportShell({ args, mode: 'range-upload-write', startedAt }),
    summary,
    validateLocal: totalValidateLocal,
    chapterValidations: chapterValidations.map(({ chapter, validateLocal }) => ({
      chapter,
      status: validateLocal.status,
      expectedCount: validateLocal.expectedCount,
      actualCount: validateLocal.actualCount,
      missingCount: validateLocal.missingCount,
      zeroByteCount: validateLocal.zeroByteCount,
    })),
    chapters: chapterResults,
    pass,
    safety: {
      writeAllowed: true,
      rangeWriteSupported: true,
      approvedTargets: chapterResults.map((chapter) => chapter.pipelineTarget),
      blockers: [
        ...(blocked ? ['validate-local-failed'] : []),
        ...(aborted ? [`chapter-${abortedAtChapter}-failed`] : []),
      ],
    },
  };

  report.reportPath = writeReport(report);
  return report;
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
  const uploadedCount = execution.uploadedCount || 0;
  const urlVerifiedCount = execution.urlVerifiedCount || 0;
  const uploadFailedCount = execution.uploadFailedCount || 0;
  const verifiedAppendedCount = execution.verifiedAppendedCount || 0;
  const manifestPublishedCount = execution.manifestPublishedCount || 0;
  const publishFailedCount = execution.publishFailedCount || 0;

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
    uploadedCount,
    urlVerifiedCount,
    uploadFailedCount,
    verifiedAppendedCount,
    manifestPublishedCount,
    publishFailedCount,
    plannedVerifiedAppendCount: items.filter((item) => item.actions.verified === 'pending').length,
    plannedManifestPublishCount: items.filter((item) => item.actions.manifest === 'draft-planned').length,
    fileModified: generatedCount > 0 || execution.manifestWritten || execution.verifiedListModified,
    mp3Generated: generatedCount > 0,
    uploadPerformed: uploadedCount > 0,
    manifestWritten: execution.manifestWritten ?? false,
    verifiedListModified: execution.verifiedListModified ?? false,
    overwrite: args.overwrite,
    validateLocalPass: execution.validateLocalPass ?? null,
    uploadPass: execution.uploadPass ?? null,
    publishPass: execution.publishPass ?? null,
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

async function getPublicUrlStatus(publicUrl) {
  const response = await fetch(publicUrl, { method: 'HEAD' });

  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    contentLength: response.headers.get('content-length') || '',
  };
}

function verifyPublicUrlStatus(urlStatus) {
  const contentLength = Number(urlStatus.contentLength);

  return (
    urlStatus.status === 200 &&
    urlStatus.contentType.includes(WRANGLER.contentType) &&
    Number.isFinite(contentLength) &&
    contentLength > 0
  );
}

function runWranglerPut(item) {
  const objectPath = `${STORAGE.r2Bucket}/${item.r2Key}`;
  const absoluteLocalPath = path.join(ROOT, item.localRelativePath);

  const result = spawnSync(
    'npx',
    [
      '--yes',
      WRANGLER.package,
      'r2',
      'object',
      'put',
      objectPath,
      '--file',
      absoluteLocalPath,
      '--content-type',
      WRANGLER.contentType,
      '--remote',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

  if (result.status !== 0) {
    throw new Error(output || 'wrangler r2 object put failed');
  }

  if (/Resource location:\s*local/i.test(output)) {
    throw new Error('wrangler가 local R2에 저장했습니다. --remote 업로드가 적용되지 않았습니다.');
  }

  if (!/Resource location:\s*remote/i.test(output)) {
    throw new Error('wrangler 출력에서 remote 업로드 확인에 실패했습니다.');
  }

  return output;
}

async function runUploadStage(items) {
  const startedAt = new Date().toISOString();
  const results = [];
  let uploadedCount = 0;
  let urlVerifiedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const resultItem = {
      id: item.id,
      chapter: item.chapter,
      verse: item.verse,
      localRelativePath: item.localRelativePath,
      localFileSize: item.localFileSize,
      r2Key: item.r2Key,
      publicUrl: item.publicUrl,
      objectPath: `${STORAGE.r2Bucket}/${item.r2Key}`,
      contentType: WRANGLER.contentType,
      uploaded: false,
      urlVerified: false,
      status: 'pending',
    };

    try {
      const wranglerOutput = runWranglerPut(item);
      resultItem.wranglerOutput = wranglerOutput;
      resultItem.uploaded = true;
      uploadedCount += 1;

      const urlStatus = await getPublicUrlStatus(item.publicUrl);
      resultItem.urlStatus = urlStatus;

      if (!verifyPublicUrlStatus(urlStatus)) {
        resultItem.status = 'url-verify-failed';
        resultItem.errorMessage = `public URL 확인 실패: status=${urlStatus.status}, contentType=${urlStatus.contentType}, contentLength=${urlStatus.contentLength}`;
        failedCount += 1;
        results.push(resultItem);
        continue;
      }

      resultItem.urlVerified = true;
      resultItem.status = 'pass';
      urlVerifiedCount += 1;
    } catch (error) {
      resultItem.status = 'failed';
      resultItem.errorMessage = error.message;
      failedCount += 1;
    }

    results.push(resultItem);
  }

  const pass = failedCount === 0 && uploadedCount === items.length && urlVerifiedCount === items.length;

  return {
    stage: 'upload',
    startedAt,
    finishedAt: new Date().toISOString(),
    uploadMode: STORAGE.uploadMode,
    wranglerPackage: WRANGLER.package,
    targetCount: items.length,
    uploadedCount,
    urlVerifiedCount,
    failedCount,
    pass,
    results,
    exitCode: pass ? 0 : 1,
  };
}

function applyPostUploadItemState(items, uploadExecution) {
  const resultById = new Map(
    (uploadExecution?.results || []).map((result) => [result.id, result]),
  );

  return items.map((item) => {
    const uploadResult = resultById.get(item.id);

    return {
      ...item,
      actions: {
        ...item.actions,
        upload: uploadResult?.status === 'pass' ? 'uploaded' : item.actions.upload,
      },
      uploadResult: uploadResult || null,
    };
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readVerifiedAudioIds() {
  const data = readJson(VERIFIED_LIST_PATH);
  const list = Array.isArray(data) ? data : data.verifiedAudios || [];
  return {
    data: Array.isArray(data) ? { verifiedAudios: list } : data,
    ids: new Set(list),
  };
}

function buildManifestEntry(item, args) {
  return {
    id: item.id,
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    language: args.language,
    chapter: item.chapter,
    verse: item.verse,
    type: AUDIO_TYPE,
    typeKr: TYPE_KR,
    voicePreset: args.voicePreset,
    filePath: item.publicUrl,
    duration: 0,
    fileSize: 0,
    status: 'published',
    preview: item.preview,
  };
}

function appendVerifiedAudioIds(targetIds) {
  const { data, ids } = readVerifiedAudioIds();
  const list = data.verifiedAudios || [];
  const appended = [];

  for (const id of targetIds) {
    if (!ids.has(id)) {
      list.push(id);
      ids.add(id);
      appended.push(id);
    }
  }

  data.verifiedAudios = list;
  writeJson(VERIFIED_LIST_PATH, data);

  return {
    appended,
    appendedCount: appended.length,
    skippedExistingCount: targetIds.length - appended.length,
    totalCount: list.length,
  };
}

function publishManifestEntries(items, args) {
  const manifest = readJson(MANIFEST_PATH);
  const audios = manifest.audios || {};
  const entries = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const existingEntry = audios[item.id] || null;
    const nextEntry = buildManifestEntry(item, args);

    if (!existingEntry) {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }

    audios[item.id] = nextEntry;
    entries.push({
      id: item.id,
      chapter: item.chapter,
      verse: item.verse,
      created: !existingEntry,
      status: nextEntry.status,
      filePath: nextEntry.filePath,
    });
  }

  const nextManifest = {
    ...manifest,
    lastUpdated: new Date().toISOString().slice(0, 10),
    totalAudios: Object.keys(audios).length,
    audios,
  };

  writeJson(MANIFEST_PATH, nextManifest);
  readJson(MANIFEST_PATH);

  return {
    createdCount,
    updatedCount,
    publishedCount: items.length,
    entries,
  };
}

async function verifyAllPublicUrls(items) {
  const results = [];

  for (const item of items) {
    const resultItem = {
      id: item.id,
      publicUrl: item.publicUrl,
      pass: false,
      status: 'pending',
    };

    try {
      const urlStatus = await getPublicUrlStatus(item.publicUrl);
      resultItem.urlStatus = urlStatus;
      resultItem.pass = verifyPublicUrlStatus(urlStatus);
      resultItem.status = resultItem.pass ? 'pass' : 'url-verify-failed';

      if (!resultItem.pass) {
        resultItem.errorMessage = `public URL 확인 실패: status=${urlStatus.status}, contentType=${urlStatus.contentType}, contentLength=${urlStatus.contentLength}`;
      }
    } catch (error) {
      resultItem.status = 'failed';
      resultItem.errorMessage = error.message;
    }

    results.push(resultItem);
  }

  const passCount = results.filter((result) => result.pass).length;

  return {
    targetCount: items.length,
    passCount,
    failedCount: items.length - passCount,
    pass: passCount === items.length,
    results,
  };
}

async function runPublishStage({ args, items, validateLocal }) {
  const startedAt = new Date().toISOString();

  if (!validateLocal.pass) {
    return {
      stage: 'publish',
      startedAt,
      finishedAt: new Date().toISOString(),
      pass: false,
      blocked: true,
      blockedReason: 'validate-local-failed',
      urlVerifiedCount: 0,
      uploadedCount: 0,
      uploadFailedCount: 0,
      verifiedAppendedCount: 0,
      manifestPublishedCount: 0,
      failedCount: 0,
      results: [],
      exitCode: 1,
    };
  }

  let uploadExecution = null;
  let urlVerification = await verifyAllPublicUrls(items);

  if (!urlVerification.pass && args.upload) {
    const failedIds = new Set(
      urlVerification.results.filter((result) => !result.pass).map((result) => result.id),
    );
    const uploadTargets = items.filter((item) => failedIds.has(item.id));
    uploadExecution = await runUploadStage(uploadTargets);
    urlVerification = await verifyAllPublicUrls(items);
  }

  if (!urlVerification.pass) {
    return {
      stage: 'publish',
      startedAt,
      finishedAt: new Date().toISOString(),
      pass: false,
      blocked: false,
      blockedReason: null,
      urlVerifiedCount: urlVerification.passCount,
      uploadedCount: uploadExecution?.uploadedCount ?? 0,
      uploadFailedCount: uploadExecution?.failedCount ?? 0,
      verifiedAppendedCount: 0,
      manifestPublishedCount: 0,
      manifestWritten: false,
      verifiedListModified: false,
      failedCount: urlVerification.failedCount,
      urlVerification,
      uploadExecution,
      results: urlVerification.results,
      exitCode: 1,
    };
  }

  const targetIds = items.map((item) => item.id);
  const verifiedWrite = appendVerifiedAudioIds(targetIds);
  const manifestWrite = publishManifestEntries(items, args);

  return {
    stage: 'publish',
    startedAt,
    finishedAt: new Date().toISOString(),
    pass: true,
    blocked: false,
    blockedReason: null,
    urlVerifiedCount: urlVerification.passCount,
    uploadedCount: uploadExecution?.uploadedCount ?? 0,
    uploadFailedCount: uploadExecution?.failedCount ?? 0,
    verifiedAppendedCount: verifiedWrite.appendedCount,
    verifiedSkippedExistingCount: verifiedWrite.skippedExistingCount,
    manifestPublishedCount: manifestWrite.publishedCount,
    manifestCreatedCount: manifestWrite.createdCount,
    manifestUpdatedCount: manifestWrite.updatedCount,
    manifestWritten: true,
    verifiedListModified: verifiedWrite.appendedCount > 0 || verifiedWrite.skippedExistingCount > 0,
    failedCount: 0,
    urlVerification,
    uploadExecution,
    verifiedWrite,
    manifestWrite,
    results: urlVerification.results,
    exitCode: 0,
  };
}

function applyPostPublishItemState(items, publishExecution) {
  return items.map((item) => ({
    ...item,
    actions: {
      ...item.actions,
      upload: publishExecution?.urlVerifiedCount === items.length ? 'uploaded' : item.actions.upload,
      verified: publishExecution?.pass ? 'verified' : item.actions.verified,
      manifest: publishExecution?.pass ? 'published' : item.actions.manifest,
    },
    publishResult: publishExecution?.results?.find((result) => result.id === item.id) || null,
  }));
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

function buildStages({ summary, args, generationExecution, uploadExecution, publishExecution, validateLocal }) {
  const generationExecuted = Boolean(generationExecution);
  const uploadExecuted = Boolean(uploadExecution) && args.stage === 'upload';
  const publishExecuted = Boolean(publishExecution) && args.stage === 'publish';
  const publishUploadExecuted = Boolean(publishExecution?.uploadExecution);
  const generationStatus = !generationExecuted
    ? 'planned'
    : generationExecution.exitCode === 0 && summary.failedGenerationCount === 0
      ? 'pass'
      : 'fail';

  const validateStatus = uploadExecuted || generationExecuted || publishExecuted
    ? validateLocal.status
    : summary.zeroByteLocalCount > 0
      ? 'fail'
      : summary.existingLocalCount === summary.targetCount
        ? 'pass'
        : 'planned';

  const uploadStatus = publishExecuted
    ? publishUploadExecuted
      ? publishExecution.uploadExecution.pass
        ? 'pass'
        : 'fail'
      : publishExecution.pass
        ? 'pass'
        : publishExecution.blockedReason === 'validate-local-failed'
          ? 'blocked'
          : publishExecution.urlVerifiedCount === summary.targetCount
            ? 'pass'
            : 'fail'
    : !uploadExecuted
      ? args.stage === 'upload' && validateLocal && !validateLocal.pass
        ? 'blocked'
        : summary.plannedUploadCount > 0
          ? 'planned'
          : 'blocked'
      : uploadExecution.pass
        ? 'pass'
        : 'fail';

  const sampleExecuted = generationExecuted && args.stage === 'sample';
  const audioExecuted = generationExecuted && args.stage === 'audio';
  const uploadStageExecuted = uploadExecuted;
  const verifiedStatus = publishExecuted
    ? publishExecution.pass
      ? 'pass'
      : publishExecution.blockedReason === 'validate-local-failed' || !publishExecution.pass
        ? 'blocked'
        : 'fail'
    : 'planned';
  const manifestStatus = publishExecuted
    ? publishExecution.pass
      ? 'pass'
      : publishExecution.blockedReason === 'validate-local-failed' || !publishExecution.pass
        ? 'blocked'
        : 'fail'
    : 'planned';

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
      status: uploadStatus,
      executed: uploadStageExecuted || (publishExecuted && publishUploadExecuted),
      reason: uploadStageExecuted || (publishExecuted && publishUploadExecuted)
        ? null
        : args.stage === 'upload' && validateLocal && !validateLocal.pass
          ? 'validate-local-failed'
          : args.stage === 'publish' && validateLocal && !validateLocal.pass
            ? 'validate-local-failed'
            : args.dryRun
              ? 'dry-run'
              : 'depends-on-local-files',
      uploadMode: STORAGE.uploadMode,
      wranglerPackage: WRANGLER.package,
      uploadedCount: uploadStageExecuted
        ? summary.uploadedCount
        : publishExecuted
          ? summary.uploadedCount
          : 0,
      urlVerifiedCount: publishExecuted
        ? summary.urlVerifiedCount
        : uploadStageExecuted
          ? summary.urlVerifiedCount
          : 0,
      failedCount: uploadStageExecuted || publishExecuted ? summary.uploadFailedCount : 0,
    },
    {
      stage: 'verified',
      status: verifiedStatus,
      executed: publishExecuted && publishExecution.pass,
      reason: publishExecuted
        ? null
        : args.stage === 'publish'
          ? args.dryRun
            ? 'dry-run'
            : 'not-requested'
          : 'dry-run',
      appendedCount: publishExecuted ? summary.verifiedAppendedCount : 0,
    },
    {
      stage: 'manifest',
      status: manifestStatus,
      executed: publishExecuted && publishExecution.pass,
      reason: publishExecuted
        ? null
        : args.stage === 'publish'
          ? args.dryRun
            ? 'dry-run'
            : 'not-requested'
          : 'dry-run',
      publishedCount: publishExecuted ? summary.manifestPublishedCount : 0,
    },
    {
      stage: 'publish',
      status: publishExecuted
        ? publishExecution.pass
          ? 'pass'
          : 'fail'
        : args.stage === 'publish'
          ? args.dryRun
            ? 'planned'
            : 'planned'
          : 'planned',
      executed: publishExecuted,
      reason: publishExecuted ? null : args.stage === 'publish' && args.dryRun ? 'dry-run' : 'not-requested',
      urlVerifiedCount: publishExecuted ? summary.urlVerifiedCount : 0,
      verifiedAppendedCount: publishExecuted ? summary.verifiedAppendedCount : 0,
      manifestPublishedCount: publishExecuted ? summary.manifestPublishedCount : 0,
      failedCount: publishExecuted ? summary.publishFailedCount : 0,
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

  if (args.stage === 'upload' && args.upload) {
    return 'upload-write';
  }

  if (args.stage === 'publish' && args.upload) {
    return 'publish-write';
  }

  return 'dry-run';
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const isRangeReport = report.mode.startsWith('range-');
  const rangeLabel = isRangeReport
    ? `${pad3(report.target.fromChapter)}-${pad3(report.target.toChapter)}`
    : pad3(report.target.chapter);

  const modeSuffix = isRangeReport
    ? report.mode.replace(/^range-/, '')
    : report.mode;
  const fileName = `${timestampForFileName(new Date(report.finishedAt))}-${report.target.bookId}-${rangeLabel}-${modeSuffix}.json`;
  const reportPath = path.join(REPORT_DIR, fileName);

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return toRelativePath(reportPath);
}

async function main() {
  if (process.argv.slice(2).length === 0) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));

  if (args.rangeMode) {
    if (args.write && args.stage === 'audio') {
      const report = runRangeAudioWrite(args, startedAt);
      console.log(JSON.stringify(report, null, 2));

      if (!report.pass) {
        process.exitCode = 1;
      }

      return;
    }

    if (args.write && args.stage === 'upload' && args.upload) {
      const report = await runRangeUploadWrite(args, startedAt);
      console.log(JSON.stringify(report, null, 2));

      if (!report.pass) {
        process.exitCode = 1;
      }

      return;
    }

    const report = runRangeDryRun(args, startedAt);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const chapterData = readGenesisChapter(args);
  const range = resolveExecutionRange(args, chapterData);
  let items = range.verses.map((verseData) => buildPipelineItem({ args, verseData }));

  let generationExecution = null;
  let uploadExecution = null;
  let publishExecution = null;
  let validateLocal = validateLocalFiles(items);

  if (args.write && args.stage === 'audio') {
    generationExecution = runAudioStage(args, range);
    items = applyPostAudioItemState(refreshItems({ args, verses: range.verses }), generationExecution);
    validateLocal = validateLocalFiles(items);
  } else if (args.write && args.stage === 'sample') {
    generationExecution = runSampleStage(args, range);
    items = applyPostAudioItemState(refreshItems({ args, verses: range.verses }), generationExecution);
    validateLocal = validateLocalFiles(items);
  } else if (args.write && args.stage === 'upload' && args.upload) {
    if (!validateLocal.pass) {
      uploadExecution = {
        stage: 'upload',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        uploadMode: STORAGE.uploadMode,
        wranglerPackage: WRANGLER.package,
        targetCount: items.length,
        uploadedCount: 0,
        urlVerifiedCount: 0,
        failedCount: 0,
        pass: false,
        blocked: true,
        blockedReason: 'validate-local-failed',
        results: [],
        exitCode: 1,
      };
    } else {
      uploadExecution = await runUploadStage(items);
      items = applyPostUploadItemState(items, uploadExecution);
    }
  } else if (args.write && args.stage === 'publish' && args.upload) {
    publishExecution = await runPublishStage({ args, items, validateLocal });
    if (publishExecution.uploadExecution) {
      uploadExecution = publishExecution.uploadExecution;
    }
    items = applyPostPublishItemState(items, publishExecution);
  }

  const summary = buildSummary(items, args, {
    generatedCount: generationExecution?.generatedCount ?? 0,
    failedCount: generationExecution?.failedCount ?? 0,
    uploadedCount: publishExecution?.uploadedCount ?? uploadExecution?.uploadedCount ?? 0,
    urlVerifiedCount: publishExecution?.urlVerifiedCount ?? uploadExecution?.urlVerifiedCount ?? 0,
    uploadFailedCount: publishExecution?.uploadFailedCount ?? uploadExecution?.failedCount ?? 0,
    verifiedAppendedCount: publishExecution?.verifiedAppendedCount ?? 0,
    manifestPublishedCount: publishExecution?.manifestPublishedCount ?? 0,
    publishFailedCount: publishExecution?.failedCount ?? 0,
    validateLocalPass: validateLocal.pass,
    uploadPass: uploadExecution?.pass ?? null,
    publishPass: publishExecution?.pass ?? null,
    manifestWritten: publishExecution?.manifestWritten ?? false,
    verifiedListModified: publishExecution?.verifiedListModified ?? false,
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
      upload: args.upload,
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
      wranglerPackage: WRANGLER.package,
      contentType: WRANGLER.contentType,
    },
    summary,
    stages: buildStages({ summary, args, generationExecution, uploadExecution, publishExecution, validateLocal }),
    validateLocal,
    generationExecution,
    uploadExecution,
    publishExecution,
    items,
    safety: {
      writeAllowed: args.write && WRITE_STAGES.includes(args.stage),
      approvedTarget: buildPipelineTargetKey(args, range),
      pipelineEnv: args.write && WRITE_STAGES.includes(args.stage) ? buildPipelineEnv(args, range) : null,
      blockers: [
        ...(uploadExecution?.blocked ? [uploadExecution.blockedReason] : []),
        ...(publishExecution?.blocked ? [publishExecution.blockedReason] : []),
      ],
    },
  };

  report.reportPath = writeReport(report);

  console.log(JSON.stringify(report, null, 2));

  if ((args.write && args.stage === 'audio') || (args.write && args.stage === 'sample')) {
    if (generationExecution.exitCode !== 0 || summary.failedGenerationCount > 0) {
      process.exitCode = 1;
    } else if (!validateLocal.pass) {
      process.exitCode = 1;
    }
  }

  if (args.write && args.stage === 'upload' && args.upload) {
    if (!validateLocal.pass || uploadExecution.exitCode !== 0 || !uploadExecution.pass) {
      process.exitCode = 1;
    }
  }

  if (args.write && args.stage === 'publish' && args.upload) {
    if (!validateLocal.pass || publishExecution.exitCode !== 0 || !publishExecution.pass) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
