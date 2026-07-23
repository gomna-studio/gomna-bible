import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDGE_EXPECTED_WEIGHT_SCALE,
  buildNarrationSpeechUnits,
  calculateExpectedBoundaries,
  validateCommentaryCueDocument,
} from '../lib/commentary-multilang-cue.mjs';

function kinds(units) {
  return units.map((unit) =>
    unit.kind === 'item' ? `item:${unit.itemIndex}` : unit.kind,
  );
}

function joinParagraphs(paragraphs) {
  return `${paragraphs
    .map((lines) => (Array.isArray(lines) ? lines.join('\n') : lines))
    .join('\n\n')}\n`;
}

test('packed [1,3]/[1,4]/[1,6]/[1,8] use cardCount boundaries', () => {
  const cases = [
    { type: 'history', cardCount: 3, bodyLines: 3 },
    { type: 'hymn', cardCount: 4, bodyLines: 4 },
    { type: 'sermon', cardCount: 6, bodyLines: 6 },
    { type: 'cross-reference', cardCount: 8, bodyLines: 8 },
  ];

  for (const item of cases) {
    const body = Array.from(
      { length: item.bodyLines },
      (_, index) => `Card line ${index + 1} with enough spoken text.`,
    );
    const narration = joinParagraphs([
      ['Intro line for the verse narration.'],
      body,
    ]);
    const units = buildNarrationSpeechUnits(narration, item.cardCount, {
      type: item.type,
    });
    assert.deepEqual(
      kinds(units),
      [
        'intro',
        ...Array.from({ length: item.cardCount }, (_, index) => `item:${index}`),
      ],
      item.type,
    );
  }
});

test('sermon cards-only 0-5 and cross-reference cards-only 0-7', () => {
  const sermon = joinParagraphs(
    Array.from({ length: 6 }, (_, index) => [
      `Sermon card ${index} spoken content for weight.`,
    ]),
  );
  const sermonUnits = buildNarrationSpeechUnits(sermon, 6, { type: 'sermon' });
  assert.deepEqual(
    kinds(sermonUnits),
    ['item:0', 'item:1', 'item:2', 'item:3', 'item:4', 'item:5'],
  );

  const xr = joinParagraphs(
    Array.from({ length: 8 }, (_, index) => [
      `Cross-reference card ${index} spoken content for weight.`,
    ]),
  );
  const xrUnits = buildNarrationSpeechUnits(xr, 8, {
    type: 'cross-reference',
  });
  assert.deepEqual(
    kinds(xrUnits),
    [
      'item:0',
      'item:1',
      'item:2',
      'item:3',
      'item:4',
      'item:5',
      'item:6',
      'item:7',
    ],
  );
});

test('matthew-henry keeps three cards with variable lines per card', () => {
  const variable = joinParagraphs([
    ['Matthew Henry intro for the verse.'],
    ['Card0 line A', 'Card0 line B'],
    ['Card1 only line with enough spoken text here.'],
    ['Card2 a', 'Card2 b', 'Card2 c', 'Card2 d'],
  ]);
  const variableUnits = buildNarrationSpeechUnits(variable, 3, {
    type: 'matthew-henry',
  });
  assert.deepEqual(kinds(variableUnits), [
    'intro',
    'item:0',
    'item:1',
    'item:2',
  ]);
  assert.match(variableUnits[1].text, /Card0 line A/);
  assert.match(variableUnits[2].text, /Card1 only line/);
  assert.equal(variableUnits[3].text.split('\n').length, 4);

  const packed = joinParagraphs([
    ['Matthew Henry packed intro.'],
    Array.from(
      { length: 9 },
      (_, index) => `Packed MH line ${index + 1} spoken content.`,
    ),
  ]);
  const packedUnits = buildNarrationSpeechUnits(packed, 3, {
    type: 'matthew-henry',
  });
  assert.deepEqual(kinds(packedUnits), [
    'intro',
    'item:0',
    'item:1',
    'item:2',
  ]);
  assert.equal(packedUnits[1].text.split('\n').length, 3);
  assert.equal(packedUnits[2].text.split('\n').length, 3);
  assert.equal(packedUnits[3].text.split('\n').length, 3);
});

test('hymn bridge is allowed; non-hymn bridge structures are blocked', () => {
  const hymn = joinParagraphs([
    ['Hymn intro spoken content.'],
    ['Bridge spoken content before cards.'],
    ['Card 0 hymn text with enough weight.'],
    ['Card 1 hymn text with enough weight.'],
    ['Card 2 hymn text with enough weight.'],
    ['Card 3 hymn text with enough weight.'],
    ['Closing spoken content after cards.'],
  ]);
  const hymnUnits = buildNarrationSpeechUnits(hymn, 4, { type: 'hymn' });
  assert.deepEqual(kinds(hymnUnits), [
    'intro',
    'bridge',
    'item:0',
    'item:1',
    'item:2',
    'item:3',
    'closing',
  ]);

  const historyBridge = joinParagraphs([
    ['History intro spoken content.'],
    ['Illegal bridge spoken content.'],
    ['Card 0 history text with enough weight.'],
    ['Card 1 history text with enough weight.'],
    ['Card 2 history text with enough weight.'],
    ['Closing spoken content after cards.'],
  ]);
  assert.throws(
    () =>
      buildNarrationSpeechUnits(historyBridge, 3, {
        type: 'history',
      }),
    /unable to determine card boundaries/,
  );
});

test('undetermined structures and index/doc failures remain blocked', () => {
  const undetermined = joinParagraphs([
    ['Intro line.'],
    ['Only two body lines', 'second line'],
  ]);
  assert.throws(
    () =>
      buildNarrationSpeechUnits(undetermined, 3, {
        type: 'history',
      }),
    /unable to determine card boundaries/,
  );

  const target = {
    locale: 'en-US',
    bookId: 'genesis',
    chapter: 1,
    verse: 1,
    type: 'sermon',
    cardCount: 6,
    audioId: 'genesis.001.001.sermon.en-US',
    audioPath: 'audio/v1/en-US/genesis/001/001/sermon-strong.mp3',
  };

  const units = ['intro', ['item', 0], ['item', 1], ['item', 1], ['item', 3], ['item', 4], ['item', 5]];
  const duration = 70;
  const slot = duration / units.length;
  let cursor = 0;
  const segments = units.map((unit) => {
    const start = cursor;
    const end = cursor + slot;
    cursor = end;
    if (unit === 'intro') {
      return { type: 'intro', itemIndex: -1, start, end };
    }
    return { type: 'item', itemIndex: unit[1], start, end };
  });
  const duplicate = {
    audioId: target.audioId,
    duration,
    measuredDuration: duration,
    testAudioPath: target.audioPath,
    finalMp3Duration: duration,
    segments,
  };
  assert.equal(
    validateCommentaryCueDocument(duplicate, {
      target,
      durationSeconds: duration,
      cardCount: 6,
      type: 'sermon',
    }).ok,
    false,
  );

  const reorderedUnits = [
    'intro',
    ['item', 0],
    ['item', 2],
    ['item', 1],
    ['item', 3],
    ['item', 4],
    ['item', 5],
  ];
  cursor = 0;
  const reordered = {
    ...duplicate,
    segments: reorderedUnits.map((unit) => {
      const start = cursor;
      const end = cursor + slot;
      cursor = end;
      if (unit === 'intro') {
        return { type: 'intro', itemIndex: -1, start, end };
      }
      return { type: 'item', itemIndex: unit[1], start, end };
    }),
  };
  assert.equal(
    validateCommentaryCueDocument(reordered, {
      target,
      durationSeconds: duration,
      cardCount: 6,
      type: 'sermon',
    }).ok,
    false,
  );

  const missing = {
    ...duplicate,
    segments: duplicate.segments.slice(0, -1),
  };
  missing.segments[missing.segments.length - 1].end = duration;
  assert.equal(
    validateCommentaryCueDocument(missing, {
      target,
      durationSeconds: duration,
      cardCount: 6,
      type: 'sermon',
    }).ok,
    false,
  );
});

test('original-language classic [1,N,1] speech units are preserved', () => {
  const narration = joinParagraphs([
    ['Original-language intro with enough spoken weight.'],
    Array.from(
      { length: 5 },
      (_, index) => `OL card ${index + 1} analysis with enough spoken weight.`,
    ),
    ['Original-language closing with enough spoken weight.'],
  ]);
  const units = buildNarrationSpeechUnits(narration, 5, {
    type: 'original-language',
  });
  assert.deepEqual(kinds(units), [
    'intro',
    'item:0',
    'item:1',
    'item:2',
    'item:3',
    'item:4',
    'closing',
  ]);
});

test('expected boundaries keep full weights by default and can scale edges', () => {
  const units = [
    { kind: 'intro', itemIndex: -1, text: 'Intro text', weight: 100 },
    { kind: 'item', itemIndex: 0, text: 'Card zero', weight: 100 },
    { kind: 'item', itemIndex: 1, text: 'Card one', weight: 100 },
    { kind: 'closing', itemIndex: -1, text: 'Closing text', weight: 100 },
  ];
  const plain = calculateExpectedBoundaries(units, 100);
  assert.deepEqual(plain.weights, [100, 100, 100, 100]);
  assert.deepEqual(plain.expectedBoundaries, [25, 50, 75]);

  const scaled = calculateExpectedBoundaries(units, 100, {
    edgeWeightScale: EDGE_EXPECTED_WEIGHT_SCALE,
  });
  assert.deepEqual(scaled.weights, [
    100 * EDGE_EXPECTED_WEIGHT_SCALE,
    100,
    100,
    100 * EDGE_EXPECTED_WEIGHT_SCALE,
  ]);
  assert.deepEqual(
    scaled.expectedBoundaries.map((value) => Number(value.toFixed(6))),
    [16.666667, 50, 83.333333],
  );
});

test('cards-only cue documents may start with item 0', () => {
  const target = {
    locale: 'en-US',
    bookId: 'genesis',
    chapter: 1,
    verse: 1,
    type: 'sermon',
    cardCount: 6,
    audioId: 'genesis.001.001.sermon.en-US',
    audioPath: 'audio/v1/en-US/genesis/001/001/sermon-strong.mp3',
  };
  const duration = 60;
  const slot = duration / 6;
  let cursor = 0;
  const segments = Array.from({ length: 6 }, (_, index) => {
    const start = cursor;
    const end = cursor + slot;
    cursor = end;
    return { type: 'item', itemIndex: index, start, end };
  });
  const result = validateCommentaryCueDocument(
    {
      audioId: target.audioId,
      duration,
      measuredDuration: duration,
      testAudioPath: target.audioPath,
      finalMp3Duration: duration,
      segments,
    },
    {
      target,
      durationSeconds: duration,
      cardCount: 6,
      type: 'sermon',
    },
  );
  assert.equal(result.ok, true, result.reason);
});
