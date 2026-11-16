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
function page({ consent, internal=false, host='gomnastudio.com', webdriver=false, path='/about/', referrer='', session=store(), withControl=true, existingBanner=false, localStorage=store(), clock=Date, visible=true, locks, iframe=false }={}) {
  if (consent !== undefined) localStorage.setItem('cookieChoice',JSON.stringify(consent));
  if (internal) localStorage.setItem('gomna:analytics:internal','1');
  const documentListeners = {}, windowListeners = {}, nodes = {}, scripts = [];
  const on = (map,n,fn) => (map[n] ||= []).push(fn);
  const emit = (map,n,e={}) => (map[n] || []).forEach(fn => fn(e));
  const document = {
    readyState:'loading', visibilityState:visible ? 'visible':'hidden', referrer, cookie:'', title:'test',
    documentElement:{setAttribute(){}},
    head:{appendChild: s => scripts.push(s)},
    body:{appendChild: s => nodes[s.id]=s, getAttribute: () => 'anxiety'},
    getElementById: id => nodes[id] || (existingBanner && id==='home-cookie-banner' ? {hidden:true} : null),
    querySelector: () => scripts.find(s => s.src?.includes('googletagmanager.com')) || null,
    getElementsByTagName: () => [{parentNode:{insertBefore:s=>scripts.push(s)}}],
    createElement: () => ({style:{},setAttribute(){},remove(){delete nodes[this.id];}}),
    addEventListener:(n,fn) => on(documentListeners,n,fn)
  };
  const location = new URL('https://'+host+path);
  const window = {addEventListener:(n,fn) => on(windowListeners,n,fn),dispatchEvent:e=>emit(windowListeners,e.type,e)};
  window.self=window;window.top=iframe ? {} : window;
  const context = vm.createContext({window, document, location, localStorage, sessionStorage:session,
    navigator:{webdriver,userAgent:'TestBrowser',locks}, history:{state:null,replaceState(){}}, URL, URLSearchParams, Date:clock,
    CustomEvent:class {constructor(type){this.type=type;}}});
  if (withControl) vm.runInContext(control, context);
  vm.runInContext(common,context);
  const p = {window, context, localStorage, session, scripts, nodes, document,
    ready:()=>emit(documentListeners,'DOMContentLoaded'),
    show:(visible)=>{document.visibilityState=visible?'visible':'hidden'; emit(documentListeners,'visibilitychange');},
    click: target => emit(documentListeners,'click',{target}),
    emit: (n,e) => emit(windowListeners,n,e),
    commands:() => Array.from(window.dataLayer || [], x => Array.from(x)),
    events: name => Array.from(window.dataLayer || [], x=>Array.from(x)).filter(x=>x[0]==='event' && (!name || x[1]===name))};
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
 assert.equal(p.events('entry_page_view').length,1);assert.equal(p.scripts.length,2);
});
test('saved consent reuses choice without adding a banner',()=>{
 const p=page({consent:accepted});p.ready();assert.equal(p.nodes['gomna-cookie-banner'],undefined);
 assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
});
test('saved rejection and malformed consent send no events',()=>{
 for(const consent of [{analytics:false},{analytics:'true'},null]){const p=page({consent});p.ready();p.window.GomnaGa4.track('x');assert.equal(p.commands().length,0);}
 const p=page();p.localStorage.setItem('cookieChoice','{broken');p.ready();assert.equal(p.commands().length,0);
});
test('legacy primitive or array consent can be replaced by an explicit banner choice',()=>{
 for(const consent of [true,false,1,'accepted',[],null]){
  for(const action of ['accept','reject']){
   const p=page({consent});p.ready();assert.ok(p.nodes['gomna-cookie-banner']);
   assert.equal(p.commands().length,0);assert.doesNotThrow(()=>p.click(button(action)));
   const saved=JSON.parse(p.localStorage.getItem('cookieChoice'));
   assert.equal(Array.isArray(saved),false);assert.equal(saved.analytics,action==='accept');
   assert.equal(p.events('entry_page_view').length,action==='accept'?1:0);
  }
 }
});
test('registered internal, automation and local hosts do not load tags or journey storage',()=>{
 for(const opts of [{internal:true},{webdriver:true},{host:'localhost'},{host:'preview.leedukkyu.chatgpt.site'},{host:'production-branch.localhost'},{host:'172.30.1.5'},{host:'192.168.0.1'}]){
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
  assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
  assert.equal(p.scripts.filter(s=>s.src?.includes('googletagmanager.com')).length,1);
  assert.equal(p.window.posthog._i.length,1);
  // Reader's existing Clarity provider now starts here, after consent, rather
  // than unconditionally in the document head. Repeated calls must not add it.
  const isReader=start==='function loadAnalytics() {';
  assert.equal(p.scripts.filter(s=>s.src?.includes('clarity.ms/tag/')).length,isReader?1:0);
  assert.equal(p.scripts.length,isReader?3:2);
 }
});
test('Reader Clarity remains unloaded without consent or on excluded devices',()=>{
 const start=readerCode.indexOf('function loadAnalytics() {');
 const snippet=readerCode.slice(start,readerCode.indexOf('function loadAds()',start));
 for(const opts of [{},{consent:{analytics:false}},{consent:accepted,internal:true},{consent:accepted,host:'localhost'}]){
  const p=page({...opts,existingBanner:true});
  vm.runInContext(snippet,p.context);p.ready();vm.runInContext('loadAnalytics();loadAnalytics();',p.context);
  assert.equal(p.scripts.length,0);
  assert.equal(p.commands().length,0);
 }
});
test('topic loader shares config and only adds its existing topic event once',()=>{
 const p=page({consent:accepted,existingBanner:true});p.window.__gomnaEntryPostHogLoaded=true;p.ready();
 vm.runInContext(topicCode,p.context);assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
 assert.equal(p.events('view_topic_page').length,1);assert.equal(p.scripts.length,2);
});
test('all public pages include exactly one control and one common loader in dependency order',()=>{
 const names=['index.html','reader.html','meditation.html','privacy.html','terms.html'];
 const walk=dir=>fs.readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+e.name+'/'):e.name.endsWith('.html')?[dir+e.name]:[]);
 for(const d of ['about','guide','studio','contact','bible','topics','start','bible-images'])names.push(...walk(d+'/'));
 assert.equal(names.length,101);
 for(const name of names){const s=fs.readFileSync(new URL(name,root),'utf8');
  if (['start/index.html','start/features.html','start/today.html','start/journey.html'].includes(name)) {
   assert.ok(s.includes("location.replace('../index.html')"),name);
   assert.ok(s.includes('content="noindex,follow"'),name);
   assert.equal((s.match(/gomna-ga4\.js/g)||[]).length,0,name+' must not count a retired redirect');
   continue;
  }
  assert.equal((s.match(/src="\/analytics-control\.js/g)||[]).length,1,name);
  assert.equal((s.match(/src="\/js\/gomna-ga4\.js/g)||[]).length,1,name);
  assert.ok(s.indexOf('src="/analytics-control.js')<s.indexOf('src="/js/gomna-ga4.js'),name);
 }
});

test('shared PostHog initializes once and blocks automatic events after revocation',()=>{
 const p=page({consent:accepted});p.ready();p.window.GomnaGa4.start();
 assert.equal(p.window.posthog._i.length,1);
 const config=p.window.posthog._i[0][1];
 assert.equal(config.persistence,'localStorage+cookie');
 assert.equal(config.before_send({properties:{}}).properties.traffic_environment,'production');
 p.localStorage.setItem('cookieChoice',JSON.stringify({analytics:false}));
 assert.equal(config.before_send({properties:{}}),null);
});
test('custom events reach both collectors only after consent',()=>{
 const p=page({consent:accepted});p.ready();p.window.GomnaGa4.track('audio_failure',{reason:'not_found'});
 assert.equal(p.events('audio_failure').length,1);
 assert.equal(p.window.posthog.filter(x=>x[0]==='capture'&&x[1]==='audio_failure').length,1);
});

const qaReferrer = 'https://gomna-studio-design-review.leedukkyu.chatgpt.site/';
test('owned QA preview to production is excluded for the same tab, not the device',()=>{
 const session=store();
 for(const referrer of [qaReferrer,'https://gomnastudio.com/']){
  const p=page({session,referrer,consent:accepted});p.ready();
  assert.equal(p.window.GomnaAnalyticsControl.isInternal(),true);
  assert.equal(p.scripts.length,0);assert.equal(p.commands().length,0);
  assert.equal(p.localStorage.getItem('gomna:analytics:internal'),null);
  assert.equal(p.document.cookie,'');
 }
 // A separately opened visit and a subsequent external visit are ordinary visits.
 const separate=page({consent:accepted});separate.ready();assert.equal(separate.scripts.length,2);
 const organic=page({session,referrer:'https://www.google.com/',consent:accepted});organic.ready();assert.equal(organic.scripts.length,2);
 const next=page({session,referrer:'https://gomnastudio.com/reader.html',consent:accepted});next.ready();assert.equal(next.scripts.length,2);
});
test('owned QA marker expires; ordinary AI referrals and lookalike hosts are not blocked',()=>{
 for(const referrer of ['https://chatgpt.com/','https://other.chatgpt.site/',qaReferrer.replace('.site/', '.site.example.com/')]){
  const p=page({referrer,consent:accepted});p.ready();assert.equal(p.scripts.length,2);
 }
 const session=store();session.setItem('gomna:analytics:qa-tab-until:v1',String(Date.now()-1));
 const p=page({session,consent:accepted});p.ready();assert.equal(p.scripts.length,2);
});
test('audio queue names cannot leak into GA acquisition source; PostHog keeps its existing event field',()=>{
 const p=page({consent:accepted,referrer:'https://www.google.com/'});p.ready();
 for(const name of ['audio_attempt','audio_user_start']){
  const params={source:'bible-chapter:psalms.022.001',book:'psalms'};
  p.window.GomnaGa4.track(name,params);
  const ga=p.events(name)[0][2];assert.equal(ga.source,undefined);
  assert.equal(ga.audio_source,params.source);assert.equal(ga.entry_source,'www.google.com');
  assert.equal(ga.traffic_environment,'production');assert.equal(ga.book,'psalms');
  const ph=p.window.posthog.find(x=>x[0]==='capture'&&x[1]===name)[2];assert.equal(ph.source,params.source);
 }
});

const lastAppDay='gomna:analytics:last-visible-app-kst-day:v1';
function kstClock() {
  let offset=0;
  class Clock extends Date {static now(){return Date.UTC(2026,10,3,14,59,58)+offset;}}
  return {clock:Clock,advance(ms){offset+=ms;}};
}
test('visible app next KST day: restored tab sends one return, no manual pageview or synthetic engagement',()=>{
  const t=kstClock(), p=page({consent:accepted, path:'/reader.html', clock:t.clock});
  p.ready();
  assert.notEqual(p.localStorage.getItem(lastAppDay), null);
  assert.equal(p.events('app_return_visit').length,0);
  p.show(false);t.advance(3000);
  assert.equal(p.events('app_return_visit').length,0);
  p.show(true);p.emit('pageshow',{persisted:true});p.show(false);p.show(true);
  assert.equal(p.events('app_return_visit').length,1);
  assert.equal(p.events('app_return_visit')[0][2].return_mode,'resume');
  assert.equal(p.window.posthog.filter(x=>x[0]==='capture'&&x[1]==='app_return_visit').length,1);
  for(const name of ['page_view','user_engagement','session_start','first_visit'])assert.equal(p.events(name).length,0);
  assert.equal(p.events('entry_page_view').length,1);
});
test('new load with an earlier visible app day counts on opening; article, QA, and hidden tabs do not',()=>{
  const t=kstClock(), localStorage=store(), opts={consent:accepted, localStorage, clock:t.clock};
  let p=page({...opts,path:'/topics/comfort/'});p.ready();assert.equal(localStorage.getItem(lastAppDay),null);
  p=page({...opts,path:'/'});p.ready();const baseline=localStorage.getItem(lastAppDay);t.advance(86400000);
  for(const settings of [{path:'/studio/'},{path:'/guide/'},{path:'/reader.html',referrer:qaReferrer},{path:'/index.html',visible:false}]){
    p=page({...opts,...settings});p.ready();assert.equal(localStorage.getItem(lastAppDay),baseline);assert.equal(p.events('app_return_visit').length,0);
  }
  p=page({...opts,path:'/meditation.html'});p.ready();assert.equal(p.events('app_return_visit')[0][2].return_mode,'open');
  p=page({...opts,path:'/reader.html'});p.ready();assert.equal(p.events('app_return_visit').length,0);
});
test('reject or revoke resets last visible day; fresh consent never bridges a rejection',()=>{
  const t=kstClock(), p=page({consent:accepted,path:'/',clock:t.clock});p.ready();t.advance(86400000);
  const deny=JSON.stringify({analytics:false});p.localStorage.setItem('cookieChoice',deny);p.emit('storage',{key:'cookieChoice',newValue:deny});
  assert.equal(p.localStorage.getItem(lastAppDay),null);
  assert.equal(p.window['ga-disable-G-1K6DBVER5W'],true);
  p.show(true);p.localStorage.setItem('cookieChoice',JSON.stringify(accepted));p.show(true);
  assert.equal(p.window['ga-disable-G-1K6DBVER5W'],false);
  assert.equal(p.events('app_return_visit').length,0);
  assert.notEqual(p.localStorage.getItem(lastAppDay),null);
});
test('concurrent visible tabs share a day under the origin lock and recheck consent before sending',async()=>{
 const t=kstClock(), localStorage=store();let tail=Promise.resolve();
 const locks={request:(_name,fn)=>(tail=tail.then(fn))};
 const opts={consent:accepted,path:'/',localStorage,clock:t.clock,locks};
 let a=page(opts);a.ready();await tail;t.advance(86400000);
 a=page(opts);const b=page(opts);a.ready();b.ready();await tail;
 assert.equal(a.events('app_return_visit').length+b.events('app_return_visit').length,1);
 t.advance(86400000);a.show(true);localStorage.setItem('cookieChoice',JSON.stringify({analytics:false}));await tail;
 assert.equal(a.events('app_return_visit').length+b.events('app_return_visit').length,1);
});

const phViews = p => Array.from(p.window.posthog || []).filter(x=>x[0]==='capture' && x[1]==='$pageview');
test('a preloaded picker iframe has no tags, pageviews, reader events, consent banner, or visit marker',()=>{
 for(const consent of [undefined,accepted,{analytics:false}]){
  const p=page({consent,path:'/reader.html?source=home-bible-picker&pickerRequest=1',iframe:true});
  p.ready();p.window.GomnaGa4.screenView('bible_picker');p.window.GomnaGa4.track('reader_enter');p.show(true);
  assert.equal(p.commands().length,0);assert.equal(p.scripts.length,0);assert.equal(p.session.m.size,0);
  assert.equal(p.localStorage.getItem(lastAppDay),null);assert.equal(p.nodes['gomna-cookie-banner'],undefined);
 }
 // A real top-level visit, even with that query string, is not a hidden iframe.
 const p=page({consent:accepted,path:'/reader.html?source=home-bible-picker'});p.ready();
 assert.equal(p.commands().filter(x=>x[0]==='config').length,1);assert.equal(p.events('reader_enter').length,1);
});
test('Reader initial screen and repeat clicks do not duplicate views; real transitions reach both collectors once',()=>{
 const p=page({consent:accepted,path:'/reader.html?easy=1'});p.ready();
 p.window.GomnaGa4.screenView('find',{initial:true});p.window.GomnaGa4.screenView('find');
 assert.equal(p.commands().filter(x=>x[0]==='config'&&!x[2].update).length,1);assert.equal(p.events('page_view').length,0);
 assert.equal(phViews(p).length,1);assert.equal(p.window.posthog._i[0][1].capture_pageview,false);
 p.window.GomnaGa4.screenView('archive');p.window.GomnaGa4.screenView('archive');p.window.GomnaGa4.screenView('find');
 assert.deepEqual(p.events('page_view').map(x=>x[2].screen_name),['archive','find']);
 assert.deepEqual(phViews(p).map(x=>x[2].screen_name),['find','archive','find']);
 assert.deepEqual(p.events('app_screen_view').map(x=>x[2].screen),['find','archive','find']);
 assert.equal((p.window.posthog||[]).filter(x=>x[0]==='capture'&&x[1]==='page_view').length,0);
 assert.equal(p.context.location.href,'https://gomnastudio.com/reader.html?easy=1');
 assert.equal(p.events('page_view')[0][2].page_location,'https://gomnastudio.com/reader.html?screen=archive');
 assert.equal(p.events('page_view')[1][2].page_referrer,'https://gomnastudio.com/reader.html?screen=archive');
 assert.equal(p.events('page_view')[0][2].analytics_version,'20261116-v2');
 const updates=p.commands().filter(x=>x[0]==='config' && x[2].update);
 assert.equal(updates.length,2);assert.ok(updates.every(x=>x[2].send_page_view===false));
 assert.equal(updates[1][2].page_location,'https://gomnastudio.com/reader.html?screen=find');
 p.window.GomnaGa4.track('search',{search_term:'위로'});
 assert.equal(p.events('search')[0][2].page_location,'https://gomnastudio.com/reader.html?screen=find');
 assert.equal(p.events('search')[0][2].screen_name,'find');
 const phSearch=p.window.posthog.find(x=>x[0]==='capture'&&x[1]==='search')[2];
 assert.equal(phSearch.$current_url,'https://gomnastudio.com/reader.html?screen=find');
});
test('late screen registration corrects its initial baseline without a second pageview',()=>{
 const p=page({consent:accepted,path:'/reader.html'});p.ready();
 p.window.GomnaGa4.screenView('bible-old',{initial:true});p.window.GomnaGa4.screenView('bible-old');
 assert.equal(p.events('page_view').length,0);assert.equal(phViews(p).length,1);
 p.window.GomnaGa4.screenView('bible-new');assert.equal(p.events('page_view').length,1);
});
test('consent after navigation records only the current screen, including another-tab acceptance',()=>{
 for(const otherTab of [false,true]){
  const p=page({path:'/reader.html?easy=1'});p.ready();
  p.window.GomnaGa4.screenView('find',{initial:true});p.window.GomnaGa4.screenView('archive');
  assert.equal(p.commands().length,0);
  if(otherTab){p.localStorage.setItem('cookieChoice',JSON.stringify(accepted));p.emit('storage',{key:'cookieChoice',newValue:JSON.stringify(accepted)});}
  else p.window.GomnaGa4.consentChanged(true);
  assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
  assert.equal(p.commands().find(x=>x[0]==='config')[2].screen_name,'archive');
  assert.equal(p.events('page_view').length,0);assert.equal(phViews(p).length,1);
  assert.deepEqual(p.events('app_screen_view').map(x=>x[2].screen),['archive']);
 }
});
test('rejection, revocation and internal visits never send screen transitions or reset identifiers',()=>{
 for(const opts of [{consent:{analytics:false}},{consent:accepted,internal:true},{consent:accepted,host:'localhost'}]){
  const p=page({...opts,path:'/reader.html'});p.ready();p.window.GomnaGa4.screenView('find');p.window.GomnaGa4.screenView('archive');
  assert.equal(p.commands().length,0);assert.equal(p.scripts.length,0);
 }
 const p=page({consent:accepted,path:'/reader.html'});p.document.cookie='_ga=existing-client';
 p.localStorage.setItem('ph_existing_identity','keep');p.ready();p.window.GomnaGa4.screenView('reader',{initial:true});
 p.window.GomnaGa4.consentChanged(false);const count=p.commands().length,phCount=p.window.posthog.length;
 p.window.GomnaGa4.screenView('find');p.window.GomnaGa4.screenView('archive');
 assert.equal(p.commands().length,count);assert.equal(p.window.posthog.length,phCount);
 assert.equal(p.window['ga-disable-G-1K6DBVER5W'],true);
 p.window.GomnaGa4.consentChanged(true);
 assert.equal(p.commands().filter(x=>x[0]==='config'&&!x[2].update).length,1);assert.equal(p.events('page_view').length,0);
 assert.equal(p.events('app_screen_view').at(-1)[2].screen,'archive');
 assert.equal(p.document.cookie,'_ga=existing-client');assert.equal(p.localStorage.getItem('ph_existing_identity'),'keep');
 assert.equal(p.commands().some(x=>x[2]&&'client_id' in x[2]),false);
});
test('reconsent uses the currently visible screen context without replaying rejected navigation',()=>{
 const p=page({consent:accepted,path:'/reader.html'});p.ready();p.window.GomnaGa4.screenView('reader',{initial:true});
 p.window.GomnaGa4.screenView('find');p.window.GomnaGa4.consentChanged(false);
 p.window.GomnaGa4.screenView('search');p.window.GomnaGa4.screenView('archive');
 p.window.GomnaGa4.consentChanged(true);p.window.GomnaGa4.track('audio_attempt',{source:'test'});
 assert.deepEqual(p.events('page_view').map(x=>x[2].screen_name),['find']);
 assert.equal(p.events('audio_attempt')[0][2].page_location,'https://gomnastudio.com/reader.html?screen=archive');
 assert.equal(p.events('app_screen_view').at(-1)[2].page_location,'https://gomnastudio.com/reader.html?screen=archive');
});
test('new document resets PostHog virtual URL context and cross-tab internal exclusion disables GA immediately',()=>{
 const p=page({consent:accepted,path:'/'});p.ready();
 const register=p.window.posthog.find(x=>x[0]==='register');
 assert.equal(register[1].$current_url,'https://gomnastudio.com/');
 p.localStorage.setItem('gomna:analytics:internal','1');p.emit('storage',{key:'gomna:analytics:internal',newValue:'1'});
 assert.equal(p.window['ga-disable-G-1K6DBVER5W'],true);const count=p.events().length;
 p.window.GomnaGa4.screenView('today_detail',{pageView:false});assert.equal(p.events().length,count);
 p.localStorage.removeItem('gomna:analytics:internal');p.emit('storage',{key:'gomna:analytics:internal',newValue:null});
 assert.equal(p.window['ga-disable-G-1K6DBVER5W'],false);
});
test('home custom screen views do not add pageviews and ready listeners cannot recurse or duplicate',()=>{
 const p=page({consent:accepted,path:'/'});let ready=0;
 p.window.addEventListener('gomna:analytics-ready',()=>{ready++;p.window.GomnaGa4.screenView('home',{initial:true,pageView:false,screen_group:'home'});});
 p.ready();p.window.GomnaGa4.screenView('home',{pageView:false,screen_group:'home'});
 p.window.GomnaGa4.screenView('today_detail',{pageView:false,screen_group:'home'});
 p.window.GomnaGa4.screenView('today_detail',{pageView:false,screen_group:'home'});
 p.window.GomnaGa4.screenView('home',{pageView:false,screen_group:'home'});
 assert.equal(ready,1);assert.equal(p.events('page_view').length,0);assert.equal(phViews(p).length,1);
 assert.deepEqual(p.events('app_screen_view').map(x=>x[2].screen),['home','today_detail','home']);
 assert.equal(p.events('app_screen_view')[1][2].screen_group,'home');
});
test('background screen changes wait for visibility and send only the settled screen',()=>{
 const p=page({consent:accepted,path:'/reader.html?easy=1'});p.ready();p.window.GomnaGa4.screenView('find',{initial:true});
 p.show(false);p.window.GomnaGa4.screenView('archive');p.window.GomnaGa4.screenView('search');
 assert.equal(p.events('page_view').length,0);
 p.show(true);assert.deepEqual(p.events('page_view').map(x=>x[2].screen_name),['search']);
});
test('foreground refreshes UI state before replaying a stale registered screen after background consent',()=>{
 const p=page({path:'/reader.html',visible:false});p.ready();p.window.GomnaGa4.screenView('reader',{initial:true});
 let visibleScreen='reader';
 p.window.addEventListener('gomna:analytics-ready',()=>{
  if(p.document.visibilityState==='visible')p.window.GomnaGa4.screenView(visibleScreen);
 });
 p.localStorage.setItem('cookieChoice',JSON.stringify(accepted));p.emit('storage',{key:'cookieChoice',newValue:JSON.stringify(accepted)});
 visibleScreen='archive';p.show(true);
 assert.deepEqual(p.events('app_screen_view').map(x=>x[2].screen),['archive']);
});
test('legacy loader reentry waits for later UI listeners before flushing the foreground screen',()=>{
 const p=page({consent:{analytics:false},path:'/'});p.ready();
 p.window.GomnaGa4.screenView('home',{initial:true,pageView:false,screen_group:'home'});
 // The index loader is registered before the Home UI bridge in the document.
 p.window.addEventListener('gomna:analytics-ready',()=>p.window.GomnaGa4.start());
 p.window.addEventListener('gomna:analytics-ready',()=>{
  if(p.document.visibilityState==='visible')p.window.GomnaGa4.screenView('image_viewer',{pageView:false,screen_group:'home'});
 });
 p.show(false);p.window.GomnaGa4.consentChanged(true);p.show(true);
 assert.deepEqual(p.events('app_screen_view').map(x=>x[2].screen),['image_viewer']);
 assert.equal(p.commands().filter(x=>x[0]==='config'&&!x[2].update).length,1);
 assert.equal(p.events('page_view').length,0);assert.equal(phViews(p).length,1);
});
test('explicit same-document consent remains effective when storage is unavailable',()=>{
 const p=page({path:'/reader.html'});p.ready();p.localStorage.getItem=()=>{throw new Error('storage unavailable');};
 p.window.GomnaGa4.consentChanged(true);assert.equal(p.commands().filter(x=>x[0]==='config').length,1);
 p.window.GomnaGa4.consentChanged(false);const count=p.commands().length;
 p.window.GomnaGa4.screenView('archive');assert.equal(p.commands().length,count);
 assert.equal(p.window['ga-disable-G-1K6DBVER5W'],true);
});
