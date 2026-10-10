import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../reader.html',import.meta.url),'utf8');
const source=html.match(/<script id="reader-panel-entry-boot">([\s\S]*?)<\/script>/)[1];
function boot(search){
  const classes=new Set(),target={active:false,childElementCount:1,classList:{contains:()=>target.active}};
  let timer;const frames=[];
  target.textContent='본문';target.querySelector=()=>target;target.getBoundingClientRect=()=>({x:0,y:0,width:390,height:600});
  const root={classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)}};
  const window={};
  vm.runInNewContext(source,{window,document:{documentElement:root,getElementById:()=>target},location:{search},URLSearchParams,requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn,ms)=>{if(ms===15000)timer=fn;else frames.push(fn);}});
  return {window,classes,target,timer,tick:()=>frames.shift()?.()};
}
for(const query of ['', '?book=창세기&chapter=1','?book=창세기&easy=1','?testament=old','?easy','?easy=1','?easy=0','?easy=1&cb=abc','?favorites','?focus=search','?q=사랑']){
  const b=boot(query);
  assert.ok(b.classes.has('reader-panel-entry-pending'));
  assert.equal(b.window.__gomnaRevealPanelEntry(),false);
  b.timer();assert.ok(b.classes.has('reader-panel-entry-failed'));
  b.target.active=true;b.target.childElementCount=0;
  assert.equal(b.window.__gomnaRevealPanelEntry(),false);
  b.target.childElementCount=1;
  b.window.__gomnaScriptureLayoutPending=true;
  for(let i=0;i<5;i++)b.tick();assert.ok(b.classes.has('reader-panel-entry-pending'));
  b.window.__gomnaScriptureLayoutPending=false;
  for(let i=0;i<5;i++)b.tick();
  assert.equal(b.window.__gomnaRevealPanelEntry(),true);
  assert.equal(b.classes.size,0);
}
for(const query of ['?source=home-bible-picker&easy=1']){
  const b=boot(query);assert.equal(b.classes.size,0);assert.equal(b.window.__gomnaRevealPanelEntry,undefined);
}
{
  const b=boot('?homeGuide=1');
  assert.equal(typeof b.window.__gomnaRevealGuideEntry,'function');
  b.window.__gomnaRevealGuideEntry();
  for(let i=0;i<5;i++)b.tick();
  assert.ok(b.classes.has('reader-panel-entry-pending'),'guide stays hidden until its own content is open');
  b.target.active=true;
  b.classes.add('scripture-entry-pending');
  b.window.__gomnaScriptureLayoutPending=true;
  for(let i=0;i<5;i++)b.tick();
  assert.ok(!b.classes.has('reader-panel-entry-pending'),'guide does not wait for background Bible rendering');
}
assert.ok(html.indexOf('reader-panel-entry-boot')<html.indexOf('<body'));
assert.ok(html.indexOf('<meta charset="UTF-8">')<1024);
console.log('12 route classification cases and readiness/failure recovery checks passed');
