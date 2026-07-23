import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCommentaryCueDocument } from '../lib/commentary-multilang-cue.mjs';

function makeTarget({
  type = 'history',
  cardCount = 3,
  locale = 'en-US',
  verse = 1,
} = {}) {
  return {
    locale,
    bookId: 'genesis',
    chapter: 1,
    verse,
    type,
    cardCount,
    audioId: `genesis.001.00${verse}.${type}.${locale}`,
    audioPath: `audio/v1/${locale}/genesis/001/00${verse}/${type}-warm.mp3`,
  };
}

function makeCue({
  target,
  cardCount,
  duration,
  includeClosing = true,
  includeBridge = false,
  itemIndexes = null,
  mutate = null,
}) {
  const indexes =
    itemIndexes || Array.from({ length: cardCount }, (_, index) => index);
  const units = ['intro'];
  if (includeBridge) units.push('bridge');
  for (const index of indexes) units.push(['item', index]);
  if (includeClosing) units.push('closing');

  const slot = duration / units.length;
  let cursor = 0;
  const segments = units.map((unit) => {
    const start = cursor;
    const end = cursor + slot;
    cursor = end;
    if (unit === 'intro' || unit === 'bridge' || unit === 'closing') {
      return { type: unit, itemIndex: -1, start, end };
    }
    return { type: 'item', itemIndex: unit[1], start, end };
  });

  // Ensure cards meet the 4.0s minimum by using a long enough duration.
  const document = {
    audioId: target.audioId,
    duration,
    measuredDuration: duration,
    testAudioPath: target.audioPath,
    finalMp3Duration: duration,
    segments,
  };
  if (typeof mutate === 'function') mutate(document);
  return document;
}

test('standard three-card type validates with intro/items/closing', () => {
  const target = makeTarget({ type: 'history', cardCount: 3 });
  // Force warm filename for history.
  target.audioPath = 'audio/v1/en-US/genesis/001/001/history-warm.mp3';
  const document = makeCue({
    target,
    cardCount: 3,
    duration: 40,
  });
  const result = validateCommentaryCueDocument(document, {
    target,
    durationSeconds: 40,
    cardCount: 3,
    type: 'history',
  });
  assert.equal(result.ok, true, result.reason);
});

test('original-language five-card type validates', () => {
  const target = makeTarget({ type: 'original-language', cardCount: 5 });
  target.audioPath =
    'audio/v1/en-US/genesis/001/001/original-language-study.mp3';
  const document = makeCue({
    target,
    cardCount: 5,
    duration: 60,
  });
  const result = validateCommentaryCueDocument(document, {
    target,
    durationSeconds: 60,
    cardCount: 5,
    type: 'original-language',
  });
  assert.equal(result.ok, true, result.reason);
});

test('hymn bridge is allowed and history bridge is rejected', () => {
  const hymnTarget = makeTarget({ type: 'hymn', cardCount: 4 });
  hymnTarget.audioPath = 'audio/v1/en-US/genesis/001/001/hymn-soft.mp3';
  const hymnCue = makeCue({
    target: hymnTarget,
    cardCount: 4,
    duration: 50,
    includeBridge: true,
  });
  assert.equal(
    validateCommentaryCueDocument(hymnCue, {
      target: hymnTarget,
      durationSeconds: 50,
      cardCount: 4,
      type: 'hymn',
    }).ok,
    true,
  );

  const historyTarget = makeTarget({ type: 'history', cardCount: 3 });
  historyTarget.audioPath = 'audio/v1/en-US/genesis/001/001/history-warm.mp3';
  const historyCue = makeCue({
    target: historyTarget,
    cardCount: 3,
    duration: 40,
    includeBridge: true,
  });
  const blocked = validateCommentaryCueDocument(historyCue, {
    target: historyTarget,
    durationSeconds: 40,
    cardCount: 3,
    type: 'history',
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /bridge segment not allowed/);
});

test('sermon 0-5 and cross-reference 0-7 validate; skipped indexes rejected', () => {
  const sermonTarget = makeTarget({ type: 'sermon', cardCount: 6 });
  sermonTarget.audioPath = 'audio/v1/en-US/genesis/001/001/sermon-strong.mp3';
  const sermonCue = makeCue({
    target: sermonTarget,
    cardCount: 6,
    duration: 70,
    includeClosing: false,
  });
  assert.equal(
    validateCommentaryCueDocument(sermonCue, {
      target: sermonTarget,
      durationSeconds: 70,
      cardCount: 6,
      type: 'sermon',
    }).ok,
    true,
  );

  const skipped = makeCue({
    target: sermonTarget,
    cardCount: 6,
    duration: 70,
    includeClosing: false,
    itemIndexes: [0, 2, 3, 4, 5, 6],
  });
  const skippedResult = validateCommentaryCueDocument(skipped, {
    target: sermonTarget,
    durationSeconds: 70,
    cardCount: 6,
    type: 'sermon',
  });
  assert.equal(skippedResult.ok, false);

  const xrTarget = makeTarget({ type: 'cross-reference', cardCount: 8 });
  xrTarget.audioPath =
    'audio/v1/en-US/genesis/001/001/cross-reference-calm.mp3';
  const xrCue = makeCue({
    target: xrTarget,
    cardCount: 8,
    duration: 90,
    includeClosing: false,
  });
  assert.equal(
    validateCommentaryCueDocument(xrCue, {
      target: xrTarget,
      durationSeconds: 90,
      cardCount: 8,
      type: 'cross-reference',
    }).ok,
    true,
  );
});

test('missing, duplicate, reordered indexes and duration failures are rejected', () => {
  const target = makeTarget({ type: 'theology', cardCount: 3 });
  target.audioPath = 'audio/v1/en-US/genesis/001/001/theology-warm.mp3';

  const missing = makeCue({
    target,
    cardCount: 3,
    duration: 40,
    itemIndexes: [0, 1],
  });
  // Force segment count to look like 3 cards by duplicating closing logic:
  // makeCue with itemIndexes length 2 will create fewer items.
  assert.equal(
    validateCommentaryCueDocument(missing, {
      target,
      durationSeconds: 40,
      cardCount: 3,
      type: 'theology',
    }).ok,
    false,
  );

  const duplicate = makeCue({
    target,
    cardCount: 3,
    duration: 40,
    itemIndexes: [0, 1, 1],
  });
  assert.equal(
    validateCommentaryCueDocument(duplicate, {
      target,
      durationSeconds: 40,
      cardCount: 3,
      type: 'theology',
    }).ok,
    false,
  );

  const reordered = makeCue({
    target,
    cardCount: 3,
    duration: 40,
    itemIndexes: [0, 2, 1],
  });
  assert.equal(
    validateCommentaryCueDocument(reordered, {
      target,
      durationSeconds: 40,
      cardCount: 3,
      type: 'theology',
    }).ok,
    false,
  );

  const overlap = makeCue({
    target,
    cardCount: 3,
    duration: 40,
    mutate(document) {
      document.segments[1].end = document.segments[2].end;
    },
  });
  assert.equal(
    validateCommentaryCueDocument(overlap, {
      target,
      durationSeconds: 40,
      cardCount: 3,
      type: 'theology',
    }).ok,
    false,
  );
});

test('matthew-henry may omit closing when policy allows', () => {
  const target = makeTarget({ type: 'matthew-henry', cardCount: 3 });
  target.audioPath = 'audio/v1/en-US/genesis/001/001/matthew-henry-calm.mp3';
  const document = makeCue({
    target,
    cardCount: 3,
    duration: 45,
    includeClosing: false,
  });
  const result = validateCommentaryCueDocument(document, {
    target,
    durationSeconds: 45,
    cardCount: 3,
    type: 'matthew-henry',
  });
  assert.equal(result.ok, true, result.reason);
});
