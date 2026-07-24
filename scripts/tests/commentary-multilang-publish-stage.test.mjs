import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PUBLISH_PHASE_BLOCKS_REAL_UPLOAD,
  assertOpsManifestUntouched,
  buildBookManifestRelativePath,
  buildUploadPlan,
  buildUploadPlanCandidate,
  classifyPublishEligibleTargets,
  computePublishPlanHash,
  createMockRemoteInspector,
  planR2UploadActions,
  snapshotOpsManifest,
  stageBookManifestShards,
  verifyUploadUrls,
} from '../lib/commentary-multilang-publish-stage.mjs';
import {
  createEmptyCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from '../lib/commentary-multilang-checkpoint.mjs';
import { buildCommentaryMultilangRangeTargets } from '../lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJobs,
  evaluateTranslationResultQa,
} from '../lib/commentary-multilang-translation-io.mjs';
import { createProductionUploadAdapters } from '../lib/commentary-multilang-upload.mjs';
import { createProductionManifestAdapters } from '../lib/commentary-multilang-manifest.mjs';

process.env.GOMNA_COMMENTARY_MULTILANG_TEST_MODE = '1';

const PHASE4 = '/tmp/gomna-commentary-v2-phase4-genesis-1-21';
const RESULTS = path.join(PHASE4, 'results-1-21.jsonl');

function phase4Available() {
  return (
    fs.existsSync(RESULTS) &&
    fs.existsSync(path.join(PHASE4, 'audio/v1/en-US/genesis/001/021'))
  );
}

function loadPassJobs({ types = 'all', locales = 'en-US,ja-JP' } = {}) {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:21',
    to: '1:21',
    locales,
    types,
  });
  const jobs = buildTranslationJobs(plan.targets).jobs;
  const results = fs
    .readFileSync(RESULTS, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { jobs, results, plan };
}

test('production upload/manifest adapters stay blocked in test mode', () => {
  assert.equal(PUBLISH_PHASE_BLOCKS_REAL_UPLOAD, true);
  assert.throws(() => createProductionUploadAdapters(), /block_test_real_io/);
  assert.throws(() => createProductionManifestAdapters(), /block_test_real_io/);
});

test('book manifest relative paths are locale/book scoped', () => {
  assert.equal(
    buildBookManifestRelativePath('en-US', 'genesis'),
    'audio/manifests/en-US/genesis.json',
  );
  assert.equal(
    buildBookManifestRelativePath('ja-JP', 'genesis'),
    'audio/manifests/ja-JP/genesis.json',
  );
  assert.throws(() => buildBookManifestRelativePath('ko-KR', 'genesis'));
  assert.throws(() => buildBookManifestRelativePath('en-US', '../genesis'));
});

test('PASS-only eligibility excludes SOURCE_REVIEW_REQUIRED', () => {
  if (!fs.existsSync('/tmp/gomna-commentary-v2-phase3-real-genesis-1-11-31-repair19/results.jsonl')) {
    return;
  }
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:15',
    locales: 'en-US,ja-JP',
    types: 'sermon',
  });
  const jobs = buildTranslationJobs(plan.targets).jobs;
  const results = fs
    .readFileSync(
      '/tmp/gomna-commentary-v2-phase3-real-genesis-1-11-31-repair19/results.jsonl',
      'utf8',
    )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const classified = classifyPublishEligibleTargets(jobs, results);
  assert.equal(classified.eligibleCount, 0);
  assert.equal(classified.sourceReviewExcluded.length, 10);
  assert.ok(
    classified.excluded.every(
      (item) => item.status === 'publish-excluded-source-review',
    ),
  );
});

test('normal upload plan for genesis 1:21 staged audio', () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs();
  const classified = classifyPublishEligibleTargets(jobs, results);
  assert.equal(classified.eligibleCount, 18);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  assert.equal(plan.counts.planned, 18);
  assert.equal(plan.counts.blocked, 0);
  assert.equal(plan.counts.byLocale['en-US'], 9);
  assert.equal(plan.counts.byLocale['ja-JP'], 9);
  assert.equal(plan.duplicateR2Keys.length, 0);
  assert.equal(plan.duplicateAudioIds.length, 0);
  assert.equal(plan.missingSizeOrDuration.length, 0);
  assert.equal(plan.cueUnverified.length, 0);
  assert.ok(plan.candidates.every((item) => item.publicUrl.startsWith('https://')));
  assert.ok(
    plan.candidates.every((item) =>
      item.r2Key.startsWith(`commentary/${item.locale}/genesis/001/021/`),
    ),
  );
});

test('existing remote object is skipped; conflict blocks', async () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'history', locales: 'en-US' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  assert.equal(plan.candidates.length, 1);

  const match = createMockRemoteInspector({ mode: 'match' });
  const skipped = await planR2UploadActions(plan.candidates, {
    executeNetwork: true,
    remoteInspector: match.inspect.bind(match),
  });
  assert.equal(skipped.skippedExisting, 1);
  assert.equal(skipped.realUploads, 0);
  assert.equal(match.calls, 1);

  const conflict = createMockRemoteInspector({ mode: 'conflict-size' });
  const blocked = await planR2UploadActions(plan.candidates, {
    executeNetwork: true,
    remoteInspector: conflict.inspect.bind(conflict),
  });
  assert.equal(blocked.conflicts, 1);
  assert.equal(blocked.actions[0].status, 'upload-conflict');
});

test('missing remote stays planned but real put remains blocked in phase5', async () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'theology', locales: 'ja-JP' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  const missing = createMockRemoteInspector({ mode: 'missing' });
  const actions = await planR2UploadActions(plan.candidates, {
    executeNetwork: true,
    remoteInspector: missing.inspect.bind(missing),
  });
  assert.equal(actions.realUploads, 0);
  assert.equal(actions.actions[0].uploadAction, 'upload_blocked_phase5');
  await assert.rejects(
    () =>
      planR2UploadActions(plan.candidates, {
        executeNetwork: true,
        allowRealUpload: true,
        remoteInspector: missing.inspect.bind(missing),
      }),
    /blocked in publish staging phase-5/,
  );
});

test('url verify covers 200 match, 404, and size mismatch', async () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'typology', locales: 'en-US' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );

  const dry = await verifyUploadUrls(plan.candidates, { executeNetwork: false });
  assert.equal(dry.networkCalls, 0);
  assert.equal(dry.okCount, 1);

  const ok = await verifyUploadUrls(plan.candidates, {
    executeNetwork: true,
    inspectRemote: createMockRemoteInspector({ mode: 'match' }).inspect,
  });
  assert.equal(ok.results[0].action, 'url_200_size_match');

  const missing = await verifyUploadUrls(plan.candidates, {
    executeNetwork: true,
    inspectRemote: createMockRemoteInspector({ mode: 'missing' }).inspect,
  });
  assert.equal(missing.results[0].action, 'url_404');

  const size = await verifyUploadUrls(plan.candidates, {
    executeNetwork: true,
    inspectRemote: createMockRemoteInspector({ mode: 'conflict-size' }).inspect,
  });
  assert.equal(size.results[0].action, 'url_size_mismatch');
});

test('manifest shard stage writes /tmp only with EN/JA counts and rejects duplicates', () => {
  if (!phase4Available()) return;
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-publish-shards-'),
  );
  const { jobs, results } = loadPassJobs();
  const classified = classifyPublishEligibleTargets(jobs, results);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  const shards = stageBookManifestShards(plan.candidates, { stagingRoot });
  assert.equal(shards.countsByLocale['en-US'], 9);
  assert.equal(shards.countsByLocale['ja-JP'], 9);
  assert.equal(shards.opsManifestWrites, 0);
  assert.ok(shards.shards[0].absolutePath.startsWith(stagingRoot));
  assert.ok(
    fs.existsSync(path.join(stagingRoot, 'audio/manifests/en-US/genesis.json')),
  );
  assert.ok(
    fs.existsSync(path.join(stagingRoot, 'audio/manifests/ja-JP/genesis.json')),
  );

  const dup = structuredClone(plan.candidates[0]);
  assert.throws(() =>
    stageBookManifestShards([plan.candidates[0], dup], { stagingRoot }),
  );

  const ops = snapshotOpsManifest(process.cwd());
  assert.equal(assertOpsManifestUntouched(process.cwd(), ops).ok, true);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('plan hash is deterministic across two builds', () => {
  if (!phase4Available()) return;
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-publish-hash-'),
  );
  const { jobs, results } = loadPassJobs();
  const classified = classifyPublishEligibleTargets(jobs, results);
  const planA = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  const planB = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  const shardsA = stageBookManifestShards(planA.candidates, {
    stagingRoot: path.join(stagingRoot, 'a'),
  });
  const shardsB = stageBookManifestShards(planB.candidates, {
    stagingRoot: path.join(stagingRoot, 'b'),
  });
  const hashA = computePublishPlanHash({
    uploadPlan: planA,
    shards: shardsA.shards,
  });
  const hashB = computePublishPlanHash({
    uploadPlan: planB,
    shards: shardsB.shards,
  });
  assert.equal(hashA, hashB);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('checkpoint resume skips completed publish targets', () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'sermon', locales: 'en-US' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const job = classified.eligible[0].job;
  const checkpoint = createEmptyCheckpoint();
  upsertCheckpointItem(checkpoint, job, {
    status: 'publish-complete',
    resumeComplete: true,
    sourceHash: job.sourceHash,
  });
  assert.equal(shouldProcessTarget(checkpoint, job, { resume: true }), false);
});

test('dry-run r2-upload performs zero network calls', async () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'hymn', locales: 'en-US' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const plan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: PHASE4 },
  );
  const spy = createMockRemoteInspector({ mode: 'missing' });
  const actions = await planR2UploadActions(plan.candidates, {
    executeNetwork: false,
    remoteInspector: spy.inspect.bind(spy),
  });
  assert.equal(spy.calls, 0);
  assert.equal(actions.networkCalls, 0);
  assert.equal(actions.realUploads, 0);
});

test('invalid locale/book candidates are blocked', () => {
  if (!phase4Available()) return;
  const { jobs, results } = loadPassJobs({ types: 'history', locales: 'en-US' });
  const classified = classifyPublishEligibleTargets(jobs, results);
  const job = {
    ...classified.eligible[0].job,
    locale: 'ko-KR',
    targetId: 'genesis.1.21.history.ko-KR',
  };
  const candidate = buildUploadPlanCandidate(job, { stagingRoot: PHASE4 });
  assert.equal(candidate.ok, false);
  assert.match(String(candidate.reason || candidate.action), /locale|Korean|unsupported/i);
});

test('non-PASS translation targets never enter upload plan', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:21',
    to: '1:21',
    locales: 'en-US',
    types: 'sermon',
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const fake = {
    targetId: job.targetId,
    sourceHash: job.sourceHash,
    locale: job.locale,
    type: job.type,
    narrationText: 'An example of application can be given as -.\n',
    translatedNarrationParagraphs: [
      ['An example of application can be given as -.'],
    ],
    translatedCards: (job.sourceCards || []).map((card, index) => ({
      itemIndex: index,
      identity: card.identity,
      fields: Object.fromEntries(
        Object.keys(card.fields || {}).map((key) => [key, '-']),
      ),
    })),
    model: 'mock',
    translatedAt: new Date().toISOString(),
  };
  const qa = evaluateTranslationResultQa(job, fake);
  assert.notEqual(qa.translationGrade, 'PASS');
  const classified = classifyPublishEligibleTargets([job], [fake]);
  assert.equal(classified.eligibleCount, 0);
});
