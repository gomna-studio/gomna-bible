import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMENTARY_TYPES,
  assertVoicePresetForType,
  buildAllowedTargetString,
  buildCommentaryCueFileName,
  buildCommentaryMp3FileName,
  getCommentaryType,
  listCommentaryTypes,
  resolveCommentaryTypes,
} from '../lib/commentary-type-registry.mjs';

const EXPECTED = [
  ['original-language', '원어분석', 'study'],
  ['history', '역사적배경', 'warm'],
  ['theology', '신학적의미', 'warm'],
  ['typology', '예표론', 'study'],
  ['matthew-henry', '매튜헨리', 'calm'],
  ['sermon', '설교자료', 'strong'],
  ['hymn', '찬송가', 'soft'],
  ['counseling', '상담적용', 'warm'],
  ['cross-reference', '교차참조', 'calm'],
];

test('registry has exactly nine unique types in UI order', () => {
  const types = listCommentaryTypes();
  assert.equal(types.length, 9);
  assert.deepEqual(
    types.map((item) => item.type),
    EXPECTED.map((item) => item[0]),
  );
  assert.equal(new Set(types.map((item) => item.type)).size, 9);
  assert.deepEqual(
    COMMENTARY_TYPES.map((item) => item.type),
    EXPECTED.map((item) => item[0]),
  );
});

test('exact preset and label mapping', () => {
  for (const [type, labelKo, preset] of EXPECTED) {
    const definition = getCommentaryType(type);
    assert.equal(definition.labels.ko, labelKo);
    assert.equal(definition.voicePreset, preset);
    assert.equal(definition.manifestType, type);
    assert.equal(definition.fileSlug, type);
    assert.equal(definition.cueSlug, type);
    assert.equal(buildCommentaryMp3FileName(type), `${type}-${preset}.mp3`);
    assert.equal(buildCommentaryCueFileName(type), `${type}.json`);
    assert.equal(assertVoicePresetForType(type, preset), preset);
    assert.throws(() => assertVoicePresetForType(type, 'wrong'));
  }
});

test('resolveCommentaryTypes supports --type, comma list, and all', () => {
  assert.deepEqual(
    resolveCommentaryTypes({ type: 'history' }).map((item) => item.type),
    ['history'],
  );
  assert.deepEqual(
    resolveCommentaryTypes({ types: 'theology,history' }).map((item) => item.type),
    ['history', 'theology'],
  );
  assert.deepEqual(
    resolveCommentaryTypes({ types: 'all' }).map((item) => item.type),
    EXPECTED.map((item) => item[0]),
  );
  assert.throws(() => resolveCommentaryTypes({ type: 'history', types: 'all' }));
  assert.throws(() => resolveCommentaryTypes({}));
  assert.throws(() => resolveCommentaryTypes({ types: '' }));
  assert.throws(() => resolveCommentaryTypes({ types: 'history,history' }));
  assert.throws(() => resolveCommentaryTypes({ type: 'unknown-type' }));
});

test('allowed-target string keeps single-type form and registry-orders multi-type', () => {
  assert.equal(
    buildAllowedTargetString({
      book: 'genesis',
      chapter: 1,
      fromVerse: 1,
      toVerse: 3,
      type: 'original-language',
      locales: 'en-US,ja-JP',
    }),
    'genesis:1:1-3:original-language:en-US,ja-JP',
  );
  assert.equal(
    buildAllowedTargetString({
      book: 'genesis',
      chapter: 1,
      fromVerse: 1,
      toVerse: 3,
      types: 'theology,history',
      locales: ['en-US', 'ja-JP'],
    }),
    'genesis:1:1-3:history,theology:en-US,ja-JP',
  );
  assert.equal(
    buildAllowedTargetString({
      book: 'genesis',
      chapter: 1,
      fromVerse: 1,
      toVerse: 3,
      types: 'all',
      locales: 'en-US,ja-JP',
    }),
    'genesis:1:1-3:original-language,history,theology,typology,matthew-henry,sermon,hymn,counseling,cross-reference:en-US,ja-JP',
  );
});
