import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../js/audio-engine.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ids = ['john.002.001.bible', 'john.002.002.bible', 'john.003.001.bible'];

function setup({ deferFetch = false, manualPlay = false, search = '', selected = [1], queueSource = 'bible-single-verse:test' } = {}) {
  const instances = [], requests = [], revoked = [];
  // Browser EventTarget invokes target capture listeners before target bubble listeners.
  class BrowserTarget {
    constructor() { this.listeners = []; }
    addEventListener(type, fn, opts = {}) { this.listeners.push({ type, fn, once: !!opts.once, capture: opts === true || !!opts.capture }); }
    removeEventListener(type, fn) { this.listeners = this.listeners.filter(x => x.type !== type || x.fn !== fn); }
    dispatchEvent(event) {
      for (const x of this.listeners.filter(x => x.type === event.type).sort((a,b) => Number(b.capture)-Number(a.capture))) {
        if (!this.listeners.includes(x)) continue;
        if (x.once) this.listeners.splice(this.listeners.indexOf(x), 1);
        x.fn(event);
      }
    }
  }
  class Media extends BrowserTarget {
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
  const context = { window: win, document: doc, Audio: Media,
    Blob, AbortController, CustomEvent, setTimeout, clearTimeout,
    URL: { createObjectURL: () => `blob:test-${++blobId}`, revokeObjectURL: u => revoked.push(u) },
    console: { log() {}, warn() {}, error() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const ui = { selected, menu: false, opened: 0, clears: 0, focus: 1, hidden: false, daily: { hidden: false } };
  const button = { attrs: {}, mark: null, setAttribute(k,v) { this.attrs[k]=v; }, querySelector() { return this.mark; }, appendChild(x) { this.mark=x; }, querySelectorAll() { return []; } };
  doc.querySelectorAll = selector => selector.includes('entry-focus') ? (ui.focus ? [{ getAttribute: () => String(ui.focus) }] : []) : [button];
  doc.querySelector = () => null;
  doc.createElement = () => ({ setAttribute() {} });
  doc.getElementById = id => id === 'verseView' ? { classList: { contains: () => !ui.hidden } } : ui.daily;
  Object.assign(context, {
    URLSearchParams, location: { search }, currentBook: { name: '요한복음' }, currentChapter: 2, selectedVerseOccurrence: 1,
    getSortedUniqueSelectedVerseNums: () => ui.selected,
    clearVerseSelection: () => { ui.selected=[]; ui.clears++; }, clearEntryFocusHighlight: () => { ui.focus=0; },
    openVerseListenModeMenu: () => { ui.menu=true; ui.opened++; ui.daily.hidden=false; },
    closeVerseListenModeMenu: () => { ui.menu=false; }, isVerseListenModeMenuOpen: () => ui.menu
  });
  vm.runInContext(fs.readFileSync(new URL('../../js/gomna-bible-listen-controls.js', import.meta.url), 'utf8'), context);
  const engine=win.GOMNA_AUDIO_ENGINE;
  return { engine, win, instances, requests, revoked, ui, button,
    start: (list=ids.slice(0, selected.length)) => engine.playAudioQueue(list, { source: queueSource }),
    end: () => { const media=engine._state.currentAudio; media.ended=true; media.currentTime=media.duration; media.dispatchEvent(new Event('ended')); }
  };
}


test('single natural completion clears selection and opens menu while retaining accepted media', async () => {
 const h=setup(); h.start(); await tick(); const media=h.engine._state.currentAudio; h.end();
 assert.equal(h.ui.clears,1); assert.equal(h.ui.menu,true); assert.equal(h.ui.daily.hidden,true);
 assert.equal(h.engine._state.currentAudio,media); h.engine.stopAudio();
});
test('multiple verses open menu only after every verse naturally ends; Blob transition remains', async () => {
 const h=setup({ selected:[1,2], queueSource:'bible-multi-select:test' }); h.start(); await tick();
 const blob=h.engine._state.nextPrefetchObjectUrl; h.end();
 assert.equal(h.ui.clears,0); assert.equal(h.engine._state.currentAudio.src,blob);
 await tick(); h.end(); assert.equal(h.ui.clears,1); assert.equal(h.ui.opened,1); h.engine.stopAudio();
});
test('stop and pause never clear selection or open completion popup', async () => {
 const h=setup(); h.start(); await tick(); h.engine.pauseAudio(); assert.equal(h.ui.opened,0);
 h.engine.stopAudio(); assert.equal(h.ui.opened,0); assert.deepEqual(h.ui.selected,[1]);
});
test('X keeps selection; following Listen opens menu; changed selection restores usual routing', async () => {
 const h=setup(); h.start(); await tick(); h.engine.stopAudio();
 h.win.dispatchEvent(new Event('gomna:bible-listen-closed'));
 assert.deepEqual(h.ui.selected,[1]); assert.equal(h.ui.opened,0);
 assert.equal(h.win.gomnaBibleListenControlsHandleListen(),true); assert.equal(h.ui.menu,true);
 h.ui.selected=[2]; assert.equal(h.win.gomnaBibleListenControlsHandleListen(),false);
});
test('topic entry and chapter queues never get selected-completion popup', async () => {
 for (const options of [{search:'?source=topic-comfort'}, {queueSource:'chapter:test'}]) {
  const h=setup(options); h.start(); await tick(); h.end(); assert.equal(h.ui.opened,0); assert.equal(h.ui.clears,0); h.engine.stopAudio();
 }
});
test('navigation or changed selection blocks stale completion popup', async () => {
 for (const mode of ['navigation','selection']) {
  const h=setup(); h.start(); await tick();
  if (mode==='navigation') h.win.dispatchEvent(new Event('gomna:verse_list_rendered')); else h.ui.selected=[2];
  h.end(); assert.equal(h.ui.opened,0); h.engine.stopAudio();
 }
});
test('error or incomplete queue cannot masquerade as successful selected completion', async () => {
 const h=setup({selected:[1,2],queueSource:'bible-multi-select:test'}); h.start(); await tick();
 h.win.dispatchEvent(new CustomEvent('audio:error',{detail:{audioId:ids[0]}}));
 h.end(); await tick(); h.end(); assert.equal(h.ui.clears,0); assert.equal(h.ui.opened,0); h.engine.stopAudio();
});
test('pending feedback clears at actual playing and repeated Listen reuses same request', () => {
 const h=setup({manualPlay:true}); h.start(); const media=h.engine._state.currentAudio;
 assert.equal(h.button.attrs['aria-busy'],'true'); h.start(); assert.equal(media.playCount,1);
 media.dispatchEvent(new Event('playing')); assert.equal(h.button.attrs['aria-busy'],'false');
 h.engine.stopAudio();
});
test('mini-player pending toggle is ignored while explicit X remains available', () => {
 const source=fs.readFileSync(new URL('../../js/gomna-audio-ui.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf("      case 'toggle':"),source.indexOf("      case 'skip-verse-prev':"));
 let paused=0; vm.runInNewContext('switch(action) {'+code+'}', {action:'toggle',state:{isLoading:true,isPlaying:true},engine:{pauseAudio(){paused++;}},allowVerseScreenAudioPlayback:()=>true});
 assert.equal(paused,0);
});
