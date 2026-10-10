import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Use the production sheet gesture code shared by summary and detail panels.
const source = fs.readFileSync(new URL('../gomna_category_feature.js', import.meta.url), 'utf8');
const stateStart = source.indexOf('  var GUIDE_PINCH_MIN =');
const stateEnd = source.indexOf('  function isScriptureGuideCategory(', stateStart);
const helperStart = source.indexOf('  function guideTouchDist(');
const helperEnd = source.indexOf('  function getGuideScrollEl(', helperStart);
assert.ok(stateStart >= 0 && stateEnd > stateStart && helperStart >= 0 && helperEnd > helperStart);

function touch(x = 100, y = 100) { return { clientX: x, clientY: y }; }
function fixture(scale = 1) {
  const listeners = new Map();
  let widthReads = 0, heightReads = 0;
  const sheet = {
    style: {},
    get offsetWidth() { widthReads++; return 420; },
    get offsetHeight() { heightReads++; return 800; },
    contains: node => node.owner === sheet,
    addEventListener(type, callback, options) {
      const entries = listeners.get(type) || [];
      entries.push({ callback, options }); listeners.set(type, entries);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) || []).filter(entry => entry.callback !== callback));
    }
  };
  const control = {
    owner: sheet, tagName: 'button',
    closest(selector) {
      return selector.split(',').some(part => part === control.tagName ||
        (part === '[role="button"]' && control.role === 'button') ||
        (part === '[role="link"]' && control.role === 'link')) ? control : null;
    }
  };
  // Text/SVG inside the control must receive the same native tap protection.
  const child = { owner: sheet, closest: selector => control.closest(selector) };
  const background = { owner: sheet, closest: () => null };
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(stateStart, stateEnd) + source.slice(helperStart, helperEnd), context);
  context.bindGuidePinchZoom(sheet);
  context.guidePinchScale = scale;
  let clicks = 0;
  function emit(type, target = background, touches = [], values = {}) {
    const event = {
      type, target, touches, cancelable: true, detail: 1,
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; }, ...values
    };
    for (const entry of [...(listeners.get(type) || [])]) entry.callback(event);
    return event;
  }
  function click(target = control, detail = 1) {
    const event = emit('click', target, [], { detail });
    if (!event.prevented && !event.stopped) clicks++;
    return event;
  }
  function tap(target = control, dx = 1, dy = 1) {
    const start = emit('touchstart', target, [touch()]);
    const move = emit('touchmove', target, [touch(100 + dx, 100 + dy)]);
    emit('touchend', target, []);
    // Browsers cancel their synthesized click when a touchmove is prevented.
    const clicked = !start.prevented && !move.prevented ? click(target) : null;
    return { start, move, clicked };
  }
  return {
    sheet, listeners, context, control, child, background, emit, click, tap,
    clicks: () => clicks, layoutReads: () => widthReads + heightReads,
    moveListeners: () => (listeners.get('touchmove') || []).length
  };
}

let count = 0;
function test(name, callback) { callback(); count++; }

test('close/read/related control taps at 1× and 2× tolerate small finger movement', () => {
  for (const scale of [1, 2]) {
    for (const label of ['close', 'read', 'related']) {
      const f = fixture(scale);
      f.control.label = label;
      f.control.tagName = label === 'read' ? 'a' : 'button';
      const result = f.tap(f.control, 1, 1);
      assert.equal(result.start.prevented, false, label);
      assert.equal(result.move.prevented, false, label);
      assert.equal(result.clicked?.prevented, false, label);
      assert.equal(f.clicks(), 1);
      assert.equal(f.layoutReads(), 0);
      assert.equal(f.moveListeners(), 0);
      assert.equal(f.context.guidePanX, 0);
    }
  }
});

test('nested SVG/text control targets stay native even with a 10px wobble', () => {
  const f = fixture(2);
  const result = f.tap(f.child, 10, 4);
  assert.equal(result.move.prevented, false);
  assert.equal(f.clicks(), 1);
  assert.equal(f.context.guidePanning, false);
});

test('form and semantic button/link controls all retain native single-touch activation', () => {
  for (const [tagName, role] of [
    ['input'], ['select'], ['textarea'], ['summary'], ['div', 'button'], ['div', 'link']
  ]) {
    const f = fixture(2);
    Object.assign(f.control, { tagName, role });
    const result = f.tap(f.child, 10, 4);
    assert.equal(result.move.prevented, false, tagName + '/' + role);
    assert.equal(f.clicks(), 1);
    assert.equal(f.moveListeners(), 0);
  }
});

test('a long single-finger move beginning on a control remains a native scroll', () => {
  const f = fixture(2);
  f.emit('touchstart', f.child, [touch()]);
  const move = f.emit('touchmove', f.child, [touch(102, 170)]);
  assert.equal(move.prevented, false);
  assert.equal(f.context.guidePanY, 0);
  assert.equal(f.moveListeners(), 0);
});

test('1× background scrolling has no nonpassive move listener or layout reads', () => {
  const f = fixture();
  f.emit('touchstart', f.background, [touch()]);
  const move = f.emit('touchmove', f.background, [touch(101, 170)]);
  assert.equal(move.prevented, false);
  assert.equal(f.moveListeners(), 0);
  assert.equal(f.layoutReads(), 0);
});

test('zoomed background wobble stays a tap until it exceeds the movement slop', () => {
  const f = fixture(2);
  f.emit('touchstart', f.background, [touch()]);
  assert.equal(f.layoutReads(), 0);
  const move = f.emit('touchmove', f.background, [touch(110, 104)]);
  assert.equal(move.prevented, false);
  assert.equal(f.context.guidePanning, false);
  assert.equal(f.sheet.style.transform, undefined);
  f.emit('touchend', f.background, []);
  assert.equal(f.click(f.background).prevented, false);
  assert.equal(f.moveListeners(), 0);
});

test('intentional zoomed background pan updates position, suppressing its accidental click once', () => {
  const f = fixture(2);
  f.emit('touchstart', f.background, [touch()]);
  const move = f.emit('touchmove', f.background, [touch(130, 112)]);
  assert.equal(move.prevented, true);
  assert.equal(f.context.guidePanning, true);
  assert.ok(Math.abs(f.context.guidePanX - 33.6) < 0.001);
  assert.equal(f.layoutReads(), 2);
  f.emit('touchmove', f.background, [touch(140, 115)]);
  assert.equal(f.layoutReads(), 2, 'sizes are read once per real gesture');
  f.emit('touchend', f.background, []);
  assert.equal(f.context.guidePanning, false);
  assert.equal(f.moveListeners(), 0);
  assert.equal(f.click().prevented, true);
  assert.equal(f.tap().clicked?.prevented, false);
  assert.equal(f.clicks(), 1);
});

test('two-finger pinch still works when it starts over an interactive control', () => {
  const f = fixture();
  const start = f.emit('touchstart', f.child, [touch(0), touch(100)]);
  const move = f.emit('touchmove', f.child, [touch(0), touch(200)]);
  assert.equal(start.prevented, true);
  assert.equal(move.prevented, true);
  assert.equal(f.context.guidePinchScale, 2);
  assert.match(f.sheet.style.transform, /scale\(2\)/);
  f.emit('touchend', f.child, []);
  assert.equal(f.moveListeners(), 0);
  assert.equal(f.click().prevented, true);
  assert.equal(f.tap().clicked?.prevented, false);
});

test('pinch clamps zoom and returning to 1× clears pan', () => {
  const f = fixture(2);
  f.context.guidePanX = 30;
  f.emit('touchstart', f.background, [touch(0), touch(100)]);
  f.emit('touchmove', f.background, [touch(0), touch(1000)]);
  assert.equal(f.context.guidePinchScale, 2.5);
  f.emit('touchmove', f.background, [touch(0), touch(10)]);
  assert.equal(f.context.guidePinchScale, 1);
  assert.equal(f.context.guidePanX, 0);
  assert.equal(f.context.guidePanY, 0);
});

test('pinch can continue with one finger, with fresh slop before panning', () => {
  const f = fixture();
  f.emit('touchstart', f.background, [touch(0), touch(100)]);
  f.emit('touchmove', f.background, [touch(0), touch(200)]);
  f.emit('touchend', f.background, [touch(200)]);
  const tiny = f.emit('touchmove', f.background, [touch(205)]);
  assert.equal(tiny.prevented, false);
  assert.equal(f.context.guidePanning, false);
  const drag = f.emit('touchmove', f.background, [touch(225)]);
  assert.equal(drag.prevented, true);
  assert.equal(f.context.guidePanning, true);
  assert.ok(Math.abs(f.context.guidePanX - 28) < 0.001);
  f.emit('touchend', f.background, []);
  assert.equal(f.moveListeners(), 0);
});

test('cancel with a remaining finger stops all listeners and cannot continue stale pan', () => {
  const f = fixture();
  f.emit('touchstart', f.background, [touch(0), touch(100)]);
  f.emit('touchmove', f.background, [touch(0), touch(200)]);
  f.emit('touchcancel', f.background, [touch(200)]);
  assert.equal(f.context.guidePinchActive, false);
  assert.equal(f.context.guidePanning, false);
  assert.equal(f.context.guideMoveBound, false);
  assert.equal(f.moveListeners(), 0);
  assert.equal(f.sheet.style.willChange, '');
  const prior = f.sheet.style.transform;
  const stale = f.emit('touchmove', f.background, [touch(250)]);
  assert.equal(stale.prevented, false);
  assert.equal(f.sheet.style.transform, prior);
  assert.equal(f.tap().clicked?.prevented, false);
});

test('summary/detail reset removes a pending or active gesture before new controls become available', () => {
  for (const active of [false, true]) {
    const f = fixture(2);
    f.emit('touchstart', f.background, [touch()]);
    if (active) f.emit('touchmove', f.background, [touch(130)]);
    f.context.resetGuidePinchZoom();
    assert.equal(f.context.guidePinchScale, 1);
    assert.equal(f.moveListeners(), 0);
    assert.equal(f.sheet.style.transform, '');
    assert.equal(f.sheet.style.transition, '');
    assert.equal(f.sheet.style.willChange, '');
    assert.equal(f.emit('touchmove', f.background, [touch(150)]).prevented, false);
    assert.equal(f.tap().clicked?.prevented, false);
  }
});

test('keyboard/assistive click remains usable after a touch gesture', () => {
  const f = fixture(2);
  f.emit('touchstart', f.background, [touch()]);
  f.emit('touchmove', f.background, [touch(130)]);
  f.emit('touchend', f.background, []);
  assert.equal(f.click(f.control, 0).prevented, false);
  assert.equal(f.clicks(), 1);
});

test('gesture binding is idempotent and all controls share the same protected handler', () => {
  const f = fixture();
  f.context.bindGuidePinchZoom(f.sheet);
  assert.equal(f.listeners.get('touchstart').length, 1);
  assert.equal(f.listeners.get('click').length, 1);
  assert.equal(f.listeners.get('click')[0].options, true);
});

console.log('PASS guide touch zoom: ' + count + ' native-control/pan/pinch/reset cases');
