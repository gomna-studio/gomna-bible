import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import {
  stageCardsFromTranslationResults,
} from '../lib/commentary-multilang-cards.mjs';
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
        Object.keys(card.fields || {}).map((key, fieldIndex) => {
          const sourceValue = String(card.fields[key] ?? '');
          const hebrew = (sourceValue.match(/\p{Script=Hebrew}+/gu) || []).join(' ');
          const base = `Translated value ${cardIndex}-${fieldIndex}`;
          return [key, hebrew ? `${hebrew} ${base}` : base];
        }),
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

test('stage cards writes only under /tmp and locks approved 1:1-1:10 overlap', () => {
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-cards-stage-'),
  );

  const approvedPlan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:1',
    to: '1:1',
    locales: 'en-US',
    types: 'history',
  });
  const approvedJobs = buildTranslationJobs(approvedPlan.targets).jobs;
  const approvedResults = approvedJobs.map(synthesizeResult);
  const locked = stageCardsFromTranslationResults(approvedJobs, approvedResults, {
    stagingRoot,
  });
  assert.ok(locked.lockedConflicts.length >= 1);
  assert.equal(locked.repoWrites, 0);
  assert.equal(locked.stagedCount, 0);

  const openPlan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'en-US,ja-JP',
    types: 'history',
  });
  const openJobs = buildTranslationJobs(openPlan.targets).jobs;
  const openResults = openJobs.map(synthesizeResult);
  const staged = stageCardsFromTranslationResults(openJobs, openResults, {
    stagingRoot,
  });
  assert.equal(staged.stagedCount, 2);
  assert.equal(staged.repoWrites, 0);
  assert.equal(staged.written.length, 2);
  for (const item of staged.written) {
    assert.ok(item.path.includes('commentary-cards'));
    assert.ok(fs.existsSync(item.path));
    const doc = JSON.parse(fs.readFileSync(item.path, 'utf8'));
    assert.equal(doc.locale, item.locale);
    assert.ok(doc.verses['창세기_1_11']);
    assert.ok(Array.isArray(doc.verses['창세기_1_11']['표2_역사적배경']));
  }

  assert.ok(
    !staged.written.some((item) =>
      item.path.includes('/Users/gomna/Desktop/gomna-bible-guide-related-navigation/data/'),
    ),
  );

  fs.rmSync(stagingRoot, { recursive: true, force: true });
});
