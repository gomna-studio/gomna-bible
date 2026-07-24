import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCommentaryMultilangRangeTargets,
  parseChapterVerseRef,
  resolveCommentaryVerseRange,
} from '../lib/commentary-multilang-targets.mjs';
import {
  buildPlanFromArgs,
  runCommentaryMultilangPipelineV2,
} from '../commentary-multilang-pipeline-v2.mjs';

test('parseChapterVerseRef accepts chapter:verse', () => {
  assert.deepEqual(parseChapterVerseRef('1:11'), { chapter: 1, verse: 11 });
});

test('resolveCommentaryVerseRange covers genesis 1:11-1:31', () => {
  const range = resolveCommentaryVerseRange({
    bookId: 'genesis',
    from: '1:11',
    to: '1:31',
  });
  assert.equal(range.verseCount, 21);
  assert.equal(range.from.verse, 11);
  assert.equal(range.to.verse, 31);
  assert.equal(range.excluded.length, 0);
});

test('range planner builds 378 targets for genesis 1:11-1:31 all types', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:31',
    locales: 'en-US,ja-JP',
    types: 'all',
  });
  assert.equal(plan.verseCount, 21);
  assert.equal(plan.targetCount, 378);
  assert.equal(plan.types.length, 9);
  assert.ok(plan.targets.every((target) => target.commentaryType));
  assert.ok(plan.targets.every((target) => target.cardCount >= 1));
});

test('cross-chapter range includes genesis 1:30-2:2', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:30',
    to: '2:2',
    locales: 'en-US',
    types: 'history',
  });
  assert.equal(plan.verseCount, 4);
  assert.equal(plan.targetCount, 4);
  assert.deepEqual(
    plan.targets.map((target) => `${target.chapter}:${target.verse}`),
    ['1:30', '1:31', '2:1', '2:2'],
  );
});

test('phase-1 blocks translate/upload steps', async () => {
  await assert.rejects(
    () =>
      runCommentaryMultilangPipelineV2([
        '--book',
        'genesis',
        '--from',
        '1:11',
        '--to',
        '1:11',
        '--steps',
        'translate',
      ]),
    /does not permit network/,
  );
});

test('phase-1 rejects --force', async () => {
  await assert.rejects(
    () =>
      runCommentaryMultilangPipelineV2([
        '--book',
        'genesis',
        '--force',
      ]),
    /Forbidden flag/,
  );
});

test('pipeline dry-run writes checkpoint and report under /tmp', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-v2-pipe-'));
  const checkpoint = path.join(dir, 'checkpoint.json');
  const report = path.join(dir, 'report.json');

  const result = await runCommentaryMultilangPipelineV2([
    '--book',
    'genesis',
    '--from',
    '1:11',
    '--to',
    '1:12',
    '--languages',
    'en-US,ja-JP',
    '--types',
    'history,theology',
    '--steps',
    'plan,extract,qa,report',
    '--dry-run',
    '--checkpoint',
    checkpoint,
    '--report',
    report,
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.plan.targetCount, 8);
  assert.ok(fs.existsSync(checkpoint));
  assert.ok(fs.existsSync(report));
  const reportJson = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(reportJson.publishBlocked, true);
  assert.equal(reportJson.networkBlocked, true);
  assert.equal(reportJson.qa.total, 8);
  assert.equal(reportJson.translationQaStatus, 'not-run');
  assert.equal(reportJson.autoApproveCandidateCount, 0);
  assert.ok(Number.isInteger(reportJson.structuralQaPassCount));
  assert.ok(Number.isInteger(reportJson.translationQaPassCount));
  for (const field of [
    'schemaVersion',
    'generatedAt',
    'repositoryHead',
    'branch',
    'command',
    'range',
    'targetCount',
    'expectedMaximumTargetCount',
    'countsByLocale',
    'countsByType',
    'countsByChapter',
    'existingCompletedCount',
    'plannedCount',
    'skippedCount',
    'structuralQaPassCount',
    'translationQaPassCount',
    'translationQaStatus',
    'autoApproveCandidateCount',
    'reviewRequiredCount',
    'failCount',
    'batchStatus',
    'sampleReviewTargetIds',
    'cuePrimaryAcceptedCount',
    'cueFallbackRequiredCount',
    'manifestRisk',
    'blockers',
    'nextCommand',
  ]) {
    assert.ok(field in reportJson, `missing report field: ${field}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
});

test('buildPlanFromArgs book-only uses full genesis span', () => {
  const plan = buildPlanFromArgs({
    book: 'genesis',
    languages: 'en-US',
    types: 'original-language',
    mode: 'plan',
    dryRun: true,
  });
  assert.ok(plan.verseCount >= 1500);
  assert.equal(plan.from.chapter, 1);
  assert.equal(plan.from.verse, 1);
});
