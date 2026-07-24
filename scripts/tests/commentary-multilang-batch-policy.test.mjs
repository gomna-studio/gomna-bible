import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATCH_APPROVAL_MODES,
  BATCH_STATUS,
  buildApprovalCandidateReport,
  computeBatchSampleCount,
  evaluateBatchApprovalEligibility,
  selectBatchReviewSample,
  splitVerseBands,
} from '../lib/commentary-multilang-batch-policy.mjs';
import { listCommentaryTypes } from '../lib/commentary-type-registry.mjs';

function buildCandidates(verses, locales = ['en-US', 'ja-JP']) {
  const types = listCommentaryTypes().map((item) => item.type);
  const candidates = [];
  for (const verse of verses) {
    for (const type of types) {
      for (const locale of locales) {
        candidates.push({
          targetKey: `genesis.1.${verse}.${type}.${locale}`,
          structuralGrade: 'PASS',
          status: 'structural-qa-passed',
          chapter: 1,
          verse,
          type,
          locale,
        });
      }
    }
  }
  return candidates;
}

test('FAIL and REVIEW_REQUIRED are not approval candidates', () => {
  assert.equal(
    evaluateBatchApprovalEligibility({
      structuralGrade: 'FAIL',
      status: 'failed',
    }).eligible,
    false,
  );
  assert.equal(
    evaluateBatchApprovalEligibility({
      structuralGrade: 'REVIEW_REQUIRED',
      status: 'review-required',
    }).eligible,
    false,
  );
});

test('PASS missing items become candidates but never auto-write in phase-1', () => {
  const decision = evaluateBatchApprovalEligibility(
    {
      structuralGrade: 'PASS',
      status: 'structural-qa-passed',
      inventoryStatus: 'missing',
    },
    { mode: BATCH_APPROVAL_MODES.AUTO_WITHIN_BATCH },
  );
  assert.equal(decision.eligible, true);
  assert.equal(decision.autoApproveAllowed, false);
  assert.equal(decision.phase1BlockedWrite, true);
});

test('sample count formula bounds to 18 for genesis 1:11-1:31 sized pool', () => {
  assert.equal(computeBatchSampleCount(378), 18);
  assert.equal(computeBatchSampleCount(54), 18);
  assert.equal(computeBatchSampleCount(8), 8);
  assert.equal(computeBatchSampleCount(30000), 300);
});

test('sample is exactly 18 with EN9 JA9 and one of each type per locale', () => {
  const types = listCommentaryTypes().map((item) => item.type);
  const candidates = buildCandidates(
    Array.from({ length: 21 }, (_, i) => 11 + i),
  );
  assert.equal(candidates.length, 378);

  const first = selectBatchReviewSample(candidates, { seed: 'same-seed' });
  const second = selectBatchReviewSample(candidates, { seed: 'same-seed' });

  assert.equal(first.sampleCount, 18);
  assert.equal(first.targetSampleCount, 18);
  assert.deepEqual(
    first.sample.map((item) => item.targetKey),
    second.sample.map((item) => item.targetKey),
  );
  assert.equal(first.distribution.byLocale['en-US'], 9);
  assert.equal(first.distribution.byLocale['ja-JP'], 9);
  assert.equal(first.distribution.byBand.front, 6);
  assert.equal(first.distribution.byBand.middle, 6);
  assert.equal(first.distribution.byBand.end, 6);
  assert.equal(first.distribution.byActualVerseBand.front, 6);
  assert.equal(first.distribution.byActualVerseBand.middle, 6);
  assert.equal(first.distribution.byActualVerseBand.end, 6);
  assert.deepEqual(first.verseBands.front, [11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(first.verseBands.middle, [18, 19, 20, 21, 22, 23, 24]);
  assert.deepEqual(first.verseBands.end, [25, 26, 27, 28, 29, 30, 31]);
  for (const type of types) {
    assert.equal(first.distribution.byType[type], 2, type);
    assert.equal(first.distribution.byLocaleType[`en-US|${type}`], 1, type);
    assert.equal(first.distribution.byLocaleType[`ja-JP|${type}`], 1, type);
  }
  assert.equal(first.error, null);
});

test('PASS-368 style pool excludes sermon 1:11-1:15 and still spreads bands', () => {
  const types = listCommentaryTypes().map((item) => item.type);
  const candidates = [];
  for (const verse of Array.from({ length: 21 }, (_, i) => 11 + i)) {
    for (const type of types) {
      for (const locale of ['en-US', 'ja-JP']) {
        if (type === 'sermon' && verse >= 11 && verse <= 15) continue;
        candidates.push({
          targetKey: `genesis.1.${verse}.${type}.${locale}`,
          structuralGrade: 'PASS',
          status: 'translation-qa-passed',
          chapter: 1,
          verse,
          type,
          locale,
        });
      }
    }
  }
  assert.equal(candidates.length, 368);
  const selected = selectBatchReviewSample(candidates, {
    seed: 'gomna-pass368-sample-v1',
  });
  assert.equal(selected.sampleCount, 18);
  assert.equal(selected.error, null);
  assert.equal(selected.distribution.byBand.front, 6);
  assert.equal(selected.distribution.byBand.middle, 6);
  assert.equal(selected.distribution.byBand.end, 6);
  assert.equal(
    selected.sample.filter((item) => /^genesis\.1\.(1[1-5])\.sermon\./.test(item.targetKey))
      .length,
    0,
  );
});

test('splitVerseBands divides eligible verses without hard-coded numbers', () => {
  const bands = splitVerseBands([31, 11, 21, 11, 25]);
  assert.deepEqual(bands.verses, [11, 21, 25, 31]);
  assert.equal(bands.front.length + bands.middle.length + bands.end.length, 4);
});

test('empty sample pool yields BATCH_BLOCKED', () => {
  const report = buildApprovalCandidateReport([], {
    sampleMin: 18,
    sampleMax: 300,
  });
  assert.equal(report.batchStatus, BATCH_STATUS.BATCH_BLOCKED);
  assert.equal(report.sample.sampleCount, 0);
  assert.equal(report.autoApproveCandidateCount, 0);
  assert.equal(report.writesDisabled, true);
});

test('maxCount that drops locale coverage yields BATCH_BLOCKED', () => {
  const report = buildApprovalCandidateReport(
    [
      {
        targetKey: 'genesis.1.11.history.en-US',
        structuralGrade: 'PASS',
        status: 'structural-qa-passed',
        locale: 'en-US',
        type: 'history',
      },
      {
        targetKey: 'genesis.1.12.theology.ja-JP',
        structuralGrade: 'PASS',
        status: 'structural-qa-passed',
        locale: 'ja-JP',
        type: 'theology',
      },
    ],
    { sampleMin: 1, sampleMax: 1, sampleSeed: 'force-one' },
  );
  assert.equal(report.batchStatus, BATCH_STATUS.BATCH_BLOCKED);
  assert.ok(report.sample.coverageErrors?.length >= 1);
});

test('FAIL forces BATCH_BLOCKED', () => {
  const results = buildCandidates([11, 20, 31]);
  results.push({
    targetKey: 'genesis.1.15.history.en-US',
    structuralGrade: 'FAIL',
    status: 'failed',
  });
  const report = buildApprovalCandidateReport(results);
  assert.equal(report.batchStatus, BATCH_STATUS.BATCH_BLOCKED);
  assert.equal(report.failCount, 1);
});
