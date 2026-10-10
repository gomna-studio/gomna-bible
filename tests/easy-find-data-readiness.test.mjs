import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/gomna-easy-find.js', import.meta.url), 'utf8');
const start = source.indexOf('  var pendingDataQuery=null, pendingDataOpts;');
const end = source.indexOf('\n  function paint()', start);
assert(start >= 0 && end > start, 'find the production search renderer and settled listener');

function findHarness() {
  const elements = {
    easyFindSearchResults: { hidden: true, innerHTML: '' },
    easyFindHomeBody: { hidden: false, innerHTML: 'existing find home and scope controls' },
    easyFindScroll: { scrollTop: 77 },
    easyFindFilter: { hidden: false }
  };
  const callbacks = {};
  const clear = { hidden: true };
  const active = [];
  const captured = [];
  const context = {
    global: {
      __gomnaBibleDataReady: false,
      addEventListener: (name, callback) => { callbacks[name] = callback; }
    },
    document: {
      getElementById: id => elements[id],
      querySelector: () => clear
    },
    state: { topicId: '', bodyVisible: 30 },
    _gomnaOldTestamentLoadState: 'pending',
    _gomnaNewTestamentLoadState: 'pending',
    topicById: () => null,
    resetTopicScope: () => {},
    closeScopePopup: () => {},
    setSearchActive: value => active.push(value),
    captureHomeScroll: () => captured.push(elements.easyFindScroll.scrollTop),
    parseRef: () => null,
    matchBooks: () => [],
    bookInScope: () => true,
    isJamoQuery: () => false,
    collectWordHits: query => ({
      topic: [], body: [{ book: '창세기', chapter: 1, verse: 1, text: query }], faith: []
    }),
    mergeVerseHits: (topic, body) => body,
    verseInScope: () => true,
    faithInScope: () => true,
    verseCardHtml: row => '<p>' + row.text + '</p>',
    esc: value => value,
    paintResultFilter: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return {
    context, elements, clear, active, captured,
    settle: () => callbacks['gomna:bible-data-settled']()
  };
}

test('pending data keeps find home and replays only the latest query with its scroll options', () => {
  const { context, elements, clear, active, captured, settle } = findHarness();
  context.renderSearchResults('사랑');
  context.renderSearchResults('은혜', { keepScroll: true });
  assert.equal(elements.easyFindHomeBody.hidden, false);
  assert.equal(elements.easyFindSearchResults.hidden, true);
  assert.equal(elements.easyFindHomeBody.innerHTML, 'existing find home and scope controls');
  assert.equal(elements.easyFindFilter.hidden, false);
  assert.equal(clear.hidden, false);
  assert.deepEqual(active, []);

  context.global.__gomnaBibleDataReady = true;
  settle();
  assert.match(elements.easyFindSearchResults.innerHTML, /‘은혜’ 검색 결과/);
  assert.doesNotMatch(elements.easyFindSearchResults.innerHTML, /사랑/);
  assert.equal(elements.easyFindSearchResults.hidden, false);
  assert.equal(elements.easyFindHomeBody.hidden, true);
  assert.equal(elements.easyFindScroll.scrollTop, 77);
  assert.deepEqual(captured, [77]);
  assert.deepEqual(active, [true]);
  settle();
  assert.deepEqual(active, [true], 'a second settled event must not repeat a consumed query');
});

test('clearing during data loading cancels the deferred query', () => {
  const { context, elements, clear, active, settle } = findHarness();
  context.renderSearchResults('사랑');
  context.renderSearchResults('', { restoreScroll: 42 });
  context.global.__gomnaBibleDataReady = true;
  settle();
  assert.equal(elements.easyFindSearchResults.hidden, true);
  assert.equal(elements.easyFindSearchResults.innerHTML, '');
  assert.equal(elements.easyFindHomeBody.hidden, false);
  assert.equal(elements.easyFindScroll.scrollTop, 42);
  assert.equal(clear.hidden, true);
  assert.deepEqual(active, [false]);
});

test('a real load failure remains explicit and a later recovery replays the query', () => {
  const { context, elements, active, settle } = findHarness();
  context.renderSearchResults('은혜');
  context._gomnaOldTestamentLoadState = 'error';
  settle();
  assert.equal(elements.easyFindSearchResults.hidden, false);
  assert.equal(elements.easyFindHomeBody.hidden, true);
  assert.match(elements.easyFindSearchResults.innerHTML, /불러오지 못했습니다/);
  assert.deepEqual(active, []);

  context.global.__gomnaBibleDataReady = true;
  context._gomnaOldTestamentLoadState = 'loaded';
  settle();
  assert.match(elements.easyFindSearchResults.innerHTML, /‘은혜’ 검색 결과/);
  assert.deepEqual(active, [true]);
});
