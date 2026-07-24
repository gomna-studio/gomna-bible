/**
 * Commentary multilang v2 audio + cue staging helpers.
 * Writes only under /tmp staging roots. Never touches ops audio/v1 or audio/cues.
 * Network TTS requires an injected request function gated by the caller.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  atomicCreateMp3,
  buildPresetTtsInstructions,
  createEmptyAudioCounters,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_AUDIO_RESPONSE_FORMAT,
  DEFAULT_AUDIO_VOICE,
  OPENAI_SPEECH_URL,
  probeMp3DurationSeconds,
  requestCommentaryMp3,
  resolveCommentaryTtsConfig,
  validateMp3File,
} from './commentary-multilang-audio.mjs';
import {
  atomicCreateCueFile,
  buildCommentaryCueDocument,
  buildNarrationSpeechUnits,
  calculateExpectedBoundaries,
  detectFinishedMp3Silences,
  planCueBoundaries,
  validateCommentaryCueDocument,
} from './commentary-multilang-cue.mjs';
import {
  CUE_DECISION,
  CUE_STRATEGY_A,
  CUE_STRATEGY_B,
  evaluateCueDocumentPolicy,
  selectCueStrategy,
} from './commentary-multilang-cue-policy.mjs';
import { getCommentaryVoicePreset } from './commentary-type-registry.mjs';
import {
  buildAudioPath,
  buildCuePath,
  buildNarrationMetaPath,
  buildNarrationPath,
} from './commentary-multilang-registry.mjs';
import { createApiCallBudget } from './commentary-multilang-translation-budget.mjs';
import {
  assertStagingPath,
  evaluateTranslationResultQa,
} from './commentary-multilang-translation-io.mjs';
import {
  buildStagedNarrationArtifacts,
} from './commentary-multilang-narration-stage.mjs';
import { sha256Bytes, sha256Text } from './commentary-multilang-translation.mjs';

export { CUE_DECISION, CUE_STRATEGY_A, CUE_STRATEGY_B };

const fsExistsSync = fs.existsSync.bind(fs);
const fsMkdirSync = fs.mkdirSync.bind(fs);
const fsReadFileSync = fs.readFileSync.bind(fs);
const fsWriteFileSync = fs.writeFileSync.bind(fs);
const fsUnlinkSync = fs.unlinkSync.bind(fs);
const fsRmSync = fs.rmSync.bind(fs);

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
 * Keep only translation QA PASS targets for audio/cue staging.
 * SOURCE_REVIEW_REQUIRED and other non-PASS grades are excluded.
 */
export function classifyAudioEligibleTargets(jobs, results, options = {}) {
  const resultById = new Map(
    (results || []).map((item) => {
      const value = item?.value || item;
      return [value.targetId, value];
    }),
  );

  const eligible = [];
  const excluded = [];

  for (const job of jobs || []) {
    const result = resultById.get(job.targetId);
    if (!result) {
      excluded.push({
        job,
        targetId: job.targetId,
        grade: 'FAIL',
        reason: 'missing_translation_result',
        status: 'audio-excluded-non-pass',
      });
      continue;
    }
    const qa = evaluateTranslationResultQa(job, result, options);
    if (qa.translationGrade === 'PASS') {
      eligible.push({ job, result, qa });
      continue;
    }
    excluded.push({
      job,
      targetId: job.targetId,
      grade: qa.translationGrade,
      reasons: qa.reasons || [],
      reason:
        qa.translationGrade === 'SOURCE_REVIEW_REQUIRED'
          ? 'source_review_required'
          : `translation_grade_${qa.translationGrade}`,
      status:
        qa.translationGrade === 'SOURCE_REVIEW_REQUIRED'
          ? 'audio-excluded-source-review'
          : 'audio-excluded-non-pass',
    });
  }

  return {
    eligible,
    excluded,
    eligibleCount: eligible.length,
    excludedCount: excluded.length,
    sourceReviewExcluded: excluded.filter(
      (item) => item.grade === 'SOURCE_REVIEW_REQUIRED',
    ),
  };
}

export function buildAudioCueStagingTarget(job, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-audio'),
    'stagingRoot',
  );
  const voicePreset =
    job.voicePreset || getCommentaryVoicePreset(job.type);
  const audioPath = buildAudioPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
    voicePreset,
  );
  const cuePath = buildCuePath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );
  const narrationPath = buildNarrationPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );
  const metaPath = buildNarrationMetaPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );

  return {
    targetId: job.targetId,
    audioId: job.audioId,
    bookId: job.bookId,
    chapter: job.chapter,
    verse: job.verse,
    type: job.type,
    commentaryType: job.type,
    locale: job.locale,
    cardCount: job.cardCount,
    cardIdentities: job.cardIdentities,
    sourceHash: job.sourceHash,
    voicePreset,
    narrationPath,
    metaPath,
    audioPath,
    cuePath,
    stagingRoot,
    narrationAbs: path.join(stagingRoot, narrationPath),
    metaAbs: path.join(stagingRoot, metaPath),
    audioAbs: path.join(stagingRoot, audioPath),
    cueAbs: path.join(stagingRoot, cuePath),
  };
}

/**
 * Stage draft narration/meta for PASS targets under stagingRoot.
 * Never writes approved status. Never writes into the repository.
 */
export function stagePassNarrationForAudio(job, result, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-audio'),
    'stagingRoot',
  );
  const artifacts = buildStagedNarrationArtifacts(job, result, options);
  if (!artifacts.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      reasons: artifacts.reasons || ['artifact_build_failed'],
    };
  }

  const narrationAbs = path.join(stagingRoot, artifacts.narrationRelativePath);
  const metaAbs = path.join(stagingRoot, artifacts.metaRelativePath);
  fsMkdirSync(path.dirname(narrationAbs), { recursive: true });
  fsMkdirSync(path.dirname(metaAbs), { recursive: true });

  if (!fsExistsSync(narrationAbs)) {
    fsWriteFileSync(narrationAbs, artifacts.narrationText, 'utf8');
  } else {
    const existing = fsReadFileSync(narrationAbs, 'utf8');
    if (sha256Text(existing) !== sha256Text(artifacts.narrationText)) {
      return {
        ok: false,
        targetId: job.targetId,
        reasons: [
          'staged_narration_exists_with_different_hash (refusing overwrite)',
        ],
      };
    }
  }

  if (!fsExistsSync(metaAbs)) {
    fsWriteFileSync(metaAbs, artifacts.metadataJson, 'utf8');
  }

  const metadata = artifacts.metadata;
  if (metadata.status === 'approved') {
    return {
      ok: false,
      targetId: job.targetId,
      reasons: ['refusing_approved_status_in_staging'],
    };
  }

  return {
    ok: true,
    targetId: job.targetId,
    stagingRoot,
    narrationAbs,
    metaAbs,
    narrationText: artifacts.narrationText,
    metadata,
    status: metadata.status,
  };
}

/**
 * Staging-mode narration validation (draft allowed; ops approved not required).
 */
export function validateStagedNarrationForAudio(target, options = {}) {
  const narrationAbs = target.narrationAbs;
  const metaAbs = target.metaAbs;
  if (!fsExistsSync(narrationAbs)) {
    return { ok: false, reason: `missing staged narration: ${target.narrationPath}` };
  }
  if (!fsExistsSync(metaAbs)) {
    return { ok: false, reason: `missing staged metadata: ${target.metaPath}` };
  }

  let metadata;
  try {
    metadata = JSON.parse(fsReadFileSync(metaAbs, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `malformed staged metadata: ${error.message}` };
  }

  if (metadata.status === 'approved') {
    return {
      ok: false,
      reason: 'staged metadata must not carry approved status in v2 audio stage',
    };
  }
  if (metadata.status !== 'draft') {
    return {
      ok: false,
      reason: `unexpected staged status=${metadata.status || 'missing'}`,
    };
  }

  const narrationText = fsReadFileSync(narrationAbs, 'utf8');
  if (!String(narrationText || '').trim()) {
    return { ok: false, reason: 'staged narration is empty' };
  }

  const narrationHash = sha256Text(narrationText);
  if (metadata.narrationHash && metadata.narrationHash !== narrationHash) {
    return {
      ok: false,
      reason: `narrationHash mismatch stored=${metadata.narrationHash} current=${narrationHash}`,
    };
  }

  if (Number(metadata.cardCount) !== Number(target.cardCount)) {
    return {
      ok: false,
      reason: `cardCount metadata=${metadata.cardCount} target=${target.cardCount}`,
    };
  }

  let speechUnits;
  try {
    const probe = buildNarrationSpeechUnits(narrationText, target.cardCount, {
      type: target.type,
      includeClosing: false,
    });
    const hasClosingInText = (() => {
      try {
        const withClosing = buildNarrationSpeechUnits(
          narrationText,
          target.cardCount,
          { type: target.type },
        );
        return withClosing.some((unit) => unit.kind === 'closing');
      } catch {
        return false;
      }
    })();
    speechUnits = hasClosingInText
      ? buildNarrationSpeechUnits(narrationText, target.cardCount, {
          type: target.type,
        })
      : probe;
  } catch (error) {
    return { ok: false, reason: error.message };
  }

  let ttsConfig;
  try {
    ttsConfig = resolveCommentaryTtsConfig({
      locale: target.locale,
      type: target.type,
      voicePreset: target.voicePreset,
      narrationText,
      cardCount: target.cardCount,
    });
  } catch (error) {
    // Some PASS original-language narrations paraphrase without leading
    // Hebrew transliterations. Fall back to study base instructions so
    // staging TTS can still proceed; cue validation remains independent.
    if (String(target.type) !== 'original-language') {
      return { ok: false, reason: error.message };
    }
    ttsConfig = {
      locale: target.locale,
      type: target.type,
      endpoint: OPENAI_SPEECH_URL,
      model: DEFAULT_AUDIO_MODEL,
      voice: DEFAULT_AUDIO_VOICE,
      responseFormat: DEFAULT_AUDIO_RESPONSE_FORMAT,
      voicePreset: 'study',
      instructions: buildPresetTtsInstructions(target.locale, 'study', {
        type: 'history',
      }),
      pronunciationTerms: [],
      pronunciationFallback: error.message,
    };
  }

  return {
    ok: true,
    narrationText,
    metadata,
    speechUnits,
    ttsConfig,
    requireClosing: speechUnits.some((unit) => unit.kind === 'closing'),
  };
}

/**
 * Request one TTS attempt while consuming the shared API call budget.
 */
export async function requestTtsWithBudget({
  budget,
  apiKey,
  narrationText,
  ttsConfig,
  fetchImpl,
  counters,
  requestFn = requestCommentaryMp3,
} = {}) {
  if (!budget || typeof budget.tryConsume !== 'function') {
    throw new Error('budget is required for TTS');
  }
  if (!budget.tryConsume(1)) {
    const error = new Error(
      `max-api-calls exceeded: consumed=${budget.consumed} max=${budget.max}`,
    );
    error.code = 'max_api_calls_exceeded';
    error.retryable = false;
    return { ok: false, error: error.message, code: error.code, attempts: 0 };
  }

  const speech = await requestFn({
    apiKey,
    narrationText,
    ttsConfig,
    fetchImpl,
    maxAttempts: 1,
    counters,
  });
  return speech;
}

export async function synthesizeFullNarrationMp3(options = {}) {
  const {
    target,
    validated,
    budget,
    apiKey,
    fetchImpl,
    counters = createEmptyAudioCounters(),
    maxAttempts = 2,
    requestFn,
    existsSync = fsExistsSync,
    createMp3 = atomicCreateMp3,
    validateMp3 = validateMp3File,
  } = options;

  if (existsSync(target.audioAbs)) {
    const existing = validateMp3(target.audioAbs);
    if (existing.ok) {
      return {
        ok: true,
        skippedExisting: true,
        mp3Path: target.audioAbs,
        byteSize: existing.byteSize,
        duration: existing.duration,
        sha256: existing.sha256,
        apiCalls: 0,
      };
    }
    return {
      ok: false,
      error: `existing staged MP3 invalid: ${existing.reason}`,
      apiCalls: 0,
    };
  }

  const attempts = Number(maxAttempts) > 0 ? Number(maxAttempts) : 2;
  let lastError = null;
  let apiCalls = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const speech = await requestTtsWithBudget({
      budget,
      apiKey,
      narrationText: validated.narrationText,
      ttsConfig: validated.ttsConfig,
      fetchImpl,
      counters,
      requestFn,
    });
    apiCalls += 1;
    if (!speech.ok) {
      lastError = speech.error || 'tts_failed';
      if (speech.code === 'max_api_calls_exceeded') {
        return {
          ok: false,
          error: speech.error,
          code: speech.code,
          apiCalls,
        };
      }
      continue;
    }

    try {
      const published = createMp3({
        mp3Path: target.audioAbs,
        audioBytes: speech.audioBytes,
        model: speech.model,
        voice: speech.voice,
        voicePreset: speech.voicePreset,
        apiAttempts: attempt,
        probeMp3DurationSeconds:
          options.probeMp3DurationSeconds || probeMp3DurationSeconds,
      });
      counters.successfulTargets += 1;
      return {
        ok: true,
        skippedExisting: false,
        mp3Path: published.mp3Path,
        byteSize: published.byteSize,
        duration: published.duration,
        sha256: published.sha256,
        apiCalls,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error.message;
    }
  }

  counters.failedTargets += 1;
  return {
    ok: false,
    error: lastError || 'tts_failed',
    apiCalls,
  };
}

function mapSelectionFailureCode(selection) {
  const action = String(selection?.action || '');
  const reason = String(selection?.reason || '');
  if (action.includes('silence') || reason.includes('silence')) {
    return 'silence_boundary_not_found';
  }
  if (action.includes('duration') || reason.includes('duration')) {
    return 'segment_duration_rule_failed';
  }
  if (action.includes('boundary') || reason.includes('boundary')) {
    return 'boundary_distance_exceeded';
  }
  if (action.includes('segment_count') || reason.includes('segment count')) {
    return 'segment_count_too_low';
  }
  return action || reason || 'cue_validation_failed';
}

/**
 * Strategy A: silence/onset cue planning on a finished full-narration MP3.
 */
export function generateCueStrategyA({
  target,
  durationSeconds,
  speechUnits,
  silence = null,
  ffmpegBin,
  detectSilences = detectFinishedMp3Silences,
  requireClosing = null,
} = {}) {
  const closingRequired =
    requireClosing != null
      ? !!requireClosing
      : speechUnits.some((unit) => unit.kind === 'closing');
  let silenceResult = silence;
  if (!silenceResult) {
    try {
      silenceResult = detectSilences(target.audioAbs, {
        durationSeconds,
        ffmpegBin,
      });
    } catch (error) {
      return {
        ok: false,
        strategy: CUE_STRATEGY_A,
        code: 'silence_boundary_not_found',
        reason: error.message,
      };
    }
  }

  let expected;
  try {
    expected = calculateExpectedBoundaries(speechUnits, durationSeconds);
  } catch (error) {
    return {
      ok: false,
      strategy: CUE_STRATEGY_A,
      code: 'cue_validation_failed',
      reason: error.message,
    };
  }

  const selected = planCueBoundaries({
    silence: silenceResult,
    expectedBoundaries: expected.expectedBoundaries,
    durationSeconds,
    speechUnits,
  });

  if (!selected.ok) {
    return {
      ok: false,
      strategy: CUE_STRATEGY_A,
      code: mapSelectionFailureCode(selected),
      reason: selected.reason || selected.action,
      selection: selected,
      silence: silenceResult,
      expected,
    };
  }

  let document;
  try {
    document = buildCommentaryCueDocument({
      target,
      durationSeconds,
      selectedBoundaries: selected.selectedBoundaries,
      speechUnits,
    });
  } catch (error) {
    return {
      ok: false,
      strategy: CUE_STRATEGY_A,
      code: 'cue_validation_failed',
      reason: error.message,
      selection: selected,
    };
  }

  const validation = validateCommentaryCueDocument(document, {
    target,
    durationSeconds,
    cardCount: target.cardCount,
    type: target.type,
    requireClosing: closingRequired,
  });
  if (!validation.ok) {
    return {
      ok: false,
      strategy: CUE_STRATEGY_A,
      code: 'cue_validation_failed',
      reason: validation.reason,
      document,
      selection: selected,
    };
  }

  const policy = evaluateCueDocumentPolicy(document, {
    cardCount: target.cardCount,
    durationSeconds,
  });
  if (policy.decision !== CUE_DECISION.PRIMARY_ACCEPTED) {
    return {
      ok: false,
      strategy: CUE_STRATEGY_A,
      code: policy.code || 'cue_validation_failed',
      reason: (policy.reasons || []).join('; ') || policy.code,
      document,
      policy,
    };
  }

  return {
    ok: true,
    strategy: CUE_STRATEGY_A,
    decision: CUE_DECISION.PRIMARY_ACCEPTED,
    document,
    selection: selected,
    silence: silenceResult,
    expected,
    policy,
    requireClosing: closingRequired,
  };
}

/**
 * Concatenate ordered MP3 parts into one file via ffmpeg.
 */
export function concatMp3Parts(partPaths, outputPath, options = {}) {
  const ffmpegBin = options.ffmpegBin || 'ffmpeg';
  const spawn = options.spawnSync || spawnSync;
  if (!Array.isArray(partPaths) || partPaths.length < 1) {
    throw new Error('partPaths must be a non-empty array');
  }
  fsMkdirSync(path.dirname(outputPath), { recursive: true });

  const inputs = [];
  const args = ['-y'];
  for (const part of partPaths) {
    args.push('-i', part);
    inputs.push(`[${inputs.length}:a]`);
  }
  const filter = `${inputs.join('')}concat=n=${partPaths.length}:v=0:a=1[aout]`;
  args.push('-filter_complex', filter, '-map', '[aout]', '-c:a', 'libmp3lame', outputPath);

  const result = spawn(ffmpegBin, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg concat failed: ${(result.stderr || result.stdout || '').trim().slice(0, 400)}`,
    );
  }
  return outputPath;
}

/**
 * Build cue document from measured per-unit durations (strategy B).
 */
export function buildCueDocumentFromUnitDurations({
  target,
  speechUnits,
  unitDurations,
} = {}) {
  if (!Array.isArray(speechUnits) || !speechUnits.length) {
    throw new Error('speechUnits required');
  }
  if (!Array.isArray(unitDurations) || unitDurations.length !== speechUnits.length) {
    throw new Error('unitDurations length must match speechUnits');
  }

  let cursor = 0;
  const segments = speechUnits.map((unit, index) => {
    const start = roundCueTime(cursor);
    const duration = Number(unitDurations[index]);
    if (!(duration > 0)) {
      throw new Error(`non-positive unit duration at index ${index}`);
    }
    cursor += duration;
    return {
      type: unit.kind === 'item' ? 'item' : unit.kind,
      itemIndex: unit.itemIndex,
      start,
      end: roundCueTime(cursor),
    };
  });

  const durationSeconds = normalizeDurationField(cursor);
  segments[segments.length - 1].end = durationSeconds;

  return {
    audioId: target.audioId,
    duration: durationSeconds,
    measuredDuration: durationSeconds,
    testAudioPath: target.audioPath,
    finalMp3Duration: durationSeconds,
    segments,
  };
}

/**
 * Strategy B: per-speech-unit TTS → measure → concat → cumulative cue.
 */
export async function generateCueStrategyB(options = {}) {
  const {
    target,
    speechUnits,
    ttsConfig,
    budget,
    apiKey,
    fetchImpl,
    counters = createEmptyAudioCounters(),
    requestFn,
    probeDuration = probeMp3DurationSeconds,
    concatParts = concatMp3Parts,
    createMp3 = atomicCreateMp3,
    workDir = null,
  } = options;

  const dir =
    workDir ||
    path.join(path.dirname(target.audioAbs), `.cue-b-${path.basename(target.audioAbs, '.mp3')}`);
  fsMkdirSync(dir, { recursive: true });

  const partPaths = [];
  const unitDurations = [];
  let apiCalls = 0;

  try {
    for (let index = 0; index < speechUnits.length; index += 1) {
      const unit = speechUnits[index];
      const partPath = path.join(dir, `unit-${String(index).padStart(2, '0')}.mp3`);
      const speech = await requestTtsWithBudget({
        budget,
        apiKey,
        narrationText: unit.text,
        ttsConfig,
        fetchImpl,
        counters,
        requestFn,
      });
      apiCalls += 1;
      if (!speech.ok) {
        return {
          ok: false,
          strategy: CUE_STRATEGY_B,
          code: speech.code || 'tts_failed',
          reason: speech.error || 'unit_tts_failed',
          apiCalls,
        };
      }
      fsWriteFileSync(partPath, speech.audioBytes);
      const duration = probeDuration(partPath);
      if (!(duration > 0)) {
        return {
          ok: false,
          strategy: CUE_STRATEGY_B,
          code: 'invalid_unit_duration',
          reason: `unit ${index} duration invalid`,
          apiCalls,
        };
      }
      partPaths.push(partPath);
      unitDurations.push(duration);
    }

    const concatTmp = path.join(dir, 'concat.mp3');
    concatParts(partPaths, concatTmp);
    const concatValidation = validateMp3File(concatTmp);
    if (!concatValidation.ok) {
      return {
        ok: false,
        strategy: CUE_STRATEGY_B,
        code: 'concat_invalid',
        reason: concatValidation.reason,
        apiCalls,
      };
    }

    if (fsExistsSync(target.audioAbs)) {
      fsUnlinkSync(target.audioAbs);
    }
    const published = createMp3({
      mp3Path: target.audioAbs,
      audioBytes: fsReadFileSync(concatTmp),
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      voicePreset: ttsConfig.voicePreset,
      probeMp3DurationSeconds: probeDuration,
    });

    const document = buildCueDocumentFromUnitDurations({
      target,
      speechUnits,
      unitDurations,
    });

    // Align duration fields to measured concat duration.
    document.duration = normalizeDurationField(published.duration);
    document.measuredDuration = document.duration;
    document.finalMp3Duration = document.duration;
    document.segments[document.segments.length - 1].end = document.duration;

    const closingRequired = speechUnits.some((unit) => unit.kind === 'closing');
    const validation = validateCommentaryCueDocument(document, {
      target,
      durationSeconds: published.duration,
      cardCount: target.cardCount,
      type: target.type,
      requireClosing: closingRequired,
    });
    if (!validation.ok) {
      return {
        ok: false,
        strategy: CUE_STRATEGY_B,
        code: 'cue_validation_failed',
        reason: validation.reason,
        document,
        apiCalls,
      };
    }

    const policy = evaluateCueDocumentPolicy(document, {
      cardCount: target.cardCount,
      durationSeconds: published.duration,
    });
    if (policy.decision === CUE_DECISION.FALLBACK_REQUIRED) {
      return {
        ok: false,
        strategy: CUE_STRATEGY_B,
        code: policy.code || 'cue_validation_failed',
        reason: (policy.reasons || []).join('; '),
        document,
        apiCalls,
      };
    }

    return {
      ok: true,
      strategy: CUE_STRATEGY_B,
      decision: CUE_DECISION.FALLBACK_ACCEPTED,
      document,
      duration: published.duration,
      byteSize: published.byteSize,
      sha256: published.sha256,
      apiCalls,
      unitDurations,
      requireClosing: closingRequired,
    };
  } finally {
    try {
      fsRmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

export function writeStagedCueFile(
  target,
  document,
  durationSeconds,
  options = {},
) {
  const requireClosing =
    options.requireClosing != null
      ? !!options.requireClosing
      : document.segments?.some((segment) => segment.type === 'closing');
  if (fsExistsSync(target.cueAbs)) {
    const existing = JSON.parse(fsReadFileSync(target.cueAbs, 'utf8'));
    const validation = validateCommentaryCueDocument(existing, {
      target,
      durationSeconds,
      cardCount: target.cardCount,
      type: target.type,
      requireClosing,
    });
    if (validation.ok) {
      return {
        ok: true,
        skippedExisting: true,
        cuePath: target.cueAbs,
        document: existing,
      };
    }
    return {
      ok: false,
      error: `existing staged cue invalid: ${validation.reason}`,
    };
  }

  const published = atomicCreateCueFile({
    cuePath: target.cueAbs,
    document,
    target,
    durationSeconds,
    cardCount: target.cardCount,
    type: target.type,
    requireClosing,
  });
  return {
    ok: true,
    skippedExisting: false,
    cuePath: published.cuePath,
    byteSize: published.byteSize,
    document,
  };
}

/**
 * End-to-end audio+cue for one PASS target under staging.
 */
export async function processAudioCueTarget(options = {}) {
  const {
    job,
    result,
    stagingRoot,
    budget,
    apiKey,
    fetchImpl,
    executeNetwork = false,
    counters = createEmptyAudioCounters(),
    requestFn,
    allowFallbackB = true,
    runStrategyA = generateCueStrategyA,
    runStrategyB = generateCueStrategyB,
  } = options;

  const target = buildAudioCueStagingTarget(job, { stagingRoot });
  const staged = stagePassNarrationForAudio(job, result, { stagingRoot });
  if (!staged.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: staged.reasons,
      apiCalls: 0,
      target,
    };
  }

  const validated = validateStagedNarrationForAudio(target);
  if (!validated.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: [validated.reason],
      apiCalls: 0,
      target,
    };
  }

  if (!executeNetwork) {
    return {
      ok: true,
      dryRun: true,
      targetId: job.targetId,
      decision: null,
      status: 'audio-preflight',
      apiCalls: 0,
      target,
      speechUnitCount: validated.speechUnits.length,
    };
  }

  let apiCalls = 0;
  const tts = await synthesizeFullNarrationMp3({
    target,
    validated,
    budget,
    apiKey,
    fetchImpl,
    counters,
    requestFn,
  });
  apiCalls += tts.apiCalls || 0;
  if (!tts.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: [tts.error || 'tts_failed'],
      code: tts.code || null,
      apiCalls,
      target,
    };
  }

  const strategyA = await runStrategyA({
    target,
    durationSeconds: tts.duration,
    speechUnits: validated.speechUnits,
    requireClosing: validated.requireClosing,
  });

  if (strategyA.ok) {
    const written = writeStagedCueFile(
      target,
      strategyA.document,
      tts.duration,
      { requireClosing: validated.requireClosing },
    );
    if (!written.ok) {
      return {
        ok: false,
        targetId: job.targetId,
        decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
        status: 'audio-cue-manual-review',
        reasons: [written.error],
        apiCalls,
        target,
      };
    }
    return {
      ok: true,
      targetId: job.targetId,
      decision: CUE_DECISION.PRIMARY_ACCEPTED,
      status: 'audio-cue-primary-accepted',
      strategy: CUE_STRATEGY_A,
      apiCalls,
      target,
      mp3: {
        path: target.audioAbs,
        byteSize: tts.byteSize,
        duration: tts.duration,
        sha256: tts.sha256,
        skippedExisting: !!tts.skippedExisting,
      },
      cue: {
        path: target.cueAbs,
        skippedExisting: !!written.skippedExisting,
      },
      resumeComplete: true,
    };
  }

  const strategySelect = selectCueStrategy({
    strategyAFailure: {
      code: strategyA.code,
      reason: strategyA.reason,
    },
    allowFallbackB,
  });

  if (strategySelect.decision === CUE_DECISION.MANUAL_REVIEW_REQUIRED) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: [strategyA.reason || strategySelect.reason],
      strategyA,
      apiCalls,
      target,
    };
  }

  const strategyB = await runStrategyB({
    target,
    speechUnits: validated.speechUnits,
    ttsConfig: validated.ttsConfig,
    budget,
    apiKey,
    fetchImpl,
    counters,
    requestFn,
  });
  apiCalls += strategyB.apiCalls || 0;

  const finalSelect = selectCueStrategy({
    strategyAFailure: {
      code: strategyA.code,
      reason: strategyA.reason,
    },
    allowFallbackB,
    strategyBResult: { ok: !!strategyB.ok, reason: strategyB.reason },
  });

  if (!strategyB.ok || finalSelect.decision !== CUE_DECISION.FALLBACK_ACCEPTED) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: [strategyB.reason || strategyA.reason || finalSelect.reason],
      strategyA,
      strategyB,
      apiCalls,
      target,
    };
  }

  const written = writeStagedCueFile(
    target,
    strategyB.document,
    strategyB.duration,
    {
      requireClosing:
        strategyB.requireClosing != null
          ? strategyB.requireClosing
          : validated.requireClosing,
    },
  );
  if (!written.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      decision: CUE_DECISION.MANUAL_REVIEW_REQUIRED,
      status: 'audio-cue-manual-review',
      reasons: [written.error],
      apiCalls,
      target,
    };
  }

  return {
    ok: true,
    targetId: job.targetId,
    decision: CUE_DECISION.FALLBACK_ACCEPTED,
    status: 'audio-cue-fallback-accepted',
    strategy: CUE_STRATEGY_B,
    apiCalls,
    target,
    mp3: {
      path: target.audioAbs,
      byteSize: strategyB.byteSize,
      duration: strategyB.duration,
      sha256: strategyB.sha256,
      skippedExisting: false,
    },
    cue: {
      path: target.cueAbs,
      skippedExisting: !!written.skippedExisting,
    },
    strategyA,
    resumeComplete: true,
  };
}

export function verifyStagedAudioCue(target, options = {}) {
  const validateMp3 = options.validateMp3File || validateMp3File;
  const probe = options.probeMp3DurationSeconds || probeMp3DurationSeconds;

  if (!fsExistsSync(target.audioAbs)) {
    return { ok: false, reasons: [`missing mp3: ${target.audioPath}`] };
  }
  if (!fsExistsSync(target.cueAbs)) {
    return { ok: false, reasons: [`missing cue: ${target.cuePath}`] };
  }

  const mp3 = validateMp3(target.audioAbs, {
    probeMp3DurationSeconds: probe,
  });
  if (!mp3.ok) {
    return { ok: false, reasons: [mp3.reason] };
  }
  if (!(mp3.byteSize > 0) || !(mp3.duration > 0)) {
    return { ok: false, reasons: ['mp3 size/duration not positive'] };
  }

  let document;
  try {
    document = JSON.parse(fsReadFileSync(target.cueAbs, 'utf8'));
  } catch (error) {
    return { ok: false, reasons: [`cue parse failed: ${error.message}`] };
  }

  const validation = validateCommentaryCueDocument(document, {
    target,
    durationSeconds: mp3.duration,
    cardCount: target.cardCount,
    type: target.type,
    requireClosing: document.segments.some((segment) => segment.type === 'closing'),
  });
  if (!validation.ok) {
    return { ok: false, reasons: [validation.reason], document, mp3 };
  }

  const policy = evaluateCueDocumentPolicy(document, {
    cardCount: target.cardCount,
    durationSeconds: mp3.duration,
  });
  if (
    policy.decision !== CUE_DECISION.PRIMARY_ACCEPTED &&
    policy.decision !== CUE_DECISION.FALLBACK_ACCEPTED
  ) {
    // evaluateCueDocumentPolicy returns PRIMARY_ACCEPTED or FALLBACK_REQUIRED.
    if (policy.decision === CUE_DECISION.FALLBACK_REQUIRED) {
      return {
        ok: false,
        reasons: policy.reasons,
        document,
        mp3,
        policy,
      };
    }
  }

  const itemCount = document.segments.filter((s) => s.type === 'item').length;
  if (itemCount !== Number(target.cardCount)) {
    return {
      ok: false,
      reasons: [`item count ${itemCount} != cardCount ${target.cardCount}`],
    };
  }

  return {
    ok: true,
    mp3,
    document,
    policy,
    itemCount,
  };
}

/**
 * Run audio+cue staging for many PASS targets with shared budget/checkpoint hooks.
 */
export async function runAudioCueStagingBatch(options = {}) {
  const {
    eligible,
    stagingRoot,
    maxApiCalls = 0,
    executeNetwork = false,
    apiKey = null,
    fetchImpl = null,
    concurrency = 1,
    requestFn,
    onTargetComplete = null,
    runStrategyA,
    runStrategyB,
  } = options;

  assertStagingPath(stagingRoot, 'stagingRoot');
  const budget = createApiCallBudget(maxApiCalls);
  const counters = createEmptyAudioCounters();
  counters.plannedTargets = eligible.length;

  const results = [];
  const queue = eligible.slice();
  const workers = Math.max(1, Number(concurrency) || 1);

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      counters.attemptedTargets += 1;
      const outcome = await processAudioCueTarget({
        job: item.job,
        result: item.result,
        stagingRoot,
        budget,
        apiKey,
        fetchImpl,
        executeNetwork,
        counters,
        requestFn,
        runStrategyA: options.runStrategyA,
        runStrategyB: options.runStrategyB,
      });
      results.push(outcome);
      if (typeof onTargetComplete === 'function') {
        onTargetComplete(outcome);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));

  const primary = results.filter(
    (item) => item.decision === CUE_DECISION.PRIMARY_ACCEPTED,
  ).length;
  const fallback = results.filter(
    (item) => item.decision === CUE_DECISION.FALLBACK_ACCEPTED,
  ).length;
  const manual = results.filter(
    (item) => item.decision === CUE_DECISION.MANUAL_REVIEW_REQUIRED,
  ).length;

  return {
    ok: manual === 0 && results.every((item) => item.ok || item.dryRun),
    results,
    counters,
    budget: {
      max: budget.max,
      consumed: budget.consumed,
      remaining: budget.remaining,
    },
    summary: {
      primaryAccepted: primary,
      fallbackAccepted: fallback,
      manualReviewRequired: manual,
      total: results.length,
      apiCalls: budget.consumed,
    },
  };
}

export function createMockTtsRequestHandler(options = {}) {
  const {
    bytesForText = null,
    failCodes = [],
    failOnceKeys = new Set(),
  } = options;
  let calls = 0;
  const callLog = [];

  return {
    get calls() {
      return calls;
    },
    get callLog() {
      return callLog.slice();
    },
    async request({ narrationText, ttsConfig, counters } = {}) {
      calls += 1;
      if (counters) counters.totalApiCalls += 1;
      const key = String(narrationText || '').slice(0, 80);
      callLog.push({ key, model: ttsConfig?.model });
      if (failCodes.includes(calls) || failOnceKeys.has(key)) {
        failOnceKeys.delete(key);
        return { ok: false, error: 'mock_tts_failed', attempts: 1 };
      }
      let audioBytes;
      if (typeof bytesForText === 'function') {
        audioBytes = await bytesForText(narrationText, ttsConfig);
      } else if (Buffer.isBuffer(bytesForText)) {
        audioBytes = bytesForText;
      } else {
        throw new Error('mock TTS requires bytesForText Buffer or function');
      }
      return {
        ok: true,
        audioBytes,
        model: ttsConfig?.model || 'mock-tts',
        voice: ttsConfig?.voice || 'marin',
        voicePreset: ttsConfig?.voicePreset || 'study',
        attempts: 1,
      };
    },
  };
}

export async function makeSilentMp3Bytes(durationSeconds = 1.2, options = {}) {
  const ffmpegBin = options.ffmpegBin || 'ffmpeg';
  const tmpDir = options.tmpDir || assertStagingPath(
    path.join('/tmp', `gomna-silent-mp3-${Date.now()}`),
    'tmpDir',
  );
  fsMkdirSync(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `silent-${durationSeconds}.mp3`);
  const result = spawnSync(
    ffmpegBin,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=24000:cl=mono`,
      '-t',
      String(durationSeconds),
      '-q:a',
      '9',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `failed to synthesize silent mp3: ${(result.stderr || '').slice(0, 300)}`,
    );
  }
  const bytes = fsReadFileSync(out);
  try {
    fsRmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  return bytes;
}

export { sha256Bytes, createEmptyAudioCounters };
