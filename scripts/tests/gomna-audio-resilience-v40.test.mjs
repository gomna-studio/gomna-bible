import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineSource = fs.readFileSync(path.join(ROOT, 'js/audio-engine.js'), 'utf8');
const readerSource = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');

class FakeAudio extends EventTarget {
  static instances = [];
  static playRejectCount = 0;

  constructor() {
    super();
    this.src = '';
    this.currentTime = 0;
    this.duration = 30;
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.playbackRate = 1;
    this.preload = '';
    this.buffered = { length: 0 };
    FakeAudio.instances.push(this);
  }

  get currentSrc() {
    return this.src;
  }

  load() {
    this.paused = true;
  }

  pause() {
    this.paused = true;
  }

  play() {
    if (FakeAudio.playRejectCount > 0) {
      FakeAudio.playRejectCount -= 1;
      this.paused = true;
      return Promise.reject(Object.assign(new Error('temporary network failure'), { name: 'NotSupportedError' }));
    }
    this.paused = false;
    queueMicrotask(() => this.dispatchEvent(new Event('playing')));
    return Promise.resolve();
  }
}

function createEngine() {
  FakeAudio.instances = [];
  FakeAudio.playRejectCount = 0;
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.hidden = false;
  win.window = win;
  win.document = doc;
  win.console = console;
  win.CustomEvent = CustomEvent;
  win.Audio = FakeAudio;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.GOMNA_AUDIO_CONFIG = {
    manifestLoadStatus: 'loaded',
    buildAudioUrl: (value) => value,
    manifestData: {
      audios: {
        'genesis.001.001.bible': {
          id: 'genesis.001.001.bible', type: 'bible', status: 'published',
          voicePreset: 'calm', filePath: 'https://audio.test/001.mp3'
        },
        'genesis.001.002.bible': {
          id: 'genesis.001.002.bible', type: 'bible', status: 'published',
          voicePreset: 'calm', filePath: 'https://audio.test/002.mp3'
        }
      }
    }
  };

  const context = vm.createContext({
    window: win,
    document: doc,
    console,
    CustomEvent,
    Event,
    EventTarget,
    Audio: FakeAudio,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(engineSource, context, { filename: 'audio-engine.js' });
  return win.GOMNA_AUDIO_ENGINE;
}

test('reuses one media element when a chapter advances to the next verse', async () => {
  const engine = createEngine();
  const ids = ['genesis.001.001.bible', 'genesis.001.002.bible'];
  assert.equal(engine.playAudioQueue(ids, { source: 'bible-chapter:genesis.001.001' }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const firstElement = engine._state.currentAudio;
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(engine._state.currentAudioId, ids[0]);

  firstElement.ended = true;
  firstElement.dispatchEvent(new Event('ended'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(engine._state.currentAudio, firstElement);
  assert.equal(engine._state.currentAudioId, ids[1]);
  assert.equal(FakeAudio.instances.length, 1);
});

test('stalled recovery preserves verse and playback position', async () => {
  const engine = createEngine();
  const id = 'genesis.001.001.bible';
  engine._RECOVERY_BACKOFF_MS = [0];
  assert.equal(engine.playAudioQueue([id], { source: 'bible-chapter:genesis.001.001' }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const element = engine._state.currentAudio;
  element.currentTime = 12.5;
  engine._recoverStalledCurrentAudio(element, id, engine._state.queueEpoch);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(engine._state.currentAudio, element);
  assert.equal(engine._state.currentAudioId, id);
  assert.equal(engine._state.isPlaying, true);
  assert.equal(FakeAudio.instances.length, 1);
});

test('recovery no longer contains a swallowed play rejection', () => {
  assert.doesNotMatch(
    engineSource,
    /playPromise\.catch\(function\(\)\s*\{\s*\/\* This recovery attempt failed\. Do not skip the verse\. \*\/\s*\}\)/
  );
  assert.match(engineSource, /retryRecoveringAudio/);
  assert.match(engineSource, /_RECOVERY_BACKOFF_MS/);
});

test('rejected queue playback retries and then continues instead of dying silently', async () => {
  const engine = createEngine();
  const ids = ['genesis.001.001.bible', 'genesis.001.002.bible'];
  engine._RECOVERY_BACKOFF_MS = [0];
  FakeAudio.playRejectCount = 6;

  assert.equal(engine.playAudioQueue(ids, { source: 'bible-chapter:genesis.001.001' }), true);
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(engine._state.currentAudioId, ids[1]);
  assert.equal(engine._state.isPlaying, true);
  assert.equal(FakeAudio.instances.length, 1);
});

test('continuous chapter handoff keeps a 30 second mobile recovery window', () => {
  assert.match(readerSource, /continuous next chapter[\s\S]*?\}, 30000\);/);
});
