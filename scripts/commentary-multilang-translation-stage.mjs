#!/usr/bin/env node
/**
 * Commentary multilang v2 translation staging + batched translate-run CLI.
 * Writes jobs/results/staged artifacts under /tmp only.
 * Network translation requires --execute-network.
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
import { stageCardsFromTranslationResults } from './lib/commentary-multilang-cards.mjs';
import {
  buildAutoApproveCandidateReport,
  stageNarrationFromTranslationResults,
} from './lib/commentary-multilang-narration-stage.mjs';
import {
  assertStagingPath,
  buildTranslationJobs,
  readJsonlFile,
  summarizeTranslationJobs,
  validateTranslationResults,
  writeJsonlFile,
} from './lib/commentary-multilang-translation-io.mjs';
import {
  estimateTranslationApiCalls,
  runBatchedTranslation,
} from './lib/commentary-multilang-translation-batch.mjs';
import {
  assertNoSecretLeak,
  createOpenAiTranslationProvider,
  resolveOpenAiApiKey,
} from './lib/commentary-multilang-translation-provider.mjs';
import { evaluateTargetQa, TRANSLATION_QA_STATUS } from './lib/commentary-multilang-qa.mjs';

const __filename = fileURLToPath(import.meta.url);

const STEP_ALIASES = Object.freeze({
  plan: 'plan',
  extract: 'extract',
  'export-jobs': 'export-jobs',
  'translate-export': 'export-jobs',
  'translate-run': 'translate-run',
  'import-results': 'import-results',
  'translate-import': 'import-results',
  'stage-cards': 'stage-cards',
  'cards-stage': 'stage-cards',
  'stage-narration': 'stage-narration',
  'narration-stage': 'stage-narration',
  'translation-qa': 'translation-qa',
  'approval-report': 'approval-report',
  report: 'report',
});

function parseArgs(argv) {
  const args = {
    book: 'genesis',
    from: null,
    to: null,
    languages: 'en-US,ja-JP',
    types: 'all',
    steps: 'export-jobs',
    jobs: null,
    results: null,
    stagingRoot: '/tmp/gomna-commentary-v2-staging',
    checkpoint: null,
    resume: false,
    report: null,
    executeNetwork: false,
    concurrency: 2,
    maxApiCalls: 2,
    maxAttempts: 3,
    limit: null,
    provider: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (
      token === '--force' ||
      token === '--overwrite' ||
      token === '--upload' ||
      token === '--publish'
    ) {
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
    if (token === '--jobs') {
      args.jobs = take();
      continue;
    }
    if (token === '--results') {
      args.results = take();
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
    if (token === '--max-attempts') {
      args.maxAttempts = Number(take());
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
    '  node scripts/commentary-multilang-translation-stage.mjs \\',
    '    --book genesis --from 1:11 --to 1:11 \\',
    '    --languages en-US,ja-JP --types all \\',
    '    --steps plan,extract,translate-export,translate-run,translate-import,cards-stage,narration-stage,translation-qa,approval-report,report \\',
    '    --jobs /tmp/.../jobs.jsonl --results /tmp/.../results.jsonl \\',
    '    --staging-root /tmp/... [--execute-network]',
    '',
    'translate-run defaults to preflight (cost/request estimate only).',
    'Pass --execute-network to call the translation API (batched: 1 call per verse+locale).',
  ].join('\n');
}

function resolveSteps(raw) {
  const blocked = new Set([
    'translate',
    'approve',
    'tts',
    'cues',
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
        throw new Error(`Blocked network/audio/publish step: ${step}`);
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

export async function runTranslationStaging(argv = [], runtime = {}) {
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

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repositoryHead,
    command: [
      'node',
      'scripts/commentary-multilang-translation-stage.mjs',
      ...argv,
    ].join(' '),
    steps,
    stagingRoot,
    executeNetwork: !!args.executeNetwork,
    externalApiCalls: 0,
    ttsCalls: 0,
    r2Calls: 0,
    manifestWrites: 0,
    repoCardWrites: 0,
    repoNarrationWrites: 0,
    approvedWrites: 0,
    structuralQaPassCount: 0,
    translationQaPassCount: 0,
    translationQaFailCount: 0,
    translationQaReviewCount: 0,
    translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
    autoApproveCandidateCount: 0,
    estimatedApiCalls: 0,
    jobs: null,
    translateRun: null,
    importValidation: null,
    cards: null,
    narration: null,
    resume: null,
    approvalCandidates: null,
  };

  if (!args.from || !args.to) {
    throw new Error('--from and --to are required');
  }

  const plan = buildCommentaryMultilangRangeTargets({
    bookId: args.book,
    from: args.from,
    to: args.to,
    locales: args.languages,
    types: args.types,
  });

  if (steps.includes('plan') || steps.includes('extract')) {
    console.log('○ plan/extract');
    console.log(
      `  ${plan.bookId} ${plan.from.chapter}:${plan.from.verse}-${plan.to.chapter}:${plan.to.verse} targets=${plan.targetCount}`,
    );
  }

  let targets = plan.targets;
  if (Number.isInteger(args.limit) && args.limit > 0) {
    targets = targets.slice(0, args.limit);
  }

  if (args.resume && checkpoint) {
    const reuse = countResumeReuse(checkpoint, targets);
    report.resume = {
      reusableCompletedCount: reuse.reusable,
      reprocessCount: reuse.reprocess,
      totalConsidered: reuse.total,
    };
    targets = targets.filter((target) =>
      shouldProcessTarget(checkpoint, target, { resume: true }),
    );
  }

  const structuralResults = plan.targets.map((target) => evaluateTargetQa(target));
  report.structuralQaPassCount = structuralResults.filter(
    (item) => item.structuralGrade === 'PASS',
  ).length;

  let jobs = [];
  const needsJobs =
    steps.includes('export-jobs') ||
    steps.includes('translate-run') ||
    steps.includes('import-results') ||
    steps.includes('stage-cards') ||
    steps.includes('stage-narration') ||
    steps.includes('translation-qa') ||
    steps.includes('approval-report');

  if (needsJobs) {
    if (steps.includes('export-jobs')) {
      if (!args.jobs) throw new Error('--jobs is required for export-jobs');
      assertStagingPath(args.jobs, '--jobs');
      const jobBundle = buildTranslationJobs(
        Number.isInteger(args.limit) && args.limit > 0
          ? plan.targets.slice(0, args.limit)
          : plan.targets,
      );
      jobs = jobBundle.jobs;
      const written = writeJsonlFile(args.jobs, jobs, { requireTmp: true });
      report.jobs = {
        ...summarizeTranslationJobs(jobs),
        path: written.path,
        sha256: written.sha256,
        duplicateTargetIds: 0,
        missingSourceHashCount: 0,
      };
      console.log('○ export-jobs / translate-export');
      console.log(
        `  lines=${jobs.length} en=${report.jobs.countsByLocale['en-US'] || 0} ja=${report.jobs.countsByLocale['ja-JP'] || 0}`,
      );
      console.log(`  wrote ${written.path}`);
      if (checkpoint) {
        for (const job of jobs) {
          upsertCheckpointItem(
            checkpoint,
            {
              bookId: job.bookId,
              chapter: job.chapter,
              verse: job.verse,
              type: job.type,
              locale: job.locale,
              audioId: job.audioId,
            },
            {
              status: 'jobs-exported',
              sourceHash: job.sourceHash,
              resumeComplete: false,
            },
          );
        }
      }
    } else if (args.jobs) {
      jobs = readJsonlFile(args.jobs).records.map((item) => item.value);
    } else {
      jobs = buildTranslationJobs(
        Number.isInteger(args.limit) && args.limit > 0
          ? plan.targets.slice(0, args.limit)
          : plan.targets,
      ).jobs;
    }
  }

  if (steps.includes('translate-run')) {
    if (!args.results) {
      throw new Error('--results is required for translate-run');
    }
    assertStagingPath(args.results, '--results');

    let jobsForRun = jobs;
    if (args.resume && checkpoint) {
      jobsForRun = jobs.filter((job) =>
        shouldProcessTarget(
          checkpoint,
          {
            bookId: job.bookId,
            chapter: job.chapter,
            verse: job.verse,
            type: job.type,
            locale: job.locale,
          },
          { resume: true },
        ),
      );
    }

    const estimate = estimateTranslationApiCalls(jobsForRun);
    report.estimatedApiCalls = estimate.estimatedApiCalls;
    console.log('○ translate-run');
    console.log(
      `  targets=${estimate.targetCount} eligible=${estimate.eligibleTargetCount} estimatedApiCalls=${estimate.estimatedApiCalls}`,
    );

    let provider = runtime.provider || args.provider || null;
    if (args.executeNetwork && !provider) {
      const apiKey = resolveOpenAiApiKey();
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY is missing (required for --execute-network)',
        );
      }
      provider = createOpenAiTranslationProvider({ apiKey });
    }

    const run = await runBatchedTranslation(jobsForRun, {
      executeNetwork: args.executeNetwork,
      provider,
      concurrency: args.concurrency,
      maxApiCalls: args.maxApiCalls,
      maxAttempts: args.maxAttempts,
      backoffMs: runtime.backoffMs,
    });

    report.translateRun = {
      executeNetwork: !!args.executeNetwork,
      ok: run.ok,
      preflight: !!run.preflight,
      estimatedApiCalls: run.estimatedApiCalls,
      batchCount: run.batchCount,
      resultCount: (run.results || []).length,
      failedBatches: (run.failedBatches || []).length,
      skippedApprovedCount: run.skippedApprovedCount,
      blockedReason: run.blockedReason || null,
      counters: run.counters,
    };
    report.externalApiCalls = run.counters?.totalCalls || 0;

    if (args.executeNetwork) {
      if (!run.ok) {
        throw new Error(
          run.blockedReason ||
            `translate-run failed batches=${(run.failedBatches || []).length}`,
        );
      }
      const written = writeJsonlFile(args.results, run.results, {
        requireTmp: true,
      });
      console.log(
        `  wrote results=${run.results.length} apiCalls=${run.counters.totalCalls} ${written.path}`,
      );
      if (checkpoint) {
        for (const result of run.results) {
          const job = jobs.find((row) => row.targetId === result.targetId);
          if (!job) continue;
          upsertCheckpointItem(
            checkpoint,
            {
              bookId: job.bookId,
              chapter: job.chapter,
              verse: job.verse,
              type: job.type,
              locale: job.locale,
              audioId: job.audioId,
            },
            {
              status: 'translation-batch-ok',
              sourceHash: job.sourceHash,
              resumeComplete: true,
            },
          );
        }
        for (const failed of run.failedBatches || []) {
          for (const targetId of jobs
            .filter((job) => buildBatchId(job) === failed.batchId)
            .map((job) => job.targetId)) {
            const job = jobs.find((row) => row.targetId === targetId);
            if (!job) continue;
            upsertCheckpointItem(
              checkpoint,
              {
                bookId: job.bookId,
                chapter: job.chapter,
                verse: job.verse,
                type: job.type,
                locale: job.locale,
              },
              {
                status: 'translation-batch-failed',
                sourceHash: job.sourceHash,
                resumeComplete: false,
                reasons: [failed.error || 'batch_failed'],
              },
            );
          }
        }
      }
    } else {
      console.log(
        `  preflight only; pass --execute-network to run (maxApiCalls=${args.maxApiCalls})`,
      );
    }
  }

  let importValidation = null;
  let resultRecords = [];
  const needsImport =
    steps.includes('import-results') ||
    steps.includes('stage-cards') ||
    steps.includes('stage-narration') ||
    steps.includes('translation-qa') ||
    steps.includes('approval-report');

  if (needsImport && (steps.includes('import-results') || steps.includes('translation-qa') || steps.includes('stage-cards') || steps.includes('stage-narration') || steps.includes('approval-report'))) {
    if (!args.results) {
      throw new Error('--results is required for import/stage/qa steps');
    }
    if (!fs.existsSync(args.results) && !args.executeNetwork) {
      // import after preflight-only translate-run is not expected
      if (!steps.includes('translate-run') || args.executeNetwork) {
        throw new Error(`Results JSONL missing: ${args.results}`);
      }
    }
    if (fs.existsSync(args.results)) {
      assertStagingPath(args.results, '--results');
      const loaded = readJsonlFile(args.results);
      if (loaded.parseErrors.length) {
        throw new Error(
          `Results JSONL parse errors: ${loaded.parseErrors[0].error}`,
        );
      }
      resultRecords = loaded.records;
      importValidation = validateTranslationResults(jobs, resultRecords, {
        expectJobOrder: false,
      });
      report.importValidation = {
        ok: importValidation.ok,
        resultCount: importValidation.resultCount,
        jobCount: importValidation.jobCount,
        duplicateIds: importValidation.duplicateIds.length,
        missingIds: importValidation.missingIds.length,
        orderErrors: importValidation.orderErrors.length,
        hangulErrors: importValidation.hangulErrors.length,
        sourceHashMismatches: importValidation.sourceHashMismatches.length,
        errorCount: importValidation.errors.length,
      };
      report.translationQaPassCount = importValidation.perTarget.filter(
        (item) => item.ok,
      ).length;
      report.translationQaFailCount = importValidation.perTarget.filter(
        (item) => !item.ok,
      ).length;
      report.translationQaStatus = 'run';
      console.log('○ import-results / translation-qa');
      console.log(
        `  ok=${importValidation.ok} pass=${report.translationQaPassCount} fail=${report.translationQaFailCount}`,
      );
      if (checkpoint) {
        for (const item of importValidation.perTarget) {
          const job = jobs.find((row) => row.targetId === item.targetId);
          if (!job) continue;
          upsertCheckpointItem(
            checkpoint,
            {
              bookId: job.bookId,
              chapter: job.chapter,
              verse: job.verse,
              type: job.type,
              locale: job.locale,
              audioId: job.audioId,
            },
            {
              status: item.ok
                ? 'translation-qa-passed'
                : 'translation-qa-failed',
              sourceHash: job.sourceHash,
              translationQaStatus: item.translationQaStatus,
              resumeComplete: item.ok,
              reasons: item.reasons,
            },
          );
        }
      }
    }
  }

  if (steps.includes('stage-cards')) {
    if (!importValidation?.ok) {
      throw new Error('stage-cards requires successful import-results validation');
    }
    const cards = stageCardsFromTranslationResults(jobs, resultRecords, {
      stagingRoot,
    });
    report.cards = {
      written: cards.written,
      stagedCount: cards.stagedCount,
      lockedConflicts: cards.lockedConflicts.length,
      failed: cards.failed.length,
      repoWrites: 0,
    };
    console.log('○ cards-stage');
    console.log(
      `  staged=${cards.stagedCount} lockedConflicts=${cards.lockedConflicts.length} repoWrites=0`,
    );
  }

  let narrationResult = null;
  if (steps.includes('stage-narration')) {
    if (!importValidation?.ok) {
      throw new Error(
        'stage-narration requires successful import-results validation',
      );
    }
    narrationResult = stageNarrationFromTranslationResults(jobs, resultRecords, {
      stagingRoot,
    });
    report.narration = {
      writtenCount: narrationResult.writtenCount,
      lockedSkip: narrationResult.lockedSkip.length,
      lockedConflict: narrationResult.lockedConflict.length,
      failed: narrationResult.failed.length,
      repoWrites: 0,
      approvedWrites: 0,
    };
    console.log('○ narration-stage');
    console.log(
      `  written=${narrationResult.writtenCount} lockedSkip=${narrationResult.lockedSkip.length} lockedConflict=${narrationResult.lockedConflict.length}`,
    );
  }

  if (
    steps.includes('report') ||
    steps.includes('approval-report') ||
    args.report
  ) {
    const approval = buildAutoApproveCandidateReport({
      structuralResults,
      translationResults: importValidation?.perTarget || [],
      lockedSkip: narrationResult?.lockedSkip || [],
      lockedConflict: narrationResult?.lockedConflict || [],
    });
    report.approvalCandidates = approval;
    report.autoApproveCandidateCount = approval.autoApproveCandidateCount;
    report.translationQaPassCount =
      approval.translationQaPassCount || report.translationQaPassCount;
    if (importValidation) report.translationQaStatus = 'run';

    if (args.report) {
      assertStagingPath(args.report, '--report');
      fs.mkdirSync(path.dirname(args.report), { recursive: true });
      const body = `${JSON.stringify(report, null, 2)}\n`;
      assertNoSecretLeak(body, resolveOpenAiApiKey());
      fs.writeFileSync(args.report, body, 'utf8');
      console.log('○ report / approval-report');
      console.log(`  wrote ${args.report}`);
    }
  }

  if (checkpoint && args.checkpoint) {
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log('○ checkpoint');
    console.log(`  wrote ${args.checkpoint}`);
  }

  assertNoSecretLeak(JSON.stringify(report), resolveOpenAiApiKey());
  return { ok: true, report, jobs, plan, importValidation };
}

function buildBatchId(job) {
  return [job.bookId, Number(job.chapter), Number(job.verse), job.locale].join(
    '|',
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runTranslationStaging(process.argv.slice(2)).catch((error) => {
    console.error(`○ ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
