/**
 * Cue generation strategy policy for commentary multilang pipeline v2.
 * Phase-1: decision helpers only — does not generate cues or call ffmpeg/TTS.
 */

export const CUE_STRATEGY_A = 'A_full_tts_silence_onset';
export const CUE_STRATEGY_B = 'B_per_card_tts_concat';
export const DEFAULT_CUE_STRATEGY = CUE_STRATEGY_A;

export const CUE_DECISION = Object.freeze({
  PRIMARY_ACCEPTED: 'PRIMARY_ACCEPTED',
  FALLBACK_REQUIRED: 'FALLBACK_REQUIRED',
  FALLBACK_ACCEPTED: 'FALLBACK_ACCEPTED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
});

export const MIN_SEGMENT_SECONDS = 0.5;

/**
 * Inspect a cue document fixture and decide whether strategy A is acceptable.
 */
export function evaluateCueDocumentPolicy(document, options = {}) {
  const cardCount = Number(options.cardCount);
  const durationSeconds = Number(options.durationSeconds);
  const reasons = [];

  if (!document || typeof document !== 'object') {
    return {
      decision: CUE_DECISION.FALLBACK_REQUIRED,
      code: 'cue_document_missing',
      reasons: ['cue_document_missing'],
    };
  }

  const segments = Array.isArray(document.segments) ? document.segments : null;
  if (!segments) {
    return {
      decision: CUE_DECISION.FALLBACK_REQUIRED,
      code: 'segments_missing',
      reasons: ['segments_missing'],
    };
  }

  const itemSegments = segments.filter((segment) => segment?.type === 'item');
  if (Number.isInteger(cardCount) && cardCount > 0) {
    if (itemSegments.length < cardCount) {
      reasons.push('segment_count_too_low');
    } else if (itemSegments.length > cardCount) {
      reasons.push('segment_count_too_high');
    }
  }

  let previousStart = -Infinity;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] || {};
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      reasons.push(`non_finite_times@${i}`);
      continue;
    }
    if (start < previousStart) {
      reasons.push('start_out_of_order');
    }
    previousStart = start;
    if (end <= start) {
      reasons.push('end_lte_start');
    }
    if (end - start < MIN_SEGMENT_SECONDS) {
      reasons.push('segment_too_short');
    }
    if (Number.isFinite(durationSeconds) && end > durationSeconds + 1e-6) {
      reasons.push('end_exceeds_duration');
    }
  }

  if (reasons.length) {
    return {
      decision: CUE_DECISION.FALLBACK_REQUIRED,
      code: reasons[0],
      reasons: [...new Set(reasons)],
    };
  }

  return {
    decision: CUE_DECISION.PRIMARY_ACCEPTED,
    code: 'ok',
    reasons: [],
  };
}

/**
 * Prefer strategy A. Fall back to B only when A is classified as failed/unstable.
 */
export function selectCueStrategy(options = {}) {
  const preferred = options.preferred || DEFAULT_CUE_STRATEGY;
  const allowFallbackB = options.allowFallbackB !== false;
  const aFailure = options.strategyAFailure || null;
  const bResult = options.strategyBResult || null;

  if (preferred !== CUE_STRATEGY_A && preferred !== CUE_STRATEGY_B) {
    throw new Error(`Unsupported cue strategy: ${preferred}`);
  }

  if (preferred === CUE_STRATEGY_B) {
    return {
      strategy: CUE_STRATEGY_B,
      fallbackUsed: false,
      decision: CUE_DECISION.FALLBACK_REQUIRED,
      reason: 'explicit_preferred_B',
      executeInPhase1: false,
    };
  }

  if (!aFailure) {
    return {
      strategy: CUE_STRATEGY_A,
      fallbackUsed: false,
      decision: CUE_DECISION.PRIMARY_ACCEPTED,
      reason: 'default_A',
      executeInPhase1: false,
    };
  }

  const retryableA = new Set([
    'silence_boundary_not_found',
    'segment_duration_rule_failed',
    'boundary_distance_exceeded',
    'cue_validation_failed',
    'segment_count_too_low',
    'segment_count_too_high',
    'start_out_of_order',
    'end_lte_start',
    'end_exceeds_duration',
    'segment_too_short',
    'segments_missing',
  ]);

  const code = String(aFailure.code || aFailure.reason || '');
  if (!(allowFallbackB && retryableA.has(code))) {
    return {
      strategy: CUE_STRATEGY_A,
      fallbackUsed: false,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      reason: code ? `A_failed_no_fallback:${code}` : 'A_failed_unknown',
      executeInPhase1: false,
      aFailure,
    };
  }

  if (bResult && bResult.ok === true) {
    return {
      strategy: CUE_STRATEGY_B,
      fallbackUsed: true,
      decision: CUE_DECISION.FALLBACK_ACCEPTED,
      reason: `fallback_B_success_after_A:${code}`,
      executeInPhase1: false,
      aFailure,
      bResult,
    };
  }

  if (bResult && bResult.ok === false) {
    return {
      strategy: CUE_STRATEGY_B,
      fallbackUsed: true,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      reason: `fallback_B_failed_after_A:${code}`,
      executeInPhase1: false,
      aFailure,
      bResult,
    };
  }

  return {
    strategy: CUE_STRATEGY_B,
    fallbackUsed: true,
    decision: CUE_DECISION.FALLBACK_REQUIRED,
    reason: `fallback_after_A:${code}`,
    executeInPhase1: false,
    aFailure,
  };
}

export function describeCueStrategyPolicy() {
  return {
    defaultStrategy: DEFAULT_CUE_STRATEGY,
    fallbackStrategy: CUE_STRATEGY_B,
    phase1Execution: false,
    decisions: CUE_DECISION,
    notes: [
      'Strategy A matches commentary-multilang-cue.mjs silence-onset path.',
      'Strategy B is reserved for per-card TTS concat when A boundaries fail.',
      'Phase-1 only records the selected strategy; it does not generate cues.',
    ],
  };
}
