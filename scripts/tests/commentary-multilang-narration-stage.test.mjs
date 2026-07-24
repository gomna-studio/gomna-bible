import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import {
  buildAutoApproveCandidateReport,
  inspectApprovedNarrationLock,
  stageNarrationFromTranslationResults,
} from '../lib/commentary-multilang-narration-stage.mjs';
import {
  buildTranslationJobs,
} from '../lib/commentary-multilang-translation-io.mjs';
import {
  parseNarrationStructure,
} from '../lib/commentary-multilang-translation.mjs';

function synthesizeResult(job) {
  const sourceParagraphs = parseNarrationStructure(job.sourceNarrationText);
  return {
    targetId: job.targetId,
    sourceHash: job.sourceHash,
    locale: job.locale,
    model: 'fixture',
    translatedCards: job.sourceCards.map((card, cardIndex) => ({
      itemIndex: card.itemIndex,
      identity: `translated-identity-${card.itemIndex}`,
      fields: Object.fromEntries(
        Object.keys(card.fields || {}).map((key, fieldIndex) => [
          key,
          `Translated value ${cardIndex}-${fieldIndex}`,
        ]),
      ),
    })),
    translatedNarrationParagraphs: sourceParagraphs.map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          `Translated ${job.locale} p${pIndex + 1}l${lineIndex + 1}.`,
      ),
    ),
  };
}

test('approved genesis 1:1 narration is locked-skip and never overwritten', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:1',
    to: '1:1',
    locales: 'en-US',
    types: 'history',
  });
  const { jobs } = buildTranslationJobs(plan.targets);
  const job = jobs[0];
  const lock = inspectApprovedNarrationLock(job);
  assert.equal(lock.status, 'locked-skip');

  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-narration-stage-'),
  );
  const staged = stageNarrationFromTranslationResults(
    jobs,
    jobs.map(synthesizeResult),
    { stagingRoot },
  );
  assert.equal(staged.writtenCount, 0);
  assert.equal(staged.lockedSkip.length, 1);
  assert.equal(staged.repoWrites, 0);
  assert.equal(staged.approvedWrites, 0);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('missing range stages draft txt/meta under /tmp only', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'en-US',
    types: 'history',
  });
  const { jobs } = buildTranslationJobs(plan.targets);
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-narration-stage-'),
  );
  const staged = stageNarrationFromTranslationResults(
    jobs,
    jobs.map(synthesizeResult),
    { stagingRoot },
  );
  assert.equal(staged.writtenCount, 1);
  assert.equal(staged.repoWrites, 0);
  const item = staged.written[0];
  assert.ok(item.narrationPath.includes('tts-scripts'));
  assert.ok(item.metaPath.endsWith('.meta.json'));
  assert.ok(!item.narrationPath.includes('/data/commentary-cards/'));
  assert.equal(item.status, 'draft');
  const meta = JSON.parse(fs.readFileSync(item.metaPath, 'utf8'));
  assert.equal(meta.status, 'draft');
  assert.equal(meta.sourceHash, jobs[0].sourceHash);
  assert.ok(!meta.approvedAt);

  const report = buildAutoApproveCandidateReport({
    structuralResults: [{ structuralGrade: 'PASS' }],
    translationResults: [{ targetId: jobs[0].targetId, ok: true, translationGrade: 'PASS' }],
    lockedSkip: [],
    lockedConflict: [],
  });
  assert.equal(report.translationQaPassCount, 1);
  assert.equal(report.autoApproveCandidateCount, 1);
  assert.equal(report.writesDisabled, true);

  fs.rmSync(stagingRoot, { recursive: true, force: true });
});
