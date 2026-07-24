#!/usr/bin/env node
/**
 * Commentary multilang v2 audio + cue staging CLI.
 * Steps: plan, extract, tts-run, cue-run, audio-verify, report
 *
 * - Translation QA PASS only (SOURCE_REVIEW_REQUIRED excluded)
 * - Writes only under --staging-root (/tmp)
 * - Never writes approved status, ops audio/v1, audio/cues, R2, or manifest
 * - Network TTS requires --execute-network
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCommentaryMultilangRangeTargets,
} from './lib/commentary-multilang-targets.mjs';
import {
  countResumeReuse,
  createEmptyCheckpoint,
  detectRepositoryHead,
  loadCheckpoint,
  saveCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from './lib/commentary-multilang-checkpoint.mjs';
import {
  assertStagingPath,
  buildTranslationJobs,
  readJsonlFile,
} from './lib/commentary-multilang-translation-io.mjs';
import {
  CUE_DECISION,
  classifyAudioEligibleTargets,
  processAudioCueTarget,
  runAudioCueStagingBatch,
  verifyStagedAudioCue,
  buildAudioCueStagingTarget,
} from './lib/commentary-multilang-audio-cue-stage.mjs';
import { createApiCallBudget } from './lib/commentary-multilang-translation-budget.mjs';
import { resolveOpenAiApiKey } from './lib/commentary-multilang-translation-provider.mjs';

const __filename = fileURLToPath(import.meta.url);

const STEP_ALIASES = Object.freeze({
  plan: 'plan',
  extract: 'extract',
  'tts-run': 'tts-run',
  'cue-run': 'cue-run',
  'audio-verify': 'audio-verify',
  report: 'report',
});

const FORBIDDEN = new Set([
  '--force',
  '--overwrite',
  '--upload',
  '--publish',
  '--manifest',
]);

function parseArgs(argv) {
  const args = {
    book: 'genesis',
    from: null,
    to: null,
    languages: 'en-US,ja-JP',
    types: 'all',
    steps: 'plan,extract,tts-run,cue-run,audio-verify,report',
    results: null,
    jobs: null,
    stagingRoot: '/tmp/gomna-commentary-v2-audio-staging',
    checkpoint: null,
    resume: false,
    report: null,
    executeNetwork: false,
    concurrency: 1,
    maxApiCalls: 30,
    limit: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (FORBIDDEN.has(token)) {
      throw new Error(`Forbidden flag: ${token}`);
    }
    const take = () => {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error(`Missing value for ${token}`);
      }
      i += 1;
      return value;
    };
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--book') {
      args.book = take();
      continue;
    }
    if (token === '--from') {
      args.from = take();
      continue;
    }
    if (token === '--to') {
      args.to = take();
      continue;
    }
    if (token === '--languages' || token === '--locales') {
      args.languages = take();
      continue;
    }
    if (token === '--types' || token === '--type') {
      args.types = take();
      continue;
    }
    if (token === '--steps') {
      args.steps = take();
      continue;
    }
    if (token === '--results') {
      args.results = take();
      continue;
    }
    if (token === '--jobs') {
      args.jobs = take();
      continue;
    }
    if (token === '--staging-root') {
      args.stagingRoot = take();
      continue;
    }
    if (token === '--checkpoint') {
      args.checkpoint = take();
      continue;
    }
    if (token === '--resume') {
      args.resume = true;
      continue;
    }
    if (token === '--report') {
      args.report = take();
      continue;
    }
    if (token === '--execute-network') {
      args.executeNetwork = true;
      continue;
    }
    if (token === '--concurrency') {
      args.concurrency = Number(take());
      continue;
    }
    if (token === '--max-api-calls') {
      args.maxApiCalls = Number(take());
      continue;
    }
    if (token === '--limit') {
      args.limit = Number(take());
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printUsage() {
  return [
    'Usage:',
    '  node scripts/commentary-multilang-audio-stage.mjs \\',
    '    --book genesis --from 1:21 --to 1:21 \\',
    '    --languages en-US,ja-JP --types all \\',
    '    --steps plan,extract,tts-run,cue-run,audio-verify,report \\',
    '    --results /tmp/.../results.jsonl \\',
    '    --staging-root /tmp/gomna-commentary-v2-phase4-genesis-1-21 \\',
    '    --checkpoint /tmp/.../checkpoint.json \\',
    '    --max-api-calls 30 --concurrency 1 [--execute-network]',
    '',
    'Only translation QA PASS targets are processed.',
    'SOURCE_REVIEW_REQUIRED targets are excluded automatically.',
    'Network TTS requires --execute-network. Default is preflight only.',
  ].join('\n');
}

function resolveSteps(raw) {
  const blocked = new Set([
    'translate',
    'approve',
    'upload',
    'manifest',
    'publish',
  ]);
  const steps = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((step) => {
      if (blocked.has(step)) {
        throw new Error(`Blocked step: ${step}`);
      }
      const mapped = STEP_ALIASES[step];
      if (!mapped) throw new Error(`Unknown step: ${step}`);
      return mapped;
    });
  if (!steps.length) throw new Error('--steps is required');
  return [...new Set(steps)];
}

function loadEnvFiles(root) {
  for (const name of ['.env', '.env.local']) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
      );
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (!value || value.startsWith('#')) continue;
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '');
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function writeJson(filePath, data) {
  const absolute = assertStagingPath(filePath, 'report');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return absolute;
}

function snapshotOpsPaths(root) {
  const samples = [
    'audio/v1',
    'audio/cues',
    'audio/audio-manifest.json',
    'data/commentary-cards',
    'tts-scripts',
  ];
  const out = {};
  for (const rel of samples) {
    const abs = path.join(root, rel);
    out[rel] = {
      exists: fs.existsSync(abs),
      mtimeMs: fs.existsSync(abs) ? fs.statSync(abs).mtimeMs : null,
    };
  }
  return out;
}

export async function runAudioCueStaging(argv = [], runtime = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(printUsage());
    return { ok: true, help: true };
  }

  const steps = resolveSteps(args.steps);
  const stagingRoot = assertStagingPath(args.stagingRoot, '--staging-root');
  const repositoryHead = detectRepositoryHead();
  const root = process.env.GOMNA_ROOT || process.cwd();
  loadEnvFiles(root);

  if (!args.from || !args.to) {
    throw new Error('--from and --to are required');
  }
  if (!args.results) {
    throw new Error('--results is required (translation results.jsonl)');
  }
  assertStagingPath(args.results, '--results');

  let checkpoint = null;
  if (args.checkpoint) {
    assertStagingPath(args.checkpoint, '--checkpoint');
    checkpoint = loadCheckpoint(args.checkpoint, { repositoryHead });
    if (!checkpoint) {
      checkpoint = createEmptyCheckpoint({
        repositoryHead,
        plan: { book: args.book, from: args.from, to: args.to },
      });
    }
  } else if (args.resume) {
    throw new Error('--resume requires --checkpoint');
  }

  const opsBefore = snapshotOpsPaths(root);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repositoryHead,
    command: [
      'node',
      'scripts/commentary-multilang-audio-stage.mjs',
      ...argv,
    ].join(' '),
    steps,
    stagingRoot,
    executeNetwork: !!args.executeNetwork,
    externalApiCalls: 0,
    ttsCalls: 0,
    r2Calls: 0,
    manifestWrites: 0,
    approvedWrites: 0,
    opsWrites: 0,
    primaryAccepted: 0,
    fallbackAccepted: 0,
    manualReviewRequired: 0,
    excludedSourceReview: [],
    excludedNonPass: [],
    verified: null,
    resume: null,
    budget: null,
    results: [],
  };

  const plan = buildCommentaryMultilangRangeTargets({
    bookId: args.book,
    from: args.from,
    to: args.to,
    locales: args.languages,
    types: args.types,
  });

  let targets = plan.targets;
  if (Number.isInteger(args.limit) && args.limit > 0) {
    targets = targets.slice(0, args.limit);
  }

  if (steps.includes('plan') || steps.includes('extract')) {
    console.log('○ plan/extract');
    console.log(
      `  ${plan.bookId} ${plan.from.chapter}:${plan.from.verse}-${plan.to.chapter}:${plan.to.verse} targets=${targets.length}`,
    );
  }

  const jobsBundle = args.jobs
    ? { jobs: readJsonlFile(args.jobs).records.map((item) => item.value) }
    : buildTranslationJobs(targets);
  const jobs = jobsBundle.jobs || jobsBundle;
  const results = readJsonlFile(args.results).records.map(
    (item) => item.value || item,
  );

  const classified = classifyAudioEligibleTargets(jobs, results);
  report.excludedSourceReview = classified.sourceReviewExcluded;
  report.excludedNonPass = classified.excluded.filter(
    (item) => item.grade !== 'SOURCE_REVIEW_REQUIRED',
  );

  if (checkpoint) {
    for (const item of classified.excluded) {
      upsertCheckpointItem(checkpoint, item.job, {
        status: item.status,
        grade: item.grade,
        reasons: item.reasons || [item.reason],
        resumeComplete: true,
        sourceHash: item.job.sourceHash,
      });
    }
  }

  let eligible = classified.eligible;
  if (args.resume && checkpoint) {
    const reuse = countResumeReuse(
      checkpoint,
      eligible.map((item) => item.job),
    );
    report.resume = {
      reusableCompletedCount: reuse.reusable,
      reprocessCount: reuse.reprocess,
      totalConsidered: reuse.total,
    };
    eligible = eligible.filter((item) =>
      shouldProcessTarget(checkpoint, item.job, { resume: true }),
    );
  }

  console.log('○ eligibility');
  console.log(
    `  passEligible=${classified.eligibleCount} excluded=${classified.excludedCount} sourceReview=${classified.sourceReviewExcluded.length}`,
  );
  console.log(`  selectedForRun=${eligible.length}`);

  const needsNetwork =
    steps.includes('tts-run') || steps.includes('cue-run');

  if (needsNetwork) {
    if (!args.executeNetwork) {
      console.log('○ preflight (no --execute-network; zero TTS calls)');
      report.preflight = {
        eligibleCount: eligible.length,
        estimatedPrimaryTtsCalls: eligible.length,
        maxApiCalls: args.maxApiCalls,
      };
      for (const item of eligible) {
        const outcome = await processAudioCueTarget({
          job: item.job,
          result: item.result,
          stagingRoot,
          budget: createApiCallBudget(0),
          executeNetwork: false,
        });
        report.results.push(outcome);
      }
    } else {
      const apiKey =
        runtime.apiKey ||
        resolveOpenAiApiKey({
          env: process.env,
          required: true,
        });

      const batch = await runAudioCueStagingBatch({
        eligible,
        stagingRoot,
        maxApiCalls: args.maxApiCalls,
        executeNetwork: true,
        apiKey,
        fetchImpl: runtime.fetchImpl || globalThis.fetch,
        concurrency: args.concurrency,
        requestFn: runtime.requestFn,
        runStrategyA: runtime.runStrategyA,
        runStrategyB: runtime.runStrategyB,
        onTargetComplete: (outcome) => {
          console.log(
            `  ${outcome.targetId} => ${outcome.decision || outcome.status} api=${outcome.apiCalls || 0}`,
          );
          if (checkpoint) {
            upsertCheckpointItem(checkpoint, outcome.target || itemJob(outcome), {
              status: outcome.status,
              decision: outcome.decision,
              reasons: outcome.reasons || [],
              apiCalls: outcome.apiCalls || 0,
              mp3Path: outcome.mp3?.path || null,
              cuePath: outcome.cue?.path || null,
              resumeComplete: !!outcome.resumeComplete && !!outcome.ok,
              sourceHash: outcome.target?.sourceHash || null,
            });
          }
        },
      });

      report.results = batch.results;
      report.budget = batch.budget;
      report.externalApiCalls = batch.budget.consumed;
      report.ttsCalls = batch.budget.consumed;
      report.primaryAccepted = batch.summary.primaryAccepted;
      report.fallbackAccepted = batch.summary.fallbackAccepted;
      report.manualReviewRequired = batch.summary.manualReviewRequired;
      report.counters = batch.counters;
    }
  }

  if (steps.includes('audio-verify')) {
    const verifyResults = [];
    const toVerify = (report.results.length
      ? report.results
      : classified.eligible.map((item) => ({
          ok: true,
          targetId: item.job.targetId,
          target: buildAudioCueStagingTarget(item.job, { stagingRoot }),
          decision: null,
        }))
    ).filter(
      (item) =>
        item.decision === CUE_DECISION.PRIMARY_ACCEPTED ||
        item.decision === CUE_DECISION.FALLBACK_ACCEPTED ||
        (item.target && fs.existsSync(item.target.audioAbs)),
    );

    for (const item of toVerify) {
      const target =
        item.target ||
        buildAudioCueStagingTarget(
          classified.eligible.find((row) => row.job.targetId === item.targetId)
            ?.job,
          { stagingRoot },
        );
      if (!target) continue;
      const verified = verifyStagedAudioCue(target);
      verifyResults.push({
        targetId: item.targetId,
        decision: item.decision,
        ...verified,
      });
      if (checkpoint && verified.ok) {
        upsertCheckpointItem(checkpoint, target, {
          status: 'audio-verify-passed',
          decision: item.decision,
          resumeComplete: true,
          sourceHash: target.sourceHash,
        });
      }
    }

    report.verified = {
      total: verifyResults.length,
      okCount: verifyResults.filter((item) => item.ok).length,
      failCount: verifyResults.filter((item) => !item.ok).length,
      items: verifyResults,
    };
    console.log('○ audio-verify');
    console.log(
      `  ok=${report.verified.okCount} fail=${report.verified.failCount}`,
    );
  }

  const opsAfter = snapshotOpsPaths(root);
  const opsChanged = Object.keys(opsBefore).filter(
    (key) =>
      opsBefore[key].mtimeMs !== opsAfter[key].mtimeMs ||
      opsBefore[key].exists !== opsAfter[key].exists,
  );
  report.opsWrites = opsChanged.length;
  report.opsChangedPaths = opsChanged;
  report.approvedWrites = 0;
  report.r2Calls = 0;
  report.manifestWrites = 0;

  if (steps.includes('report')) {
    report.generatedAt = new Date().toISOString();
    if (args.report) {
      const reportPath = writeJson(args.report, report);
      console.log('○ report');
      console.log(`  wrote ${reportPath}`);
    } else {
      console.log('○ report (summary only)');
    }
    console.log(
      `  PRIMARY=${report.primaryAccepted} FALLBACK=${report.fallbackAccepted} MANUAL=${report.manualReviewRequired}`,
    );
    console.log(
      `  ttsCalls=${report.ttsCalls} sourceReviewExcluded=${report.excludedSourceReview.length} opsWrites=${report.opsWrites}`,
    );
  }

  if (checkpoint && args.checkpoint) {
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log('○ checkpoint');
    console.log(`  wrote ${path.resolve(args.checkpoint)}`);
  }

  return { ok: true, report, checkpoint };
}

function itemJob(outcome) {
  return (
    outcome.target || {
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'history',
      locale: 'en-US',
    }
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runAudioCueStaging(process.argv.slice(2)).catch((error) => {
    console.error(`○ ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
