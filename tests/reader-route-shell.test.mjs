import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const earlyDock = scripts.find(source => source.includes('v72: keep dock classes in sync'));
const earlyFlags = scripts.find(source => source.includes('v72: reader.html always uses official dock'));
const bodyBoot = scripts.find(source => source.includes('All route markup and core functions are available now'));
assert.ok(earlyDock && earlyFlags && bodyBoot, 'extract the actual entry scripts');
function section(start, end) {
  const first = html.indexOf(start), last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'extract ' + start);
  return html.slice(first, last);
}
const shell = section('var _gomnaEasyEntryEarly = false;', 'var _gomnaBibleAppInitialized = false;');
const navigation = section('function applyNavigationFromQuery() {', '/* 홈 이어보기(읽기·듣기·최근) 진입');
const deferredNavigation = section('function runDeferredUrlNavigation() {', 'var _gomnaEasyEntryEarly = false;');
const initialize = section('function initializeApp() {', "\nwindow.addEventListener('resize', function()");

function classes(names = []) {
  const values = new Set(names);
  return {
    add: (...items) => items.forEach(item => values.add(item)),
    remove: (...items) => items.forEach(item => values.delete(item)),
    contains: item => values.has(item),
    toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name)
  };
}

function harness(search = '?easy=1', { instantData = false } = {}) {
  const documentEvents = {}, windowEvents = {}, frames = [], calls = [], replays = [];
  const nodes = {};
  const views = ['oldView', 'newView', 'easyView', 'favView', 'searchView', 'chapterView', 'verseView'];
  function element(id, { tag = 'button', attributes = [], value = '' } = {}) {
    const handlers = {};
    const el = {
      id, value, isConnected: true, childElementCount: 0, textContent: '',
      classList: classes(),
      closest(selector) {
        return selector.split(',').some(part => part === tag || attributes.includes(part.replace(/^\[|\]$/g, ''))) ? el : null;
      },
      addEventListener(name, callback) { (handlers[name] ||= []).push(callback); },
      appendChild(child) { nodes[child.id] = child; },
      setAttribute() {},
      remove() { delete nodes[id]; el.isConnected = false; },
      click() { fire(el, 'click'); },
      dispatchEvent(event) { return fire(el, event.type, event.key); },
      handlers
    };
    nodes[id] = el;
    return el;
  }
  for (const id of views) element(id);
  nodes.oldView.classList.add('active');
  const document = {
    readyState: 'loading',
    documentElement: { classList: classes() },
    getElementById: id => nodes[id] || null,
    querySelectorAll: selector => selector.includes('.view') ? views.map(id => nodes[id]) : [],
    querySelector: () => null,
    createElement: () => element(''),
    addEventListener(name, callback) { (documentEvents[name] ||= []).push(callback); }
  };
  function activate(id) {
    for (const name of views) nodes[name].classList.remove('active');
    nodes[id].classList.add('active');
  }
  function active() { return views.find(id => nodes[id].classList.contains('active')); }
  function fire(target, type, key) {
    const event = {
      target, type, key, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; }
    };
    for (const callback of nodes.easyView.handlers[type] || []) {
      callback(event);
      if (event.stopped) break;
    }
    if (!event.defaultPrevented && (type === 'click' || key === 'Enter')) replays.push(target.id + ':' + type);
    return event;
  }
  const noop = () => {};
  const context = {
    document, location: { search, hash: '' }, URLSearchParams, console,
    Event: class { constructor(type) { this.type = type; } },
    KeyboardEvent: class { constructor(type, opts) { this.type = type; Object.assign(this, opts); } },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => frames.push(callback),
    addEventListener(name, callback) { (windowEvents[name] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of windowEvents[event.type] || []) callback(event); },
    oldTestamentData: { books: [{ name: '창세기', chapters: [] }] },
    newTestamentData: { books: [] },
    _gomnaOldTestamentLoadState: 'pending', _gomnaNewTestamentLoadState: 'pending',
    renderEasyFind() { calls.push('find:' + context._gomnaEasyEntryEarly); nodes.easyView.childElementCount = 1; },
    renderFavorites() { calls.push('archive'); nodes.favView.childElementCount = 1; },
    switchTab(tab) { activate(tab + 'View'); },
    __gomnaRevealPanelEntry() { calls.push('reveal:' + active()); },
    loadBibleData() { calls.push('load'); if (instantData) settle(); },
    GomnaBibleSearch: { buildIndex() { assert.fail('opening a route must not eagerly build the search index'); } },
    selectBook() { nodes.chapterView.childElementCount = 1; activate('chapterView'); },
    renderVerses() { nodes.verseView.childElementCount = 1; },
    findBook: (data, name) => data?.books.find(book => book.name === name),
    getDisplayedChapterCount: () => 50,
    showBibleTabPassage() { activate('verseView'); nodes.verseView.childElementCount = 1; },
    resolveBibleTabPlace: () => ({ book: '창세기', chapter: 1 }),
    homeBiblePickTestament: () => null,
    readSearchReturnPending: () => null,
    doSearch() { document.documentElement.classList.remove('search-entry-pending'); },
    getActiveReaderViewId: active,
    isMobilePullView: () => false,
    testamentListNeedsRender: () => false
  };
  for (const name of [
    'syncScriptureDockActive', 'syncReaderNavActive', 'syncReaderChapterLayout', 'loadCommentaryData',
    'updateHeaderBtns', 'openHomeBibleQuickMove', 'resetBibleListScroll', 'settleHomeResumeEntryOnReveal',
    'refreshTestamentListIfNeeded', 'initVerseToolbarEvents', 'syncReaderNativeUiLangClass',
    'syncReaderDockMode', 'refreshReaderChapterLabelsAfterTranslation', 'syncOpt4ToolbarWrapMode'
  ]) context[name] = noop;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(earlyFlags, context);
  vm.runInContext(earlyDock, context);
  vm.runInContext(navigation + '\n' + deferredNavigation + '\n' + initialize + '\n' + shell, context);
  function settle() {
    context._gomnaOldTestamentLoadState = 'loaded';
    context._gomnaNewTestamentLoadState = 'loaded';
    context.initializeApp();
  }
  return {
    context, document, nodes, calls, replays, frames, element, fire, settle, active,
    boot: () => vm.runInContext(bodyBoot, context),
    domReady() {
      document.readyState = 'interactive';
      for (const callback of documentEvents.DOMContentLoaded || []) callback();
    }
  };
}

test('actual end-of-body boot paints Find before DOMContentLoaded and runs only once', () => {
  const h = harness();
  assert.deepEqual(h.calls, []);
  h.boot();
  assert.equal(h.document.readyState, 'loading');
  assert.equal(h.active(), 'easyView');
  assert.deepEqual(h.calls, ['find:true', 'reveal:easyView', 'load']);
  const clickHandlers = h.nodes.easyView.handlers.click.length;
  h.boot(); h.domReady();
  assert.deepEqual(h.calls, ['find:true', 'reveal:easyView', 'load']);
  assert.equal(h.nodes.easyView.handlers.click.length, clickHandlers);
});

for (const [query, expected] of [
  ['?book=창세기', 'chapterView'],
  ['?book=창세기&easy=1', 'chapterView'],
  ['?book=창세기&chapter=1&easy=1', 'verseView'],
  ['?favorites', 'favView'],
  ['?focus=search', 'searchView']
]) {
  test('late optional-module DOMContentLoaded preserves the initialized destination: ' + query, () => {
    const h = harness(query, { instantData: true });
    h.boot();
    assert.equal(h.active(), expected);
    h.domReady();
    assert.equal(h.active(), expected);
    assert.equal(h.calls.filter(call => call === 'load').length, 1);
  });
}

test('cold Find input clicks, navigation controls, clear and back remain immediately usable', () => {
  const h = harness(); h.boot();
  for (const [id, opts] of [
    ['search-input', { tag: 'input', value: '사랑' }],
    ['group', { attributes: ['data-easy-group'] }],
    ['clear', { attributes: ['data-easy-clear'] }],
    ['back', { attributes: ['data-easy-back'] }]
  ]) {
    const event = h.fire(h.element(id, opts), 'click');
    assert.equal(event.defaultPrevented, false, id + ' must not wait for corpus data');
    assert.equal(event.stopped, false);
  }
  assert.equal(h.context._gomnaPendingEasyAction, null);
  assert.equal(h.nodes.easyEntryDataStatus, undefined, 'normal pending data adds no intermediate status card');
});

test('only the latest cold Enter or reference action replays after corpus readiness', () => {
  const h = harness(); h.boot();
  const input = h.element('input', { tag: 'input', value: '사랑' });
  assert.equal(h.fire(input, 'keydown', 'a').defaultPrevented, false);
  assert.equal(h.fire(input, 'keydown', 'Enter').defaultPrevented, true);
  input.value = '은혜';
  assert.equal(h.fire(input, 'keydown', 'Enter').defaultPrevented, true);
  const ref = h.element('reference', { attributes: ['data-easy-ref'] });
  assert.equal(h.fire(ref, 'click').defaultPrevented, true);
  h.settle();
  assert.deepEqual(h.replays, ['reference:click']);
  assert.equal(h.context._gomnaPendingEasyAction, null);
});

test('latest Enter replays once with the requested value', () => {
  const h = harness(); h.boot();
  const input = h.element('input', { tag: 'input', value: '사랑' });
  h.fire(input, 'keydown', 'Enter');
  input.value = '은혜'; h.fire(input, 'keydown', 'Enter');
  h.settle();
  assert.deepEqual(h.replays, ['input:keydown']);
  assert.equal(input.value, '은혜');
  assert.equal(h.context._gomnaPendingEasyAction, null);
});

for (const cancel of ['input', 'clear', 'back', 'changed-value', 'detached', 'other-view']) {
  test('cold Enter is cancelled by ' + cancel, () => {
    const h = harness(); h.boot();
    const input = h.element('input', { tag: 'input', value: '사랑' });
    h.fire(input, 'keydown', 'Enter');
    if (cancel === 'input') h.fire(input, 'input');
    if (cancel === 'clear' || cancel === 'back') h.fire(h.element(cancel, { attributes: ['data-easy-' + cancel] }), 'click');
    if (cancel === 'changed-value') input.value = '다른 검색어';
    if (cancel === 'detached') input.isConnected = false;
    if (cancel === 'other-view') h.context.switchTab('fav');
    const before = h.replays.length;
    h.settle();
    assert.equal(h.replays.length, before, 'settling data must not reopen cancelled navigation');
  });
}

test('a real corpus error remains visible while normal pending is silent', () => {
  const h = harness(); h.boot();
  h.context._gomnaOldTestamentLoadState = 'error';
  h.fire(h.element('input', { tag: 'input', value: '창세기 1:1' }), 'keydown', 'Enter');
  assert.match(h.nodes.easyEntryDataStatus.textContent, /불러오지 못했습니다/);
  assert.doesNotMatch(h.nodes.easyEntryDataStatus.textContent, /준비/);
});

test('the head search mask is applied only to a real query destination', () => {
  for (const [query, expected] of [
    ['?q=사랑', true], ['?q=%20%20', false], ['?focus=search', false],
    ['?book=창세기&q=사랑', false], ['?easy=1&q=사랑', false],
    ['?favorites&q=사랑', false], ['?homeGuide=1&q=사랑', false],
    ['?source=home-bible-picker&q=사랑', false]
  ]) {
    const h = harness(query);
    assert.equal(h.document.documentElement.classList.contains('search-entry-pending'), expected, query);
  }
});
