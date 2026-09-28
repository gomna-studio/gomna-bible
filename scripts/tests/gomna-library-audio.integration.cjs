/* Run: node scripts/tests/gomna-library-audio.integration.cjs
 * Exercises the shipped engine and return module together. Only browser DOM,
 * media delivery and timers are simulated; queue and completion code are real.
 * This does not replace a physical iPhone/Safari playback check.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const code = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Extract a complete current production function, skipping JS strings/comments
// and regexp literals while balancing braces. The extracted source itself is
// parsed by vm.Script, so a moved/changed source boundary fails loudly.
function functionAt(source, start) {
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', lineComment = false, blockComment = false, regexp = false, charClass = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (regexp) {
      if (c === '\\') { i++; continue; }
      if (c === '[') charClass = true;
      if (c === ']') charClass = false;
      if (c === '/' && !charClass) regexp = false;
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/') {
      const previous = source.slice(open, i).trimEnd().at(-1);
      if (/[=(,:!&|?\[;{}]/.test(previous || '')) { regexp = true; continue; }
    }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) {
      const fn = source.slice(start, i + 1);
      new vm.Script('(' + fn + ')');
      return fn;
    }
  }
  throw new Error('Could not extract complete production function');
}
function productionFunction(file, name) {
  const source = code(file), match = new RegExp('\\bfunction ' + name + '\\s*\\(').exec(source);
  assert.ok(match, file + ': missing function ' + name);
  return functionAt(source, match.index);
}

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = {}) {
    const capture = options === true || !!options.capture;
    const list = this.listeners.get(type) || [];
    if (!list.some(x => x.fn === fn && x.capture === capture))
      list.push({ fn, capture, once: !!options.once });
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn, options = {}) {
    const capture = options === true || !!options.capture;
    this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x.fn !== fn || x.capture !== capture));
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    // Browser at-target capture handlers run before at-target bubble handlers.
    const snapshot = [...(this.listeners.get(event.type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const item of snapshot) {
      if (!(this.listeners.get(event.type) || []).includes(item)) continue;
      if (item.once) this.removeEventListener(event.type, item.fn, item.capture);
      item.fn.call(this, event);
      if (event.immediateStopped) break;
    }
    return !event.defaultPrevented;
  }
}
class Event {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = this.immediateStopped = true; }
}
class Element extends Target {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
    this.style = {}; this.hidden = false; this.className = ''; this.textContent = '';
    this.classList = { contains: c => this.className.split(/\s+/).includes(c),
      add: c => { if (!this.classList.contains(c)) this.className += ' ' + c; },
      remove: c => { this.className = this.className.split(/\s+/).filter(x => x !== c).join(' '); },
      toggle: (c, yes) => { if (yes === undefined) yes = !this.classList.contains(c); this.classList[yes ? 'add' : 'remove'](c); } };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k === 'id' ? this.id || null : this.attributes[k] ?? null; }
  appendChild(el) { if (el.parentNode) el.remove(); el.parentNode = this; this.children.push(el); return el; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
  insertAdjacentElement(where, el) {
    assert.equal(where, 'afterend');
    el.parentNode = this.parentNode;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this) + 1, 0, el);
  }
  matches(selector) {
    const id = selector.match(/#([\w-]+)/);
    if (id && this.id !== id[1]) return false;
    const classes = [...selector.matchAll(/\.([\w-]+)/g)];
    if (classes.some(m => !this.classList.contains(m[1]))) return false;
    const attrs = [...selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
    return attrs.every(m => m[2] === undefined ? this.getAttribute(m[1]) !== null : this.getAttribute(m[1]) === m[2]);
  }
  querySelectorAll(selector) {
    const last = selector.trim().split(/\s+/).at(-1);
    const out = [];
    const visit = el => { for (const child of el.children) { if (child.matches(last)) out.push(child); visit(child); } };
    visit(this); return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let el = this; el; el = el.parentNode) if (el.matches(selector)) return el; return null; }
  scrollIntoView() {}
  focus() {}
}

function setup({ listen = true, kind = 'people', itemId = 'esther', itemName = '에스더' } = {}) {
  const win = new Target(), doc = new Target(), body = new Element('body');
  const view = body.appendChild(new Element()); view.id = 'verseView'; view.className = 'active';
  const list = view.appendChild(new Element()); list.id = 'verseList';
  for (let verse = 1; verse <= 20; verse++) {
    const row = list.appendChild(new Element()); row.className = 'verse-item'; row.setAttribute('data-verse', verse);
  }
  doc.body = body; doc.documentElement = new Element('html'); doc.readyState = 'complete';
  doc.visibilityState = 'visible';
  doc.getElementById = id => body.querySelector('#' + id);
  doc.createElement = tag => new Element(tag);
  doc.querySelectorAll = selector => body.querySelectorAll(selector);
  doc.querySelector = selector => body.querySelector(selector);
  const timers = new Map(); let timerId = 0;
  const setTimer = (fn, ms = 0) => { timers.set(++timerId, { fn, ms }); return timerId; };
  const clearTimer = id => timers.delete(id);
  const played = [], audios = [], events = [];
  class Audio extends Target {
    constructor() { super(); this.currentTime = 0; this.duration = 10; this.readyState = 4;
      this.paused = true; this.ended = false; this.error = null; this.buffered = { length: 0 }; audios.push(this); }
    get src() { return this._src || ''; }
    set src(value) { this._src = value; this.currentSrc = value; this.currentTime = 0; this.ended = false; this.error = null; }
    load() { this.ended = false; this.error = null; this.dispatchEvent(new Event('loadedmetadata')); }
    play() {
      this.paused = false; played.push(this.src);
      queueMicrotask(() => { if (!this.paused && !this.ended) this.dispatchEvent(new Event('playing')); });
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    finish() { this.currentTime = this.duration; this.ended = true; this.paused = true; this.dispatchEvent(new Event('ended')); }
    fail(code) { this.error = { code }; this.dispatchEvent(new Event('error')); }
  }
  const ids = Array.from({ length: 5 }, (_, i) => `esther.004.${String(13 + i).padStart(3, '0')}.bible`);
  const audiosManifest = {};
  for (let v = 1; v <= 20; v++) {
    const id = `esther.004.${String(v).padStart(3, '0')}.bible`;
    audiosManifest[id] = { status: 'published', voicePreset: 'calm', type: 'bible', filePath: id + '.mp3' };
  }
  const config = { manifestLoadStatus: 'loaded', manifestData: { audios: audiosManifest }, buildAudioUrl: p => 'https://audio.invalid/' + p };
  Object.assign(win, { setTimeout: setTimer, clearTimeout: clearTimer, requestAnimationFrame: fn => setTimer(fn),
    GOMNA_AUDIO_CONFIG: config, GOMNA_AUDIO_TOAST() {}, GOMNA_AUDIO_BOOK: { getBookAudioId: () => 'esther' } });
  const source = `bible-library:${kind}:${itemId}`;
  const location = { search: '?' + new URLSearchParams({ libraryKind: kind, libraryId: itemId, libraryName: itemName,
    book: '에스더', chapter: 4, verseStart: 13, verseEnd: 17, startVerse: 13, endVerse: 17,
    source: 'home-main-listen', ...(listen ? { listen: 1 } : {}) }), href: '' };
  const genericCalled = [];
  const context = vm.createContext({ window: win, document: doc, location, Audio, Event, CustomEvent: Event,
    URL, URLSearchParams, Number, Math, JSON, Date, Promise, console: { log() {}, warn() {}, error() {} },
    setTimeout: setTimer, clearTimeout: clearTimer, requestAnimationFrame: fn => setTimer(fn),
    currentBook: { name: '에스더' }, currentChapter: 4, GOMNA_AUDIO_BOOK: win.GOMNA_AUDIO_BOOK,
    clearBibleContinuousChapterPlayback() { win.__gomnaBibleContinuousChapterPlayback = false; },
    isReaderVerseViewActive: () => true, isBibleListenPlaybackActive: () => !!win.GOMNA_AUDIO_ENGINE.getState().queueActive,
    allowVerseScreenAudioPlayback: () => true, syncScriptureDockActive() {},
    isBibleAudioManifestReady: () => true, isCurrentChapterBibleAudioPublished: () => true,
    updateOpt4BottomBar() {}, closeVerseListenModeMenu() {},
    playChapterAudio() { genericCalled.push('playChapterAudio'); throw new Error('unexpected generic chapter playback'); },
    collectRenderedBibleAudioIds() { genericCalled.push('collectRenderedBibleAudioIds'); throw new Error('unexpected generic range fallback'); },
    playBibleQueueJump() { genericCalled.push('playBibleQueueJump'); throw new Error('unexpected generic verse jump'); }
  });
  for (const name of ['formatBibleVerseSegment', 'getVerseOccurrenceFromItem', 'getVerseAudioId', 'getVerseAudioIdFromItem',
    'getChapterAudioIds', 'handleScriptureDock', 'tryJumpBiblePlaybackToVerse'])
    vm.runInContext(productionFunction('reader.html', name), context, { filename: 'reader.html:' + name });
  for (const name of ['parseAudioIdParts', 'getCurrentVerseCountValue', 'isCommentaryPlaybackAudioId',
    'playVisibleVerseRange', 'playVerseToChapterEnd', 'skipBibleVerse', 'updateVerseSkipButtons'])
    vm.runInContext(productionFunction('js/gomna-audio-ui.js', name), context, { filename: 'gomna-audio-ui.js:' + name });
  const reader = code('reader.html'), toolbarMarker = "listenBtn.addEventListener('click', function(e)";
  const toolbarStart = reader.indexOf(toolbarMarker);
  assert.ok(toolbarStart >= 0, 'actual Reader toolbar listener is present');
  vm.runInContext('var actualToolbarListen = ' + functionAt(reader, reader.indexOf('function(e)', toolbarStart)) + ';', context);
  for (const file of ['js/audio-engine.js', 'js/gomna-library-return.js']) vm.runInContext(code(file), context, { filename: file });
  win.addEventListener('audio:end', e => events.push(plain(e.detail)));
  const engine = win.GOMNA_AUDIO_ENGINE;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { win, doc, ids, engine, played, audios, events, source, context, genericCalled,
    box: () => doc.getElementById('gomnaLibraryReturn'), flush,
    async start() { assert.equal(win.gomnaLibraryListen.play(), true); await flush(); },
    async finishOne() { assert.ok(engine._state.currentAudioId, 'there must be an active verse'); engine._state.currentAudio.finish(); await flush(); },
    async runTimer() { const first = [...timers.entries()].sort((a, b) => a[1].ms - b[1].ms)[0]; assert.ok(first, 'engine scheduled recovery'); timers.delete(first[0]); first[1].fn(); await flush(); }
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assertReturn(h) {
  assert.equal(h.box().hidden, false, 'return button is visible');
  const link = h.box().children[0];
  assert.match(link.href, /#bible-library\/people\/esther$/);
  assert.equal(link.textContent, '← 에스더로 돌아가기');
  const lastRow = h.doc.querySelector('#verseList .verse-item[data-verse="17"]');
  assert.equal(lastRow.parentNode.children[lastRow.parentNode.children.indexOf(lastRow) + 1], h.box());
}

test('five verses finish on the same Audio object, stop exactly at 17, and expose return link', async () => {
  const h = setup(); assert.equal(h.box().hidden, true); await h.start();
  const media = h.engine._state.currentAudio;
  for (let i = 0; i < h.ids.length; i++) {
    assert.equal(h.engine._state.currentAudioId, h.ids[i]);
    assert.equal(h.engine._state.currentAudio, media, 'engine reuses its authorized media element');
    assert.equal(h.box().hidden, true, 'return remains hidden before last native ended');
    await h.finishOne();
  }
  assert.equal(h.engine.getState().queueActive, false);
  assert.equal(h.engine.getState().isPlaying, false);
  assert.equal(h.engine.getState().currentAudioId, null);
  assert.deepEqual(h.played.map(url => url.split('/').at(-1).replace(/\.mp3$/, '')), h.ids);
  assertReturn(h);
  assert.deepEqual(h.events.at(-1).queueAudioIds, h.ids);
  assert.deepEqual(h.events.at(-1).completedAudioIds, h.ids);
  assert.equal(h.events.at(-1).queueSource, h.source);
});

test('recovering verse 14 at the same queue index still completes all five verses', async () => {
  const h = setup(); await h.start(); await h.finishOne();
  const media = h.engine._state.currentAudio;
  media.currentTime = 3;
  h.engine._recoverStalledCurrentAudio(media, h.ids[1], h.engine._state.queueEpoch);
  await h.runTimer();
  assert.equal(h.engine.getState().queueIndex, 1);
  assert.equal(h.engine.getState().currentAudioId, h.ids[1]);
  for (let i = 1; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
  assert.deepEqual(h.events.at(-1).completedAudioIds, h.ids);
  assert.deepEqual(h.played.map(url => url.split('/').at(-1).replace(/\.mp3$/, '')), [h.ids[0], h.ids[1], ...h.ids.slice(1)]);
});

test('same-chapter text rerender does not discard a playing range completion', async () => {
  const h = setup(); await h.start(); await h.finishOne();
  h.box().remove();
  h.win.dispatchEvent(new Event('gomna:verse_list_rendered', { detail: { bookName: '에스더', chapter: 4 } }));
  for (let i = 1; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
});

test('repeated Listen pauses and resumes the same bounded range', async () => {
  const h = setup(); await h.start(); await h.finishOne();
  const epoch = h.engine._state.queueEpoch;
  assert.equal(h.win.gomnaLibraryListen.play(), true); await h.flush();
  assert.equal(h.engine.getState().isPaused, true);
  assert.equal(h.engine._state.queueEpoch, epoch);
  assert.equal(h.win.gomnaLibraryListen.play(), true); await h.flush();
  assert.equal(h.engine.getState().isPlaying, true);
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids);
  for (let i = 1; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
});

test('verse taps remain bounded by the highlighted final verse', async () => {
  const h = setup(); await h.start();
  const epoch = h.engine._state.queueEpoch;
  assert.equal(h.win.gomnaLibraryListen.jump(18), true);
  assert.equal(h.engine._state.queueEpoch, epoch, 'out-of-range tap leaves playback unchanged');
  assert.equal(h.win.gomnaLibraryListen.jump(15), true); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids.slice(2));
  for (let i = 2; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
  assert.ok(!h.played.some(url => /\.018\./.test(url)));
});

test('per-verse audio action cannot expand into chapter-end playback', async () => {
  const h = setup();
  assert.equal(h.win.gomnaLibraryListen.jumpAudio(h.ids[1]), true); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids.slice(1));
  for (let i = 1; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
  assert.deepEqual(h.played.map(url => url.split('/').at(-1).replace(/\.mp3$/, '')), h.ids.slice(1));
});

test('real playAudioRange preserves range IDs and optional library queue source', async () => {
  const h = setup();
  assert.equal(h.engine.playAudioRange('esther', 4, 13, 17, { source: h.source }), true); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids);
  for (let i = 0; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
});

for (const route of ['toolbar', 'dock', 'range-button', 'range-to-end-button']) {
  test('actual ' + route + ' handler starts only highlighted 13–17 and completes into the return link', async () => {
    const h = setup();
    if (route === 'toolbar') h.context.actualToolbarListen(new Event('click'));
    else if (route === 'dock') h.context.handleScriptureDock('listen');
    else h.context.playVisibleVerseRange(route === 'range-to-end-button');
    await h.flush();
    assert.deepEqual(h.genericCalled, []);
    assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids);
    assert.equal(h.engine.getState().queueSource, h.source);
    for (let i = 0; i < h.ids.length; i++) await h.finishOne();
    assertReturn(h);
    assert.deepEqual(h.played.map(url => url.split('/').at(-1).replace(/\.mp3$/, '')), h.ids);
  });
}

test('actual Reader verse-tap handler cannot turn bounded listening into chapter playback', async () => {
  const h = setup(); await h.start();
  assert.equal(h.context.tryJumpBiblePlaybackToVerse(15, h.doc.querySelector('[data-verse="15"]')), true);
  await h.flush();
  assert.deepEqual(h.genericCalled, []);
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids.slice(2));
  for (let i = 2; i < h.ids.length; i++) await h.finishOne();
  assertReturn(h);
});

test('actual per-verse listen and mini-player next handlers retain the highlighted end boundary', async () => {
  const h = setup();
  h.context.playVerseToChapterEnd(h.ids[0]); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids);
  assert.equal(h.context.skipBibleVerse(1), true); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids.slice(1));
  assert.equal(h.context.skipBibleVerse(-1), true); await h.flush();
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), h.ids);
  const epoch = h.engine._state.queueEpoch;
  h.context.skipBibleVerse(-1); await h.flush();
  assert.equal(h.engine._state.queueEpoch, epoch, 'previous at 13 does not reach 12');
  for (let i = 0; i < h.ids.length - 1; i++) await h.finishOne();
  const lastEpoch = h.engine._state.queueEpoch;
  h.context.skipBibleVerse(1); await h.flush();
  assert.equal(h.engine._state.queueEpoch, lastEpoch, 'next at 17 does not reach 18');
  await h.finishOne();
  assertReturn(h);
  assert.deepEqual(h.genericCalled, []);
  assert.ok(h.played.every(url => /\.0(?:13|14|15|16|17)\.bible\.mp3$/.test(url)));
});

test('explicit stop before verse 17 never shows a completion button', async () => {
  const h = setup(); await h.start(); await h.finishOne();
  h.engine.stopAudio(); await h.flush();
  assert.equal(h.box().hidden, true);
  assert.equal(h.events.at(-1).reason, 'user_stop');
  assert.equal(h.engine.getState().queueActive, false);
});

test('a decoded-media error skips a verse but must not count as having listened to all five', async () => {
  const h = setup(); await h.start(); await h.finishOne();
  h.engine._state.currentAudio.fail(3); await h.flush();
  assert.equal(h.engine.getState().currentAudioId, h.ids[2]);
  for (let i = 2; i < h.ids.length; i++) await h.finishOne();
  assert.equal(h.box().hidden, true);
  assert.ok(!((h.events.at(-1).completedAudioIds || []).includes(h.ids[1])));
});

test('chapter playback with a different source does not complete the library task', async () => {
  const h = setup(); h.engine.playAudioQueue(h.ids, { source: 'bible-chapter:esther.004' }); await h.flush();
  for (let i = 0; i < h.ids.length; i++) await h.finishOne();
  assert.equal(h.box().hidden, true);
});

test('read entry immediately displays its correct detail return link', async () => {
  const h = setup({ listen: false }); assertReturn(h);
  assert.equal(h.win.gomnaLibraryListen.play(), false, 'read entry keeps normal Reader listening behavior');
  assert.equal(h.engine.getState().queueActive, false);
});

test('ordinary Reader chapter handler still plays the full chapter without a library controller', async () => {
  const h = setup({ listen: false });
  delete h.win.gomnaLibraryListen;
  vm.runInContext(productionFunction('reader.html', 'playChapterAudio'), h.context);
  h.context.playChapterAudio({ continuous: false }); await h.flush();
  const chapterIds = Array.from({ length: 20 }, (_, i) => `esther.004.${String(i + 1).padStart(3, '0')}.bible`);
  assert.deepEqual(plain(h.engine.getState().queueAudioIds), chapterIds);
  assert.equal(h.engine.getState().queueSource, 'bible-chapter:esther.004.001');
  for (let i = 0; i < chapterIds.length; i++) await h.finishOne();
  assert.deepEqual(h.played.map(url => url.split('/').at(-1).replace(/\.mp3$/, '')), chapterIds);
  assert.equal(h.engine.getState().queueActive, false);
});

test('story entry completes into the original story detail', async () => {
  const h = setup({ kind: 'stories', itemId: 'purim', itemName: '부림절' }); await h.start();
  for (let i = 0; i < h.ids.length; i++) await h.finishOne();
  assert.equal(h.box().hidden, false);
  assert.match(h.box().children[0].href, /#bible-library\/stories\/purim$/);
  assert.equal(h.box().children[0].textContent, '← 부림절 이야기로 돌아가기');
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  console.log(`${tests.length - failed}/${tests.length} integration scenarios passed`);
  process.exitCode = failed ? 1 : 0;
})();
