#!/usr/bin/env node
/**
 * Offline translation staging CLI for commentary multilang v2.
 * Writes jobs/results/staged artifacts under /tmp only.
 * Never calls translation APIs, TTS, R2, or repository approved writers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCommentaryMultilangRangeTargets,
} from './lib/commentary-multilang-targets.mjs';
import {
  buildTargetKey,
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
import { evaluateTargetQa, TRANSLATION_QA_STATUS } from './lib/commentary-multilang-qa.mjs';

const __filename = fileURLToPath(import.meta.url);

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
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--force' || token === '--upload' || token === '--publish') {
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
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printUsage() {
  return [
    'Usage:',
    '  node scripts/commentary-multilang-translation-stage.mjs \\',
    '    --book genesis --from 1:11 --to 1:31 \\',
    '    --languages en-US,ja-JP --types all \\',
    '    --steps export-jobs \\',
    '    --jobs /tmp/.../jobs.jsonl',
    '',
    'Allowed steps: export-jobs, import-results, stage-cards, stage-narration, report',
    'All outputs must live under /tmp. No translation API / TTS / R2 / repo approved writes.',
  ].join('\n');
}

function resolveSteps(raw) {
  const allowed = new Set([
    'export-jobs',
    'import-results',
    'stage-cards',
    'stage-narration',
    'report',
  ]);
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
    .filter(Boolean);
  if (!steps.length) throw new Error('--steps is required');
  const bad = steps.filter((step) => blocked.has(step));
  if (bad.length) {
    throw new Error(
      `Blocked network/audio/publish steps: ${bad.join(', ')}`,
    );
  }
  const unknown = steps.filter((step) => !allowed.has(step));
  if (unknown.length) {
    throw new Error(`Unknown steps: ${unknown.join(', ')}`);
  }
  return steps;
}

export async function runTranslationStaging(argv = []) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(printUsage());
    return { ok: true, help: true };
  }

  const steps = resolveSteps(args.steps);
  const stagingRoot = assertStagingPath(args.stagingRoot, '--staging-root');
  const repositoryHead = detectRepositoryHead();

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
    command: ['node', 'scripts/commentary-multilang-translation-stage.mjs', ...argv].join(
      ' ',
    ),
    steps,
    stagingRoot,
    externalApiCalls: 0,
    ttsCalls: 0,
    r2Calls: 0,
    manifestWrites: 0,
    repoCardWrites: 0,
    repoNarrationWrites: 0,
    approvedWrites: 0,
    structuralQaPassCount: 0,
    translationQaPassCount: 0,
    translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
    autoApproveCandidateCount: 0,
    jobs: null,
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

  let targets = plan.targets;
  if (args.resume && checkpoint) {
    const reuse = countResumeReuse(checkpoint, plan.targets);
    report.resume = {
      reusableCompletedCount: reuse.reusable,
      reprocessCount: reuse.reprocess,
      totalConsidered: reuse.total,
    };
    targets = plan.targets.filter((target) =>
      shouldProcessTarget(checkpoint, target, { resume: true }),
    );
  }

  const structuralResults = targets.map((target) => evaluateTargetQa(target));
  report.structuralQaPassCount = structuralResults.filter(
    (item) => item.structuralGrade === 'PASS',
  ).length;

  let jobs = [];
  let jobBundle = null;

  if (steps.includes('export-jobs') || steps.includes('import-results') || steps.includes('stage-cards') || steps.includes('stage-narration')) {
    if (steps.includes('export-jobs')) {
      if (!args.jobs) throw new Error('--jobs is required for export-jobs');
      assertStagingPath(args.jobs, '--jobs');
      jobBundle = buildTranslationJobs(plan.targets);
      jobs = jobBundle.jobs;
      const written = writeJsonlFile(args.jobs, jobs, { requireTmp: true });
      report.jobs = {
        ...summarizeTranslationJobs(jobs),
        path: written.path,
        sha256: written.sha256,
        duplicateTargetIds: 0,
        missingSourceHashCount: 0,
      };
      console.log('○ export-jobs');
      console.log(
        `  lines=${jobs.length} en=${report.jobs.countsByLocale['en-US'] || 0} ja=${report.jobs.countsByLocale['ja-JP'] || 0}`,
      );
      console.log(`  wrote ${written.path}`);
      console.log(`  sha256=${written.sha256}`);

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
              resumeComplete: true,
            },
          );
        }
      }
    } else if (args.jobs) {
      const loaded = readJsonlFile(args.jobs);
      jobs = loaded.records.map((item) => item.value);
    } else {
      jobBundle = buildTranslationJobs(plan.targets);
      jobs = jobBundle.jobs;
    }
  }

  let importValidation = null;
  let resultRecords = [];
  if (steps.includes('import-results') || steps.includes('stage-cards') || steps.includes('stage-narration')) {
    if (!args.results) {
      throw new Error('--results is required for import/stage steps');
    }
    assertStagingPath(args.results, '--results');
    const loaded = readJsonlFile(args.results);
    if (loaded.parseErrors.length) {
      throw new Error(
        `Results JSONL parse errors: ${loaded.parseErrors[0].error}`,
      );
    }
    resultRecords = loaded.records;
    importValidation = validateTranslationResults(jobs, resultRecords, {
      expectJobOrder: true,
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
    report.translationQaStatus = 'run';
    console.log('○ import-results');
    console.log(
      `  ok=${importValidation.ok} pass=${report.translationQaPassCount}/${importValidation.resultCount}`,
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
            status: item.ok ? 'translation-qa-passed' : 'translation-qa-failed',
            sourceHash: job.sourceHash,
            translationQaStatus: item.translationQaStatus,
            resumeComplete: item.ok,
            reasons: item.reasons,
          },
        );
      }
    }
    if (steps.includes('import-results') && !importValidation.ok) {
      // continue to report; caller can inspect. staging steps should refuse.
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
    console.log('○ stage-cards');
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
    console.log('○ stage-narration');
    console.log(
      `  written=${narrationResult.writtenCount} lockedSkip=${narrationResult.lockedSkip.length} lockedConflict=${narrationResult.lockedConflict.length}`,
    );
  }

  if (steps.includes('report') || args.report) {
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
    report.translationQaStatus = approval.translationQaStatus;

    if (args.report) {
      assertStagingPath(args.report, '--report');
      fs.mkdirSync(path.dirname(args.report), { recursive: true });
      fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log('○ report');
      console.log(`  wrote ${args.report}`);
    }
  }

  if (checkpoint && args.checkpoint) {
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log('○ checkpoint');
    console.log(`  wrote ${args.checkpoint}`);
  }

  return { ok: true, report, jobs, plan, importValidation };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runTranslationStaging(process.argv.slice(2)).catch((error) => {
    console.error(`○ ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
