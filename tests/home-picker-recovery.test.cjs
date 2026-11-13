// Offline DOM/lifecycle tests: no live analytics, network, or device timing claims.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]}));
const source=fs.readFileSync(path.join(__dirname,'../js/gomna-home-feed.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../js/gomna-home-feed.css'),'utf8');
const start=source.indexOf('  function ensureHomeBiblePicker(){'),end=source.indexOf('  function init(){',start);
assert.ok(start>=0&&end>start);
function fixture(consent=true){
  const dom=new JSDOM('<!doctype html><head><style>'+css+'</style></head><body><main id="home"></main><button id="opener">성경</button></body>',{url:'https://example.test/',runScripts:'outside-only'});
  const w=dom.window,events=[],timers=new Map(),stack=[null];let now=0,seq=0,visible='visible',backPending=false,allowed=consent;
  w.Date.now=()=>now;w.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w.document,'visibilityState',{get:()=>visible,configurable:true});
  Object.defineProperty(w,'history',{value:{get state(){return stack.at(-1)},pushState(s){stack.push(s)},back(){backPending=true}}});
  Object.assign(w,{homeBiblePickerHistoryPending:false,homeBiblePickerReopenRequested:false,homeBiblePickerRequest:0,homeDeparting:false,root:w.document.getElementById('home'),cancelPendingCardOpens(){},closeViewer(){},closeCard(){},closeSheets(){},GomnaGa4:{allowed:()=>allowed,track:(name,values)=>events.push({name,values})}});
  w.eval(source.slice(start,end));
  w.document.getElementById('opener').focus();
  function advance(ms){const target=now+ms;while(true){const entries=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;const [id,t]=entries[0];timers.delete(id);now=t.at;t.fn();}now=target;}
  return {w,events,stack,timers,advance,get overlay(){return w.document.getElementById('homeBiblePickerOverlay')},get frame(){return w.document.getElementById('homeBiblePickerFrame')},get state(){return this.overlay._gomnaRecovery},
    open(){w.openHomeBiblePicker()},ready(requestId=this.state.requestId,sourceWindow=this.frame.contentWindow){w.onHomeBiblePickerMessage({origin:w.location.origin,source:sourceWindow,data:{source:'gomna-home-bible-picker',action:'ready',requestId}})},
    visible(value){visible=value;w.updateHomeBiblePickerWait()},consent(value){allowed=value},
    back(){stack.pop();backPending=false;w.onHomeHistoryPop()},completeClose(){assert.equal(backPending,true);this.back()},dispose(){w.close()}};
}

test('pending close is immediate; hint waits 500ms and recovery appears after 5 visible seconds',()=>{
 const f=fixture();f.open();const status=f.overlay.querySelector('.home-picker-status'),actions=f.overlay.querySelector('.home-picker-actions');
 assert.equal(f.overlay.querySelector('.home-picker-close').hidden,false);assert.equal(f.w.document.activeElement.className,'home-picker-close');
 assert.equal(f.w.getComputedStyle(f.frame).opacity,'0');assert.equal(status.hidden,true);
 f.advance(499);assert.equal(status.hidden,true);f.advance(1);assert.equal(status.hidden,false);assert.equal(actions.hidden,true);
 f.advance(4499);assert.equal(actions.hidden,true);f.advance(1);assert.equal(actions.hidden,false);assert.equal(f.state.phase,'slow');
 assert.equal(f.events.filter(e=>e.name==='screen_open_slow').length,1);assert.equal(f.events.at(-1).values.elapsed_ms,5000);
 f.advance(10000);assert.equal(f.events.filter(e=>e.name==='screen_open_slow').length,1);assert.equal(f.stack.length,2);f.dispose();
});
test('fast and preloaded ready screens never wait for a loader or impose a minimum delay',()=>{
 for(const preload of [false,true]){
 const f=fixture();if(preload){f.w.ensureHomeBiblePicker();f.ready();assert.equal(f.events.length,0);}f.open();if(!preload){f.advance(100);f.ready();}
 assert.equal(f.w.getComputedStyle(f.frame).opacity,'1');assert.equal(f.overlay.querySelector('.home-picker-recovery').hidden,true);
 f.advance(6000);assert.equal(f.events.filter(e=>e.name==='screen_open_slow').length,0);assert.equal(f.events.filter(e=>e.name==='screen_open_ready').length,1);f.dispose();}
});
test('background time does not manufacture a slow load, and resumes the remaining visible wait',()=>{
 const f=fixture();f.open();f.advance(400);f.visible('hidden');f.advance(30000);assert.equal(f.events.filter(e=>e.name==='screen_open_slow').length,0);
 assert.equal(f.overlay.querySelector('.home-picker-status').hidden,true);f.visible('visible');f.advance(100);assert.equal(f.overlay.querySelector('.home-picker-status').hidden,false);
 f.advance(4500);assert.equal(f.state.phase,'slow');assert.equal(f.events.at(-1).values.elapsed_ms,5000);f.dispose();
});
test('retry replaces only the iframe, adds no history, rejects old and mismatched ready messages',()=>{
 const f=fixture();f.open();f.advance(5000);const oldFrame=f.frame,oldWindow=oldFrame.contentWindow,oldId=f.state.requestId,overlay=f.overlay;
 f.overlay.querySelector('[data-picker-retry]').click();assert.notEqual(f.frame,oldFrame);assert.equal(f.overlay,overlay);assert.equal(f.stack.length,2);assert.equal(f.state.elapsed,0);assert.notEqual(f.state.requestId,oldId);
 f.ready(oldId,oldWindow);assert.equal(f.state.phase,'pending');f.ready(oldId,f.frame.contentWindow);assert.equal(f.state.phase,'pending');
 f.ready();assert.equal(f.state.phase,'ready');assert.equal(f.events.filter(e=>e.name==='screen_open_retry').length,1);f.dispose();
});
test('legacy untagged ready is accepted only from the current same-origin iframe',()=>{
 const f=fixture();f.open();const payload={source:'gomna-home-bible-picker',action:'ready'};
 f.w.onHomeBiblePickerMessage({origin:f.w.location.origin,source:f.w,data:payload});assert.equal(f.state.phase,'pending');
 f.w.onHomeBiblePickerMessage({origin:'https://other.test',source:f.frame.contentWindow,data:payload});assert.equal(f.state.phase,'pending');
 f.w.onHomeBiblePickerMessage({origin:f.w.location.origin,source:f.frame.contentWindow,data:payload});assert.equal(f.state.phase,'ready');f.dispose();
});
test('frame errors expose recovery; load without the readiness handshake never reveals the wrong screen',()=>{
 for(const eventName of ['load','error']){
 const f=fixture();f.open();f.frame.dispatchEvent(new f.w.Event(eventName));assert.equal(f.w.getComputedStyle(f.frame).opacity,'0');
 if(eventName==='error'){assert.equal(f.state.phase,'error');assert.equal(f.overlay.querySelector('.home-picker-actions').hidden,false);assert.equal(f.events.at(-1).name,'screen_open_error');}
 else {assert.equal(f.state.phase,'pending');f.advance(5000);assert.equal(f.overlay.querySelector('.home-picker-actions').hidden,false);}
 f.ready();assert.equal(f.w.getComputedStyle(f.frame).opacity,'1');f.dispose();}
});
test('close, browser Back and Escape release scroll/focus; late ready never reopens a canceled screen',()=>{
 for(const method of ['close','back','escape']){
 const f=fixture();f.open();if(method==='close'){f.overlay.querySelector('.home-picker-close').click();f.completeClose();}
 else if(method==='escape'){f.overlay.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));f.completeClose();}else f.back();
 assert.equal(f.overlay.hidden,true);assert.equal(f.w.document.documentElement.classList.contains('home-bible-picker-open'),false);assert.equal(f.w.document.activeElement.id,'opener');
 f.advance(6000);assert.equal(f.events.filter(e=>e.name==='screen_open_slow').length,0);f.ready();assert.equal(f.overlay.hidden,true);assert.equal(f.stack.length,1);f.dispose();}
});
test('keyboard focus stays on visible recovery controls while the iframe is hidden',()=>{
 const f=fixture();f.open();const close=f.overlay.querySelector('.home-picker-close');close.focus();
 const firstTab=new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});close.dispatchEvent(firstTab);assert.equal(firstTab.defaultPrevented,true);assert.equal(f.w.document.activeElement,close);
 f.advance(5000);const last=f.overlay.querySelector('[data-picker-home]');last.focus();const lastTab=new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});last.dispatchEvent(lastTab);assert.equal(lastTab.defaultPrevented,true);assert.equal(f.w.document.activeElement,close);f.dispose();
});
test('telemetry obeys existing analytics permission, never emits pageviews or request identifiers',()=>{
 const f=fixture(false);f.open();f.advance(5000);assert.equal(f.events.length,0);f.consent(true);f.w.retryHomeBiblePicker();f.ready();
 assert.deepEqual(f.events.map(e=>e.name),['screen_open_retry','screen_open_start','screen_open_ready']);
 for(const e of f.events){assert.deepEqual(Object.keys(e.values).sort(),['elapsed_ms','reason','screen']);assert.equal(e.values.screen,'bible_picker');}
 f.dispose();
});
