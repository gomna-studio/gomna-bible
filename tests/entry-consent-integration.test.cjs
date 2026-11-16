const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8'),home=read('index.html');
function inlineContaining(marker){const at=home.indexOf(marker);assert.ok(at>=0);return home.slice(home.lastIndexOf('<script>',at)+8,home.indexOf('</script>',at));}
const homeInit=inlineContaining("const VIEW_HOME_KEY ="),homeConsent=inlineContaining("var banner = document.getElementById('home-cookie-banner')");
function page(kind,{blocked=false,saved,internal=false}={}){
 const local=new Map(),session=new Map(),events={},docEvents={},scripts=[],nodes={};
 if(saved!==undefined)local.set('cookieChoice',JSON.stringify(saved));
 const listeners=(map,type,fn)=>(map[type]??=[]).push(fn),emit=(map,type,e={})=>(map[type]||[]).forEach(fn=>fn(e));
 function node(){return {hidden:true,style:{},handlers:{},setAttribute(){},addEventListener(type,fn){listeners(this.handlers,type,fn);}};}
 for(const id of ['home-cookie-banner','home-cookie-accept','home-cookie-reject','topic-cookie-banner'])nodes[id]=node();
 const nativeBanner=kind==='home'?'home-cookie-banner':'topic-cookie-banner';
 const localStorage={getItem:k=>{if(blocked)throw Error('storage blocked');return local.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('storage blocked');local.set(k,String(v));},removeItem:k=>local.delete(k)};
 const document={readyState:'loading',visibilityState:'visible',referrer:'https://www.google.com/',title:'test',cookie:'',
  documentElement:{setAttribute(){}},body:{getAttribute:()=> 'comfort',appendChild(){}},head:{appendChild:s=>scripts.push(s)},
  getElementById:id=>id===nativeBanner||id==='home-cookie-accept'||id==='home-cookie-reject'?nodes[id]:null,
  querySelector:()=>scripts.find(s=>s.src?.includes('googletagmanager.com'))||null,
  getElementsByTagName:()=>[{parentNode:{insertBefore:s=>scripts.push(s)}}],createElement:node,
  addEventListener:(t,f)=>listeners(docEvents,t,f)};
 const window={GomnaAnalyticsControl:{isInternal:()=>internal},addEventListener:(t,f)=>listeners(events,t,f),dispatchEvent:e=>emit(events,e.type,e)};window.self=window.top=window;
 const context=vm.createContext({window,document,localStorage,sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},
  navigator:{},location:new URL(kind==='home'?'https://gomnastudio.com/':'https://gomnastudio.com/topics/comfort/'),URL,URLSearchParams,Date,CustomEvent:class{constructor(type){this.type=type;}}});
 vm.runInContext(read('js/gomna-ga4.js'),context);
 if(kind==='home'){vm.runInContext(homeInit,context);vm.runInContext(homeConsent,context);}else vm.runInContext(read('js/gomna-entry-analytics.js'),context);
 const commands=()=>Array.from(window.dataLayer||[],x=>Array.from(x));
 return {window,nodes,scripts,commands,events:name=>commands().filter(x=>x[0]==='event'&&x[1]===name),
  ready(){emit(docEvents,'DOMContentLoaded');},
  choose(action){if(kind==='home')emit(nodes['home-cookie-'+action].handlers,'click');else emit(docEvents,'click',{target:{closest:s=>s==='[data-topic-cookie]'?{getAttribute:()=>action}:null}});},
  storage(value){local.set('cookieChoice',JSON.stringify({analytics:value}));emit(events,'storage',{key:'cookieChoice'});}};
}
for(const kind of ['home','topic']){
 test(kind+': native accept/reject integrates with the real shared gate',()=>{
  const p=page(kind);p.ready();assert.equal(p.commands().length,0);p.choose('accept');
  assert.equal(p.commands().filter(x=>x[0]==='config'&&!x[2]?.update).length,1);
  assert.equal(p.events(kind==='home'?'view_home':'view_topic_page').length,1);
  p.choose('accept');assert.equal(p.events(kind==='home'?'view_home':'view_topic_page').length,1);
  p.choose('reject');const before=p.commands().length;p.window.GomnaGa4.track('test_after_refusal');assert.equal(p.commands().length,before);
  assert.equal(p.window['ga-disable-G-1K6DBVER5W'],true);
 });
 test(kind+': storage failure never infers consent but explicit choice still works',()=>{
  const p=page(kind,{blocked:true});p.ready();assert.equal(p.commands().length,0);
  assert.doesNotThrow(()=>p.choose('accept'));assert.equal(p.events('entry_page_view').length,1);
  assert.equal(p.events(kind==='home'?'view_home':'view_topic_page').length,1);
  p.choose('reject');assert.equal(p.window.GomnaGa4.allowed(),false);
  const fresh=page(kind,{blocked:true});fresh.ready();assert.equal(fresh.commands().length,0);
 });
 test(kind+': another tab grant starts once, internal exclusion still wins',()=>{
  const p=page(kind);p.ready();p.storage(true);p.storage(true);assert.equal(p.events('entry_page_view').length,1);
  assert.equal(p.events(kind==='home'?'view_home':'view_topic_page').length,1);
  const qa=page(kind,{internal:true});qa.ready();qa.choose('accept');assert.equal(qa.commands().length,0);
 });
}
test('topic saved acceptance before DOM ready does not reenter its page event twice',()=>{
 const p=page('topic',{saved:{analytics:true}});assert.equal(p.events('view_topic_page').length,1);p.ready();
 assert.equal(p.events('view_topic_page').length,1);assert.equal(p.events('entry_page_view').length,1);
});
