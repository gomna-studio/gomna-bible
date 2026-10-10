import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Set GOMNA_HOME_SOURCE to an immutable older file to check the same contract.
const source = fs.readFileSync(process.env.GOMNA_HOME_SOURCE || new URL('../js/gomna-home-feed.js', import.meta.url), 'utf8');

function shippedFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'shipped function exists: ' + name);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', comment = '';
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = ''; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = ''; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function: ' + name);
}

function element(initialClasses = []) {
  const classes = new Set(initialClasses), attributes = new Map();
  return {
    hidden: false, inert: false,
    style: { setProperty(name, value) { this[name] = value; } },
    classList: {
      contains: name => classes.has(name),
      toggle(name, force) { const on = force === undefined ? !classes.has(name) : force; if (on) classes.add(name); else classes.delete(name); },
      add: name => classes.add(name), remove: name => classes.delete(name),
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
  };
}

function fixture(search) {
  const pages = { original: element(), discovery: element() };
  pages.discovery.hidden = pages.discovery.inert = true;
  const cards = [0, 1, 2].map(i => {
    const card = element(i === 0 ? ['is-active'] : ['is-behind']);
    const inner = element();
    inner.setAttribute('data-ghd-pinch', '1');
    card.setAttribute('data-card', i);
    card.querySelector = selector => selector === '.gomna-home-card-inner' ? inner
      : selector === '.gbl-original-page' ? pages.original
      : selector === '.gbl-discover-page' ? pages.discovery : null;
    return card;
  });
  const root = element(), stage = { clientHeight: 600 }, step = { offsetHeight: 400 };
  root.scrollTop = 0;
  root.querySelector = selector => selector === '.gomna-home-deck-step' ? step
    : cards.find(card => selector.includes('data-card="' + card.getAttribute('data-card') + '"')) || null;
  const frames = [], timers = [], opened = [], masks = [];
  const context = vm.createContext({
    root, stage, cards, count: 3, progress: 0, reduce: false, returnTopButton: element(),
    card2Settled: false, card3Settled: false, allowCard3: false, allowCard1From2: false, allowCard2From3: false,
    awaitingDir: false, gestureLive: false, gestureEndedSinceSettle: false, settleAnim: false, settleAnimTimer: 0,
    wheelStepDelta: 0, SETTLE_MS: 180, lastP: 0, pinching: false, ignoreCardClickBefore: 0,
    lifeThemeId: 'new', storyPersonId: 'david',
    LIFE_THEMES: [{ id: 'new' }, { id: 'prayer' }], STORY_PEOPLE: [{ id: 'david' }, { id: 'lot' }],
    location: { search }, URLSearchParams, Date,
    document: { getElementById: () => null },
    window: { requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => { timers.push(fn); return timers.length; } },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    viewH: () => 800, setCard3WheelMask: value => masks.push(value), resetPinchSurface() {},
    fillCopy() {}, openCard: (card, skipHistory) => opened.push({ card, skipHistory }),
  });
  const names = ['knownLifeThemeId', 'knownStoryPersonId', 'readHomeRestoreEntry', 'restoreHomeEntry',
    'showStoryDiscovery', 'startSettleTo3', 'gatedProgress', 'layoutNums', 'apply', 'clamp',
    'pinDeckScroll', 'stepH', 'lockY3', 'syncStepSize'];
  vm.runInContext(names.map(shippedFunction).join('\n'), context);
  return { context, root, stage, cards, pages, frames, timers, opened, masks };
}

test('the guide return route selects discovery and ignores unrelated theme/person parameters', () => {
  const f = fixture('?source=home-guide&theme=prayer&person=david');
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.readHomeRestoreEntry())), { kind: 'discovery' });
});

test('guide return synchronously selects the third discovery card without opening a person detail', () => {
  const f = fixture('?source=home-guide');
  assert.equal(f.context.restoreHomeEntry(f.context.readHomeRestoreEntry()), true);
  assert.equal(f.root.getAttribute('data-ghd-active'), '2');
  assert.equal(f.root.scrollTop, 800);
  assert.equal(f.pages.original.hidden, true);
  assert.equal(f.pages.original.inert, true);
  assert.equal(f.pages.discovery.hidden, false);
  assert.equal(f.pages.discovery.inert, false);
  assert.equal(f.cards[2].classList.contains('gbl-discover-open'), true);
  f.cards.forEach((card, i) => {
    assert.equal(card.classList.contains('is-active'), i === 2);
    assert.equal(card.getAttribute('aria-hidden'), i === 2 ? 'false' : 'true');
    assert.equal(card.style.transition, 'none');
    assert.equal(card.classList.contains('is-open'), false);
  });
  assert.equal(f.opened.length, 0);
  assert.equal(f.frames.length, 0);
});

test('the next layout pass and settle completion preserve the third card instead of resetting to today', () => {
  const f = fixture('?source=home-guide');
  f.context.restoreHomeEntry(f.context.readHomeRestoreEntry());
  f.stage.clientHeight = 720;
  f.context.syncStepSize();
  f.timers.forEach(fn => fn());
  f.context.apply(0, true);
  assert.equal(f.root.getAttribute('data-ghd-active'), '2');
  assert.equal(f.cards[2].classList.contains('is-active'), true);
  assert.equal(f.cards[2].style.height, '720px');
  assert.equal(f.pages.discovery.hidden, false);
  assert.equal(f.context.card3Settled, true);
  assert.equal(f.opened.length, 0);
});

test('ordinary home and the existing today/life/person return routes keep their original classification', () => {
  const cases = [
    ['', null], ['?source=unknown', null], ['?source=home-life&theme=missing', null],
    ['?source=home-today', { kind: 'today' }],
    ['?source=home-life&theme=prayer', { kind: 'life', id: 'prayer' }],
    ['?source=home-bible-person&person=ruth', { kind: 'person', id: 'lot' }],
  ];
  for (const [search, expected] of cases) {
    const f = fixture(search);
    assert.deepEqual(JSON.parse(JSON.stringify(f.context.readHomeRestoreEntry())), expected);
    assert.equal(f.cards[0].classList.contains('is-active'), true);
    assert.equal(f.pages.discovery.hidden, true);
  }
});
