import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../js/audio-engine.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ids = ['john.002.001.bible', 'john.002.002.bible', 'john.003.001.bible'];

function setup({ deferFetch = false, manualPlay = false } = {}) {
  const instances = [], requests = [], revoked = [];
  class Media extends EventTarget {
    constructor() {
      super(); instances.push(this);
      Object.assign(this, { src: '', paused: true, ended: false, error: null,
        currentTime: 0, duration: 10, readyState: 0, loadCount: 0, playCount: 0,
        playbackRate: 1, defaultPlaybackRate: 1, preservesPitch: false,
        webkitPreservesPitch: false, buffered: { length: 0 } });
    }
    get currentSrc() { return this.src; }
    load() { this.loadCount++; this.playbackRate = 1; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    pause() { this.paused = true; }
    play() {
      this.playCount++; this.paused = false; this.ended = false;
      if (manualPlay) return new Promise(() => {});
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    }
  }
  const win = new EventTarget(), doc = new EventTarget();
  win.setTimeout = setTimeout;
  win.GOMNA_AUDIO_CONFIG = {
    manifestLoadStatus: 'loaded', buildAudioUrl: value => value,
    PLAYBACK_SPEEDS: [0.8, 1, 1.25, 1.5, 2],
    manifestData: { audios: Object.fromEntries(ids.map((id, i) => [id, {
      type: 'bible', status: 'published', voicePreset: 'calm', filePath: `https://audio.test/${i}.mp3`
    }])) }
  };
  win.fetch = (url, options) => {
    const request = { url, options };
    requests.push(request);
    const response = { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(8) };
    return deferFetch ? new Promise(resolve => { request.finish = () => resolve(response); }) : Promise.resolve(response);
  };
  let blobId = 0;
  vm.runInNewContext(source, { window: win, document: doc, Audio: Media,
    Blob, AbortController, CustomEvent, setTimeout, clearTimeout,
    URL: { createObjectURL: () => `blob:test-${++blobId}`, revokeObjectURL: u => revoked.push(u) },
    console: { log() {}, warn() {}, error() {} } });
  return { engine: win.GOMNA_AUDIO_ENGINE, win, instances, requests, revoked };
}

test('first target is prepared silently and the first tap reuses its in-flight request', async () => {
  const { engine, instances } = setup();
  assert.equal(engine.prepareBibleAudio(ids[0]), true);
  const prepared = instances[0];
  assert.equal(prepared.playCount, 0);
  assert.equal(prepared.loadCount, 1);
  engine.prepareBibleAudio(ids[0]);
  assert.equal(instances.length, 1);
  engine.playAudioQueue([ids[0]], { source: 'single' });
  assert.equal(engine._state.currentAudio, prepared);
  assert.equal(prepared.playCount, 1); // synchronously, inside the user gesture
  assert.equal(prepared.loadCount, 1); // no second load
  await tick();
  assert.equal(engine.getState().isLoading, false);
});

test('changing idle selection cancels the previous warmup without playing it', () => {
  const { engine, instances } = setup();
  engine.prepareBibleAudio(ids[0]);
  engine.prepareBibleAudio(ids[1]);
  assert.equal(instances[0].src, '');
  assert.equal(instances[0].playCount, 0);
  assert.equal(engine._state.preparedAudioId, ids[1]);
  engine.stopAudio();
  assert.equal(instances[1].src, '');
});

test('a different clicked verse cannot play the idle warmup for the previous verse', () => {
  const { engine, instances } = setup({ manualPlay: true });
  engine.prepareBibleAudio(ids[0]);
  engine.playAudioQueue([ids[1]]);
  assert.equal(instances[0].playCount, 0);
  assert.equal(engine._state.currentAudio.src, 'https://audio.test/1.mp3');
});

test('an errored prepared element is discarded and native loading can recover', () => {
  const { engine, instances } = setup({ manualPlay: true });
  engine.prepareBibleAudio(ids[0]);
  instances[0].error = { code: 2 };
  engine.playAudioQueue([ids[0]]);
  assert.notEqual(engine._state.currentAudio, instances[0]);
  assert.equal(engine._state.currentAudio.playCount, 1);
});

test('next request starts after first playing; repeated Listen taps cannot cancel startup', () => {
  const { engine, requests } = setup({ manualPlay: true });
  engine.playAudioQueue(ids.slice(0, 2), { source: 'chapter' });
  const audio = engine._state.currentAudio;
  assert.equal(requests.length, 0);
  engine.playAudioQueue(ids.slice(0, 2), { source: 'chapter' });
  engine.playAudioById(ids[0]);
  assert.equal(audio.playCount, 1);
  assert.equal(audio.paused, false);
  assert.equal(engine.getState().isLoading, true);
  audio.dispatchEvent(new Event('playing'));
  assert.equal(requests.length, 1);
  assert.equal(engine.getState().isLoading, false);
});

test('explicit pause and stop still work before the first sound', () => {
  const { engine } = setup({ manualPlay: true });
  engine.playAudioQueue([ids[0]]);
  const audio = engine._state.currentAudio;
  engine.pauseAudio();
  assert.equal(audio.paused, true);
  assert.equal(engine.getState().isPaused, true);
  assert.equal(engine.getState().isLoading, false);
  engine.stopAudio();
  assert.equal(engine.getState().queueActive, false);
  assert.equal(engine._state.currentAudio, null);
});

test('v50 Blob survives queue replacement and is consumed using the same media element', async () => {
  const { engine, instances } = setup();
  engine.playAudioQueue(ids.slice(0, 2));
  await tick();
  const audio = engine._state.currentAudio, blob = engine._state.nextPrefetchObjectUrl;
  assert.ok(blob);
  engine.playAudioQueue([ids[1]], { source: 'jump', forceRestart: true });
  assert.equal(engine._state.currentAudio, audio);
  assert.equal(audio.src, blob);
  assert.equal(audio.loadCount, 1);
  assert.equal(instances.length, 1);
  await tick();
  engine.stopAudio();
});

test('next chapter Blob survives ended -> queue complete -> next chapter start', async () => {
  const { engine, win } = setup();
  win.getContinuousNextChapterFirstAudioId = () => ids[2];
  engine.playAudioQueue([ids[1]], { source: 'chapter2' });
  await tick();
  const blob = engine._state.nextPrefetchObjectUrl;
  const audio = engine._state.currentAudio;
  audio.ended = true;
  audio.dispatchEvent(new Event('ended'));
  assert.equal(engine._state.nextPrefetchObjectUrl, blob);
  win.getContinuousNextChapterFirstAudioId = () => null;
  engine.playAudioQueue([ids[2]], { source: 'chapter3' });
  assert.equal(engine._state.currentAudio, audio);
  assert.equal(engine._state.currentAudio.src, blob);
  await tick();
  engine.stopAudio();
});

test('unfinished next fetch is aborted before native loading and stale completion cannot replace it', async () => {
  const { engine, requests, revoked } = setup({ deferFetch: true });
  engine.playAudioQueue(ids.slice(0, 2));
  await tick();
  const first = engine._state.currentAudio;
  first.ended = true;
  first.dispatchEvent(new Event('ended'));
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(engine._state.currentAudio.src, 'https://audio.test/1.mp3');
  requests[0].finish();
  await tick();
  assert.equal(engine._state.nextPrefetchReady, false);
  assert.equal(engine._state.currentAudio.src, 'https://audio.test/1.mp3');
  assert.equal(revoked.length, 1);
});

test('stop aborts background download and late completion cannot restart audio', async () => {
  const { engine, requests } = setup({ deferFetch: true });
  engine.playAudioQueue(ids.slice(0, 2));
  await tick();
  engine.stopAudio();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].finish();
  await tick();
  assert.equal(engine._state.currentAudio, null);
  assert.equal(engine._state.nextPrefetchReady, false);
});

test('warmup never competes with an active or paused queue', async () => {
  const { engine, instances } = setup();
  engine.playAudioQueue([ids[0]]);
  await tick();
  assert.equal(engine.prepareBibleAudio(ids[1]), false);
  engine.pauseAudio();
  assert.equal(engine.prepareBibleAudio(ids[1]), false);
  assert.equal(instances.length, 1);
});

test('original pitch and user speed survive warmup, transition, and resume', async () => {
  const { engine } = setup();
  engine.changeSpeed(1.25);
  engine.prepareBibleAudio(ids[0]);
  engine.playAudioQueue(ids.slice(0, 2));
  await tick();
  const audio = engine._state.currentAudio;
  assert.equal(audio.playbackRate, 1.25);
  assert.equal(audio.preservesPitch, true);
  assert.equal(audio.webkitPreservesPitch, true);
  audio.ended = true; audio.dispatchEvent(new Event('ended'));
  await tick();
  assert.equal(audio.playbackRate, 1.25);
  engine.pauseAudio(); audio.playbackRate = 1; audio.preservesPitch = false;
  engine.resumeAudio();
  assert.equal(audio.playbackRate, 1.25);
  assert.equal(audio.preservesPitch, true);
});

const reader = fs.readFileSync(new URL('../../reader.html', import.meta.url), 'utf8');
function readerWarmup({ selected = [], daily = null, occurrence = 1, active = true, queueActive = false } = {}) {
  const calls = [];
  const win = new EventTarget();
  win.GOMNA_AUDIO_CONFIG = { manifestLoadStatus: 'loaded' };
  win.GOMNA_AUDIO_ENGINE = {
    prepareBibleAudio: id => calls.push(id), getState: () => ({ queueActive })
  };
  const doc = new EventTarget();
  doc.getElementById = () => ({ classList: { contains: () => active } });
  const context = { window: win, document: doc, currentBook: { name: '요한복음' }, currentChapter: 2,
    selectedVerseOccurrence: occurrence, getSortedUniqueSelectedVerseNums: () => selected,
    getHomeDailyListenRange: () => daily, getVerseAudioId: (verse, occ) => `${verse}:${occ}`,
    setTimeout: fn => { context.pending = fn; return 1; }, clearTimeout() {} };
  vm.createContext(context);
  const hook = reader.slice(reader.indexOf('var bibleAudioWarmTimer = null;'), reader.indexOf('function getVerseAudioId(verseNum'));
  vm.runInContext(hook, context);
  win.dispatchEvent(new Event('gomna:verse_list_rendered'));
  context.pending();
  return calls;
}

test('Reader warms the selected occurrence, daily range start, or chapter start', () => {
  assert.deepEqual(readerWarmup({ selected: [2], occurrence: 2 }), ['2:2']);
  assert.deepEqual(readerWarmup({ daily: { start: 7 } }), ['7:1']);
  assert.deepEqual(readerWarmup(), ['1:1']);
});

test('Reader does not warm hidden scripture or interrupt an active queue', () => {
  assert.deepEqual(readerWarmup({ active: false }), []);
  assert.deepEqual(readerWarmup({ queueActive: true }), []);
});
