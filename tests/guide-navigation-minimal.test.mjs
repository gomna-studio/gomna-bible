import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const feature = read('gomna_category_feature.js');
const entry = read('js/gomna-guide-home-entry.js');
const css = read('js/gomna-guide-colorful.css');
const reader = read('reader.html');
const start = feature.indexOf('  var allGuidesDockHome = null;');
const finish = feature.indexOf('  window.openAllScriptureGuides = openAllScriptureGuides;', start);
assert.ok(start >= 0 && finish > start);
const actual = feature.slice(start, finish);

function harness(search = '?homeGuide=1', guideSource = actual) {
  const registry = new Map(), calls = [];
  class Node {
    constructor(id = '') {
      this.id = id; this.children = []; this.parentNode = null; this.attrs = {};
      this.hidden = false; this.scrollTop = 0; this.listeners = {};
      const values = new Set();
      this.classList = { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x) };
      if (id) registry.set(id, this);
    }
    get nextSibling() { const kids = this.parentNode?.children || []; return kids[kids.indexOf(this) + 1] || null; }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, next) {
      if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
      const index = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(index, 0, node); node.parentNode = this; return node;
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    querySelector(selector) { return this.parts?.[selector] || null; }
    closest(selector) { return selector === '#scriptureDock [data-dock]' && this.getAttribute('data-dock') ? this : null; }
    set innerHTML(value) {
      this.html = value;
      if (this.id === 'scriptureAllGuidesOverlay') {
        this.parts = {};
        for (const sel of ['[data-all-guides-back]', '[data-all-guides-close]', '#scriptureAllGuidesBody', '#scriptureAllGuidesSub']) {
          const node = new Node(sel.startsWith('#') ? sel.slice(1) : '');
          this.parts[sel] = node; this.appendChild(node);
        }
      }
    }
    fire(name, event = {}) { for (const fn of this.listeners[name] || []) fn(event); }
  }
  const html = new Node(), body = new Node(), frame = new Node(), dock = new Node('scriptureDock'), next = new Node('afterDock');
  body.appendChild(frame); frame.appendChild(dock); frame.appendChild(next);
  const documentListeners = {};
  const doc = {
    body, documentElement: html,
    getElementById: id => registry.get(id) || null,
    createElement: () => new Node(),
    querySelector: () => [...registry.values()].find(n => ['gomnaProfileSheet', 'gomnaProfileEditSheet'].includes(n.id) && !n.hidden) || null,
    addEventListener: (name, fn, options) => (documentListeners[name] ||= []).push({ fn, capture: options === true || !!options?.capture })
  };
  // createElement gets its id later, like the production overlay.
  const oldAppend = body.appendChild.bind(body);
  body.appendChild = node => { if (node.id) registry.set(node.id, node); return oldAppend(node); };
  const env = {
    document: doc, URLSearchParams,
    window: { location: { search, assign: url => calls.push(url) } },
    allGuidesOverlay: null, allGuidesBound: false, allGuidesReturnScroll: 0,
    getAllGuidesScrollEl: () => frame, getCurrentReaderGuidePlace: () => null,
    buildAllGuidesHtml: () => '<article>guide body</article>',
    navigateToGuideRelatedVerse: () => {}, navigateToGuideCategory: () => {}
  };
  vm.createContext(env); vm.runInContext(guideSource, env);
  const open = () => { env.openAllScriptureGuides(); return registry.get('scriptureAllGuidesOverlay'); };
  const escape = (alreadyPrevented = false) => {
    const event = { key: 'Escape', defaultPrevented: alreadyPrevented, prevented: alreadyPrevented, preventDefault() { this.defaultPrevented = this.prevented = true; } };
    const listeners = documentListeners.keydown || [];
    for (const phase of [true, false]) for (const record of listeners) if (record.capture === phase) record.fn(event);
    return event;
  };
  return { env, html, body, frame, dock, next, registry, calls, Node, open, escape, documentListeners };
}

function installReaderLoginEscape(h, login) {
  const original = reader.match(/document\.addEventListener\('keydown', function\(e\) \{\s*if \(e\.key === 'Escape' && isLoginModalOpen\(\)\) closeLoginModal\(\);\s*\}\);/);
  assert.ok(original, 'existing Reader login Escape listener remains present');
  h.env.isLoginModalOpen = () => login.classList.contains('show');
  h.env.closeLoginModal = () => login.classList.remove('show');
  vm.runInContext(original[0], h.env);
}

let checks = 0;
function check(name, fn) { fn(); checks++; }
check('back returns to the third-card query and leaves source intact', () => {
  const h = harness(), overlay = h.open();
  overlay.querySelector('[data-all-guides-back]').fire('click');
  assert.deepEqual(h.calls, ['index.html?source=home-guide']);
  assert.ok(overlay.classList.contains('is-open')); assert.equal(h.dock.parentNode, overlay);
});
check('home guide X has the same card target, without revealing Reader first', () => {
  const h = harness(), overlay = h.open();
  overlay.querySelector('[data-all-guides-close]').fire('click');
  assert.deepEqual(h.calls, ['index.html?source=home-guide']); assert.ok(!overlay.hidden);
});
check('local Reader guide X dismisses and restores the real dock before its original sibling', () => {
  const h = harness(''), overlay = h.open();
  overlay.querySelector('[data-all-guides-close]').fire('click');
  assert.equal(h.dock.parentNode, h.frame); assert.equal(h.dock.nextSibling, h.next);
  assert.ok(overlay.hidden); assert.ok(!h.html.classList.contains('reader-hide-chrome')); assert.deepEqual(h.calls, []);
});
check('mount uses one original dock and reopening restores without duplicates', () => {
  const h = harness(''), overlay = h.open(); h.open();
  assert.equal(overlay.children.filter(x => x === h.dock).length, 1);
  h.env.closeAllScriptureGuides(); h.open(); h.env.closeAllScriptureGuides();
  assert.equal(h.frame.children.filter(x => x === h.dock).length, 1); assert.equal(h.dock.nextSibling, h.next);
});
check('removing the old next sibling still restores dock safely', () => {
  const h = harness(''); h.open(); h.frame.children.splice(h.frame.children.indexOf(h.next), 1); h.next.parentNode = null;
  h.env.closeAllScriptureGuides(); assert.equal(h.dock.parentNode, h.frame);
});
for (const action of ['bible', 'find', 'archive']) check(`${action}: original handler target precedes overlay dismissal`, () => {
  const h = harness(), overlay = h.open(), button = new h.Node(); button.setAttribute('data-dock', action); h.dock.appendChild(button);
  const order = [];
  // Native inline handler is invoked at target phase before overlay bubbling.
  order.push('original target selected');
  overlay.fire('click', { target: button, defaultPrevented: false });
  if (overlay.hidden) order.push('guide dismissed');
  assert.deepEqual(order, ['original target selected', 'guide dismissed']);
  assert.equal(h.dock.parentNode, h.frame); assert.ok(h.html.classList.contains('reader-hide-chrome'));
});
for (const action of ['home', 'my', 'meditation']) check(`${action}: document/account action preserves guide`, () => {
  const h = harness(), overlay = h.open(), button = new h.Node(); button.setAttribute('data-dock', action); h.dock.appendChild(button);
  overlay.fire('click', { target: button, defaultPrevented: false });
  assert.ok(!overlay.hidden); assert.equal(h.dock.parentNode, overlay);
});
check('cancelled dock click does not dismiss source', () => {
  const h = harness(), overlay = h.open(), button = new h.Node(); button.setAttribute('data-dock', 'find');
  overlay.fire('click', { target: button, defaultPrevented: true }); assert.ok(!overlay.hidden);
});
check('Escape honors login/profile precedence and otherwise returns home guide to card', () => {
  const h = harness(); h.open(); const login = new h.Node('loginModal'); login.classList.add('show');
  assert.equal(h.escape().prevented, false); assert.deepEqual(h.calls, []);
  login.classList.remove('show'); const profile = new h.Node('gomnaProfileSheet');
  assert.equal(h.escape().prevented, false); profile.hidden = true;
  assert.equal(h.escape().prevented, true); assert.deepEqual(h.calls, ['index.html?source=home-guide']);
});
check('local Escape restores pre-existing Reader mode and original dock', () => {
  const h = harness(''); h.html.classList.add('reader-hide-chrome'); const overlay = h.open(); h.escape();
  assert.ok(overlay.hidden); assert.equal(h.dock.parentNode, h.frame); assert.ok(h.html.classList.contains('reader-hide-chrome'));
});
check('guide capture sees login before the earlier Reader bubble handler closes it', () => {
  const h = harness(), login = new h.Node('loginModal'); login.classList.add('show');
  // Reader's existing document bubble listener is installed before the guide opens.
  // It closes login without preventDefault; capture must still observe the open modal.
  installReaderLoginEscape(h, login);
  const overlay = h.open();
  assert.deepEqual(h.documentListeners.keydown.map(record => record.capture), [false, true]);
  h.escape();
  assert.ok(!login.classList.contains('show')); assert.ok(!overlay.hidden); assert.deepEqual(h.calls, []);
});
check('old guide bubble order reproduces unwanted home return after Reader closes login', () => {
  const oldOrder = actual.replace("document.addEventListener('keydown', onAllGuidesKeydown, true)", "document.addEventListener('keydown', onAllGuidesKeydown)").replace('    if (e.defaultPrevented) return;\n', '');
  const h = harness('?homeGuide=1', oldOrder), login = new h.Node('loginModal'); login.classList.add('show');
  installReaderLoginEscape(h, login); h.open(); h.escape();
  assert.deepEqual(h.calls, ['index.html?source=home-guide'], 'the old listener order fails the new keep-guide expectation');
});
check('earlier capture handler cancellation keeps precedence over guide return', () => {
  const h = harness();
  h.env.document.addEventListener('keydown', event => event.preventDefault(), true);
  const overlay = h.open(); h.escape();
  assert.ok(!overlay.hidden); assert.deepEqual(h.calls, []);
});
check('one shared six-control markup retains account handler, and scoped width accounts for body padding', () => {
  const markup = reader.slice(reader.indexOf('<nav id="scriptureDock"'), reader.indexOf('</nav>', reader.indexOf('<nav id="scriptureDock"')));
  assert.equal((markup.match(/data-dock="/g) || []).length, 6);
  for (const action of ['home', 'bible', 'find', 'archive', 'my']) assert.match(markup, new RegExp(`onclick="handleScriptureDock\\('${action}'\\)"`));
  assert.match(markup, /data-dock="meditation" href="\.\/meditation\.html"/);
  assert.doesNotMatch(entry, /close\.addEventListener|location\.href='index\.html'/);
  assert.match(css, /#scriptureAllGuidesOverlay > #scriptureDock\.scripture-dock\{[^}]*box-sizing:border-box!important/);
  assert.match(css, /max-width:calc\(var\(--reader-frame-width,420px\) - 32px\)!important/);
  assert.match(css, /@media\(min-width:769px\)[^\n]*- 48px/);
  assert.match(reader, /\.login-overlay\{z-index:10000/);
  assert.match(feature, /\.scripture-all-guides-overlay\{[^']*z-index:330/);
});
console.log(`PASS minimal guide navigation: ${checks} route/dock/account/width checks`);
