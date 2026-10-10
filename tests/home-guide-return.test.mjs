import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const homeJs = read('js/gomna-home-feed.js');
const homeHtml = read('index.html');
const readerHtml = read('reader.html');
function functionBefore(name, nextName) {
  const start = homeJs.indexOf(`  function ${name}(`);
  const end = homeJs.indexOf(`  function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, name);
  return homeJs.slice(start, end);
}
const restoreSource = functionBefore('readHomeRestoreEntry', 'restoreHomeEntry') +
  functionBefore('restoreHomeEntry', 'extrasFor');
const unexpected = name => () => { throw new Error(`Guide return must not call ${name}`); };
const calls = [];
const context = vm.createContext({
  URLSearchParams,
  location: { search: '?source=home-guide' },
  knownLifeThemeId: id => id,
  knownStoryPersonId: id => id,
  root: { removeAttribute: name => calls.push(['removeAttribute', name]) },
  window: {
    setTimeout: unexpected('setTimeout'),
    requestAnimationFrame: unexpected('requestAnimationFrame')
  },
  setTimeout: unexpected('setTimeout'),
  openCard: unexpected('openCard'),
  startSettleTo1: unexpected('startSettleTo1'),
  startSettleTo2: unexpected('startSettleTo2'),
  startSettleTo3: unexpected('startSettleTo3'),
  fillCopy: unexpected('fillCopy'),
  pinDeckScroll: y => calls.push(['pinDeckScroll', y]),
  lockY3: () => 2160,
  setCard3WheelMask: masked => calls.push(['setCard3WheelMask', masked]),
  apply: (index, instant) => calls.push(['apply', index, instant]),
  card3Settled: false,
  card2Settled: true,
  allowCard3: true,
  allowCard1From2: true,
  allowCard2From3: true,
  settleAnim: true,
  gestureEndedSinceSettle: false,
  lastP: 0
});
vm.runInContext(restoreSource, context);
const entry = context.readHomeRestoreEntry();
assert.equal(entry.kind, 'guide');
assert.equal(context.restoreHomeEntry(entry), true);
assert.deepEqual(calls.filter(call => call[0] === 'apply'), [['apply', 2, true]],
  'Return directly to the story/person card in one paint.');
assert.deepEqual(calls.filter(call => call[0] === 'pinDeckScroll'), [['pinDeckScroll', 2160]]);
assert.deepEqual(calls.filter(call => call[0] === 'setCard3WheelMask'), [['setCard3WheelMask', false]]);
assert.equal(context.lastP, 2);
assert.equal(context.card3Settled, true);
assert.equal(context.card2Settled, false);
for (const name of ['allowCard3', 'allowCard1From2', 'allowCard2From3', 'settleAnim']) {
  assert.equal(context[name], false, name);
}
assert.equal(context.gestureEndedSinceSettle, true);
context.location.search = '?source=home-today';
assert.equal(context.readHomeRestoreEntry().kind, 'today');
context.location.search = '?source=unrelated';
assert.equal(context.readHomeRestoreEntry(), null);

const homeBoot = homeHtml.match(/<script id="home-guide-return-boot">([\s\S]*?)<\/script>/)[1];
const baseImages = JSON.parse(homeJs.match(/var BASE_CARD_IMAGES=(\[[^;]+\]);/)[1]);
function runHomeBoot(search) {
  const classes = new Set(), links = [];
  vm.runInNewContext(homeBoot, {
    location: { search }, URLSearchParams,
    document: {
      documentElement: { classList: { add: name => classes.add(name) } },
      createElement: tag => ({ tag }),
      head: { appendChild: link => links.push(link) }
    }
  });
  return { classes, links };
}
const guideHome = runHomeBoot('?source=home-guide');
assert.ok(guideHome.classes.has('home-guide-return'));
assert.equal(guideHome.links.length, 1);
assert.equal(guideHome.links[0].href, baseImages[2]);
assert.equal(guideHome.links[0].href, 'assets/home/bible-discovery-journey-v5.webp');
assert.ok(fs.existsSync(new URL(`../${guideHome.links[0].href}`, import.meta.url)));
assert.equal(guideHome.links[0].rel, 'preload');
assert.equal(guideHome.links[0].as, 'image');
assert.equal(guideHome.links[0].fetchPriority, 'high');
for (const search of ['', '?source=home-today', '?source=home-life&theme=prayer']) {
  const ordinaryHome = runHomeBoot(search);
  assert.equal(ordinaryHome.classes.size, 0);
  assert.equal(ordinaryHome.links.length, 0);
}
const headStyle = homeHtml.match(/<style id="home-guide-return-style">([\s\S]*?)<\/style>/)[1];
assert.match(headStyle, /\.gomna-home-card:not\(\[data-card="2"\]\)\{[^}]*visibility:hidden!important/);
assert.ok(homeHtml.indexOf('home-guide-return-boot') < homeHtml.indexOf('<body'));

const readerDockBoot = readerHtml.match(/<script>(\/\* v72: reader\.html always uses official dock \*\/[\s\S]*?)<\/script>/)[1];
function readerClasses(search) {
  const classes = new Set();
  vm.runInNewContext(readerDockBoot, {
    location: { search }, URLSearchParams,
    document: { documentElement: { classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name))
    } } }
  });
  return classes;
}
for (const search of [
  '?homeGuide=1',
  '?homeGuide=1&dockPreview=1',
  '?homeGuide=1&testament=old',
  '?homeGuide=1&source=home-daily-read&book=창세기&chapter=1'
]) {
  const classes = readerClasses(search);
  assert.ok(classes.has('reader-dock-active'));
  assert.ok(!classes.has('scripture-entry-pending'),
    `${search} must use guide readiness rather than wait for Bible text.`);
}
assert.ok(readerClasses('').has('scripture-entry-pending'));
assert.ok(readerClasses('?source=home-daily-read&book=창세기&chapter=1').has('scripture-entry-pending'));
assert.ok(readerClasses('?source=home-bible-picker&easy=1').has('home-bible-picker'));
assert.ok(!readerClasses('?favorites').has('scripture-entry-pending'));

console.log('home guide return and independent guide first-paint checks passed');
