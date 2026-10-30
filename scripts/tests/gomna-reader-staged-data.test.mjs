import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const reader=fs.readFileSync(new URL('../../reader.html',import.meta.url),'utf8');
const source=reader.slice(reader.indexOf('function loadBibleData() {'),reader.indexOf('\nfunction updateBibleDataReady()'));
function setup(search){
 const scripts=[],timers=[];let initialized=false,inits=0,indexed=0,ready=0;
 const ctx={URLSearchParams,location:{search},GOMNA_BOOK_CATALOG:[{name:'시편',testament:'old'},{name:'요한복음',testament:'new'}],
 BIBLE_DATA_OLD_SRC:'old.js',BIBLE_DATA_NEW_SRC:'new.js',_gomnaOldTestamentLoadState:'pending',_gomnaNewTestamentLoadState:'pending',oldTestamentData:null,newTestamentData:null,
 setTimeout:(f,ms)=>(timers.push({f,ms}),timers.length),clearTimeout:id=>{if(timers[id-1])timers[id-1].cleared=true},
 document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},window:{GomnaBibleSearch:{}},GomnaBibleSearch:{buildIndex:()=>indexed++},console:{error(){}},refreshTestamentListIfNeeded(){},maybeShowBibleDataErrors(){},
 initializeAppOnce:()=>{if(!initialized){initialized=true;inits++}},updateBibleDataReady:()=>ready++};
 vm.runInNewContext(source+';loadBibleData();',ctx);
 return {ctx,scripts,timers,get inits(){return inits},get indexed(){return indexed},get ready(){return ready},load(which){ctx[which==='old'?'oldTestamentData':'newTestamentData']={books:[]};scripts.find(s=>s.src===which+'.js').onload()},run(ms){timers.filter(t=>t.ms===ms&&!t.cleared).forEach(t=>t.f())}};
}
test('direct NT link renders NT before requesting OT and never initializes/navigation twice',()=>{
 const p=setup('?book=요한복음');assert.deepEqual(p.scripts.map(s=>s.src),['new.js']);p.load('new');assert.equal(p.inits,1);
 p.run(80);assert.deepEqual(p.scripts.map(s=>s.src),['new.js','old.js']);p.load('old');assert.equal(p.inits,1);assert.equal(p.indexed,1);assert.equal(p.ready,1);
});
test('slow target starts other testament after bounded delay; failed target still allows initialized app',()=>{
 const p=setup('?book=시편');p.run(1500);assert.equal(p.scripts.length,2);p.load('new');assert.equal(p.inits,0);p.scripts[0].onerror();assert.equal(p.inits,1);assert.equal(p.ctx._gomnaOldTestamentLoadState,'error');p.run(80);assert.equal(p.scripts.length,2);
});
test('search and book picker retain parallel loading and wait for both',()=>{
 const p=setup('?q=사랑');assert.equal(p.scripts.length,2);p.load('old');assert.equal(p.inits,0);p.load('new');assert.equal(p.inits,1);
});
test('Clarity is only in consent-gated analytics initializer, not unconditional head',()=>{
 assert.ok(!reader.slice(0,reader.indexOf('</head>')).includes('https://www.clarity.ms/tag/'));
 const f=reader.slice(reader.indexOf('function loadAnalytics()'),reader.indexOf('function loadAds()'));
 assert.ok(f.indexOf('GomnaGa4.start()')<f.indexOf('https://www.clarity.ms/tag/'));
 assert.equal((reader.match(/https:\/\/www\.clarity\.ms\/tag\//g)||[]).length,1);
});
