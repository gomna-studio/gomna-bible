#!/usr/bin/env node
/**
 * Commentary multilang v2 publish staging CLI.
 * Steps: upload-plan, r2-upload, url-verify, manifest-shard-stage, publish-report
 *
 * - PASS translation targets only (SOURCE_REVIEW_REQUIRED excluded)
 * - Writes only under --staging-root (/tmp)
 * - Never writes ops audio/audio-manifest.json or audio/manifests/**
 * - Real R2 put is blocked in this phase even with --execute-network
 * - Default dry-run performs zero network calls
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
  assertOpsManifestUntouched,
  buildUploadPlan,
  classifyPublishEligibleTargets,
  computePublishPlanHash,
  planR2UploadActions,
  snapshotOpsManifest,
  stageBookManifestShards,
  verifyUploadUrls,
} from './lib/commentary-multilang-publish-stage.mjs';

const __filename = fileURLToPath(import.meta.url);

const STEP_ALIASES = Object.freeze({
  plan: 'plan',
  extract: 'extract',
  'upload-plan': 'upload-plan',
  'r2-upload': 'r2-upload',
  'url-verify': 'url-verify',
  'manifest-shard-stage': 'manifest-shard-stage',
  'publish-report': 'publish-report',
  report: 'publish-report',
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
    steps:
      'plan,extract,upload-plan,r2-upload,url-verify,manifest-shard-stage,publish-report',
    results: null,
    jobs: null,
    audioStagingRoot: null,
    stagingRoot: '/tmp/gomna-commentary-v2-publish-staging',
    checkpoint: null,
    resume: false,
    report: null,
    executeNetwork: false,
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
    if (token === '--audio-staging-root') {
      args.audioStagingRoot = take();
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
    '  node scripts/commentary-multilang-publish-stage.mjs \\',
    '    --book genesis --from 1:21 --to 1:21 \\',
    '    --languages en-US,ja-JP --types all \\',
    '    --results /tmp/.../results-1-21.jsonl \\',
    '    --audio-staging-root /tmp/gomna-commentary-v2-phase4-genesis-1-21 \\',
    '    --staging-root /tmp/gomna-commentary-v2-phase5-genesis-1-21 \\',
    '    --steps plan,extract,upload-plan,r2-upload,url-verify,manifest-shard-stage,publish-report',
    '',
    'Default is dry-run (zero network). Real R2 put is blocked in this phase.',
    'PASS-only; SOURCE_REVIEW_REQUIRED targets are excluded.',
  ].join('\n');
}

function resolveSteps(raw) {
  const blocked = new Set(['approve', 'tts', 'cues', 'translate']);
  const steps = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((step) => {
      if (blocked.has(step)) throw new Error(`Blocked step: ${step}`);
      const mapped = STEP_ALIASES[step];
      if (!mapped) throw new Error(`Unknown step: ${step}`);
      return mapped;
    });
  if (!steps.length) throw new Error('--steps is required');
  return [...new Set(steps)];
}

function writeJson(filePath, data) {
  const absolute = assertStagingPath(filePath, 'report');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return absolute;
}

export async function runPublishStaging(argv = [], runtime = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(printUsage());
    return { ok: true, help: true };
  }

  const steps = resolveSteps(args.steps);
  const stagingRoot = assertStagingPath(args.stagingRoot, '--staging-root');
  const audioStagingRoot = assertStagingPath(
    args.audioStagingRoot || args.stagingRoot,
    '--audio-staging-root',
  );
  const repositoryHead = detectRepositoryHead();
  const root = process.env.GOMNA_ROOT || process.cwd();

  if (!args.from || !args.to) {
    throw new Error('--from and --to are required');
  }
  if (!args.results) {
    throw new Error('--results is required');
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

  const opsBefore = snapshotOpsManifest(root);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repositoryHead,
    command: [
      'node',
      'scripts/commentary-multilang-publish-stage.mjs',
      ...argv,
    ].join(' '),
    steps,
    stagingRoot,
    audioStagingRoot,
    executeNetwork: !!args.executeNetwork,
    externalApiCalls: 0,
    ttsCalls: 0,
    r2Calls: 0,
    realR2Uploads: 0,
    manifestWrites: 0,
    opsManifestWrites: 0,
    approvedWrites: 0,
    uploadCandidates: 0,
    countsByLocale: {},
    duplicateR2Keys: [],
    duplicateAudioIds: [],
    missingSizeOrDuration: 0,
    cueUnverified: 0,
    manifestShardCounts: {},
    planHash: null,
    resume: null,
    excludedSourceReview: [],
    uploadPlan: null,
    uploadActions: null,
    urlVerify: null,
    shards: null,
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

  const jobs = args.jobs
    ? readJsonlFile(args.jobs).records.map((item) => item.value)
    : buildTranslationJobs(targets).jobs;
  const results = readJsonlFile(args.results).records.map(
    (item) => item.value || item,
  );

  const classified = classifyPublishEligibleTargets(jobs, results);
  report.excludedSourceReview = classified.sourceReviewExcluded;

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

  let eligibleJobs = classified.eligible.map((item) => item.job);
  if (args.resume && checkpoint) {
    const reuse = countResumeReuse(checkpoint, eligibleJobs);
    report.resume = {
      reusableCompletedCount: reuse.reusable,
      reprocessCount: reuse.reprocess,
      totalConsidered: reuse.total,
    };
    eligibleJobs = eligibleJobs.filter((job) =>
      shouldProcessTarget(checkpoint, job, { resume: true }),
    );
  }

  console.log('○ eligibility');
  console.log(
    `  passEligible=${classified.eligibleCount} excluded=${classified.excludedCount} sourceReview=${classified.sourceReviewExcluded.length}`,
  );
  console.log(`  selectedForRun=${eligibleJobs.length}`);

  let uploadPlan = null;
  let uploadActions = null;
  let urlVerify = null;
  let shardsResult = null;

  if (steps.includes('upload-plan')) {
    // For resume-empty runs, still rebuild full plan from all PASS jobs for report hash stability.
    const planJobs =
      args.resume && eligibleJobs.length === 0
        ? classified.eligible.map((item) => item.job)
        : args.resume
          ? eligibleJobs
          : classified.eligible.map((item) => item.job);

    uploadPlan = buildUploadPlan(planJobs, {
      stagingRoot: audioStagingRoot,
    });
    report.uploadPlan = {
      planned: uploadPlan.counts.planned,
      blocked: uploadPlan.counts.blocked,
      byLocale: uploadPlan.counts.byLocale,
      duplicateR2Keys: uploadPlan.duplicateR2Keys,
      duplicateAudioIds: uploadPlan.duplicateAudioIds,
      missingSizeOrDuration: uploadPlan.missingSizeOrDuration.length,
      cueUnverified: uploadPlan.cueUnverified.length,
      candidates: uploadPlan.candidates.map((item) => ({
        targetId: item.targetId,
        audioId: item.audioId,
        locale: item.locale,
        r2Key: item.r2Key,
        publicUrl: item.publicUrl,
        byteSize: item.byteSize,
        duration: item.duration,
        sha256: item.sha256,
        voicePreset: item.voicePreset,
        action: item.action,
      })),
      blockedSample: uploadPlan.blocked.slice(0, 20),
    };
    report.uploadCandidates = uploadPlan.counts.planned;
    report.countsByLocale = uploadPlan.counts.byLocale;
    report.duplicateR2Keys = uploadPlan.duplicateR2Keys;
    report.duplicateAudioIds = uploadPlan.duplicateAudioIds;
    report.missingSizeOrDuration = uploadPlan.missingSizeOrDuration.length;
    report.cueUnverified = uploadPlan.cueUnverified.length;

    console.log('○ upload-plan');
    console.log(
      `  candidates=${uploadPlan.counts.planned} blocked=${uploadPlan.counts.blocked} en=${uploadPlan.counts.byLocale['en-US'] || 0} ja=${uploadPlan.counts.byLocale['ja-JP'] || 0}`,
    );
    console.log(
      `  dupR2=${uploadPlan.duplicateR2Keys.length} dupId=${uploadPlan.duplicateAudioIds.length} cueUnverified=${uploadPlan.cueUnverified.length}`,
    );

    if (checkpoint) {
      for (const candidate of uploadPlan.candidates) {
        if (
          args.resume &&
          !shouldProcessTarget(checkpoint, candidate.target, { resume: true })
        ) {
          continue;
        }
        upsertCheckpointItem(checkpoint, candidate.target, {
          status: 'upload-planned',
          action: candidate.action,
          r2Key: candidate.r2Key,
          audioId: candidate.audioId,
          byteSize: candidate.byteSize,
          duration: candidate.duration,
          sha256: candidate.sha256,
          resumeComplete: false,
          sourceHash: candidate.target.sourceHash,
        });
      }
    }

    writeJson(path.join(stagingRoot, 'upload-plan.json'), report.uploadPlan);
  }

  if (steps.includes('r2-upload')) {
    if (!uploadPlan) {
      throw new Error('r2-upload requires upload-plan in the same run');
    }
    const toUpload =
      args.resume && eligibleJobs.length
        ? uploadPlan.candidates.filter((item) =>
            eligibleJobs.some((job) => job.targetId === item.targetId),
          )
        : args.resume && eligibleJobs.length === 0
          ? []
          : uploadPlan.candidates;

    uploadActions = await planR2UploadActions(toUpload, {
      executeNetwork: args.executeNetwork,
      allowRealUpload: false,
      remoteInspector: runtime.remoteInspector || null,
      fetchImpl: runtime.fetchImpl || null,
    });
    report.uploadActions = {
      planned: uploadActions.planned,
      skippedExisting: uploadActions.skippedExisting,
      conflicts: uploadActions.conflicts,
      realUploads: uploadActions.realUploads,
      networkCalls: uploadActions.networkCalls,
      actions: uploadActions.actions.map((item) => ({
        targetId: item.targetId,
        audioId: item.audioId,
        uploadAction: item.uploadAction,
        status: item.status,
        uploaded: item.uploaded,
        reason: item.reason,
      })),
    };
    report.r2Calls = uploadActions.networkCalls;
    report.realR2Uploads = 0;
    report.externalApiCalls += uploadActions.networkCalls;

    console.log('○ r2-upload');
    console.log(
      `  planned=${uploadActions.planned} skipped=${uploadActions.skippedExisting} conflicts=${uploadActions.conflicts} realUploads=0 network=${uploadActions.networkCalls}`,
    );

    if (checkpoint) {
      for (const action of uploadActions.actions) {
        upsertCheckpointItem(checkpoint, action.target || action, {
          status: action.status,
          uploadAction: action.uploadAction,
          reason: action.reason,
          resumeComplete: false,
          sourceHash: action.target?.sourceHash || action.sourceHash || null,
        });
      }
    }

    writeJson(path.join(stagingRoot, 'r2-upload-actions.json'), report.uploadActions);
  }

  if (steps.includes('url-verify')) {
    const actionsForVerify =
      uploadActions?.actions?.length
        ? uploadActions.actions
        : uploadPlan?.candidates || [];
    urlVerify = await verifyUploadUrls(actionsForVerify, {
      executeNetwork: args.executeNetwork,
      fetchImpl: runtime.fetchImpl || null,
      inspectRemote: runtime.inspectRemote || undefined,
    });
    report.urlVerify = {
      okCount: urlVerify.okCount,
      failCount: urlVerify.failCount,
      networkCalls: urlVerify.networkCalls,
      results: urlVerify.results,
    };
    report.externalApiCalls += urlVerify.networkCalls;

    console.log('○ url-verify');
    console.log(
      `  ok=${urlVerify.okCount} fail=${urlVerify.failCount} network=${urlVerify.networkCalls}`,
    );

    if (checkpoint) {
      for (const item of urlVerify.results) {
        const candidate =
          uploadPlan?.candidates.find((row) => row.targetId === item.targetId) ||
          null;
        if (!candidate) continue;
        upsertCheckpointItem(checkpoint, candidate.target, {
          status: item.status,
          urlAction: item.action,
          reason: item.reason,
          resumeComplete: false,
          sourceHash: candidate.target.sourceHash,
        });
      }
    }

    writeJson(path.join(stagingRoot, 'url-verify.json'), report.urlVerify);
  }

  if (steps.includes('manifest-shard-stage')) {
    if (!uploadPlan) {
      throw new Error('manifest-shard-stage requires upload-plan');
    }
    shardsResult = stageBookManifestShards(uploadPlan.candidates, {
      stagingRoot,
      generatedAt: new Date().toISOString(),
    });
    report.shards = shardsResult.shards.map((shard) => ({
      locale: shard.locale,
      bookId: shard.bookId,
      relativePath: shard.relativePath,
      absolutePath: shard.absolutePath,
      entryCount: shard.entryCount,
      sha256: shard.sha256,
    }));
    report.manifestShardCounts = shardsResult.countsByLocale;
    report.manifestWrites = 0;
    report.opsManifestWrites = shardsResult.opsManifestWrites;

    console.log('○ manifest-shard-stage');
    console.log(
      `  en=${shardsResult.countsByLocale['en-US'] || 0} ja=${shardsResult.countsByLocale['ja-JP'] || 0} opsWrites=0`,
    );

    if (checkpoint) {
      for (const candidate of uploadPlan.candidates) {
        upsertCheckpointItem(checkpoint, candidate.target, {
          status: 'manifest-shard-staged',
          resumeComplete: true,
          sourceHash: candidate.target.sourceHash,
        });
      }
    }
  }

  if (steps.includes('publish-report')) {
    const planHash = computePublishPlanHash({
      uploadPlan,
      shards: shardsResult?.shards || [],
    });
    report.planHash = planHash;
    report.generatedAt = new Date().toISOString();

    const opsCheck = assertOpsManifestUntouched(root, opsBefore);
    report.opsManifestUntouched = opsCheck.ok;
    if (!opsCheck.ok) {
      throw new Error(`ops manifest safety failed: ${opsCheck.reason}`);
    }

    if (checkpoint) {
      for (const candidate of uploadPlan?.candidates || []) {
        upsertCheckpointItem(checkpoint, candidate.target, {
          status: 'publish-complete',
          planHash,
          resumeComplete: true,
          sourceHash: candidate.target.sourceHash,
        });
      }
    }

    if (args.report) {
      const reportPath = writeJson(args.report, report);
      console.log('○ publish-report');
      console.log(`  wrote ${reportPath}`);
    } else {
      writeJson(path.join(stagingRoot, 'publish-report.json'), report);
      console.log('○ publish-report');
      console.log(`  wrote ${path.join(stagingRoot, 'publish-report.json')}`);
    }
    console.log(
      `  candidates=${report.uploadCandidates} planHash=${planHash.slice(0, 12)}… network=${report.externalApiCalls} realR2=${report.realR2Uploads}`,
    );
  }

  if (checkpoint && args.checkpoint) {
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log('○ checkpoint');
    console.log(`  wrote ${path.resolve(args.checkpoint)}`);
  }

  return { ok: true, report, checkpoint, uploadPlan, shardsResult };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runPublishStaging(process.argv.slice(2)).catch((error) => {
    console.error(`○ ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
