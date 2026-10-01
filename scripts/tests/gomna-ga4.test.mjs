import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const common = fs.readFileSync(new URL('js/gomna-ga4.js', root), 'utf8');
const control = fs.readFileSync(new URL('analytics-control.js', root), 'utf8');
const eventsCode = fs.readFileSync(new URL('analytics.js', root), 'utf8');
const topicCode = fs.readFileSync(new URL('js/gomna-entry-analytics.js', root), 'utf8');
const homeCode = fs.readFileSync(new URL('index.html', root), 'utf8');
const readerCode = fs.readFileSync(new URL('reader.html', root), 'utf8');
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,String(v)), removeItem: k => m.delete(k), m }; };
function page({ consent, internal=false, host='gomnastudio.com', webdriver=false, path='/about/', referrer='', session=store(), withControl=true, existingBanner=false }={}) {
  const localStorage = store();
  if (consent !== undefined) localStorage.setItem('cookieChoice',JSON.stringify(consent));
  if (internal) localStorage.setItem('gomna:analytics:internal','1');
  const documentListeners = {}, windowListeners = {}, nodes = {}, scripts = [];
  const on = (map,n,fn) => (map[n] ||= []).push(fn);
  const emit = (map,n,e={}) => (map[n] || []).forEach(fn => fn(e));
  const document = {
    readyState:'loading', referrer, cookie:'', title:'test',
    documentElement:{setAttribute(){}},
    head:{appendChild: s => scripts.push(s)},
    body:{appendChild: s => nodes[s.id]=s, getAttribute: () => 'anxiety'},
    getElementById: id => nodes[id] || (existingBanner && id==='home-cookie-banner' ? {hidden:true} : null),
    querySelector: () => scripts.find(s => s.src?.includes('googletagmanager.com')) || null,
    createElement: () => ({style:{},setAttribute(){},remove(){delete nodes[this.id];}}),
    addEventListener:(n,fn) => on(documentListeners,n,fn)
  };
  const location = new URL('https://'+host+path);
  const window = {addEventListener:(n,fn) => on(windowListeners,n,fn)};
  const context = vm.createContext({window, document, location, localStorage, sessionStorage:session,
    navigator:{webdriver,userAgent:'TestBrowser'}, history:{state:null,replaceState(){}}, URL, URLSearchParams, Date});
  if (withControl) vm.runInContext(control, context);
  vm.runInContext(common,context);
  const p = {window, context, localStorage, session, scripts, nodes, document,
    ready:()=>emit(documentListeners,'DOMContentLoaded'),
    click: target => emit(documentListeners,'click',{target}),
    emit: (n,e) => emit(windowListeners,n,e),
    commands:() => (window.dataLayer || []).map(x => Array.from(x)),
    events: name => (window.dataLayer || []).map(x=>Array.from(x)).filter(x=>x[0]==='event' && (!name || x[1]===name))};
  return p;
}
const accepted = {analytics:true, marketing:false};
const button = action => ({closest: selector => selector==='[data-gomna-cookie]' ? {getAttribute:()=>action} : null});
test('unknown consent shows choice and sends/stores no telemetry',()=>{
 const p=page();p.ready();assert.ok(p.nodes['gomna-cookie-banner']);
 assert.equal(p.scripts.length,0);assert.equal(p.commands().length,0);assert.equal(p.session.m.size,0);
});
test('reject preserves marketing choice and sends no telemetry',()=>{
 const p=page({consent:{marketing:true}});p.ready();p.click(button('reject'));
 assert.deepEqual(JSON.parse(p.localStorage.getItem('cookieChoice')).marketing,true);
 assert.equal(p.commands().length,0);assert.equal(p.session.m.size,0);
});
test('accept initializes one config-owned page view, even after repeated init/script load',()=>{
 const p=page();p.ready();p.click(button('accept'));
 p.window.GomnaGa4.start();p.ready();vm.runInContext(common,p.context);
 assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
 assert.equal(p.events('page_view').length,0); // no extra manual view beside config's default
 assert.equal(p.events('entry_page_view').length,1);assert.equal(p.scripts.length,1);
});
test('saved consent reuses choice without adding a banner',()=>{
 const p=page({consent:accepted});p.ready();assert.equal(p.nodes['gomna-cookie-banner'],undefined);
 assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
});
test('saved rejection and malformed consent send no events',()=>{
 for(const consent of [{analytics:false},{analytics:'true'},null]){const p=page({consent});p.ready();p.window.GomnaGa4.track('x');assert.equal(p.commands().length,0);}
 const p=page();p.localStorage.setItem('cookieChoice','{broken');p.ready();assert.equal(p.commands().length,0);
});
test('registered internal, automation and local hosts do not load tags or journey storage',()=>{
 for(const opts of [{internal:true},{webdriver:true},{host:'localhost'},{host:'172.30.1.5'},{host:'192.168.0.1'}]){
  const p=page({...opts,consent:accepted});p.ready();p.window.GomnaGa4.track('open_commentary');
  assert.equal(p.commands().length,0);assert.equal(p.scripts.length,0);assert.equal(p.session.m.size,0);
 }
});
test('missing exclusion control fails closed',()=>{
 const p=page({consent:accepted,withControl:false});p.ready();assert.equal(p.commands().length,0);
});
test('revoked consent or newly excluded device cannot send custom events',()=>{
 const p=page({consent:accepted});p.ready();const count=p.commands().length;
 p.localStorage.setItem('cookieChoice',JSON.stringify({analytics:false}));p.window.GomnaGa4.track('x');assert.equal(p.commands().length,count);
 p.localStorage.setItem('cookieChoice',JSON.stringify(accepted));p.window.GomnaAnalyticsControl.disableForThisDevice();p.window.GomnaGa4.track('x');assert.equal(p.commands().length,count);
});
test('search entry -> Reader -> commentary -> successful audio shares entry context',()=>{
 const entry=page({consent:accepted,path:'/topics/anxiety/',referrer:'https://www.google.com/search?q=private'});entry.ready();
 entry.click({closest:s=>s==='a[href]' ? {href:'https://gomnastudio.com/reader.html?source=topic-anxiety'} : null});
 assert.equal(entry.events('reader_click').length,1);
 const p=page({consent:accepted,path:'/reader.html?source=topic-anxiety',referrer:'https://gomnastudio.com/topics/anxiety/',session:entry.session});
 vm.runInContext(eventsCode,p.context);p.ready();p.window.GomnaAnalytics.trackOpenCommentary('psalms',23,4,'old');
 const audio=media();p.window.GOMNA_AUDIO_ENGINE={_state:{currentAudio:audio,currentAudioId:'psalms-23-4',queueEpoch:1}};
 p.emit('audio:start',{detail:{audioId:'psalms-23-4',entry:{bookId:'psalms',chapter:23,verse:4,type:'bible'}}});
 assert.equal(p.events('audio_play').length,0);audio.playing();assert.equal(p.events('audio_play').length,1);
 for(const e of p.events()){
  assert.equal(e[2].entry_page,'/topics/anxiety/');assert.equal(e[2].entry_channel,'search_referral');assert.equal(e[2].entry_source,'www.google.com');
  assert.ok(!JSON.stringify(e).includes('private'));
 }
 assert.equal(p.events('reader_enter').length,1);assert.equal(p.events('open_commentary').length,1);
});
function media(){const handlers=new Set();return {addEventListener:(n,fn)=>handlers.add(fn),removeEventListener:(n,fn)=>handlers.delete(fn),playing:()=>[...handlers].forEach(fn=>fn())};}
test('audio failure, repeated playing, recovery and stale media do not inflate starts',()=>{
 const p=page({consent:accepted});vm.runInContext(eventsCode,p.context);p.ready();
 const state={currentAudio:media(),currentAudioId:'a',queueEpoch:1};p.window.GOMNA_AUDIO_ENGINE={_state:state};
 const detail={audioId:'a',entry:{bookId:'genesis',chapter:1,verse:1,type:'commentary'}};
 p.emit('audio:start',{detail});assert.equal(p.events('audio_play').length,0);
 const stale=state.currentAudio;state.currentAudio=media();stale.playing();assert.equal(p.events('audio_play').length,0);
 p.emit('audio:start',{detail});state.currentAudio.playing();state.currentAudio.playing();assert.equal(p.events('audio_play').length,1);
 state.currentAudio=media();p.emit('audio:start',{detail});state.currentAudio.playing();assert.equal(p.events('audio_play').length,1);
 p.emit('audio:end');state.currentAudio=media();p.emit('audio:start',{detail});state.currentAudio.playing();assert.equal(p.events('audio_play').length,2);
});
test('nonconsenting audio success records nothing',()=>{
 const p=page({consent:{analytics:false}});vm.runInContext(eventsCode,p.context);p.ready();const audio=media();
 p.window.GOMNA_AUDIO_ENGINE={_state:{currentAudio:audio,currentAudioId:'a',queueEpoch:1}};
 p.emit('audio:start',{detail:{audioId:'a',entry:{bookId:'genesis',chapter:1,verse:1,type:'bible'}}});audio.playing();assert.equal(p.commands().length,0);
});
test('expired entry context resets after inactivity, new external referrer resets origin',()=>{
 const session=store();session.setItem('gomna:analytics:entry:v1',JSON.stringify({entry_page:'/old/',updated:Date.now()-31*60*1000}));
 const p=page({consent:accepted,session,path:'/guide/'});p.ready();assert.equal(p.events()[0][2].entry_page,'/guide/');
 const next=page({consent:accepted,session,path:'/bible/john/3/',referrer:'https://m.search.naver.com/search.naver'});next.ready();assert.equal(next.events()[0][2].entry_page,'/bible/john/3/');
});
test('home and Reader old loader functions delegate without a second config',()=>{
 for(const [html,start,end] of [[homeCode,'    function loadGa4() {','    function trackViewHomeOnce()'],[readerCode,'function loadAnalytics() {','function loadAds()']]){
  const p=page({consent:accepted,existingBanner:true});p.window.__gomnaReaderPostHogLoaded=true;
  const snippet=html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
  vm.runInContext(snippet,p.context);p.ready();vm.runInContext(start.includes('loadGa4')?'loadGa4();loadGa4();':'loadAnalytics();loadAnalytics();',p.context);
  assert.equal(p.commands().filter(x=>x[0]==='config').length,1);assert.equal(p.scripts.length,1);
 }
});
test('topic loader shares config and only adds its existing topic event once',()=>{
 const p=page({consent:accepted,existingBanner:true});p.window.__gomnaEntryPostHogLoaded=true;p.ready();
 vm.runInContext(topicCode,p.context);assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
 assert.equal(p.events('view_topic_page').length,1);assert.equal(p.scripts.length,1);
});
test('all public pages include exactly one control and one common loader in dependency order',()=>{
 const names=['index.html','reader.html','meditation.html','privacy.html','terms.html'];
 const walk=dir=>fs.readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+e.name+'/'):e.name.endsWith('.html')?[dir+e.name]:[]);
 for(const d of ['about','guide','studio','contact','bible','topics','start'])names.push(...walk(d+'/'));
 assert.equal(names.length,51);
 for(const name of names){const s=fs.readFileSync(new URL(name,root),'utf8');
  assert.equal((s.match(/src="\/analytics-control\.js/g)||[]).length,1,name);
  assert.equal((s.match(/src="\/js\/gomna-ga4\.js/g)||[]).length,1,name);
  assert.ok(s.indexOf('src="/analytics-control.js')<s.indexOf('src="/js/gomna-ga4.js'),name);
 }
});
