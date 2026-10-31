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
    root, stage, cards, count: 3, progress: 0, reduce: false, returnTopButton: element(), homeDeparting: false, homeDepartureTimer: 0,
    card2Settled: false, card3Settled: false, allowCard3: false, allowCard1From2: false, allowCard2From3: false,
    awaitingDir: false, gestureLive: false, gestureEndedSinceSettle: false, settleAnim: false, settleAnimTimer: 0,
    wheelStepDelta: 0, SETTLE_MS: 180, lastP: 0, pinching: false, ignoreCardClickBefore: 0,
    lifeThemeId: 'new', storyPersonId: 'david',
    lifeImageRequest: 0, storyImageRequest: 0, cardOpenImageRequest: 0, raf: 0, wheelIdleTimer: 0, wheelGesture: false,
    LIFE_THEMES: [{ id: 'new' }, { id: 'prayer' }], STORY_PEOPLE: [{ id: 'david' }, { id: 'lot' }],
    location: { search }, URLSearchParams, Date,
    document: { getElementById: () => null },
    window: { requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => { timers.push(fn); return timers.length; } },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    viewH: () => 800, setCard3WheelMask: value => masks.push(value), resetPinchSurface() {},
    setCardImageBusy() {}, fillCopy() {}, openCard: (card, skipHistory) => opened.push({ card, skipHistory }),
  });
  const names = ['knownLifeThemeId', 'knownStoryPersonId', 'readHomeRestoreEntry', 'restoreHomeEntry',
    'showStoryDiscovery', 'cancelPendingCardOpens', 'cancelDeckMotion', 'resumeHomeAfterDeparture', 'startSettleTo1', 'startSettleTo2', 'startSettleTo3', 'gatedProgress', 'layoutNums', 'apply', 'clamp',
    'pinDeckScroll', 'stepH', 'lockY', 'lockY3', 'syncStepSize'];
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

for (const [search, index] of [['?source=home-life&theme=prayer', 1], ['?source=home-bible-person&person=david', 2], ['?source=home-today', 0]]) {
  test('direct detail return paints only its target immediately: ' + search, () => {
    const f = fixture(search);
    f.context.restoreHomeEntry(f.context.readHomeRestoreEntry());
    assert.equal(f.opened.length, 1);
    assert.equal(f.opened[0].card, f.cards[index]);
    assert.equal(f.root.getAttribute('data-ghd-active'), String(index));
    assert.equal(f.root.classList.contains('ghd-instant-navigation'), true);
    assert.equal(f.frames.length, 0);
    assert.equal(f.timers.length, 0);
    assert.equal(f.context.settleAnim, false);
    f.cards.forEach(card => assert.equal(card.style.transition, 'none'));
  });
}

test('a swipe still animates its adjacent card and cancels old pending opens', () => {
  const f = fixture('');
  f.context.startSettleTo2();
  assert.equal(f.context.settleAnim, true);
  assert.equal(f.root.classList.contains('ghd-instant-navigation'), false);
  assert.match(f.cards[1].style.transition, /transform 180ms/);
  assert.equal(f.context.cardOpenImageRequest, 1);
  assert.equal(f.timers.length, 1);
});

for(const [progress,target] of [[.2,0],[.6,1],[1.6,2]]){
  test('back or canceled navigation fully settles a half-finished swipe at '+progress,()=>{
    const f=fixture('');
    f.context.progress=progress;
    f.context.homeDeparting=true;
    f.context.resumeHomeAfterDeparture();
    assert.equal(f.context.homeDeparting,false);
    assert.equal(f.context.progress,target);
    assert.equal(f.root.scrollTop,target*400);
    assert.equal(f.cards[target].classList.contains('is-active'),true);
    assert.equal(f.cards[target].style.transform,'translate3d(-50%,0px,0) translate3d(0px,0px,0) scale(1)');
    assert.equal(f.cards[target].style.transition,'none');
    assert.equal(f.root.classList.contains('ghd-instant-navigation'),true);
    assert.equal(f.timers.length,0);
  });
}

function delayedOpenFixture() {
  const card = element(['is-active']);
  card.setAttribute('data-card', '0');
  card.querySelector = () => null;
  const opened = [], pending = [];
  let ready = false;
  const context = vm.createContext({
    cards: [card], progress: 0, homeDeparting: false,
    lifeImageRequest: 0, storyImageRequest: 0, cardOpenImageRequest: 0,
    cardOpenImage: () => 'detail.webp', isHomeImageReady: () => ready,
    ensureHomeImageReady: () => new Promise(resolve => pending.push(resolve)),
    setCardImageBusy(card, busy) { card.busy = busy; },
    openCardNow: card => opened.push(card),
  });
  vm.runInContext(['cancelPendingCardOpens', 'openCard'].map(shippedFunction).join('\n'), context);
  return { card, context, opened, pending, cached() { ready = true; } };
}

test('detail opens immediately and leaving it prevents a late image callback reopening it', async () => {
  const f = delayedOpenFixture();
  f.context.openCard(f.card);
  assert.equal(f.card.busy, false);
  assert.equal(f.opened.length, 1, 'The text is usable before the image settles');
  f.context.cancelPendingCardOpens();
  f.pending[0](true);
  await Promise.resolve();
  assert.equal(f.opened.length, 1);
  assert.equal(f.card.busy, false);
});

test('a newer cached open wins over an older pending image request', async () => {
  const f = delayedOpenFixture();
  f.context.openCard(f.card);
  f.cached();
  f.context.openCard(f.card);
  assert.equal(f.opened.length, 2);
  assert.equal(f.card.busy, false);
  f.pending[0](true);
  await Promise.resolve();
  assert.equal(f.opened.length, 2);
});

test('an image failure leaves the already opened detail usable', async () => {
  const f=delayedOpenFixture();
  f.context.openCard(f.card, true);
  assert.equal(f.opened.length, 1);
  f.pending[0](false);
  await Promise.resolve();
  assert.equal(f.opened.length, 1);
  assert.equal(f.card.busy, false);
  assert.equal(f.card.classList.contains('ghd-image-failed'), true);
});

test('instant selection cancels queued scroll animation and delayed settle callbacks', () => {
  const f = fixture('');
  const cancelledFrames = [], cancelledTimers = [];
  f.context.window.cancelAnimationFrame = id => cancelledFrames.push(id);
  f.context.clearTimeout = id => cancelledTimers.push(id);
  f.context.raf = 42;
  f.context.settleAnimTimer = 43;
  f.context.wheelIdleTimer = 44;
  f.context.startSettleTo3(true);
  assert.deepEqual(cancelledFrames, [42]);
  assert.deepEqual(cancelledTimers, [43, 44]);
  assert.equal(f.context.raf, 0);
  assert.equal(f.context.settleAnimTimer, 0);
  assert.equal(f.context.wheelIdleTimer, 0);
  assert.equal(f.root.getAttribute('data-ghd-active'), '2');
});

test('a late image completion cannot open a card underneath a newly opened dialog', () => {
  const context=vm.createContext({isHomeOverlayOpen:()=>true, homeDeparting:false});
  vm.runInContext(shippedFunction('openCardNow'), context);
  const card=new Proxy({}, {get(){assert.fail('The covered card must remain untouched while a dialog is open');}});
  context.openCardNow(card, true);
});
