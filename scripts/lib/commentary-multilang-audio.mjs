/**
 * Multilingual commentary MP3 generation helpers.
 * Side-effect free at import time. Writes are performed only by the caller.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  assertVoicePresetForType,
  getCommentaryType,
  getCommentaryVoicePreset,
  getNarrationStructurePolicy,
} from './commentary-type-registry.mjs';
import { getLocaleConfig } from './commentary-multilang-registry.mjs';
import {
  buildKoreanSourcePath,
  buildNarrationStructureSignature,
  parseNarrationStructure,
  sha256Bytes,
  sha256Text,
} from './commentary-multilang-translation.mjs';
import { buildNarrationSpeechUnits } from './commentary-multilang-cue.mjs';
import {
  requireMultilangStageApproval,
  resolveTranslationApproved,
} from './commentary-multilang-quality-policy.mjs';

export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const DEFAULT_AUDIO_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_AUDIO_VOICE = 'marin';
export const DEFAULT_AUDIO_RESPONSE_FORMAT = 'mp3';
export const DEFAULT_AUDIO_VOICE_PRESET = 'study';

export const ENGLISH_STUDY_BASE_INSTRUCTIONS =
  'Read this Bible commentary in calm, warm, clear American English, at a measured study pace, with natural pauses between sentences.';

export const JAPANESE_STUDY_BASE_INSTRUCTIONS =
  '落ち着いた温かく明瞭な日本語で、聖書解説を学びのペースでゆっくり読んでください。文の間に自然な間を置いてください。';

const PRESET_BASE_INSTRUCTIONS = Object.freeze({
  study: Object.freeze({
    'en-US': ENGLISH_STUDY_BASE_INSTRUCTIONS,
    'ja-JP': JAPANESE_STUDY_BASE_INSTRUCTIONS,
  }),
  warm: Object.freeze({
    'en-US':
      'Read this Bible commentary in warm, clear American English, with a pastoral tone and natural pauses between sentences.',
    'ja-JP':
      '温かく明瞭な日本語で、牧会的なトーンの聖書解説を自然な間を置きながら読んでください。',
  }),
  calm: Object.freeze({
    'en-US':
      'Read this Bible commentary in calm, gentle American English, with unhurried clarity and natural pauses between sentences.',
    'ja-JP':
      '落ち着いたやさしい日本語で、急がず明瞭に聖書解説を読み、文の間に自然な間を置いてください。',
  }),
  strong: Object.freeze({
    'en-US':
      'Read this Bible commentary in clear, confident American English suitable for sermon material, with firm pacing and natural pauses between sentences.',
    'ja-JP':
      '説教資料にふさわしい、はっきりとした自信ある日本語で聖書解説を読み、文の間に自然な間を置いてください。',
  }),
  soft: Object.freeze({
    'en-US':
      'Read this Bible commentary in soft, reverent American English suitable for hymn meditation, with gentle pacing and natural pauses between sentences.',
    'ja-JP':
      '賛美の黙想にふさわしい、やわらかく敬虔な日本語で聖書解説を読み、文の間に自然な間を置いてください。',
  }),
});

const REJECTED_TARGET_LOCALES = new Set(['ko', 'ko-KR']);

/** Canonical metadata fields from approved Genesis 1:2–3 EN/JA targets. */
const STRICT_REQUIRED_METADATA_KEYS = Object.freeze([
  'sourcePath',
  'sourceHashAlgorithm',
  'sourceHash',
  'sourceLocale',
  'targetLocale',
  'status',
  'translatedAt',
  'bookId',
  'chapter',
  'verse',
  'type',
  'paragraphCount',
  'cardCount',
  'narrationHashAlgorithm',
  'narrationHash',
  'model',
  'structureValidated',
  'sourceStructure',
  'narrationStructure',
  'reviewedAt',
  'approvedAt',
]);

const fsExistsSync = fs.existsSync.bind(fs);
const fsMkdirSync = fs.mkdirSync.bind(fs);
const fsOpenSync = fs.openSync.bind(fs);
const fsWriteFileSync = fs.writeFileSync.bind(fs);
const fsCloseSync = fs.closeSync.bind(fs);
const fsReadFileSync = fs.readFileSync.bind(fs);
const fsLinkSync = fs.linkSync.bind(fs);
const fsUnlinkSync = fs.unlinkSync.bind(fs);
const fsStatSync = fs.statSync.bind(fs);

/**
 * Detect whether the Korean source narration includes a closing speech unit.
 * Uses buildNarrationSpeechUnits when possible; falls back to structural forms
 * for types (e.g. original-language) that require closing in cue policy even
 * when the approved source itself has no closing paragraph.
 */
function detectSourceHasClosing(sourceText, cardCount, type) {
  try {
    const units = buildNarrationSpeechUnits(sourceText, cardCount, { type });
    return units.some((unit) => unit.kind === 'closing');
  } catch {
    // Continue with structural / relaxed parsing.
  }

  const signature = buildNarrationStructureSignature(
    parseNarrationStructure(sourceText),
  );
  const expectedCards = Number(cardCount);
  if (
    Number.isFinite(expectedCards) &&
    expectedCards > 0 &&
    signature.paragraphCount === 3 &&
    signature.lineCounts[0] === 1 &&
    signature.lineCounts[2] === 1 &&
    signature.lineCounts[1] === expectedCards
  ) {
    return true;
  }
  if (
    Number.isFinite(expectedCards) &&
    expectedCards > 0 &&
    signature.lineCounts.every((count) => count === 1) &&
    signature.paragraphCount === expectedCards + 2
  ) {
    return true;
  }

  try {
    const units = buildNarrationSpeechUnits(sourceText, cardCount, {});
    return units.some((unit) => unit.kind === 'closing');
  } catch {
    return false;
  }
}

/**
 * Build speech units for structure comparison.
 * When requireClosing is false, optional target closing is omitted from units
 * (includeClosing: false) so KO-without-closing and EN/JA-with-closing can match.
 */
function buildComparableSpeechUnits(text, cardCount, type, requireClosing) {
  const opts = {
    type,
    includeClosing: requireClosing ? true : false,
  };
  try {
    return buildNarrationSpeechUnits(text, cardCount, opts);
  } catch (error) {
    if (!requireClosing) {
      return buildNarrationSpeechUnits(text, cardCount, {
        includeClosing: false,
      });
    }
    throw error;
  }
}

function speechUnitStructureKey(units) {
  return units.map((unit) => {
    if (unit.kind === 'item') {
      return `item:${unit.itemIndex}`;
    }
    return unit.kind;
  });
}

function validateSpeechUnitCardItems(units, cardCount) {
  const expectedCards = Number(cardCount);
  const items = units.filter((unit) => unit.kind === 'item');
  if (items.length !== expectedCards) {
    return {
      ok: false,
      reason: `card item count ${items.length} != cardCount ${expectedCards}`,
    };
  }
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].itemIndex !== index) {
      return {
        ok: false,
        reason: `card item order broken at index ${index} (itemIndex=${items[index].itemIndex})`,
      };
    }
  }
  return { ok: true, items };
}

function countHangulChars(text) {
  const matches = String(text).match(/\p{Script=Hangul}/gu);
  return matches ? matches.length : 0;
}

function trimTerm(value) {
  return String(value || '')
    .trim()
    .replace(/^[\s"'“”‘’「」『』]+/, '')
    .replace(/[\s"'“”‘’「」『』.,;:!?。、]+$/u, '')
    .trim();
}

export function isLegacyGenesis11PilotTarget(target) {
  return (
    String(target?.bookId || '') === 'genesis' &&
    Number(target?.chapter) === 1 &&
    Number(target?.verse) === 1 &&
    String(target?.type || '') === 'original-language' &&
    (target?.locale === 'en-US' || target?.locale === 'ja-JP')
  );
}

function getCardLines(paragraphs, cardCount) {
  const signature = buildNarrationStructureSignature(paragraphs);
  const expectedCards = Number(cardCount);

  if (
    signature.paragraphCount === 3 &&
    signature.lineCounts[0] === 1 &&
    signature.lineCounts[2] === 1 &&
    signature.lineCounts[1] > 0
  ) {
    const lines = paragraphs[1];
    if (Number.isFinite(expectedCards) && expectedCards > 0 && lines.length !== expectedCards) {
      throw new Error(
        `middle card line count ${lines.length} != cardCount ${expectedCards}`,
      );
    }
    return lines;
  }

  // Intro + packed card lines without closing: [1, cardCount]
  if (
    signature.paragraphCount === 2 &&
    signature.lineCounts[0] === 1 &&
    signature.lineCounts[1] > 0
  ) {
    const lines = paragraphs[1];
    if (
      Number.isFinite(expectedCards) &&
      expectedCards > 0 &&
      lines.length !== expectedCards
    ) {
      throw new Error(
        `packed card line count ${lines.length} != cardCount ${expectedCards}`,
      );
    }
    return lines;
  }

  if (
    signature.paragraphCount >= 3 &&
    signature.lineCounts.every((count) => count === 1)
  ) {
    const middle = paragraphs.slice(1, -1).map((lines) => lines[0]);
    if (
      Number.isFinite(expectedCards) &&
      expectedCards > 0 &&
      middle.length !== expectedCards
    ) {
      throw new Error(
        `middle card paragraph count ${middle.length} != cardCount ${expectedCards}`,
      );
    }
    return middle;
  }

  throw new Error(
    `unsupported narration structure for term extraction: ${JSON.stringify(signature.lineCounts)}`,
  );
}

function extractEnglishTermFromCardLine(line) {
  const text = String(line || '').trim();
  if (!text) {
    throw new Error('empty English card line');
  }

  const isIndex = text.indexOf(' is ');
  if (isIndex > 0) {
    const before = trimTerm(text.slice(0, isIndex));
    // Card lines in [1,N,1] form begin with the term itself.
    if (before && text.startsWith(before)) {
      return before;
    }
  }

  const quoted = text.match(/[“"]([^”"]+)[”"]/);
  if (quoted) {
    const term = trimTerm(quoted[1]);
    if (term) return term;
  }

  throw new Error(`unable to extract English pronunciation term from: ${text}`);
}

function isJapanesePronunciationToken(term) {
  // Card-leading transliterations are katakana or Latin; reject Japanese glosses.
  // Allow a single katakana middle dot (・ U+30FB) only between two non-empty
  // kana/prolonged-sound segments (e.g. ヨーム・シェニー). Latin may not use ・.
  const value = String(term || '');
  if (!value) return false;
  if (value.includes('・')) {
    return /^[ァ-ヶー]+・[ァ-ヶー]+$/u.test(value);
  }
  return /^[A-Za-z'’\-ァ-ヶー]+$/u.test(value);
}

function extractJapaneseTermFromCardLine(line) {
  const text = String(line || '').trim();
  if (!text) {
    throw new Error('empty Japanese card line');
  }

  // Canonical [1,N,1] cards begin with the term itself before particle は.
  const particleIndex = text.indexOf('は');
  if (particleIndex > 0) {
    const before = trimTerm(text.slice(0, particleIndex));
    if (
      before &&
      text.startsWith(before) &&
      isJapanesePronunciationToken(before)
    ) {
      return before;
    }
  }

  // Legacy Genesis 1:1 style embeds the term in 「」 / 『』 quotes.
  const quoted = text.match(/[「『]([^」』]+)[」』]/);
  if (quoted) {
    const term = trimTerm(quoted[1]);
    if (term && isJapanesePronunciationToken(term)) {
      return term;
    }
  }

  throw new Error(`unable to extract Japanese pronunciation term from: ${text}`);
}

/**
 * Extract ordered pronunciation terms from an approved original-language narration.
 */
export function extractOriginalLanguagePronunciationTerms(
  locale,
  narrationText,
  { cardCount } = {},
) {
  const normalizedLocale = String(locale || '').trim();
  if (REJECTED_TARGET_LOCALES.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }
  getLocaleConfig(normalizedLocale);

  const paragraphs = parseNarrationStructure(narrationText);
  const cardLines = getCardLines(paragraphs, cardCount);
  if (!cardLines.length) {
    throw new Error('no card lines available for pronunciation extraction');
  }

  const extract =
    normalizedLocale === 'en-US'
      ? extractEnglishTermFromCardLine
      : normalizedLocale === 'ja-JP'
        ? extractJapaneseTermFromCardLine
        : null;

  if (!extract) {
    throw new Error(`unsupported locale for pronunciation extraction: ${normalizedLocale}`);
  }

  const terms = cardLines.map((line) => extract(line));
  const unique = new Set(terms);
  if (unique.size !== terms.length) {
    throw new Error(`duplicated pronunciation terms: ${terms.join(', ')}`);
  }
  if (terms.some((term) => !term)) {
    throw new Error('empty pronunciation term after extraction');
  }

  return terms;
}

/**
 * Build study-preset TTS instructions for one target from extracted terms.
 */
export function buildStudyTtsInstructions(locale, pronunciationTerms) {
  const normalizedLocale = String(locale || '').trim();
  const terms = Array.isArray(pronunciationTerms)
    ? pronunciationTerms.map((term) => String(term || '').trim()).filter(Boolean)
    : [];

  if (!terms.length) {
    throw new Error('pronunciationTerms must be a non-empty array');
  }

  if (normalizedLocale === 'en-US') {
    return `${ENGLISH_STUDY_BASE_INSTRUCTIONS} Pronounce Hebrew transliterations (${terms.join(', ')}) carefully and clearly.`;
  }

  if (normalizedLocale === 'ja-JP') {
    return `${JAPANESE_STUDY_BASE_INSTRUCTIONS}カタカナのヘブライ語（${terms.join('、')}）は丁寧にはっきり発音してください。`;
  }

  throw new Error(`unsupported locale for study instructions: ${normalizedLocale}`);
}

export function buildPresetTtsInstructions(locale, voicePreset, {
  type,
  pronunciationTerms,
} = {}) {
  const normalizedLocale = String(locale || '').trim();
  const preset = String(voicePreset || '').trim();
  const base = PRESET_BASE_INSTRUCTIONS[preset]?.[normalizedLocale];
  if (!base) {
    throw new Error(
      `unsupported locale/preset instructions: ${normalizedLocale}/${preset}`,
    );
  }

  if (String(type || '') === 'original-language') {
    return buildStudyTtsInstructions(normalizedLocale, pronunciationTerms);
  }

  return base;
}

/**
 * Resolve TTS configuration for a locale + registered type preset.
 * Hebrew-term instructions apply only to original-language.
 */
export function resolveCommentaryTtsConfig({
  locale,
  type,
  voicePreset,
  narrationText,
  cardCount,
  pronunciationTerms,
} = {}) {
  const normalizedLocale = String(locale || '').trim();
  if (REJECTED_TARGET_LOCALES.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }

  getLocaleConfig(normalizedLocale);

  const commentaryType = String(type || '').trim();
  if (!commentaryType) {
    throw new Error('type is required to resolve commentary TTS config');
  }

  const expectedPreset = getCommentaryVoicePreset(commentaryType);
  const preset = assertVoicePresetForType(
    commentaryType,
    voicePreset || expectedPreset,
  );

  let terms = pronunciationTerms || [];
  if (commentaryType === 'original-language') {
    if (!terms.length) {
      if (narrationText == null) {
        throw new Error(
          'narrationText or pronunciationTerms is required for original-language TTS instructions',
        );
      }
      terms = extractOriginalLanguagePronunciationTerms(
        normalizedLocale,
        narrationText,
        { cardCount },
      );
    }
  } else {
    terms = [];
  }

  const instructions = buildPresetTtsInstructions(normalizedLocale, preset, {
    type: commentaryType,
    pronunciationTerms: terms,
  });

  return {
    locale: normalizedLocale,
    type: commentaryType,
    endpoint: OPENAI_SPEECH_URL,
    model: DEFAULT_AUDIO_MODEL,
    voice: DEFAULT_AUDIO_VOICE,
    responseFormat: DEFAULT_AUDIO_RESPONSE_FORMAT,
    voicePreset: preset,
    instructions,
    pronunciationTerms: terms,
  };
}

function readJsonIfExists(absolutePath) {
  if (!fsExistsSync(absolutePath)) {
    return { exists: false, data: null, error: null };
  }
  try {
    return {
      exists: true,
      data: JSON.parse(fsReadFileSync(absolutePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      data: null,
      error: `malformed_metadata: ${error.message}`,
    };
  }
}

function validateLegacyGenesis11Metadata(data, target) {
  if (data.status !== 'approved') {
    return {
      ok: false,
      action: 'block_unapproved_narration',
      reason: `status=${data.status || 'missing'}`,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'humanReviewRequired') &&
    data.humanReviewRequired !== false
  ) {
    return {
      ok: false,
      action: 'block_unapproved_narration',
      reason: 'humanReviewRequired remains true',
    };
  }

  if (!data.reviewedAt || !data.approvedAt) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'legacy Genesis 1:1 metadata missing reviewedAt/approvedAt',
    };
  }

  if (data.reviewedAt !== data.approvedAt) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'reviewedAt must equal approvedAt',
    };
  }

  if (data.targetLocale != null && data.targetLocale !== target.locale) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `targetLocale=${data.targetLocale} expected=${target.locale}`,
    };
  }

  if (data.sourceLocale != null && data.sourceLocale !== 'ko-KR') {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `sourceLocale=${data.sourceLocale}`,
    };
  }

  for (const [key, expected] of [
    ['bookId', target.bookId],
    ['type', target.type],
  ]) {
    if (data[key] != null && data[key] !== expected) {
      return {
        ok: false,
        action: 'block_invalid_metadata',
        reason: `${key} mismatch: ${data[key]}`,
      };
    }
  }

  if (data.chapter != null && Number(data.chapter) !== Number(target.chapter)) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `chapter mismatch: ${data.chapter}`,
    };
  }
  if (data.verse != null && Number(data.verse) !== Number(target.verse)) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `verse mismatch: ${data.verse}`,
    };
  }

  return { ok: true };
}

function validateStrictApprovedMetadata(data, target, expectedSourcePath) {
  for (const key of STRICT_REQUIRED_METADATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      return {
        ok: false,
        action: 'block_invalid_metadata',
        reason: `missing required metadata field: ${key}`,
      };
    }
  }

  if (data.status !== 'approved') {
    return {
      ok: false,
      action: 'block_unapproved_narration',
      reason: `status=${data.status || 'missing'}`,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'humanReviewRequired') &&
    data.humanReviewRequired !== false
  ) {
    return {
      ok: false,
      action: 'block_unapproved_narration',
      reason: 'humanReviewRequired remains true',
    };
  }

  if (data.structureValidated !== true) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'structureValidated must be true',
    };
  }

  if (data.sourceHashAlgorithm !== 'sha256') {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `sourceHashAlgorithm=${data.sourceHashAlgorithm}`,
    };
  }

  if (data.narrationHashAlgorithm !== 'sha256') {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `narrationHashAlgorithm=${data.narrationHashAlgorithm}`,
    };
  }

  if (data.sourceLocale !== 'ko-KR') {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `sourceLocale=${data.sourceLocale}`,
    };
  }

  if (data.targetLocale !== target.locale) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `targetLocale=${data.targetLocale} expected=${target.locale}`,
    };
  }

  if (data.bookId !== target.bookId) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `bookId mismatch: ${data.bookId}`,
    };
  }

  if (Number(data.chapter) !== Number(target.chapter)) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `chapter mismatch: ${data.chapter}`,
    };
  }

  if (Number(data.verse) !== Number(target.verse)) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `verse mismatch: ${data.verse}`,
    };
  }

  if (data.type !== target.type) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `type mismatch: ${data.type}`,
    };
  }

  if (data.sourcePath !== expectedSourcePath) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `sourcePath=${data.sourcePath} expected=${expectedSourcePath}`,
    };
  }

  if (Number(data.cardCount) !== Number(target.cardCount)) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `cardCount metadata=${data.cardCount} target=${target.cardCount}`,
    };
  }

  if (!data.reviewedAt || !data.approvedAt) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'reviewedAt/approvedAt missing',
    };
  }

  if (data.reviewedAt !== data.approvedAt) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'reviewedAt must equal approvedAt',
    };
  }

  if (typeof data.model !== 'string' || !data.model.trim()) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'model must be a non-empty string',
    };
  }

  if (
    !data.sourceStructure ||
    typeof data.sourceStructure !== 'object' ||
    !data.narrationStructure ||
    typeof data.narrationStructure !== 'object'
  ) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: 'sourceStructure/narrationStructure must be objects',
    };
  }

  return { ok: true };
}

/**
 * Validate an approved narration target before audio generation.
 * Returns { ok, action, reason, ...details }.
 */
export function validateApprovedNarrationTarget({
  target,
  root,
  toAbsolute,
} = {}) {
  const abs = typeof toAbsolute === 'function'
    ? toAbsolute
    : (relativePath) => path.join(root, relativePath);

  const locale = String(target?.locale || '').trim();
  if (REJECTED_TARGET_LOCALES.has(locale)) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: `Korean locale is rejected: ${locale}`,
    };
  }

  try {
    getLocaleConfig(locale);
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: error.message,
    };
  }

  let voicePreset;
  try {
    const definition = getCommentaryType(target?.type);
    voicePreset = assertVoicePresetForType(
      definition.type,
      target?.voicePreset || definition.voicePreset,
    );
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_audio_preset',
      reason: error.message,
    };
  }

  const narrationAbs = abs(target.narrationPath);
  const metaAbs = abs(target.metaPath);

  if (!fsExistsSync(narrationAbs)) {
    return {
      ok: false,
      action: 'block_missing_narration',
      reason: `missing narration: ${target.narrationPath}`,
    };
  }

  const meta = readJsonIfExists(metaAbs);
  if (!meta.exists) {
    return {
      ok: false,
      action: 'block_missing_metadata',
      reason: `missing metadata: ${target.metaPath}`,
    };
  }
  if (meta.error || !meta.data) {
    return {
      ok: false,
      action: 'block_missing_metadata',
      reason: meta.error || 'metadata unreadable',
    };
  }

  const data = meta.data;
  const legacyPilot = isLegacyGenesis11PilotTarget(target);
  const expectedSourcePath = buildKoreanSourcePath(
    target.bookId,
    target.chapter,
    target.verse,
    target.type,
  );

  const schemaCheck = legacyPilot
    ? validateLegacyGenesis11Metadata(data, target)
    : validateStrictApprovedMetadata(data, target, expectedSourcePath);

  if (!schemaCheck.ok) {
    return schemaCheck;
  }

  const sourcePath = legacyPilot
    ? data.sourcePath || expectedSourcePath
    : data.sourcePath;

  if (!legacyPilot && sourcePath !== expectedSourcePath) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: `sourcePath=${sourcePath} expected=${expectedSourcePath}`,
    };
  }

  const sourceAbs = abs(sourcePath);
  if (!fsExistsSync(sourceAbs)) {
    return {
      ok: false,
      action: 'block_source_hash_mismatch',
      reason: `Korean source missing: ${sourcePath}`,
    };
  }

  const sourceBytes = fsReadFileSync(sourceAbs);
  const sourceText = sourceBytes.toString('utf8');
  const actualSourceHash = sha256Bytes(sourceBytes);
  if (!data.sourceHash || data.sourceHash !== actualSourceHash) {
    return {
      ok: false,
      action: 'block_source_hash_mismatch',
      reason: `sourceHash stored=${data.sourceHash || 'missing'} current=${actualSourceHash}`,
    };
  }

  const narrationBytes = fsReadFileSync(narrationAbs);
  const narrationText = narrationBytes.toString('utf8');
  const actualNarrationHash = sha256Bytes(narrationBytes);

  if (!legacyPilot) {
    if (data.narrationHash !== actualNarrationHash) {
      return {
        ok: false,
        action: 'block_narration_hash_mismatch',
        reason: `narrationHash stored=${data.narrationHash} current=${actualNarrationHash}`,
      };
    }
  } else if (
    Object.prototype.hasOwnProperty.call(data, 'narrationHash') &&
    data.narrationHash !== actualNarrationHash
  ) {
    return {
      ok: false,
      action: 'block_narration_hash_mismatch',
      reason: `narrationHash stored=${data.narrationHash} current=${actualNarrationHash}`,
    };
  }

  if (!String(narrationText || '').trim()) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: 'narration is empty',
    };
  }

  const sourceStructure = parseNarrationStructure(sourceText);
  const narrationStructure = parseNarrationStructure(narrationText);
  const sourceSignature = buildNarrationStructureSignature(sourceStructure);
  const narrationSignature = buildNarrationStructureSignature(narrationStructure);

  let structurePolicy;
  try {
    structurePolicy = getNarrationStructurePolicy(target.type);
    getCommentaryType(target.type);
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_audio_preset',
      reason: error.message,
    };
  }

  for (let i = 0; i < narrationStructure.length; i += 1) {
    if (!narrationStructure[i].length) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason: `empty paragraph ${i + 1}`,
      };
    }
    for (let j = 0; j < narrationStructure[i].length; j += 1) {
      if (!narrationStructure[i][j]) {
        return {
          ok: false,
          action: 'block_structure_mismatch',
          reason: `empty line at paragraph ${i + 1} line ${j + 1}`,
        };
      }
    }
  }

  const expectedCardCount = Number(target.cardCount);
  if (!Number.isFinite(expectedCardCount) || expectedCardCount < 1) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: `invalid cardCount ${target.cardCount}`,
    };
  }

  // Closing is required on the target only when the Korean source has one and
  // the type policy asks for closingRequiredWhenPresentInSource. Optional
  // target closing is omitted from comparable units when not required.
  const sourceHasClosing = detectSourceHasClosing(
    sourceText,
    expectedCardCount,
    target.type,
  );
  const requireClosingOnTarget =
    sourceHasClosing &&
    structurePolicy.closingRequiredWhenPresentInSource !== false;

  let sourceSpeechUnits;
  let narrationSpeechUnits;
  try {
    sourceSpeechUnits = buildComparableSpeechUnits(
      sourceText,
      expectedCardCount,
      target.type,
      requireClosingOnTarget,
    );
    narrationSpeechUnits = buildComparableSpeechUnits(
      narrationText,
      expectedCardCount,
      target.type,
      requireClosingOnTarget,
    );
  } catch (error) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: error.message,
    };
  }

  const sourceItemsCheck = validateSpeechUnitCardItems(
    sourceSpeechUnits,
    expectedCardCount,
  );
  if (!sourceItemsCheck.ok) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: `Korean source ${sourceItemsCheck.reason}`,
    };
  }

  const narrationItemsCheck = validateSpeechUnitCardItems(
    narrationSpeechUnits,
    expectedCardCount,
  );
  if (!narrationItemsCheck.ok) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: narrationItemsCheck.reason,
    };
  }

  const sourceHasIntro = sourceSpeechUnits.some((unit) => unit.kind === 'intro');
  const narrationHasIntro = narrationSpeechUnits.some(
    (unit) => unit.kind === 'intro',
  );
  if (sourceHasIntro !== narrationHasIntro) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: sourceHasIntro
        ? 'narration is missing intro speech unit present in Korean source'
        : 'narration has intro speech unit absent from Korean source',
    };
  }

  if (requireClosingOnTarget) {
    const narrationHasClosing = narrationSpeechUnits.some(
      (unit) => unit.kind === 'closing',
    );
    if (!narrationHasClosing) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason:
          'narration must include closing because Korean source has closing',
      };
    }
  }

  const sourceKey = speechUnitStructureKey(sourceSpeechUnits);
  const narrationKey = speechUnitStructureKey(narrationSpeechUnits);
  if (JSON.stringify(sourceKey) !== JSON.stringify(narrationKey)) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: `speech units source=${JSON.stringify(sourceKey)} narration=${JSON.stringify(narrationKey)}`,
    };
  }

  if (
    Array.isArray(target.cardIdentities) &&
    target.cardIdentities.length !== Number(target.cardCount)
  ) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: `cardIdentities length ${target.cardIdentities.length} != cardCount ${target.cardCount}`,
    };
  }

  if (Array.isArray(target.cardIdentities)) {
    for (let index = 0; index < target.cardIdentities.length; index += 1) {
      const identity = target.cardIdentities[index];
      if (identity == null || !String(identity).trim()) {
        return {
          ok: false,
          action: 'block_structure_mismatch',
          reason: `empty card identity at itemIndex ${index}`,
        };
      }
    }
  }

  if (
    Array.isArray(data.cardIdentities) &&
    JSON.stringify(data.cardIdentities) !== JSON.stringify(target.cardIdentities || [])
  ) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: 'metadata cardIdentities do not match target card order',
    };
  }

  if (!legacyPilot) {
    if (Number(data.paragraphCount) !== narrationSignature.paragraphCount) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason: `paragraphCount metadata=${data.paragraphCount} actual=${narrationSignature.paragraphCount}`,
      };
    }

    if (
      Number(data.sourceStructure.paragraphCount) !== sourceSignature.paragraphCount ||
      JSON.stringify(data.sourceStructure.lineCounts) !==
        JSON.stringify(sourceSignature.lineCounts)
    ) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason: 'metadata sourceStructure does not match Korean source',
      };
    }

    if (
      Number(data.narrationStructure.paragraphCount) !==
        narrationSignature.paragraphCount ||
      JSON.stringify(data.narrationStructure.lineCounts) !==
        JSON.stringify(narrationSignature.lineCounts)
    ) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason: 'metadata narrationStructure does not match narration file',
      };
    }

    // sourceStructure and narrationStructure may differ in paragraph packaging
    // (expanded vs packed) or optional closing; speech-unit comparison above
    // is the cross-locale structure guard.
  } else {
    if (data.sourceStructure) {
      const expected = data.sourceStructure;
      if (
        Number(expected.paragraphCount) !== sourceSignature.paragraphCount ||
        JSON.stringify(expected.lineCounts) !== JSON.stringify(sourceSignature.lineCounts)
      ) {
        return {
          ok: false,
          action: 'block_structure_mismatch',
          reason: 'metadata sourceStructure does not match Korean source',
        };
      }
    }
    if (data.narrationStructure) {
      const expected = data.narrationStructure;
      if (
        Number(expected.paragraphCount) !== narrationSignature.paragraphCount ||
        JSON.stringify(expected.lineCounts) !== JSON.stringify(narrationSignature.lineCounts)
      ) {
        return {
          ok: false,
          action: 'block_structure_mismatch',
          reason: 'metadata narrationStructure does not match narration file',
        };
      }
    }
    if (
      data.cardCount != null &&
      Number(data.cardCount) !== Number(target.cardCount)
    ) {
      return {
        ok: false,
        action: 'block_structure_mismatch',
        reason: `cardCount metadata=${data.cardCount} target=${target.cardCount}`,
      };
    }
  }

  if (locale === 'en-US' && countHangulChars(narrationText) > 0) {
    return {
      ok: false,
      action: 'block_structure_mismatch',
      reason: 'English narration contains Hangul characters',
    };
  }

  let ttsConfig;
  try {
    ttsConfig = resolveCommentaryTtsConfig({
      locale,
      type: target.type,
      voicePreset,
      narrationText,
      cardCount: target.cardCount,
    });
  } catch (error) {
    return {
      ok: false,
      action: 'block_pronunciation_term_extraction',
      reason: error.message,
    };
  }

  return {
    ok: true,
    action: 'validated_approved_narration',
    reason: legacyPilot
      ? 'approved legacy Genesis 1:1 narration'
      : 'approved narration with strict metadata',
    ttsConfig,
    narrationText,
    narrationPath: target.narrationPath,
    metaPath: target.metaPath,
    sourcePath,
    sourceHash: actualSourceHash,
    narrationHash: actualNarrationHash,
    sourceSignature,
    narrationSignature,
    pronunciationTerms: ttsConfig.pronunciationTerms,
    legacyPilot,
  };
}

/**
 * Probe MP3 duration with ffprobe. Returns seconds or throws.
 */
export function probeMp3DurationSeconds(absolutePath) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      absolutePath,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(
      `ffprobe failed: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`,
    );
  }

  const duration = Number(String(result.stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned invalid duration: ${result.stdout}`);
  }

  return duration;
}

export function validateMp3File(absolutePath, options = {}) {
  const existsSync = options.existsSync || fsExistsSync;
  const statSync = options.statSync || fsStatSync;
  const probe =
    options.probeMp3DurationSeconds || probeMp3DurationSeconds;

  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      reason: `MP3 missing: ${absolutePath}`,
    };
  }

  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) {
    return {
      ok: false,
      reason: `MP3 size must be greater than zero: ${absolutePath}`,
    };
  }

  let duration;
  try {
    duration = probe(absolutePath);
  } catch (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  return {
    ok: true,
    byteSize: stat.size,
    duration,
    sha256: sha256Bytes(
      (options.readFileSync || fsReadFileSync)(absolutePath),
    ),
  };
}

function isRetryableHttpStatus(status) {
  return status === 429 || status >= 500;
}

/**
 * Request one commentary MP3 from OpenAI Speech API.
 * Does not write files. Updates counters when provided.
 */
export async function requestCommentaryMp3({
  apiKey,
  narrationText,
  ttsConfig,
  fetchImpl,
  maxAttempts = 2,
  counters,
  translationApproved,
} = {}) {
  requireMultilangStageApproval('tts', {
    translationApproved: resolveTranslationApproved({ translationApproved }),
  });

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }
  if (!ttsConfig) {
    throw new Error('ttsConfig is required');
  }

  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is unavailable. Use Node.js 18 or newer.');
  }

  const attempts = Number(maxAttempts) > 0 ? Number(maxAttempts) : 2;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (counters) {
      counters.totalApiCalls += 1;
      if (attempt > 1) counters.retriedCalls += 1;
    }

    try {
      const response = await fetchFn(ttsConfig.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ttsConfig.model,
          voice: ttsConfig.voice,
          instructions: ttsConfig.instructions,
          input: narrationText,
          response_format: ttsConfig.responseFormat,
        }),
      });

      if (!response.ok) {
        let summary = '';
        try {
          const body = await response.text();
          summary = String(body || '')
            .slice(0, 400)
            .replace(/sk-[A-Za-z0-9._-]+/g, '[redacted]');
        } catch {
          summary = '(unable to read error body)';
        }

        const error = new Error(
          `OpenAI speech failed with HTTP ${response.status}`,
        );
        error.status = response.status;
        error.details = summary;
        error.retryable = isRetryableHttpStatus(response.status);
        lastError = error;
        if (!error.retryable || attempt >= attempts) {
          return { ok: false, error: error.message, details: summary, attempts: attempt };
        }
        continue;
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) {
        lastError = new Error('OpenAI speech returned an empty body');
        lastError.retryable = true;
        if (attempt >= attempts) {
          return {
            ok: false,
            error: lastError.message,
            attempts: attempt,
          };
        }
        continue;
      }

      if (audio.length < 128) {
        lastError = new Error('OpenAI speech returned a body too small to be MP3');
        lastError.retryable = true;
        if (attempt >= attempts) {
          return {
            ok: false,
            error: lastError.message,
            attempts: attempt,
          };
        }
        continue;
      }

      return {
        ok: true,
        audioBytes: audio,
        model: ttsConfig.model,
        voice: ttsConfig.voice,
        voicePreset: ttsConfig.voicePreset,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      lastError.retryable = true;
      if (attempt >= attempts) {
        return {
          ok: false,
          error: error.message,
          attempts: attempt,
        };
      }
    }
  }

  return {
    ok: false,
    error: lastError?.message || 'OpenAI speech request failed',
    attempts,
  };
}

/**
 * Atomically publish a new MP3 without overwriting any existing final path.
 */
export function atomicCreateMp3(options = {}) {
  const mp3Path = String(options.mp3Path || '').trim();
  const audioBytes = options.audioBytes;

  if (!mp3Path) throw new Error('mp3Path is required');
  if (!Buffer.isBuffer(audioBytes) || audioBytes.length <= 0) {
    throw new Error('audioBytes must be a non-empty Buffer');
  }

  const existsSync = options.existsSync || fsExistsSync;
  const mkdirSync = options.mkdirSync || fsMkdirSync;
  const openSync = options.openSync || fsOpenSync;
  const writeFileSync = options.writeFileSync || fsWriteFileSync;
  const closeSync = options.closeSync || fsCloseSync;
  const readFileSync = options.readFileSync || fsReadFileSync;
  const linkSync = options.linkSync || fsLinkSync;
  const unlinkSync = options.unlinkSync || fsUnlinkSync;
  const validate =
    options.validateMp3File ||
    ((absolutePath) =>
      validateMp3File(absolutePath, {
        existsSync,
        readFileSync,
        probeMp3DurationSeconds:
          options.probeMp3DurationSeconds || probeMp3DurationSeconds,
      }));

  if (existsSync(mp3Path)) {
    throw new Error(`MP3 path already exists: ${mp3Path}`);
  }

  mkdirSync(path.dirname(mp3Path), { recursive: true });

  const mp3Tmp = `${mp3Path}.audio-tmp`;
  if (existsSync(mp3Tmp)) {
    throw new Error(`temporary MP3 path already exists: ${mp3Tmp}`);
  }

  const cleanupTemp = () => {
    try {
      if (existsSync(mp3Tmp)) unlinkSync(mp3Tmp);
    } catch {
      // ignore cleanup errors
    }
  };

  try {
    const fd = openSync(mp3Tmp, 'wx');
    try {
      writeFileSync(fd, audioBytes);
    } finally {
      closeSync(fd);
    }

    const tmpBytes = readFileSync(mp3Tmp);
    if (!tmpBytes.equals(audioBytes)) {
      throw new Error('temporary MP3 mismatch after write');
    }
    if (tmpBytes.length <= 0) {
      throw new Error('temporary MP3 size must be greater than zero');
    }

    const validation = validate(mp3Tmp);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    if (existsSync(mp3Path)) {
      throw new Error(`MP3 path already exists: ${mp3Path}`);
    }

    try {
      linkSync(mp3Tmp, mp3Path);
    } catch (error) {
      if (existsSync(mp3Path)) {
        throw new Error(`MP3 path already exists: ${mp3Path}`);
      }
      throw error;
    }
  } catch (error) {
    cleanupTemp();
    throw error;
  }

  cleanupTemp();

  const published = validate(mp3Path);
  if (!published.ok) {
    try {
      unlinkSync(mp3Path);
    } catch {
      // best-effort
    }
    throw new Error(`published MP3 failed validation: ${published.reason}`);
  }

  return {
    ok: true,
    mp3Path,
    byteSize: published.byteSize,
    duration: published.duration,
    sha256: published.sha256 || sha256Bytes(audioBytes),
    model: options.model || DEFAULT_AUDIO_MODEL,
    voice: options.voice || DEFAULT_AUDIO_VOICE,
    voicePreset: options.voicePreset || DEFAULT_AUDIO_VOICE_PRESET,
    apiAttempts: options.apiAttempts || 1,
  };
}

export function createEmptyAudioCounters() {
  return {
    plannedTargets: 0,
    attemptedTargets: 0,
    successfulTargets: 0,
    failedTargets: 0,
    skippedExistingTargets: 0,
    totalApiCalls: 0,
    retriedCalls: 0,
  };
}

export { sha256Text, sha256Bytes };
