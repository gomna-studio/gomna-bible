const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../js/gomna-home-resume.js'),'utf8');
function fixture(){
  const nodes=new Map(),storage=new Map();
  const parent={insertBefore(node){nodes.set(node.id,node);}};
  const feed={parentNode:parent}; nodes.set('gomnaHomeFeed',feed);
  function element(){const children=new Map(),attrs=new Map();return {hidden:false,setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),addEventListener(){},querySelector(k){if(!children.has(k))children.set(k,{textContent:''});return children.get(k);}};}
  const document={readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,createElement:element,body:{classList:{contains:()=>true}}};
  const window={addEventListener(){},dispatchEvent(){},location:{}};
  vm.runInNewContext(code,{window,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(){},Date,URLSearchParams});
  return {api:window.GOMNA_HOME_RESUME,nodes,storage};
}
test('empty or malformed history never invents a resume destination',()=>{
  const f=fixture();f.api.renderHomeCard();assert.equal(f.nodes.has('gomnaHomeResumeQuick'),false);
  f.storage.set(f.api.READ_KEY,'invalid json');f.api.renderHomeCard();assert.equal(f.nodes.has('gomnaHomeResumeQuick'),false);
});
test('saved read opens exact book chapter verse, including legacy fallback',()=>{
  const f=fixture();f.storage.set('gomna_last_read',JSON.stringify({book:'시편',chapter:23,verse:4,timestamp:1700000000000}));
  f.api.renderHomeCard();const link=f.nodes.get('gomnaHomeResumeQuick');const url=new URL(link.href,'https://example.com/');
  assert.equal(url.searchParams.get('book'),'시편');assert.equal(url.searchParams.get('chapter'),'23');assert.equal(url.searchParams.get('verse'),'4');
  assert.equal(url.searchParams.get('source'),'home-resume-read');assert.equal(link.querySelector('[data-resume-label]').textContent,'마지막으로 읽던 말씀');
});
test('read record is preferred for Continue reading; listens never auto-play',()=>{
  const f=fixture();f.api.saveRead('요한복음',3,16);f.api.saveListen('시편',23,1);f.api.renderHomeCard();
  let link=f.nodes.get('gomnaHomeResumeQuick');assert.equal(new URL(link.href,'https://example.com').searchParams.get('book'),'요한복음');
  f.storage.delete(f.api.READ_KEY);f.storage.delete('gomna_last_read');f.api.renderHomeCard();
  assert.equal(link.querySelector('[data-resume-label]').textContent,'마지막으로 듣던 말씀');assert.ok(!/autoplay|play=/.test(link.href));
  f.storage.delete(f.api.LISTEN_KEY);f.api.renderHomeCard();assert.equal(link.hidden,true);
});
