/**
 * Multilingual commentary Cue helpers.
 * Import-side-effect free. Writes occur only when the caller invokes them.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  probeMp3DurationSeconds,
  validateApprovedNarrationTarget,
  validateMp3File,
} from './commentary-multilang-audio.mjs';
import {
  getCommentaryType,
  getCueSegmentPolicy,
} from './commentary-type-registry.mjs';
import {
  buildNarrationStructureSignature,
  parseNarrationStructure,
} from './commentary-multilang-translation.mjs';

export const SILENCE_DETECT_FILTER_PRIMARY = 'silencedetect=noise=-30dB:d=0.45';
export const SILENCE_DETECT_FILTER_SUPPLEMENTAL =
  'silencedetect=noise=-30dB:d=0.25';
/** @deprecated Use SILENCE_DETECT_FILTER_PRIMARY */
export const SILENCE_DETECT_FILTER = SILENCE_DETECT_FILTER_PRIMARY;

export const MIN_CARD_SEGMENT_DURATION_SECONDS = 4.0;
/** @deprecated Alias of MIN_CARD_SEGMENT_DURATION_SECONDS */
export const MIN_SEGMENT_DURATION_SECONDS = MIN_CARD_SEGMENT_DURATION_SECONDS;
export const MIN_EDGE_SEGMENT_DURATION_SECONDS = 0.5;
export const MAX_BOUNDARY_DISTANCE_SECONDS = 2.0;
export const REQUIRED_CUE_FLAG = '1';

export const CANDIDATE_SOURCE_PRIMARY = 'primary_0.45';
export const CANDIDATE_SOURCE_SUPPLEMENTAL = 'supplemental_0.25';
export const STRATEGY_PRIMARY = 'primary_0.45';
export const STRATEGY_FALLBACK = 'fallback_0.25';
export const STRATEGY_NONE = 'none';

const REJECTED_TARGET_LOCALES = new Set(['ko', 'ko-KR']);
const ALLOWED_CUE_LOCALES = new Set(['en-US', 'ja-JP']);

const fsExistsSync = fs.existsSync.bind(fs);
const fsMkdirSync = fs.mkdirSync.bind(fs);
const fsOpenSync = fs.openSync.bind(fs);
const fsWriteFileSync = fs.writeFileSync.bind(fs);
const fsCloseSync = fs.closeSync.bind(fs);
const fsReadFileSync = fs.readFileSync.bind(fs);
const fsLinkSync = fs.linkSync.bind(fs);
const fsUnlinkSync = fs.unlinkSync.bind(fs);

const SILENCE_START_RE = /silence_start:\s*([0-9]+(?:\.[0-9]+)?)/g;
const SILENCE_END_RE = /silence_end:\s*([0-9]+(?:\.[0-9]+)?)/g;
const SILENCE_DURATION_RE = /silence_duration:\s*([0-9]+(?:\.[0-9]+)?)/g;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function roundCueTime(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function normalizeDurationField(duration) {
  const rounded = roundCueTime(duration);
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return Math.round(rounded);
  }
  return rounded;
}

/**
 * Count meaningful spoken characters for expected-boundary weights.
 */
export function spokenCharacterWeight(text) {
  const normalized = String(text || '')
    .normalize('NFC')
    .trim();

  let compact = normalized.replace(/\s+/gu, '');
  compact = compact.replace(/[。、！？「」『』（）【】・…〜‥,.!?;:“”"]/gu, '');
  compact = compact.replace(/[()\[\]]/g, '');

  if (!compact.length) {
    throw new Error('speech unit has non-positive spoken-character weight');
  }

  return compact.length;
}

function pushSpeechUnit(units, kind, text, itemIndex = -1) {
  units.push({
    kind,
    itemIndex,
    text,
    weight: spokenCharacterWeight(text),
  });
}

/**
 * Build ordered speech units from approved narration.
 * Card boundaries come from approved metadata cardCount plus deterministic
 * narration structure matches — never from fixed paragraph-shape guesses like
 * "always 3 paragraphs" or "always 3 lines per Matthew Henry card".
 */
export function buildNarrationSpeechUnits(narrationText, cardCount, {
  type,
  includeClosing,
} = {}) {
  const paragraphs = parseNarrationStructure(narrationText);
  const signature = buildNarrationStructureSignature(paragraphs);
  const expectedCards = Number(cardCount);
  const policy = type ? getCueSegmentPolicy(type) : null;
  const paragraphsPerItem =
    type && getCommentaryType(type)?.paragraphsPerItem
      ? Number(getCommentaryType(type).paragraphsPerItem)
      : 1;
  const allOnes = signature.lineCounts.every((count) => count === 1);
  const paraCount = signature.paragraphCount;

  if (!Number.isFinite(expectedCards) || expectedCards < 1) {
    throw new Error(`cardCount must be >= 1, got ${cardCount}`);
  }

  let introText = null;
  let cardTexts = [];
  let bridgeTexts = [];
  let closingText = null;
  let matched = false;

  // Classic intro + packed card lines + closing: [1, cardCount, 1]
  if (
    paraCount === 3 &&
    signature.lineCounts[0] === 1 &&
    signature.lineCounts[2] === 1 &&
    signature.lineCounts[1] === expectedCards
  ) {
    introText = paragraphs[0][0];
    cardTexts = paragraphs[1].slice();
    closingText = paragraphs[2][0];
    matched = true;
  }

  // Hymn-only bridge form: intro + bridge + cards + closing (all single-line paragraphs)
  if (
    !matched &&
    type === 'hymn' &&
    policy?.allowBridge &&
    allOnes &&
    paraCount === expectedCards + 3
  ) {
    introText = paragraphs[0][0];
    bridgeTexts = [paragraphs[1][0]];
    cardTexts = paragraphs.slice(2, 2 + expectedCards).map((lines) => lines[0]);
    closingText = paragraphs[paragraphs.length - 1][0];
    matched = true;
  }

  // Packed intro + card lines: [1, cardCount]
  if (
    !matched &&
    paraCount === 2 &&
    signature.lineCounts[0] === 1 &&
    signature.lineCounts[1] === expectedCards
  ) {
    introText = paragraphs[0][0];
    cardTexts = paragraphs[1].slice();
    matched = true;
  }

  // Matthew Henry: preserve actual cardCount with variable lines / paragraph shapes
  if (!matched && type === 'matthew-henry' && policy?.allowMultiParagraphItems) {
    const linesPerCard = Number.isFinite(paragraphsPerItem) && paragraphsPerItem > 0
      ? paragraphsPerItem
      : 3;

    // Packed flat body: [1, cardCount * linesPerCard]
    if (
      paraCount === 2 &&
      signature.lineCounts[0] === 1 &&
      signature.lineCounts[1] === expectedCards * linesPerCard
    ) {
      introText = paragraphs[0][0];
      const lines = paragraphs[1];
      for (let index = 0; index < expectedCards; index += 1) {
        cardTexts.push(
          lines
            .slice(index * linesPerCard, (index + 1) * linesPerCard)
            .join('\n'),
        );
      }
      matched = true;
    }

    // One body paragraph per card (variable line counts), optional closing paragraph
    if (!matched && paraCount >= expectedCards + 1) {
      const body = paragraphs.slice(1);
      if (body.length === expectedCards || body.length === expectedCards + 1) {
        introText = paragraphs[0].join('\n');
        const cardParas =
          body.length === expectedCards + 1 ? body.slice(0, -1) : body;
        cardTexts = cardParas.map((lines) => lines.join('\n'));
        if (body.length === expectedCards + 1) {
          closingText = body[body.length - 1].join('\n');
        }
        matched = true;
      }
    }

    // Legacy multi-paragraph-per-card body (cardCount * linesPerCard paragraphs)
    if (!matched) {
      const body = paragraphs.slice(1);
      const block = expectedCards * linesPerCard;
      if (body.length === block || body.length === block + 1) {
        introText = paragraphs[0].join('\n');
        for (let index = 0; index < expectedCards; index += 1) {
          cardTexts.push(
            body
              .slice(index * linesPerCard, (index + 1) * linesPerCard)
              .map((lines) => lines.join('\n'))
              .join('\n'),
          );
        }
        if (body.length === block + 1) {
          closingText = body[body.length - 1].join('\n');
        }
        matched = true;
      }
    }
  }

  // All single-line paragraphs keyed by cardCount (+ optional intro/closing)
  if (!matched && allOnes) {
    if (paraCount === expectedCards + 2) {
      introText = paragraphs[0][0];
      cardTexts = paragraphs.slice(1, 1 + expectedCards).map((lines) => lines[0]);
      closingText = paragraphs[paragraphs.length - 1][0];
      matched = true;
    } else if (paraCount === expectedCards + 1) {
      introText = paragraphs[0][0];
      cardTexts = paragraphs.slice(1).map((lines) => lines[0]);
      matched = true;
    } else if (paraCount === expectedCards && !policy?.requireClosing) {
      // Cards-only (sermon / cross-reference): one paragraph per card, no intro/closing
      cardTexts = paragraphs.map((lines) => lines[0]);
      matched = true;
    }
  }

  if (!matched) {
    throw new Error(
      `unable to determine card boundaries from narration structure: ${JSON.stringify(signature.lineCounts)} (cardCount=${expectedCards})`,
    );
  }

  if (cardTexts.length !== expectedCards) {
    throw new Error(
      `card line count ${cardTexts.length} != cardCount ${expectedCards}`,
    );
  }

  const units = [];
  if (introText != null) {
    pushSpeechUnit(units, 'intro', introText);
  }

  for (const bridgeText of bridgeTexts) {
    pushSpeechUnit(units, 'bridge', bridgeText);
  }

  for (let index = 0; index < cardTexts.length; index += 1) {
    pushSpeechUnit(units, 'item', cardTexts[index], index);
  }

  // Closing only when present in the approved narration (and not explicitly disabled).
  // Explicit includeClosing:false overrides type policy.requireClosing so sources
  // without a closing paragraph (common for some original-language verses) can
  // still build intro+card speech units for staging audio/cue.
  if (closingText != null && includeClosing !== false) {
    pushSpeechUnit(units, 'closing', closingText);
  } else if (includeClosing === true) {
    throw new Error('closing speech unit required but missing from narration');
  } else if (
    policy?.requireClosing &&
    closingText == null &&
    includeClosing !== false
  ) {
    throw new Error(`type ${type} requires a closing speech unit`);
  }

  if (units.length < 2) {
    throw new Error('speechUnits must contain at least two units');
  }

  return units;
}

/** Optional scale for formulaic intro/bridge/closing expected-boundary weights. */
export const EDGE_EXPECTED_WEIGHT_SCALE = 0.5;

export function calculateExpectedBoundaries(
  speechUnits,
  durationSeconds,
  { edgeWeightScale = 1 } = {},
) {
  if (!Array.isArray(speechUnits) || speechUnits.length < 2) {
    throw new Error('speechUnits must contain at least two units');
  }
  if (!isFinitePositive(durationSeconds)) {
    throw new Error(`invalid duration: ${durationSeconds}`);
  }
  const scale = Number(edgeWeightScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`invalid edgeWeightScale=${edgeWeightScale}`);
  }

  const weights = speechUnits.map((unit) => {
    const weight = Number(unit.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error('every speech unit must have a positive weight');
    }
    if (
      scale !== 1 &&
      (unit.kind === 'intro' ||
        unit.kind === 'bridge' ||
        unit.kind === 'closing')
    ) {
      return weight * scale;
    }
    return weight;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const expected = [];
  let cumulative = 0;

  for (let index = 0; index < weights.length - 1; index += 1) {
    cumulative += weights[index];
    expected.push(durationSeconds * (cumulative / total));
  }

  return {
    weights,
    expectedBoundaries: expected,
    boundaryCount: expected.length,
    speechUnitCount: speechUnits.length,
    edgeWeightScale: scale,
  };
}

function collectMatches(regex, text) {
  const values = [];
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    values.push(Number(match[1]));
    match = regex.exec(text);
  }
  return values;
}

/**
 * Parse complete silence intervals from ffmpeg silencedetect stderr.
 */
export function parseSilenceIntervals(stderrText, durationSeconds, source) {
  const text = String(stderrText || '');
  const starts = collectMatches(SILENCE_START_RE, text);
  const ends = collectMatches(SILENCE_END_RE, text);
  const durations = collectMatches(SILENCE_DURATION_RE, text);
  const intervals = [];

  for (let index = 0; index < ends.length; index += 1) {
    const silenceEnd = ends[index];
    if (!Number.isFinite(silenceEnd) || Number.isNaN(silenceEnd)) continue;
    if (silenceEnd <= 0) continue;
    if (!(silenceEnd < durationSeconds)) continue;

    const silenceStart = Number.isFinite(starts[index]) ? starts[index] : null;
    let silenceDuration = Number.isFinite(durations[index])
      ? durations[index]
      : null;
    if (
      silenceDuration == null &&
      silenceStart != null &&
      Number.isFinite(silenceStart)
    ) {
      silenceDuration = silenceEnd - silenceStart;
    }

    intervals.push({
      silenceStart,
      silenceEnd,
      silenceDuration,
      source,
    });
  }

  return intervals;
}

/**
 * Deduplicate by silence_end. Prefer primary; keep longest silence duration.
 */
export function mergeSilenceCandidates(intervalLists) {
  const byEnd = new Map();

  for (const intervals of intervalLists) {
    for (const interval of intervals || []) {
      const key = String(roundCueTime(interval.silenceEnd));
      const existing = byEnd.get(key);
      if (!existing) {
        byEnd.set(key, { ...interval });
        continue;
      }

      const existingPrimary = existing.source === CANDIDATE_SOURCE_PRIMARY;
      const nextPrimary = interval.source === CANDIDATE_SOURCE_PRIMARY;
      if (nextPrimary && !existingPrimary) {
        existing.source = CANDIDATE_SOURCE_PRIMARY;
      }

      const existingDur = Number(existing.silenceDuration);
      const nextDur = Number(interval.silenceDuration);
      if (
        Number.isFinite(nextDur) &&
        (!Number.isFinite(existingDur) || nextDur > existingDur)
      ) {
        existing.silenceDuration = nextDur;
        if (interval.silenceStart != null) {
          existing.silenceStart = interval.silenceStart;
        }
      }
    }
  }

  return [...byEnd.values()].sort((a, b) => a.silenceEnd - b.silenceEnd);
}

/**
 * Backward-compatible silence_end list parser.
 */
export function parseSilenceEndCandidates(stderrText, durationSeconds) {
  return parseSilenceIntervals(
    stderrText,
    durationSeconds,
    CANDIDATE_SOURCE_PRIMARY,
  ).map((interval) => interval.silenceEnd);
}

function runSilenceDetect(absoluteMp3Path, filter, ffmpegBin) {
  return spawnSync(
    ffmpegBin || 'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      absoluteMp3Path,
      '-af',
      filter,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
}

/**
 * Run primary and supplemental finished-MP3 silence detection.
 */
export function detectFinishedMp3Silences(absoluteMp3Path, options = {}) {
  const duration =
    options.durationSeconds != null
      ? Number(options.durationSeconds)
      : probeMp3DurationSeconds(absoluteMp3Path);

  if (!isFinitePositive(duration)) {
    throw new Error(`invalid MP3 duration for silence detection: ${duration}`);
  }

  const ffmpegBin = options.ffmpegBin || 'ffmpeg';
  const primaryResult = runSilenceDetect(
    absoluteMp3Path,
    SILENCE_DETECT_FILTER_PRIMARY,
    ffmpegBin,
  );
  const supplementalResult = runSilenceDetect(
    absoluteMp3Path,
    SILENCE_DETECT_FILTER_SUPPLEMENTAL,
    ffmpegBin,
  );

  const primaryIntervals = parseSilenceIntervals(
    primaryResult.stderr,
    duration,
    CANDIDATE_SOURCE_PRIMARY,
  );
  const supplementalIntervals = parseSilenceIntervals(
    supplementalResult.stderr,
    duration,
    CANDIDATE_SOURCE_SUPPLEMENTAL,
  );
  const mergedCandidates = mergeSilenceCandidates([
    primaryIntervals,
    supplementalIntervals,
  ]);
  const primaryCandidates = mergedCandidates.filter(
    (candidate) => candidate.source === CANDIDATE_SOURCE_PRIMARY,
  );
  const supplementalOnlyCandidates = mergedCandidates.filter(
    (candidate) => candidate.source === CANDIDATE_SOURCE_SUPPLEMENTAL,
  );

  return {
    durationSeconds: duration,
    filter: SILENCE_DETECT_FILTER_PRIMARY,
    supplementalFilter: SILENCE_DETECT_FILTER_SUPPLEMENTAL,
    primaryIntervals,
    supplementalIntervals,
    primaryCandidates,
    supplementalOnlyCandidates,
    mergedCandidates,
    rawSilenceEndCandidates: primaryCandidates.map((c) => c.silenceEnd),
    candidateCount: primaryCandidates.length,
    primaryCandidateCount: primaryCandidates.length,
    supplementalOnlyCandidateCount: supplementalOnlyCandidates.length,
    ffmpegStatus: primaryResult.status,
  };
}

function normalizeCandidateList(candidates) {
  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((candidate) => {
      if (typeof candidate === 'number' || typeof candidate === 'string') {
        const silenceEnd = Number(candidate);
        return {
          silenceEnd,
          silenceStart: null,
          silenceDuration: null,
          source: CANDIDATE_SOURCE_PRIMARY,
        };
      }
      return {
        silenceEnd: Number(candidate.silenceEnd),
        silenceStart:
          candidate.silenceStart == null ? null : Number(candidate.silenceStart),
        silenceDuration:
          candidate.silenceDuration == null
            ? null
            : Number(candidate.silenceDuration),
        source: candidate.source || CANDIDATE_SOURCE_PRIMARY,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.silenceEnd))
    .sort((a, b) => a.silenceEnd - b.silenceEnd);
}

function minimumDurationForSpeechUnit(
  unit,
  {
    minCardDuration = MIN_CARD_SEGMENT_DURATION_SECONDS,
    minEdgeDuration = MIN_EDGE_SEGMENT_DURATION_SECONDS,
  } = {},
) {
  return unit?.kind === 'item' ? minCardDuration : minEdgeDuration;
}

/**
 * Validate intro/card/closing duration rules for a boundary plan.
 * When speechUnits are provided, each segment uses item vs edge minimums.
 */
export function validateSegmentDurationRules(
  selectedBoundaries,
  durationSeconds,
  {
    minCardDuration = MIN_CARD_SEGMENT_DURATION_SECONDS,
    minEdgeDuration = MIN_EDGE_SEGMENT_DURATION_SECONDS,
    speechUnits = null,
  } = {},
) {
  const points = [0, ...selectedBoundaries.map(Number), Number(durationSeconds)];
  if (points.length < 3) {
    return {
      ok: false,
      action: 'block_insufficient_silence_boundaries',
      reason: 'not enough segment points',
    };
  }

  for (let index = 1; index < points.length; index += 1) {
    if (!(points[index] > points[index - 1])) {
      return {
        ok: false,
        action: 'block_insufficient_silence_boundaries',
        reason: 'segment points are not strictly increasing',
        segmentDurations: [],
      };
    }
  }

  const segmentDurations = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segmentDurations.push(points[index + 1] - points[index]);
  }

  if (Array.isArray(speechUnits) && speechUnits.length === segmentDurations.length) {
    const cardDurations = [];
    let introDuration = null;
    let closingDuration = null;

    for (let index = 0; index < speechUnits.length; index += 1) {
      const unit = speechUnits[index];
      const duration = segmentDurations[index];
      const minimum = minimumDurationForSpeechUnit(unit, {
        minCardDuration,
        minEdgeDuration,
      });
      if (!(duration >= minimum - 1e-9)) {
        return {
          ok: false,
          action: 'block_minimum_segment_duration',
          reason: `${unit.kind} duration ${duration} < ${minimum}`,
          introDuration,
          cardDurations,
          closingDuration,
          segmentDurations,
          minimumCardDuration: cardDurations.length
            ? Math.min(...cardDurations)
            : null,
        };
      }
      if (unit.kind === 'intro') introDuration = duration;
      if (unit.kind === 'closing') closingDuration = duration;
      if (unit.kind === 'item') cardDurations.push(duration);
    }

    return {
      ok: true,
      introDuration,
      cardDurations,
      closingDuration,
      segmentDurations,
      minimumCardDuration: cardDurations.length
        ? Math.min(...cardDurations)
        : null,
    };
  }

  const introDuration = points[1] - points[0];
  const closingDuration = points[points.length - 1] - points[points.length - 2];
  const cardDurations = [];
  for (let index = 1; index < points.length - 2; index += 1) {
    cardDurations.push(points[index + 1] - points[index]);
  }

  if (!(introDuration >= minEdgeDuration - 1e-9)) {
    return {
      ok: false,
      action: 'block_minimum_segment_duration',
      reason: `intro duration ${introDuration} < ${minEdgeDuration}`,
      introDuration,
      cardDurations,
      closingDuration,
      segmentDurations,
      minimumCardDuration: cardDurations.length
        ? Math.min(...cardDurations)
        : null,
    };
  }

  if (!(closingDuration >= minEdgeDuration - 1e-9)) {
    return {
      ok: false,
      action: 'block_minimum_segment_duration',
      reason: `closing duration ${closingDuration} < ${minEdgeDuration}`,
      introDuration,
      cardDurations,
      closingDuration,
      segmentDurations,
      minimumCardDuration: cardDurations.length
        ? Math.min(...cardDurations)
        : null,
    };
  }

  for (let index = 0; index < cardDurations.length; index += 1) {
    if (!(cardDurations[index] >= minCardDuration - 1e-9)) {
      return {
        ok: false,
        action: 'block_minimum_segment_duration',
        reason: `card ${index + 1} duration ${cardDurations[index]} < ${minCardDuration}`,
        introDuration,
        cardDurations,
        closingDuration,
        segmentDurations,
        minimumCardDuration: Math.min(...cardDurations),
      };
    }
  }

  return {
    ok: true,
    introDuration,
    cardDurations,
    closingDuration,
    segmentDurations,
    minimumCardDuration: Math.min(...cardDurations),
  };
}

function comparePrimaryCost(a, b) {
  if (a.totalDistance !== b.totalDistance) {
    return a.totalDistance < b.totalDistance ? -1 : 1;
  }
  if (a.maxDistance !== b.maxDistance) {
    return a.maxDistance < b.maxDistance ? -1 : 1;
  }
  if (a.firstBoundary !== b.firstBoundary) {
    return a.firstBoundary < b.firstBoundary ? -1 : 1;
  }
  return 0;
}

function compareFallbackCost(a, b) {
  if (a.supplementalOnlyCount !== b.supplementalOnlyCount) {
    return a.supplementalOnlyCount < b.supplementalOnlyCount ? -1 : 1;
  }
  if (a.totalDistance !== b.totalDistance) {
    return a.totalDistance < b.totalDistance ? -1 : 1;
  }
  if (a.maxDistance !== b.maxDistance) {
    return a.maxDistance < b.maxDistance ? -1 : 1;
  }
  // Maximize minimum / total selected silence duration.
  if (a.minSilenceDuration !== b.minSilenceDuration) {
    return a.minSilenceDuration > b.minSilenceDuration ? -1 : 1;
  }
  if (a.totalSilenceDuration !== b.totalSilenceDuration) {
    return a.totalSilenceDuration > b.totalSilenceDuration ? -1 : 1;
  }
  if (a.firstBoundary !== b.firstBoundary) {
    return a.firstBoundary < b.firstBoundary ? -1 : 1;
  }
  return 0;
}

/**
 * Select ordered silence_end boundaries with dynamic programming.
 */
export function selectOrderedSilenceBoundaries({
  candidates,
  expectedBoundaries,
  durationSeconds,
  minCardDuration = MIN_CARD_SEGMENT_DURATION_SECONDS,
  minEdgeDuration = MIN_EDGE_SEGMENT_DURATION_SECONDS,
  maxBoundaryDistance = MAX_BOUNDARY_DISTANCE_SECONDS,
  optimizeFallback = false,
  speechUnits = null,
} = {}) {
  const expected = Array.isArray(expectedBoundaries)
    ? expectedBoundaries.map(Number)
    : [];
  const normalized = normalizeCandidateList(candidates);
  const unique = [];
  for (const candidate of normalized) {
    if (
      !unique.length ||
      unique[unique.length - 1].silenceEnd !== candidate.silenceEnd
    ) {
      unique.push(candidate);
    }
  }

  const boundaryCount = expected.length;
  if (boundaryCount < 1) {
    return {
      ok: false,
      action: 'block_insufficient_silence_boundaries',
      reason: 'expected boundary count must be >= 1',
      strategy: STRATEGY_NONE,
    };
  }

  if (unique.length < boundaryCount) {
    return {
      ok: false,
      action: 'block_insufficient_silence_boundaries',
      reason: `silence_end candidates ${unique.length} < required ${boundaryCount}`,
      candidates: unique.map((c) => c.silenceEnd),
      expectedBoundaries: expected,
      strategy: STRATEGY_NONE,
    };
  }

  if (!isFinitePositive(durationSeconds)) {
    return {
      ok: false,
      action: 'block_invalid_mp3',
      reason: `invalid durationSeconds=${durationSeconds}`,
      strategy: STRATEGY_NONE,
    };
  }

  const units =
    Array.isArray(speechUnits) && speechUnits.length === boundaryCount + 1
      ? speechUnits
      : null;
  const minFirst = units
    ? minimumDurationForSpeechUnit(units[0], { minCardDuration, minEdgeDuration })
    : minEdgeDuration;
  const minLast = units
    ? minimumDurationForSpeechUnit(units[units.length - 1], {
        minCardDuration,
        minEdgeDuration,
      })
    : minEdgeDuration;

  const infinity = Number.POSITIVE_INFINITY;
  const emptyCost = () => ({
    totalDistance: infinity,
    maxDistance: infinity,
    firstBoundary: infinity,
    supplementalOnlyCount: infinity,
    minSilenceDuration: -infinity,
    totalSilenceDuration: -infinity,
  });

  const costs = Array.from({ length: boundaryCount }, () =>
    Array.from({ length: unique.length }, emptyCost),
  );
  const previous = Array.from({ length: boundaryCount }, () =>
    Array.from({ length: unique.length }, () => -1),
  );
  const compare = optimizeFallback ? compareFallbackCost : comparePrimaryCost;

  for (let candidateIndex = 0; candidateIndex < unique.length; candidateIndex += 1) {
    const candidate = unique[candidateIndex];
    const boundary = candidate.silenceEnd;
    // First / last segment minimums depend on whether those units are cards or edges.
    if (boundary < minFirst) continue;
    if (durationSeconds - boundary < minLast) continue;

    const distance = Math.abs(boundary - expected[0]);
    // Only explore paths that can still satisfy the fixed 2.0s limit.
    if (distance > maxBoundaryDistance + 1e-9) continue;
    const silence = Number.isFinite(candidate.silenceDuration)
      ? candidate.silenceDuration
      : 0;
    costs[0][candidateIndex] = {
      totalDistance: distance,
      maxDistance: distance,
      firstBoundary: boundary,
      supplementalOnlyCount:
        candidate.source === CANDIDATE_SOURCE_SUPPLEMENTAL ? 1 : 0,
      minSilenceDuration: silence,
      totalSilenceDuration: silence,
    };
  }

  for (let boundaryIndex = 1; boundaryIndex < boundaryCount; boundaryIndex += 1) {
    const gapMinimum = units
      ? minimumDurationForSpeechUnit(units[boundaryIndex], {
          minCardDuration,
          minEdgeDuration,
        })
      : minCardDuration;

    for (
      let candidateIndex = 0;
      candidateIndex < unique.length;
      candidateIndex += 1
    ) {
      const currentCandidate = unique[candidateIndex];
      const current = currentCandidate.silenceEnd;
      if (durationSeconds - current < minLast) continue;

      for (let previousIndex = 0; previousIndex < candidateIndex; previousIndex += 1) {
        const previousCandidate = unique[previousIndex];
        const previousBoundary = previousCandidate.silenceEnd;
        // Gap between consecutive selected boundaries is the unit at boundaryIndex.
        if (current - previousBoundary < gapMinimum) continue;

        const previousCost = costs[boundaryIndex - 1][previousIndex];
        if (!Number.isFinite(previousCost.totalDistance)) continue;

        const distance = Math.abs(current - expected[boundaryIndex]);
        const nextMax = Math.max(previousCost.maxDistance, distance);
        if (nextMax > maxBoundaryDistance + 1e-9) continue;
        const silence = Number.isFinite(currentCandidate.silenceDuration)
          ? currentCandidate.silenceDuration
          : 0;
        const nextCost = {
          totalDistance: previousCost.totalDistance + distance,
          maxDistance: nextMax,
          firstBoundary: previousCost.firstBoundary,
          supplementalOnlyCount:
            previousCost.supplementalOnlyCount +
            (currentCandidate.source === CANDIDATE_SOURCE_SUPPLEMENTAL ? 1 : 0),
          minSilenceDuration: Math.min(previousCost.minSilenceDuration, silence),
          totalSilenceDuration: previousCost.totalSilenceDuration + silence,
        };

        if (compare(nextCost, costs[boundaryIndex][candidateIndex]) < 0) {
          costs[boundaryIndex][candidateIndex] = nextCost;
          previous[boundaryIndex][candidateIndex] = previousIndex;
        }
      }
    }
  }

  let bestIndex = -1;
  let bestCost = emptyCost();

  for (let candidateIndex = 0; candidateIndex < unique.length; candidateIndex += 1) {
    const boundary = unique[candidateIndex].silenceEnd;
    if (durationSeconds - boundary < minLast) continue;
    const cost = costs[boundaryCount - 1][candidateIndex];
    if (!Number.isFinite(cost.totalDistance)) continue;
    if (compare(cost, bestCost) < 0) {
      bestCost = cost;
      bestIndex = candidateIndex;
    }
  }

  if (bestIndex < 0) {
    return {
      ok: false,
      action: 'block_boundary_tolerance',
      reason: `no ordered ${boundaryCount}-boundary solution satisfies card/edge duration rules and max boundary distance ${maxBoundaryDistance}s`,
      candidates: unique.map((c) => c.silenceEnd),
      expectedBoundaries: expected,
      strategy: STRATEGY_NONE,
    };
  }

  const selectedIndexes = [bestIndex];
  for (let boundaryIndex = boundaryCount - 1; boundaryIndex > 0; boundaryIndex -= 1) {
    bestIndex = previous[boundaryIndex][bestIndex];
    if (bestIndex < 0) {
      return {
        ok: false,
        action: 'block_insufficient_silence_boundaries',
        reason: 'broken dynamic-programming backtrack',
        candidates: unique.map((c) => c.silenceEnd),
        expectedBoundaries: expected,
        strategy: STRATEGY_NONE,
      };
    }
    selectedIndexes.push(bestIndex);
  }
  selectedIndexes.reverse();

  const selectedCandidates = selectedIndexes.map((index) => unique[index]);
  const selectedBoundaries = selectedCandidates.map((c) => c.silenceEnd);
  const selectedSources = selectedCandidates.map((c) => c.source);
  const selectedSilenceDurations = selectedCandidates.map((c) =>
    Number.isFinite(c.silenceDuration) ? c.silenceDuration : null,
  );
  const boundaryDifferences = selectedBoundaries.map((boundary, index) =>
    Math.abs(boundary - expected[index]),
  );
  const maxDifference = Math.max(...boundaryDifferences);
  const supplementalOnlyCount = selectedSources.filter(
    (source) => source === CANDIDATE_SOURCE_SUPPLEMENTAL,
  ).length;

  const durationCheck = validateSegmentDurationRules(
    selectedBoundaries,
    durationSeconds,
    { minCardDuration, minEdgeDuration, speechUnits: units },
  );
  if (!durationCheck.ok) {
    return {
      ...durationCheck,
      selectedBoundaries,
      selectedSources,
      selectedSilenceDurations,
      expectedBoundaries: expected,
      boundaryDifferences,
      maxDifference,
      supplementalOnlyCount,
      strategy: STRATEGY_NONE,
    };
  }

  if (maxDifference > maxBoundaryDistance + 1e-9) {
    return {
      ...durationCheck,
      ok: false,
      action: 'block_boundary_tolerance',
      reason: `maximum boundary distance ${maxDifference} > ${maxBoundaryDistance}`,
      selectedBoundaries,
      selectedSources,
      selectedSilenceDurations,
      expectedBoundaries: expected,
      boundaryDifferences,
      maxDifference,
      supplementalOnlyCount,
      strategy: STRATEGY_NONE,
    };
  }

  return {
    ok: true,
    action: 'selected_silence_boundaries',
    selectedBoundaries,
    selectedSources,
    selectedSilenceDurations,
    expectedBoundaries: expected,
    boundaryDifferences,
    maxDifference,
    supplementalOnlyCount,
    totalDistance: bestCost.totalDistance,
    candidates: unique.map((c) => c.silenceEnd),
    richCandidates: unique,
    ...durationCheck,
  };
}

/**
 * Primary-first planning with controlled supplemental fallback.
 */
function planCueBoundariesForExpected({
  silence,
  expectedBoundaries,
  durationSeconds,
  speechUnits,
}) {
  const primaryPlan = selectOrderedSilenceBoundaries({
    candidates: silence.primaryCandidates,
    expectedBoundaries,
    durationSeconds,
    optimizeFallback: false,
    speechUnits,
  });

  if (primaryPlan.ok) {
    return {
      ...primaryPlan,
      strategy: STRATEGY_PRIMARY,
      fallbackRequired: false,
      primaryPlan,
      fallbackPlan: null,
    };
  }

  const fallbackPlan = selectOrderedSilenceBoundaries({
    candidates: silence.mergedCandidates,
    expectedBoundaries,
    durationSeconds,
    optimizeFallback: true,
    speechUnits,
  });

  if (fallbackPlan.ok) {
    return {
      ...fallbackPlan,
      strategy: STRATEGY_FALLBACK,
      fallbackRequired: true,
      primaryPlan,
      fallbackPlan,
    };
  }

  return {
    ...fallbackPlan,
    strategy: STRATEGY_NONE,
    fallbackRequired: true,
    primaryPlan,
    fallbackPlan,
  };
}

/**
 * Primary-first silence planning. If character-weight expectations fail the
 * fixed 2.0s rule, retry once with reduced intro/bridge/closing weights.
 */
export function planCueBoundaries({
  silence,
  expectedBoundaries,
  durationSeconds,
  speechUnits = null,
} = {}) {
  const primaryAttempt = planCueBoundariesForExpected({
    silence,
    expectedBoundaries,
    durationSeconds,
    speechUnits,
  });
  if (primaryAttempt.ok) {
    return primaryAttempt;
  }

  if (
    Array.isArray(speechUnits) &&
    speechUnits.some(
      (unit) =>
        unit.kind === 'intro' ||
        unit.kind === 'bridge' ||
        unit.kind === 'closing',
    )
  ) {
    try {
      const scaled = calculateExpectedBoundaries(speechUnits, durationSeconds, {
        edgeWeightScale: EDGE_EXPECTED_WEIGHT_SCALE,
      });
      const scaledAttempt = planCueBoundariesForExpected({
        silence,
        expectedBoundaries: scaled.expectedBoundaries,
        durationSeconds,
        speechUnits,
      });
      if (scaledAttempt.ok) {
        return {
          ...scaledAttempt,
          expectedWeightScale: EDGE_EXPECTED_WEIGHT_SCALE,
          primaryWeightPlan: primaryAttempt,
        };
      }
    } catch {
      // Keep the original character-weight failure below.
    }
  }

  return primaryAttempt;
}

export function buildCommentaryCueDocument({
  target,
  durationSeconds,
  selectedBoundaries,
  speechUnits,
} = {}) {
  const duration = normalizeDurationField(durationSeconds);
  const boundaries = selectedBoundaries.map((value) => roundCueTime(value));
  const points = [0, ...boundaries, duration];

  if (points.length !== speechUnits.length + 1) {
    throw new Error(
      `boundary/segment mismatch: points=${points.length} units=${speechUnits.length}`,
    );
  }

  const segments = speechUnits.map((unit, index) => ({
    type: unit.kind === 'item' ? 'item' : unit.kind,
    itemIndex: unit.itemIndex,
    start: points[index],
    end: points[index + 1],
  }));

  return {
    audioId: target.audioId,
    duration,
    measuredDuration: duration,
    testAudioPath: target.audioPath,
    finalMp3Duration: duration,
    segments,
  };
}

export function validateCommentaryCueDocument(document, {
  target,
  durationSeconds,
  cardCount,
  type,
  requireClosing,
  allowBridge,
} = {}) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { ok: false, reason: 'cue document must be an object' };
  }

  for (const key of [
    'audioId',
    'duration',
    'measuredDuration',
    'testAudioPath',
    'finalMp3Duration',
    'segments',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(document, key)) {
      return { ok: false, reason: `missing cue field: ${key}` };
    }
  }

  if (document.audioId !== target.audioId) {
    return {
      ok: false,
      reason: `audioId=${document.audioId} expected=${target.audioId}`,
    };
  }

  if (document.testAudioPath !== target.audioPath) {
    return {
      ok: false,
      reason: `testAudioPath=${document.testAudioPath} expected=${target.audioPath}`,
    };
  }

  if (
    String(document.testAudioPath).includes('\\') ||
    path.isAbsolute(String(document.testAudioPath)) ||
    String(document.testAudioPath).includes('ko-KR') ||
    String(document.testAudioPath).includes('/tmp')
  ) {
    return { ok: false, reason: 'cue path must be a relative non-Korean audio path' };
  }

  const expectedDuration = normalizeDurationField(durationSeconds);
  const durationTolerance = 0.05;
  for (const key of ['duration', 'measuredDuration', 'finalMp3Duration']) {
    if (!Number.isFinite(Number(document[key]))) {
      return { ok: false, reason: `${key} must be finite` };
    }
    if (Math.abs(Number(document[key]) - Number(durationSeconds)) > durationTolerance) {
      return {
        ok: false,
        reason: `${key}=${document[key]} does not match MP3 duration ${durationSeconds}`,
      };
    }
  }

  if (!Array.isArray(document.segments) || !document.segments.length) {
    return { ok: false, reason: 'segments must be a non-empty array' };
  }

  const commentaryType = String(type || target?.type || '').trim();
  let policy = null;
  if (commentaryType) {
    try {
      policy = getCueSegmentPolicy(commentaryType);
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  const bridgeAllowed =
    allowBridge != null ? !!allowBridge : !!(policy && policy.allowBridge);
  const closingRequired =
    requireClosing != null
      ? !!requireClosing
      : policy
        ? !!policy.requireClosing
        : true;

  const first = document.segments[0];
  const last = document.segments[document.segments.length - 1];
  if (first.type === 'intro') {
    if (first.itemIndex !== -1) {
      return { ok: false, reason: 'intro segment must use itemIndex -1' };
    }
  } else if (first.type === 'item') {
    if (first.itemIndex !== 0) {
      return {
        ok: false,
        reason: 'first card segment must use itemIndex 0 when intro is absent',
      };
    }
  } else {
    return {
      ok: false,
      reason: 'first segment must be intro or the first card item',
    };
  }
  if (Math.abs(Number(first.start) - 0) > 1e-9) {
    return { ok: false, reason: 'first segment must start at 0' };
  }
  if (Math.abs(Number(last.end) - Number(durationSeconds)) > durationTolerance) {
    return {
      ok: false,
      reason: `final end ${last.end} != MP3 duration ${durationSeconds}`,
    };
  }

  if (closingRequired) {
    if (last.type !== 'closing' || last.itemIndex !== -1) {
      return { ok: false, reason: 'last segment must be closing with itemIndex -1' };
    }
  } else if (last.type === 'closing' && last.itemIndex !== -1) {
    return { ok: false, reason: 'closing segment must use itemIndex -1' };
  } else if (last.type !== 'closing' && last.type !== 'item') {
    return {
      ok: false,
      reason: 'last segment must be closing or the final card item',
    };
  }

  let previousEnd = null;
  const seenItemIndexes = [];
  for (let index = 0; index < document.segments.length; index += 1) {
    const segment = document.segments[index];
    if (!segment || typeof segment !== 'object') {
      return { ok: false, reason: `segment ${index} invalid` };
    }
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      return { ok: false, reason: `segment ${index} has non-positive duration` };
    }
    if (previousEnd != null && Math.abs(start - previousEnd) > 1e-3) {
      return {
        ok: false,
        reason: `segment ${index} gap/overlap vs previous end ${previousEnd}`,
      };
    }
    previousEnd = end;

    const duration = end - start;

    if (segment.type === 'intro') {
      if (index !== 0) {
        return { ok: false, reason: 'intro segment must be first' };
      }
      if (segment.itemIndex !== -1) {
        return { ok: false, reason: 'intro segment must use itemIndex -1' };
      }
      if (!(duration >= MIN_EDGE_SEGMENT_DURATION_SECONDS - 1e-9)) {
        return {
          ok: false,
          reason: `intro duration ${duration} < ${MIN_EDGE_SEGMENT_DURATION_SECONDS}`,
        };
      }
      continue;
    }

    if (segment.type === 'bridge') {
      if (!bridgeAllowed) {
        return {
          ok: false,
          reason: `bridge segment not allowed for type ${commentaryType || 'unknown'}`,
        };
      }
      if (segment.itemIndex !== -1) {
        return { ok: false, reason: 'bridge segment must use itemIndex -1' };
      }
      if (!(duration >= MIN_EDGE_SEGMENT_DURATION_SECONDS - 1e-9)) {
        return {
          ok: false,
          reason: `bridge duration ${duration} < ${MIN_EDGE_SEGMENT_DURATION_SECONDS}`,
        };
      }
      continue;
    }

    if (segment.type === 'closing') {
      if (index !== document.segments.length - 1) {
        return { ok: false, reason: 'closing segment must be final' };
      }
      if (segment.itemIndex !== -1) {
        return { ok: false, reason: 'closing segment must use itemIndex -1' };
      }
      if (!(duration >= MIN_EDGE_SEGMENT_DURATION_SECONDS - 1e-9)) {
        return {
          ok: false,
          reason: `closing duration ${duration} < ${MIN_EDGE_SEGMENT_DURATION_SECONDS}`,
        };
      }
      continue;
    }

    if (segment.type !== 'item') {
      return { ok: false, reason: `segment ${index} type must be item` };
    }
    if (!Number.isInteger(segment.itemIndex) || segment.itemIndex < 0) {
      return {
        ok: false,
        reason: `segment ${index} itemIndex must be a non-negative integer`,
      };
    }
    seenItemIndexes.push(segment.itemIndex);
    if (!(duration >= MIN_CARD_SEGMENT_DURATION_SECONDS - 1e-9)) {
      return {
        ok: false,
        reason: `card ${segment.itemIndex + 1} duration ${duration} < ${MIN_CARD_SEGMENT_DURATION_SECONDS}`,
      };
    }
  }

  const expectedCount = Number(cardCount);
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    return { ok: false, reason: `invalid cardCount: ${cardCount}` };
  }

  if (seenItemIndexes.length !== expectedCount) {
    return {
      ok: false,
      reason: `card itemIndex count ${seenItemIndexes.length} != cardCount ${expectedCount}`,
    };
  }

  for (let expected = 0; expected < expectedCount; expected += 1) {
    const matches = seenItemIndexes.filter((value) => value === expected);
    if (matches.length === 0) {
      return { ok: false, reason: `missing itemIndex ${expected}` };
    }
    if (matches.length > 1) {
      return { ok: false, reason: `duplicate itemIndex ${expected}` };
    }
    if (seenItemIndexes[expected] !== expected) {
      return {
        ok: false,
        reason: `item indexes out of source order at position ${expected}`,
      };
    }
  }

  const maxSeen = Math.max(...seenItemIndexes);
  if (maxSeen !== expectedCount - 1) {
    return {
      ok: false,
      reason: `extra or incomplete itemIndex range: max=${maxSeen} expected=${expectedCount - 1}`,
    };
  }

  return {
    ok: true,
    reason: 'cue document valid',
    expectedDuration,
  };
}

function assertCuePathAllowed(cuePath, locale) {
  const normalized = String(cuePath || '').replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) {
    throw new Error(`Cue path must be relative: ${cuePath}`);
  }
  if (locale === 'en-US' && !normalized.startsWith('audio/cues/en-US/')) {
    throw new Error(`Cue path must resolve under audio/cues/en-US/**: ${cuePath}`);
  }
  if (locale === 'ja-JP' && !normalized.startsWith('audio/cues/ja-JP/')) {
    throw new Error(`Cue path must resolve under audio/cues/ja-JP/**: ${cuePath}`);
  }
  if (normalized.includes('ko-KR') || normalized.includes('/ko/')) {
    throw new Error(`Korean Cue paths are rejected: ${cuePath}`);
  }
}

export function validateCueTargetInputs({
  target,
  root,
  toAbsolute,
  analyzeAudio = true,
  ffmpegBin,
} = {}) {
  const abs =
    typeof toAbsolute === 'function'
      ? toAbsolute
      : (relativePath) => path.join(root, relativePath);

  const locale = String(target?.locale || '').trim();
  if (REJECTED_TARGET_LOCALES.has(locale) || !ALLOWED_CUE_LOCALES.has(locale)) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: `unsupported cue locale: ${locale || 'missing'}`,
    };
  }

  try {
    assertCuePathAllowed(target.cuePath, locale);
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: error.message,
    };
  }

  const validated = validateApprovedNarrationTarget({
    target,
    toAbsolute: abs,
  });
  if (!validated.ok) {
    return {
      ok: false,
      action: validated.action,
      reason: validated.reason,
    };
  }

  const audioAbs = abs(target.audioPath);
  if (!fsExistsSync(audioAbs)) {
    return {
      ok: false,
      action: 'block_missing_mp3',
      reason: `missing MP3: ${target.audioPath}`,
    };
  }

  const mp3 = validateMp3File(audioAbs);
  if (!mp3.ok) {
    return {
      ok: false,
      action: 'block_invalid_mp3',
      reason: mp3.reason,
    };
  }

  let speechUnits;
  try {
    speechUnits = buildNarrationSpeechUnits(
      validated.narrationText,
      target.cardCount,
      { type: target.type },
    );
  } catch (error) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: error.message,
    };
  }

  const cueAbs = abs(target.cuePath);
  const existingCue = fsExistsSync(cueAbs)
    ? (() => {
        try {
          return {
            exists: true,
            data: JSON.parse(fsReadFileSync(cueAbs, 'utf8')),
            error: null,
          };
        } catch (error) {
          return {
            exists: true,
            data: null,
            error: error.message,
          };
        }
      })()
    : { exists: false, data: null, error: null };

  if (existingCue.exists) {
    if (existingCue.error || !existingCue.data) {
      return {
        ok: false,
        action: 'block_invalid_existing_cue',
        reason: existingCue.error || 'existing cue unreadable',
        mp3,
        speechUnits,
      };
    }

    const existingValidation = validateCommentaryCueDocument(existingCue.data, {
      target,
      durationSeconds: mp3.duration,
      cardCount: target.cardCount,
      type: target.type,
    });

    if (!existingValidation.ok) {
      return {
        ok: false,
        action: 'block_invalid_existing_cue',
        reason: existingValidation.reason,
        mp3,
        speechUnits,
        existingCue: existingCue.data,
      };
    }

    let silence = null;
    let expected = null;
    let selection = null;
    if (analyzeAudio) {
      try {
        silence = detectFinishedMp3Silences(audioAbs, {
          durationSeconds: mp3.duration,
          ffmpegBin,
        });
        expected = calculateExpectedBoundaries(speechUnits, mp3.duration);
        selection = planCueBoundaries({
          silence,
          expectedBoundaries: expected.expectedBoundaries,
          durationSeconds: mp3.duration,
          speechUnits,
        });
      } catch (error) {
        return {
          ok: false,
          action: 'block_invalid_mp3',
          reason: error.message,
          mp3,
          speechUnits,
          existingCue: existingCue.data,
        };
      }

      if (selection?.ok) {
        const committedBoundaries = existingCue.data.segments
          .slice(0, -1)
          .map((segment) => Number(segment.end));
        const recomputed = selection.selectedBoundaries.map(Number);
        const materialConflict = committedBoundaries.some(
          (boundary, index) =>
            Math.abs(boundary - recomputed[index]) > 0.05,
        );
        if (materialConflict) {
          return {
            ok: false,
            action: 'block_invalid_existing_cue',
            reason: `recomputed boundaries materially conflict with committed Cue: committed=${JSON.stringify(committedBoundaries)} recomputed=${JSON.stringify(recomputed)}`,
            mp3,
            speechUnits,
            silence,
            expected,
            selection,
            existingCue: existingCue.data,
          };
        }
      } else if (selection && !selection.ok) {
        return {
          ok: true,
          action: 'skip_existing_verified',
          reason: `existing Cue validates; recomputed plan blocked: ${selection.action} (${selection.reason})`,
          mp3,
          speechUnits,
          silence,
          expected,
          selection,
          existingCue: existingCue.data,
          validated,
        };
      }
    }

    return {
      ok: true,
      action: 'skip_existing_verified',
      reason: 'existing Cue validates against MP3 and narration',
      mp3,
      speechUnits,
      silence,
      expected,
      selection,
      existingCue: existingCue.data,
      validated,
    };
  }

  if (!analyzeAudio) {
    return {
      ok: true,
      action: 'planned_generate_cue',
      reason: 'inputs valid; audio analysis deferred',
      mp3,
      speechUnits,
      validated,
    };
  }

  let silence;
  try {
    silence = detectFinishedMp3Silences(audioAbs, {
      durationSeconds: mp3.duration,
      ffmpegBin,
    });
  } catch (error) {
    return {
      ok: false,
      action: 'block_invalid_mp3',
      reason: error.message,
      mp3,
      speechUnits,
    };
  }

  let expected;
  try {
    expected = calculateExpectedBoundaries(speechUnits, mp3.duration);
  } catch (error) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: error.message,
      mp3,
      speechUnits,
      silence,
    };
  }

  const selected = planCueBoundaries({
    silence,
    expectedBoundaries: expected.expectedBoundaries,
    durationSeconds: mp3.duration,
    speechUnits,
  });

  if (!selected.ok) {
    return {
      ok: false,
      action: selected.action,
      reason: selected.reason,
      mp3,
      speechUnits,
      silence,
      expected,
      selection: selected,
    };
  }

  let cueDocument;
  try {
    cueDocument = buildCommentaryCueDocument({
      target,
      durationSeconds: mp3.duration,
      selectedBoundaries: selected.selectedBoundaries,
      speechUnits,
    });
  } catch (error) {
    return {
      ok: false,
      action: 'block_invalid_metadata',
      reason: error.message,
      mp3,
      speechUnits,
      silence,
      expected,
      selection: selected,
    };
  }

  const documentValidation = validateCommentaryCueDocument(cueDocument, {
    target,
    durationSeconds: mp3.duration,
    cardCount: target.cardCount,
    type: target.type,
  });
  if (!documentValidation.ok) {
    return {
      ok: false,
      action: 'block_invalid_existing_cue',
      reason: documentValidation.reason,
      mp3,
      speechUnits,
      silence,
      expected,
      selection: selected,
      cueDocument,
    };
  }

  return {
    ok: true,
    action: 'planned_generate_cue',
    reason: `finished MP3 silence plan accepted (${selected.strategy})`,
    mp3,
    speechUnits,
    silence,
    expected,
    selection: selected,
    cueDocument,
    validated,
  };
}

export function atomicCreateCueFile(options = {}) {
  const cuePath = String(options.cuePath || '').trim();
  const document = options.document;

  if (!cuePath) throw new Error('cuePath is required');
  if (!document || typeof document !== 'object') {
    throw new Error('document is required');
  }

  const existsSync = options.existsSync || fsExistsSync;
  const mkdirSync = options.mkdirSync || fsMkdirSync;
  const openSync = options.openSync || fsOpenSync;
  const writeFileSync = options.writeFileSync || fsWriteFileSync;
  const closeSync = options.closeSync || fsCloseSync;
  const readFileSync = options.readFileSync || fsReadFileSync;
  const linkSync = options.linkSync || fsLinkSync;
  const unlinkSync = options.unlinkSync || fsUnlinkSync;

  if (existsSync(cuePath)) {
    throw new Error(`Cue path already exists: ${cuePath}`);
  }

  mkdirSync(path.dirname(cuePath), { recursive: true });

  const cueTmp = `${cuePath}.cue-tmp`;
  if (existsSync(cueTmp)) {
    throw new Error(`temporary Cue path already exists: ${cueTmp}`);
  }

  const payload = `${JSON.stringify(document, null, 2)}\n`;

  const cleanupTemp = () => {
    try {
      if (existsSync(cueTmp)) unlinkSync(cueTmp);
    } catch {
      // ignore cleanup errors
    }
  };

  try {
    const fd = openSync(cueTmp, 'wx');
    try {
      writeFileSync(fd, payload, 'utf8');
    } finally {
      closeSync(fd);
    }

    const raw = readFileSync(cueTmp, 'utf8');
    if (!raw.endsWith('\n')) {
      throw new Error('temporary Cue missing final newline');
    }
    const parsed = JSON.parse(raw);
    const validation = validateCommentaryCueDocument(parsed, {
      target: options.target,
      durationSeconds: options.durationSeconds,
      cardCount: options.cardCount,
      type: options.target?.type || options.type,
      requireClosing: options.requireClosing,
      allowBridge: options.allowBridge,
    });
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    if (existsSync(cuePath)) {
      throw new Error(`Cue path already exists: ${cuePath}`);
    }

    try {
      linkSync(cueTmp, cuePath);
    } catch (error) {
      if (existsSync(cuePath)) {
        throw new Error(`Cue path already exists: ${cuePath}`);
      }
      throw error;
    }
  } catch (error) {
    cleanupTemp();
    throw error;
  }

  cleanupTemp();

  return {
    ok: true,
    cuePath,
    byteSize: Buffer.byteLength(payload, 'utf8'),
  };
}

export function createEmptyCueCounters() {
  return {
    plannedTargets: 0,
    attemptedTargets: 0,
    successfulTargets: 0,
    failedTargets: 0,
    skippedExistingTargets: 0,
  };
}

export {
  probeMp3DurationSeconds,
  validateApprovedNarrationTarget,
  validateMp3File,
};
