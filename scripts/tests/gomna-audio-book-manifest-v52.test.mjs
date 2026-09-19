import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const config = fs.readFileSync(path.join(root, 'js/audio-config.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'js/audio-engine.js'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');

test('page startup no longer downloads the 37MB master manifest', () => {
  assert.doesNotMatch(config, /fetch\(window\.GOMNA_AUDIO_CONFIG\.MANIFEST_PATH/);
  assert.match(config, /setupBookManifestLoader/);
  assert.match(config, /MANIFEST_SHARD_ROOT \+ '\/ko-KR\/' \+ normalized \+ '\.json'/);
});

test('only the requested Bible book manifest is loaded and merged', () => {
  assert.match(config, /config\.loadBookManifest = function\(bookId\)/);
  assert.match(config, /config\.ensureAudioId = function\(audioId\)/);
  assert.match(config, /config\.manifestData\.audios\[ids\[i\]\] = audios\[ids\[i\]\]/);
  assert.match(config, /if \(bookPromises\[normalized\]\) return bookPromises\[normalized\]/);
});

test('one tap waits for the book manifest and automatically retries playback', () => {
  assert.match(engine, /config\.ensureAudioId\(audioId\)\.then/);
  assert.match(engine, /engine\.playAudioById\(audioId, retryOptions\)/);
  assert.match(engine, /config\.ensureAudioId\(firstAudioId\)\.then/);
  assert.match(engine, /engine\.playAudioQueue\(audioIds, retryOptions\)/);
  assert.doesNotMatch(engine, /오디오 데이터 로딩 중입니다\. 잠시 후 다시 시도해주세요/);
});

test('a stopped or superseded request cannot start later', () => {
  assert.match(engine, /manifestRequestToken/);
  assert.match(engine, /state\.manifestRequestToken !== manifestToken \|\| state\.playbackCancelled/);
  assert.match(engine, /state\.manifestRequestToken = \(state\.manifestRequestToken \|\| 0\) \+ 1/);
});

test('reader requests the v52 book manifest files', () => {
  assert.match(reader, /audio-config\.js\?v=20260919-book-manifest-v52/);
  assert.match(reader, /audio-engine\.js\?v=20260919-book-manifest-v52/);
});

test('v50 resilience, speed, and in-memory handoff remain present', () => {
  assert.match(engine, /_bindStallRecovery/);
  assert.match(engine, /_applyCurrentSpeed/);
  assert.match(engine, /nextPrefetchObjectUrl/);
  assert.match(engine, /URL\.createObjectURL/);
  assert.equal((engine.match(/new Audio\(\)/g) || []).length, 1);
});
