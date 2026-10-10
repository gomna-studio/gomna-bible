import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const source = html.match(/<script id="reader-panel-entry-boot">([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style id="reader-panel-entry-style">([\s\S]*?)<\/style>/)[1];

function classList(names = []) {
  const values = new Set(names);
  return {
    values,
    add: (...items) => items.forEach(item => values.add(item)),
    remove: (...items) => items.forEach(item => values.delete(item)),
    contains: item => values.has(item)
  };
}

function boot(search, { movingLayout = false } = {}) {
  const frames = [], timers = [];
  let frame = 0;
  function node(names = [], moving = false) {
    return {
      childElementCount: 1,
      textContent: '본문',
      classList: classList(names),
      querySelector: () => null,
      getBoundingClientRect: () => ({
        x: 0, y: 0, width: 390,
        height: 600 + (moving && movingLayout ? (frame % 2) / 10 : 0)
      })
    };
  }
  const root = { classList: classList() };
  const nodes = Object.fromEntries([
    'oldView', 'newView', 'easyView', 'favView', 'searchView', 'chapterView', 'verseView',
    'scriptureAllGuidesOverlay', 'scriptureAllGuidesBody', 'commentaryPopup',
    'verseReadHeader', 'opt4BottomBar', 'scriptureDock'
  ].map(id => [id, node([], /^(verseReadHeader|opt4BottomBar|scriptureDock)$/.test(id))]));
  // The initial Reader shell is a different panel from the requested destination.
  nodes.oldView.classList.add('active');
  const verseItem = node();
  nodes.verseView.hasPassage = true;
  nodes.verseView.querySelector = selector =>
    selector === '#verseList .verse-item' && nodes.verseView.hasPassage ? verseItem : null;
  nodes.scriptureAllGuidesOverlay.querySelector = selector =>
    selector === '#scriptureAllGuidesBody' ? nodes.scriptureAllGuidesBody : null;
  nodes.commentaryPopup.hasTabs = true;
  nodes.commentaryPopup.querySelector = selector =>
    selector === '.commentary-tabs' && nodes.commentaryPopup.hasTabs ? node() : null;
  const window = { scrollY: 0 };
  vm.runInNewContext(source, {
    window,
    document: { documentElement: root, getElementById: id => nodes[id] || null },
    location: { search }, URLSearchParams,
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      if (delay !== 15000) frames.push(callback);
    }
  });
  return {
    window, root, nodes, frames,
    tick() {
      frame += 1;
      if (movingLayout) window.scrollY = frame % 2;
      frames.shift()?.();
    },
    timeout() {
      const timer = timers.find(item => item.delay === 15000);
      assert.ok(timer, 'entry has a bounded failure notification');
      timer.callback();
    },
    activate(id) {
      for (const [name, view] of Object.entries(nodes)) {
        if (name.endsWith('View')) view.classList.remove('active');
      }
      nodes[id].classList.add(id === 'scriptureAllGuidesOverlay' ? 'is-open' : 'active');
    }
  };
}

function hidden(b) {
  assert.ok(b.root.classList.contains('reader-panel-entry-pending'));
}
function revealed(b) {
  assert.equal(b.root.classList.contains('reader-panel-entry-pending'), false);
  assert.equal(b.root.classList.contains('reader-panel-entry-failed'), false);
  assert.equal(b.window.__gomnaRevealPanelEntry(), true);
}

const routes = [
  ['', 'verseView'],
  ['?book=창세기&chapter=1', 'verseView'],
  ['?book=창세기', 'chapterView'],
  ['?book=창세기&easy=1', 'chapterView'],
  ['?book=창세기&chapter=2&favorites', 'verseView'],
  ['?testament=old', 'verseView'],
  ['?testament=new', 'verseView'],
  ['?easy', 'easyView'],
  ['?easy=1', 'easyView'],
  ['?easy=0', 'easyView'],
  ['?easy=1&cb=abc', 'easyView'],
  ['?easy&favorites', 'easyView'],
  ['?favorites', 'favView'],
  ['?focus=search', 'searchView'],
  ['?q=사랑', 'searchView']
];
for (const [query, target] of routes) {
  const b = boot(query, { movingLayout: true });
  assert.equal(b.window.__gomnaRevealPanelEntry(), false);
  b.tick(); hidden(b); // Never show the active default Reader panel.
  b.activate(target);
  b.nodes[target].childElementCount = 0;
  b.tick(); hidden(b);
  b.nodes[target].childElementCount = 1;
  b.tick(); revealed(b); // One ready RAF, even while unrelated chrome and scroll move.
  assert.equal(b.frames.length, 0, 'finished entry stops polling');
  b.nodes[target].classList.remove('active');
  b.nodes[target].childElementCount = 0;
  b.timeout(); b.tick(); revealed(b); // Later panel changes do not restart the entry gate.
}

for (const [query, target] of [['?book=창세기&chapter=1', 'verseView'], ['?book=창세기', 'chapterView']]) {
  const b = boot(query);
  b.activate(target); b.window.__gomnaRevealPanelEntry();
  b.root.classList.add('search-entry-pending');
  b.window.__gomnaScriptureLayoutPending = true;
  b.tick(); hidden(b);
  b.window.__gomnaScriptureLayoutPending = false;
  b.root.classList.add('scripture-entry-pending');
  b.tick(); hidden(b);
  b.root.classList.remove('scripture-entry-pending');
  b.tick(); revealed(b);
}

{
  const b = boot('?book=창세기&chapter=1');
  b.activate('verseView'); b.window.__gomnaRevealPanelEntry();
  b.nodes.verseView.hasPassage = false;
  b.tick(); hidden(b);
  b.nodes.verseView.hasPassage = true;
  b.tick(); revealed(b);
}

for (const [query, target] of [['?easy=1', 'easyView'], ['?favorites', 'favView'], ['?focus=search', 'searchView']]) {
  const b = boot(query);
  b.activate(target); b.window.__gomnaRevealPanelEntry();
  b.window.__gomnaScriptureLayoutPending = true;
  b.root.classList.add('scripture-entry-pending');
  if (target !== 'searchView') b.root.classList.add('search-entry-pending');
  b.tick(); revealed(b); // Background Bible layout cannot delay another ready panel.
}

{
  const b = boot('?easy=1');
  b.activate('easyView');
  b.tick(); hidden(b); // Content alone does not replace the explicit navigation completion signal.
  b.window.__gomnaRevealPanelEntry();
  b.tick(); revealed(b);
}

{
  const b = boot('?q=사랑');
  b.activate('searchView'); b.window.__gomnaRevealPanelEntry();
  b.root.classList.add('search-entry-pending');
  b.tick(); hidden(b);
  b.root.classList.remove('search-entry-pending');
  b.tick(); revealed(b);
}

{
  const b = boot('?easy=1');
  b.window.__gomnaRevealPanelEntry();
  b.timeout();
  assert.ok(b.root.classList.contains('reader-panel-entry-failed'));
  b.tick(); hidden(b);
  b.activate('easyView');
  b.tick(); revealed(b); // Late readiness recovers after the failure notification.
}

for (const source of ['home-card-commentary', 'home-main-commentary', 'meditation-commentary']) {
  const b = boot('?book=창세기&chapter=1&commentary=1&source=' + source);
  b.activate('verseView'); b.window.__gomnaRevealPanelEntry();
  b.tick(); hidden(b);
  b.nodes.commentaryPopup.classList.add('show');
  b.nodes.commentaryPopup.hasTabs = false;
  b.tick(); hidden(b);
  b.nodes.commentaryPopup.hasTabs = true;
  b.root.classList.add('gomna-home-commentary-loading');
  b.tick(); hidden(b);
  b.root.classList.remove('gomna-home-commentary-loading');
  b.tick(); revealed(b);
}

{
  const b = boot('?homeGuide=1', { movingLayout: true });
  assert.equal(b.window.__gomnaRevealGuideEntry, b.window.__gomnaRevealPanelEntry);
  b.window.__gomnaRevealGuideEntry();
  b.tick(); hidden(b);
  b.activate('scriptureAllGuidesOverlay');
  b.nodes.scriptureAllGuidesBody.childElementCount = 0;
  b.tick(); hidden(b);
  b.nodes.scriptureAllGuidesBody.childElementCount = 1;
  b.root.classList.add('scripture-entry-pending', 'search-entry-pending');
  b.window.__gomnaScriptureLayoutPending = true;
  b.tick(); revealed(b);
}

{
  const b = boot('?source=home-bible-picker&easy=1');
  assert.equal(b.root.classList.values.size, 0);
  assert.equal(b.window.__gomnaRevealPanelEntry, undefined);
  assert.equal(b.frames.length, 0);
}

assert.match(style, /html\.reader-panel-entry-pending body\{[^}]*visibility:\s*hidden\s*!important/);
assert.match(style, /html\.reader-panel-entry-pending::after\{[^}]*content:\s*(['"])\1/);
assert.doesNotMatch(style, /화면을 준비하고 있습니다/);
assert.match(style, /html\.reader-panel-entry-failed::after\{[^}]*content:\s*['"]화면을 열지 못했습니다\. 새로고침해 주세요\./);
assert.ok(html.indexOf('reader-panel-entry-boot') < html.indexOf('<body'));
assert.ok(html.indexOf('<meta charset="UTF-8">') < 1024);
console.log('15 route fixtures, single-frame readiness, moving-layout recovery, destination-specific gates, commentary and guide entry checks passed');
