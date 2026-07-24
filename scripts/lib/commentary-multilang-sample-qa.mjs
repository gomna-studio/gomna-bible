/**
 * Extra translation QA checks for sample-blocking defects:
 * - Japanese/Hangul script mixing in JA values
 * - Matthew Henry original === explanation
 * - Unverified EN hymn title mappings
 */

import {
  resolveHymnEnglishTitle,
  resolveTestamentLabel,
} from './commentary-multilang-glossary.mjs';

export function normalizeComparableText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  const tokens = normalizeComparableText(text)
    .split(' ')
    .filter((token) => token.length > 2);
  return new Set(tokens);
}

export function textSimilarityRatio(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Detect Hangul characters mixed into a value that also contains Japanese
 * script (Hiragana / Katakana / Kanji), e.g. 新약.
 * Pure Hangul residuals are handled separately by hangul_residual ratio checks.
 */
export function detectJapaneseHangulMix(text) {
  const value = String(text || '');
  if (!value.trim()) return [];
  const hangul = value.match(/\p{Script=Hangul}/gu) || [];
  if (!hangul.length) return [];
  const hasJapaneseScript =
    /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(value);
  if (!hasJapaneseScript) return [];
  return [
    {
      severity: 'FAIL',
      code: 'ja_hangul_script_mix',
      message: 'Japanese value contains Hangul characters',
      sample: value.slice(0, 80),
    },
  ];
}

function matthewHenryFieldPair(card) {
  const fields = card?.fields || {};
  const original =
    fields['영어원문'] ||
    fields['English Original'] ||
    fields['英語原文'] ||
    '';
  const explanation =
    fields['한국어번역'] ||
    fields['English Explanation'] ||
    fields['日本語訳'] ||
    '';
  return { original, explanation };
}

/**
 * EN Matthew Henry: explanation must not be a copy of the English original.
 */
export function detectMatthewHenryExplanationIssues(cards, locale) {
  if (locale !== 'en-US') return [];
  const findings = [];
  (cards || []).forEach((card, index) => {
    const { original, explanation } = matthewHenryFieldPair(card);
    if (!String(original || '').trim() || !String(explanation || '').trim()) {
      return;
    }
    const left = normalizeComparableText(original);
    const right = normalizeComparableText(explanation);
    if (left && right && left === right) {
      findings.push({
        severity: 'FAIL',
        code: 'matthew_henry_explanation_duplicate',
        message: `Matthew Henry explanation equals original at card ${index}`,
        sample: String(explanation).slice(0, 80),
      });
      return;
    }
    const similarity = textSimilarityRatio(original, explanation);
    if (similarity >= 0.92) {
      findings.push({
        severity: 'REVIEW_REQUIRED',
        code: 'matthew_henry_explanation_too_similar',
        message: `Matthew Henry explanation too similar to original at card ${index} (similarity=${similarity.toFixed(2)})`,
        sample: String(explanation).slice(0, 80),
      });
    }
  });
  return findings;
}

/**
 * EN hymn titles must resolve through verified glossary / approved maps.
 */
export function detectUnverifiedHymnTitles(cards, options = {}) {
  const findings = [];
  const sourceCards = options.sourceCards || [];
  const approvedNumberIndex = options.approvedHymnNumberIndex || null;

  (cards || []).forEach((card, index) => {
    const fields = card?.fields || {};
    const translatedTitle = String(fields['제목'] || '').trim();
    const sourceTitle = String(
      sourceCards[index]?.fields?.['제목'] || options.sourceTitles?.[index] || '',
    ).trim();
    const hymnNumber =
      fields['새찬송가'] ||
      sourceCards[index]?.fields?.['새찬송가'] ||
      null;

    if (!translatedTitle) {
      findings.push({
        severity: 'FAIL',
        code: 'hymn_title_missing',
        message: `Hymn title missing at card ${index}`,
      });
      return;
    }

    // If title still contains Hangul, it was not localized.
    if (/\p{Script=Hangul}/u.test(translatedTitle)) {
      findings.push({
        severity: 'REVIEW_REQUIRED',
        code: 'hymn_title_unverified',
        message: `Hymn title still Korean at card ${index}`,
        sample: translatedTitle.slice(0, 80),
      });
      return;
    }

    const resolved = resolveHymnEnglishTitle({
      koreanTitle: sourceTitle,
      hymnNumber,
      approvedNumberIndex,
    });
    if (!resolved.ok) {
      findings.push({
        severity: 'REVIEW_REQUIRED',
        code: 'hymn_title_unverified',
        message: `No verified English hymn title for source "${sourceTitle || '(missing)'}"`,
        sample: translatedTitle.slice(0, 80),
      });
      return;
    }

    if (
      normalizeComparableText(translatedTitle) !==
      normalizeComparableText(resolved.title)
    ) {
      findings.push({
        severity: 'REVIEW_REQUIRED',
        code: 'hymn_title_mismatch',
        message: `Hymn title "${translatedTitle}" does not match verified "${resolved.title}"`,
        sample: translatedTitle.slice(0, 80),
      });
    }
  });
  return findings;
}

export function detectSampleBlockerFindings(job, result, options = {}) {
  const locale = job?.locale || result?.locale;
  const cards = Array.isArray(result?.translatedCards)
    ? result.translatedCards
    : Array.isArray(result?.cards)
      ? result.cards
      : [];
  const findings = [];

  if (String(locale || '').startsWith('ja')) {
    for (const card of cards) {
      for (const [key, value] of Object.entries(card.fields || {})) {
        for (const finding of detectJapaneseHangulMix(String(value || ''))) {
          findings.push({
            ...finding,
            where: `card.${key}`,
          });
        }
        if (key === '구분') {
          const resolved = resolveTestamentLabel(value, 'ja-JP');
          if (
            resolved.ok &&
            normalizeComparableText(resolved.value) !==
              normalizeComparableText(value)
          ) {
            findings.push({
              severity: 'FAIL',
              code: 'ja_hangul_script_mix',
              message: `Testament label "${value}" is not approved JA form "${resolved.value}"`,
              sample: String(value).slice(0, 80),
              where: 'card.구분',
            });
          }
        }
      }
    }
    const narration = String(
      result?.narrationText ||
        (Array.isArray(result?.translatedNarrationParagraphs)
          ? result.translatedNarrationParagraphs.flat().join('\n')
          : ''),
    );
    for (const finding of detectJapaneseHangulMix(narration)) {
      findings.push({ ...finding, where: 'narration' });
    }
  }

  if (job?.type === 'matthew-henry') {
    findings.push(...detectMatthewHenryExplanationIssues(cards, locale));
  }

  if (job?.type === 'hymn' && locale === 'en-US') {
    findings.push(
      ...detectUnverifiedHymnTitles(cards, {
        sourceCards: job.sourceCards || [],
        approvedHymnNumberIndex: options.approvedHymnNumberIndex || null,
      }),
    );
  }

  return findings;
}

export function applySampleBlockerFindingsToQa(qa, findings) {
  if (!findings?.length) return qa;
  const reasons = [...(qa.reasons || [])];
  const codes = [...(qa.codes || [])];
  let grade = qa.translationGrade;

  for (const finding of findings) {
    reasons.push(
      `${finding.code}${finding.where ? `@${finding.where}` : ''}: ${finding.message}${
        finding.sample ? ` [${finding.sample}]` : ''
      }`,
    );
    codes.push(finding.code);
    if (finding.severity === 'FAIL') grade = 'FAIL';
    else if (
      finding.severity === 'REVIEW_REQUIRED' &&
      grade === 'PASS'
    ) {
      grade = 'REVIEW_REQUIRED';
    }
  }

  const uniqueCodes = [...new Set(codes)];
  const uniqueReasons = [...new Set(reasons)];
  return {
    ...qa,
    ok: grade === 'PASS',
    translationGrade: grade,
    translationQaStatus:
      grade === 'PASS'
        ? 'pass'
        : grade === 'REVIEW_REQUIRED' || grade === 'SOURCE_REVIEW_REQUIRED'
          ? 'review'
          : 'fail',
    reasons: uniqueReasons,
    codes: uniqueCodes,
    sampleBlockerFindings: findings,
  };
}
