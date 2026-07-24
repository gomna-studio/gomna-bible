import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBatchTranslationRequest,
  estimateTranslationApiCalls,
  groupJobsIntoTranslationBatches,
  runBatchedTranslation,
  splitBatchTranslationResponse,
  createMockBatchSuccessHandler,
} from '../lib/commentary-multilang-translation-batch.mjs';
import {
  assertNoSecretLeak,
  createMockTranslationProvider,
} from '../lib/commentary-multilang-translation-provider.mjs';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import { buildTranslationJobs } from '../lib/commentary-multilang-translation-io.mjs';
import {
  createEmptyCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from '../lib/commentary-multilang-checkpoint.mjs';

function loadGenesis111Jobs() {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'en-US,ja-JP',
    types: 'all',
  });
  return buildTranslationJobs(plan.targets).jobs;
}

test('batches nine types per locale and estimates two API calls', () => {
  const jobs = loadGenesis111Jobs();
  assert.equal(jobs.length, 18);
  const estimate = estimateTranslationApiCalls(jobs, {
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(estimate.eligibleTargetCount, 18);
  assert.equal(estimate.estimatedApiCalls, 2);
  const batches = groupJobsIntoTranslationBatches(jobs);
  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((batch) => batch.locale).sort(),
    ['en-US', 'ja-JP'],
  );
  for (const batch of batches) {
    assert.equal(batch.types.length, 9);
    assert.equal(batch.jobs.length, 9);
  }
});

test('mock provider restores 18 targets from two batched calls', async () => {
  const jobs = loadGenesis111Jobs();
  const provider = createMockTranslationProvider({
    handler: createMockBatchSuccessHandler(),
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 2,
    concurrency: 2,
    backoffMs: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, true);
  assert.equal(run.results.length, 18);
  assert.equal(run.counters.successfulCalls, 2);
  assert.equal(run.counters.totalCalls, 2);
  assert.equal(new Set(run.results.map((item) => item.targetId)).size, 18);
  assert.equal(
    run.results.filter((item) => item.locale === 'en-US').length,
    9,
  );
  assert.equal(
    run.results.filter((item) => item.locale === 'ja-JP').length,
    9,
  );
});

test('splitBatchTranslationResponse validates missing/duplicate/hash/corrupt', async () => {
  const jobs = loadGenesis111Jobs().filter((job) => job.locale === 'en-US');
  const batch = groupJobsIntoTranslationBatches(jobs)[0];
  assert.ok(
    buildBatchTranslationRequest(batch).systemPrompt.includes(
      'ALL commentary types',
    ),
  );
  const goodText = await createMockBatchSuccessHandler()({
    userContent: buildBatchTranslationRequest(batch).userContent,
  });

  const good = splitBatchTranslationResponse(batch, goodText);
  assert.equal(good.ok, true);
  assert.equal(good.results.length, 9);

  const parsed = JSON.parse(goodText);
  const missing = {
    items: parsed.items.filter((item) => item.type !== 'history'),
  };
  const missingResult = splitBatchTranslationResponse(
    batch,
    JSON.stringify(missing),
  );
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((item) => item.code === 'missing_type'));

  const duplicate = {
    items: [...parsed.items, { ...parsed.items[0] }],
  };
  const duplicateResult = splitBatchTranslationResponse(
    batch,
    JSON.stringify(duplicate),
  );
  assert.equal(duplicateResult.ok, false);
  assert.ok(
    duplicateResult.errors.some((item) => item.code === 'duplicate_type'),
  );

  const badHashItems = parsed.items.map((item) => ({
    ...item,
    sourceHash: 'deadbeef',
  }));
  const badHash = splitBatchTranslationResponse(
    batch,
    JSON.stringify({ items: badHashItems }),
  );
  assert.equal(badHash.ok, false);
  assert.ok(
    badHash.errors.some((item) => item.code === 'source_hash_mismatch'),
  );

  const corrupt = splitBatchTranslationResponse(batch, '{not-json');
  assert.equal(corrupt.ok, false);
  assert.ok(corrupt.errors.some((item) => item.code === 'json_corrupt'));
});

test('rate limit retries then succeeds', async () => {
  const jobs = loadGenesis111Jobs().filter((job) => job.locale === 'en-US');
  let attempts = 0;
  const success = createMockBatchSuccessHandler();
  const provider = createMockTranslationProvider({
    async handler(request) {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('OpenAI chat completion failed with HTTP 429');
        error.statusCode = 429;
        error.retryable = true;
        throw error;
      }
      return success(request);
    },
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 2,
    maxAttempts: 3,
    concurrency: 1,
    backoffMs: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, true);
  assert.equal(run.results.length, 9);
  assert.ok(run.counters.retriedCalls >= 1);
});

test('max-api-calls blocks oversized plans', async () => {
  const jobs = loadGenesis111Jobs();
  const provider = createMockTranslationProvider({
    handler: createMockBatchSuccessHandler(),
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, false);
  assert.match(run.blockedReason, /max-api-calls exceeded/);
  assert.equal(run.counters.totalCalls, 0);
});

test('max-api-calls budget covers validation retries', async () => {
  const jobs = loadGenesis111Jobs().filter((job) => job.locale === 'en-US');
  let calls = 0;
  const success = createMockBatchSuccessHandler();
  const provider = createMockTranslationProvider({
    async handler(request) {
      calls += 1;
      if (calls === 1) return '{"items":[]}';
      return success(request);
    },
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 1,
    maxAttempts: 3,
    concurrency: 1,
    backoffMs: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, false);
  assert.equal(calls, 1);
  assert.equal(run.counters.totalCalls, 1);
  assert.ok(
    (run.failedBatches || []).some((item) =>
      /max-api-calls exceeded/.test(item.error || ''),
    ),
  );
});

test('empty job queue makes zero provider calls', async () => {
  let calls = 0;
  const provider = createMockTranslationProvider({
    async handler() {
      calls += 1;
      return '{}';
    },
  });
  const run = await runBatchedTranslation([], {
    executeNetwork: true,
    provider,
    maxApiCalls: 2,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, true);
  assert.equal(calls, 0);
  assert.equal(run.counters.totalCalls, 0);
  assert.equal(run.estimatedApiCalls, 0);
});

test('checkpoint resume skips successful batch targets', async () => {
  const jobs = loadGenesis111Jobs();
  const checkpoint = createEmptyCheckpoint({ repositoryHead: 'test' });
  for (const job of jobs.filter((item) => item.locale === 'en-US')) {
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
        status: 'translation-batch-ok',
        sourceHash: job.sourceHash,
        resumeComplete: true,
      },
    );
  }

  const remaining = jobs.filter((job) =>
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
  assert.equal(remaining.length, 9);
  assert.ok(remaining.every((job) => job.locale === 'ja-JP'));

  const provider = createMockTranslationProvider({
    handler: createMockBatchSuccessHandler(),
  });
  const run = await runBatchedTranslation(remaining, {
    executeNetwork: true,
    provider,
    maxApiCalls: 2,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, true);
  assert.equal(run.counters.totalCalls, 1);
  assert.equal(run.results.length, 9);
});

test('API key is not leaked by assertNoSecretLeak helper', () => {
  assert.throws(
    () => assertNoSecretLeak('token sk-abcdefghijklmnopqrstuvwxyz'),
    /Possible API key/,
  );
  assert.equal(assertNoSecretLeak('no secrets here'), true);
});

test('preflight does not call provider', async () => {
  const jobs = loadGenesis111Jobs();
  let called = 0;
  const provider = createMockTranslationProvider({
    handler: async () => {
      called += 1;
      return '{}';
    },
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: false,
    provider,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.preflight, true);
  assert.equal(run.estimatedApiCalls, 2);
  assert.equal(called, 0);
});
