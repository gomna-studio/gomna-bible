import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectIncompleteTranslationOutput,
  detectIncompleteTranslationText,
  maskProtectedTranslationSpans,
} from '../lib/commentary-multilang-translation-completeness.mjs';
import {
  buildCommentaryMultilangRangeTargets,
} from '../lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJobs,
  evaluateTranslationResultQa,
} from '../lib/commentary-multilang-translation-io.mjs';
import { parseNarrationStructure } from '../lib/commentary-multilang-translation.mjs';

test('bible verse refs and hyphen pairs are masked for false-positive control', () => {
  const masked = maskProtectedTranslationSpans(
    'Genesis 1:11-31 and 種と実 - 従順のサイクル with תַּדְשֵׁא',
  );
  assert.match(masked, /«BREF»|«VREF»/);
  assert.match(masked, /«HYPHENPAIR»/);
  assert.match(masked, /«HEB»/);
});

test('JA incomplete application example is FAIL', () => {
  const text =
    '説教のタイトルは種と実 - 従順のサイクルです。適用例としては-を挙げることができます。';
  const findings = detectIncompleteTranslationText(text, { locale: 'ja-JP' });
  assert.ok(findings.some((item) => item.code === 'incomplete_after_introducer'));
  assert.equal(
    findings.find((item) => item.code === 'incomplete_after_introducer').severity,
    'FAIL',
  );
});

test('EN incomplete for example colon is FAIL', () => {
  const findings = detectIncompleteTranslationText(
    'The title is Seed and Fruit. Application example: -',
    { locale: 'en-US' },
  );
  assert.ok(
    findings.some(
      (item) =>
        item.code === 'incomplete_after_introducer' ||
        item.code === 'incomplete_empty_placeholder',
    ),
  );
});

test('empty bullet and template leftovers are FAIL', () => {
  const bullet = detectIncompleteTranslationText('Intro\n- \nNext', {
    locale: 'en-US',
  });
  assert.ok(bullet.some((item) => item.code === 'incomplete_empty_list_item'));

  const template = detectIncompleteTranslationText('Please [TODO] finish this', {
    locale: 'en-US',
  });
  assert.ok(template.some((item) => item.code === 'template_leftover'));
});

test('unclosed delimiter and trailing connective are detected', () => {
  const unclosed = detectIncompleteTranslationText('He said (open thought', {
    locale: 'en-US',
  });
  assert.ok(unclosed.some((item) => item.code === 'unclosed_delimiter'));

  const trailing = detectIncompleteTranslationText('We should remember that', {
    locale: 'en-US',
  });
  assert.ok(trailing.some((item) => item.code === 'trailing_connective'));
  assert.equal(
    trailing.find((item) => item.code === 'trailing_connective').severity,
    'REVIEW_REQUIRED',
  );

  // English verse wrappers with ASCII single quotes must not false-positive.
  const verseWrap = detectIncompleteTranslationText(
    "Genesis 1:12 history. The text is 'The earth brought forth vegetation.'",
    { locale: 'en-US' },
  );
  assert.equal(
    verseWrap.filter((item) => item.code === 'unclosed_delimiter').length,
    0,
  );
});

test('complete JA title hyphen and verse refs do not false-positive', () => {
  const text =
    '創世記1章11節、歴史的背景です。本文は「神が言われた」です。\n古代農耕社会を考えることができます。種類に従って - 創造秩序の核心を示します。';
  const findings = detectIncompleteTranslationText(text, { locale: 'ja-JP' });
  assert.equal(
    findings.filter((item) => item.code === 'incomplete_after_introducer').length,
    0,
  );
  assert.equal(
    findings.filter((item) => item.code === 'incomplete_empty_placeholder').length,
    0,
  );
});

test('evaluateTranslationResultQa marks JA sermon incomplete as FAIL and not PASS', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:11',
    locales: 'ja-JP',
    types: 'sermon',
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const paragraphs = parseNarrationStructure(job.sourceNarrationText).map(
    (lines, pIndex) =>
      lines.map((_line, lineIndex) => {
        if (pIndex === 1 && lineIndex === 0) {
          return '説教のタイトルは種と実 - 従順のサイクルです。適用例としては-を挙げることができます。';
        }
        return `Translated ja-JP p${pIndex + 1}l${lineIndex + 1} complete sentence.`;
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
  assert.equal(qa.ok, false);
  assert.equal(qa.integrityOk, true);
  assert.ok(
    qa.translationGrade === 'FAIL' ||
      qa.translationGrade === 'SOURCE_REVIEW_REQUIRED',
  );
  assert.ok(
    qa.codes.includes('incomplete_empty_placeholder') ||
      qa.codes.includes('incomplete_after_introducer') ||
      qa.codes.includes('source_incomplete_placeholder'),
  );
});

test('detectIncompleteTranslationOutput aggregates card placeholders', () => {
  const detected = detectIncompleteTranslationOutput({
    locale: 'en-US',
    narrationText: 'Genesis 1:11 historical background is complete.',
    cards: [
      {
        itemIndex: 0,
        identity: 'Title',
        fields: { title: 'Seed and Fruit', example: '-' },
      },
    ],
  });
  assert.equal(detected.ok, false);
  assert.equal(detected.grade, 'FAIL');
  assert.ok(
    detected.findings.some((item) =>
      String(item.where).includes('fields.example'),
    ),
  );
});
