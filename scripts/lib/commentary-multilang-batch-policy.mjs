/**
 * Batch auto-approval *policy* for commentary multilang pipeline v2.
 * Phase-1: policy + deterministic sample selection only — never mutates meta.
 */

import crypto from 'crypto';
import { QA_GRADES } from './commentary-multilang-qa.mjs';
import { listCommentaryTypes } from './commentary-type-registry.mjs';

export const BATCH_APPROVAL_MODES = Object.freeze({
  OFF: 'off',
  CANDIDATES_ONLY: 'candidates-only',
  AUTO_WITHIN_BATCH: 'auto-within-batch',
});

export const DEFAULT_BATCH_APPROVAL_MODE = BATCH_APPROVAL_MODES.CANDIDATES_ONLY;
export const BATCH_STATUS = Object.freeze({
  READY: 'READY',
  CANDIDATES_ONLY: 'CANDIDATES_ONLY',
  BATCH_BLOCKED: 'BATCH_BLOCKED',
  DISABLED: 'DISABLED',
});

export const DEFAULT_SAMPLE_MIN = 18;
export const DEFAULT_SAMPLE_MAX = 300;
export const DEFAULT_SAMPLE_RATIO = 0.01;

/**
 * Decide whether a QA-evaluated target may enter an approval candidate batch.
 * Does not write approvals.
 */
export function evaluateBatchApprovalEligibility(qaResult, options = {}) {
  const mode = options.mode || DEFAULT_BATCH_APPROVAL_MODE;
  if (!Object.values(BATCH_APPROVAL_MODES).includes(mode)) {
    throw new Error(`Unsupported batch approval mode: ${mode}`);
  }

  if (mode === BATCH_APPROVAL_MODES.OFF) {
    return {
      eligible: false,
      autoApproveAllowed: false,
      reason: 'batch_approval_disabled',
      mode,
    };
  }

  if (!qaResult || typeof qaResult !== 'object') {
    throw new Error('qaResult is required');
  }

  const grade = qaResult.structuralGrade || qaResult.grade;

  if (grade === QA_GRADES.FAIL) {
    return {
      eligible: false,
      autoApproveAllowed: false,
      reason: 'qa_fail',
      mode,
    };
  }

  if (grade === QA_GRADES.REVIEW_REQUIRED) {
    return {
      eligible: false,
      autoApproveAllowed: false,
      reason: 'qa_review_required',
      mode,
    };
  }

  if (
    qaResult.status === 'approved' ||
    qaResult.status === 'skipped-existing' ||
    qaResult.inventoryStatus === 'skipped-existing'
  ) {
    return {
      eligible: false,
      autoApproveAllowed: false,
      reason: 'already_terminal_or_approved',
      mode,
    };
  }

  // Phase-1: structural PASS missing items are planning candidates only.
  // They are NOT translation-approved auto-write candidates.
  if (mode === BATCH_APPROVAL_MODES.AUTO_WITHIN_BATCH) {
    return {
      eligible: true,
      autoApproveAllowed: false,
      reason: 'structural_candidate_translation_qa_not_run',
      mode,
      phase1BlockedWrite: true,
    };
  }

  return {
    eligible: true,
    autoApproveAllowed: false,
    reason: 'structural_candidate_only',
    mode,
  };
}

function stableHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function parseTargetParts(targetKey) {
  const parts = String(targetKey || '').split('.');
  // book.chapter.verse.type.locale — type may contain hyphens, locale has hyphen.
  if (parts.length < 5) return null;
  const locale = parts[parts.length - 1];
  const type = parts.slice(3, -1).join('.');
  return {
    bookId: parts[0],
    chapter: Number(parts[1]),
    verse: Number(parts[2]),
    type,
    locale,
  };
}

/**
 * sampleCount = min(eligible, maxCap, max(minFloor, ceil(eligible * ratio)))
 */
export function computeBatchSampleCount(eligibleTargetCount, options = {}) {
  const eligible = Number(eligibleTargetCount) || 0;
  if (eligible <= 0) return 0;
  const minFloor =
    options.minCount == null ? DEFAULT_SAMPLE_MIN : options.minCount;
  const maxCap =
    options.maxCount == null ? DEFAULT_SAMPLE_MAX : options.maxCount;
  const ratio =
    options.ratio == null ? DEFAULT_SAMPLE_RATIO : options.ratio;
  if (!Number.isInteger(minFloor) || minFloor < 1) {
    throw new Error('sample minCount must be >= 1');
  }
  if (!Number.isInteger(maxCap) || maxCap < 1) {
    throw new Error('sample maxCount must be >= 1');
  }
  const percentTarget = Math.ceil(eligible * ratio);
  return Math.min(eligible, maxCap, Math.max(minFloor, percentTarget));
}

function stripInternal(item) {
  const clone = { ...item };
  if (clone._band) clone.band = clone._band;
  delete clone._index;
  delete clone._locale;
  delete clone._type;
  delete clone._chapter;
  delete clone._verse;
  delete clone._rank;
  delete clone._band;
  return clone;
}

/**
 * Split sorted eligible verses into front / middle / end bands.
 * Band sizes differ by at most one; no verse numbers are hard-coded.
 */
export function splitVerseBands(sortedVerses) {
  const verses = [...new Set((sortedVerses || []).map(Number))]
    .filter((verse) => Number.isInteger(verse) && verse > 0)
    .sort((a, b) => a - b);
  if (!verses.length) {
    return {
      verses: [],
      front: [],
      middle: [],
      end: [],
      bands: { front: [], middle: [], end: [] },
    };
  }
  const n = verses.length;
  const frontSize = Math.floor(n / 3);
  const middleSize = Math.floor(n / 3);
  const endSize = n - frontSize - middleSize;
  const front = verses.slice(0, frontSize);
  const middle = verses.slice(frontSize, frontSize + middleSize);
  const end = verses.slice(frontSize + middleSize);
  // When n < 3, keep later bands non-empty by reusing the available span.
  const bands = {
    front: front.length ? front : verses.slice(0, Math.max(1, endSize || 1)),
    middle: middle.length
      ? middle
      : verses.slice(
          Math.floor((n - 1) / 2),
          Math.floor((n - 1) / 2) + 1,
        ),
    end: end.length ? end : verses.slice(-1),
  };
  return { verses, front: bands.front, middle: bands.middle, end: bands.end, bands };
}

function bandCenter(bandVerses) {
  if (!bandVerses.length) return 0;
  return bandVerses[Math.floor((bandVerses.length - 1) / 2)];
}

function pickCandidateForCell(pool, locale, type, preferredBand, seed) {
  const matching = pool.filter(
    (item) => item._locale === locale && item._type === type,
  );
  if (!matching.length) return null;

  const inBand = matching.filter((item) =>
    preferredBand.includes(item._verse),
  );
  const rankOf = (item) =>
    stableHash(`${seed}|${item.targetKey || item.audioId || ''}`);

  if (inBand.length) {
    return [...inBand].sort((a, b) => {
      const byRank = rankOf(a).localeCompare(rankOf(b));
      if (byRank !== 0) return byRank;
      return String(a.targetKey || '').localeCompare(String(b.targetKey || ''));
    })[0];
  }

  // Fallback: nearest verse to band center, then deterministic rank.
  const center = bandCenter(preferredBand);
  return [...matching].sort((a, b) => {
    const da = Math.abs(a._verse - center);
    const db = Math.abs(b._verse - center);
    if (da !== db) return da - db;
    const byRank = rankOf(a).localeCompare(rankOf(b));
    if (byRank !== 0) return byRank;
    return String(a.targetKey || '').localeCompare(String(b.targetKey || ''));
  })[0];
}

/**
 * Deterministic sample selection.
 * Prefer one item per (locale × type) present in the pool, spread across
 * eligible front / middle / end verse bands when the budget is exactly
 * localeCount × typeCount (e.g. EN9 + JA9 = 18).
 */
export function selectBatchReviewSample(candidates, options = {}) {
  const minCount =
    options.minCount == null ? DEFAULT_SAMPLE_MIN : options.minCount;
  const maxCount =
    options.maxCount == null ? DEFAULT_SAMPLE_MAX : options.maxCount;
  const seed =
    options.seed ||
    options.sourceHashSeed ||
    'gomna-commentary-v2-sample';

  if (!Array.isArray(candidates)) {
    throw new Error('candidates must be an array');
  }
  if (!Number.isInteger(minCount) || minCount < 1) {
    throw new Error('sample minCount must be >= 1');
  }
  if (!Number.isInteger(maxCount) || maxCount < 1) {
    throw new Error('sample maxCount must be >= 1');
  }

  if (!candidates.length) {
    return {
      sample: [],
      sampleCount: 0,
      targetSampleCount: 0,
      seed,
      distribution: { byLocale: {}, byType: {}, byLocaleType: {} },
      error: 'sample_pool_empty',
      coverageErrors: ['sample_pool_empty'],
    };
  }

  const targetSampleCount = computeBatchSampleCount(candidates.length, {
    minCount,
    maxCount,
    ratio: options.ratio,
  });

  const typed = candidates.map((item, index) => {
    const parts = parseTargetParts(item.targetKey) || {};
    return {
      ...item,
      _index: index,
      _locale: parts.locale || item.locale || 'unknown',
      _type: parts.type || item.commentaryType || item.type || 'unknown',
      _chapter: parts.chapter || item.chapter || 0,
      _verse: parts.verse || item.verse || 0,
      _rank: stableHash(`${seed}|${item.targetKey || item.audioId || index}`),
    };
  });

  const presentLocales = [];
  for (const locale of ['en-US', 'ja-JP']) {
    if (typed.some((item) => item._locale === locale)) {
      presentLocales.push(locale);
    }
  }
  for (const locale of [...new Set(typed.map((item) => item._locale))].sort()) {
    if (!presentLocales.includes(locale) && locale !== 'unknown') {
      presentLocales.push(locale);
    }
  }

  const presentTypes = [];
  for (const definition of listCommentaryTypes()) {
    if (typed.some((item) => item._type === definition.type)) {
      presentTypes.push(definition.type);
    }
  }
  for (const type of [...new Set(typed.map((item) => item._type))].sort()) {
    if (!presentTypes.includes(type) && type !== 'unknown') {
      presentTypes.push(type);
    }
  }

  const ranked = [...typed].sort((a, b) => {
    const byRank = a._rank.localeCompare(b._rank);
    if (byRank !== 0) return byRank;
    return String(a.targetKey || '').localeCompare(String(b.targetKey || ''));
  });

  const selected = new Map();
  const add = (item, bandName = null) => {
    if (!item) return false;
    const key = item.targetKey || item.audioId;
    if (!key || selected.has(key)) return false;
    if (bandName) item._band = bandName;
    selected.set(key, item);
    return true;
  };

  const coverageErrors = [];
  const requiredCells = [];
  for (const type of presentTypes) {
    for (const locale of presentLocales) {
      if (typed.some((item) => item._locale === locale && item._type === type)) {
        requiredCells.push({ locale, type, key: `${locale}|${type}` });
      }
    }
  }

  const useBandSpread =
    options.bandSpread !== false &&
    requiredCells.length > 0 &&
    requiredCells.length === targetSampleCount &&
    targetSampleCount === presentLocales.length * presentTypes.length;

  const verseBandInfo = splitVerseBands(typed.map((item) => item._verse));
  const bandOrder = ['front', 'middle', 'end'];

  if (useBandSpread) {
    // Assign cells in deterministic type×locale order to front/mid/end
    // blocks of equal size (6+6+6 for EN9/JA9).
    const blockSize = Math.floor(requiredCells.length / bandOrder.length);
    for (let i = 0; i < requiredCells.length; i += 1) {
      const cell = requiredCells[i];
      const bandName =
        bandOrder[Math.min(bandOrder.length - 1, Math.floor(i / blockSize))];
      const preferredBand = verseBandInfo.bands[bandName] || [];
      const picked = pickCandidateForCell(
        typed,
        cell.locale,
        cell.type,
        preferredBand,
        seed,
      );
      if (!picked) {
        coverageErrors.push(`missing_locale_type_sample:${cell.key}`);
        continue;
      }
      // Record intended band even if fallback verse was used.
      add(picked, bandName);
    }
  } else {
    // Legacy coverage: one per present (locale × type), then fill by rank.
    for (const locale of presentLocales) {
      for (const type of presentTypes) {
        const cell = ranked.find(
          (item) => item._locale === locale && item._type === type,
        );
        if (!cell) continue;
        add(cell);
      }
    }

    if (selected.size > targetSampleCount) {
      const keep = [...selected.values()]
        .sort((a, b) => a._rank.localeCompare(b._rank))
        .slice(0, targetSampleCount);
      selected.clear();
      for (const item of keep) add(item);
    }

    for (const item of ranked) {
      if (selected.size >= targetSampleCount) break;
      add(item);
    }
  }

  let sample = [...selected.values()];
  sample.sort((a, b) => {
    if (a._chapter !== b._chapter) return a._chapter - b._chapter;
    if (a._verse !== b._verse) return a._verse - b._verse;
    if (a._type !== b._type) return a._type.localeCompare(b._type);
    return String(a._locale).localeCompare(String(b._locale));
  });

  const byLocale = {};
  const byType = {};
  const byLocaleType = {};
  const byBand = { front: 0, middle: 0, end: 0 };
  const byActualVerseBand = { front: 0, middle: 0, end: 0 };
  const verseToBand = new Map();
  for (const bandName of bandOrder) {
    for (const verse of verseBandInfo.bands[bandName] || []) {
      verseToBand.set(verse, bandName);
    }
  }
  for (const item of sample) {
    byLocale[item._locale] = (byLocale[item._locale] || 0) + 1;
    byType[item._type] = (byType[item._type] || 0) + 1;
    const lt = `${item._locale}|${item._type}`;
    byLocaleType[lt] = (byLocaleType[lt] || 0) + 1;
    if (item._band && byBand[item._band] != null) {
      byBand[item._band] += 1;
    }
    const actualBand = verseToBand.get(item._verse);
    if (actualBand) byActualVerseBand[actualBand] += 1;
  }

  if (sample.length === 0) coverageErrors.push('sample_count_zero');
  if (sample.length !== targetSampleCount) {
    coverageErrors.push(
      `sample_count_mismatch:got=${sample.length}:want=${targetSampleCount}`,
    );
  }

  for (const locale of presentLocales) {
    if (!byLocale[locale]) {
      coverageErrors.push(`missing_${locale}_sample`);
    }
  }
  for (const type of presentTypes) {
    if (!byType[type]) {
      coverageErrors.push(`missing_type_sample:${type}`);
    }
  }

  if (requiredCells.length <= targetSampleCount) {
    for (const cell of requiredCells) {
      if (!byLocaleType[cell.key]) {
        coverageErrors.push(`missing_locale_type_sample:${cell.key}`);
      }
    }
  }

  // Balanced EN/JA when both present and sample budget is exactly 2 × typeCount.
  if (
    presentLocales.includes('en-US') &&
    presentLocales.includes('ja-JP') &&
    presentTypes.length > 0 &&
    targetSampleCount === presentLocales.length * presentTypes.length
  ) {
    if (byLocale['en-US'] !== presentTypes.length) {
      coverageErrors.push('en-US_type_balance');
    }
    if (byLocale['ja-JP'] !== presentTypes.length) {
      coverageErrors.push('ja-JP_type_balance');
    }
  }

  if (useBandSpread) {
    const expectedBase = Math.floor(requiredCells.length / bandOrder.length);
    const expectedLast =
      requiredCells.length - expectedBase * (bandOrder.length - 1);
    for (const bandName of bandOrder) {
      const expected = bandName === 'end' ? expectedLast : expectedBase;
      if (byBand[bandName] !== expected) {
        coverageErrors.push(
          `band_balance_${bandName}:got=${byBand[bandName]}:want=${expected}`,
        );
      }
      if (byActualVerseBand[bandName] !== expected) {
        coverageErrors.push(
          `verse_band_balance_${bandName}:got=${byActualVerseBand[bandName]}:want=${expected}`,
        );
      }
    }
  }

  return {
    sample: sample.map(stripInternal),
    sampleCount: sample.length,
    targetSampleCount,
    seed,
    verseBands: {
      verses: verseBandInfo.verses,
      front: verseBandInfo.front,
      middle: verseBandInfo.middle,
      end: verseBandInfo.end,
    },
    distribution: {
      byLocale,
      byType,
      byLocaleType,
      byBand,
      byActualVerseBand,
    },
    error: coverageErrors.length ? coverageErrors.join(',') : null,
    coverageErrors,
  };
}

export function buildApprovalCandidateReport(qaResults, options = {}) {
  const mode = options.mode || DEFAULT_BATCH_APPROVAL_MODE;
  const candidates = [];
  const blocked = [];

  for (const result of qaResults) {
    const decision = evaluateBatchApprovalEligibility(result, { mode });
    const row = { ...result, approvalDecision: decision };
    if (decision.eligible) candidates.push(row);
    else blocked.push(row);
  }

  const sampleSeed =
    options.sampleSeed ||
    options.sourceHashSeed ||
    stableHash(
      candidates.map((item) => item.targetKey).sort().join('|') || 'empty',
    );

  const sampleResult = selectBatchReviewSample(candidates, {
    minCount: options.sampleMin,
    maxCount: options.sampleMax,
    seed: sampleSeed,
    ratio: options.sampleRatio,
  });

  const reviewRequiredCount = qaResults.filter(
    (item) =>
      (item.structuralGrade || item.grade) === QA_GRADES.REVIEW_REQUIRED,
  ).length;
  const failCount = qaResults.filter(
    (item) => (item.structuralGrade || item.grade) === QA_GRADES.FAIL,
  ).length;

  let batchStatus = BATCH_STATUS.CANDIDATES_ONLY;
  if (mode === BATCH_APPROVAL_MODES.OFF) {
    batchStatus = BATCH_STATUS.DISABLED;
  } else if (
    failCount > 0 ||
    sampleResult.error ||
    sampleResult.sampleCount === 0
  ) {
    batchStatus = BATCH_STATUS.BATCH_BLOCKED;
  } else if (reviewRequiredCount > 0) {
    batchStatus = BATCH_STATUS.CANDIDATES_ONLY;
  } else if (candidates.length) {
    batchStatus = BATCH_STATUS.READY;
  }

  if (sampleResult.coverageErrors?.length) {
    batchStatus = BATCH_STATUS.BATCH_BLOCKED;
  }

  return {
    mode,
    batchStatus,
    candidateCount: candidates.length,
    blockedCount: blocked.length,
    autoApproveCandidateCount: 0,
    reviewRequiredCount,
    failCount,
    writesDisabled: true,
    translationAutoApproveDisabled: true,
    note:
      'Phase-1 structural candidates only. Translation QA not-run; meta approval writes disabled.',
    sample: sampleResult,
    sampleReviewTargetIds: sampleResult.sample.map(
      (item) => item.targetKey || item.audioId,
    ),
    candidates,
    blocked,
  };
}
