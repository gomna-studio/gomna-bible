import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(process.env.HOME_FEED_SOURCE||new URL('../js/gomna-home-feed.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function section(text,start,end){
  const from=text.indexOf(start),to=text.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,start);return text.slice(from,to);
}
const handlers=section(source,'  var root,','  var BASE_CARD_IMAGES=')+
  section(source,'  var LIFE_THEMES=','  var LIFE_THEME_I18N=')+
  section(source,'  function clamp(','  function feedView(')+
  section(source,'  function parseRef(','  function storyPersonById(')+
  section(source,'  function cardFromEl(','  function hideLegacyHome(')+
  section(source,'  function applyReaderTarget(','  function viewH(')+
  section(source,'  function isTouchPointer(','  function layoutNums(')+
  section(source,'  function pinchDist(','  function socialClient(');
const bindings=[...source.matchAll(/    root\.addEventListener\('(?:touchstart|touchend|touchcancel|pointerdown|pointerup|pointercancel)', markGesture(?:Start|End), \{passive:true\}\);/g)].map(m=>m[0]).join('\n');
assert.equal(bindings.split('\n').length,6);
const readBinding=section(source,"    root.querySelectorAll('[data-ghd-read]')","    root.querySelectorAll('[data-ghd-commentary]')");
const navigation=section(home,'var _homeFeedReaderTarget=null;','var _todayWordOpenLock=false;');

function fixture({theme='new',cardId='1',open=true,read=true}={}){
  const calls=[],urls=[];
  function node(classes=''){
    const names=new Set(classes.split(/\s+/)),attrs=new Map(),listeners=new Map();
    return {style:{},listeners,classList:{contains:name=>names.has(name)},
      getAttribute:name=>attrs.get(name)||null,setAttribute:(name,value)=>attrs.set(name,String(value)),removeAttribute:name=>attrs.delete(name),
      addEventListener(type,fn,options={}){const list=listeners.get(type)||[];list.push({fn,capture:options===true||!!options.capture});listeners.set(type,list);},
      closest:()=>null};
  }
  const document=node(),root=node(),card=node('gomna-home-card is-active'+(open?' is-open':''));
  const sc=node('gomna-home-detail-scroll gomna-home-leaf-scroll'),inner=node('gomna-home-card-inner'),button=node(),icon=node();
  card.setAttribute('data-card',cardId);inner.setAttribute('data-ghd-pinch','1');
  card.getBoundingClientRect=()=>({left:0,right:390,top:0,bottom:800,width:390,height:800});
  card.querySelector=selector=>selector==='.gomna-home-card-inner'?inner:selector==='.gomna-home-detail-scroll'?sc:null;
  inner.closest=selector=>selector==='.gomna-home-card'?card:null;
  for(const target of [button,icon])target.closest=selector=>{
    if(selector==='[data-ghd-read]')return read?button:null;
    if(selector==='.gomna-home-card')return card;
    if(selector.includes('button, a'))return button;
    return null;
  };
  root.querySelectorAll=selector=>selector==='[data-ghd-read]'&&read?[button]:[];
  root.querySelector=selector=>{
    const ids=[...selector.matchAll(/data-card="(\d)"/g)].map(match=>match[1]);
    if(ids.length&&!ids.includes(cardId))return null;
    if(selector.includes('is-open:not(')||selector.includes('gbl-original-page'))return null;
    if(selector.includes('is-open')&&!open)return null;
    if(selector.includes('card-inner'))return inner;
    if(selector.includes('leaf-scroll'))return sc;
    return card;
  };
  root.setPointerCapture=()=>calls.push('capture');root.releasePointerCapture=()=>{};
  document.body={classList:{contains:()=>false}};document.documentElement={classList:{contains:()=>false}};
  document.querySelector=()=>null;document.getElementById=()=>null;
  const location={};Object.defineProperty(location,'href',{set:value=>urls.push(value)});
  const context=vm.createContext({document,window:{location},location,URLSearchParams,Date,Math,
    setTimeout:()=>1,clearTimeout:()=>{},localizedItem:value=>value,LIFE_THEME_I18N:{},
    deckScrollY:()=>400,pinDeckScroll:()=>calls.push('pin'),lockY:()=>400,lockY3:()=>800,
    apply:()=>calls.push('layout'),scheduleRelayout:()=>calls.push('relayout'),toggleOpen:()=>calls.push('toggle'),
    startSettleTo1:()=>calls.push('settle-0'),startSettleTo2:()=>calls.push('settle-1'),startSettleTo3:()=>calls.push('settle-2')});
  vm.runInContext(handlers+navigation,context);
  Object.assign(context,{root,cards:[null,card,null],count:3,progress:1,lastP:1,card2Settled:true,flipping:open,lifeThemeId:theme});
  context.cardDetail=()=>({scriptureTarget:context.currentLifeTheme().verseRef});
  context.bindDeckSwipe();context.bindCard(card);vm.runInContext(bindings+readBinding,context);
  let lastTouches=[];
  function dispatch(type,{target=button,x=100,y=200,touches,detail=1}={}){
    const ev={type,target,cancelable:true,defaultPrevented:false,stopped:false,detail,
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};
    if(type.startsWith('pointer'))Object.assign(ev,{clientX:x,clientY:y,pointerType:'touch',pointerId:1,isPrimary:true});
    if(type.startsWith('touch')){
      ev.touches=touches||((type==='touchend'||type==='touchcancel')?[]:[{clientX:x,clientY:y}]);
      ev.changedTouches=ev.touches.length?ev.touches:lastTouches;lastTouches=ev.touches;
      assert.ok(!('pointerType' in ev),'TouchEvent does not carry PointerEvent fields.');
    }
    const run=(owner,capture=false)=>{for(const listener of owner.listeners.get(type)||[])if(listener.capture===capture)listener.fn(ev);};
    run(document,true);
    for(const owner of [...(target===icon?[icon,button]:[target]),sc,card,root,document])if(!ev.stopped)run(owner);
    return ev;
  }
  function nativeTap({target=button,pointer=true,dx=0,dy=0}={}){
    const events=[];
    if(pointer)events.push(dispatch('pointerdown',{target}));
    events.push(dispatch('touchstart',{target}));
    if(dx||dy){
      if(pointer)events.push(dispatch('pointermove',{target,x:100+dx,y:200+dy}));
      events.push(dispatch('touchmove',{target,x:100+dx,y:200+dy}));
    }
    if(pointer)events.push(dispatch('pointerup',{target,x:100+dx,y:200+dy}));
    events.push(dispatch('touchend',{target}));
    // Model the browser's compatibility click only when touch was not canceled.
    if(!events.some(event=>event.defaultPrevented))dispatch('click',{target});
    return events;
  }
  return {calls,urls,context,button,icon,dispatch,nativeTap};
}

for(const theme of ['new','prayer'])for(const pointer of [false,true])for(const icon of [false,true]){
  test(`${theme} ${pointer?'Pointer+Touch':'Touch-only'} ${icon?'icon':'button'} first native tap`,()=>{
    const f=fixture({theme});const events=f.nativeTap({pointer,target:icon?f.icon:f.button});
    assert.ok(events.every(event=>!event.defaultPrevented),'Keep touch delivery native.');
    assert.deepEqual(f.calls,[],'Neither document capture nor root bubble may reposition the card before click.');
    assert.equal(f.urls.length,1);const url=new URL(f.urls[0],'https://example.test/');
    assert.equal(url.searchParams.get('source'),'home-life');assert.equal(url.searchParams.get('theme'),theme);
    assert.equal(url.searchParams.get('book'),theme==='new'?'고린도후서':'빌립보서');
    assert.equal(url.searchParams.get('chapter'),theme==='new'?'5':'4');
  });
}

test('read button never enters the document horizontal swipe handler',()=>{
  const f=fixture();f.dispatch('touchstart');const moved=f.dispatch('touchmove',{x:117,y:202});
  assert.equal(moved.defaultPrevented,false);assert.equal(f.context.swipeDrag,null);
  const ended=f.dispatch('touchend');assert.equal(ended.defaultPrevented,false);assert.deepEqual(f.calls,[]);
  assert.equal(f.urls.length,0,'The fix must not synthesize navigation at touchend.');
});

test('vertical movement and cancellation do not synthesize a read action',()=>{
  const f=fixture();f.dispatch('touchstart');const moved=f.dispatch('touchmove',{y:270});
  const canceled=f.dispatch('touchcancel');assert.equal(moved.defaultPrevented,false);assert.equal(canceled.defaultPrevented,false);
  assert.equal(f.urls.length,0);assert.deepEqual(f.calls,[]);
});

test('two-finger pinch still starts and finishes on a read button',()=>{
  const f=fixture();f.dispatch('touchstart',{touches:[{clientX:100,clientY:200},{clientX:140,clientY:200}]});
  assert.equal(f.context.pinching,true);f.dispatch('touchend');assert.equal(f.context.pinching,false);
  assert.ok(f.calls.includes('layout'));assert.equal(f.urls.length,0);
});

test('keyboard and mouse click keep the original immediate read route',()=>{
  const f=fixture({theme:'prayer'});f.dispatch('click',{detail:0});f.dispatch('click',{detail:1});
  assert.equal(f.urls.length,2);assert.deepEqual(f.calls,[]);
});

for(const options of [{cardId:'0'},{cardId:'2'},{open:false},{read:false}]){
  test(`scope stays limited: ${JSON.stringify(options)}`,()=>{
    const f=fixture(options);f.dispatch('touchstart');
    assert.ok(f.context.swipeDrag,'Other controls retain their existing swipe entry.');
    f.dispatch('touchend');assert.ok(f.calls.includes('layout'),'Other controls retain their existing deck settlement.');
  });
}
