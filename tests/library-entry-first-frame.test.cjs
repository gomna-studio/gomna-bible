const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const html = read('index.html');
const source = read('js/gomna-bible-library.js');
const script = html.match(/<script id="gomna-library-entry-guard">([\s\S]*?)<\/script>/)[1];
const renderSource = source.slice(source.indexOf('  function render() {'), source.indexOf('  function navigate('));

function boot(hash) {
  const classes = new Set(), listeners = {};
  const root = {classList: {add: key => classes.add(key), remove: key => classes.delete(key)}};
  vm.runInNewContext(script, {location: {hash}, document: {documentElement: root}, window: {addEventListener: (name, handler) => {listeners[name] = handler;}}});
  return {classes, root, listeners};
}
for (const hash of ['#bible-library/stories/creation', '#bible-library/people/esther', '#bible-library/stories']) {
  const state = boot(hash);
  assert.ok(state.classes.has('gomna-library-entering'), 'block home paint for valid library destinations');
  state.listeners.load();
  assert.ok(!state.classes.has('gomna-library-entering'), 'script failure must not strand a masked home');
}
for (const hash of ['', '#other', '#bible-library/people/INVALID']) {
  assert.equal(boot(hash).classes.size, 0, 'ordinary home visits stay unmasked');
}
const state = boot('#bible-library/people/esther');
let painted = false;
const item = {id:'esther', kind:'people', name:'에스더'};
const feed = {inert:false};
const env = {
  route: () => ({kind:'people', id:'esther'}), items:[item], current:null,
  panel: {hidden:true, querySelector: () => ({setAttribute(){}, focus(){assert.ok(painted);}})},
  document: {documentElement:state.root, body:{classList:{add(){}}}, getElementById:()=>feed},
  layout(){},
  detail() { assert.ok(state.classes.has('gomna-library-entering')); painted=true; },
  list(){throw Error('unexpected list');}, closeView(){}, history:{replaceState(){}}
};
vm.createContext(env); vm.runInContext(renderSource+'\nrender();', env);
assert.ok(painted);
assert.equal(env.panel.hidden, false);
assert.equal(feed.inert, true);
assert.ok(!state.classes.has('gomna-library-entering'), 'reveal only after destination content is prepared');
assert.ok(html.indexOf('gomna-library-entry-guard') < html.indexOf('<body'), 'startup mask executes before body can paint');
console.log('library entry first-frame: 8 scenarios passed');
