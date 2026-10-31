// DOM/startup simulation: hold deferred scripts and Bible downloads separately.
// This is not a rendering benchmark or a physical Android test.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths: [process.env.GOMNA_QA_MODULES || process.cwd()] }));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const hook = scripts.findIndex(m => /id="reader-local-panel-entry"/.test(m[1]));
assert.ok(hook > 0, 'local entry must have an explicit pre-dependency hook');
assert.ok(scripts.findIndex(m => /gomna-home-resume\.js/.test(m[1])) < hook, 'resume API precedes local rendering');
assert.ok(scripts.findIndex(m => /src="\/analytics\.js/.test(m[1])) > hook, 'analytics must not delay local entry');

function boot(query, saved = true) {
  const virtualConsole = new VirtualConsole();
  const failures = [];
  virtualConsole.on('jsdomError', e => { if (!/navigation|scrollTo|CSS/.test(e.message)) failures.push(e.message); });
  const dom = new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''), {
    url: 'https://preview.test/reader.html' + query, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const w = dom.window;
  const ready = [], frames = new Map(), timers = new Map();
  let sequence = 0;
  Object.defineProperty(w.document, 'readyState', { configurable: true, value: 'loading' });
  const addListener = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = function(type, fn, options) {
    if (type === 'DOMContentLoaded') ready.push(fn);
    else addListener(type, fn, options);
  };
  w.requestAnimationFrame = fn => { const id = ++sequence; frames.set(id, fn); return id; };
  w.cancelAnimationFrame = id => frames.delete(id);
  w.setTimeout = (fn, delay = 0) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function() {};
  w.HTMLElement.prototype.scrollTo = function() {};
  w.fetch = () => new Promise(() => {});
  w.localStorage.setItem('gomna_ui_language', 'ko');
  w.localStorage.setItem('gomna_resume_read_v1', JSON.stringify({ bookName: '마태복음', chapter: 11, verse: 28, timestamp: Date.now() }));
  if (saved) w.localStorage.setItem('favorites', JSON.stringify([
    { id: 'saved-one', ref: '마태복음 11:28', book: '마태복음', chapter: 11, verse: 28, text: '수고하고 무거운 짐 진 자들아 다 내게로 오라', createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }
  ]));
  function execute(script) {
    const attr = script[1], body = script[2];
    if (/application\/ld\+json|\bdefer\b|\basync\b/.test(attr)) return;
    const src = attr.match(/\bsrc="([^"]+)"/);
    if (src) {
      const url = new URL(src[1], w.location.href);
      if (url.origin !== w.location.origin) return;
      w.eval(fs.readFileSync(path.join(root, url.pathname.slice(1)), 'utf8'));
    } else w.eval(body);
  }
  for (let i = 0; i <= hook; i++) execute(scripts[i]);
  function frame() {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(16));
  }
  function zeroTimers() {
    for (const [id, item] of [...timers]) if (item.delay === 0) { timers.delete(id); item.fn(); }
  }
  return {
    w, failures, close: () => w.close(),
    releaseDOMContentLoaded() {
      Object.defineProperty(w.document, 'readyState', { configurable: true, value: 'interactive' });
      for (const fn of ready) fn.call(w.document, new w.Event('DOMContentLoaded'));
      // The real language boot may run before or after panel boot. Exercise the later case.
      if (w.GomnaUII18n) w.GomnaUII18n.apply('ko');
    },
    startDownloads() { frame(); zeroTimers(); },
    finishBible() {
      const downloads = [...w.document.querySelectorAll('script[src]')].filter(s => /\/(old|new)_testament\.js/.test(s.src));
      assert.equal(downloads.length, 2, 'one download per testament');
      for (const script of downloads) {
        const filename = new URL(script.src).pathname.slice(1);
        w.eval(fs.readFileSync(path.join(root, filename), 'utf8'));
        script.dispatchEvent(new w.Event('load'));
      }
      for (let i = 0; i < 4; i++) { frame(); zeroTimers(); }
    }
  };
}

function assertPanel(w, id, title) {
  assert.equal(w.document.querySelector('main.content .view.active').id, id);
  assert.equal(w.document.getElementById('readerDockTopTitle').textContent, title);
  assert.equal(w.document.documentElement.classList.contains('reader-panel-entry-pending'), false, 'correct local panel is visible');
}

for (const query of ['?easy=1', '?easy=1&testament=old', '?favorites=1', '?favorites&testament=new']) {
  const run = boot(query);
  try {
    const { w } = run;
    const find = query.includes('easy');
    assertPanel(w, find ? 'easyView' : 'favView', find ? '찾기' : '내 보관함');
    assert.equal(w.__gomnaBibleDataReady, false);
    assert.equal(w.document.querySelectorAll('script[src*="old_testament"]').length, 0);
    assert.match(w.document.getElementById('favResultsArea').textContent, /수고하고/);
    if (find) {
      assert.match(w.document.querySelector('[data-easy-resume="read"]').textContent, /마태복음 11:28/);
      const input = w.document.getElementById('easyFindSearchInput');
      const focusClick = new w.MouseEvent('click', { bubbles: true, cancelable: true });
      input.dispatchEvent(focusClick); assert.equal(focusClick.defaultPrevented, false);
    }
    // Changing the destination while account/translation/Bible scripts are delayed must stick.
    w.handleScriptureDock(find ? 'archive' : 'find');
    const expected = find ? ['favView', '내 보관함'] : ['easyView', '찾기'];
    if (!find) {
      w.document.getElementById('easyFindSearchInput').value = '사랑';
      w.document.getElementById('easyFindSearchInput').dispatchEvent(new w.Event('input', { bubbles: true }));
    }
    run.releaseDOMContentLoaded();
    assertPanel(w, ...expected);
    run.startDownloads();
    run.finishBible();
    assertPanel(w, ...expected);
    if (!find) assert.equal(w.document.getElementById('easyFindSearchInput').value, '사랑', 'late data does not erase the typed query');
    assert.deepEqual(run.failures, []);
  } finally { run.close(); }
}

const empty = boot('?favorites', false);
try {
  assertPanel(empty.w, 'favView', '내 보관함');
  assert.match(empty.w.document.getElementById('favResultsArea').textContent, /아직 저장한 말씀이 없습니다/);
} finally { empty.close(); }

const actions = boot('?easy=1');
try {
  const { w } = actions;
  let route = null;
  w.GOMNA_HOME_RESUME.openBibleTab = () => { route = w.GOMNA_HOME_RESUME.getRead(); };
  w.handleScriptureDock('bible');
  assert.equal(route.bookName, '마태복음'); assert.equal(route.chapter, 11); assert.equal(route.verse, 28);
  assertPanel(w, 'easyView', '찾기');
  w.document.querySelector('[data-easy-tst]').click();
  assert.equal(typeof w._gomnaPendingEasyAction, 'function');
  w.handleScriptureDock('archive'); w.handleScriptureDock('find');
  assert.equal(w._gomnaPendingEasyAction, null, 'leaving and returning cancels stale delayed intent');
  actions.startDownloads(); actions.finishBible();
  assert.equal(w.document.getElementById('bibleStairOverlay')?.classList.contains('is-open') || false, false, 'a cancelled old selection never opens later');
  assertPanel(w, 'easyView', '찾기');
} finally { actions.close(); }
console.log('PASS: local Find/Archive before deferred scripts and Bible data; late DCL/i18n/data preserve destination and typed query; resume, saved/empty archive, stale action cancellation');
