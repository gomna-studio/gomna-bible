/* Auto-wrapped from scripts/lib/commentary-multilang-quality-policy.mjs */
(function (root) {
'use strict';
/**
 * Operational containment + quality gates for multilingual commentary.
 * Genesis EN/JA 1:1–1:10 = verified; 1:11–1:31 = contained (not shown).
 */

const VERIFIED_MULTILANG_SCOPE = Object.freeze({
  bookId: 'genesis',
  chapter: 1,
  verseFrom: 1,
  verseTo: 10,
  locales: Object.freeze(['en-US', 'ja-JP']),
});

const CONTAINED_MULTILANG_SCOPE = Object.freeze({
  bookId: 'genesis',
  chapter: 1,
  verseFrom: 11,
  verseTo: 31,
  locales: Object.freeze(['en-US', 'ja-JP']),
});

const MULTILANG_QUALITY_CRITERIA = Object.freeze([
  Object.freeze({
    id: 'card_count_match',
    summary: '한국어 카드 수와 영어·일본어 카드 수가 일치해야 한다.',
  }),
  Object.freeze({
    id: 'no_field_meaning_loss',
    summary: '한국어 각 필드의 의미가 누락되면 안 된다.',
  }),
  Object.freeze({
    id: 'no_arbitrary_abbreviation',
    summary: '임의 축약을 금지한다.',
  }),
  Object.freeze({
    id: 'no_language_mixing',
    summary: '한국어·영어·일본어 혼용을 금지한다(원어 히브/헬라는 예외).',
  }),
  Object.freeze({
    id: 'card_tts_alignment',
    summary: '카드 내용과 TTS 원고의 의미·순서가 일치해야 한다.',
  }),
  Object.freeze({
    id: 'natural_narration',
    summary: '표 값을 단순 나열하지 않고 자연스러운 해설문으로 작성한다.',
  }),
  Object.freeze({
    id: 'tts_requires_translation_approval',
    summary: '번역 검수 승인 전 TTS 생성을 금지한다.',
  }),
  Object.freeze({
    id: 'r2_requires_audio_approval',
    summary: '음성 검수 승인 전 R2 발행을 금지한다.',
  }),
  Object.freeze({
    id: 'structured_cross_refs',
    summary: '연관구절은 표준 bookId/chapter/verse를 별도 보관한다.',
  }),
]);

function normalizeCommentaryLocale(localeOrLang) {
  const raw = String(localeOrLang || '').trim();
  if (!raw || raw === 'ko' || raw === 'ko-KR') return 'ko-KR';
  if (raw === 'en' || raw === 'en-US') return 'en-US';
  if (raw === 'ja' || raw === 'ja-JP') return 'ja-JP';
  return raw;
}

function isMultilangLocale(localeOrLang) {
  const locale = normalizeCommentaryLocale(localeOrLang);
  return locale === 'en-US' || locale === 'ja-JP';
}

/**
 * True when EN/JA Genesis 1:11–1:31 should be hidden from the reader UI.
 * Data/R2 remain; only presentation is contained.
 */
function isContainedUnverifiedMultilangVerse({
  bookId,
  chapter,
  verse,
  locale,
} = {}) {
  if (!isMultilangLocale(locale)) return false;
  if (String(bookId || '').trim() !== CONTAINED_MULTILANG_SCOPE.bookId) {
    return false;
  }
  const ch = Number(chapter);
  const v = Number(verse);
  if (ch !== CONTAINED_MULTILANG_SCOPE.chapter) return false;
  return (
    Number.isInteger(v) &&
    v >= CONTAINED_MULTILANG_SCOPE.verseFrom &&
    v <= CONTAINED_MULTILANG_SCOPE.verseTo
  );
}

function isVerifiedMultilangVerse({ bookId, chapter, verse, locale } = {}) {
  if (!isMultilangLocale(locale)) return false;
  if (String(bookId || '').trim() !== VERIFIED_MULTILANG_SCOPE.bookId) {
    return false;
  }
  const ch = Number(chapter);
  const v = Number(verse);
  if (ch !== VERIFIED_MULTILANG_SCOPE.chapter) return false;
  return (
    Number.isInteger(v) &&
    v >= VERIFIED_MULTILANG_SCOPE.verseFrom &&
    v <= VERIFIED_MULTILANG_SCOPE.verseTo
  );
}

/** Gate for pipeline stages (documentation + future enforcement). */
function assertMultilangStageAllowed(stage, context = {}) {
  const name = String(stage || '').trim();
  if (name === 'tts' && context.translationApproved !== true) {
    return {
      ok: false,
      code: 'tts_requires_translation_approval',
      message: '번역 검수 승인 전 TTS 생성 금지',
    };
  }
  if (name === 'r2' && context.audioApproved !== true) {
    return {
      ok: false,
      code: 'r2_requires_audio_approval',
      message: '음성 검수 승인 전 R2 발행 금지',
    };
  }
  return { ok: true };
}

root.GomnaCommentaryMultilangPolicy = Object.freeze({
  VERIFIED_MULTILANG_SCOPE,
  CONTAINED_MULTILANG_SCOPE,
  MULTILANG_QUALITY_CRITERIA,
  normalizeCommentaryLocale,
  isMultilangLocale,
  isContainedUnverifiedMultilangVerse,
  isVerifiedMultilangVerse,
  assertMultilangStageAllowed,
});
})(typeof window !== 'undefined' ? window : globalThis);
