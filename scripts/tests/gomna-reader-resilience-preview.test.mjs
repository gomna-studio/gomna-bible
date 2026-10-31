import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const reader=fs.readFileSync(new URL('../../reader.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
test('missing one or both testament downloads never throws in search-index guards',()=>{
 const guards=[...reader.matchAll(/if \((window\.GomnaBibleSearch[^\n]+)\) \{\n\s*GomnaBibleSearch\.buildIndex/g)].map(m=>m[1]);
 assert.equal(guards.length,2);
 for(const guard of guards){
  for(const present of [[],['oldTestamentData'],['newTestamentData'],['oldTestamentData','newTestamentData']]){
   const ctx={window:{GomnaBibleSearch:{}},...Object.fromEntries(present.map(n=>[n,{}]))};
   assert.equal(Boolean(vm.runInNewContext(guard,ctx)),present.length===2);
  }
 }
});
test('reader PWA document release matches the service worker release',()=>{
 const release=worker.match(/const CACHE_VERSION = '([^']+)'/)[1];
 assert.equal(reader.match(/data-release="([^"]+)"/)[1],release);
});
test('topic listen URLs are supported and autoplay failure listener survives audio:start',()=>{
 const script=reader.slice(reader.indexOf('/* ── home listen:'),reader.indexOf('/* ── scripture entry:'));
 for(const name of ['topic-comfort','topic-anxiety','topic-dawn-prayer'])assert.ok(script.includes(name));
 const start=script.slice(script.indexOf('function onStart()'),script.indexOf('function onError(e)'));
 assert.ok(start.includes("addEventListener('playing',cleanup"));
 assert.ok(!/\n\s*cleanup\(\);/.test(start));
});
