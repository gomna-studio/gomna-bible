import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CUE_DECISION,
  CUE_STRATEGY_A,
  CUE_STRATEGY_B,
  buildAudioCueStagingTarget,
  buildCueDocumentFromUnitDurations,
  classifyAudioEligibleTargets,
  createMockTtsRequestHandler,
  makeSilentMp3Bytes,
  processAudioCueTarget,
  requestTtsWithBudget,
  runAudioCueStagingBatch,
  verifyStagedAudioCue,
} from '../lib/commentary-multilang-audio-cue-stage.mjs';
import { createApiCallBudget } from '../lib/commentary-multilang-translation-budget.mjs';
import {
  createEmptyCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from '../lib/commentary-multilang-checkpoint.mjs';
import { buildCommentaryMultilangRangeTargets } from '../lib/commentary-multilang-targets.mjs';
import {
  buildTranslationJobs,
  evaluateTranslationResultQa,
} from '../lib/commentary-multilang-translation-io.mjs';
import { buildNarrationSpeechUnits } from '../lib/commentary-multilang-cue.mjs';

function mkStaging() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-audio-cue-stage-'));
}

function loadJobResultPair({ type = 'history', locale = 'en-US' } = {}) {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:21',
    to: '1:21',
    locales: locale,
    types: type,
  });
  const jobs = buildTranslationJobs(plan.targets).jobs;
  const job = jobs[0];
  // Build a synthetic PASS-shaped result from the Korean source structure
  // by using the job's own source as a stand-in only for classification tests;
  // for process tests we use real repair19 results when available.
  return { job, jobs, plan };
}

function loadRealPassPair(type = 'history', locale = 'en-US') {
  const resultsPath =
    '/tmp/gomna-commentary-v2-phase3-real-genesis-1-11-31-repair19/results.jsonl';
  if (!fs.existsSync(resultsPath)) {
    return null;
  }
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:21',
    to: '1:21',
    locales: locale,
    types: type,
  });
  const job = buildTranslationJobs(plan.targets).jobs[0];
  const line = fs
    .readFileSync(resultsPath, 'utf8')
    .trim()
    .split('\n')
    .map((row) => JSON.parse(row))
    .find((row) => row.targetId === job.targetId);
  if (!line) return null;
  const qa = evaluateTranslationResultQa(job, line);
  if (qa.translationGrade !== 'PASS') return null;
  return { job, result: line, qa };
}

function makePrimaryDocument(target, speechUnits, durationSeconds) {
  const slot = durationSeconds / speechUnits.length;
  let cursor = 0;
  const segments = speechUnits.map((unit) => {
    const start = cursor;
    const end = cursor + slot;
    cursor = end;
    return {
      type: unit.kind === 'item' ? 'item' : unit.kind,
      itemIndex: unit.itemIndex,
      start,
      end,
    };
  });
  // Ensure card segments meet 4s minimum by using a long duration.
  return {
    audioId: target.audioId,
    duration: durationSeconds,
    measuredDuration: durationSeconds,
    testAudioPath: target.audioPath,
    finalMp3Duration: durationSeconds,
    segments,
  };
}

test('classifyAudioEligibleTargets keeps PASS and excludes SOURCE_REVIEW', () => {
  const plan = buildCommentaryMultilangRangeTargets({
    bookId: 'genesis',
    from: '1:11',
    to: '1:15',
    locales: 'en-US,ja-JP',
    types: 'sermon',
  });
  const jobs = buildTranslationJobs(plan.targets).jobs;
  const resultsPath =
    '/tmp/gomna-commentary-v2-phase3-real-genesis-1-11-31-repair19/results.jsonl';
  if (!fs.existsSync(resultsPath)) {
    // Skip gracefully when prior translation artifacts are absent.
    return;
  }
  const results = fs
    .readFileSync(resultsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const classified = classifyAudioEligibleTargets(jobs, results);
  assert.equal(classified.eligibleCount, 0);
  assert.equal(classified.sourceReviewExcluded.length, 10);
  assert.ok(
    classified.excluded.every((item) => item.status === 'audio-excluded-source-review'),
  );
});

test('A success yields PRIMARY_ACCEPTED without calling B', async () => {
  const pair = loadRealPassPair('history', 'en-US');
  if (!pair) return;
  const stagingRoot = mkStaging();
  const silent = await makeSilentMp3Bytes(30);
  const mock = createMockTtsRequestHandler({ bytesForText: silent });
  let bCalls = 0;
  const outcome = await processAudioCueTarget({
    job: pair.job,
    result: pair.result,
    stagingRoot,
    budget: createApiCallBudget(5),
    apiKey: 'test-key',
    executeNetwork: true,
    requestFn: mock.request.bind(mock),
    runStrategyA: ({ target, durationSeconds, speechUnits }) => ({
      ok: true,
      strategy: CUE_STRATEGY_A,
      decision: CUE_DECISION.PRIMARY_ACCEPTED,
      document: makePrimaryDocument(target, speechUnits, durationSeconds),
    }),
    runStrategyB: async () => {
      bCalls += 1;
      return { ok: false, reason: 'should_not_run' };
    },
  });
  assert.equal(outcome.decision, CUE_DECISION.PRIMARY_ACCEPTED);
  assert.equal(bCalls, 0);
  assert.equal(mock.calls, 1);
  assert.equal(outcome.ok, true);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('A failure triggers B and yields FALLBACK_ACCEPTED', async () => {
  const pair = loadRealPassPair('theology', 'en-US');
  if (!pair) return;
  const stagingRoot = mkStaging();
  const silent = await makeSilentMp3Bytes(6);
  const mock = createMockTtsRequestHandler({ bytesForText: silent });
  let aCalls = 0;
  let bCalls = 0;
  const outcome = await processAudioCueTarget({
    job: pair.job,
    result: pair.result,
    stagingRoot,
    budget: createApiCallBudget(20),
    apiKey: 'test-key',
    executeNetwork: true,
    requestFn: mock.request.bind(mock),
    runStrategyA: () => {
      aCalls += 1;
      return {
        ok: false,
        strategy: CUE_STRATEGY_A,
        code: 'silence_boundary_not_found',
        reason: 'mock A failure',
      };
    },
    runStrategyB: async ({ target, speechUnits }) => {
      bCalls += 1;
      const unitDurations = speechUnits.map((unit) =>
        unit.kind === 'item' ? 5 : 1.2,
      );
      const document = buildCueDocumentFromUnitDurations({
        target,
        speechUnits,
        unitDurations,
      });
      // Write a valid concat mp3 for verify path compatibility.
      fs.mkdirSync(path.dirname(target.audioAbs), { recursive: true });
      if (fs.existsSync(target.audioAbs)) fs.unlinkSync(target.audioAbs);
      const total = unitDurations.reduce((a, b) => a + b, 0);
      const bytes = await makeSilentMp3Bytes(total);
      fs.writeFileSync(target.audioAbs, bytes);
      return {
        ok: true,
        strategy: CUE_STRATEGY_B,
        decision: CUE_DECISION.FALLBACK_ACCEPTED,
        document,
        duration: total,
        byteSize: bytes.length,
        sha256: 'mock',
        apiCalls: speechUnits.length,
      };
    },
  });
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);
  assert.equal(outcome.decision, CUE_DECISION.FALLBACK_ACCEPTED);
  assert.equal(outcome.ok, true);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('A and B failure yields MANUAL_REVIEW_REQUIRED', async () => {
  const pair = loadRealPassPair('typology', 'en-US');
  if (!pair) return;
  const stagingRoot = mkStaging();
  const silent = await makeSilentMp3Bytes(8);
  const mock = createMockTtsRequestHandler({ bytesForText: silent });
  const outcome = await processAudioCueTarget({
    job: pair.job,
    result: pair.result,
    stagingRoot,
    budget: createApiCallBudget(10),
    apiKey: 'test-key',
    executeNetwork: true,
    requestFn: mock.request.bind(mock),
    runStrategyA: () => ({
      ok: false,
      code: 'silence_boundary_not_found',
      reason: 'A failed',
    }),
    runStrategyB: async () => ({
      ok: false,
      apiCalls: 2,
      reason: 'B failed',
      code: 'cue_validation_failed',
    }),
  });
  assert.equal(outcome.decision, CUE_DECISION.MANUAL_REVIEW_REQUIRED);
  assert.equal(outcome.ok, false);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('TTS budget counts each attempt and stops when exhausted', async () => {
  const silent = await makeSilentMp3Bytes(1);
  const budget = createApiCallBudget(2);
  const mock = createMockTtsRequestHandler({ bytesForText: silent });
  const first = await requestTtsWithBudget({
    budget,
    apiKey: 'k',
    narrationText: 'one',
    ttsConfig: { endpoint: 'x', model: 'm', voice: 'v', instructions: 'i', responseFormat: 'mp3' },
    requestFn: mock.request.bind(mock),
  });
  const second = await requestTtsWithBudget({
    budget,
    apiKey: 'k',
    narrationText: 'two',
    ttsConfig: { endpoint: 'x', model: 'm', voice: 'v', instructions: 'i', responseFormat: 'mp3' },
    requestFn: mock.request.bind(mock),
  });
  const third = await requestTtsWithBudget({
    budget,
    apiKey: 'k',
    narrationText: 'three',
    ttsConfig: { endpoint: 'x', model: 'm', voice: 'v', instructions: 'i', responseFormat: 'mp3' },
    requestFn: mock.request.bind(mock),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  assert.equal(third.code, 'max_api_calls_exceeded');
  assert.equal(mock.calls, 2);
  assert.equal(budget.consumed, 2);
  assert.equal(budget.remaining, 0);
});

test('resume skips completed targets with zero extra TTS calls', async () => {
  const pair = loadRealPassPair('counseling', 'ja-JP');
  if (!pair) return;
  const stagingRoot = mkStaging();
  const silent = await makeSilentMp3Bytes(25);
  const mock = createMockTtsRequestHandler({ bytesForText: silent });
  const checkpoint = createEmptyCheckpoint();

  const first = await processAudioCueTarget({
    job: pair.job,
    result: pair.result,
    stagingRoot,
    budget: createApiCallBudget(5),
    apiKey: 'k',
    executeNetwork: true,
    requestFn: mock.request.bind(mock),
    runStrategyA: ({ target, durationSeconds, speechUnits }) => ({
      ok: true,
      document: makePrimaryDocument(target, speechUnits, durationSeconds),
    }),
  });
  assert.equal(first.ok, true);
  upsertCheckpointItem(checkpoint, pair.job, {
    status: first.status,
    resumeComplete: true,
    sourceHash: pair.job.sourceHash,
  });
  assert.equal(
    shouldProcessTarget(checkpoint, pair.job, { resume: true }),
    false,
  );

  const callsBefore = mock.calls;
  const batch = await runAudioCueStagingBatch({
    eligible: shouldProcessTarget(checkpoint, pair.job, { resume: true })
      ? [{ job: pair.job, result: pair.result }]
      : [],
    stagingRoot,
    maxApiCalls: 5,
    executeNetwork: true,
    apiKey: 'k',
    requestFn: mock.request.bind(mock),
  });
  assert.equal(batch.summary.apiCalls, 0);
  assert.equal(mock.calls, callsBefore);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('verify detects damaged MP3 and bad cue timings', async () => {
  const pair = loadRealPassPair('hymn', 'en-US');
  if (!pair) return;
  const stagingRoot = mkStaging();
  const target = buildAudioCueStagingTarget(pair.job, { stagingRoot });
  fs.mkdirSync(path.dirname(target.audioAbs), { recursive: true });
  fs.mkdirSync(path.dirname(target.cueAbs), { recursive: true });
  fs.writeFileSync(target.audioAbs, Buffer.from('not-an-mp3'));
  fs.writeFileSync(
    target.cueAbs,
    `${JSON.stringify({
      audioId: target.audioId,
      duration: 10,
      measuredDuration: 10,
      testAudioPath: target.audioPath,
      finalMp3Duration: 10,
      segments: [{ type: 'item', itemIndex: 0, start: 5, end: 1 }],
    })}\n`,
  );
  const badMp3 = verifyStagedAudioCue(target);
  assert.equal(badMp3.ok, false);

  const silent = await makeSilentMp3Bytes(12);
  fs.writeFileSync(target.audioAbs, silent);
  const speechUnits = buildNarrationSpeechUnits(
    pair.result.narrationText,
    pair.job.cardCount,
    { type: pair.job.type },
  );
  // Overlapping / end<=start segments
  const badDoc = makePrimaryDocument(target, speechUnits, 12);
  badDoc.segments[0].end = badDoc.segments[0].start;
  fs.writeFileSync(target.cueAbs, `${JSON.stringify(badDoc, null, 2)}\n`);
  const badCue = verifyStagedAudioCue(target);
  assert.equal(badCue.ok, false);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test('non-PASS targets never enter audio batch eligibility', () => {
  const { job } = loadJobResultPair({ type: 'sermon', locale: 'en-US' });
  const fakeFail = {
    targetId: job.targetId,
    sourceHash: job.sourceHash,
    locale: job.locale,
    type: job.type,
    narrationText: 'An example of application can be given as -.\n',
    translatedNarrationParagraphs: [['An example of application can be given as -.']],
    translatedCards: (job.sourceCards || []).map((card, index) => ({
      itemIndex: index,
      identity: card.identity,
      fields: Object.fromEntries(
        Object.keys(card.fields || {}).map((key) => [key, '-']),
      ),
    })),
    model: 'mock',
    translatedAt: new Date().toISOString(),
  };
  const classified = classifyAudioEligibleTargets([job], [fakeFail]);
  assert.equal(classified.eligibleCount, 0);
  assert.ok(classified.excludedCount >= 1);
});
