import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QA_GRADES,
  TRANSLATION_QA_STATUS,
  classifyTargetInventoryStatus,
  evaluateTargetQa,
  summarizeQaResults,
} from '../lib/commentary-multilang-qa.mjs';

test('missing artifacts classify as missing structural PASS', () => {
  const result = classifyTargetInventoryStatus({
    type: 'history',
    cardCount: 3,
    narrationExists: false,
    metaExists: false,
    metaApproved: false,
    audioExists: false,
    cueExists: false,
    manifestExists: false,
  });
  assert.equal(result.status, 'missing');
  assert.equal(result.structuralGrade, QA_GRADES.PASS);
});

test('complete inventory classifies as skipped-existing', () => {
  const result = classifyTargetInventoryStatus({
    type: 'history',
    cardCount: 3,
    narrationExists: true,
    metaExists: true,
    metaApproved: true,
    audioExists: true,
    cueExists: true,
    manifestExists: true,
  });
  assert.equal(result.status, 'skipped-existing');
  assert.equal(result.resumeComplete, true);
});

test('metadata without narration is FAIL', () => {
  const result = evaluateTargetQa({
    bookId: 'genesis',
    chapter: 1,
    verse: 11,
    type: 'history',
    locale: 'en-US',
    audioId: 'genesis.001.011.history.en-US',
    cardCount: 3,
    cardIdentities: ['a', 'b', 'c'],
    narrationExists: false,
    metaExists: true,
    metaApproved: false,
    metaStatus: 'draft',
    metaPath: 'tts-scripts/en-US/missing.meta.json',
    audioExists: false,
    cueExists: false,
    manifestExists: false,
  });
  assert.equal(result.structuralGrade, QA_GRADES.FAIL);
  assert.equal(result.translationQaStatus, TRANSLATION_QA_STATUS.NOT_RUN);
});

test('summarizeQaResults separates structural and translation QA', () => {
  const summary = summarizeQaResults([
    { structuralGrade: 'PASS', grade: 'PASS', status: 'structural-qa-passed' },
    {
      structuralGrade: 'REVIEW_REQUIRED',
      grade: 'REVIEW_REQUIRED',
      status: 'review-required',
    },
    { structuralGrade: 'FAIL', grade: 'FAIL', status: 'failed' },
  ]);
  assert.equal(summary.structuralQaPassCount, 1);
  assert.equal(summary.translationQaPassCount, 0);
  assert.equal(summary.translationQaStatus, TRANSLATION_QA_STATUS.NOT_RUN);
});
