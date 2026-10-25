import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const entry = read('js/gomna-guide-home-entry.js');
const boot = read('reader.html').match(/<script id="reader-panel-entry-boot">([\s\S]*?)<\/script>/)[1];

for (const search of ['?homeGuide=1', '?guideDetail=1&guideTestament=old&guideCategory=모세오경']) {
  test(search + ' opens the guide without leaving the app and reveals it when ready', () => {
    const classes = new Set(['gomna-home-guide-entering']);
    const frames = [], listeners = {}, opened = [];
    let visible = false;
    const view = {textContent:'성경 길잡이', classList:{contains:()=>visible},
      querySelector:()=>visible ? view : null, getBoundingClientRect:()=>({x:0,y:0,width:390,height:700})};
    const root = {classList:{add:(...v)=>v.forEach(x=>classes.add(x)),
      remove:(...v)=>v.forEach(x=>classes.delete(x)), contains:x=>classes.has(x)}};
    const context = vm.createContext({URLSearchParams,
      location:{search,replace(){assert.fail('guide must not redirect to the image gallery');}},
      document:{readyState:'loading',documentElement:root,
        getElementById:id=>id==='scriptureAllGuidesOverlay' ? view : null,
        addEventListener:(event,fn)=>{listeners[event]=fn;}},
      window:{scrollY:0,addEventListener(){},openAllScriptureGuides:selection=>{opened.push(selection);visible=true;}},
      requestAnimationFrame:fn=>frames.push(fn),setTimeout(){}});
    vm.runInContext(boot, context);
    vm.runInContext(entry, context);
    assert.equal(opened.length,0);
    assert.ok(classes.has('reader-panel-entry-pending'));
    listeners.DOMContentLoaded();
    assert.equal(opened.length,1);
    assert.equal(opened[0].category, search.includes('guideDetail') ? '모세오경' : null);
    for (let i=0;i<5;i++) frames.shift()?.();
    assert.equal(classes.size,0);
  });
}

test('app entry and search-image landing pages retain separate destinations', () => {
  assert.match(read('index.html'), /class="gomna-home-poster-pill gbl-guide-link" href="reader.html\?homeGuide=1"/);
  assert.match(read('bible-images/esther/index.html'), /\/index.html#bible-library\/people\/esther/);
  assert.match(read('bible-images/mount-sinai/index.html'), /guideDetail=1/);
  assert.equal((read('sitemap-images.xml').match(/<image:image>/g)||[]).length,49);
});
