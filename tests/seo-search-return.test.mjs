import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const helperSource = read('js/gomna-seo-return.js');
const readerHtml = read('reader.html');
const origin = 'https://gomnastudio.com';
const seoPath = '/bible/acts/2/';
const readerPath = '/reader.html?book=사도행전&chapter=2&verse=1&source=seo-bible&returnPath=%2Fbible%2Facts%2F2%2F';
const storage = new Map();
function openPage({ path, referrer = '', length = 1, state = null, store = storage, blocked = false, links = [], heading = '사도행전 2장' }) {
  const url = new URL(path, origin);
  const navigations = [], offsets = [], events = new Map();
  const location = { origin, pathname: url.pathname, search: url.search, hash: url.hash };
  let href = url.href;
  Object.defineProperty(location, 'href', {
    get: () => href,
    set: value => { href = new URL(value, url).href; navigations.push(href); }
  });
  const anchors = links.map(link => ({
    href: link,
    getAttribute() { return this.href; },
    setAttribute(name, value) { assert.equal(name, 'href'); this.href = value; }
  }));
  const history = {
    length, state,
    replaceState(value, title, valueUrl) { this.state = value; assert.equal(new URL(valueUrl, url).href, url.href); },
    go(offset) { offsets.push(offset); }
  };
  const window = {
    location,
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); }
  };
  const context = vm.createContext({
    URL, URLSearchParams, location, history, window,
    document: { referrer, querySelectorAll: () => anchors,
      querySelector: selector => selector === 'h1' ? { textContent: heading } : null },
    sessionStorage: {
      getItem(key) { if (blocked) throw Error('storage disabled'); return store.get(key) || null; },
      setItem(key, value) { if (blocked) throw Error('storage disabled'); store.set(key, value); },
      removeItem(key) { store.delete(key); }
    }
  });
  vm.runInContext(helperSource, context);
  return { context, api: window.GomnaSeoReturn, history, anchors, navigations, offsets,
    url: url.href, dispatch: type => (events.get(type) || []).forEach(fn => fn({ persisted: true })) };
}

// The referrer often contains only Google's origin. Go to the real history entry
// rather than reconstructing a query or using an unrelated app-search session.
storage.set('gomna_search_return_state', JSON.stringify({ query: 'old app search', timestamp: Date.now() }));
const seo = openPage({ path: seoPath, referrer: 'https://www.google.com/', length: 2, links: [readerPath] });
const reader = openPage({ path: seo.anchors[0].href, referrer: seo.url, length: 3 });
assert.equal(reader.api.isReaderEntry, true);
assert.equal(reader.api.label(), '검색 결과로 돌아가기');
reader.api.returnToOrigin();
assert.deepEqual(reader.offsets, [-2]);
assert.deepEqual(reader.navigations, []);
assert.equal(JSON.parse(storage.get('gomna_search_return_state')).query, 'old app search');

// Static SEO chapter/book links carry the original search entry across hops.
const first = openPage({ path: '/bible/psalms/', referrer: 'https://www.google.co.kr/', length: 7, heading: '시편 대표 편',
  links: ['/bible/psalms/23/'] });
const second = openPage({ path: first.anchors[0].href, referrer: first.url, length: 8,
  links: ['/bible/psalms/91/'] });
const third = openPage({ path: second.anchors[0].href, referrer: second.url, length: 9,
  links: [readerPath] });
const afterHops = openPage({ path: third.anchors[0].href, referrer: third.url, length: 10 });
afterHops.api.returnToOrigin();
assert.deepEqual(afterHops.offsets, [-4]);
const hopsNewTab = openPage({ path: third.anchors[0].href, referrer: third.url, length: 1, store: new Map(storage) });
hopsNewTab.api.returnToOrigin();
assert.equal(new URL(hopsNewTab.navigations[0]).searchParams.get('q'), '시편 대표 편');

// Reload and back/forward restore the same entry depth, without another hop.
const reload = openPage({ path: third.anchors[0].href, referrer: third.url, length: 10, state: afterHops.history.state });
reload.dispatch('pageshow');
reload.api.returnToOrigin();
assert.deepEqual(reload.offsets, [-4]);
third.dispatch('pageshow');
const forward = openPage({ path: third.anchors[0].href, referrer: third.url, length: 10, state: afterHops.history.state });
forward.api.returnToOrigin();
assert.deepEqual(forward.offsets, [-4]);

// A new tab can copy storage/referrer but has no original search history entry.
// With Google's origin-only referrer, use the SEO title as an explicitly new query.
for (const length of [1, 2]) {
  const tab = openPage({ path: seo.anchors[0].href, referrer: seo.url, length, store: new Map(storage) });
  assert.equal(tab.api.label(), '구글 검색으로 돌아가기');
  tab.api.returnToOrigin();
  assert.deepEqual(tab.offsets, []);
  assert.equal(new URL(tab.navigations[0]).origin, 'https://www.google.com');
  assert.equal(new URL(tab.navigations[0]).searchParams.get('q'), '사도행전 2장');
}
const googleTabSeo = openPage({ path: seoPath, referrer: 'https://www.google.com/', length: 1, links: [readerPath] });
const googleTabReader = openPage({ path: googleTabSeo.anchors[0].href, referrer: googleTabSeo.url, length: 2 });
googleTabReader.api.returnToOrigin();
assert.deepEqual(googleTabReader.offsets, []);
assert.equal(new URL(googleTabReader.navigations[0]).searchParams.get('q'), '사도행전 2장');
const originalQuery = 'https://www.google.com/search?q=사도행전+성령&start=10';
const exactSeo = openPage({ path: seoPath, referrer: originalQuery, length: 1, links: [readerPath] });
const exactReader = openPage({ path: exactSeo.anchors[0].href, referrer: exactSeo.url, length: 2 });
assert.equal(exactReader.api.label(), '검색 결과로 돌아가기');
exactReader.api.returnToOrigin();
assert.deepEqual(exactReader.navigations, [new URL(originalQuery).href]);
const redirectSeo = openPage({ path: seoPath, referrer: 'https://www.google.com/url?url=https://evil.test/', length: 1,
  links: [readerPath], heading: '요한복음 3장' });
const redirectReader = openPage({ path: redirectSeo.anchors[0].href, referrer: redirectSeo.url, length: 2 });
redirectReader.api.returnToOrigin();
assert.equal(new URL(redirectReader.navigations[0]).pathname, '/search');
assert.equal(new URL(redirectReader.navigations[0]).searchParams.get('q'), '요한복음 3장');
for (const config of [
  { path: readerPath, length: 12 }, // unrelated history does not imply a Google entry
  { path: seo.anchors[0].href, length: 12 }, // copied link without SEO referrer
  { path: seo.anchors[0].href, referrer: seo.url, length: 3, store: new Map() },
  { path: seo.anchors[0].href, referrer: seo.url, length: 3, blocked: true },
  { path: '/reader.html?source=search-related&book=사도행전&chapter=2&verse=1', referrer: seo.url, length: 3 }
]) {
  const fallback = openPage(config);
  assert.equal(fallback.api.isReaderEntry, true);
  assert.equal(fallback.api.label(), '성경 본문으로 돌아가기');
  fallback.api.returnToOrigin();
  assert.deepEqual(fallback.offsets, []);
  assert.deepEqual(fallback.navigations, [origin + seoPath]);
}
const unsafe = openPage({ path: '/reader.html?source=seo-bible&returnPath=https%3A%2F%2Fevil.test%2Fbible%2Facts%2F2%2F', length: 12 });
assert.equal(unsafe.api.label(), '홈으로 돌아가기');
unsafe.api.returnToOrigin();
assert.deepEqual(unsafe.navigations, [origin + '/']);
const falseGoogle = openPage({ path: seoPath, referrer: 'https://google.evil.com/', length: 2, links: [readerPath] });
const falseReader = openPage({ path: falseGoogle.anchors[0].href, referrer: falseGoogle.url, length: 3 });
assert.equal(falseReader.api.label(), '성경 본문으로 돌아가기');

// Execute the shipped app-search return helper, preserving query/result position.
const searchStart = readerHtml.indexOf("var SEARCH_RETURN_STATE_KEY =");
const searchEnd = readerHtml.indexOf('function restoreSearchReturnScroll(', searchStart);
assert.ok(searchStart > 0 && searchEnd > searchStart);
function runAppReturn(page, saved) {
  page.context._lastSearchQuery = '';
  if (saved) storage.set('gomna_search_return_state', JSON.stringify(saved));
  vm.runInContext(readerHtml.slice(searchStart, searchEnd), page.context);
  page.context.returnToSearchResults();
}
const app = openPage({ path: '/reader.html?source=search-related&book=요한복음&chapter=3&verse=16',
  referrer: origin + '/reader.html?q=사랑', length: 15 });
assert.equal(app.api.isReaderEntry, false);
runAppReturn(app, { query: '사랑 & 은혜', timestamp: Date.now(), scrollY: 940, faithCardId: 'john3', bodyVisibleCount: 90 });
assert.deepEqual(app.navigations, [origin + '/reader.html?q=' + encodeURIComponent('사랑 & 은혜')]);
assert.deepEqual(JSON.parse(storage.get('gomna_search_return_pending')), { scrollY: 940, faithCardId: 'john3', bodyVisibleCount: 90 });
const legacy = openPage({ path: '/reader.html?source=search-related&book=사도행전&chapter=2&verse=1', referrer: seo.url, length: 3 });
runAppReturn(legacy, { query: 'stale internal query', timestamp: Date.now() });
assert.deepEqual(legacy.navigations, [origin + seoPath], 'External legacy links never restore stale app search.');
for (const config of [
  { path: readerPath },
  { path: '/reader.html?source=search-related&book=사도행전&chapter=2&verse=1', referrer: seo.url }
]) {
  const unloaded = openPage(config);
  delete unloaded.context.window.GomnaSeoReturn;
  runAppReturn(unloaded, { query: 'stale internal query', timestamp: Date.now() });
  assert.deepEqual(unloaded.navigations, [origin + seoPath], 'A failed helper load still cannot open app search.');
}
const malformed = openPage({ path: '/reader.html?source=seo-bible&returnPath=http%3A%2F%2F%5B' });
delete malformed.context.window.GomnaSeoReturn;
runAppReturn(malformed, { query: 'stale internal query', timestamp: Date.now() });
assert.deepEqual(malformed.navigations, [origin + '/'], 'Invalid return URLs still cannot fall into app search.');

// First paint must hide the previous reader list before opening the SEO verse.
const headBoot = readerHtml.match(/<script>(\/\* v72: reader\.html always uses official dock \*\/[\s\S]*?)<\/script>/)[1];
const classes = new Set();
vm.runInNewContext(headBoot, {
  URLSearchParams, location: { search: new URL(readerPath, origin).search },
  document: { documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } } }
});
assert.ok(classes.has('scripture-entry-pending'));
assert.ok(readerHtml.indexOf('/js/gomna-seo-return.js') < readerHtml.indexOf('<body'));

// Execute the actual scripture entry controller: changing book/chapter clears
// the entry highlight, but retains a functioning external-source return button.
function functionBefore(name, nextName) {
  const start = readerHtml.indexOf(`function ${name}(`);
  const end = readerHtml.indexOf(`function ${nextName}(`, start);
  assert.ok(start > 0 && end > start, name);
  return readerHtml.slice(start, end);
}
const entryController = readerHtml.match(/<script>\n(\/\* ── scripture entry:[\s\S]*?)<\/script>/)[1];
const ui = openPage({ path: readerPath });
const buttons = [];
const parent = { removeChild(button) { buttons.splice(buttons.indexOf(button), 1); button.parentNode = null; } };
const firstVerse = { insertAdjacentElement(where, button) {
  assert.equal(where, 'afterend'); buttons.push(button); button.parentNode = parent;
} };
ui.context.document.documentElement = { classList: { contains: () => false, remove() {} } };
ui.context.document.createElement = tag => ({
  tag, attributes: {}, listeners: {},
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; },
  addEventListener(name, fn) { this.listeners[name] = fn; }
});
ui.context.document.querySelector = selector => selector === '#verseList .verse-item' ? firstVerse : null;
ui.context.document.getElementById = () => null;
ui.context.requestAnimationFrame = () => {};
vm.runInContext(readerHtml.slice(searchStart, searchEnd), ui.context);
vm.runInContext(functionBefore('buildScriptureEntryVerseList', 'parseRelatedScriptureLabelRange') +
  functionBefore('isScriptureEntrySource', 'hasExplicitScriptureVerseQuery') +
  functionBefore('hasExplicitScriptureVerseQuery', 'isHomeTodayEntryFocusSource') +
  functionBefore('parseScriptureEntryFromSearchParams', 'openScriptureHighlightEntry'), ui.context);
assert.equal(ui.context.isScriptureEntrySource('seo-bible'), true);
const parsed = ui.context.parseScriptureEntryFromSearchParams(new URLSearchParams(new URL(readerPath, origin).search));
assert.equal(parsed.source, 'seo-bible');
assert.equal(parsed.book, '사도행전');
assert.equal(parsed.chapter, 2);
assert.deepEqual(Array.from(parsed.verses), [1]);
vm.runInContext(entryController, ui.context);
ui.context.window.exitScriptureEntryView();
ui.context.window.currentBook = { name: '요한복음' };
ui.context.window.currentChapter = 3;
ui.dispatch('gomna:verse_list_rendered');
assert.equal(buttons.length, 1);
assert.equal(buttons[0].attributes['data-seo-return'], '1');
assert.equal(buttons[0].attributes['data-daily-word-return'], undefined);
assert.equal(buttons[0].textContent, '← 성경 본문으로 돌아가기');
ui.dispatch('gomna:verse_list_rendered');
assert.equal(buttons.length, 1, 'Repeated chapter rendering does not duplicate the return button.');
buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(ui.navigations, [origin + seoPath]);

// All generated Reader links use the SEO source and actual originating page.
for (const file of fs.readdirSync(new URL('../bible/', import.meta.url), { recursive: true }).filter(file => file.endsWith('index.html'))) {
  const html = read('bible/' + file);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
  for (const link of [...html.matchAll(/href="(\/reader\.html\?[^\"]+)"/g)]) {
    const url = new URL(link[1].replaceAll('&amp;', '&'), origin);
    assert.equal(url.searchParams.get('source'), 'seo-bible', file);
    assert.equal(url.searchParams.get('returnPath'), new URL(canonical).pathname, file);
  }
  assert.match(html, /\/js\/gomna-seo-return\.js\?v=20261010-seo-return-v1/);
}
console.log('seo-search-return: external history, SEO hops, reload/bfcache, Google new-tab query, direct/storage/helper fallback, legacy/app state, chapter UI, first paint and generated links PASS');
