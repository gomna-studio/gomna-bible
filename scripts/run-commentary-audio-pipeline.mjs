import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const LEGACY_SAFE_TARGET = {
  locale: 'ko-KR',
  bookId: 'genesis',
  chapter: 1,
  fromVerse: 5,
  toVerse: 5,
};

const SAFE_TARGET_RANGES = [
  LEGACY_SAFE_TARGET,
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 31,
  },
];

const APPROVED_AUDIO_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
];

const APPROVED_UPLOAD_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
];

const APPROVED_MANIFEST_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
];

const REPORT_DIR = path.join(ROOT, 'reports', 'commentary-pipeline');
const STAGES = new Set(['prepare', 'scripts', 'audio', 'upload', 'manifest', 'publish']);
const DEFAULT_STAGE = 'prepare';

function usage() {
  console.error('Usage: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --chapter 1 --verse 5 --stage prepare --dry-run');
  console.error('   or: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --chapter 1 --from-verse 6 --to-verse 10 --stage scripts --dry-run');
  console.error('Stages: prepare, scripts, audio, upload, manifest, publish. Safe targets: ko-KR genesis 1:5, 1:6-10, and 1:11-31.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    fromVerse: null,
    toVerse: null,
    stages: [],
    dryRun: true,
    write: false,
    overwrite: false,
    upload: false,
    report: true,
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
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--stage') {
      args.stages.push(argv[++i]);
    } else if (arg === '--dry-run') {
      dryRunExplicit = true;
      args.dryRun = true;
    } else if (arg === '--write') {
      writeExplicit = true;
      args.write = true;
      args.dryRun = false;
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--upload') {
      args.upload = true;
    } else if (arg === '--no-report') {
      args.report = false;
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
  if (!args.bookId || !args.chapter) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (args.verse != null) {
    args.fromVerse = args.verse;
    args.toVerse = args.verse;
  }
  if (args.fromVerse == null || args.toVerse == null) {
    usage();
    throw new Error('--verse 또는 --from-verse/--to-verse가 필요합니다.');
  }
  if (args.fromVerse > args.toVerse) {
    throw new Error('--from-verse는 --to-verse보다 클 수 없습니다.');
  }
  if (args.stages.length === 0) {
    args.stages.push(DEFAULT_STAGE);
  }
  for (const stage of args.stages) {
    if (!STAGES.has(stage)) {
      throw new Error(`지원하지 않는 stage입니다: ${stage}`);
    }
  }

  return args;
}

function assertSafeTarget(args) {
  const matched = SAFE_TARGET_RANGES.some((range) => (
    args.locale === range.locale &&
    args.bookId === range.bookId &&
    args.chapter === range.chapter &&
    args.fromVerse >= range.fromVerse &&
    args.toVerse <= range.toVerse
  ));

  if (!matched) {
    throw new Error('master pipeline은 현재 ko-KR 창세기 1장 5절, 1장 6절~10절, 또는 1장 11절~31절 범위만 처리할 수 있습니다.');
  }
}

function isLegacySafeTarget(args) {
  return (
    args.locale === LEGACY_SAFE_TARGET.locale &&
    args.bookId === LEGACY_SAFE_TARGET.bookId &&
    args.chapter === LEGACY_SAFE_TARGET.chapter &&
    args.fromVerse === LEGACY_SAFE_TARGET.fromVerse &&
    args.toVerse === LEGACY_SAFE_TARGET.toVerse
  );
}

function isApprovedAudioWriteTarget(args) {
  return APPROVED_AUDIO_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function isApprovedUploadWriteTarget(args) {
  return APPROVED_UPLOAD_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function isApprovedManifestWriteTarget(args) {
  return APPROVED_MANIFEST_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function scriptsDirForVerse(args, verse) {
  return path.join(
    ROOT,
    'tts-scripts',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(verse),
  );
}

function countTextFiles(args, verse) {
  const scriptsDir = scriptsDirForVerse(args, verse);
  if (!fs.existsSync(scriptsDir)) return 0;

  return fs.readdirSync(scriptsDir).filter((fileName) => fileName.endsWith('.txt')).length;
}

function hasGeneratedScripts(args, verse) {
  return countTextFiles(args, verse) > 0;
}

function collectStepResults(finalPlan, stepName) {
  const results = [];

  for (const versePlan of finalPlan.verses) {
    for (const step of versePlan.steps) {
      if (step.step === stepName) {
        results.push({ verse: versePlan.verse, step });
      }
    }
  }

  return results;
}

function buildPipelineSummary({ args, finalPlan }) {
  let generatedTextFiles = false;
  let generatedTextFileCount = 0;
  let mp3Generated = false;
  let uploadPerformed = false;
  let manifestWritten = false;
  let validationExecuted = false;
  let validationFailCount = null;
  let validationWarnCount = null;
  let validationPassCount = null;

  let existingTextFilesCount = 0;
  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    existingTextFilesCount += countTextFiles(args, verse);
  }

  for (const { verse, step } of collectStepResults(finalPlan, 'build-scripts')) {
    if (!step.executed || step.result?.exitCode !== 0) continue;

    const parsed = step.result.parsedStdout;
    const txtCount = countTextFiles(args, verse);
    const expectedCount = parsed?.targetCount ?? txtCount;

    if (args.write && (parsed?.fileModified === true || txtCount >= expectedCount)) {
      generatedTextFiles = true;
      generatedTextFileCount += expectedCount;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'validate-scripts')) {
    if (!step.executed || step.result?.exitCode !== 0) continue;

    validationExecuted = true;
    const parsed = step.result.parsedStdout;
    if (!parsed) continue;

    validationFailCount = (validationFailCount ?? 0) + (parsed.failCount ?? 0);
    validationWarnCount = (validationWarnCount ?? 0) + (parsed.warnCount ?? 0);
    validationPassCount = (validationPassCount ?? 0) + (parsed.passCount ?? 0);
  }

  for (const { step } of collectStepResults(finalPlan, 'audio')) {
    if (step.executed && step.result?.parsedStdout?.mp3Generated === true) {
      mp3Generated = true;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'upload')) {
    if (step.executed && step.result?.parsedStdout?.uploadPerformed === true) {
      uploadPerformed = true;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'manifest')) {
    if (step.executed && args.write && step.result?.parsedStdout?.fileModified === true) {
      manifestWritten = true;
    }
  }

  return {
    generatedTextFiles,
    generatedTextFileCount: generatedTextFiles ? generatedTextFileCount : 0,
    existingTextFilesCount,
    scriptsAvailableForValidate: existingTextFilesCount > 0,
    validationExecuted,
    validationFailCount: validationExecuted ? validationFailCount : null,
    validationWarnCount: validationExecuted ? validationWarnCount : null,
    validationPassCount: validationExecuted ? validationPassCount : null,
    mp3Generated,
    uploadPerformed,
    manifestWritten,
    fileModified: generatedTextFiles || mp3Generated || manifestWritten,
  };
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function baseTargetArgs(args, verse) {
  return [
    '--locale',
    args.locale,
    '--book',
    args.bookId,
    '--chapter',
    String(args.chapter),
    '--verse',
    String(verse),
  ];
}

function pipelineEnv(args, verse) {
  return {
    GOMNA_COMMENTARY_PIPELINE: '1',
    GOMNA_COMMENTARY_ALLOWED_TARGET: `${args.locale}:${args.bookId}:${args.chapter}:${verse}`,
  };
}

function buildCommand(scriptPath, scriptArgs, env = {}) {
  return {
    command: 'node',
    args: [scriptPath, ...scriptArgs],
    display: ['node', scriptPath, ...scriptArgs].join(' '),
    env,
  };
}

function stagesToSteps(stages) {
  const steps = [];
  const add = (step) => {
    if (!steps.includes(step)) steps.push(step);
  };

  for (const stage of stages) {
    if (stage === 'prepare') {
      add('build-scripts-dry-run');
      add('validate-scripts');
      add('audio-dry-run');
      add('upload-dry-run');
      add('manifest-dry-run');
    } else if (stage === 'scripts') {
      add('build-scripts');
      add('validate-scripts');
    } else if (stage === 'audio') {
      add('audio');
    } else if (stage === 'upload') {
      add('upload');
    } else if (stage === 'manifest') {
      add('cue-check');
      add('manifest');
    } else if (stage === 'publish') {
      add('cue-check');
      add('upload');
      add('manifest');
    }
  }

  return steps;
}

function commandForStep({ args, verse, step }) {
  const targetArgs = baseTargetArgs(args, verse);
  const env = pipelineEnv(args, verse);

  if (step === 'build-scripts-dry-run') {
    return buildCommand('scripts/build-commentary-tts-scripts.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'build-scripts') {
    return buildCommand('scripts/build-commentary-tts-scripts.mjs', [...targetArgs, args.write ? '--write' : '--dry-run'], env);
  }
  if (step === 'validate-scripts') {
    return buildCommand('scripts/validate-commentary-tts-scripts.mjs', targetArgs, env);
  }
  if (step === 'audio-dry-run') {
    return buildCommand('scripts/generate-commentary-audio-batch.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'audio') {
    return buildCommand(
      'scripts/generate-commentary-audio-batch.mjs',
      [...targetArgs, args.overwrite ? '--overwrite' : null, args.write ? '--write' : '--dry-run'].filter(Boolean),
      env,
    );
  }
  if (step === 'upload-dry-run') {
    return buildCommand('scripts/prepare-commentary-r2-upload.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'upload') {
    const uploadAllowed = args.upload || args.stages.includes('publish');
    return buildCommand(
      'scripts/prepare-commentary-r2-upload.mjs',
      [...targetArgs, args.overwrite ? '--overwrite' : null, args.write && uploadAllowed ? '--upload' : '--dry-run'].filter(Boolean),
      env,
    );
  }
  if (step === 'manifest-dry-run') {
    return buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'cue-check') {
    return buildCommand('scripts/verify-commentary-cues.mjs', targetArgs, env);
  }
  if (step === 'manifest') {
    return buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, args.write ? '--write' : '--dry-run'], env);
  }

  throw new Error(`알 수 없는 step입니다: ${step}`);
}

function isOnlyAudioStage(args, steps) {
  return (
    args.stages.length === 1 &&
    args.stages[0] === 'audio' &&
    steps.length === 1 &&
    steps[0] === 'audio'
  );
}

function isOnlyUploadStage(args, steps) {
  return (
    args.stages.length === 1 &&
    args.stages[0] === 'upload' &&
    steps.length === 1 &&
    steps[0] === 'upload'
  );
}

function isOnlyManifestStage(args, steps) {
  return (
    args.stages.length === 1 &&
    args.stages[0] === 'manifest' &&
    steps.length === 2 &&
    steps[0] === 'cue-check' &&
    steps[1] === 'manifest'
  );
}

function runPreflightCommand(commandSpec) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...commandSpec.env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let parsedStdout = null;
  try {
    parsedStdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsedStdout = null;
  }

  return {
    exitCode: result.status,
    stderr: result.stderr,
    parsedStdout,
  };
}

function validateApprovedAudioWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const textFileCount = countTextFiles(args, verse);
    if (textFileCount !== 9) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} txt 파일이 9개가 아닙니다 (${textFileCount}개).`);
      continue;
    }

    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const validation = runPreflightCommand(
      buildCommand('scripts/validate-commentary-tts-scripts.mjs', targetArgs, env),
    );
    const validationFailCount = validation.parsedStdout?.failCount;
    if (validation.exitCode !== 0 || validationFailCount !== 0) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} validate failCount=${validationFailCount ?? 'unknown'}.`);
      continue;
    }

    const audioDryRun = runPreflightCommand(
      buildCommand('scripts/generate-commentary-audio-batch.mjs', [...targetArgs, '--dry-run'], env),
    );
    const targetCount = audioDryRun.parsedStdout?.targetCount;
    if (audioDryRun.exitCode !== 0 || targetCount !== 9) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} audio dry-run targetCount=${targetCount ?? 'unknown'}.`);
    }
  }

  return blockers;
}

function expectedR2KeyBase(args, verse) {
  if (args.locale !== 'ko-KR' || args.bookId !== 'genesis') {
    return null;
  }

  return `commentary/ko/gae/${args.bookId}/${pad3(args.chapter)}/${pad3(verse)}`;
}

function validateApprovedUploadWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const uploadDryRun = runPreflightCommand(
      buildCommand('scripts/prepare-commentary-r2-upload.mjs', [...targetArgs, '--dry-run'], env),
    );
    const parsed = uploadDryRun.parsedStdout;
    const expectedKeyBase = expectedR2KeyBase(args, verse);

    if (uploadDryRun.exitCode !== 0 || !parsed) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} upload dry-run이 실패했습니다.`);
      continue;
    }
    if (parsed.targetCount !== 9 || parsed.validCount !== 9 || parsed.missingOrEmptyCount !== 0) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} targetCount=${parsed.targetCount ?? 'unknown'}, validCount=${parsed.validCount ?? 'unknown'}, missingOrEmptyCount=${parsed.missingOrEmptyCount ?? 'unknown'}.`);
    }
    if (parsed.contentType !== 'audio/mpeg') {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} contentType=${parsed.contentType ?? 'unknown'}.`);
    }
    if (parsed.r2KeyBase !== expectedKeyBase) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} r2KeyBase=${parsed.r2KeyBase ?? 'unknown'}.`);
    }
  }

  return blockers;
}

function validateApprovedManifestWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const expectedKeyBase = expectedR2KeyBase(args, verse);

    const cueCheck = runPreflightCommand(
      buildCommand('scripts/verify-commentary-cues.mjs', targetArgs, env),
    );
    if (cueCheck.exitCode !== 0 || cueCheck.parsedStdout?.status !== 'PASS') {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} cue-check가 PASS가 아닙니다.`);
      continue;
    }

    const manifestDryRun = runPreflightCommand(
      buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, '--dry-run'], env),
    );
    const parsed = manifestDryRun.parsedStdout;

    if (manifestDryRun.exitCode !== 0 || !parsed) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} manifest dry-run이 실패했습니다.`);
      continue;
    }
    if (
      parsed.targetCount !== 9 ||
      parsed.publishedCount !== 9 ||
      parsed.fileSizePositiveCount !== 9 ||
      parsed.durationPositiveCount !== 9
    ) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} targetCount=${parsed.targetCount ?? 'unknown'}, publishedCount=${parsed.publishedCount ?? 'unknown'}, fileSizePositiveCount=${parsed.fileSizePositiveCount ?? 'unknown'}, durationPositiveCount=${parsed.durationPositiveCount ?? 'unknown'}.`);
    }
    if (parsed.previousVersesChanged !== false) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} previousVersesChanged가 false가 아닙니다.`);
    }
    if (parsed.unexpectedFallbackToGenesis001001 !== false) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} unexpectedFallbackToGenesis001001가 false가 아닙니다.`);
    }
    if (parsed.r2KeyBase !== expectedKeyBase) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} r2KeyBase=${parsed.r2KeyBase ?? 'unknown'}.`);
    }
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const invalidFilePaths = entries.filter((entry) => (
      !entry.filePath ||
      !entry.filePath.includes(expectedKeyBase) ||
      /genesis\/001\/001|genesis\.001\.001/.test(entry.filePath)
    ));
    if (entries.length !== 9 || invalidFilePaths.length > 0) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} R2 URL 구조가 올바르지 않은 entry가 있습니다.`);
    }
  }

  return blockers;
}

function validateWriteSafety({ args, steps }) {
  if (!args.write) return [];

  const blockers = [];
  const hasManifestWrite = steps.includes('manifest');

  if (!isLegacySafeTarget(args) && hasManifestWrite) {
    if (!isOnlyManifestStage(args, steps) || !isApprovedManifestWriteTarget(args)) {
      blockers.push('창세기 1장 6절~10절 manifest write는 --stage manifest --write 정확한 범위에서만 허용됩니다. publish 실제 write는 차단됩니다.');
    } else {
      blockers.push(...validateApprovedManifestWritePreflight(args));
    }
  }

  if (!isLegacySafeTarget(args) && steps.includes('audio')) {
    if (!isOnlyAudioStage(args, steps) || !isApprovedAudioWriteTarget(args) || !args.overwrite) {
      blockers.push('창세기 1장 6절~10절 audio write는 --stage audio --write --overwrite 정확한 범위에서만 허용됩니다.');
    } else {
      blockers.push(...validateApprovedAudioWritePreflight(args));
    }
  }
  if (!isLegacySafeTarget(args) && steps.includes('upload')) {
    if (!isOnlyUploadStage(args, steps) || !isApprovedUploadWriteTarget(args) || !args.upload) {
      blockers.push('창세기 1장 6절~10절 upload write는 --stage upload --write --upload 정확한 범위에서만 허용됩니다.');
    } else {
      blockers.push(...validateApprovedUploadWritePreflight(args));
    }
  }
  if (steps.includes('audio') && !args.overwrite) {
    blockers.push('audio stage --write는 MP3 재생성 보호를 위해 --overwrite가 필요합니다.');
  }
  if (steps.includes('upload') && !args.upload && !args.stages.includes('publish')) {
    blockers.push('upload stage --write는 실제 R2 업로드 보호를 위해 --upload 또는 --stage publish가 필요합니다.');
  }

  return blockers;
}

function runCommand(commandSpec) {
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

  let parsedStdout = null;
  try {
    parsedStdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsedStdout = null;
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    parsedStdout,
  };
}

function dryRunExecutesSteps(stages) {
  return stages.some((stage) => (
    stage === 'scripts' ||
    stage === 'audio' ||
    stage === 'upload' ||
    stage === 'manifest' ||
    stage === 'publish'
  ));
}

function buildPlan(args) {
  const steps = stagesToSteps(args.stages);
  const safetyBlockers = validateWriteSafety({ args, steps });
  const verses = [];
  const planOnly = args.dryRun && !dryRunExecutesSteps(args.stages);

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    verses.push({
      verse,
      chapter3: pad3(args.chapter),
      verse3: pad3(verse),
      steps: steps.map((step) => {
        const command = commandForStep({ args, verse, step });
        return {
          step,
          command: command.display,
          env: command.env,
          executed: false,
          skippedReason: planOnly ? 'master-dry-run-plan-only' : null,
        };
      }),
    });
  }

  return {
    steps,
    safetyBlockers,
    verses,
  };
}

function shouldExecuteStep({ args, stepPlan, versePlan }) {
  if (!args.dryRun) {
    return { execute: true, skippedReason: null };
  }

  if (args.stages.includes('scripts')) {
    if (stepPlan.step === 'build-scripts') {
      return { execute: true, skippedReason: null };
    }

    if (stepPlan.step === 'validate-scripts') {
      if (!hasGeneratedScripts(args, versePlan.verse)) {
        return { execute: false, skippedReason: 'tts-scripts-missing-for-validate' };
      }

      return { execute: true, skippedReason: null };
    }
  }

  if (args.stages.includes('audio') && stepPlan.step === 'audio') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('upload') || args.stages.includes('publish')) && stepPlan.step === 'upload') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('manifest') || args.stages.includes('publish')) && stepPlan.step === 'cue-check') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('manifest') || args.stages.includes('publish')) && stepPlan.step === 'manifest') {
    return { execute: true, skippedReason: null };
  }

  return { execute: false, skippedReason: 'master-dry-run-plan-only' };
}

function executePlan({ args, plan }) {
  if (plan.safetyBlockers.length > 0) return plan;

  const safetyBlockers = [...plan.safetyBlockers];

  return {
    ...plan,
    safetyBlockers,
    verses: plan.verses.map((versePlan) => {
      let previousStepFailed = false;

      return {
        ...versePlan,
        steps: versePlan.steps.map((stepPlan) => {
          if (previousStepFailed) {
            return {
              ...stepPlan,
              executed: false,
              skippedReason: 'previous-step-failed',
            };
          }

          const decision = shouldExecuteStep({ args, stepPlan, versePlan });
          if (!decision.execute) {
            return {
              ...stepPlan,
              executed: false,
              skippedReason: decision.skippedReason,
            };
          }

          const command = commandForStep({ args, verse: versePlan.verse, step: stepPlan.step });
          const result = runCommand(command);
          if (stepPlan.step === 'cue-check' && result.exitCode !== 0) {
            safetyBlockers.push(`cue-check 실패: ${args.bookId} ${args.chapter}:${versePlan.verse} 매튜헨리 cue 누락을 먼저 보완해야 합니다.`);
          }
          if (result.exitCode !== 0) {
            previousStepFailed = true;
          }

          return {
            ...stepPlan,
            executed: true,
            skippedReason: null,
            result,
          };
        }),
      };
    }),
  };
}

function writeReport(output) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(
    REPORT_DIR,
    `${timestampForFileName()}-${output.target.bookId}-${pad3(output.target.chapter)}-${pad3(output.target.fromVerse)}-${pad3(output.target.toVerse)}-${output.stages.join('+')}-${output.mode}.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return reportPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeTarget(args);

  const initialPlan = buildPlan(args);
  const finalPlan = executePlan({ args, plan: initialPlan });
  const executedStepCount = finalPlan.verses.reduce((count, verse) => (
    count + verse.steps.filter((step) => step.executed).length
  ), 0);
  const hasFailures = finalPlan.verses.some((verse) => (
    verse.steps.some((step) => step.result && step.result.exitCode !== 0)
  ));
  const summary = buildPipelineSummary({ args, finalPlan });

  const output = {
    mode: args.write ? 'write' : 'dry-run',
    masterDryRunPlanOnly: args.dryRun && executedStepCount === 0,
    reportWritten: false,
    ...summary,
    target: {
      locale: args.locale,
      bookId: args.bookId,
      chapter: args.chapter,
      fromVerse: args.fromVerse,
      toVerse: args.toVerse,
      targetCount: args.toVerse - args.fromVerse + 1,
    },
    stages: args.stages,
    plannedSteps: finalPlan.steps,
    safetyBlockers: finalPlan.safetyBlockers,
    success: finalPlan.safetyBlockers.length === 0 && !hasFailures,
    plan: finalPlan.verses,
  };

  if (args.report) {
    const reportPath = writeReport(output);
    output.reportWritten = true;
    output.reportPath = toRelativePath(reportPath);
  }

  console.log(JSON.stringify(output, null, 2));

  if (finalPlan.safetyBlockers.length > 0 || hasFailures) {
    process.exitCode = 1;
  }
}

main();
