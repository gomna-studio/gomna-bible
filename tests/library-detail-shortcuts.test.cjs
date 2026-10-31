const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/gomna-bible-library.js'), 'utf8');
const context = {window:{}, URLSearchParams, document:{readyState:'loading',addEventListener(){}}, requestAnimationFrame:fn=>fn()};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/gomna-bible-library-data.js'), 'utf8'),context);
vm.runInContext(source.replace("  if(document.readyState==='loading')", '  window.__detailTest={readerUrl,detail,setScroll:s=>scroll=s};\n  if(document.readyState===\'loading\')'),context);
const api=context.window.__detailTest;
const items=context.window.GOMNA_BIBLE_LIBRARY_DATA;
test('all 39 person/story passage links preserve range and return destination; listening stays explicit',()=>{
  assert.equal(items.length,39);
  for (const item of items) {
    for (const mode of ['read','listen']) {
      const url=new URL(api.readerUrl(item,mode),'https://example.test/');
      assert.equal(url.pathname,'/reader.html');
      for (const [key,value] of Object.entries({book:item.book,chapter:item.chapter,verse:item.start,verseStart:item.start,verseEnd:item.end,startVerse:item.start,endVerse:item.end,libraryId:item.id,libraryKind:item.kind,libraryName:item.name,source:'guide-related'})) assert.equal(url.searchParams.get(key),String(value),item.id+' '+key);
      assert.equal(url.searchParams.get('listen'),mode==='listen'?'1':null);
    }
  }
});
test('original bottom passage action remains present and usable while image decode is pending',()=>{
  const hero={style:{},setAttribute(){},isConnected:true};
  const img={decode:()=>new Promise(()=>{})};
  const article={style:{}};
  const scroll={innerHTML:'',scrollTop:99,querySelector:selector=>selector==='.gbl-hero'?hero:selector==='.gbl-hero img'?img:article};
  api.setScroll(scroll);api.detail(items.find(i=>i.id==='hannah'));
  assert.equal(scroll.scrollTop,0);
  assert.doesNotMatch(scroll.innerHTML,/gbl-entry-actions|detail_top|본문 읽기|본문 듣기/);
  assert.ok(scroll.innerHTML.indexOf('gbl-hero')<scroll.innerHTML.indexOf('gbl-article'));
  assert.ok(scroll.innerHTML.indexOf('gbl-history')<scroll.innerHTML.indexOf('gbl-scripture'));
  assert.equal((scroll.innerHTML.match(/>말씀 보기<\/a>/g)||[]).length,1);
  assert.notEqual(article.style.visibility,'hidden');
  assert.match(scroll.innerHTML,/data-gomna-placement="detail_bottom"/);
  assert.equal(hero.style.visibility,'hidden');
});
test('reader retains library range listening and return support',()=>{
  const bridge=fs.readFileSync(path.join(root,'js/gomna-library-return.js'),'utf8');
  assert.match(bridge,/p\.get\('listen'\) === '1'/);
  assert.match(bridge,/startVerse:start, endVerse:end/);
  const reader=fs.readFileSync(path.join(root,'reader.html'),'utf8');
  assert.match(reader,/gomnaLibraryListen\.play\(\)/);
});
