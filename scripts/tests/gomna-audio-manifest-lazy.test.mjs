import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../js/audio-config.js', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../../reader.html', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(search, { active = false, hasVerse = false } = {}) {
  const window = new EventTarget(), serviceWorker = new EventTarget(), requests = [], events = [];
  window.location = { search };
  const state = { active, hasVerse };
  const verse = { classList: { contains: () => state.active }, querySelector: () => state.hasVerse ? {} : null };
  window.addEventListener('gomna:manifest_loaded', e => events.push(e.detail));
  vm.runInNewContext(source, { window, document: { getElementById: () => verse },
    navigator: { serviceWorker }, URLSearchParams, Promise, CustomEvent,
    console: {log() {}, error() {}},
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, fail: reject, finish: data => resolve({ok: true, json: () => Promise.resolve(data)}) });
    })
  });
  return { window, serviceWorker, requests, events, state, config: window.GOMNA_AUDIO_CONFIG };
}
const manifest = id => ({totalAudios: 1, audios: {[id]: {status: 'published'}}});
const update = sw => sw.dispatchEvent(new MessageEvent('message', {data: {type: 'GOMNA_AUDIO_MANIFEST_UPDATED'}}));

for (const query of ['?easy', '?easy=1', '?easy=0', '?favorites', '?favorites=1', '?source=home-bible-picker']) {
  test(`local panel ${query} has zero manifest requests, even after a worker update`, () => {
    const f = setup(query);
    assert.equal(f.requests.length, 0);
    assert.equal(f.config.manifestLoadStatus, 'pending');
    update(f.serviceWorker);
    assert.equal(f.requests.length, 0);
  });
}
for (const query of ['', '?book=창세기&chapter=1', '?book=시편&chapter=4&easy=1', '?source=home-resume-listen&book=민수기&chapter=2', '?homeGuide=1&easy=1']) {
  test(`reading route ${query} retains eager audio preparation`, () => {
    const f = setup(query);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, '/audio/audio-manifest.json');
    assert.equal(f.config.manifestLoadStatus, 'loading');
  });
}
test('local route that already shows a real passage starts audio preparation', () => {
  const f = setup('?easy=1', {active: true, hasVerse: true});
  assert.equal(f.requests.length, 1);
});
test('hidden and empty verse shells do not load audio; actual passage rendering does', () => {
  const f = setup('?favorites');
  f.window.dispatchEvent(new Event('gomna:verse_list_rendered'));
  f.state.active = true;
  f.window.dispatchEvent(new Event('gomna:verse_list_rendered'));
  assert.equal(f.requests.length, 0);
  f.state.hasVerse = true;
  f.window.dispatchEvent(new Event('gomna:verse_list_rendered'));
  assert.equal(f.requests.length, 1);
});
test('picker remains audio-free even if its underlying Reader has a verse', () => {
  const f = setup('?source=home-bible-picker', {active: true, hasVerse: true});
  f.window.dispatchEvent(new Event('gomna:verse_list_rendered'));
  assert.equal(f.requests.length, 0);
});
test('explicit audio intent starts one request and concurrent callers reuse it', async () => {
  const f = setup('?favorites');
  f.window.dispatchEvent(new Event('audio:attempt'));
  const first = f.config.ensureManifest();
  assert.equal(f.config.ensureManifest(), first);
  f.window.dispatchEvent(new Event('audio:attempt'));
  assert.equal(f.requests.length, 1);
  const data = manifest('genesis.001.001.bible');
  f.requests[0].finish(data);
  assert.equal(await first, data);
  assert.equal(f.config.manifestData, data);
  assert.equal(f.config.manifestLoadStatus, 'loaded');
  assert.equal(f.events.length, 1);
  await f.config.ensureManifest();
  assert.equal(f.requests.length, 1);
});
test('failed or malformed initial manifest can be retried explicitly', async () => {
  for (const malformed of [false, true]) {
    const f = setup('?easy=1');
    const first = f.config.ensureManifest();
    if (malformed) f.requests[0].finish({}); else f.requests[0].fail(new Error('network'));
    await first;
    assert.equal(f.config.manifestLoadStatus, 'error');
    const retry = f.config.ensureManifest();
    assert.equal(f.requests.length, 2);
    const data = manifest('retry');
    f.requests[1].finish(data);
    await retry;
    assert.equal(f.config.manifestData, data);
    assert.equal(f.config.manifestLoadStatus, 'loaded');
  }
});
test('worker refresh supersedes an in-flight old response without stale overwrite', async () => {
  const f = setup('?book=창세기&chapter=1');
  update(f.serviceWorker);
  assert.equal(f.requests.length, 2);
  const newest = manifest('new');
  f.requests[1].finish(newest);
  await tick();
  f.requests[0].finish(manifest('old'));
  await tick();
  assert.equal(f.config.manifestData, newest);
  assert.equal(f.events.length, 1);
  update(f.serviceWorker);
  assert.equal(f.requests.length, 3);
  f.requests[2].fail(new Error('refresh failed'));
  await tick();
  assert.equal(f.config.manifestData, newest);
  assert.equal(f.config.manifestLoadStatus, 'loaded');
});
test('both Reader wait paths explicitly start the dormant manifest after attaching the listener', () => {
  const dock = reader.slice(reader.indexOf('function queueDockListenAfterManifest()'), reader.indexOf('function isBibleTextReady()'));
  const manual = reader.slice(reader.indexOf('function queueUntilManifest(action)'), reader.indexOf('window.gomnaReaderWaitForAudioManifest='));
  for (const [script, call] of [[dock, 'queueDockListenAfterManifest()'], [manual, 'queueUntilManifest(function(){})']]) {
    const calls = [];
    const window = { currentBook: {name:'민수기'}, currentChapter: 2,
      GOMNA_AUDIO_CONFIG: {manifestLoadStatus:'pending', ensureManifest: () => calls.push('ensure')},
      addEventListener: () => calls.push('listen') };
    vm.runInNewContext(script + '\n' + call, {window, pending: null, pendingDockListenTimer: null, setTimeout: () => 1});
    assert.deepEqual(calls, ['listen', 'ensure']);
  }
});
test('another tap while a failed request is queued can retry without a second listener', () => {
  const dock = reader.slice(reader.indexOf('function queueDockListenAfterManifest()'), reader.indexOf('function isBibleTextReady()'));
  const manual = reader.slice(reader.indexOf('function queueUntilManifest(action)'), reader.indexOf('window.gomnaReaderWaitForAudioManifest='));
  for (const [script, call] of [[dock, 'queueDockListenAfterManifest()'], [manual, 'queueUntilManifest(function(){})']]) {
    const calls = [];
    const window = {GOMNA_AUDIO_CONFIG: {manifestLoadStatus:'error', ensureManifest: () => calls.push('retry')},
      addEventListener: () => calls.push('unexpected extra listener')};
    vm.runInNewContext(script + '\n' + call, {window, pending: {}, pendingDockListenTimer: 7});
    assert.deepEqual(calls, ['retry']);
  }
});
