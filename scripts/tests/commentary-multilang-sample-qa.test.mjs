import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HYMN_TITLE_EN_BY_KO,
  repairJapaneseTestamentLabels,
  resolveHymnEnglishTitle,
  resolveTestamentLabel,
  TESTAMENT_GLOSSARY,
} from '../lib/commentary-multilang-glossary.mjs';
import {
  detectEnglishUnexpectedScripts,
  detectJapaneseHangulMix,
  detectMatthewHenryExplanationIssues,
  detectUnverifiedHymnTitles,
  normalizeComparableText,
  textSimilarityRatio,
} from '../lib/commentary-multilang-sample-qa.mjs';
import { evaluateTranslationResultQa } from '../lib/commentary-multilang-translation-io.mjs';
import { buildCommentaryMultilangRangeTargets } from '../lib/commentary-multilang-targets.mjs';
import { buildTranslationJobs } from '../lib/commentary-multilang-translation-io.mjs';
import { parseNarrationStructure } from '../lib/commentary-multilang-translation.mjs';

test('JA testament glossary uses approved 新約/旧約 forms', () => {
  assert.equal(TESTAMENT_GLOSSARY['ja-JP']['신약'], '新約');
  assert.equal(resolveTestamentLabel('신약', 'ja-JP').value, '新約');
  assert.equal(resolveTestamentLabel('新약', 'ja-JP').value, '新約');
  assert.equal(resolveTestamentLabel('新約', 'ja-JP').value, '新約');
});

test('Japanese Hangul mix is FAIL for mixed script values', () => {
  const findings = detectJapaneseHangulMix('新약');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'ja_hangul_script_mix');
  assert.equal(findings[0].severity, 'FAIL');
  assert.equal(detectJapaneseHangulMix('新約').length, 0);
  // Pure Hangul verse refs are not script-mix (handled by hangul_residual).
  assert.equal(detectJapaneseHangulMix('시104:24').length, 0);
});

test('Matthew Henry duplicate explanation is FAIL; near-copy is REVIEW', () => {
  const dup = detectMatthewHenryExplanationIssues(
    [
      {
        itemIndex: 0,
        fields: {
          영어원문: 'Day and night are tutors to duty and devotion.',
          한국어번역: 'Day and night are tutors to duty and devotion.',
          핵심통찰: 'Time Spirituality',
        },
      },
    ],
    'en-US',
  );
  assert.equal(dup[0].code, 'matthew_henry_explanation_duplicate');
  assert.equal(dup[0].severity, 'FAIL');

  const similar = detectMatthewHenryExplanationIssues(
    [
      {
        itemIndex: 0,
        fields: {
          영어원문: 'Day and night are tutors to duty and devotion.',
          한국어번역: 'Day and night are tutors to duty and to devotion.',
          핵심통찰: 'Time Spirituality',
        },
      },
    ],
    'en-US',
  );
  assert.ok(similar.length >= 1);
  assert.equal(similar[0].code, 'matthew_henry_explanation_too_similar');
  assert.equal(similar[0].severity, 'REVIEW_REQUIRED');
  assert.ok(textSimilarityRatio('a b c d', 'a b c e') > 0.5);
  assert.equal(
    normalizeComparableText('Hello, World!'),
    normalizeComparableText('hello world'),
  );
});

test('hymn English titles resolve from verified glossary only', () => {
  assert.equal(
    resolveHymnEnglishTitle({ koreanTitle: '기쁘다 구주 오셨네' }).title,
    'Joy to the World',
  );
  assert.equal(
    resolveHymnEnglishTitle({ koreanTitle: '찬양하라 복되신 구세주 예수' })
      .title,
    'Praise Him! Praise Him!',
  );
  assert.equal(
    resolveHymnEnglishTitle({ koreanTitle: '꽃들도' }).title,
    'Flowers (original title: Hana mo)',
  );
  assert.equal(
    resolveHymnEnglishTitle({ koreanTitle: '존재하지 않는 찬송' }).ok,
    false,
  );
  assert.ok(HYMN_TITLE_EN_BY_KO['강물같이 흐르는 기쁨']);

  const bad = detectUnverifiedHymnTitles(
    [{ fields: { 제목: 'All Creatures of Our God and King', 새찬송가: '496' } }],
    { sourceCards: [{ fields: { 제목: '꽃들도', 새찬송가: '496장' } }] },
  );
  assert.ok(bad.some((item) => item.code === 'hymn_title_mismatch'));
});

test('English unexpected scripts FAIL except Hebrew and Greek', () => {
  assert.equal(detectEnglishUnexpectedScripts('Flowers (original title: Hana mo)').length, 0);
  assert.equal(detectEnglishUnexpectedScripts('וַֽיְהִי־עֶ֥רֶב there was evening').length, 0);
  assert.ok(
    detectEnglishUnexpectedScripts('Flowers (原題 花も)').some(
      (item) => item.code === 'en_han_script',
    ),
  );
  assert.ok(
    detectEnglishUnexpectedScripts('Praise 찬양').some(
      (item) => item.code === 'en_hangul_script',
    ),
  );
});

test('evaluateTranslationResultQa flags 新약 and MH duplicates', () => {
  const jaPlan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:25',
    to: '1:25',
    locales: 'ja-JP',
    types: 'cross-reference',
  });
  const jaJob = buildTranslationJobs(jaPlan.targets).jobs[0];
  const jaBad = {
    targetId: jaJob.targetId,
    sourceHash: jaJob.sourceHash,
    locale: 'ja-JP',
    translatedCards: jaJob.sourceCards.map((card, index) => ({
      itemIndex: index,
      identity: `id-${index}`,
      fields: Object.fromEntries(
        Object.entries(card.fields || {}).map(([key, value]) => [
          key,
          key === '구분' && String(value) === '신약' ? '新약' : `訳:${value}`,
        ]),
      ),
    })),
    translatedNarrationParagraphs: parseNarrationStructure(
      jaJob.sourceNarrationText,
    ).map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          `翻訳された日本語 p${pIndex + 1}l${lineIndex + 1}です。`,
      ),
    ),
  };
  // Force one card to keep 新약
  jaBad.translatedCards[jaBad.translatedCards.length - 1].fields['구분'] =
    '新약';
  const jaQa = evaluateTranslationResultQa(jaJob, jaBad, {
    strictSampleQa: true,
  });
  assert.equal(jaQa.ok, false);
  assert.ok(jaQa.codes.includes('ja_hangul_script_mix'));

  const repaired = repairJapaneseTestamentLabels(jaBad);
  assert.equal(repaired.changed, true);
  assert.equal(
    repaired.result.translatedCards[repaired.result.translatedCards.length - 1]
      .fields['구분'],
    '新約',
  );

  const mhPlan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:18',
    to: '1:18',
    locales: 'en-US',
    types: 'matthew-henry',
  });
  const mhJob = buildTranslationJobs(mhPlan.targets).jobs[0];
  const mhBad = {
    targetId: mhJob.targetId,
    sourceHash: mhJob.sourceHash,
    locale: 'en-US',
    translatedCards: mhJob.sourceCards.map((card, index) => ({
      itemIndex: index,
      identity: `id-${index}`,
      fields: {
        영어원문: card.fields['영어원문'],
        한국어번역: card.fields['영어원문'],
        핵심통찰: `Insight ${index}`,
      },
    })),
    translatedNarrationParagraphs: parseNarrationStructure(
      mhJob.sourceNarrationText,
    ).map((lines, pIndex) =>
      lines.map(
        (_line, lineIndex) =>
          `Translated en-US p${pIndex + 1}l${lineIndex + 1}.`,
      ),
    ),
  };
  const mhQa = evaluateTranslationResultQa(mhJob, mhBad, {
    strictSampleQa: true,
  });
  assert.equal(mhQa.ok, false);
  assert.ok(mhQa.codes.includes('matthew_henry_explanation_duplicate'));
});
