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
 * Deterministic sample selection across EN/JA, all 9 types, front/mid/end.
 */
export function selectBatchReviewSample(candidates, options = {}) {
  const minCount = options.minCount == null ? DEFAULT_SAMPLE_MIN : options.minCount;
  const maxCount = options.maxCount == null ? DEFAULT_SAMPLE_MAX : options.maxCount;
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
  if (!Number.isInteger(maxCount) || maxCount < minCount) {
    throw new Error('sample maxCount must be >= minCount');
  }

  if (!candidates.length) {
    return {
      sample: [],
      sampleCount: 0,
      seed,
      distribution: { byLocale: {}, byType: {} },
      error: 'sample_pool_empty',
    };
  }

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

  typed.sort((a, b) => {
    if (a._chapter !== b._chapter) return a._chapter - b._chapter;
    if (a._verse !== b._verse) return a._verse - b._verse;
    if (a._type !== b._type) return a._type.localeCompare(b._type);
    return String(a._locale).localeCompare(String(b._locale));
  });

  const selected = new Map();
  const add = (item) => {
    if (!item) return;
    selected.set(item.targetKey || item.audioId, item);
  };

  // Front / middle / end anchors.
  add(typed[0]);
  add(typed[Math.floor((typed.length - 1) / 2)]);
  add(typed[typed.length - 1]);

  // Ensure both locales when present.
  for (const locale of ['en-US', 'ja-JP']) {
    const hit = typed.find((item) => item._locale === locale);
    add(hit);
  }

  // Ensure all registry types when present.
  for (const definition of listCommentaryTypes()) {
    const hit = typed.find((item) => item._type === definition.type);
    add(hit);
  }

  // Fill remaining slots with deterministic rank order.
  const ranked = [...typed].sort((a, b) => a._rank.localeCompare(b._rank));
  for (const item of ranked) {
    if (selected.size >= maxCount) break;
    if (selected.size >= minCount && selected.size >= Math.min(maxCount, typed.length)) {
      // keep filling until min satisfied and coverage done; break when >= min
    }
    add(item);
    if (selected.size >= Math.min(maxCount, Math.max(minCount, typed.length))) {
      // continue until minCount reached at least
    }
    if (selected.size >= minCount && selected.size >= Math.min(maxCount, typed.length)) {
      break;
    }
  }

  // Guarantee minCount when pool allows.
  for (const item of ranked) {
    if (selected.size >= minCount) break;
    add(item);
  }

  // Cap at maxCount using rank.
  let sample = [...selected.values()];
  if (sample.length > maxCount) {
    sample = sample
      .sort((a, b) => a._rank.localeCompare(b._rank))
      .slice(0, maxCount);
  }

  sample.sort((a, b) => {
    if (a._chapter !== b._chapter) return a._chapter - b._chapter;
    if (a._verse !== b._verse) return a._verse - b._verse;
    if (a._type !== b._type) return a._type.localeCompare(b._type);
    return String(a._locale).localeCompare(String(b._locale));
  });

  const byLocale = {};
  const byType = {};
  for (const item of sample) {
    byLocale[item._locale] = (byLocale[item._locale] || 0) + 1;
    byType[item._type] = (byType[item._type] || 0) + 1;
  }

  const coverageErrors = [];
  if (sample.length === 0) coverageErrors.push('sample_count_zero');
  if (typed.some((item) => item._locale === 'en-US') && !byLocale['en-US']) {
    coverageErrors.push('missing_en-US_sample');
  }
  if (typed.some((item) => item._locale === 'ja-JP') && !byLocale['ja-JP']) {
    coverageErrors.push('missing_ja-JP_sample');
  }
  for (const definition of listCommentaryTypes()) {
    if (
      typed.some((item) => item._type === definition.type) &&
      !byType[definition.type]
    ) {
      coverageErrors.push(`missing_type_sample:${definition.type}`);
    }
  }

  return {
    sample: sample.map((item) => {
      const clone = { ...item };
      delete clone._index;
      delete clone._locale;
      delete clone._type;
      delete clone._chapter;
      delete clone._verse;
      delete clone._rank;
      return clone;
    }),
    sampleCount: sample.length,
    seed,
    distribution: { byLocale, byType },
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
  });

  const reviewRequiredCount = qaResults.filter(
    (item) => (item.structuralGrade || item.grade) === QA_GRADES.REVIEW_REQUIRED,
  ).length;
  const failCount = qaResults.filter(
    (item) => (item.structuralGrade || item.grade) === QA_GRADES.FAIL,
  ).length;

  let batchStatus = BATCH_STATUS.CANDIDATES_ONLY;
  if (mode === BATCH_APPROVAL_MODES.OFF) {
    batchStatus = BATCH_STATUS.DISABLED;
  } else if (
    failCount > 0 ||
    reviewRequiredCount > 0 ||
    sampleResult.error ||
    sampleResult.sampleCount === 0
  ) {
    // REVIEW_REQUIRED excludes auto-approval; any sample/coverage error blocks.
    if (failCount > 0 || sampleResult.error || sampleResult.sampleCount === 0) {
      batchStatus = BATCH_STATUS.BATCH_BLOCKED;
    } else {
      batchStatus = BATCH_STATUS.CANDIDATES_ONLY;
    }
  } else if (candidates.length) {
    batchStatus = BATCH_STATUS.READY;
  }

  // Explicit rule: one or more sample coverage errors => BATCH_BLOCKED
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
