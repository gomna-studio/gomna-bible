import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const homeCss = read('js/gomna-home-feed.css');
const homeJs = read('js/gomna-home-feed.js');
const indexHtml = read('index.html');
const readerHtml = read('reader.html');
const meditationHtml = read('meditation.html');
const serviceWorker = read('sw.js');
const guardSource = read('js/gomna-screen-transition.js');

assert.match(homeCss, /\.gomna-home-card\.is-past\s*\{[^}]*visibility:hidden;[^}]*opacity:0;/s);
assert.match(homeJs, /classList\.toggle\('is-past', i<activeIndex\)/);
assert.match(homeJs, /classList\.toggle\('is-future', i>activeIndex\)/);
const release = /const CACHE_VERSION = '([^']+)'/.exec(serviceWorker)[1];
const homeScript = /gomna-home-feed\.js\?v=[a-zA-Z0-9-]+/.exec(indexHtml)[0];
const homeStyle = /gomna-home-feed\.css\?v=[a-zA-Z0-9-]+/.exec(indexHtml)[0];
assert.ok(serviceWorker.includes(homeScript));
assert.ok(serviceWorker.includes(homeStyle));
assert.doesNotMatch(indexHtml, /(?:^|,)button:active(?:\{|:)/m);
assert.doesNotMatch(readerHtml, /(?:^|,)button:active(?:\{|:)/m);

const transitionAsset = /gomna-screen-transition\.js\?v=[a-zA-Z0-9-]+/.exec(indexHtml)[0];
for (const html of [indexHtml, readerHtml, meditationHtml]) {
  assert.ok(html.includes(transitionAsset));
  assert.ok(html.includes('gomna-pwa-recovery.js?v=' + release));
  assert.ok(html.includes('data-release="' + release + '"'));
}
assert.ok(serviceWorker.includes(transitionAsset));

const classes = new Set();
const documentHandlers = new Map();
const windowHandlers = new Map();
const timers = new Map();
let timerId = 0;
let installedStyle = null;
const root = {
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name)
  },
  appendChild: (node) => { installedStyle = node; }
};
const documentStub = {
  hidden: false,
  documentElement: root,
  head: root,
  getElementById: () => installedStyle,
  createElement: () => ({ id: '', textContent: '' }),
  addEventListener: (type, handler) => {
    documentHandlers.set(type, handler);
  }
};
const windowStub = {
  addEventListener: (type, handler) => {
    windowHandlers.set(type, handler);
  }
};
const context = vm.createContext({
  document: documentStub,
  window: windowStub,
  location: {
    href: 'https://gomnastudio.com/index.html',
    origin: 'https://gomnastudio.com',
    pathname: '/index.html',
    search: ''
  },
  URL,
  Object,
  setTimeout: (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimeout: (id) => timers.delete(id)
});
vm.runInContext(guardSource, context, { filename: 'gomna-screen-transition.js' });

assert.ok(installedStyle);
assert.match(installedStyle.textContent, /background:transparent/);
assert.doesNotMatch(installedStyle.textContent, /visibility\s*:\s*hidden|opacity\s*:\s*0|display\s*:\s*none/);
assert.equal(typeof windowStub.GOMNA_SCREEN_TRANSITION.begin, 'function');
const clickHandler = documentHandlers.get('click');
assert.equal(typeof clickHandler, 'function');
assert.ok(!windowHandlers.has('beforeunload'), 'Do not disable Firefox back/forward caching with an unload guard.');

const transition = windowStub.GOMNA_SCREEN_TRANSITION;
const isLeaving = () => classes.has('gomna-route-leaving');
function flushTimers(delay) {
  for (const [id, timer] of [...timers]) {
    if (timer.delay !== delay || !timers.has(id)) continue;
    timers.delete(id);
    timer.callback();
  }
}
function click(anchor, overrides = {}) {
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: {
      closest: (selector) => selector === 'a[href]' ? anchor : null
    },
    ...overrides
  };
  clickHandler(event);
  return event;
}
function link(href, options = {}) {
  return {
    href,
    target: '',
    hasAttribute: () => false,
    ...options
  };
}

assert.ok(transition.begin());
assert.ok(isLeaving());
windowHandlers.get('pageshow')({ persisted: true });
assert.ok(!isLeaving());
assert.equal(timers.size, 0);

const anchor = link('https://gomnastudio.com/reader.html?easy=1');
click(anchor);
assert.ok(!isLeaving(), 'A click handler must be allowed to intercept navigation first.');
flushTimers(0);
assert.ok(isLeaving());
// A slow destination keeps the existing screen visible, then releases a failed request.
assert.ok(timers.size > 0);
flushTimers(5000);
assert.ok(!isLeaving());

for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
  click(anchor, { [modifier]: true });
  flushTimers(0);
  assert.ok(!isLeaving(), modifier);
}
for (const skipped of [
  link('#same-document-panel'),
  link('https://gomnastudio.com/index.html'),
  link('https://example.com/reader.html'),
  link('mailto:hello@example.com'),
  link('javascript:openEasy()'),
  link(anchor.href, { target: '_blank' }),
  link(anchor.href, { hasAttribute: (name) => name === 'download' })
]) {
  click(skipped);
  flushTimers(0);
  assert.ok(!isLeaving(), skipped.href);
}
click(anchor, { button: 1 });
click(anchor, { defaultPrevented: true });
flushTimers(0);
assert.ok(!isLeaving());

const cancelled = click(anchor);
cancelled.defaultPrevented = true; // A later listener turns the link into a same-document panel.
flushTimers(0);
assert.ok(!isLeaving());

const panelControl = {
  matches: () => true,
  getAttribute: () => 'submitSearch(event); openBibleTab(); openScriptureHighlightEntry();'
};
click(null, { target: { closest: (selector) => selector === 'button,[role="button"]' ? panelControl : null } });
flushTimers(0);
assert.ok(!isLeaving(), 'Same-document and empty-search controls must never lock the page.');

for (const destination of ['#panel', 'mailto:test@example.com', 'https://example.com/', 'http://[']) {
  assert.equal(transition.begin(destination), false);
  assert.ok(!isLeaving());
}
assert.equal(transition.begin(anchor.href), true);
windowHandlers.get('pagehide')({ persisted: true });
assert.ok(!isLeaving(), 'The back/forward snapshot must retain an interactive source screen.');
assert.equal(timers.size, 0);

click(anchor);
windowHandlers.get('pagehide')({ persisted: true });
flushTimers(0);
assert.ok(!isLeaving(), 'A queued click must not relock a cached page.');

transition.begin(anchor.href);
documentStub.hidden = false;
documentHandlers.get('visibilitychange')();
assert.ok(!isLeaving());

transition.begin(anchor.href);
documentStub.hidden = true;
flushTimers(5000);
assert.ok(!isLeaving(), 'A failed navigation must release even in a background tab.');

console.log('transition stale-frame regression checks passed');
