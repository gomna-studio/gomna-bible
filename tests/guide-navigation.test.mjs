import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped guide handlers against a small DOM. The native menu
// object carries its own click listener; moving it must preserve that object.
function fixture(search = '?homeGuide=1') {
  const nodes = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  function element(id = '') {
    const classes = new Set();
    const listeners = new Map();
    const attributes = new Map();
    const node = {
      id, parentNode: null, children: [], hidden: false, scrollTop: 0, style: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      setAttribute: (key, value) => attributes.set(key, String(value)),
      getAttribute: key => attributes.get(key) ?? null,
      removeAttribute: key => attributes.delete(key),
      addEventListener: (type, fn) => listeners.set(type, fn),
      focus() {},
      querySelector(selector) { return this.parts?.get(selector) || null; },
      appendChild(child) { return this.insertBefore(child, null); },
      insertBefore(child, next) {
        if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
        const index = next ? this.children.indexOf(next) : -1;
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
        child.parentNode = this;
        return child;
      },
      fire(type, event = {}) { listeners.get(type)?.(event); }
    };
    Object.defineProperty(node, 'nextSibling', { get() {
      if (!this.parentNode) return null;
      return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
    } });
    Object.defineProperty(node, 'innerHTML', { set(value) {
      this.html = value;
      if (this.id !== 'scriptureAllGuidesOverlay') return;
      this.parts = new Map();
      for (const selector of ['[data-all-guides-back]', '[data-all-guides-close]', '#scriptureAllGuidesBody', '#scriptureAllGuidesSub', '#scriptureAllGuidesTitle']) {
        const child = element(selector.startsWith('#') ? selector.slice(1) : '');
        this.parts.set(selector, child);
        this.appendChild(child);
        if (child.id) nodes.set(child.id, child);
      }
    } });
    if (id) nodes.set(id, node);
    return node;
  }
  const root = element('html');
  const page = element('body');
  const menuParent = element('readerFrame');
  const dock = element('scriptureDock');
  const following = element('afterDock');
  const verseView = element('verseView');
  menuParent.appendChild(dock);
  menuParent.appendChild(following);
  page.appendChild(menuParent);
  root.scrollTop = 137;
  let nativeClicks = 0;
  dock.addEventListener('click', () => nativeClicks++);
  const document = {
    readyState: 'loading', head: element(), body: page, documentElement: root, scrollingElement: root,
    createElement: () => element(),
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null,
    addEventListener: (type, fn) => {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(fn);
    }
  };
  // Newly assigned IDs should be discoverable just as in a browser.
  page.appendChild = function (child) { if (child.id) nodes.set(child.id, child); return this.insertBefore(child, null); };
  const context = {
    document, URLSearchParams, location: { search, href: 'reader.html' }, console,
    setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {},
    addEventListener: (type, fn) => windowListeners.set(type, fn)
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(new URL('../gomna_category_feature.js', import.meta.url), 'utf8'), context);
  return { context, document, root, menuParent, dock, following, verseView, nativeClicks: () => nativeClicks, overlay: () => nodes.get('scriptureAllGuidesOverlay') };
}

{
  const f = fixture();
  f.context.openAllScriptureGuides();
  assert.equal(f.dock.parentNode, f.overlay(), 'the guide contains the existing menu');
  f.dock.fire('click');
  assert.equal(f.nativeClicks(), 1, 'existing native menu listeners survive');
  f.overlay().querySelector('[data-all-guides-back]').fire('click');
  assert.equal(f.context.location.href, 'index.html?source=home-guide');
  assert.equal(f.overlay().hidden, false, 'the old Reader stays covered while home loads');
  f.context.closeAllScriptureGuides();
  assert.equal(f.dock.parentNode, f.menuParent);
  assert.equal(f.dock.nextSibling, f.following, 'original menu order is restored');
  assert.equal(f.root.scrollTop, 137);
  f.context.openAllScriptureGuides();
  f.root.scrollTop = 0;
  f.context.closeAllScriptureGuides({ restoreScroll: false });
  assert.equal(f.root.scrollTop, 0, 'navigation does not restore the previous page scroll');
  f.dock.fire('click');
  assert.equal(f.nativeClicks(), 2);
}

{
  const f = fixture();
  f.context.openAllScriptureGuides();
  f.overlay().querySelector('[data-all-guides-close]').fire('click');
  assert.equal(f.context.location.href, 'index.html?source=home-guide', 'home guide X returns to its source card');
  assert.equal(f.overlay().hidden, false);
  const local = fixture('');
  local.context.openAllScriptureGuides();
  local.overlay().querySelector('[data-all-guides-close]').fire('click');
  assert.equal(local.overlay().hidden, true, 'Reader guide X still returns to the Reader');
}

{
  const f = fixture();
  const category = { getAttribute: key => key === 'data-guide-read-testament' ? 'old' : '모세오경' };
  const clickCategory = () => f.overlay().querySelector('#scriptureAllGuidesBody').fire('click', {
    preventDefault() {}, target: { closest: selector => selector === '[data-guide-read-testament]' ? category : null }
  });
  f.context.openAllScriptureGuides();
  f.context.goToVerse = () => {};
  clickCategory();
  assert.equal(f.overlay().hidden, false, 'unavailable destinations keep the current guide visible');
  f.context.goToVerse = (book, chapter) => {
    assert.equal(f.overlay().hidden, false, 'destination renders before the guide closes');
    f.context.currentBook = { name: book };
    f.context.currentChapter = chapter;
    f.verseView.classList.add('active');
  };
  clickCategory();
  assert.equal(f.overlay().hidden, true, 'a completed destination replaces the guide');
  assert.equal(f.dock.parentNode, f.menuParent);
}

console.log('guide navigation lifecycle checks passed');
