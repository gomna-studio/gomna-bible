const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/gomna-bible-library.js', 'utf8');
function measure(box, visual = {height:430, offsetTop:0}, hidden = false) {
  const target = {hidden, style:{}};
  const window = {GOMNA_BIBLE_LIBRARY_DATA:[], visualViewport:visual};
  if (box) window.GOMNA_PWA_VIEWPORT = {read:()=>box};
  const context = {window, innerHeight:780, document:{getElementById:()=>({getBoundingClientRect:()=>({top:692})})}, target};
  const init = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();";
  vm.runInNewContext(source.replace(init, 'panel=target;layout();'), context);
  return target.style;
}
test('library fills the space above navigation when visual viewport is stale',()=>{
  assert.equal(measure(null).height,'430px');
  assert.equal(measure({height:780,corrected:true}).height,'692px');
});
test('library uses corrected origin after stale visual offset',()=>{
  const style=measure({height:780,corrected:true},{height:430,offsetTop:80});
  assert.equal(style.top,'0px');assert.equal(style.height,'692px');
});
test('keyboard and zoom keep their smaller viewport and offset',()=>{
  const style=measure({height:430,corrected:false},{height:430,offsetTop:40});
  assert.equal(style.top,'40px');assert.equal(style.height,'430px');
});
test('closed library is not resized',()=>assert.deepEqual(measure({height:780,corrected:true},undefined,true),{}));
