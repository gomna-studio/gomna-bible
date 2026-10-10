import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = process.env.HOME_FEED_SOURCE ? fs.readFileSync(process.env.HOME_FEED_SOURCE, 'utf8') : read('js/gomna-home-feed.js');
const home = read('index.html');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function fn(name, next) {
  return section(`  function ${name}(`, `  function ${next}(`);
}
const gestureSource = [
  fn('isAction', 'isHomeChromeHit'),
  fn('isTouchPointer', 'markGestureStart'),
  fn('markGestureStart', 'markGestureEnd'),
  fn('markGestureEnd', 'setCard3WheelMask'),
  fn('beginSwipe', 'applySwipeMove'),
  fn('applySwipeMove', 'onSwipeStart'),
  fn('onSwipeStart', 'onSwipeMove'),
  fn('onSwipeMove', 'onPtrStart'),
  fn('onPtrStart', 'onPtrMove'),
  fn('onPtrMove', 'settleTo'),
  fn('endSwipe', 'onSwipeEnd'),
  fn('onSwipeEnd', 'onPtrEnd'),
  fn('onPtrEnd', 'bindDeckSwipe')
].join('\n');

function gestures({ open = false } = {}) {
  const calls = [], classes = new Set(open ? ['is-open'] : []);
  let captured = false;
  const card = {
    classList: { contains: name => classes.has(name) },
    getAttribute: name => name === 'data-card' ? '1' : null,
    querySelector: () => null
  };
  const ctx = vm.createContext({
    Date, Math,
    document: {
      body: { classList: { contains: () => false } },
      documentElement: { classList: { contains: () => false } },
      querySelector: () => null
    },
    root: {
      querySelector: selector => selector.includes('data-card="0"') ? null :
        selector.includes('not([data-card') ? null :
          selector.includes('card-inner') ? null : card,
      setPointerCapture: () => { captured = true; calls.push('capture'); },
      releasePointerCapture: () => calls.push('release')
    },
    isHomeChromeHit: () => false,
    pointInHomeTabbar: () => false,
    pointInGestureCard: () => true,
    originalPeopleScrollAt: () => null,
    layerDetailOpen: () => open,
    layerDetailCard: () => card,
    lifeDetailOpen: () => open,
    activeStackIndex: () => 1,
    deckScrollY: () => 400,
    swipePoint: ev => ({ x: ev.clientX, y: ev.clientY }),
    logLifeScroll: () => {},
    applyLayerSwipe: (left, right) => calls.push(['swipe', left, right]),
    finishSwipe: () => calls.push('vertical-swipe'),
    pinDeckScroll: () => calls.push('layout'),
    apply: () => calls.push('layout'),
    lockY: () => 400,
    lockY3: () => 800,
    scheduleRelayout: () => {},
    AXIS_PX: 16, AXIS_RATIO: 1.25,
    H_SWIPE_PX: 28, H_SWIPE_VEL: .22,
    SWIPE_PX: 36, SWIPE_VEL: .28,
    count: 3,
    swipeDrag: null, swipeHandled: false, pinching: false,
    pointerMoved: false, flipping: open,
    gestureLive: false, card2Settled: true, card3Settled: false,
    gestureEndedSinceSettle: true, awaitingDir: false,
    allowCard3: false, allowCard1From2: false, allowCard2From3: false,
    relayoutPending: false, wheelStepDelta: 0, wheelGesture: false
  });
  vm.runInContext(gestureSource, ctx);
  function target(action) {
    return { closest: selector => action && selector.includes('button, a') ? {} : null };
  }
  function event(node, x = 100, y = 100) {
    return {
      target: node, clientX: x, clientY: y, pointerType: 'touch',
      pointerId: 1, isPrimary: true, cancelable: true, defaultPrevented: false,
      touches: [{ clientX: x, clientY: y }],
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}
    };
  }
  return { ctx, calls, target, event, captured: () => captured };
}

// On phones pointerdown arrives before touchstart. Capturing the deck here
// changes the eventual click target from the theme button to the stack.
{
  const h = gestures();
  const button = h.target(true), start = h.event(button);
  h.ctx.onPtrStart(start);
  h.ctx.onSwipeStart(start);
  h.ctx.markGestureStart(start);
  assert.equal(h.captured(), false, 'The deck must not capture a theme-button pointer.');
  assert.equal(h.ctx.swipeDrag, null);
  assert.equal(h.ctx.gestureLive, false);
  let clickTarget = h.captured() ? h.ctx.root : button;
  assert.equal(clickTarget, button, 'The native click still reaches the chosen theme.');
  h.ctx.markGestureEnd({ ...start, touches: [] });
  assert.deepEqual(h.calls, [], 'A control tap must not relayout the stack before click.');
  console.log('PASS theme tap keeps native target and skips deck layout');
}

// A little horizontal finger movement on the visible "말씀 보기" control
// previously became a swipe and prevented touchend, cancelling the click.
{
  const h = gestures({ open: true }), button = h.target(true);
  h.ctx.onPtrStart(h.event(button));
  h.ctx.onSwipeStart(h.event(button));
  const move = h.event(button, 120, 101);
  h.ctx.onSwipeMove(move);
  const end = h.event(button, 120, 101); end.touches = [];
  h.ctx.onSwipeEnd(end);
  assert.equal(move.defaultPrevented, false);
  assert.equal(end.defaultPrevented, false, 'A CTA tap must retain its native click.');
  assert.deepEqual(h.calls, []);
  console.log('PASS visible Word CTA tolerates finger movement without click cancellation');
}

// Preserve actual card swipe gestures outside controls.
{
  const h = gestures(), copy = h.target(false);
  h.ctx.onPtrStart(h.event(copy));
  assert.equal(h.captured(), true);
  h.ctx.onPtrMove(h.event(copy, 50, 100));
  const end = h.event(copy, 50, 100); end.touches = [];
  h.ctx.onPtrEnd(end);
  assert.equal(end.defaultPrevented, true);
  assert.deepEqual(h.calls.find(call => Array.isArray(call)), ['swipe', true, false]);
  console.log('PASS background swipe still changes cards');
}

const lifeData = section('  var LIFE_THEMES=', '  var LIFE_THEME_I18N=');
const sourceBinding = section("    root.querySelectorAll('[data-ghd-read]')", "    root.querySelectorAll('[data-ghd-commentary]')");
const dailyStart = home.indexOf('function openDailyVerse(');
const dailyEnd = home.indexOf('var _todayWordOpenLock', dailyStart);
assert.ok(dailyStart >= 0 && dailyEnd > dailyStart);
const urls = [];
let handler;
const card = { getAttribute: () => '1' };
const button = {
  closest: () => card,
  addEventListener: (type, callback) => { assert.equal(type, 'click'); handler = callback; }
};
const noWait = () => { throw new Error('Visible Word CTA must navigate synchronously.'); };
const ctx = vm.createContext({
  URLSearchParams, Date, Math,
  window: { location: { set href(value) { urls.push(value); } }, setTimeout: noWait },
  setTimeout: noWait, requestAnimationFrame: noWait, fetch: noWait,
  root: { querySelectorAll: () => [button] }, cards: [null, card],
  lifeThemeId: 'new', storyPersonId: 'david',
  feedView: () => ({}), dateKey: () => '2026-10-10',
  uiT: (_key, fallback) => fallback,
  extrasForLocalized: () => ({}), localizeRef: ref => ref,
  setHomeFeedReaderTarget: target => { ctx.readerTarget = target; },
  getDailyVerseTarget: () => ctx.readerTarget,
  LIFE_THEME_I18N: {}, localizedItem: item => item
});
vm.runInContext(lifeData +
  fn('lifeThemeById', 'currentLifeTheme') +
  fn('currentLifeTheme', 'storyPersonById') +
  fn('parseRef', 'lifeThemeById') +
  fn('cardDetail', 'cardFromEl') +
  fn('cardFromEl', 'isAction') +
  fn('applyReaderTarget', 'openCardReader') +
  fn('openCardReader', 'viewH') +
  home.slice(dailyStart, dailyEnd) + sourceBinding, ctx);
for (const theme of ctx.LIFE_THEMES) {
  ctx.lifeThemeId = theme.id;
  const before = urls.length;
  handler({ preventDefault() {}, stopPropagation() {} });
  assert.equal(urls.length, before + 1, 'One click immediately starts one navigation.');
  const url = new URL(urls.at(-1), 'https://gomnastudio.com/');
  const target = ctx.parseRef(theme.verseRef);
  assert.equal(url.searchParams.get('book'), target.book);
  assert.equal(url.searchParams.get('chapter'), String(target.chapter));
  assert.equal(url.searchParams.get('verseStart'), String(target.startVerse));
  assert.equal(url.searchParams.get('verse'), String(target.startVerse));
  assert.equal(url.searchParams.get('verseEnd'), target.endVerse > target.startVerse ? String(target.endVerse) : null);
  assert.equal(url.searchParams.get('source'), 'home-life');
  assert.equal(url.searchParams.get('theme'), theme.id);
}
console.log('PASS all seven life-theme Word CTAs navigate synchronously with correct book, range and return source');
