const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../reader.html'),'utf8');
function extract(name) {
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?undefined:end).split('\nwindow.')[0];
}
function node(...initial) {
  const values=new Set(initial);
  return {hidden:false,disabled:false,style:{},classList:{
    contains:key=>values.has(key),add:(...keys)=>keys.forEach(k=>values.add(k)),
    remove:(...keys)=>keys.forEach(k=>values.delete(k)),toggle:(key,on)=>on?values.add(key):values.delete(key)
  }};
}
function harness() {
  const root=node('reader-verse-active','reader-verse-toolbar-mode');
  const nodes={verseView:node('active'),opt4BottomBar:node(),verseReadHeader:node(),
    readerChapterPrevFab:node('is-scroll-nav-visible'),readerChapterNextFab:node('is-scroll-nav-visible')};
  const env={document:{documentElement:root,body:node(),getElementById:id=>nodes[id]||null},
    currentBook:{name:'창세기',testament:'old',chapters:50},currentChapter:3,
    oldTestamentData:{},newTestamentData:{},readerChFabPlace:'창세기:3',opt4BarAutoHidePlace:'창세기:3',
    findBook:()=>({}),getDisplayedChapterCount:()=>50,
    positionReaderChapterFabs(){},bindReaderChapterFabChrome(){},
    hideReaderChapterFabsNow(){env.setReaderChapterFabsVisible(false);},
    revealReaderChapterFabs(){env.setReaderChapterFabsVisible(true);},
    stopReaderAudioOutsideVerseView(){},closeVerseReadMoreMenu(){},closeVerseToolbarMoreMenu(){},
    closeVerseToolbarTargetMenu(){},syncScriptureBooksToolbar(){},window:{}};
  vm.createContext(env);
  for(const name of ['readerChapterFabsBlocked','setReaderChapterFabsVisible','syncReaderChapterFabs','updateOpt4BottomBar']) {
    vm.runInContext(extract(name),env);
  }
  return {env,root,nodes};
}
for(const destination of ['easyView','favView','searchView','oldView','newView','chapterView']) {
  test('verse → '+destination+' hides chapter arrows synchronously',()=>{
    const {env,root,nodes}=harness();
    env.syncReaderChapterFabs();
    assert.equal(nodes.readerChapterNextFab.hidden,false);
    nodes.verseView.classList.remove('active');nodes[destination]=node('active');
    env.updateOpt4BottomBar();
    assert.equal(root.classList.contains('reader-verse-active'),false);
    for(const id of ['readerChapterPrevFab','readerChapterNextFab']) {
      assert.equal(nodes[id].hidden,true,id);
      assert.equal(nodes[id].classList.contains('is-scroll-nav-visible'),false,id);
    }
    // A queued bar/scroll callback cannot resurrect arrows on the destination panel.
    env.setReaderChapterFabsVisible(true);
    assert.equal(nodes.readerChapterNextFab.classList.contains('is-scroll-nav-visible'),false);
  });
}
test('stale root verse class cannot reveal arrows after actual verse view deactivates',()=>{
  const {env,nodes}=harness();nodes.verseView.classList.remove('active');
  assert.equal(env.readerChapterFabsBlocked(),true);
});
test('returning to real verse content restores valid chapter arrows',()=>{
  const {env,root,nodes}=harness();nodes.verseView.classList.remove('active');env.updateOpt4BottomBar();
  nodes.verseView.classList.add('active');root.classList.add('reader-verse-active');env.syncReaderChapterFabs();
  assert.equal(nodes.readerChapterPrevFab.hidden,false);assert.equal(nodes.readerChapterNextFab.hidden,false);
  assert.equal(nodes.readerChapterPrevFab.classList.contains('is-scroll-nav-visible'),true);
  env.currentChapter=1;env.syncReaderChapterFabs();assert.equal(nodes.readerChapterPrevFab.disabled,true);
  env.currentChapter=50;env.syncReaderChapterFabs();assert.equal(nodes.readerChapterNextFab.disabled,true);
});
