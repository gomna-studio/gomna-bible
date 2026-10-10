import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual Reader handlers. The fixture dispatches the same pointer,
// scroll, and click sequence used by the home Bible drawer iframe.
const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
function sourceOf(name) {
  const start = html.indexOf('\nfunction ' + name + '(') + 1;
  assert.ok(start > 0, name + ' exists in Reader');
  const end = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, end);
}

class Element {
  constructor(names = []) {
    this.names = new Set(names);
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.style = {};
    this.scrollTop = 0;
    this.classList = {
      add: name => this.names.add(name),
      remove: name => this.names.delete(name),
      contains: name => this.names.has(name)
    };
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(type, callback, options) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, options });
    this.listeners.set(type, listeners);
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) { return selector.slice(1).split('.').every(name => this.names.has(name)); }
  closest(selector) { return this.matches(selector) ? this : null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  emit(type, target, values = {}, action) {
    const event = {
      type, target, currentTarget: this, pointerId: 1, pointerType: 'touch',
      isPrimary: true, button: 0, clientX: 100, clientY: 100, detail: 1,
      cancelable: true, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; }, ...values
    };
    for (const { callback } of this.listeners.get(type) || []) callback(event);
    if (!event.stopped) action?.();
    return event;
  }
}

function fixture() {
  const list = new Element(['ubc-book-list']);
  const book = new Element(['ubc-book-row']);
  const card = new Element(['ubc-book-chapters']);
  const grid = new Element(['ubc-chcard-grid']);
  const chapter = new Element(['ubc-book-chapter']);
  const verse = new Element(['ubc-book-chapter']);
  grid.children = [chapter, verse];
  card.children = [grid];
  list.children = [book, card];
  let currentList = list;
  const frames = [], navigated = [], positioned = [];
  const context = {
    window: {},
    document: { getElementById: id => id === 'unifiedBcBookList' ? currentList : null },
    requestAnimationFrame: callback => frames.push(callback),
    unifiedBcState: { selectedBook: null, openBook: null, displayChapters: 0 },
    isPsalmsBook: name => name === '시편',
    unifiedBcBindChapterGridFit() {},
    unifiedBcRevealOpenChapters: () => positioned.push('reveal'),
    unifiedBcFitChapterGrid: () => positioned.push('fit'),
    unifiedBcScrollActiveChapterIntoView() {
      positioned.push('active');
      grid.scrollTop = 100;
      list.emit('scroll', grid);
    },
    unifiedBcRenderBookList() {},
    unifiedBcFocusBookControl() {},
    unifiedBcChapterVerseCount: () => 72,
    unifiedBcApplyChapter(ch, v) {
      navigated.push([context.unifiedBcState.selectedBook, ch, v]);
    }
  };
  vm.createContext(context);
  vm.runInContext([
    'unifiedBcClearChapterPressed', 'unifiedBcBindBookListTapGuard',
    'unifiedBcAfterChapterCardReady', 'unifiedBcToggleBookChapters',
    'unifiedBcGoChapter', 'unifiedBcOpenVersePick',
    'unifiedBcPickCardVerse', 'unifiedBcGoVerse'
  ].map(sourceOf).join('\n'), context);
  context.unifiedBcBindBookListTapGuard();
  function tap(target, action, move = {}) {
    list.emit('pointerdown', target);
    if (Object.keys(move).length) list.emit('pointermove', target, move);
    list.emit('pointerup', target, move);
    return list.emit('click', target, {}, action);
  }
  return {
    list, book, card, grid, chapter, verse, context, frames, navigated, positioned, tap,
    replaceList: replacement => { currentList = replacement; },
    openBook: (name = '누가복음', chapters = 24) =>
      tap(book, () => context.unifiedBcToggleBookChapters(name, chapters, 'new')),
    flush() { while (frames.length) frames.shift()(); }
  };
}

const cases = [];
function test(name, callback) { callback(); cases.push(name); }

test('book → chapter → verse takes one normal tap at each stage', () => {
  const f = fixture();
  f.openBook();
  f.tap(f.chapter, () => f.context.unifiedBcGoChapter(2));
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
  f.tap(f.verse, () => f.context.unifiedBcPickCardVerse(1));
  assert.deepEqual(f.navigated, [['누가복음', 2, 1]]);
});

test('automatic active-chapter scroll leaves first tap usable', () => {
  const f = fixture();
  f.openBook('시편', 150);
  f.context.unifiedBcAfterChapterCardReady(f.list, '시편');
  f.flush();
  assert.ok(f.positioned.includes('active'));
  f.tap(f.chapter, () => f.context.unifiedBcGoChapter(119));
  assert.equal(f.context.unifiedBcState.versePick.chapter, 119);
});

test('queued layout scroll while a finger rests does not discard its click', () => {
  const f = fixture();
  f.openBook();
  f.list.emit('pointerdown', f.chapter);
  f.list.emit('scroll', f.grid);
  f.list.emit('pointerup', f.chapter);
  const click = f.list.emit('click', f.chapter, {}, () => f.context.unifiedBcGoChapter(2));
  assert.equal(click.prevented, false);
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
});

test('ready RAF does not reposition numbers under an active finger', () => {
  const f = fixture();
  f.openBook();
  f.context.unifiedBcAfterChapterCardReady(f.list, '누가복음');
  f.list.emit('pointerdown', f.chapter);
  f.flush();
  assert.equal(f.positioned.includes('active'), false);
  f.list.emit('pointerup', f.chapter);
  f.list.emit('click', f.chapter, {}, () => f.context.unifiedBcGoChapter(2));
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
});

test('old ready RAF cannot move a replacement verse card or detached list', () => {
  const f = fixture();
  f.openBook();
  f.context.unifiedBcAfterChapterCardReady(f.list, '누가복음');
  f.list.children[1] = new Element(['ubc-book-chapters']);
  f.flush();
  assert.equal(f.positioned.includes('active'), false);
  f.context.unifiedBcAfterChapterCardReady(f.list, '누가복음');
  f.replaceList(new Element(['ubc-book-list']));
  f.flush();
  assert.equal(f.positioned.includes('active'), false);
});

test('small diagonal tap movement is accepted and idle mouse movement is harmless', () => {
  const f = fixture();
  f.openBook();
  f.tap(f.chapter, () => f.context.unifiedBcGoChapter(2), { clientX: 110, clientY: 108 });
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
  f.list.emit('pointermove', f.verse, { pointerType: 'mouse', clientX: 200, clientY: 200 });
  f.tap(f.verse, () => f.context.unifiedBcPickCardVerse(1));
  assert.deepEqual(f.navigated, [['누가복음', 2, 1]]);
});

test('native scroll/cancel blocks accidental selection; next verse tap succeeds', () => {
  const f = fixture();
  f.openBook();
  f.tap(f.chapter, () => f.context.unifiedBcGoChapter(2));
  f.list.emit('pointerdown', f.verse);
  f.list.emit('pointercancel', f.verse);
  f.list.emit('scroll', f.grid);
  const rejected = f.list.emit('click', f.verse, {}, () => f.context.unifiedBcPickCardVerse(1));
  assert.equal(rejected.prevented, true);
  assert.deepEqual(f.navigated, []);
  f.tap(f.verse, () => f.context.unifiedBcPickCardVerse(2));
  assert.deepEqual(f.navigated, [['누가복음', 2, 2]]);
});

test('vertical book drag does not unfold a book, and following tap does', () => {
  const f = fixture();
  const rejected = f.tap(f.book, () => f.context.unifiedBcToggleBookChapters('누가복음', 24, 'new'), { clientY: 136 });
  assert.equal(rejected.prevented, true);
  assert.equal(f.context.unifiedBcState.openBook, null);
  f.openBook();
  assert.equal(f.context.unifiedBcState.openBook, '누가복음');
});

test('another pointer cannot complete or move the tracked tap', () => {
  const f = fixture();
  f.openBook();
  f.list.emit('pointerdown', f.chapter);
  f.list.emit('pointermove', f.chapter, { pointerId: 2, clientY: 200 });
  f.list.emit('pointerup', f.chapter, { pointerId: 2 });
  assert.equal(f.list.__ubcTapTracking, true);
  f.list.emit('pointerup', f.chapter);
  f.list.emit('click', f.chapter, {}, () => f.context.unifiedBcGoChapter(2));
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
});

test('pinch cannot select a number; keyboard activation remains usable', () => {
  const f = fixture();
  f.openBook();
  f.list.emit('pointerdown', f.chapter);
  f.list.emit('pointerdown', f.chapter, { pointerId: 2, isPrimary: false });
  f.list.emit('pointerup', f.chapter);
  const rejected = f.list.emit('click', f.chapter, {}, () => f.context.unifiedBcGoChapter(2));
  assert.equal(rejected.prevented, true);
  f.list.emit('pointerdown', f.chapter);
  f.list.emit('pointercancel', f.chapter);
  const keyboard = f.list.emit('click', f.chapter, { detail: 0 }, () => f.context.unifiedBcGoChapter(2));
  assert.equal(keyboard.prevented, false);
  assert.equal(f.context.unifiedBcState.versePick.chapter, 2);
});

test('touch guard stays passive and is bound once across card redraws', () => {
  const f = fixture();
  f.context.unifiedBcBindBookListTapGuard();
  assert.equal(f.list.listeners.get('pointerdown').length, 1);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'scroll']) {
    assert.ok(f.list.listeners.get(type).every(listener => listener.options.passive));
  }
  assert.equal(f.list.listeners.get('click')[0].options, true);
});

function swipeFixture() {
  const box = new Element(['unified-bc-box']);
  const captured = [], released = [];
  let closed = 0;
  box.setPointerCapture = id => captured.push(id);
  box.releasePointerCapture = id => released.push(id);
  const context = {
    document: { querySelector: () => box },
    unifiedBcResetDrawerTransform: () => { box.style.transform = ''; box.style.transition = ''; },
    unifiedBcDrawerReduceMotion: () => true,
    unifiedBcSwipeClose: () => { closed++; }
  };
  vm.runInNewContext(sourceOf('bindUnifiedBcDrawerSwipe'), context);
  context.bindUnifiedBcDrawerSwipe();
  return { box, captured, released, closed: () => closed };
}

test('drawer does not capture a short diagonal button tap', () => {
  const f = swipeFixture();
  f.box.emit('pointerdown', f.box);
  const move = f.box.emit('pointermove', f.box, { clientX: 110, clientY: 108 });
  f.box.emit('pointerup', f.box);
  assert.deepEqual(f.captured, []);
  assert.equal(move.prevented, false);
  assert.equal(f.closed(), 0);
});

test('vertical/diagonal scrolling and a secondary pointer cannot close the drawer', () => {
  for (const move of [{ clientX: 120, clientY: 145 }, { clientX: 120, clientY: 117 }]) {
    const f = swipeFixture();
    f.box.emit('pointerdown', f.box);
    const event = f.box.emit('pointermove', f.box, move);
    f.box.emit('pointerup', f.box);
    assert.deepEqual(f.captured, []);
    assert.equal(event.prevented, false);
    assert.equal(f.closed(), 0);
  }
  const f = swipeFixture();
  f.box.emit('pointerdown', f.box, { isPrimary: false });
  f.box.emit('pointermove', f.box, { clientX: 180 });
  f.box.emit('pointerup', f.box);
  assert.equal(f.closed(), 0);
});

test('intentional swipe still closes once; cancel snaps back without closing', () => {
  for (const end of ['pointerup', 'pointercancel']) {
    const f = swipeFixture();
    f.box.emit('pointerdown', f.box);
    f.box.emit('pointermove', f.box, { clientX: 180, clientY: 104 });
    assert.deepEqual(f.captured, [1]);
    f.box.emit('pointerup', f.box, { pointerId: 2 });
    assert.equal(f.closed(), 0);
    f.box.emit(end, f.box);
    assert.equal(f.closed(), end === 'pointerup' ? 1 : 0);
    assert.deepEqual(f.released, [1]);
    if (end === 'pointercancel') assert.equal(f.box.style.transform, 'translateX(0)');
  }
});

test('partial horizontal swipe cannot leak a click that collapses the chapter card', () => {
  const f = swipeFixture();
  let blankClicks = 0;
  f.box.emit('pointerdown', f.box);
  f.box.emit('pointermove', f.box, { clientX: 125, clientY: 102 });
  f.box.emit('pointerup', f.box);
  const synthetic = f.box.emit('click', f.box, {}, () => blankClicks++);
  assert.equal(synthetic.prevented, true);
  assert.equal(blankClicks, 0);
  assert.equal(f.closed(), 0);
  f.box.emit('pointerdown', f.box);
  f.box.emit('pointerup', f.box);
  const normal = f.box.emit('click', f.box, {}, () => blankClicks++);
  assert.equal(normal.prevented, false);
  assert.equal(blankClicks, 1);
});

console.log('PASS unified Bible picker touch: ' + cases.length + ' interaction cases');
