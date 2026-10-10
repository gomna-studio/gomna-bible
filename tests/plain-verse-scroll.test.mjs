import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const start = html.indexOf('/* 터치 제스처 엔진 공통 기기 판별');
const end = html.indexOf('/* 말씀풀이 팝업 전용', start);
assert.ok(start > 0 && end > start);
const engine = html.slice(start, end);
const closeStart = html.indexOf('function closeUnifiedBookChapterModal()');
const closeEnd = html.indexOf('function closeVerseReadMoreMenu()', closeStart);
const closeDrawer = html.slice(closeStart, closeEnd);
const viewportCss = html.match(/(?:^|\n)#verseGestureViewport\s*\{([^}]+)\}/)[1];
assert.match(viewportCss, /position:fixed/);
assert.match(viewportCss, /overflow:hidden/);
assert.match(viewportCss, /touch-action:pinch-zoom\s*;/,
  'Custom vertical panning must keep Android from taking over the pointer stream.');
assert.doesNotMatch(viewportCss, /touch-action:[^;]*pan-y/);

// Run the complete shipped engine. The fixture supplies real listener dispatch,
// long-chapter geometry, deterministic frames, and pointer capture bookkeeping.
function fixture(touch = true) {
  const nodes = new Map();
  const documentEvents = new Map(), windowEvents = new Map();
  const frames = new Map(), timers = new Map();
  const captures = new Set();
  let id = 0, clock = 0, layoutReads = 0;
  function add(events, type, callback) {
    const callbacks = events.get(type) || [];
    if (!callbacks.includes(callback)) callbacks.push(callback);
    events.set(type, callbacks);
  }
  function remove(events, type, callback) {
    events.set(type, (events.get(type) || []).filter(fn => fn !== callback));
  }
  function emit(events, event) {
    for (const callback of [...(events.get(event.type) || [])]) callback(event);
  }
  function node(nodeId = '', geometry = {}) {
    const events = new Map(), classes = new Set(), attrs = new Map();
    const element = {
      nodeId, style: {}, children: [], parentNode: null, hidden: false,
      scrollTop: 0, offsetTop: geometry.y || 0,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name)
      },
      setAttribute: (key, value) => attrs.set(key, String(value)),
      getAttribute: key => attrs.get(key) ?? null,
      addEventListener: (type, callback) => add(events, type, callback),
      removeEventListener: (type, callback) => remove(events, type, callback),
      dispatchEvent: event => emit(events, event),
      setPointerCapture: pointerId => captures.add(pointerId),
      releasePointerCapture: pointerId => captures.delete(pointerId),
      contains(other) {
        for (let next = other; next; next = next.parentNode) if (next === this) return true;
        return false;
      },
      appendChild(child) { return this.insertBefore(child, null); },
      insertBefore(child, sibling) {
        if (child.parentNode) child.parentNode.removeChild(child);
        const position = sibling ? this.children.indexOf(sibling) : -1;
        this.children.splice(position >= 0 ? position : this.children.length, 0, child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        this.children.splice(this.children.indexOf(child), 1);
        child.parentNode = null;
      },
      querySelector(selector) {
        if (this.nodeId === 'verseList' && selector === '.verse-item:last-of-type') return lastVerse;
        return null;
      },
      getBoundingClientRect() {
        layoutReads++;
        let top = geometry.y || 0;
        for (let parent = this.parentNode; parent; parent = parent.parentNode) {
          if (parent.nodeId === 'verseGestureSurface') top += parsePan(parent.style.transform).y;
        }
        const width = geometry.w || 390;
        const height = element.offsetHeight;
        return { left: 0, right: width, top, bottom: top + height, width, height };
      }
    };
    Object.defineProperty(element, 'id', {
      get: () => element.nodeId,
      set: value => { element.nodeId = value; nodes.set(value, element); }
    });
    function height() {
      if (geometry.h != null) return geometry.h;
      if (element.nodeId === 'verseGestureSurface') return element.children.reduce((sum, child) => sum + child.offsetHeight, 0);
      return parseFloat(element.style.height) || 0;
    }
    for (const property of ['offsetHeight', 'scrollHeight', 'clientHeight']) {
      Object.defineProperty(element, property, { get: () => { layoutReads++; return height(); } });
    }
    for (const property of ['offsetWidth', 'scrollWidth', 'clientWidth']) {
      Object.defineProperty(element, property, { get: () => { layoutReads++; return geometry.w || 390; } });
    }
    if (nodeId) nodes.set(nodeId, element);
    return element;
  }
  const root = node('html');
  const body = node('body');
  const phone = node('phone', { h: 780 });
  const content = node('content');
  const header = node('verseReadHeader', { h: 60 });
  const view = node('verseView', { h: 2100 });
  const list = node('verseList', { h: 2100 });
  const lastVerse = node('lastVerse', { y: 2000, h: 60 });
  const drawer = node('unifiedBookChapterModal');
  const bar = node('opt4BottomBar', { y: 640, h: 60 });
  const dock = node('scriptureDock', { y: 700, h: 60 });
  drawer.setAttribute('aria-hidden', 'true');
  root.classList.add('reader-verse-active');
  root.scrollTop = 85;
  view.classList.add('active');
  root.appendChild(body);
  body.appendChild(phone);
  phone.appendChild(header);
  phone.appendChild(content);
  content.appendChild(view);
  view.appendChild(list);
  list.appendChild(lastVerse);
  const document = {
    documentElement: root, body, scrollingElement: root, activeElement: null,
    visibilityState: 'visible',
    getElementById: name => nodes.get(name) || null,
    querySelector: selector => selector === '.phone-frame' ? phone : null,
    createElement: () => node(), createComment: () => node(),
    addEventListener: (type, callback) => add(documentEvents, type, callback),
    removeEventListener: (type, callback) => remove(documentEvents, type, callback)
  };
  const context = {
    document,
    navigator: { maxTouchPoints: touch ? 2 : 0 },
    innerWidth: 390, innerHeight: 780,
    visualViewport: {
      scale: 1, width: 390, height: 780, offsetTop: 0, offsetLeft: 0,
      addEventListener() {}
    },
    matchMedia: () => ({ matches: touch }),
    getComputedStyle: element => ({
      display: element === drawer ? 'none' : 'block',
      visibility: 'visible', opacity: '1'
    }),
    addEventListener: (type, callback) => add(windowEvents, type, callback),
    requestAnimationFrame: callback => { const next = ++id; frames.set(next, callback); return next; },
    cancelAnimationFrame: frameId => frames.delete(frameId),
    setTimeout: (callback, delay) => { const next = ++id; timers.set(next, { callback, delay }); return next; },
    clearTimeout: timerId => timers.delete(timerId),
    performance: { now: () => clock },
    disconnectReaderChapterLabelObserver() {}, ubcDialResetMotionState() {},
    unifiedBcRememberDrawerStep() {}, unifiedBcResetDrawerTransform() {},
    unifiedBcCloseCatSheet() {},
    unifiedBcSyncRailState: () => root.classList.remove('ubc-rail-drawer')
  };
  context.window = context;
  vm.runInNewContext(engine + '\n' + closeDrawer, context, { filename: 'shipped-plain-verse-engine.js' });
  function pointer(type, y, pointerId = 1) {
    clock += 16;
    const event = {
      type, pointerId, clientX: 180, clientY: y, pointerType: 'touch', button: 0,
      cancelable: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}
    };
    if (type === 'pointerdown') nodes.get('verseGestureViewport').dispatchEvent(event);
    else emit(documentEvents, event);
    return event;
  }
  function frame() {
    clock += 16;
    const scheduled = [...frames];
    for (const [frameId, callback] of scheduled) {
      if (!frames.delete(frameId)) continue;
      callback(clock);
    }
  }
  return {
    context, root, drawer, header, view, content, phone, captures,
    activate: () => context.syncPlainVerseGestureMode(),
    viewport: () => nodes.get('verseGestureViewport'),
    surface: () => nodes.get('verseGestureSurface'),
    pointer, frame,
    pan: () => parsePan(nodes.get('verseGestureSurface').style.transform),
    pendingFrames: () => frames.size,
    listeners: type => (documentEvents.get(type) || []).length,
    reads: () => layoutReads,
    zoom(scale) {
      context.visualViewport.scale = scale;
      emit(windowEvents, { type: 'resize' });
    }
  };
}
function parsePan(transform = '') {
  const match = /translate3d\(([-\d.]+)px,([-\d.]+)px,0\) scale\(([-\d.]+)\)/.exec(transform);
  return match ? { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) } : { x: 0, y: 0, scale: 1 };
}

{
  const f = fixture();
  f.activate();
  assert.ok(f.root.classList.contains('plain-verse-gesture-active'));
  assert.equal(f.root.scrollTop, 0);
  assert.equal(f.header.parentNode, f.surface());
  assert.equal(f.view.parentNode, f.surface());
  f.pointer('pointerdown', 500);
  f.pointer('pointermove', 470); // Establish a drag without a jump.
  const reads = f.reads();
  const move = f.pointer('pointermove', 170);
  assert.equal(move.defaultPrevented, true);
  assert.equal(f.reads(), reads, 'The move handler must not synchronously measure chapter layout.');
  f.frame();
  assert.equal(f.pan().y, -300, 'A 300 px upward finger movement moves the chapter by 300 px.');
  assert.ok(f.captures.has(1));
  f.pointer('pointermove', 370);
  f.frame();
  assert.equal(f.pan().y, -100, 'The same gesture can move back toward earlier verses.');
  f.pointer('pointermove', 770);
  f.frame();
  assert.equal(f.pan().y, 0, 'Downward movement cannot leave empty space above verse 1.');
  f.pointer('pointercancel', 770);
  assert.equal(f.listeners('pointermove'), 0);
  assert.equal(f.captures.size, 0);
}

for (const release of ['pointerup', 'pointercancel']) {
  const f = fixture();
  f.activate();
  f.pointer('pointerdown', 550);
  f.pointer('pointermove', 520);
  f.pointer('pointermove', 400);
  f.frame();
  f.pointer('pointermove', 280);
  f.frame();
  const releasedY = f.pan().y;
  assert.ok(releasedY < -200);
  f.pointer(release, 280);
  assert.equal(f.listeners('pointermove'), 0);
  assert.equal(f.captures.size, 0);
  assert.equal(f.context.__gomnaPlainVerseGestureIsUserInteracting(), release === 'pointerup');
  f.frame();
  if (release === 'pointerup') {
    assert.ok(f.pan().y < releasedY, 'An ordinary release keeps useful scroll inertia.');
  } else {
    assert.equal(f.pendingFrames(), 0);
    assert.equal(f.pan().y, releasedY, 'Browser cancellation must not start a spurious glide.');
  }
}

{
  const f = fixture();
  f.activate();
  f.pointer('pointerdown', 500);
  f.pointer('pointermove', 470);
  f.pointer('pointermove', 270);
  f.frame();
  const beforePinch = f.pan();
  const down = f.pointer('pointerdown', 350, 2);
  assert.equal(down.defaultPrevented, false);
  assert.equal(f.captures.size, 0, 'Two fingers release pointer capture for native pinch zoom.');
  const pinchMove = f.pointer('pointermove', 200, 1);
  assert.equal(pinchMove.defaultPrevented, false);
  f.frame();
  assert.deepEqual(f.pan(), beforePinch, 'The engine must not apply custom zoom over native pinch.');
  f.pointer('pointercancel', 200, 1);
  f.pointer('pointercancel', 350, 2);
  assert.equal(f.context.__gomnaPlainVerseGestureIsUserInteracting(), false);
  assert.equal(f.pendingFrames(), 0);
}

{
  const f = fixture();
  f.activate();
  f.zoom(1.6);
  f.frame();
  assert.equal(f.viewport().style.touchAction, 'pan-x pan-y pinch-zoom',
    'An enlarged browser viewport must retain native movement in both directions.');
  const enlargedPan = f.pan();
  f.pointer('pointerdown', 500);
  assert.equal(f.listeners('pointermove'), 0, 'Native zoom must not bind the custom pointer follower.');
  assert.equal(f.context.__gomnaPlainVerseGestureIsUserInteracting(), false);
  const move = f.pointer('pointermove', 170);
  assert.equal(move.defaultPrevented, false);
  f.frame();
  assert.deepEqual(f.pan(), enlargedPan, 'Browser viewport panning must not also translate the custom surface.');
  f.zoom(1);
  f.frame();
  assert.equal(f.viewport().style.touchAction, '');
  f.pointer('pointerdown', 500);
  f.pointer('pointermove', 470);
  f.pointer('pointermove', 170);
  f.frame();
  assert.equal(f.pan().y, -300, 'Returning to normal browser zoom restores the custom vertical pan.');
  f.pointer('pointercancel', 170);
}

{
  const f = fixture();
  f.drawer.classList.add('active', 'unified-bc-overlay--drawer');
  f.drawer.setAttribute('aria-hidden', 'false');
  f.root.classList.add('unified-bc-lock-scroll', 'ubc-rail-drawer');
  f.activate();
  assert.ok(!f.root.classList.contains('plain-verse-gesture-active'));
  f.context.closeUnifiedBookChapterModal();
  assert.ok(!f.root.classList.contains('unified-bc-lock-scroll'));
  assert.ok(!f.root.classList.contains('ubc-rail-drawer'));
  f.activate();
  assert.ok(f.root.classList.contains('plain-verse-gesture-active'), 'Closing the picker restores passage touch panning.');
  f.pointer('pointerdown', 500);
  f.pointer('pointermove', 470);
  f.pointer('pointermove', 170);
  f.frame();
  assert.equal(f.pan().y, -300);
}

{
  const f = fixture(false);
  f.activate();
  assert.ok(!f.root.classList.contains('plain-verse-gesture-active'));
  assert.equal(f.header.parentNode, f.phone);
  assert.equal(f.view.parentNode, f.content, 'Desktop keeps its native document scroll structure.');
}

console.log('plain verse scroll, cancellation, pinch, drawer return, and desktop checks passed');
