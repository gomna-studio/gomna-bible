import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCallBudget,
  wrapProviderWithBudget,
} from '../lib/commentary-multilang-translation-budget.mjs';
import {
  createMockTranslationProvider,
} from '../lib/commentary-multilang-translation-provider.mjs';
import {
  createMockBatchSuccessHandler,
  runBatchedTranslation,
} from '../lib/commentary-multilang-translation-batch.mjs';
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

test('budget counts initial + validation retry + fallback within max', async () => {
  const jobs = loadGenesis111Jobs().filter((job) => job.locale === 'en-US');
  let calls = 0;
  const success = createMockBatchSuccessHandler();
  const provider = createMockTranslationProvider({
    async handler(request) {
      calls += 1;
      if (calls === 1) {
        return { text: '{"items":[]}', finishReason: 'content_filter' };
      }
      if (calls === 2) return '{"items":[]}';
      return success(request);
    },
  });
  // OpenAI fallback is inside OpenAI provider; for mock we simulate retries via maxAttempts.
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 3,
    maxAttempts: 3,
    concurrency: 1,
    backoffMs: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.ok(calls <= 3);
  assert.equal(run.counters.totalCalls, calls);
  assert.ok(run.budget.consumed <= 3);
  assert.equal(run.budget.consumed + run.budget.remaining, 3);
});

test('parallel batches never exceed max-api-calls', async () => {
  const jobs = loadGenesis111Jobs();
  let inflight = 0;
  let maxInflight = 0;
  let calls = 0;
  const success = createMockBatchSuccessHandler();
  const provider = createMockTranslationProvider({
    async handler(request) {
      calls += 1;
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight -= 1;
      return success(request);
    },
  });
  const run = await runBatchedTranslation(jobs, {
    executeNetwork: true,
    provider,
    maxApiCalls: 2,
    concurrency: 2,
    maxAttempts: 1,
    backoffMs: 1,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(run.ok, true);
  assert.equal(calls, 2);
  assert.equal(run.counters.totalCalls, 2);
  assert.ok(maxInflight <= 2);
});

test('exhausted budget stops further network calls', async () => {
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
  assert.equal(run.budget.remaining, 0);
});

test('provider fallback consumes budget per HTTP attempt', async () => {
  const budget = createApiCallBudget(2);
  let calls = 0;
  const provider = createMockTranslationProvider({
    async handler() {
      calls += 1;
      return { text: `{"ok":${calls}}`, finishReason: 'stop' };
    },
  });
  const wrapped = wrapProviderWithBudget(provider, budget);
  await wrapped.complete({ counters: { attemptedCalls: 0, totalCalls: 0, successfulCalls: 0, failedCalls: 0 } });
  await wrapped.complete({ counters: { attemptedCalls: 0, totalCalls: 0, successfulCalls: 0, failedCalls: 0 } });
  await assert.rejects(
    () =>
      wrapped.complete({
        counters: { attemptedCalls: 0, totalCalls: 0, successfulCalls: 0, failedCalls: 0 },
      }),
    /max-api-calls exceeded/,
  );
  assert.equal(calls, 2);
  assert.equal(budget.remaining, 0);
});

test('resume skips completed targets with zero provider calls', async () => {
  const jobs = loadGenesis111Jobs();
  const checkpoint = createEmptyCheckpoint({ repositoryHead: 'test' });
  for (const job of jobs) {
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
        status: 'translation-qa-passed',
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
  assert.equal(remaining.length, 0);
  let calls = 0;
  const provider = createMockTranslationProvider({
    async handler() {
      calls += 1;
      return '{}';
    },
  });
  const run = await runBatchedTranslation(remaining, {
    executeNetwork: true,
    provider,
    maxApiCalls: 15,
    inspectLock: () => ({ status: 'unlocked' }),
  });
  assert.equal(calls, 0);
  assert.equal(run.counters.totalCalls, 0);
  assert.equal(run.ok, true);
});
