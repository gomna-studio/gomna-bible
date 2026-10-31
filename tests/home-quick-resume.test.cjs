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
test('saved reading and listening remain independently available without adding a home strip',()=>{
  const f=fixture();f.api.saveRead('요한복음',3,16);f.api.saveListen('시편',23,1);f.api.renderHomeCard();
  assert.equal(f.api.getRead().bookName,'요한복음');assert.equal(f.api.getRead().verse,16);
  assert.equal(f.api.getListen().bookName,'시편');assert.equal(f.api.getListen().verse,1);
  assert.equal(f.nodes.has('gomnaHomeResumeQuick'),false);
});
