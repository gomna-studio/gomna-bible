import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const engine = fs.readFileSync(path.join(root, 'js/audio-engine.js'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');

test('completed next verse bytes become a playable Blob URL', () => {
  assert.match(engine, /response\.arrayBuffer\(\)\.then/);
  assert.match(engine, /URL\.createObjectURL\(new Blob\(\[prefetched\.buffer\]/);
  assert.match(engine, /state\.nextPrefetchObjectUrl = objectUrl/);
});

test('iPhone handoff uses the prepared in-memory audio', () => {
  assert.match(engine, /preparedObjectUrl = engine\._consumeNextPrefetch/);
  assert.match(engine, /playbackSrc = preparedObjectUrl \|\| audioSrc/);
  assert.match(engine, /audio\.src = playbackSrc/);
});

test('unfinished or missing Blob audio cannot take the fast path', () => {
  assert.match(engine, /state\.nextPrefetchReady === true &&\s*state\.nextPrefetchObjectUrl/);
  assert.match(engine, /preparedQueueHandoff = !!preparedObjectUrl/);
});

test('Blob URLs are revoked instead of leaking across verses', () => {
  assert.match(engine, /URL\.revokeObjectURL/);
  assert.match(engine, /_releaseCurrentObjectUrl/);
  assert.match(engine, /engine\._revokeObjectUrl\(state\.nextPrefetchObjectUrl\)/);
});

test('reader requests the iPhone memory handoff engine version', () => {
  assert.match(reader, /audio-engine\.js\?v=20260919-ios-memory-handoff-v50/);
});

test('single-player recovery and playback-speed safeguards remain', () => {
  assert.match(engine, /_bindStallRecovery/);
  assert.match(engine, /_applyCurrentSpeed/);
  // Idle preparation may allocate an element, but must never start playback.
  const warmup = engine.slice(engine.indexOf('prepareBibleAudio: function'), engine.indexOf('_cleanupNextAudio: function'));
  assert.doesNotMatch(warmup, /\.play\(/);
});
