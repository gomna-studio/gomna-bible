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

for (const html of [indexHtml, readerHtml, meditationHtml]) {
  assert.match(html, /gomna-screen-transition\.js\?v=20261003-clean-entry-v3/);
  assert.ok(html.includes('gomna-pwa-recovery.js?v=' + release));
  assert.ok(html.includes('data-release="' + release + '"'));
}
assert.match(serviceWorker, /gomna-screen-transition\.js\?v=20261003-clean-entry-v3/);

const classes = new Set();
let clickHandler = null;
let pageShowHandler = null;
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
    if (type === 'click') clickHandler = handler;
  }
};
const windowStub = {
  addEventListener: (type, handler) => {
    if (type === 'pageshow') pageShowHandler = handler;
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
  setTimeout,
  clearTimeout
});
vm.runInContext(guardSource, context, { filename: 'gomna-screen-transition.js' });

assert.ok(installedStyle);
assert.match(installedStyle.textContent, /background:transparent/);
assert.equal(typeof windowStub.GOMNA_SCREEN_TRANSITION.begin, 'function');
assert.equal(typeof clickHandler, 'function');

windowStub.GOMNA_SCREEN_TRANSITION.begin();
assert.ok(classes.has('gomna-route-leaving'));
pageShowHandler();
assert.ok(!classes.has('gomna-route-leaving'));

const anchor = {
  href: 'https://gomnastudio.com/reader.html?book=test',
  target: '',
  hasAttribute: () => false
};
clickHandler({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: {
    closest: (selector) => selector === 'a[href]' ? anchor : null
  }
});
assert.ok(classes.has('gomna-route-leaving'));
windowStub.GOMNA_SCREEN_TRANSITION.reset();

console.log('transition stale-frame regression checks passed');
