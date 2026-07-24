import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJobs,
  detectSourceIncompletePlaceholders,
  evaluateTranslationResultQa,
} from '../lib/commentary-multilang-translation-io.mjs';
import { parseNarrationStructure } from '../lib/commentary-multilang-translation.mjs';

test('Korean sermon placeholder source is SOURCE_REVIEW_REQUIRED', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'ja-JP',
    types: 'sermon',
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const source = detectSourceIncompletePlaceholders(job);
  assert.equal(source.ok, false);

  const paragraphs = parseNarrationStructure(job.sourceNarrationText).map(
    (lines, pIndex) =>
      lines.map((_line, lineIndex) => {
        if (pIndex === 1 && lineIndex === 0) {
          return '説教のタイトルは種と実 - 従順のサイクルです。適用例としては-を挙げることができます。';
        }
        return `Translated complete line ${pIndex}-${lineIndex}.`;
      }),
  );
  const cards = job.sourceCards.map((card, index) => ({
    itemIndex: index,
    identity: `identity-${index}`,
    fields: Object.fromEntries(
      Object.keys(card.fields || {}).map((key, fieldIndex) => [
        key,
        key === '예화_적용' && index === 0
          ? '-'
          : `Translated value ${index}-${fieldIndex}`,
      ]),
    ),
  }));
  const qa = evaluateTranslationResultQa(job, {
    targetId: job.targetId,
    sourceHash: job.sourceHash,
    locale: job.locale,
    translatedCards: cards,
    translatedNarrationParagraphs: paragraphs,
  });
  assert.equal(qa.translationGrade, 'SOURCE_REVIEW_REQUIRED');
  assert.equal(qa.ok, false);
  assert.equal(qa.integrityOk, true);
  assert.ok(qa.codes.includes('source_incomplete_placeholder'));
});
