import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const helper = fs.readFileSync(new URL('../../js/gomna-pwa-recovery.js', import.meta.url), 'utf8');
const swCode = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const version = swCode.match(/const CACHE_VERSION = '([^']+)'/)[1];
function page({ ios=true, keyboard=false, scale=1, cssHeight=780, visualHeight=430, playing=false, pageVersion=version, meditation=false }={}) {
 const events={}, docEvents={}, timers=[], messages=[], reloads=[], storage=new Map();
 let now=10000;
 const tab={style:{top:'',bottom:''},getBoundingClientRect:()=>({height:60,bottom:430})};
 const controller={postMessage:x=>messages.push(x)};
 const workerEvents={};
 const reg={waiting:null,addEventListener(){},update:()=>Promise.resolve()};
 const nav={userAgent:ios?'iPhone':'Chrome',platform:'',standalone:ios,onLine:true,
 serviceWorker:{controller,addEventListener:(n,f)=>workerEvents[n]=f,register:()=>Promise.resolve(reg)}};
 const state={isPlaying:playing};
 const document={visibilityState:'visible',activeElement:keyboard?{tagName:'INPUT'}:null,
 currentScript:{getAttribute:()=>pageVersion},querySelectorAll:()=>[],
 body:{appendChild(){},getAttribute:()=>meditation?'meditation':'home'},
 createElement:()=>({style:{},setAttribute(){},getBoundingClientRect:()=>({height:cssHeight})}),
 getElementById:()=>tab,addEventListener:(n,f)=>docEvents[n]=f};
 const window={innerHeight:780,innerWidth:390,visualViewport:{height:visualHeight,offsetTop:0,scale,addEventListener(){}},
 GOMNA_AUDIO_ENGINE:{getState:()=>state},matchMedia:()=>({matches:ios}),
 setTimeout:(fn,ms)=>timers.push({fn,at:now+ms}),setInterval(){},addEventListener:(n,f)=>events[n]=f,
 dispatchEvent:e=>{if(events[e.type])events[e.type](e);}};
 const context={window,document,navigator:nav,Date:{now:()=>now},URL,CustomEvent,
 location:{href:'https://gomnastudio.com/reader.html?book=john#verse2',replace:u=>reloads.push(u)},
 sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(helper,context);
 return {window,document,state,tab,storage,workerEvents,controller,reloads,messages,reg,events,
  release:v=>workerEvents.message({source:controller,data:{type:'GOMNA_RELEASE',version:v}}),
  advance(ms){const end=now+ms;while(timers.some(t=>t.at<=end)){timers.sort((a,b)=>a.at-b.at);const t=timers.shift();now=t.at;t.fn();}now=end;}};
}
test('installed app rejects stale visual height only when layout and CSS readings agree',()=>{
 const p=page();assert.equal(p.window.GOMNA_PWA_VIEWPORT.read().height,780);
 assert.equal(page({cssHeight:720}).window.GOMNA_PWA_VIEWPORT.read().height,430);
});
test('Safari, keyboard and pinch zoom preserve visual viewport',()=>{
 for(const options of [{ios:false},{keyboard:true},{scale:1.5}])assert.equal(page(options).window.GOMNA_PWA_VIEWPORT.read().height,430);
});
test('late resume recovery measures after 900ms without a resize event',()=>{
 const p=page({cssHeight:720});const readings=[];
 p.events['gomna:viewport-restored']=e=>readings.push(e.detail.height);
 p.advance(900);p.window.visualViewport.height=780;p.advance(2200);
 assert.equal(readings.at(-1),780);
});
test('meditation fixed navigation returns to bottom and input restores native placement',()=>{
 const p=page({meditation:true});p.advance(0);assert.equal(p.tab.style.top,'720px');
 p.document.activeElement={tagName:'INPUT'};p.advance(120);assert.equal(p.tab.style.top,'');assert.equal(p.tab.style.bottom,'');
});
test('incoming version reload preserves book and hash; old reload locks do not block it',()=>{
 const p=page();p.storage.set('gomna-sw-reloaded-'+version,'1');p.release('future-release');
 assert.equal(p.reloads.length,1);const u=new URL(p.reloads[0]);assert.equal(u.searchParams.get('book'),'john');assert.equal(u.hash,'#verse2');assert.equal(u.searchParams.get('appRelease'),'future-release');
});
test('same version and duplicate incoming version do not cause reload loops',()=>{
 const p=page();p.release(version);assert.equal(p.reloads.length,0);p.storage.set('gomna-applied-release:future-release','1');p.release('future-release');assert.equal(p.reloads.length,0);
});
test('playing, paused, loading and queued audio defer new-page application until explicit stop',()=>{
 for(const flag of ['isPlaying','isPaused','isLoading','queueActive']){
  const p=page();p.state[flag]=true;p.release('future-release');assert.equal(p.reloads.length,0);
  p.state[flag]=false;p.events['audio:end']();p.advance(0);assert.equal(p.reloads.length,1);
 }
});
test('hidden page and edited input defer update, spoofed release source ignored',()=>{
 const p=page({keyboard:true});p.release('future-release');assert.equal(p.reloads.length,0);
 p.document.activeElement=null;p.document.visibilityState='hidden';p.events.pageshow();assert.equal(p.reloads.length,0);
 const other=page();other.workerEvents.message({source:{},data:{type:'GOMNA_RELEASE',version:'future'}});assert.equal(other.reloads.length,0);
});
function worker(clientKinds=[]){
 const hooks={},downloads=[],deleted=[];let skipped=0,probes=0;
 const clients=clientKinds.map((kind,i)=>({id:String(i),postMessage(data){probes++;if(kind!=='unknown')hooks.message({source:this,data:{type:'GOMNA_UPDATE_REPLY',token:data.token,safe:kind==='safe'}});}}));
 const cache={put:async()=>{},keys:async()=>[],match:async()=>undefined};
 const context={self:{location:{hostname:'gomnastudio.com',origin:'https://gomnastudio.com'},addEventListener:(n,f)=>hooks[n]=f,skipWaiting:async()=>skipped++,clients:{matchAll:async()=>clients,claim:async()=>{}}},
 caches:{open:async()=>cache,keys:async()=>['gomna-static-old','gomna-static-'+version,'gomna-data-v1','gomna-audio-manifest-v1'],delete:async k=>deleted.push(k)},
 Request:class{constructor(url,opts){this.url=url;this.opts=opts;}},fetch:async req=>{downloads.push(req.url);return {ok:true};},AbortController,
 setTimeout:(fn,ms)=>setTimeout(fn,ms===1200?1:ms),clearTimeout,Date,Map,Set,URL,console:{warn(){}}};
 vm.runInNewContext(swCode,context);
 return {downloads,deleted,clients,get skipped(){return skipped;},get probes(){return probes;},
  async fire(name,data={}){let p;hooks[name]({...data,waitUntil:v=>p=v});await p;}};
}
test('installation does not download the manifest or force old clients to activate',async()=>{
 const w=worker(['unknown']);await w.fire('install');assert.equal(w.skipped,0);assert(!w.downloads.some(u=>u.includes('audio-manifest')));assert(w.downloads.some(u=>u.includes('gomna-pwa-recovery')));
});
test('activation requires every existing client to report safe',async()=>{
 for(const kinds of [['safe'],['safe','busy'],['safe','unknown']]){
  const w=worker(kinds);await w.fire('message',{data:{type:'GOMNA_REQUEST_ACTIVATION'}});assert.equal(w.skipped,kinds.every(x=>x==='safe')?1:0);
 }
});
test('activation cleanup preserves data and manifest caches',async()=>{
 const w=worker();await w.fire('activate');assert.deepEqual(w.deleted,['gomna-static-old']);
});
