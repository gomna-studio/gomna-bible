// Offline integration: real Home handlers + shared GA collector, no network.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('js/gomna-home-feed.js'),common=read('js/gomna-ga4.js');
function section(from,to){const a=home.indexOf(from),b=home.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return home.slice(a,b);}
const homeCode=section('  function currentHomeAnalyticsScreen(){','  function toggleOpen(card){')+
  section('  function openViewer(){','  function init(){');
function node(attrs={}){
 const classes=new Set(),handlers={};
 return {hidden:false,style:{},scrollTop:0,isConnected:true,
  classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on;}},
  getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>attrs[k]=String(v),removeAttribute:k=>delete attrs[k],
  querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(n,f)=>(handlers[n]??=[]).push(f),focus(){},scrollIntoView(){}};
}
function fixture({consent=true,internal=false,collector=true}={}){
 const frames=[],scripts=[],events={},docEvents={},storage=new Map(),session=new Map(),stack=[null];
 const store=m=>({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 storage.set('cookieChoice',JSON.stringify({analytics:consent}));
 const cards=[0,1,2].map(i=>node({'data-card':i})),faces=[node({'data-face':'tease'}),node({'data-face':'open'})];
 cards[0].classList.add('is-active');
 cards.forEach(card=>{card.querySelector=()=>node();card.querySelectorAll=()=>faces;});
 const root=node(),viewer=node(),overlay=node(),frame=node(),recovery=node(),status=node(),actions=node(),message=node();
 root.querySelector=()=>cards.find(c=>c.classList.contains('is-open'))||null;
 viewer.hidden=overlay.hidden=true;frame.contentWindow={};
 overlay._gomnaRecovery={elapsed:0,since:null,timer:0,active:false,phase:'pending',requestId:'fixture',focus:null,slowTracked:false};
 overlay.querySelector=s=>s==='.home-picker-recovery'?recovery:s==='.home-picker-status'?status:s==='.home-picker-actions'?actions:node();
 status.querySelector=()=>message;
 const nodes={gomnaHomeViewer:viewer,homeBiblePickerOverlay:overlay,homeBiblePickerFrame:frame,'home-cookie-banner':node()};
 const document={readyState:'complete',visibilityState:'visible',referrer:'',title:'은혜의말씀',cookie:'',
  documentElement:node(),head:{appendChild:s=>scripts.push(s)},body:node(),
  getElementById:id=>nodes[id]||null,querySelector:s=>scripts.find(x=>x.src?.includes('googletagmanager.com'))||null,
  getElementsByTagName:()=>[{parentNode:{insertBefore:s=>scripts.push(s)}}],createElement:()=>node(),
  addEventListener:(n,f)=>(docEvents[n]??=[]).push(f)};
 const window={requestAnimationFrame:f=>(frames.push(f),frames.length),setTimeout:()=>1,clearTimeout(){},scrollTo(){},
  addEventListener:(n,f)=>(events[n]??=[]).push(f),dispatchEvent:e=>(events[e.type]||[]).forEach(f=>f(e)),
  GomnaAnalyticsControl:{isInternal:()=>internal}};window.self=window.top=window;
 const history={get state(){return stack.at(-1)},pushState:s=>stack.push(s),replaceState:s=>stack.splice(stack.length-1,1,s),back(){stack.pop()}};
 const location=new URL('https://gomnastudio.com/');
 const context=vm.createContext({window,document,history,location,URL,URLSearchParams,Date,navigator:{userAgent:'OfflineFixture'},
  CustomEvent:class {constructor(type){this.type=type;}},localStorage:store(storage),sessionStorage:store(session),
  root,cards,progress:0,flipping:false,swipeDrag:null,swipeHandled:false,pointerMoved:false,openScrollY:0,
  homeDeparting:false,homeAnalyticsFrame:0,homeAnalyticsInitialized:false,homeBiblePickerHistoryPending:false,homeBiblePickerReopenRequested:false,homeBiblePickerRequest:0,
  cancelPendingCardOpens(){},resetPinchSurface(){},apply(){},progressFromScroll:()=>0,schedulePlaceTodayVerse(){},
  isHomeOverlayOpen:()=>!overlay.hidden||!viewer.hidden,deckScrollY:()=>0,cancelDeckMotion(){},closeSheets(){},resetStackGate(){}});
 vm.runInContext(homeCode,context);
 window.addEventListener('gomna:analytics-ready',context.syncHomeAnalyticsScreen);
 document.addEventListener('visibilitychange',context.queueHomeAnalyticsScreen);
 if(collector)vm.runInContext(common,context);
 const commands=()=>Array.from(window.dataLayer||[],x=>Array.from(x));
 const ga=name=>commands().filter(x=>x[0]==='event'&&x[1]===name);
 const flush=()=>{for(let n=0;frames.length&&n<10;n++){const batch=frames.splice(0);batch.forEach(f=>f());}assert.equal(frames.length,0);};
 context.syncHomeAnalyticsScreen();flush();
 return {context,window,document,nodes,cards,overlay,viewer,stack,commands,ga,flush,
  screens:()=>ga('app_screen_view').map(x=>x[2].screen),
  ready(){context.markHomeBiblePickerReady();flush();},
  open(){context.openHomeBiblePicker();flush();},close(){context.closeHomeBiblePicker(true);flush();},
  consent(value){storage.set('cookieChoice',JSON.stringify({analytics:value}));window.GomnaGa4.consentChanged();flush();},
  show(value){document.visibilityState=value?'visible':'hidden';(docEvents.visibilitychange||[]).forEach(f=>f());flush();},
  loadCollector(){vm.runInContext(common,context);flush();}};
}

test('hidden preloaded picker never records a visible screen or adds a manual pageview',()=>{
 const f=fixture();const before=f.screens();f.context.preloadHomeBiblePicker();f.ready();
 assert.deepEqual(f.screens(),before);assert.deepEqual(f.screens(),['home']);assert.equal(f.ga('page_view').length,0);
 assert.equal(f.commands().filter(x=>x[0]==='config').length,1);
});
test('picker counts only after visible readiness; close and genuine reopen each count once',()=>{
 const f=fixture();f.open();assert.deepEqual(f.screens(),['home']);f.ready();f.ready();f.open();
 assert.deepEqual(f.screens(),['home','bible_picker']);f.close();f.close();f.open();
 assert.deepEqual(f.screens(),['home','bible_picker','home','bible_picker']);assert.equal(f.ga('page_view').length,0);
 assert.equal(f.stack.at(-1).ghd,'bible-picker');
});
test('canceling or failing a pending picker does not claim the Bible screen was seen',()=>{
 const f=fixture();f.open();f.overlay._gomnaRecovery.phase='error';f.context.queueHomeAnalyticsScreen();f.flush();f.close();f.ready();
 assert.deepEqual(f.screens(),['home']);assert.equal(f.ga('page_view').length,0);
});
test('visible card details and image viewer share screen names without manual pageviews',()=>{
 const f=fixture();f.context.openCardNow(f.cards[0]);f.flush();f.context.openViewer();f.flush();
 f.context.closeViewer(true);f.flush();f.context.closeCard(f.cards[0],true);f.flush();
 assert.deepEqual(f.screens(),['home','today_detail','image_viewer','today_detail','home']);
 assert.equal(f.ga('page_view').length,0);
});
test('same-frame close/open work records only the final visible screen',()=>{
 const f=fixture();f.context.openCardNow(f.cards[0]);f.context.closeCard(f.cards[0],true);f.flush();
 assert.deepEqual(f.screens(),['home']);
});
test('consent given after navigation records only the current screen, not previous screens',()=>{
 const f=fixture({consent:false});f.context.openCardNow(f.cards[0]);f.flush();f.context.openViewer();f.flush();
 assert.deepEqual(f.screens(),[]);assert.equal(f.commands().length,0);f.consent(true);
 assert.deepEqual(f.screens(),['image_viewer']);assert.equal(f.commands().filter(x=>x[0]==='config').length,1);assert.equal(f.ga('page_view').length,0);
});
test('revocation and internal-device exclusion stop Home screen collection',()=>{
 const f=fixture();f.consent(false);const before=f.commands().length;f.context.openViewer();f.flush();assert.equal(f.commands().length,before);
 const internal=fixture({internal:true});internal.context.openViewer();internal.flush();assert.equal(internal.commands().length,0);
});
test('background or departing Home does not count an unviewed destination',()=>{
 const f=fixture();f.show(false);f.context.openViewer();f.flush();assert.deepEqual(f.screens(),['home']);
 f.show(true);assert.deepEqual(f.screens(),['home','image_viewer']);f.context.homeDeparting=true;
 f.context.closeViewer(true);f.flush();assert.deepEqual(f.screens(),['home','image_viewer']);
});
test('deferred collector initialization records the currently displayed screen',()=>{
 const f=fixture({collector:false});f.context.openCardNow(f.cards[0]);f.flush();f.loadCollector();
 assert.deepEqual(f.screens(),['today_detail']);assert.equal(f.ga('page_view').length,0);
});
test('account overlays take precedence and closing returns to the visible detail',()=>{
 const f=fixture();f.context.openCardNow(f.cards[0]);f.flush();
 const account=node();f.nodes.gomnaProfileSheet=account;f.context.queueHomeAnalyticsScreen();f.flush();
 account.hidden=true;f.context.queueHomeAnalyticsScreen();f.flush();
 assert.deepEqual(f.screens(),['home','today_detail','account','today_detail']);assert.equal(f.ga('page_view').length,0);
 const login=node({'aria-hidden':'false'});login.classList.add('show');f.nodes.loginModal=login;
 f.context.queueHomeAnalyticsScreen();f.flush();assert.equal(f.screens().at(-1),'account');
 assert.match(home,/window\.syncHomeAnalyticsScreen=queueHomeAnalyticsScreen/);
});
test('consent accepted in background does not report an obsolete Home screen on foreground',()=>{
 const f=fixture({consent:false});f.show(false);f.context.openViewer();f.flush();f.consent(true);
 assert.deepEqual(f.screens(),[]);f.show(true);assert.deepEqual(f.screens(),['image_viewer']);
});
test('Bible library counts only while its panel is visible and restores Home on close',()=>{
 const f=fixture(),library=node();f.nodes.gomnaBibleLibrary=library;library.hidden=true;
 f.document.body.classList.add('gbl-open');f.context.queueHomeAnalyticsScreen();f.flush();assert.deepEqual(f.screens(),['home']);
 library.hidden=false;f.context.queueHomeAnalyticsScreen();f.flush();assert.deepEqual(f.screens(),['home','guide']);
 library.hidden=true;f.document.body.classList.remove('gbl-open');f.context.queueHomeAnalyticsScreen();f.flush();
 assert.deepEqual(f.screens(),['home','guide','home']);assert.equal(f.ga('page_view').length,0);
});
