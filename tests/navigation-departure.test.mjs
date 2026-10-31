import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const guardSource=fs.readFileSync(new URL('../js/gomna-screen-transition.js',import.meta.url),'utf8');
const classes = new Set();
let clickHandler = null;
let pageShowHandler = null;
let installedStyle = null;
const root = {
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name)
  },
  appendChild: (node) => { installedStyle = node; }
};
const documentStub = {
  hidden: false,
  documentElement: root,
  head: root,
  getElementById: () => installedStyle,
  createElement: () => ({ id: '', textContent: '' }),
  addEventListener: (type, handler) => {
    if (type === 'click') clickHandler = handler;
  }
};
const windowStub = {
  addEventListener: (type, handler) => {
    if (type === 'pageshow') pageShowHandler = handler;
  }
};
const context = vm.createContext({
  document: documentStub,
  window: windowStub,
  location: {
    href: 'https://gomnastudio.com/index.html',
    origin: 'https://gomnastudio.com',
    pathname: '/index.html',
    search: ''
  },
  URL,
  Object,
  setTimeout,
  clearTimeout
});
vm.runInContext(guardSource, context, { filename: 'gomna-screen-transition.js' });

assert.ok(installedStyle);
assert.match(installedStyle.textContent, /background:transparent/);
assert.doesNotMatch(installedStyle.textContent, /visibility\s*:\s*hidden|opacity\s*:\s*0/);
assert.equal(typeof windowStub.GOMNA_SCREEN_TRANSITION.begin, 'function');
assert.equal(typeof clickHandler, 'function');

windowStub.GOMNA_SCREEN_TRANSITION.begin();
assert.ok(classes.has('gomna-route-leaving'));
pageShowHandler();
assert.ok(!classes.has('gomna-route-leaving'));

const anchor = {
  href: 'https://gomnastudio.com/reader.html?book=test',
  target: '',
  hasAttribute: () => false
};
clickHandler({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: {
    closest: (selector) => selector === 'a[href]' ? anchor : null
  }
});
assert.ok(classes.has('gomna-route-leaving'));
windowStub.GOMNA_SCREEN_TRANSITION.reset();

// Cancelled, modified, same-document, download and external links never lock the UI.
for (const changes of [
  {defaultPrevented:true}, {ctrlKey:true}, {button:1},
  {anchor:{...anchor,href:'https://gomnastudio.com/index.html#bible-library/people'}},
  {anchor:{...anchor,target:'_blank'}},
  {anchor:{...anchor,hasAttribute:()=>true}},
  {anchor:{...anchor,href:'https://example.com/'}}
]) {
  windowStub.GOMNA_SCREEN_TRANSITION.reset();
  clickHandler({button:0,target:{closest:()=>changes.anchor || anchor},...changes});
  assert.ok(!classes.has('gomna-route-leaving'));
}
// In-page controls (e.g. Find/Bible in Reader) must never be guessed to be departures.
windowStub.GOMNA_SCREEN_TRANSITION.reset();
clickHandler({button:0,target:{closest:selector=>selector==='a[href]'?null:{matches:()=>true,getAttribute:()=> 'openEasy()'}}});
assert.ok(!classes.has('gomna-route-leaving'));
console.log('transition stale-frame regression checks passed');

const reader=fs.readFileSync(new URL('../reader.html',import.meta.url),'utf8');
const goHome=reader.slice(reader.indexOf('function goHome() {'),reader.indexOf('function toggleFav(',reader.indexOf('function goHome() {')));
const order=[];
const homeWindow={GOMNA_AUDIO_COMMENTARY_BUTTONS:{stopIfCommentaryAudio:()=>order.push('commentary stopped')},GOMNA_COMMENTARY_AUTO_CENTER:{cancelAll:()=>order.push('centering stopped')},location:{assign:url=>order.push(url)}};
vm.runInNewContext(goHome+'goHome();',{window:homeWindow,closeCommentary:()=>{throw Error('must preserve current panel')},stopReaderAudioPlayback:()=>order.push('reader stopped')});
assert.equal(homeWindow.__gomnaCommentaryLoadAborted,true);
assert.deepEqual(order,['commentary stopped','centering stopped','reader stopped','./index.html?v=20260712-easyfind-direct-v3']);
console.log('Home departure keeps its panel painted and stops both audio sources');
