/**
 * Offline translation job/result JSONL I/O for commentary multilang v2.
 * Does not call external translation APIs.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTargetKey } from './commentary-multilang-checkpoint.mjs';
import {
  buildKoreanSourcePath,
  buildNarrationStructureSignature,
  inspectKoreanSourceText,
  joinNarrationStructure,
  parseNarrationStructure,
  sha256Bytes,
  sha256Text,
  validateTranslatedNarration,
} from './commentary-multilang-translation.mjs';
import { getCommentaryType } from './commentary-type-registry.mjs';
import { getLocaleConfig } from './commentary-multilang-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TRANSLATION_IO_SCHEMA_VERSION = 1;

function getRoot(options = {}) {
  return options.root || process.env.GOMNA_ROOT || path.resolve(__dirname, '../..');
}

export function countHangulChars(text) {
  const matches = String(text).match(/\p{Script=Hangul}/gu);
  return matches ? matches.length : 0;
}

const SOFT_ALLOWABLE_OL_STRUCTURE_ERROR =
  /(requires exactly 3 paragraphs|Introduction paragraph must contain exactly 1 line|Closing paragraph must contain exactly 1 line|Middle paragraph line count must equal cardCount)/i;

/**
 * Soft-allow only original-language paragraph-count policy mismatches when the
 * Korean source itself is not a 3-paragraph form. Never soft-allows Hangul
 * residual, empty content, identical copy, or markup issues.
 */
export function isSoftAllowableOriginalLanguageStructureError(message) {
  return SOFT_ALLOWABLE_OL_STRUCTURE_ERROR.test(String(message || ''));
}

export function filterNarrationValidationErrors(errors, options = {}) {
  const list = Array.isArray(errors) ? errors : [];
  if (!options.softOriginalLanguage) return [...list];
  return list.filter(
    (message) => !isSoftAllowableOriginalLanguageStructureError(message),
  );
}

export function containsDangerousHtml(text) {
  return /<\/?[a-zA-Z][^>]*>/.test(String(text || ''));
}

/**
 * For original-language targets, require Hebrew script from source cards to be
 * retained in translated cards/narration when present in the Korean source.
 */
export function findMissingOriginalLanguageTerms(job, narrationText, cards) {
  if (!job || job.type !== 'original-language') return [];
  const haystack = [
    String(narrationText || ''),
    ...(cards || []).flatMap((card) => [
      String(card.identity || ''),
      ...Object.values(card.fields || {}).map((value) => String(value ?? '')),
    ]),
  ].join('\n');

  const missing = [];
  for (const card of job.sourceCards || []) {
    const sourceTerm = String(card.fields?.원어 || card.identity || '');
    const hebrew = sourceTerm.match(/\p{Script=Hebrew}+/gu) || [];
    for (const token of hebrew) {
      if (token && !haystack.includes(token)) {
        missing.push(token);
      }
    }
  }
  return [...new Set(missing)];
}

export function assertStagingPath(filePath, label = 'path') {
  const absolute = path.resolve(String(filePath || ''));
  let resolvedAbsolute = absolute;
  try {
    // Resolve existing parents so /var/folders and /private/var/folders match.
    resolvedAbsolute = fs.existsSync(absolute)
      ? fs.realpathSync(absolute)
      : fs.realpathSync(path.dirname(absolute));
    if (!fs.existsSync(absolute)) {
      resolvedAbsolute = path.join(
        resolvedAbsolute,
        path.basename(absolute),
      );
    }
  } catch {
    resolvedAbsolute = absolute;
  }

  let tmpDir;
  try {
    tmpDir = fs.realpathSync(os.tmpdir());
  } catch {
    tmpDir = path.resolve(os.tmpdir());
  }

  const allowedRoots = [
    path.resolve('/tmp'),
    path.resolve('/private/tmp'),
    path.resolve(tmpDir),
  ];
  try {
    allowedRoots.push(fs.realpathSync('/tmp'));
  } catch {
    // ignore
  }

  const ok = allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return (
      resolvedAbsolute === normalizedRoot ||
      resolvedAbsolute.startsWith(`${normalizedRoot}${path.sep}`) ||
      absolute === normalizedRoot ||
      absolute.startsWith(`${normalizedRoot}${path.sep}`) ||
      absolute.startsWith('/tmp/') ||
      absolute.startsWith('/private/tmp/') ||
      absolute.startsWith('/var/folders/')
    );
  });
  if (!ok) {
    throw new Error(
      `${label} must be under /tmp (or process temp dir) (got ${absolute})`,
    );
  }
  return absolute;
}

function readUtf8File(absolutePath) {
  const bytes = fs.readFileSync(absolutePath);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return { bytes, text: decoder.decode(bytes) };
}

function serializeCards(cards) {
  return (cards || []).map((card) => ({
    itemIndex: card.itemIndex,
    identity: card.identity,
    fields: { ...(card.fields || {}) },
    type: card.type,
    tableKey: card.tableKey,
  }));
}

/**
 * Build one offline translation job object from a planner target.
 */
export function buildTranslationJob(target, options = {}) {
  if (!target || typeof target !== 'object') {
    throw new Error('target is required');
  }
  getLocaleConfig(target.locale);
  const type = target.type || target.commentaryType;
  getCommentaryType(type);

  const root = getRoot(options);
  const sourcePath =
    options.sourcePath ||
    buildKoreanSourcePath(target.bookId, target.chapter, target.verse, type);
  const absolute = path.join(root, sourcePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Korean source missing: ${sourcePath}`);
  }

  const { bytes, text } = readUtf8File(absolute);
  const cards = target.cards || options.cards || [];
  const cardCount = Number(target.cardCount || cards.length || 0);
  const inspection = inspectKoreanSourceText(text, {
    sourcePath,
    sourceBytes: bytes,
    type,
    cardCount,
    cards,
  });
  // Some original-language KO narrations are intro+cards without closing.
  // Job export still proceeds when cards extract cleanly and only that guard fails.
  const softOriginalLanguage =
    type === 'original-language' &&
    Array.isArray(cards) &&
    cards.length > 0 &&
    inspection.errors.every((error) =>
      String(error).includes('paragraph count must be at least 3'),
    );
  if (!inspection.ok && !softOriginalLanguage) {
    throw new Error(
      `Korean source inspection failed for ${sourcePath}: ${inspection.errors.join('; ')}`,
    );
  }

  const targetId = buildTargetKey(target);
  return {
    schemaVersion: TRANSLATION_IO_SCHEMA_VERSION,
    targetId,
    audioId: target.audioId || null,
    bookId: target.bookId,
    chapter: Number(target.chapter),
    verse: Number(target.verse),
    type,
    locale: target.locale,
    sourceLocale: 'ko-KR',
    sourcePath,
    sourceHashAlgorithm: 'sha256',
    sourceHash: inspection.sourceSha256,
    cardCount,
    cardIdentities: (target.cardIdentities || cards.map((c) => c.identity)).map(
      String,
    ),
    tableKey: target.tableKey || getCommentaryType(type).tableKey,
    verseKey: target.verseKey || null,
    sourceStructure: inspection.signature,
    sourceNarrationText: text,
    sourceCards: serializeCards(cards),
  };
}

export function buildTranslationJobs(targets, options = {}) {
  if (!Array.isArray(targets)) {
    throw new Error('targets must be an array');
  }
  const jobs = targets.map((target) => buildTranslationJob(target, options));
  jobs.sort((a, b) => a.targetId.localeCompare(b.targetId));

  const seen = new Set();
  const duplicates = [];
  for (const job of jobs) {
    if (seen.has(job.targetId)) duplicates.push(job.targetId);
    seen.add(job.targetId);
  }
  if (duplicates.length) {
    throw new Error(`Duplicate targetId in jobs: ${duplicates[0]}`);
  }

  const missingHash = jobs.filter((job) => !job.sourceHash);
  if (missingHash.length) {
    throw new Error(`Missing sourceHash for ${missingHash[0].targetId}`);
  }

  return {
    jobs,
    jobCount: jobs.length,
    countsByLocale: countBy(jobs, (job) => job.locale),
    countsByType: countBy(jobs, (job) => job.type),
    duplicateTargetIds: [],
    missingSourceHashCount: 0,
  };
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export function formatJsonl(records) {
  return `${records.map((item) => JSON.stringify(item)).join('\n')}\n`;
}

export function writeJsonlFile(filePath, records, options = {}) {
  const absolute = options.requireTmp
    ? assertStagingPath(filePath, 'jsonl path')
    : path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const body = formatJsonl(records);
  const tmp = `${absolute}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, absolute);
  return {
    path: absolute,
    lineCount: records.length,
    sha256: sha256Text(body),
  };
}

export function readJsonlFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`JSONL file missing: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, 'utf8');
  const lines = raw.split(/\r?\n/);
  const records = [];
  const parseErrors = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      records.push({ lineNumber: i + 1, value: JSON.parse(line) });
    } catch (error) {
      parseErrors.push({ lineNumber: i + 1, error: error.message });
    }
  }
  return { path: absolute, records, parseErrors, rawSha256: sha256Text(raw) };
}

function flattenCardText(cards) {
  // Field *keys* may remain Korean (항목/내용/...) by product policy.
  // Hangul residual checks apply to values and identities only.
  const chunks = [];
  for (const card of cards || []) {
    chunks.push(String(card.identity || ''));
    const fields = card.fields || {};
    for (const value of Object.values(fields)) {
      chunks.push(String(value ?? ''));
    }
  }
  return chunks.join('\n');
}

function resolveNarrationText(result) {
  if (typeof result.narrationText === 'string' && result.narrationText.trim()) {
    return result.narrationText;
  }
  if (Array.isArray(result.translatedNarrationParagraphs)) {
    return joinNarrationStructure(result.translatedNarrationParagraphs);
  }
  if (Array.isArray(result.paragraphs)) {
    return joinNarrationStructure(result.paragraphs);
  }
  return '';
}

function resolveTranslatedCards(result) {
  if (Array.isArray(result.translatedCards)) return result.translatedCards;
  if (Array.isArray(result.cards)) return result.cards;
  return null;
}

/**
 * Validate imported translation results against exported jobs.
 */
export function validateTranslationResults(jobs, resultRecords, options = {}) {
  const jobList = Array.isArray(jobs) ? jobs : [];
  const results = Array.isArray(resultRecords)
    ? resultRecords.map((item) => (item && item.value ? item.value : item))
    : [];

  const errors = [];
  const jobById = new Map();
  for (const job of jobList) {
    if (jobById.has(job.targetId)) {
      errors.push({ code: 'duplicate_job_targetId', targetId: job.targetId });
    }
    jobById.set(job.targetId, job);
  }

  const seen = new Set();
  const duplicateIds = [];
  const missingIds = [];
  const orderErrors = [];
  const hangulErrors = [];
  const sourceHashMismatches = [];
  const perTarget = [];

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index] || {};
    const targetId = result.targetId;
    if (!targetId) {
      errors.push({ code: 'missing_result_targetId', index });
      continue;
    }
    if (seen.has(targetId)) {
      duplicateIds.push(targetId);
      errors.push({ code: 'duplicate_result_targetId', targetId });
      continue;
    }
    seen.add(targetId);

    const job = jobById.get(targetId);
    if (!job) {
      errors.push({ code: 'unknown_result_targetId', targetId });
      continue;
    }

    if (options.expectJobOrder !== false && jobList[index]) {
      if (jobList[index].targetId !== targetId) {
        orderErrors.push({
          index,
          expected: jobList[index].targetId,
          actual: targetId,
        });
        errors.push({
          code: 'result_order_mismatch',
          index,
          expected: jobList[index].targetId,
          actual: targetId,
        });
      }
    }

    const qa = evaluateTranslationResultQa(job, result, options);
    perTarget.push(qa);
    if (qa.codes.includes('source_hash_mismatch')) {
      sourceHashMismatches.push(targetId);
    }
    if (qa.codes.includes('hangul_residual')) {
      hangulErrors.push(targetId);
    }
    if (!qa.ok) {
      errors.push({
        code: 'translation_qa_failed',
        targetId,
        reasons: qa.reasons,
      });
    }
  }

  for (const job of jobList) {
    if (!seen.has(job.targetId)) {
      missingIds.push(job.targetId);
      errors.push({ code: 'missing_result', targetId: job.targetId });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    duplicateIds,
    missingIds,
    orderErrors,
    hangulErrors,
    sourceHashMismatches,
    perTarget,
    resultCount: results.length,
    jobCount: jobList.length,
  };
}

export function evaluateTranslationResultQa(job, result, options = {}) {
  const reasons = [];
  const codes = [];
  const hangulThreshold =
    options.hangulRatioThreshold == null ? 0.08 : options.hangulRatioThreshold;

  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      targetId: job?.targetId || null,
      translationGrade: 'FAIL',
      translationQaStatus: 'fail',
      reasons: ['result_missing'],
      codes: ['result_missing'],
    };
  }

  if (result.targetId && job.targetId && result.targetId !== job.targetId) {
    reasons.push('targetId mismatch');
    codes.push('target_id_mismatch');
  }

  if (!result.sourceHash) {
    reasons.push('result sourceHash missing');
    codes.push('source_hash_missing');
  } else if (result.sourceHash !== job.sourceHash) {
    reasons.push(
      `sourceHash mismatch result=${result.sourceHash} job=${job.sourceHash}`,
    );
    codes.push('source_hash_mismatch');
  }

  const cards = resolveTranslatedCards(result);
    if (!Array.isArray(cards)) {
    reasons.push('translated cards missing');
    codes.push('cards_missing');
  } else {
    if (cards.length !== Number(job.cardCount)) {
      reasons.push(
        `cardCount mismatch got=${cards.length} want=${job.cardCount}`,
      );
      codes.push('card_count_mismatch');
    }
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      if (!card || typeof card !== 'object') {
        reasons.push(`invalid card at ${i}`);
        codes.push('invalid_card');
        continue;
      }
      if (Number(card.itemIndex) !== i) {
        reasons.push(`card itemIndex order error at ${i}`);
        codes.push('card_order_error');
      }
      if (!card.fields || typeof card.fields !== 'object') {
        reasons.push(`card fields missing at ${i}`);
        codes.push('card_fields_missing');
      } else {
        const values = Object.values(card.fields).map((value) =>
          String(value ?? '').trim(),
        );
        if (!values.length || values.every((value) => !value)) {
          reasons.push(`empty card fields at ${i}`);
          codes.push('empty_card');
        }
      }
    }

    const cardText = flattenCardText(cards);
    const hangul = countHangulChars(cardText);
    const total = cardText.replace(/\s+/g, '').length || 1;
    if (hangul / total > hangulThreshold) {
      reasons.push(`Hangul residual in cards (${hangul} chars)`);
      codes.push('hangul_residual');
    }
    if (containsDangerousHtml(cardText)) {
      reasons.push('dangerous HTML in cards');
      codes.push('dangerous_html');
    }
  }

  const narrationText = resolveNarrationText(result);
  if (!narrationText.trim()) {
    reasons.push('translated narration missing');
    codes.push('narration_missing');
  } else {
    const sourceParagraphs = parseNarrationStructure(job.sourceNarrationText);
    const translatedParagraphs = parseNarrationStructure(narrationText);
    const sourceSignature = buildNarrationStructureSignature(sourceParagraphs);
    const narrationSignature = buildNarrationStructureSignature(
      translatedParagraphs,
    );
    const structureMatches =
      JSON.stringify(sourceSignature.lineCounts) ===
      JSON.stringify(narrationSignature.lineCounts);

    const narrationQa = validateTranslatedNarration({
      sourceText: job.sourceNarrationText,
      translatedText: narrationText,
      targetLocale: job.locale,
      type: job.type,
      cardCount: job.cardCount,
    });

    const softOriginalLanguage =
      job.type === 'original-language' && sourceParagraphs.length !== 3;

    const remainingErrors = filterNarrationValidationErrors(
      narrationQa.errors || [],
      { softOriginalLanguage },
    );
    if (remainingErrors.length) {
      reasons.push(...remainingErrors);
      codes.push('narration_structure_failed');
    } else if (!structureMatches) {
      reasons.push(
        `Structure mismatch: source=${JSON.stringify(sourceSignature.lineCounts)} translated=${JSON.stringify(narrationSignature.lineCounts)}`,
      );
      codes.push('narration_structure_failed');
    }

    const hangul = countHangulChars(narrationText);
    const total = narrationText.replace(/\s+/g, '').length || 1;
    if (hangul / total > hangulThreshold) {
      reasons.push(`Hangul residual in narration (${hangul} chars)`);
      codes.push('hangul_residual');
    }
    if (containsDangerousHtml(narrationText)) {
      reasons.push('dangerous HTML in narration');
      codes.push('dangerous_html');
    }
  }

  const missingTerms = findMissingOriginalLanguageTerms(
    job,
    narrationText,
    cards,
  );
  if (missingTerms.length) {
    reasons.push(
      `missing original-language terms: ${missingTerms.slice(0, 5).join(', ')}`,
    );
    codes.push('missing_original_language_terms');
  }

  const ok = reasons.length === 0;
  return {
    ok,
    targetId: job.targetId,
    locale: job.locale,
    type: job.type,
    translationGrade: ok ? 'PASS' : 'FAIL',
    translationQaStatus: ok ? 'pass' : 'fail',
    reasons: [...new Set(reasons)],
    codes: [...new Set(codes)],
    narrationText,
    cards,
  };
}

export function summarizeTranslationJobs(jobs) {
  return {
    jobCount: jobs.length,
    countsByLocale: countBy(jobs, (job) => job.locale),
    countsByType: countBy(jobs, (job) => job.type),
    uniqueTargetIds: new Set(jobs.map((job) => job.targetId)).size,
    missingSourceHashCount: jobs.filter((job) => !job.sourceHash).length,
  };
}

export { sha256Text, sha256Bytes, parseNarrationStructure };
