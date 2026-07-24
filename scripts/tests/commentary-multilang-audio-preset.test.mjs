import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPresetTtsInstructions,
  resolveCommentaryTtsConfig,
} from '../lib/commentary-multilang-audio.mjs';
import {
  assertVoicePresetForType,
  buildCommentaryMp3FileName,
  listCommentaryTypes,
} from '../lib/commentary-type-registry.mjs';
import { buildAudioPath } from '../lib/commentary-multilang-registry.mjs';

test('all registered presets map and reject mismatches', () => {
  const expected = {
    'original-language': 'study',
    history: 'warm',
    theology: 'warm',
    typology: 'study',
    'matthew-henry': 'calm',
    sermon: 'strong',
    hymn: 'soft',
    counseling: 'warm',
    'cross-reference': 'calm',
  };

  for (const definition of listCommentaryTypes()) {
    assert.equal(definition.voicePreset, expected[definition.type]);
    assert.equal(
      assertVoicePresetForType(definition.type, definition.voicePreset),
      definition.voicePreset,
    );
    assert.throws(() =>
      assertVoicePresetForType(definition.type, 'mismatched-preset'),
    );
    assert.equal(
      buildCommentaryMp3FileName(definition.type),
      `${definition.type}-${definition.voicePreset}.mp3`,
    );
    assert.equal(
      buildAudioPath(
        'genesis',
        1,
        1,
        definition.type,
        'en-US',
        definition.voicePreset,
      ),
      `audio/v1/en-US/genesis/001/001/${definition.type}-${definition.voicePreset}.mp3`,
    );
  }
});

test('TTS config supports study/warm/calm/strong/soft and keeps Hebrew terms for original-language only', () => {
  const ol = resolveCommentaryTtsConfig({
    locale: 'en-US',
    type: 'original-language',
    voicePreset: 'study',
    pronunciationTerms: ['bereshit', 'elohim', 'bara', 'shamayim', 'erets'],
  });
  assert.equal(ol.voicePreset, 'study');
  assert.match(ol.instructions, /bereshit/);

  for (const [type, preset] of [
    ['history', 'warm'],
    ['matthew-henry', 'calm'],
    ['sermon', 'strong'],
    ['hymn', 'soft'],
  ]) {
    const config = resolveCommentaryTtsConfig({
      locale: 'en-US',
      type,
      voicePreset: preset,
    });
    assert.equal(config.voicePreset, preset);
    assert.equal(config.pronunciationTerms.length, 0);
    assert.doesNotMatch(config.instructions, /bereshit|Hebrew transliterations/);
  }

  assert.throws(() =>
    resolveCommentaryTtsConfig({
      locale: 'en-US',
      type: 'history',
      voicePreset: 'study',
    }),
  );

  assert.match(
    buildPresetTtsInstructions('ja-JP', 'soft', { type: 'hymn' }),
    /賛美/,
  );
});
