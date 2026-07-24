import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATCH_APPROVAL_MODES,
  BATCH_STATUS,
  buildApprovalCandidateReport,
  evaluateBatchApprovalEligibility,
  selectBatchReviewSample,
} from '../lib/commentary-multilang-batch-policy.mjs';
import { listCommentaryTypes } from '../lib/commentary-type-registry.mjs';

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

test('sample includes EN JA all nine types front mid end and is deterministic', () => {
  const types = listCommentaryTypes().map((item) => item.type);
  const candidates = [];
  for (const verse of [11, 20, 31]) {
    for (const type of types) {
      for (const locale of ['en-US', 'ja-JP']) {
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

  const first = selectBatchReviewSample(candidates, {
    seed: 'same-seed',
    minCount: 18,
    maxCount: 300,
  });
  const second = selectBatchReviewSample(candidates, {
    seed: 'same-seed',
    minCount: 18,
    maxCount: 300,
  });

  assert.equal(first.sampleCount, second.sampleCount);
  assert.deepEqual(
    first.sample.map((item) => item.targetKey),
    second.sample.map((item) => item.targetKey),
  );
  assert.ok(first.sampleCount >= 18);
  assert.ok(first.sampleCount <= 300);
  assert.ok(first.distribution.byLocale['en-US'] >= 1);
  assert.ok(first.distribution.byLocale['ja-JP'] >= 1);
  for (const type of types) {
    assert.ok(first.distribution.byType[type] >= 1, type);
  }
  assert.equal(first.error, null);
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
  // maxCount=1 cannot keep both locales => coverage error => blocked.
  assert.equal(report.batchStatus, BATCH_STATUS.BATCH_BLOCKED);
  assert.ok(report.sample.coverageErrors?.length >= 1);
});

test('FAIL forces BATCH_BLOCKED', () => {
  const types = listCommentaryTypes().map((item) => item.type);
  const results = [];
  for (const verse of [11, 20, 31]) {
    for (const type of types) {
      for (const locale of ['en-US', 'ja-JP']) {
        results.push({
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
  results.push({
    targetKey: 'genesis.1.15.history.en-US',
    structuralGrade: 'FAIL',
    status: 'failed',
  });
  const report = buildApprovalCandidateReport(results);
  assert.equal(report.batchStatus, BATCH_STATUS.BATCH_BLOCKED);
  assert.equal(report.failCount, 1);
});
