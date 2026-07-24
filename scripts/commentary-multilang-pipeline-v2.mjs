#!/usr/bin/env node
/**
 * Commentary multilang pipeline v2 — phase 1 foundation.
 *
 * Allowed steps: plan, extract, qa, report
 * Blocked steps: translate, cards, approve, tts, cues, upload, manifest, publish
 *
 * Default: dry-run / local read-only.
 *
 * Structural QA PASS means Korean source/target shape is usable.
 * It does NOT mean EN/JA translation quality passed.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  buildApprovalCandidateReport,
  DEFAULT_BATCH_APPROVAL_MODE,
} from './lib/commentary-multilang-batch-policy.mjs';
import {
  buildTargetKey,
  countResumeReuse,
  createEmptyCheckpoint,
  detectRepositoryHead,
  listCheckpointFailures,
  loadCheckpoint,
  saveCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from './lib/commentary-multilang-checkpoint.mjs';
import {
  CUE_DECISION,
  describeCueStrategyPolicy,
  evaluateCueDocumentPolicy,
  selectCueStrategy,
} from './lib/commentary-multilang-cue-policy.mjs';
import {
  evaluateTargetQa,
  summarizeQaResults,
  TRANSLATION_QA_STATUS,
} from './lib/commentary-multilang-qa.mjs';
import {
  buildCommentaryMultilangRangeTargets,
} from './lib/commentary-multilang-targets.mjs';
import { resolveCommentaryTypes } from './lib/commentary-type-registry.mjs';

const __filename = fileURLToPath(import.meta.url);

const REPORT_SCHEMA_VERSION = 1;

const FORBIDDEN_FLAGS = new Set([
  '--force',
  '--overwrite',
  '--upload',
  '--publish',
  '--manifest',
]);

const ALLOWED_STEPS = new Set(['plan', 'extract', 'qa', 'report']);
const BLOCKED_STEPS = new Set([
  'translate',
  'cards',
  'approve',
  'tts',
  'cues',
  'upload',
  'manifest',
  'publish',
  'publish-verify',
]);

const DEFAULT_STEPS = ['plan', 'extract', 'qa', 'report'];

function printUsage() {
  return [
    'Usage (phase-1 foundation):',
    '  node scripts/commentary-multilang-pipeline-v2.mjs \\',
    '    --book genesis --from 1:11 --to 1:31 \\',
    '    --languages en-US,ja-JP --types all \\',
    '    --steps plan,extract,qa,report \\',
    '    --dry-run --resume \\',
    '    --checkpoint /tmp/gomna-commentary-v2-checkpoint.json \\',
    '    --report /tmp/gomna-commentary-v2-report.json',
    '',
    'Notes:',
    '  Structural QA PASS != translation quality pass.',
    '  Phase-1 blocks translate/tts/upload/manifest/publish.',
    '  Batched translate-run lives in scripts/commentary-multilang-translation-stage.mjs',
    '  (requires --execute-network; default is preflight estimate only).',
    '  Audio/cue staging lives in scripts/commentary-multilang-audio-stage.mjs',
    '  (PASS-only; /tmp staging; requires --execute-network for TTS).',
  ].join('\n');
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectBranch(cwd = process.cwd()) {
  const result = spawnSync('git', ['branch', '--show-current'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function parseArgs(argv) {
  const args = {
    book: null,
    chapter: null,
    from: null,
    to: null,
    fromVerse: null,
    toVerse: null,
    languages: 'en-US,ja-JP',
    types: 'all',
    steps: null,
    dryRun: true,
    resume: false,
    checkpoint: null,
    report: null,
    limit: null,
    concurrency: 1,
    mode: 'plan',
    failFast: false,
    batchApprovalMode: DEFAULT_BATCH_APPROVAL_MODE,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (FORBIDDEN_FLAGS.has(token)) {
      throw new Error(`Forbidden flag: ${token}`);
    }
    const take = (label) => {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error(`Missing value for ${label}`);
      }
      i += 1;
      return value;
    };

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--book') {
      args.book = take('--book');
      continue;
    }
    if (token === '--chapter') {
      args.chapter = take('--chapter');
      continue;
    }
    if (token === '--from') {
      args.from = take('--from');
      continue;
    }
    if (token === '--to') {
      args.to = take('--to');
      continue;
    }
    if (token === '--from-verse') {
      args.fromVerse = take('--from-verse');
      continue;
    }
    if (token === '--to-verse') {
      args.toVerse = take('--to-verse');
      continue;
    }
    if (token === '--languages' || token === '--locales') {
      args.languages = take(token);
      continue;
    }
    if (token === '--types' || token === '--type') {
      args.types = take(token);
      continue;
    }
    if (token === '--steps') {
      args.steps = take('--steps');
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--write') {
      throw new Error(
        'Phase-1 foundation is read-only. --write is not permitted.',
      );
    }
    if (token === '--resume') {
      args.resume = true;
      continue;
    }
    if (token === '--checkpoint') {
      args.checkpoint = take('--checkpoint');
      continue;
    }
    if (token === '--report') {
      args.report = take('--report');
      continue;
    }
    if (token === '--limit') {
      args.limit = Number(take('--limit'));
      continue;
    }
    if (token === '--concurrency') {
      args.concurrency = Number(take('--concurrency'));
      continue;
    }
    if (token === '--mode') {
      args.mode = take('--mode');
      continue;
    }
    if (token === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (token === '--batch-approval-mode') {
      args.batchApprovalMode = take('--batch-approval-mode');
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function resolveSteps(args) {
  const requested = args.steps ? parseCsv(args.steps) : DEFAULT_STEPS.slice();
  if (!requested.length) {
    throw new Error('--steps must not be empty');
  }

  const blocked = requested.filter((step) => BLOCKED_STEPS.has(step));
  if (blocked.length) {
    throw new Error(
      `This v2 phase does not permit network, audio generation, upload, manifest, or publish steps. Blocked: ${blocked.join(', ')}`,
    );
  }

  const unknown = requested.filter(
    (step) => !ALLOWED_STEPS.has(step) && !BLOCKED_STEPS.has(step),
  );
  if (unknown.length) {
    throw new Error(`Unknown steps: ${unknown.join(', ')}`);
  }

  return DEFAULT_STEPS.filter((step) => requested.includes(step));
}

function assertArgs(args) {
  if (!args.book) {
    throw new Error('--book is required');
  }
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error(`Invalid --limit: ${args.limit}`);
  }
  if (
    args.concurrency != null &&
    (!Number.isInteger(args.concurrency) || args.concurrency < 1)
  ) {
    throw new Error(`Invalid --concurrency: ${args.concurrency}`);
  }
  if (args.concurrency > 8) {
    throw new Error('--concurrency above 8 is not permitted in phase-1');
  }
  if (args.resume && !args.checkpoint) {
    throw new Error('--resume requires --checkpoint');
  }
}

function applyLimit(targets, limit) {
  if (limit == null) return targets;
  return targets.slice(0, limit);
}

function writeJson(filePath, data) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return absolute;
}

function countBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function assessManifestRisk(targetCount) {
  // Rough guide from earlier survey: ~615 bytes/entry in single manifest.
  const projectedAddedBytes = targetCount * 615;
  if (targetCount >= 10000 || projectedAddedBytes >= 5_000_000) {
    return {
      level: 'high',
      projectedAddedBytes,
      note: 'Single audio-manifest.json growth risk; shard before large publish.',
    };
  }
  if (targetCount >= 1000) {
    return {
      level: 'medium',
      projectedAddedBytes,
      note: 'Monitor single-manifest size before book-wide publish.',
    };
  }
  return {
    level: 'low',
    projectedAddedBytes,
    note: 'Phase-1 does not write manifest.',
  };
}

export function buildPlanFromArgs(args) {
  const typeList = resolveCommentaryTypes({
    types: args.types,
  }).map((item) => item.type);

  const plan = buildCommentaryMultilangRangeTargets({
    bookId: args.book,
    book: args.book,
    from: args.from,
    to: args.to,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    locales: args.languages,
    types: args.types,
  });

  return {
    ...plan,
    types: typeList.length ? typeList : plan.types,
    mode: args.mode,
    dryRun: args.dryRun !== false,
    cuePolicy: describeCueStrategyPolicy(),
    defaultCueStrategy: selectCueStrategy({}),
  };
}

function buildNextCommand(args) {
  const parts = [
    'node scripts/commentary-multilang-pipeline-v2.mjs',
    `--book ${args.book}`,
  ];
  if (args.from && args.to) {
    parts.push(`--from ${args.from}`, `--to ${args.to}`);
  } else if (args.chapter != null) {
    parts.push(
      `--chapter ${args.chapter}`,
      `--from-verse ${args.fromVerse}`,
      `--to-verse ${args.toVerse}`,
    );
  }
  parts.push(
    `--languages ${args.languages}`,
    `--types ${args.types}`,
    '--steps plan,extract,qa,report',
    '--dry-run',
  );
  if (args.checkpoint) {
    parts.push('--resume', `--checkpoint ${args.checkpoint}`);
  }
  if (args.report) {
    parts.push(`--report ${args.report}`);
  }
  return parts.join(' ');
}

export async function runCommentaryMultilangPipelineV2(
  argv = process.argv.slice(2),
) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(printUsage());
    return { ok: true, help: true };
  }

  assertArgs(args);
  const steps = resolveSteps(args);
  const command = ['node', 'scripts/commentary-multilang-pipeline-v2.mjs', ...argv].join(
    ' ',
  );
  const repositoryHead = detectRepositoryHead();
  const branch = detectBranch();

  let checkpoint = null;
  let checkpointLoaded = false;
  if (args.checkpoint) {
    checkpoint = loadCheckpoint(args.checkpoint, { repositoryHead });
    if (!checkpoint) {
      checkpoint = createEmptyCheckpoint({
        repositoryHead,
        branch,
        plan: {
          book: args.book,
          from: args.from,
          to: args.to,
        },
      });
    } else {
      checkpointLoaded = true;
      checkpoint.repositoryHead = checkpoint.repositoryHead || repositoryHead;
      checkpoint.branch = checkpoint.branch || branch;
    }
  } else if (args.resume) {
    throw new Error('--resume requires --checkpoint');
  }

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repositoryHead,
    branch,
    command,
    phase: 'v2-phase-1-foundation',
    range: null,
    targetCount: 0,
    expectedMaximumTargetCount: 0,
    countsByLocale: {},
    countsByType: {},
    countsByChapter: {},
    existingCompletedCount: 0,
    plannedCount: 0,
    skippedCount: 0,
    structuralQaPassCount: 0,
    translationQaPassCount: 0,
    translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
    autoApproveCandidateCount: 0,
    reviewRequiredCount: 0,
    failCount: 0,
    batchStatus: null,
    sampleReviewTargetIds: [],
    cuePrimaryAcceptedCount: 0,
    cueFallbackRequiredCount: 0,
    manifestRisk: null,
    blockers: [],
    nextCommand: buildNextCommand(args),
    args: {
      book: args.book,
      from: args.from,
      to: args.to,
      chapter: args.chapter,
      fromVerse: args.fromVerse,
      toVerse: args.toVerse,
      languages: args.languages,
      types: args.types,
      steps,
      dryRun: true,
      resume: !!args.resume,
      limit: args.limit,
      concurrency: args.concurrency,
      mode: args.mode,
      batchApprovalMode: args.batchApprovalMode,
    },
    plan: null,
    extract: null,
    qa: null,
    approvalCandidates: null,
    resume: null,
    cuePolicy: describeCueStrategyPolicy(),
    checkpointPath: args.checkpoint || null,
    reportPath: args.report || null,
    publishBlocked: true,
    networkBlocked: true,
    externalApiCalls: 0,
    ttsCalls: 0,
    r2Calls: 0,
    manifestWrites: 0,
  };

  console.log('○ commentary multilang pipeline v2 (phase-1 foundation)');
  console.log('  dry-run=true; structural QA only; translation QA=not-run');
  console.log(`  steps=${steps.join(',')}`);

  let plan = null;
  let targets = [];
  let selectedTargets = [];

  if (steps.includes('plan') || steps.includes('extract') || steps.includes('qa')) {
    plan = buildPlanFromArgs(args);
    report.range = {
      bookId: plan.bookId,
      from: plan.from,
      to: plan.to,
      verseCount: plan.verseCount,
    };
    report.targetCount = plan.targetCount;
    report.expectedMaximumTargetCount = plan.verseCount * plan.types.length * plan.locales.length;
    report.countsByLocale = countBy(plan.targets, (item) => item.locale);
    report.countsByType = countBy(plan.targets, (item) => item.type);
    report.countsByChapter = countBy(
      plan.targets,
      (item) => String(item.chapter),
    );
    report.existingCompletedCount = plan.targets.filter(
      (item) =>
        item.narrationExists &&
        item.metaApproved &&
        item.audioExists &&
        item.cueExists &&
        item.manifestExists,
    ).length;
    report.manifestRisk = assessManifestRisk(plan.targetCount);
    report.plan = {
      bookId: plan.bookId,
      bookName: plan.bookName,
      from: plan.from,
      to: plan.to,
      verseCount: plan.verseCount,
      sourceCount: plan.sourceCount,
      targetCount: plan.targetCount,
      locales: plan.locales,
      types: plan.types,
      excludedCount: plan.excluded.length,
      excludedSample: plan.excluded.slice(0, 20),
    };
    report.blockers = plan.excluded.map(
      (item) =>
        `${item.chapter}:${item.verse}:${item.reason || 'excluded'}`,
    );

    console.log('○ plan');
    console.log(
      `  ${plan.bookId} ${plan.from.chapter}:${plan.from.verse}-${plan.to.chapter}:${plan.to.verse}`,
    );
    console.log(
      `  verses=${plan.verseCount} sources=${plan.sourceCount} targets=${plan.targetCount} excluded=${plan.excluded.length}`,
    );

    if (checkpoint) {
      checkpoint.plan = report.plan;
      checkpoint.repositoryHead = repositoryHead;
      checkpoint.branch = branch;
    }
  }

  if (steps.includes('extract') || steps.includes('qa') || steps.includes('report')) {
    targets = applyLimit(plan.targets, args.limit);
    const reuseBefore = args.resume && checkpoint
      ? countResumeReuse(checkpoint, targets)
      : { reusable: 0, reprocess: targets.length, total: targets.length };

    selectedTargets = targets;
    if (args.resume && checkpoint) {
      selectedTargets = targets.filter((target) =>
        shouldProcessTarget(checkpoint, target, { resume: true }),
      );
    }

    report.plannedCount = targets.length;
    report.skippedCount = reuseBefore.reusable;
    report.resume = {
      checkpointLoaded,
      reusableCompletedCount: reuseBefore.reusable,
      reprocessCount: selectedTargets.length,
      totalConsidered: targets.length,
    };
    report.extract = {
      selectedTargetCount: selectedTargets.length,
      limited: args.limit != null,
      resumeFiltered: !!(args.resume && checkpoint),
      reusableCompletedCount: reuseBefore.reusable,
      sample: selectedTargets.slice(0, 5).map((target) => ({
        audioId: target.audioId,
        cardCount: target.cardCount,
        narrationExists: target.narrationExists,
        metaApproved: target.metaApproved,
        audioExists: target.audioExists,
        cueExists: target.cueExists,
        manifestExists: target.manifestExists,
      })),
    };
    console.log('○ extract');
    console.log(
      `  selectedTargets=${selectedTargets.length} resumedSkip=${reuseBefore.reusable}`,
    );
  }

  let qaResults = [];
  if (steps.includes('qa')) {
    let cuePrimaryAcceptedCount = 0;
    let cueFallbackRequiredCount = 0;
    const selectedSet = new Set(selectedTargets);

    for (const target of targets) {
      const key = buildTargetKey(target);
      const resumeSkipped =
        args.resume &&
        checkpoint &&
        !selectedSet.has(target) &&
        !shouldProcessTarget(checkpoint, target, { resume: true });

      let result;
      if (resumeSkipped) {
        const item = checkpoint.items[key] || {};
        result = {
          targetKey: key,
          audioId: target.audioId,
          inventoryStatus: item.inventoryStatus || 'missing',
          resumeComplete: true,
          resumedFromCheckpoint: true,
          grade: item.structuralGrade || item.grade || 'PASS',
          structuralGrade: item.structuralGrade || item.grade || 'PASS',
          translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
          translationGrade: null,
          status: item.status || 'structural-qa-passed',
          reasons: item.reasons || [],
          cueDecision: item.cueDecision || null,
          note: 'resumed structural QA state from checkpoint (not re-evaluated)',
        };
      } else {
        result = evaluateTargetQa(target);

        if (target.cueExists) {
          try {
            const absolute = path.join(
              process.env.GOMNA_ROOT || process.cwd(),
              target.cuePath,
            );
            if (fs.existsSync(absolute)) {
              const document = JSON.parse(fs.readFileSync(absolute, 'utf8'));
              const cueDecision = evaluateCueDocumentPolicy(document, {
                cardCount: target.cardCount,
                durationSeconds:
                  document.duration || document.measuredDuration,
              });
              result.cueDecision = cueDecision.decision;
              if (cueDecision.decision === CUE_DECISION.PRIMARY_ACCEPTED) {
                cuePrimaryAcceptedCount += 1;
              } else if (
                cueDecision.decision === CUE_DECISION.FALLBACK_REQUIRED
              ) {
                cueFallbackRequiredCount += 1;
              }
            }
          } catch {
            cueFallbackRequiredCount += 1;
            result.cueDecision = CUE_DECISION.FALLBACK_REQUIRED;
          }
        }

        if (checkpoint) {
          upsertCheckpointItem(checkpoint, target, {
            status:
              result.structuralGrade === 'PASS'
                ? 'structural-qa-passed'
                : result.status,
            grade: result.structuralGrade,
            structuralGrade: result.structuralGrade,
            translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
            reasons: result.reasons,
            cueDecision: result.cueDecision || null,
            resumeComplete: result.structuralGrade === 'PASS',
          });
        }
      }

      if (
        resumeSkipped &&
        result.cueDecision === CUE_DECISION.PRIMARY_ACCEPTED
      ) {
        cuePrimaryAcceptedCount += 1;
      } else if (
        resumeSkipped &&
        result.cueDecision === CUE_DECISION.FALLBACK_REQUIRED
      ) {
        cueFallbackRequiredCount += 1;
      }

      qaResults.push(result);
      if (args.failFast && result.structuralGrade === 'FAIL') {
        throw new Error(
          `fail-fast: ${result.targetKey} => ${result.reasons.join('; ')}`,
        );
      }
    }

    const summary = summarizeQaResults(qaResults);
    const approval = buildApprovalCandidateReport(qaResults, {
      mode: args.batchApprovalMode,
    });

    report.qa = {
      ...summary,
      note: 'structuralQaPassCount is NOT translation quality pass',
    };
    report.structuralQaPassCount = summary.structuralQaPassCount;
    report.translationQaPassCount = 0;
    report.translationQaStatus = TRANSLATION_QA_STATUS.NOT_RUN;
    report.reviewRequiredCount = summary.structuralQaReviewCount;
    report.failCount = summary.structuralQaFailCount;
    report.autoApproveCandidateCount = 0;
    report.batchStatus = approval.batchStatus;
    report.sampleReviewTargetIds = approval.sampleReviewTargetIds;
    report.cuePrimaryAcceptedCount = cuePrimaryAcceptedCount;
    report.cueFallbackRequiredCount = cueFallbackRequiredCount;
    report.approvalCandidates = {
      mode: approval.mode,
      batchStatus: approval.batchStatus,
      candidateCount: approval.candidateCount,
      blockedCount: approval.blockedCount,
      autoApproveCandidateCount: 0,
      writesDisabled: approval.writesDisabled,
      translationAutoApproveDisabled: true,
      note: approval.note,
      sampleCount: approval.sample.sampleCount,
      sampleDistribution: approval.sample.distribution,
      sampleReviewTargetIds: approval.sampleReviewTargetIds,
      candidateSample: approval.candidates.slice(0, 20).map((item) => ({
        targetKey: item.targetKey,
        status: item.status,
        structuralGrade: item.structuralGrade,
      })),
    };

    console.log('○ qa (structural only; translationQaStatus=not-run)');
    console.log(
      `  structuralPass=${summary.structuralQaPassCount} review=${summary.structuralQaReviewCount} fail=${summary.structuralQaFailCount}`,
    );
    console.log(
      `  batchStatus=${approval.batchStatus} sample=${approval.sample.sampleCount} autoApproveCandidates=0`,
    );
  }

  if (steps.includes('report')) {
    report.generatedAt = new Date().toISOString();
    report.failures = listCheckpointFailures(checkpoint || { items: {} });
    if (!report.failures.length && qaResults.length) {
      report.failures = qaResults.filter(
        (item) =>
          item.structuralGrade === 'FAIL' ||
          item.structuralGrade === 'REVIEW_REQUIRED',
      );
    }
    report.nextCommand = buildNextCommand(args);

    if (args.report) {
      const reportPath = writeJson(args.report, report);
      console.log('○ report');
      console.log(`  wrote ${reportPath}`);
    } else {
      console.log('○ report');
      console.log('  (no --report path; printed summary only)');
    }
  }

  if (checkpoint && args.checkpoint) {
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log('○ checkpoint');
    console.log(`  wrote ${path.resolve(args.checkpoint)}`);
  }

  return {
    ok: true,
    report,
    plan,
    qaResults,
    checkpoint,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  runCommentaryMultilangPipelineV2(process.argv.slice(2)).catch((error) => {
    console.error(`○ ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
