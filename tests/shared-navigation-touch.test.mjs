import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../js/' + name, import.meta.url), 'utf8');
const footerSelector = '#gomnaHomeTabbar .gomna-home-tab';
const domains = [footerSelector, '#scriptureDock .scripture-dock-item', '#opt4VerseToolbar > button', 'button.gomna-home-related[data-ghd-related]'];

class Element {
  constructor(selector = '') {
    this.selector = selector;
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.offsetHeight = 132;
    this.textContent = '성경';
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) || null; }
  removeAttribute(key) { this.attributes.delete(key); }
  appendChild(child) { this.children.push(child); child.parent = this; }
  replaceChildren() { this.children = []; }
  closest(selectors) {
    if (selectors.split(',').map(selector => selector.trim()).includes(this.selector)) return this;
    return this.parent?.closest(selectors) || null;
  }
  querySelector() { return null; }
  getBoundingClientRect() { return { left: 180, top: 750, width: 48, height: 44 }; }
}

function fixture() {
  let now = 1000, nextTimer = 0;
  const timers = new Map(), documentListeners = new Map(), windowListeners = new Map();
  const head = new Element(), body = new Element();
  const add = listeners => (type, callback, options) => {
    const entries = listeners.get(type) || [];
    entries.push({ callback, options });
    listeners.set(type, entries);
  };
  const document = {
    head, body, hidden: false, createElement: () => new Element(), createElementNS: () => new Element(),
    addEventListener: add(documentListeners)
  };
  const window = { innerWidth: 390, devicePixelRatio: 3, addEventListener: add(windowListeners) };
  const context = vm.createContext({
    document, window, Date: { now: () => now },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  for (const file of ['gomna-nav-single-tap.js', 'gomna-nav-magnifier.js']) {
    vm.runInContext(source(file), context, { filename: file });
  }
  const popup = body.children.find(child => child.id === 'gomnaNavMagnifier');
  assert.ok(popup);
  function event(type, target, values = {}) {
    return {
      type, target, cancelable: true, defaultPrevented: false, stopped: false,
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
      clientX: 204, clientY: 770, detail: 1,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...values
    };
  }
  function emit(listeners, e) {
    for (const { callback } of listeners.get(e.type) || []) {
      callback(e);
      if (e.stopped) break;
    }
    return e;
  }
  function click(target, detail = 1) {
    const e = event('click', target, { detail });
    emit(windowListeners, e);
    if (!e.stopped) emit(documentListeners, e);
    if (!e.stopped && !e.defaultPrevented) target.closest(domains.join(','))?.activate();
    return e;
  }
  const controls = domains.map(selector => {
    const control = new Element(selector);
    control.actions = 0;
    control.activate = () => { control.actions++; };
    control.click = () => click(control, 0); // HTMLElement.click() uses detail=0.
    const label = new Element();
    control.appendChild(label);
    control.target = label;
    return control;
  });
  const touch = (type, target, points = [], values = {}) => emit(documentListeners, event(type, target, {
    touches: points.map(([clientX, clientY]) => ({ clientX, clientY })), ...values
  }));
  const pointer = (type, target, values = {}) => emit(documentListeners, event(type, target, values));
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id); now = timer.due; timer.callback();
    }
    now = end;
  }
  function quickTap(control, values = {}) {
    pointer('pointerdown', control.target);
    touch('touchstart', control.target, [[204, 770]]);
    advance(40);
    pointer('pointerup', control.target);
    const end = touch('touchend', control.target, [], values);
    // The browser delivers its later click only if touchend was not cancelled.
    if (!end.defaultPrevented) click(control.target);
    return end;
  }
  function lifecycle(type) {
    const listeners = type === 'visibilitychange' ? documentListeners : windowListeners;
    emit(listeners, event(type, null));
  }
  return { controls, popup, pointer, touch, click, advance, quickTap, lifecycle, timers, documentListeners };
}

const cases = [];
function test(name, run) { run(); cases.push(name); }

test('ordinary footer quick tap invokes its native handler exactly once', () => {
  const f = fixture(), control = f.controls[0];
  const end = f.quickTap(control);
  assert.equal(end.defaultPrevented, true);
  assert.equal(control.actions, 1);
  assert.equal(f.popup.hidden, true);
  f.advance(1000);
  assert.equal(f.popup.hidden, true);
  assert.equal(control.actions, 1);
});

test('non-cancelable touchend uses the native click fallback once', () => {
  const f = fixture(), control = f.controls[0];
  assert.equal(f.quickTap(control, { cancelable: false }).defaultPrevented, false);
  assert.equal(control.actions, 1);
});

test('moved, cancelled, pinched, long and mismatched touches never force navigation', () => {
  for (const mode of ['move', 'cancel', 'pinch', 'long', 'target']) {
    const f = fixture(), control = f.controls[0];
    f.touch('touchstart', control.target, [[204, 770]]);
    if (mode === 'move') f.touch('touchmove', control.target, [[220, 770]]);
    if (mode === 'cancel') f.touch('touchcancel', control.target);
    if (mode === 'pinch') f.touch('touchmove', control.target, [[204, 770], [240, 770]]);
    if (mode === 'long') f.advance(800);
    const end = f.touch('touchend', mode === 'target' ? f.controls[1].target : control.target);
    assert.equal(end.defaultPrevented, false, mode);
    assert.equal(control.actions, 0, mode);
    f.quickTap(control);
    assert.equal(control.actions, 1, mode + ' permits the next quick tap');
  }
});

test('background and history lifecycle cancel an incomplete footer tap', () => {
  for (const type of ['blur', 'pagehide', 'pageshow', 'visibilitychange']) {
    const f = fixture(), control = f.controls[0];
    f.touch('touchstart', control.target, [[204, 770]]);
    f.lifecycle(type);
    assert.equal(f.touch('touchend', control.target).defaultPrevented, false, type);
    assert.equal(control.actions, 0, type);
    f.quickTap(control);
    assert.equal(control.actions, 1, type + ' restores input');
  }
});

test('ordinary taps on every magnifier domain retain native clicks', () => {
  const f = fixture();
  for (const control of f.controls) {
    f.pointer('pointerdown', control.target);
    f.advance(100);
    f.pointer('pointerup', control.target);
    const e = f.click(control.target);
    assert.equal(e.defaultPrevented, false);
    assert.equal(control.actions, 1);
    assert.equal(f.popup.hidden, true);
  }
  f.advance(1000);
  assert.equal(f.popup.hidden, true);
});

test('long press blocks only that release; a new quick tap immediately works', () => {
  const f = fixture(), control = f.controls[0];
  f.pointer('pointerdown', control.target);
  f.touch('touchstart', control.target, [[204, 770]]);
  f.advance(800);
  assert.equal(f.popup.hidden, false);
  f.pointer('pointerup', control.target);
  assert.equal(f.touch('touchend', control.target).defaultPrevented, false);
  assert.equal(f.click(control.target).defaultPrevented, true);
  assert.equal(control.actions, 0);
  assert.equal(f.popup.hidden, true);
  f.quickTap(control);
  assert.equal(control.actions, 1);
});

test('new primary press clears a pending long-press block before its delayed click', () => {
  const f = fixture(), control = f.controls[1];
  f.pointer('pointerdown', control.target); f.advance(800); f.pointer('pointerup', control.target);
  // Some mobile browsers do not deliver any click from the old long press.
  f.pointer('pointerdown', control.target); f.advance(40); f.pointer('pointerup', control.target);
  assert.equal(f.click(control.target).defaultPrevented, false);
  assert.equal(control.actions, 1);
});

test('keyboard and assistive detail=0 clicks bypass the long-press block', () => {
  const f = fixture(), control = f.controls[2];
  f.pointer('pointerdown', control.target); f.advance(800); f.pointer('pointerup', control.target);
  assert.equal(f.click(control.target, 0).defaultPrevented, false);
  assert.equal(control.actions, 1);
});

test('moved, cancelled and second-pointer presses dismiss without stale popup', () => {
  for (const mode of ['move', 'cancel', 'pinch']) {
    const f = fixture(), control = f.controls[1];
    f.pointer('pointerdown', control.target);
    if (mode === 'move') f.pointer('pointermove', control.target, { clientX: 224 });
    if (mode === 'cancel') f.pointer('pointercancel', control.target);
    if (mode === 'pinch') f.pointer('pointerdown', control.target, { pointerId: 2, isPrimary: false });
    f.advance(1000);
    assert.equal(f.popup.hidden, true, mode);
    f.pointer('pointerdown', control.target); f.advance(40); f.pointer('pointerup', control.target);
    assert.equal(f.click(control.target).defaultPrevented, false, mode);
    assert.equal(control.actions, 1, mode);
  }
});

test('cancel or drag after a visible long press blocks its stray click and permits the next tap', () => {
  for (const type of ['pointercancel', 'pointermove']) {
    const f = fixture(), control = f.controls[0];
    f.pointer('pointerdown', control.target); f.advance(800);
    assert.equal(f.popup.hidden, false);
    f.pointer(type, control.target, { clientX: 224 });
    assert.equal(f.popup.hidden, true);
    assert.equal(f.click(control.target).defaultPrevented, true);
    assert.equal(control.actions, 0);
    f.quickTap(control);
    assert.equal(control.actions, 1);
  }
});

test('blur, history restore and visibility restore release shown magnifier and block', () => {
  for (const type of ['blur', 'pagehide', 'pageshow', 'visibilitychange']) {
    const f = fixture(), control = f.controls[3];
    f.pointer('pointerdown', control.target); f.advance(800);
    assert.equal(f.popup.hidden, false);
    f.lifecycle(type);
    assert.equal(f.popup.hidden, true, type);
    assert.equal(f.timers.size, 0, type);
    assert.equal(f.click(control.target).defaultPrevented, false, type);
    assert.equal(control.actions, 1, type);
  }
});

test('touch tracking is passive until the intentional quick-tap click dispatch', () => {
  const f = fixture();
  for (const type of ['touchstart', 'touchmove', 'touchcancel']) {
    assert.equal(f.documentListeners.get(type)[0].options.passive, true, type);
  }
  assert.equal(f.documentListeners.get('touchend')[0].options.passive, false);
});

console.log('PASS shared navigation touch: ' + cases.length + ' input-sequence regressions');
