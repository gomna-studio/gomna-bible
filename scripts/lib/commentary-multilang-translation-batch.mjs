/**
 * Batched multilingual translation runner for commentary multilang v2 phase-3.
 * One API call per (book, chapter, verse, locale) covering all commentary types.
 * Does not write repository approved artifacts.
 */

import { listCommentaryTypes } from './commentary-type-registry.mjs';
import { getLocaleConfig } from './commentary-multilang-registry.mjs';
import {
  DEFAULT_TRANSLATION_MODEL,
  buildNarrationStructureSignature,
  joinNarrationStructure,
  parseNarrationStructure,
  validateTranslatedNarrationStructure,
} from './commentary-multilang-translation.mjs';
import { countHangulChars, filterNarrationValidationErrors, containsDangerousHtml, findMissingOriginalLanguageTerms } from './commentary-multilang-translation-io.mjs';
import { inspectApprovedNarrationLock } from './commentary-multilang-narration-stage.mjs';

export const BATCH_SCHEMA_VERSION = 1;
export const DEFAULT_TRANSLATE_CONCURRENCY = 2;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_MAX_API_CALLS = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registryTypeOrder() {
  return listCommentaryTypes().map((item) => item.type);
}

export function buildBatchKey(job) {
  return [
    job.bookId,
    Number(job.chapter),
    Number(job.verse),
    job.locale,
  ].join('|');
}

/**
 * Exclude repository-approved matching targets from translation.
 */
export function filterJobsForTranslation(jobs, options = {}) {
  const eligible = [];
  const skippedApproved = [];
  const lockedConflict = [];

  for (const job of jobs) {
    const lock =
      typeof options.inspectLock === 'function'
        ? options.inspectLock(job)
        : inspectApprovedNarrationLock(job, options);
    if (lock.status === 'locked-skip') {
      skippedApproved.push({ targetId: job.targetId, ...lock });
      continue;
    }
    if (lock.status === 'locked-conflict') {
      lockedConflict.push({ targetId: job.targetId, ...lock });
      continue;
    }
    eligible.push(job);
  }

  return { eligible, skippedApproved, lockedConflict };
}

/**
 * Group jobs into one batch per verse+locale (all types in registry order).
 */
export function groupJobsIntoTranslationBatches(jobs, options = {}) {
  const typeOrder = options.typeOrder || registryTypeOrder();
  const byKey = new Map();

  for (const job of jobs) {
    getLocaleConfig(job.locale);
    const key = buildBatchKey(job);
    if (!byKey.has(key)) {
      byKey.set(key, {
        batchId: key,
        bookId: job.bookId,
        chapter: Number(job.chapter),
        verse: Number(job.verse),
        locale: job.locale,
        jobsByType: new Map(),
      });
    }
    const batch = byKey.get(key);
    if (batch.jobsByType.has(job.type)) {
      throw new Error(
        `Duplicate type in batch ${key}: ${job.type} (${job.targetId})`,
      );
    }
    batch.jobsByType.set(job.type, job);
  }

  const batches = [];
  for (const batch of byKey.values()) {
    const jobsInOrder = [];
    for (const type of typeOrder) {
      if (batch.jobsByType.has(type)) {
        jobsInOrder.push(batch.jobsByType.get(type));
      }
    }
    // Include any unexpected types deterministically.
    for (const type of [...batch.jobsByType.keys()].sort()) {
      if (!typeOrder.includes(type)) {
        jobsInOrder.push(batch.jobsByType.get(type));
      }
    }
    batches.push({
      batchId: batch.batchId,
      bookId: batch.bookId,
      chapter: batch.chapter,
      verse: batch.verse,
      locale: batch.locale,
      jobs: jobsInOrder,
      types: jobsInOrder.map((job) => job.type),
      targetIds: jobsInOrder.map((job) => job.targetId),
    });
  }

  batches.sort((a, b) => a.batchId.localeCompare(b.batchId));
  return batches;
}

export function estimateTranslationApiCalls(jobs, options = {}) {
  const filtered = filterJobsForTranslation(jobs, options);
  const batches = groupJobsIntoTranslationBatches(filtered.eligible, options);
  return {
    targetCount: jobs.length,
    eligibleTargetCount: filtered.eligible.length,
    skippedApprovedCount: filtered.skippedApproved.length,
    lockedConflictCount: filtered.lockedConflict.length,
    batchCount: batches.length,
    estimatedApiCalls: batches.length,
    batches: batches.map((batch) => ({
      batchId: batch.batchId,
      locale: batch.locale,
      types: batch.types,
      targetCount: batch.jobs.length,
    })),
    skippedApproved: filtered.skippedApproved,
    lockedConflict: filtered.lockedConflict,
  };
}

function buildBatchSystemPrompt(batch) {
  const locale = getLocaleConfig(batch.locale);
  return [
    'You are translating Korean Bible commentary for text-to-speech and on-screen cards.',
    `Target locale: ${locale.locale}.`,
    `Passage: ${batch.bookId} ${batch.chapter}:${batch.verse}.`,
    `Translate ALL commentary types in one response: ${batch.types.join(', ')}.`,
    'Return ONLY JSON with shape:',
    '{"items":[{"type":"...","sourceHash":"...","paragraphs":[["line",...],...],"cards":[{"itemIndex":0,"identity":"...","fields":{...}}]}]}',
    'Include exactly one item per requested type. Do not add extra types.',
    'For each type, paragraphs must mirror the source paragraph/lineCounts exactly.',
    'One source line => one translated line. Do not merge or split lines.',
    'cards must keep the same itemIndex order and field keys; translate field values.',
    'identity may be localized but itemIndex must remain contiguous from 0.',
    'sourceHash on each item must equal the provided sourceHash for that type.',
    'Do not add headings, markdown, notes, or wrappers.',
    'Preserve Bible references and doctrinal tone.',
    'For original-language, retain source transliterations; do not invent new ones.',
  ].join('\n');
}

function buildBatchUserContent(batch) {
  const payload = {
    bookId: batch.bookId,
    chapter: batch.chapter,
    verse: batch.verse,
    locale: batch.locale,
    types: batch.jobs.map((job) => ({
      type: job.type,
      targetId: job.targetId,
      sourceHash: job.sourceHash,
      cardCount: job.cardCount,
      sourceStructure: job.sourceStructure,
      sourceNarrationParagraphs: parseNarrationStructure(
        job.sourceNarrationText,
      ),
      sourceCards: (job.sourceCards || []).map((card) => ({
        itemIndex: card.itemIndex,
        identity: card.identity,
        fields: card.fields,
      })),
    })),
  };
  return [
    `Translate this Korean commentary batch into ${batch.locale}.`,
    'Return JSON items for every type listed.',
    JSON.stringify(payload, null, 2),
  ].join('\n\n');
}

export function buildBatchTranslationRequest(batch) {
  return {
    batchId: batch.batchId,
    systemPrompt: buildBatchSystemPrompt(batch),
    userContent: buildBatchUserContent(batch),
    expectedTypes: batch.types.slice(),
    expectedTargetIds: batch.targetIds.slice(),
  };
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty model response');
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

/**
 * Split one batch model response into phase-2 result objects (one per target).
 */
export function splitBatchTranslationResponse(batch, responseText, options = {}) {
  const errors = [];
  let parsed;
  try {
    parsed = extractJsonObject(responseText);
  } catch (error) {
    return {
      ok: false,
      errors: [{ code: 'json_corrupt', message: error.message }],
      results: [],
    };
  }

  const items = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed?.types)
      ? null
      : null;

  let normalizedItems = items;
  if (!normalizedItems && parsed?.types && typeof parsed.types === 'object') {
    normalizedItems = Object.entries(parsed.types).map(([type, value]) => ({
      type,
      ...(value || {}),
    }));
  }

  if (!Array.isArray(normalizedItems)) {
    return {
      ok: false,
      errors: [
        {
          code: 'json_shape',
          message: 'Batch response must contain an items array',
        },
      ],
      results: [],
    };
  }

  const byType = new Map();
  for (const item of normalizedItems) {
    const type = item?.type;
    if (!type) {
      errors.push({ code: 'missing_type', message: 'item missing type' });
      continue;
    }
    if (byType.has(type)) {
      errors.push({
        code: 'duplicate_type',
        type,
        message: `Duplicate type in batch response: ${type}`,
      });
      continue;
    }
    byType.set(type, item);
  }

  for (const type of batch.types) {
    if (!byType.has(type)) {
      errors.push({
        code: 'missing_type',
        type,
        message: `Missing type in batch response: ${type}`,
      });
    }
  }
  for (const type of byType.keys()) {
    if (!batch.types.includes(type)) {
      errors.push({
        code: 'unexpected_type',
        type,
        message: `Unexpected type in batch response: ${type}`,
      });
    }
  }

  const results = [];
  const hangulThreshold =
    options.hangulRatioThreshold == null ? 0.08 : options.hangulRatioThreshold;

  for (const job of batch.jobs) {
    const item = byType.get(job.type);
    if (!item) continue;

    const itemErrors = [];
    if (!item.sourceHash) {
      itemErrors.push('result sourceHash missing');
    } else if (item.sourceHash !== job.sourceHash) {
      itemErrors.push(
        `sourceHash mismatch result=${item.sourceHash} job=${job.sourceHash}`,
      );
      errors.push({
        code: 'source_hash_mismatch',
        type: job.type,
        targetId: job.targetId,
      });
    }

    const paragraphs = item.paragraphs || item.translatedNarrationParagraphs;
    let narrationText = '';
    if (!Array.isArray(paragraphs)) {
      itemErrors.push('paragraphs missing');
    } else {
      const sourceParagraphs = parseNarrationStructure(job.sourceNarrationText);
      const sourceSignature = buildNarrationStructureSignature(sourceParagraphs);
      const narrationSignature = buildNarrationStructureSignature(paragraphs);
      const structureMatches =
        JSON.stringify(sourceSignature.lineCounts) ===
        JSON.stringify(narrationSignature.lineCounts);

      const validation = validateTranslatedNarrationStructure({
        sourceText: job.sourceNarrationText,
        translatedParagraphs: paragraphs,
        targetLocale: job.locale,
        type: job.type,
        cardCount: job.cardCount,
      });

      const softOriginalLanguage =
        job.type === 'original-language' && sourceParagraphs.length !== 3;
      const remainingErrors = filterNarrationValidationErrors(
        validation.errors || [],
        { softOriginalLanguage },
      );

      if (remainingErrors.length) {
        itemErrors.push(...remainingErrors);
      } else if (!structureMatches) {
        itemErrors.push(
          `Structure mismatch: source=${JSON.stringify(sourceSignature.lineCounts)} translated=${JSON.stringify(narrationSignature.lineCounts)}`,
        );
      }

      narrationText = joinNarrationStructure(paragraphs);
      const hangul = countHangulChars(narrationText);
      const total = narrationText.replace(/\s+/g, '').length || 1;
      if (hangul / total > hangulThreshold) {
        itemErrors.push(`Hangul residual in narration (${hangul} chars)`);
      }
      if (containsDangerousHtml(narrationText)) {
        itemErrors.push('dangerous HTML in narration');
      }
    }

    const cards = item.cards || item.translatedCards;
    if (!Array.isArray(cards)) {
      itemErrors.push('cards missing');
    } else if (cards.length !== Number(job.cardCount)) {
      itemErrors.push(
        `cardCount mismatch got=${cards.length} want=${job.cardCount}`,
      );
    } else {
      for (let i = 0; i < cards.length; i += 1) {
        if (Number(cards[i]?.itemIndex) !== i) {
          itemErrors.push(`card itemIndex order error at ${i}`);
        }
        if (!cards[i]?.fields || typeof cards[i].fields !== 'object') {
          itemErrors.push(`card fields missing at ${i}`);
        } else {
          const values = Object.values(cards[i].fields).map((value) =>
            String(value ?? '').trim(),
          );
          if (!values.length || values.every((value) => !value)) {
            itemErrors.push(`empty card fields at ${i}`);
          }
        }
      }
      const values = cards
        .flatMap((card) => [
          String(card.identity || ''),
          ...Object.values(card.fields || {}).map((value) => String(value ?? '')),
        ])
        .join('\n');
      const hangul = countHangulChars(values);
      const total = values.replace(/\s+/g, '').length || 1;
      if (hangul / total > hangulThreshold) {
        itemErrors.push(`Hangul residual in cards (${hangul} chars)`);
      }
      if (containsDangerousHtml(values)) {
        itemErrors.push('dangerous HTML in cards');
      }
    }

    const missingTerms = findMissingOriginalLanguageTerms(
      job,
      narrationText,
      cards,
    );
    if (missingTerms.length) {
      itemErrors.push(
        `missing original-language terms: ${missingTerms.slice(0, 5).join(', ')}`,
      );
    }

    if (itemErrors.length) {
      errors.push({
        code: 'target_validation_failed',
        type: job.type,
        targetId: job.targetId,
        reasons: itemErrors,
      });
      continue;
    }

    results.push({
      schemaVersion: BATCH_SCHEMA_VERSION,
      targetId: job.targetId,
      sourceHash: job.sourceHash,
      locale: job.locale,
      type: job.type,
      model: options.model || DEFAULT_TRANSLATION_MODEL,
      translatedAt: options.translatedAt || new Date().toISOString(),
      translatedCards: (cards || []).map((card, index) => ({
        itemIndex: Number(card.itemIndex ?? index),
        identity: card.identity || `item-${index}`,
        fields: { ...(card.fields || {}) },
      })),
      translatedNarrationParagraphs: paragraphs,
      narrationText:
        narrationText ||
        (Array.isArray(paragraphs) ? joinNarrationStructure(paragraphs) : ''),
      batchId: batch.batchId,
    });
  }

  return {
    ok: errors.length === 0 && results.length === batch.jobs.length,
    errors,
    results,
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/**
 * Run batched translation. Default is dry/preflight (no network).
 */
export async function runBatchedTranslation(jobs, options = {}) {
  const executeNetwork = options.executeNetwork === true;
  const concurrency =
    options.concurrency == null
      ? DEFAULT_TRANSLATE_CONCURRENCY
      : Number(options.concurrency);
  const maxAttempts =
    options.maxAttempts == null ? DEFAULT_MAX_ATTEMPTS : Number(options.maxAttempts);
  const maxApiCalls =
    options.maxApiCalls == null ? DEFAULT_MAX_API_CALLS : Number(options.maxApiCalls);
  const provider = options.provider || null;

  const estimate = estimateTranslationApiCalls(jobs, options);
  const counters = {
    plannedCalls: estimate.estimatedApiCalls,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retriedCalls: 0,
    totalCalls: 0,
    validationFailedCalls: 0,
  };

  const report = {
    executeNetwork,
    ...estimate,
    counters,
    blockedReason: null,
    results: [],
    batchResults: [],
    failedBatches: [],
  };

  if (!executeNetwork) {
    report.blockedReason = 'preflight_only_use_--execute-network_to_call_api';
    return { ok: true, preflight: true, ...report };
  }

  if (!provider || typeof provider.complete !== 'function') {
    throw new Error('provider.complete is required when --execute-network is set');
  }

  if (estimate.estimatedApiCalls > maxApiCalls) {
    report.blockedReason = `max-api-calls exceeded: estimated=${estimate.estimatedApiCalls} max=${maxApiCalls}`;
    return { ok: false, preflight: false, ...report };
  }

  if (estimate.estimatedApiCalls === 0) {
    return { ok: true, preflight: false, ...report };
  }

  const filtered = filterJobsForTranslation(jobs, options);
  const runBatches = groupJobsIntoTranslationBatches(filtered.eligible, options);

  if (runBatches.length > maxApiCalls) {
    report.blockedReason = `max-api-calls exceeded: estimated=${runBatches.length} max=${maxApiCalls}`;
    report.ok = false;
    return { ok: false, preflight: false, ...report };
  }

  let remainingBudget = maxApiCalls;
  let remainingBatchSlots = runBatches.length;

  const batchOutcomes = await mapPool(
    runBatches,
    concurrency,
    async (batch) => {
      remainingBatchSlots = Math.max(0, remainingBatchSlots - 1);
      const reservedForLater = remainingBatchSlots;
      if (remainingBudget <= reservedForLater) {
        return {
          ok: false,
          batchId: batch.batchId,
          error: `max-api-calls exceeded before batch ${batch.batchId}`,
          results: [],
          attempts: 0,
        };
      }

      const request = buildBatchTranslationRequest(batch);
      let lastError = null;
      let split = null;
      // Keep one call reserved for each later batch; retries only use spare budget.
      const attemptsAllowed = Math.max(
        1,
        Math.min(maxAttempts, remainingBudget - reservedForLater),
      );

      for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
        if (remainingBudget <= reservedForLater) {
          return {
            ok: false,
            batchId: batch.batchId,
            error: `max-api-calls exceeded during retries for ${batch.batchId}`,
            results: split?.results || [],
            attempts: attempt - 1,
          };
        }
        if (attempt > 1) counters.retriedCalls += 1;
        remainingBudget -= 1;
        try {
          const completion = await provider.complete({
            systemPrompt: request.systemPrompt,
            userContent:
              attempt === 1
                ? request.userContent
                : `${request.userContent}\n\nRETRY because: ${lastError || 'validation failed'}`,
            counters,
          });

          split = splitBatchTranslationResponse(batch, completion.text, {
            model: completion.model,
            hangulRatioThreshold: options.hangulRatioThreshold,
          });
          if (split.ok) {
            return {
              ok: true,
              batchId: batch.batchId,
              results: split.results,
              attempts: attempt,
              model: completion.model,
            };
          }
          counters.validationFailedCalls += 1;
          lastError = split.errors
            .map((item) => item.message || item.code)
            .join('; ');
        } catch (error) {
          lastError = error.message;
          const retryable =
            error.retryable === true || error.statusCode === 429;
          if (
            retryable &&
            attempt < attemptsAllowed &&
            remainingBudget > reservedForLater
          ) {
            const delayMs = Math.min(8000, 250 * 2 ** (attempt - 1));
            await sleep(
              options.backoffMs != null ? options.backoffMs : delayMs,
            );
            continue;
          }
          return {
            ok: false,
            batchId: batch.batchId,
            error: lastError,
            statusCode: error.statusCode || null,
            results: [],
            attempts: attempt,
          };
        }
      }

      return {
        ok: false,
        batchId: batch.batchId,
        error: lastError || 'batch validation failed',
        errors: split?.errors || [],
        results: split?.results || [],
        attempts: attemptsAllowed,
      };
    },
  );

  for (const outcome of batchOutcomes) {
    report.batchResults.push(outcome);
    if (outcome.ok) {
      report.results.push(...outcome.results);
    } else {
      report.failedBatches.push(outcome);
    }
  }

  report.results.sort((a, b) => a.targetId.localeCompare(b.targetId));
  report.skippedApproved = filtered.skippedApproved;
  report.lockedConflict = filtered.lockedConflict;
  report.ok =
    report.failedBatches.length === 0 &&
    report.results.length === filtered.eligible.length;

  return { ok: report.ok, preflight: false, ...report };
}

export function createMockBatchSuccessHandler() {
  // Build a handler that returns valid batch JSON for any requested batch.
  return async ({ userContent }) => {
    const text = String(userContent || '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('mock could not parse user payload');
    }
    const payload = JSON.parse(text.slice(start, end + 1));
    const items = (payload.types || []).map((entry) => {
      const paragraphs = (entry.sourceNarrationParagraphs || []).map(
        (lines, pIndex) =>
          lines.map(
            (_line, lineIndex) =>
              `Translated ${payload.locale} ${entry.type} p${pIndex + 1}l${lineIndex + 1}.`,
          ),
      );
      const cards = (entry.sourceCards || []).map((card, cardIndex) => ({
        itemIndex: card.itemIndex,
        identity: `translated-identity-${card.itemIndex}`,
        fields: Object.fromEntries(
          Object.keys(card.fields || {}).map((key, fieldIndex) => {
            const sourceValue = String(card.fields[key] ?? '');
            const hebrew = (sourceValue.match(/\p{Script=Hebrew}+/gu) || []).join(
              ' ',
            );
            const base = `Translated value ${cardIndex}-${fieldIndex}`;
            return [key, hebrew ? `${hebrew} ${base}` : base];
          }),
        ),
      }));
      return {
        type: entry.type,
        sourceHash: entry.sourceHash,
        paragraphs,
        cards,
      };
    });
    return JSON.stringify({ items });
  };
}

export { buildNarrationStructureSignature };
