#!/usr/bin/env node
/**
 * Publish PASS Genesis multilingual commentary into ops + R2 + book shards.
 *
 * Usage (dry-run first):
 *   node scripts/commentary-multilang-publish-apply.mjs --dry-run
 *
 * Real apply + upload:
 *   GOMNA_COMMENTARY_PUBLISH_REAL_UPLOAD=1 \\
 *   node scripts/commentary-multilang-publish-apply.mjs --execute
 *
 * Never writes MP3 into the repository.
 * Never modifies audio/audio-manifest.json.
 * Never publishes SOURCE_REVIEW_REQUIRED targets.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCommentaryMultilangRangeTargets } from './lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJobs,
  readJsonlFile,
} from './lib/commentary-multilang-translation-io.mjs';
import {
  createEmptyCheckpoint,
  detectRepositoryHead,
  loadCheckpoint,
  saveCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from './lib/commentary-multilang-checkpoint.mjs';
import {
  applyNarrationAndCuesToOps,
  assertPreservedOpsUnchanged,
  buildPassPublishPlan,
  executeRealR2Uploads,
  mergeStagedCardsIntoOps,
  snapshotPreservedOpsRange,
  writeMergedBookManifestShards,
} from './lib/commentary-multilang-publish-apply.mjs';
import {
  createProductionUploadAdapters,
} from './lib/commentary-multilang-upload.mjs';
import { verifyUploadUrls as verifyPublishUrls } from './lib/commentary-multilang-publish-stage.mjs';
import {
  requireMultilangStageApproval,
  resolveAudioApproved,
} from './lib/commentary-multilang-quality-policy.mjs';

const __filename = fileURLToPath(import.meta.url);

const DEFAULTS = Object.freeze({
  book: 'genesis',
  from: '1:11',
  to: '1:31',
  languages: 'en-US,ja-JP',
  results: '/tmp/gomna-commentary-v2-pass368-blocker-repair/results.jsonl',
  narrationStaging: '/tmp/gomna-commentary-v2-pass368-approval',
  audioStaging: '/tmp/gomna-commentary-v2-pass368-audio-cue-20260724/staging',
  reportRoot: '/tmp/gomna-commentary-v2-pass368-publish-20260724',
  concurrency: 3,
});

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    dryRun: false,
    execute: false,
    skipOpsApply: false,
    skipUpload: false,
    skipShards: false,
    resume: false,
    audioApproved: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const take = () => {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error(`Missing value for ${token}`);
      }
      i += 1;
      return value;
    };
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--execute') args.execute = true;
    else if (token === '--resume') args.resume = true;
    else if (token === '--skip-ops-apply') args.skipOpsApply = true;
    else if (token === '--skip-upload') args.skipUpload = true;
    else if (token === '--skip-shards') args.skipShards = true;
    else if (token === '--audio-approved' || token === '--audioApproved') {
      args.audioApproved = true;
    }
    else if (token === '--results') args.results = take();
    else if (token === '--narration-staging') args.narrationStaging = take();
    else if (token === '--audio-staging') args.audioStaging = take();
    else if (token === '--report-root') args.reportRoot = take();
    else if (token === '--concurrency') args.concurrency = Number(take());
    else if (token === '--from') args.from = take();
    else if (token === '--to') args.to = take();
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function printUsage() {
  console.log(`Usage:
  node scripts/commentary-multilang-publish-apply.mjs --dry-run
  GOMNA_COMMENTARY_PUBLISH_REAL_UPLOAD=1 node scripts/commentary-multilang-publish-apply.mjs --execute
`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return { ok: true, help: true };
  }
  if (!args.dryRun && !args.execute) {
    throw new Error('Specify --dry-run or --execute');
  }
  if (args.dryRun && args.execute) {
    throw new Error('Choose only one of --dry-run / --execute');
  }

  const repositoryHead = detectRepositoryHead();
  const reportRoot = args.reportRoot;
  fs.mkdirSync(reportRoot, { recursive: true });
  const checkpointPath = path.join(reportRoot, 'checkpoint.json');
  let checkpoint =
    loadCheckpoint(checkpointPath, { repositoryHead }) ||
    createEmptyCheckpoint({
      repositoryHead,
      plan: { book: args.book, from: args.from, to: args.to },
    });

  const plan = buildCommentaryMultilangRangeTargets({
    bookId: args.book,
    from: args.from,
    to: args.to,
    locales: args.languages,
    types: 'all',
  });
  const { jobs } = buildTranslationJobs(plan.targets);
  const results = readJsonlFile(args.results).records.map(
    (item) => item.value || item,
  );

  const { classified, uploadPlan } = buildPassPublishPlan(
    jobs,
    results,
    args.audioStaging,
  );

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repositoryHead,
    mode: args.dryRun ? 'dry-run' : 'execute',
    passEligible: classified.eligibleCount,
    sourceReviewExcluded: classified.sourceReviewExcluded.map(
      (item) => item.job?.targetId || item.targetId,
    ),
    uploadPlan: {
      ok: uploadPlan.ok,
      planned: uploadPlan.counts.planned,
      blocked: uploadPlan.counts.blocked,
      byLocale: uploadPlan.counts.byLocale,
      duplicateR2Keys: uploadPlan.duplicateR2Keys,
      duplicateAudioIds: uploadPlan.duplicateAudioIds,
      missingSizeOrDuration: uploadPlan.missingSizeOrDuration.length,
      blockedSample: uploadPlan.blocked.slice(0, 10),
    },
  };

  console.log('○ plan');
  console.log(
    `  pass=${classified.eligibleCount} sourceReview=${classified.sourceReviewExcluded.length}`,
  );
  console.log(
    `  upload planned=${uploadPlan.counts.planned} blocked=${uploadPlan.counts.blocked} en=${uploadPlan.counts.byLocale['en-US'] || 0} ja=${uploadPlan.counts.byLocale['ja-JP'] || 0}`,
  );
  console.log(
    `  duplicateKeys=${uploadPlan.duplicateR2Keys.length} duplicateIds=${uploadPlan.duplicateAudioIds.length}`,
  );

  if (!uploadPlan.ok || uploadPlan.counts.planned !== 368) {
    writeJson(path.join(reportRoot, 'publish-report.json'), report);
    throw new Error(
      `upload plan not ready: planned=${uploadPlan.counts.planned} blocked=${uploadPlan.counts.blocked}`,
    );
  }

  const preservedBefore = snapshotPreservedOpsRange();
  writeJson(path.join(reportRoot, 'ops-preserved-before.json'), preservedBefore);

  if (args.dryRun) {
    // Dry-run shard merge into /tmp only.
    const dryShards = writeMergedBookManifestShards({
      candidates: uploadPlan.candidates,
      outputRoot: path.join(reportRoot, 'dry-shards'),
      generatedAt: '1970-01-01T00:00:00.000Z',
    });
    const dryShardsB = writeMergedBookManifestShards({
      candidates: uploadPlan.candidates,
      outputRoot: path.join(reportRoot, 'dry-shards-b'),
      generatedAt: '1970-01-01T00:00:00.000Z',
    });
    report.dryRun = {
      shards: dryShards.countsByLocale,
      shardHashes: Object.fromEntries(
        dryShards.shards.map((shard) => [shard.locale, shard.sha256]),
      ),
      deterministic:
        dryShards.shards[0].sha256 === dryShardsB.shards[0].sha256 &&
        dryShards.shards[1].sha256 === dryShardsB.shards[1].sha256,
      r2Uploads: 0,
      opsWrites: 0,
    };
    writeJson(path.join(reportRoot, 'upload-plan.json'), {
      candidates: uploadPlan.candidates.map((item) => ({
        targetId: item.targetId,
        audioId: item.audioId,
        locale: item.locale,
        r2Key: item.r2Key,
        publicUrl: item.publicUrl,
        byteSize: item.byteSize,
        duration: item.duration,
        sha256: item.sha256,
      })),
    });
    writeJson(path.join(reportRoot, 'publish-report.json'), report);
    console.log('○ dry-run complete (zero ops writes, zero R2 puts)');
    console.log(
      `  shards EN=${dryShards.countsByLocale['en-US']} JA=${dryShards.countsByLocale['ja-JP']} deterministic=${report.dryRun.deterministic}`,
    );
    return { ok: true, report };
  }

  // EXECUTE
  if (process.env.GOMNA_COMMENTARY_PUBLISH_REAL_UPLOAD !== '1') {
    throw new Error(
      'Refusing execute without GOMNA_COMMENTARY_PUBLISH_REAL_UPLOAD=1',
    );
  }

  const audioApproved = resolveAudioApproved({
    audioApproved: args.audioApproved,
  });
  requireMultilangStageApproval('r2', { audioApproved });

  const approvedAt = new Date().toISOString();
  const eligibleJobs = classified.eligible.map((item) => item.job);

  if (!args.skipOpsApply) {
    console.log('○ ops apply: cards');
    const cards = mergeStagedCardsIntoOps({
      stagedCardsRoot: args.narrationStaging,
      approvedAt,
    });
    if (!cards.ok) {
      writeJson(path.join(reportRoot, 'card-conflicts.json'), cards);
      throw new Error(`card merge conflicts: ${cards.conflicts.length}`);
    }
    report.cards = cards.written;

    console.log('○ ops apply: txt/meta/cue');
    const artifacts = applyNarrationAndCuesToOps({
      jobs: eligibleJobs,
      narrationStagingRoot: args.narrationStaging,
      audioStagingRoot: args.audioStaging,
      approvedAt,
      approvalPolicy: 'sample-approved-batch-pass368',
    });
    report.artifacts = {
      ok: artifacts.ok,
      txt: artifacts.written.txt,
      meta: artifacts.written.meta,
      cue: artifacts.written.cue,
      skippedExisting: artifacts.written.skippedExisting,
      blocked: artifacts.blocked,
    };
    if (!artifacts.ok) {
      writeJson(path.join(reportRoot, 'artifact-conflicts.json'), artifacts);
      throw new Error(`artifact apply blocked: ${artifacts.blocked.length}`);
    }

    const preserved = assertPreservedOpsUnchanged(preservedBefore);
    report.preservedOps = {
      ok: preserved.ok,
      conflicts: preserved.conflicts,
    };
    if (!preserved.ok) {
      writeJson(path.join(reportRoot, 'preserved-conflicts.json'), preserved);
      throw new Error('preserved 1:1-1:10 ops changed during apply');
    }
  }

  let uploadResult = null;
  if (!args.skipUpload) {
    const adapters = createProductionUploadAdapters();
    let toUpload = uploadPlan.candidates;
    if (args.resume) {
      toUpload = toUpload.filter((candidate) =>
        shouldProcessTarget(checkpoint, candidate.target || candidate, {
          resume: true,
        }),
      );
    }

    console.log(`○ r2 upload candidates=${toUpload.length} concurrency=${args.concurrency}`);
    const candidateById = new Map(
      uploadPlan.candidates.map((item) => [item.targetId, item]),
    );
    uploadResult = await executeRealR2Uploads(toUpload, {
      remoteInspector: adapters.remoteInspector,
      wranglerRunner: adapters.wranglerRunner,
      concurrency: args.concurrency,
      sleep: adapters.sleep,
      audioApproved: true,
      onItem: (item) => {
        console.log(
          `  ${item.targetId} => ${item.uploadAction}${item.ok ? '' : ` ! ${item.reason}`}`,
        );
        const candidate = candidateById.get(item.targetId);
        if (!candidate) return;
        upsertCheckpointItem(checkpoint, candidate.target || candidate, {
          status: item.status,
          uploadAction: item.uploadAction,
          reason: item.reason,
          resumeComplete: !!item.ok,
          sourceHash: candidate.target?.sourceHash || candidate.sourceHash || null,
        });
        saveCheckpoint(checkpointPath, checkpoint);
      },
    });
    report.upload = {
      uploaded: uploadResult.uploaded,
      skipped: uploadResult.skipped,
      failed: uploadResult.failed,
      conflicts: uploadResult.conflicts,
      networkCalls: uploadResult.networkCalls,
      ok: uploadResult.ok,
    };
    writeJson(path.join(reportRoot, 'upload-results.json'), uploadResult);
    if (!uploadResult.ok) {
      writeJson(path.join(reportRoot, 'publish-report.json'), report);
      throw new Error(
        `upload failures=${uploadResult.failed} conflicts=${uploadResult.conflicts}`,
      );
    }

    console.log('○ url verify');
    const urlVerify = await verifyPublishUrls(uploadPlan.candidates, {
      executeNetwork: true,
      inspectRemote: adapters.remoteInspector,
    });
    report.urlVerify = {
      okCount: urlVerify.okCount,
      failCount: urlVerify.failCount,
      networkCalls: urlVerify.networkCalls,
    };
    writeJson(path.join(reportRoot, 'url-verify.json'), urlVerify);
    if (urlVerify.failCount || urlVerify.okCount !== 368) {
      throw new Error(
        `url verify failed ok=${urlVerify.okCount} fail=${urlVerify.failCount}`,
      );
    }
  }

  if (!args.skipShards) {
    console.log('○ write book manifest shards');
    const shardsA = writeMergedBookManifestShards({
      candidates: uploadPlan.candidates,
      outputRoot: process.cwd(),
      generatedAt: '1970-01-01T00:00:00.000Z',
      requireAudioApproval: true,
      audioApproved: true,
    });
    const shardsB = writeMergedBookManifestShards({
      candidates: uploadPlan.candidates,
      outputRoot: path.join(reportRoot, 'shard-hash-check'),
      generatedAt: '1970-01-01T00:00:00.000Z',
      requireAudioApproval: true,
      audioApproved: true,
    });
    const deterministic =
      shardsA.shards.every(
        (shard, index) => shard.sha256 === shardsB.shards[index].sha256,
      );
    report.shards = {
      countsByLocale: shardsA.countsByLocale,
      hashes: Object.fromEntries(
        shardsA.shards.map((shard) => [shard.locale, shard.sha256]),
      ),
      existingCounts: Object.fromEntries(
        shardsA.shards.map((shard) => [shard.locale, shard.existingCount]),
      ),
      newCounts: Object.fromEntries(
        shardsA.shards.map((shard) => [shard.locale, shard.newCount]),
      ),
      deterministic,
      paths: shardsA.shards.map((shard) => shard.relativePath),
    };
    if (
      shardsA.countsByLocale['en-US'] !== 274 ||
      shardsA.countsByLocale['ja-JP'] !== 274 ||
      !deterministic
    ) {
      throw new Error(
        `shard validation failed: ${JSON.stringify(report.shards)}`,
      );
    }
  }

  const preservedFinal = assertPreservedOpsUnchanged(preservedBefore);
  report.preservedOpsFinal = {
    ok: preservedFinal.ok,
    conflicts: preservedFinal.conflicts,
  };
  if (!preservedFinal.ok) {
    throw new Error('preserved ops changed after publish');
  }

  // Ensure single manifest untouched.
  const beforeSha = preservedBefore.singleManifest?.sha256;
  const afterSha = snapshotPreservedOpsRange().singleManifest?.sha256;
  if (beforeSha !== afterSha) {
    throw new Error('audio/audio-manifest.json changed');
  }
  report.singleManifestUnchanged = true;

  writeJson(path.join(reportRoot, 'publish-report.json'), report);
  saveCheckpoint(checkpointPath, checkpoint);
  console.log('○ publish complete');
  console.log(
    `  cards=${JSON.stringify(report.cards)} txt=${report.artifacts?.txt} meta=${report.artifacts?.meta} cue=${report.artifacts?.cue}`,
  );
  console.log(
    `  upload uploaded=${report.upload?.uploaded} skipped=${report.upload?.skipped} failed=${report.upload?.failed}`,
  );
  console.log(
    `  url ok=${report.urlVerify?.okCount} shards EN=${report.shards?.countsByLocale?.['en-US']} JA=${report.shards?.countsByLocale?.['ja-JP']}`,
  );
  return { ok: true, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`○ STOP: ${error.message}`);
    process.exitCode = 1;
  });
}

export { main };
