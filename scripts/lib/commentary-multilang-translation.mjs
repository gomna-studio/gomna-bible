/**
 * Multilingual commentary narration translation helpers.
 * Side-effect free at import time. Writes are performed only by the caller.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getCommentaryType,
  getNarrationStructurePolicy,
} from './commentary-type-registry.mjs';
import { getLocaleConfig } from './commentary-multilang-registry.mjs';

const fsExistsSync = fs.existsSync.bind(fs);
const fsMkdirSync = fs.mkdirSync.bind(fs);
const fsOpenSync = fs.openSync.bind(fs);
const fsWriteFileSync = fs.writeFileSync.bind(fs);
const fsCloseSync = fs.closeSync.bind(fs);
const fsReadFileSync = fs.readFileSync.bind(fs);
const fsLinkSync = fs.linkSync.bind(fs);
const fsUnlinkSync = fs.unlinkSync.bind(fs);

export const TRANSLATION_SOURCE_LOCALE = 'ko-KR';
export const DEFAULT_TRANSLATION_MODEL = 'gpt-4o';
export const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';

const REJECTED_TARGET_LOCALES = new Set(['ko', 'ko-KR']);

const LOCALE_PROMPT = Object.freeze({
  'en-US': {
    label: 'English (en-US)',
    languageRules: [
      'Write natural spoken American English suitable for calm study narration.',
      'Use clear sentence rhythm for TTS.',
      'Use standard Protestant biblical terminology.',
    ].join(' '),
    originalLanguageRules: [
      'Retain original-language terms in readable Latin transliteration exactly as implied by the Korean source (for example: tohu, bohu, hoshekh, tehom, ruach, amar, yehi, or, wayehi, Elohim).',
      'Do not invent transliterations that are absent from the Korean source.',
    ].join(' '),
  },
  'ja-JP': {
    label: 'Japanese (ja-JP)',
    languageRules: [
      'Write natural spoken Japanese in a polite explanatory narration style.',
      'Use established Japanese biblical terminology.',
    ].join(' '),
    originalLanguageRules: [
      'Retain original-language terms in katakana consistently (for example: トフー, ボフー, ホシェク, テホーム, ルーアハ, アマル, イェヒー, オール, バイェヒー, エロヒム) when the Korean source presents those Hebrew terms.',
      'Do not invent transliterations that are absent from the Korean source.',
    ].join(' '),
  },
});

const NARRATION_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['paragraphs'],
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
  },
});

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), 'utf8'));
}

export function parseNarrationStructure(text) {
  if (typeof text !== 'string') {
    throw new Error('Narration text must be a string');
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.replace(/^\n+/, '').replace(/\n+$/, '');
  if (!trimmed.trim()) {
    return [];
  }

  return trimmed.split(/\n{2,}/).map((block) =>
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

export function buildNarrationStructureSignature(textOrParagraphs) {
  const paragraphs = Array.isArray(textOrParagraphs)
    ? textOrParagraphs
    : parseNarrationStructure(textOrParagraphs);
  const lineCounts = paragraphs.map((lines) => lines.length);
  return {
    paragraphCount: paragraphs.length,
    lineCounts,
    totalLineCount: lineCounts.reduce((sum, count) => sum + count, 0),
    cardLineCount: lineCounts.length >= 2 ? lineCounts[1] : 0,
  };
}

export function joinNarrationStructure(paragraphs) {
  if (!Array.isArray(paragraphs)) {
    throw new Error('paragraphs must be an array');
  }

  const normalized = paragraphs.map((lines) => {
    if (!Array.isArray(lines)) {
      throw new Error('each paragraph must be an array of lines');
    }
    return lines.map((line) => String(line).trim());
  });

  return `${normalized.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}

export function splitNarrationParagraphs(text) {
  return parseNarrationStructure(text).map((lines) => lines.join('\n'));
}

export function joinNarrationParagraphs(paragraphs) {
  const structured = paragraphs.map((part) => {
    if (Array.isArray(part)) return part;
    return String(part)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  });
  return joinNarrationStructure(structured);
}

export function buildKoreanSourcePath(bookId, chapter, verse, type) {
  const book = String(bookId || '').trim();
  const commentaryType = String(type || '').trim();
  if (!book) throw new Error('bookId is required');
  if (!commentaryType) throw new Error('type is required');

  const chapter3 = String(Number(chapter)).padStart(3, '0');
  const verse3 = String(Number(verse)).padStart(3, '0');

  return [
    'tts-scripts',
    TRANSLATION_SOURCE_LOCALE,
    book,
    chapter3,
    verse3,
    `${commentaryType}.txt`,
  ].join('/');
}

export function inspectKoreanSourceText(text, { sourcePath, sourceBytes } = {}) {
  const paragraphs = parseNarrationStructure(text);
  const signature = buildNarrationStructureSignature(paragraphs);
  const errors = [];

  if (!paragraphs.length) {
    errors.push('Korean source is empty');
  }
  if (signature.paragraphCount < 3) {
    errors.push(
      `Korean source paragraph count must be at least 3 (got ${signature.paragraphCount})`,
    );
  }

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (!paragraphs[i].length) {
      errors.push(`Korean source paragraph ${i + 1} is empty`);
    }
    for (let j = 0; j < paragraphs[i].length; j += 1) {
      if (!paragraphs[i][j]) {
        errors.push(`Korean source paragraph ${i + 1} line ${j + 1} is empty`);
      }
    }
  }

  const sourceSha256 = Buffer.isBuffer(sourceBytes)
    ? sha256Bytes(sourceBytes)
    : sha256Text(text);

  return {
    ok: errors.length === 0,
    errors,
    sourcePath: sourcePath || null,
    paragraphCount: signature.paragraphCount,
    paragraphs,
    paragraphCharCounts: paragraphs.map((lines) => lines.join('\n').length),
    signature,
    sourceSha256,
  };
}

function countHangulChars(text) {
  const matches = String(text).match(/\p{Script=Hangul}/gu);
  return matches ? matches.length : 0;
}

function signaturesEqual(a, b) {
  return (
    a.paragraphCount === b.paragraphCount &&
    a.totalLineCount === b.totalLineCount &&
    a.cardLineCount === b.cardLineCount &&
    a.lineCounts.length === b.lineCounts.length &&
    a.lineCounts.every((count, index) => count === b.lineCounts[index])
  );
}

export function validateTranslatedNarrationStructure({
  sourceText,
  translatedParagraphs,
  targetLocale,
  type,
  cardCount,
}) {
  const errors = [];
  getLocaleConfig(targetLocale);

  const sourceStructure = parseNarrationStructure(sourceText);
  const sourceSignature = buildNarrationStructureSignature(sourceStructure);

  if (!Array.isArray(translatedParagraphs)) {
    return {
      ok: false,
      errors: ['Translated paragraphs must be an array'],
      paragraphs: [],
      narrationText: '',
      sourceSignature,
      narrationSignature: null,
    };
  }

  const paragraphs = translatedParagraphs.map((lines, paragraphIndex) => {
    if (!Array.isArray(lines)) {
      errors.push(`Paragraph ${paragraphIndex + 1} is not an array of lines`);
      return [];
    }
    return lines.map((line) => String(line ?? '').trim());
  });

  const narrationSignature = buildNarrationStructureSignature(paragraphs);

  if (!signaturesEqual(sourceSignature, narrationSignature)) {
    errors.push(
      `Structure mismatch: source=${JSON.stringify(sourceSignature.lineCounts)} translated=${JSON.stringify(narrationSignature.lineCounts)}`,
    );
  }

  if (type) {
    const policy = getNarrationStructurePolicy(type);
    if (policy.requireExactThreeParagraphs) {
      if (narrationSignature.paragraphCount !== 3) {
        errors.push(
          `${type} requires exactly 3 paragraphs (got ${narrationSignature.paragraphCount})`,
        );
      }
      if (narrationSignature.lineCounts[0] !== 1) {
        errors.push('Introduction paragraph must contain exactly 1 line');
      }
      if (narrationSignature.lineCounts[2] !== 1) {
        errors.push('Closing paragraph must contain exactly 1 line');
      }
      if (Number(cardCount) > 0 && narrationSignature.lineCounts[1] !== Number(cardCount)) {
        errors.push(
          `Middle paragraph line count must equal cardCount=${cardCount} (got ${narrationSignature.lineCounts[1]})`,
        );
      }
    } else if (Number(cardCount) > 0) {
      // Non-original-language types mirror Korean source structure; card count
      // is validated by the planner/extractor, not forced into 3 paragraphs.
      getCommentaryType(type);
    }
  }

  for (let i = 0; i < paragraphs.length; i += 1) {
    for (let j = 0; j < paragraphs[i].length; j += 1) {
      if (!paragraphs[i][j]) {
        errors.push(`Translated paragraph ${i + 1} line ${j + 1} is empty`);
      }
    }
  }

  if (
    type &&
    getNarrationStructurePolicy(type).requireExactThreeParagraphs &&
    paragraphs.length >= 2
  ) {
    const cardLines = paragraphs[1];
    const uniqueCards = new Set(cardLines);
    if (uniqueCards.size !== cardLines.length) {
      errors.push('Translated middle paragraph contains a duplicated card line');
    }
  }

  const flatLines = paragraphs.flat();
  const uniqueLines = new Set(flatLines);
  if (uniqueLines.size !== flatLines.length) {
    errors.push('Translated narration contains a duplicated line');
  }

  const narrationText = joinNarrationStructure(paragraphs);
  if (/```/.test(narrationText)) {
    errors.push('Translated narration contains a markdown fence');
  }
  if (
    /^(Translation|翻訳|번역)\s*:/im.test(narrationText.trim()) ||
    /\n(?:Translation|翻訳|번역)\s*:/i.test(narrationText)
  ) {
    errors.push('Translated narration contains a heading label');
  }

  const sourceJoined = joinNarrationStructure(sourceStructure).trim();
  if (narrationText.trim() === sourceJoined) {
    errors.push('Translated narration is identical to the Korean source');
  }

  const hangulChars = countHangulChars(narrationText);
  const totalChars = narrationText.replace(/\s+/g, '').length || 1;
  if (hangulChars / totalChars > 0.08) {
    errors.push(
      `Translated narration appears to contain substantial Korean prose (${hangulChars} Hangul chars)`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    paragraphs,
    narrationText,
    paragraphCount: narrationSignature.paragraphCount,
    narrationSha256: sha256Text(narrationText),
    sourceSignature,
    narrationSignature,
  };
}

export function validateTranslatedNarration({
  sourceText,
  translatedText,
  targetLocale,
  expectedParagraphCount,
  type,
  cardCount,
}) {
  if (typeof translatedText !== 'string' || !translatedText.trim()) {
    return {
      ok: false,
      errors: ['Translated narration is empty'],
      paragraphs: [],
      narrationText: '',
    };
  }

  const structured = parseNarrationStructure(translatedText);
  const validation = validateTranslatedNarrationStructure({
    sourceText,
    translatedParagraphs: structured,
    targetLocale,
    type,
    cardCount,
  });

  if (
    expectedParagraphCount != null &&
    validation.paragraphCount !== expectedParagraphCount
  ) {
    validation.errors.push(
      `Paragraph count mismatch: expected ${expectedParagraphCount}, got ${validation.paragraphCount}`,
    );
    validation.ok = validation.errors.length === 0;
  }

  return validation;
}

export function buildDraftNarrationMetadata({
  sourcePath,
  sourceHash,
  targetLocale,
  bookId,
  chapter,
  verse,
  type,
  paragraphCount,
  cardCount,
  cardIdentities,
  narrationHash,
  model,
  translatedAt,
  sourceSignature,
  narrationSignature,
  repairReason,
  previousNarrationSha256,
  structureValidated,
}) {
  getLocaleConfig(targetLocale);
  getCommentaryType(type);

  const metadata = {
    sourcePath,
    sourceHashAlgorithm: 'sha256',
    sourceHash,
    sourceLocale: TRANSLATION_SOURCE_LOCALE,
    targetLocale,
    status: 'draft',
    translatedAt,
    bookId,
    chapter: Number(chapter),
    verse: Number(verse),
    type,
    paragraphCount: Number(paragraphCount),
    cardCount: Number(cardCount),
    narrationHashAlgorithm: 'sha256',
    narrationHash,
    model,
    humanReviewRequired: true,
  };

  if (Array.isArray(cardIdentities)) {
    metadata.cardIdentities = cardIdentities.map((identity) => String(identity));
  }

  if (structureValidated) {
    metadata.structureValidated = true;
  }

  if (sourceSignature) {
    metadata.sourceStructure = {
      paragraphCount: sourceSignature.paragraphCount,
      lineCounts: sourceSignature.lineCounts,
      totalLineCount: sourceSignature.totalLineCount,
    };
  }

  if (narrationSignature) {
    metadata.narrationStructure = {
      paragraphCount: narrationSignature.paragraphCount,
      lineCounts: narrationSignature.lineCounts,
      totalLineCount: narrationSignature.totalLineCount,
    };
  }

  if (repairReason) {
    metadata.repairReason = repairReason;
  }

  if (previousNarrationSha256) {
    metadata.previousNarrationSha256 = previousNarrationSha256;
  }

  return metadata;
}

export function formatMetadataJson(metadata) {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

/**
 * Atomically publish a new draft narration/metadata pair without overwriting
 * any existing final path. Uses exclusive temp creation and hard-link publish.
 *
 * Optional filesystem hooks (linkSync, unlinkSync, etc.) may be injected for tests.
 */
export function atomicCreateDraftPair(options = {}) {
  const narrationPath = String(options.narrationPath || '').trim();
  const metaPath = String(options.metaPath || '').trim();
  const narrationText = String(options.narrationText ?? '');
  const metadataJson = String(options.metadataJson ?? '');

  if (!narrationPath) throw new Error('narrationPath is required');
  if (!metaPath) throw new Error('metaPath is required');
  if (!narrationText) throw new Error('narrationText is required');
  if (!metadataJson.trim()) throw new Error('metadataJson is required');

  const existsSync = options.existsSync || fsExistsSync;
  const mkdirSync = options.mkdirSync || fsMkdirSync;
  const openSync = options.openSync || fsOpenSync;
  const writeFileSync = options.writeFileSync || fsWriteFileSync;
  const closeSync = options.closeSync || fsCloseSync;
  const readFileSync = options.readFileSync || fsReadFileSync;
  const linkSync = options.linkSync || fsLinkSync;
  const unlinkSync = options.unlinkSync || fsUnlinkSync;

  if (existsSync(narrationPath)) {
    throw new Error(`narration path already exists: ${narrationPath}`);
  }
  if (existsSync(metaPath)) {
    throw new Error(`metadata path already exists: ${metaPath}`);
  }

  const narrationDir = path.dirname(narrationPath);
  const metaDir = path.dirname(metaPath);
  mkdirSync(narrationDir, { recursive: true });
  mkdirSync(metaDir, { recursive: true });

  const narrationTmp = `${narrationPath}.create-tmp`;
  const metaTmp = `${metaPath}.create-tmp`;

  const cleanupTemps = () => {
    for (const tempPath of [narrationTmp, metaTmp]) {
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  };

  const removePublished = (publishedPath) => {
    try {
      if (existsSync(publishedPath)) unlinkSync(publishedPath);
    } catch {
      // best-effort
    }
  };

  let narrationPublished = false;
  let metaPublished = false;

  try {
    for (const tempPath of [narrationTmp, metaTmp]) {
      if (existsSync(tempPath)) {
        throw new Error(`temporary path already exists: ${tempPath}`);
      }
    }

    const narrationFd = openSync(narrationTmp, 'wx');
    try {
      writeFileSync(narrationFd, narrationText, 'utf8');
    } finally {
      closeSync(narrationFd);
    }

    const metaFd = openSync(metaTmp, 'wx');
    try {
      writeFileSync(metaFd, metadataJson, 'utf8');
    } finally {
      closeSync(metaFd);
    }

    const tmpNarrationText = readFileSync(narrationTmp, 'utf8');
    const tmpMetaRaw = readFileSync(metaTmp, 'utf8');
    if (tmpNarrationText !== narrationText) {
      throw new Error('temporary narration mismatch after write');
    }
    if (tmpMetaRaw !== metadataJson) {
      throw new Error('temporary metadata mismatch after write');
    }

    let tmpMeta;
    try {
      tmpMeta = JSON.parse(tmpMetaRaw);
    } catch (error) {
      throw new Error(`temporary metadata is not valid JSON: ${error.message}`);
    }

    if (!tmpMeta || typeof tmpMeta !== 'object' || Array.isArray(tmpMeta)) {
      throw new Error('temporary metadata must be a JSON object');
    }
    if (tmpMeta.status !== 'draft') {
      throw new Error('temporary metadata status must be draft');
    }

    const narrationSha256 = sha256Text(tmpNarrationText);
    if (tmpMeta.narrationHash !== narrationSha256) {
      throw new Error('temporary metadata narrationHash mismatch');
    }

    if (
      options.expectedSourceHash != null &&
      tmpMeta.sourceHash !== options.expectedSourceHash
    ) {
      throw new Error('temporary metadata sourceHash mismatch');
    }

    if (
      options.expectedTargetLocale != null &&
      tmpMeta.targetLocale !== options.expectedTargetLocale
    ) {
      throw new Error('temporary metadata targetLocale mismatch');
    }
    if (
      options.expectedBookId != null &&
      tmpMeta.bookId !== options.expectedBookId
    ) {
      throw new Error('temporary metadata bookId mismatch');
    }
    if (
      options.expectedChapter != null &&
      Number(tmpMeta.chapter) !== Number(options.expectedChapter)
    ) {
      throw new Error('temporary metadata chapter mismatch');
    }
    if (
      options.expectedVerse != null &&
      Number(tmpMeta.verse) !== Number(options.expectedVerse)
    ) {
      throw new Error('temporary metadata verse mismatch');
    }
    if (
      options.expectedType != null &&
      tmpMeta.type !== options.expectedType
    ) {
      throw new Error('temporary metadata type mismatch');
    }

    if (options.sourceText != null) {
      const structural = validateTranslatedNarrationStructure({
        sourceText: options.sourceText,
        translatedParagraphs: parseNarrationStructure(tmpNarrationText),
        targetLocale:
          options.targetLocale ||
          options.expectedTargetLocale ||
          tmpMeta.targetLocale,
        type: options.type || options.expectedType || tmpMeta.type,
        cardCount:
          options.cardCount != null ? options.cardCount : tmpMeta.cardCount,
      });
      if (!structural.ok) {
        throw new Error(
          `temporary narration failed structure validation: ${structural.errors.join('; ')}`,
        );
      }
      if (structural.narrationSha256 !== narrationSha256) {
        throw new Error('validated narration hash mismatch');
      }
    }

    // Re-check finals immediately before publish (TOCTOU hardening).
    if (existsSync(narrationPath)) {
      throw new Error(`narration path already exists: ${narrationPath}`);
    }
    if (existsSync(metaPath)) {
      throw new Error(`metadata path already exists: ${metaPath}`);
    }

    linkSync(narrationTmp, narrationPath);
    narrationPublished = true;

    try {
      linkSync(metaTmp, metaPath);
      metaPublished = true;
    } catch (error) {
      removePublished(narrationPath);
      narrationPublished = false;
      throw error;
    }
  } catch (error) {
    if (narrationPublished && !metaPublished) {
      removePublished(narrationPath);
    }
    if (metaPublished) {
      removePublished(metaPath);
    }
    cleanupTemps();
    throw error;
  }

  cleanupTemps();

  return {
    ok: true,
    narrationPath,
    metaPath,
    narrationSha256: sha256Text(narrationText),
  };
}

function buildSystemPrompt({
  targetLocale,
  bookId,
  chapter,
  verse,
  type,
  cardCount,
  sourceSignature,
}) {
  const locale = getLocaleConfig(targetLocale);
  const localePrompt = LOCALE_PROMPT[locale.locale];
  if (!localePrompt) {
    throw new Error(`No translation prompt for locale: ${targetLocale}`);
  }

  const policy = getNarrationStructurePolicy(type);
  const rules = [localePrompt.languageRules];
  if (policy.retainHebrewTerms) {
    rules.push(localePrompt.originalLanguageRules);
    rules.push(
      'Preserve Hebrew/Greek transliterations that exist in the Korean source; do not invent new ones.',
    );
  } else {
    rules.push(
      'Do not force original-language transliteration rules onto this commentary type.',
    );
  }

  return [
    'You are translating Korean Bible commentary narration for text-to-speech.',
    `Target locale: ${localePrompt.label}.`,
    `Passage: ${bookId} ${chapter}:${verse}.`,
    `Commentary type: ${type}.`,
    `Visible commentary cards in the source data: ${cardCount}.`,
    'Return ONLY a JSON object with shape {"paragraphs":[["line",...],...]}',
    `The paragraphs array length must be exactly ${sourceSignature.paragraphCount}.`,
    `The lineCounts must be exactly ${JSON.stringify(sourceSignature.lineCounts)}.`,
    'Translate each source line into exactly one corresponding target line.',
    'Do not merge card lines.',
    'Do not split one source line into multiple target lines.',
    'Do not add or remove blank-line paragraph boundaries.',
    'Preserve the source paragraph and line structure exactly.',
    'Do not summarize or omit content.',
    'Do not add theological claims.',
    'Do not add headings, numbering, markdown, notes, or wrappers.',
    'Preserve Bible references accurately.',
    'Preserve the source doctrinal tone without strengthening or weakening it.',
    ...rules,
  ].join('\n');
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Empty model response');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model response is not valid JSON');
  }
}

async function callOpenAiChatCompletion({
  apiKey,
  model,
  systemPrompt,
  userContent,
  fetchImpl,
  counters,
}) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is unavailable. Use Node.js 18 or newer.');
  }

  if (counters) {
    counters.attemptedCalls += 1;
    counters.totalCalls += 1;
  }

  const response = await fetchFn(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'commentary_narration_matrix',
          strict: true,
          schema: NARRATION_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
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
    if (counters) counters.failedCalls += 1;
    const error = new Error(
      `OpenAI chat completion failed with HTTP ${response.status}`,
    );
    error.details = summary;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    if (counters) counters.failedCalls += 1;
    throw new Error('OpenAI chat completion returned empty content');
  }

  if (counters) counters.successfulCalls += 1;

  return {
    text: content,
    model: payload?.model || model,
    raw: payload,
  };
}

/**
 * Translate one commentary narration. Does not write files.
 */
export async function translateCommentaryNarration(options = {}) {
  const counters = options.counters || {
    plannedCalls: 0,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    validationFailedCalls: 0,
    retriedCalls: 0,
    totalCalls: 0,
  };

  const sourceLocale = String(options.sourceLocale || TRANSLATION_SOURCE_LOCALE);
  const targetLocale = String(options.targetLocale || '').trim();

  if (sourceLocale !== TRANSLATION_SOURCE_LOCALE) {
    return {
      ok: false,
      error: `Unsupported source locale: ${sourceLocale}`,
      errors: [`Unsupported source locale: ${sourceLocale}`],
      counters,
    };
  }

  if (REJECTED_TARGET_LOCALES.has(targetLocale)) {
    return {
      ok: false,
      error: `Korean locale is rejected: ${targetLocale}`,
      errors: [`Korean locale is rejected: ${targetLocale}`],
      counters,
    };
  }

  try {
    getLocaleConfig(targetLocale);
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      errors: [error.message],
      counters,
    };
  }

  const sourceText = String(options.sourceText || '');
  const sourceInspection = inspectKoreanSourceText(sourceText, {
    sourcePath: options.sourcePath,
    sourceBytes: options.sourceBytes,
  });
  if (!sourceInspection.ok) {
    return {
      ok: false,
      error: sourceInspection.errors.join('; '),
      errors: sourceInspection.errors,
      sourceInspection,
      counters,
    };
  }

  const resolvedSourceSha256 =
    options.sourceSha256 || sourceInspection.sourceSha256;
  if (
    options.sourceSha256 &&
    options.sourceBytes &&
    options.sourceSha256 !== sourceInspection.sourceSha256
  ) {
    return {
      ok: false,
      error: 'Provided sourceSha256 does not match sourceBytes',
      errors: ['Provided sourceSha256 does not match sourceBytes'],
      sourceInspection,
      counters,
    };
  }

  const model = options.model || DEFAULT_TRANSLATION_MODEL;
  const apiKey = options.apiKey;
  const fetchImpl = options.fetchImpl;
  const maxAttempts = options.maxAttempts == null ? 2 : Number(options.maxAttempts);

  const sourceMatrix = {
    paragraphs: sourceInspection.paragraphs,
  };

  const systemPrompt = buildSystemPrompt({
    targetLocale,
    bookId: options.bookId,
    chapter: options.chapter,
    verse: options.verse,
    type: options.type,
    cardCount: options.cardCount,
    sourceSignature: sourceInspection.signature,
  });

  let completion = null;
  let validation = null;
  let lastRaw = null;

  counters.plannedCalls += 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      counters.retriedCalls += 1;
    }

    const attemptUserContent =
      attempt === 1
        ? [
            `Translate this Korean narration matrix into ${LOCALE_PROMPT[targetLocale].label}.`,
            `Return JSON with exactly the same dimensions: lineCounts=${JSON.stringify(sourceInspection.signature.lineCounts)}.`,
            JSON.stringify(sourceMatrix, null, 2),
          ].join('\n\n')
        : [
            `Translate this Korean narration matrix into ${LOCALE_PROMPT[targetLocale].label}.`,
            `RETRY REQUIRED because validation failed: ${(validation?.errors || []).join('; ')}`,
            `Return JSON with exactly lineCounts=${JSON.stringify(sourceInspection.signature.lineCounts)}.`,
            'One source line => one translated line. Do not merge card lines.',
            JSON.stringify(sourceMatrix, null, 2),
          ].join('\n\n');

    try {
      completion = await callOpenAiChatCompletion({
        apiKey,
        model,
        systemPrompt,
        userContent: attemptUserContent,
        fetchImpl,
        counters,
      });
      lastRaw = completion.text;
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        errors: [error.message],
        details: error.details || null,
        sourceInspection,
        counters,
      };
    }

    let parsed;
    try {
      parsed = extractJsonObject(completion.text);
    } catch (error) {
      counters.validationFailedCalls += 1;
      validation = {
        ok: false,
        errors: [error.message],
      };
      continue;
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray(parsed.paragraphs)
    ) {
      counters.validationFailedCalls += 1;
      validation = {
        ok: false,
        errors: ['JSON root must contain a paragraphs array'],
      };
      continue;
    }

    const rootKeys = Object.keys(parsed);
    if (rootKeys.length !== 1 || rootKeys[0] !== 'paragraphs') {
      counters.validationFailedCalls += 1;
      validation = {
        ok: false,
        errors: [
          `JSON root must contain exactly one property "paragraphs" (got ${JSON.stringify(rootKeys)})`,
        ],
      };
      continue;
    }

    validation = validateTranslatedNarrationStructure({
      sourceText,
      translatedParagraphs: parsed.paragraphs,
      targetLocale,
      type: options.type,
      cardCount: options.cardCount,
    });

    if (!validation.ok) {
      counters.validationFailedCalls += 1;
      continue;
    }

    break;
  }

  if (!validation?.ok) {
    return {
      ok: false,
      error: (validation?.errors || ['Translation validation failed']).join('; '),
      errors: validation?.errors || ['Translation validation failed'],
      sourceInspection,
      model: completion?.model || model,
      rawTranslation: lastRaw,
      counters,
    };
  }

  const translatedAt =
    options.translatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const metadata = buildDraftNarrationMetadata({
    sourcePath: options.sourcePath || sourceInspection.sourcePath,
    sourceHash: resolvedSourceSha256,
    targetLocale,
    bookId: options.bookId,
    chapter: options.chapter,
    verse: options.verse,
    type: options.type,
    paragraphCount: validation.paragraphCount,
    cardCount: options.cardCount,
    narrationHash: validation.narrationSha256,
    model: completion.model,
    translatedAt,
    sourceSignature: validation.sourceSignature,
    narrationSignature: validation.narrationSignature,
    structureValidated: true,
    repairReason: options.repairReason || null,
    previousNarrationSha256: options.previousNarrationSha256 || null,
  });

  return {
    ok: true,
    sourceInspection: {
      ...sourceInspection,
      sourceSha256: resolvedSourceSha256,
    },
    narrationText: validation.narrationText,
    paragraphs: validation.paragraphs,
    paragraphCount: validation.paragraphCount,
    narrationSha256: validation.narrationSha256,
    sourceSignature: validation.sourceSignature,
    narrationSignature: validation.narrationSignature,
    metadata,
    metadataJson: formatMetadataJson(metadata),
    model: completion.model,
    counters,
  };
}
