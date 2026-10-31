// DOM/style and navigation state tests; this is not a physical-device timing test.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]}));
const home=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../js/gomna-home-feed.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../js/gomna-home-feed.css'),'utf8');
const boot=home.match(/<script id="gomna-home-entry-target">([\s\S]*?)<\/script>/)[1];

function shippedFunction(name){
  const start=source.indexOf('  function '+name+'('), open=source.indexOf('{',start);
  assert.ok(start>=0,name);
  let depth=0, quote='', comment='';
  for(let i=open;i<source.length;i++){
    const c=source[i], next=source[i+1];
    if(comment==='line'){if(c==='\n')comment='';continue;}
    if(comment==='block'){if(c==='*'&&next==='/'){comment='';i++;}continue;}
    if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
    if(c==='/'&&next==='/'){comment='line';i++;continue;}
    if(c==='/'&&next==='*'){comment='block';i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw Error('Unclosed '+name);
}

const cases=[['',0,false],['?source=home-life&theme=prayer',1,true],
  ['?source=home-bible-person&person=esther',2,true],['?source=home-bible-person&person=ruth',2,true],
  ['?source=home-guide',2,false],['?source=home-today',0,true],
  ['?source=home-life&theme=missing',0,false],['?source=unknown',0,false]];
for(const [query,target,detail] of cases){
  const w=new JSDOM('<!doctype html><head></head><body><section id="gomnaHomeFeed" class="ghd-instant-navigation">'+
    [0,1,2].map(i=>'<article class="gomna-home-card ghd-image-pending '+(i===0?'is-active':'')+'" data-card="'+i+'"><div>card '+i+'</div></article>').join('')+
    '</section></body>',{url:'https://example.test/index.html'+query,runScripts:'outside-only'}).window;
  const style=w.document.createElement('style');style.textContent=css;w.document.head.appendChild(style);
  w.eval(boot);
  const cards=[...w.document.querySelectorAll('.gomna-home-card')];
  cards.forEach((card,i)=>assert.equal(w.getComputedStyle(card).visibility,i===target?'visible':'hidden',query+' first selected card'));
  assert.equal(w.getComputedStyle(cards[target].firstChild).visibility,detail?'hidden':'visible',query+' pre-init teaser must not flash before detail');
  // Simulate synchronous init selection: the actual detail is readable even
  // while its background is still pending, then remains readable on failure.
  w.document.getElementById('gomnaHomeFeed').setAttribute('data-ghd-bound','1');
  cards.forEach((card,i)=>card.classList.toggle('is-active',i===target));
  cards[target].classList.toggle('is-open',detail);
  assert.equal(w.getComputedStyle(cards[target].firstChild).visibility,'visible');
  cards[target].classList.remove('ghd-image-pending');cards[target].classList.add('ghd-image-failed');
  assert.equal(w.getComputedStyle(cards[target].firstChild).visibility,'visible');
  w.close();
}
assert.match(home,/<section class="gomna-home-deck ghd-instant-navigation" id="gomnaHomeFeed"/);

(async()=>{
  const canceled=[], timers=new Map(), changed=[];
  const cards=[0,1,2].map(i=>({style:{},matrix:'matrix(1, 0, 0, 1, -195, '+i*240+')',classList:{toggle(){}},getAttribute:()=>String(i)}));
  const context=vm.createContext({
    cards,root:{querySelector:()=>cards[1]},homeDeparting:false,homeDepartureTimer:0,
    lifeImageRequest:1,storyImageRequest:2,cardOpenImageRequest:3,raf:11,settleAnimTimer:12,wheelIdleTimer:13,
    settleAnim:true,wheelGesture:true,wheelStepDelta:90,swipeDrag:{axis:'y'},swipeHandled:true,gestureLive:true,awaitingDir:true,
    progress:1,document:{visibilityState:'visible'},
    clearTimeout:id=>{canceled.push(id);timers.delete(id);},
    window:{getComputedStyle:card=>({transform:card.matrix}),cancelAnimationFrame:id=>canceled.push(id),
      clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(20,fn);return 20;}},
    setCardImageBusy:(card,busy)=>{card.busy=busy;},
    apply:(...args)=>changed.push(args),
  });
  vm.runInContext(['cancelPendingCardOpens','cancelDeckMotion','freezeHomeDeparture','resumeHomeAfterDeparture'].map(shippedFunction).join('\n'),context);
  // The real life-theme callback must not replace the current card after a
  // Find/Archive departure when its old photograph finally finishes loading.
  let release;
  Object.assign(context,{lifeThemeId:'new',LIFE_THEME_IMGS:{prayer:'prayer.webp'},
    lifeThemeById:()=>({id:'prayer'}),ensureHomeImageReady:()=>new Promise(resolve=>{release=resolve;}),
    fillCopy:()=>changed.push('copy'),openCard:()=>changed.push('open'),preloadLifeThemeImages:()=>changed.push('preload')});
  vm.runInContext(shippedFunction('selectLifeTheme'),context);
  context.selectLifeTheme('prayer');
  context.freezeHomeDeparture();
  assert.equal(context.homeDeparting,true);
  assert.deepEqual(canceled,[11,12,13]);
  assert.equal(context.swipeDrag,null);assert.equal(context.gestureLive,false);
  cards.forEach(card=>{assert.equal(card.style.transition,'none');assert.equal(card.style.transform,card.matrix);});
  release(true);await Promise.resolve();
  assert.equal(context.lifeThemeId,'new');assert.deepEqual(changed,[],'A stale image cannot open a different card during departure');
  const painted=cards.map(card=>card.style.transform);
  vm.runInContext(shippedFunction('apply')+'\n'+shippedFunction('onScroll'),context);
  context.apply(2,false);context.onScroll();
  assert.deepEqual(cards.map(card=>card.style.transform),painted);
  context.apply=(...args)=>changed.push(args);
  context.startSettleTo1=instant=>changed.push([0,instant]);
  context.startSettleTo2=instant=>changed.push([1,instant]);
  context.startSettleTo3=instant=>changed.push([2,instant]);
  context.resumeHomeAfterDeparture();
  assert.equal(context.homeDeparting,false);assert.deepEqual(changed,[[1,true]]);
  assert.equal(timers.size,0);

  // Modified clicks open another tab and must not freeze the current home.
  const handlers={},links=['home','bible','find','archive','media','me'].map(act=>({
    getAttribute:()=>act,addEventListener:(name,fn)=>{handlers[act]=fn;}}));
  let frozen=0;
  const start=source.indexOf("    document.querySelectorAll('[data-ghd-nav]').forEach(function(el){");
  const end=source.indexOf('\n  function openViewer()',start);
  const binding=source.slice(start,end).replace(/\n  \}\s*$/,'');
  vm.runInNewContext(binding,{document:{querySelectorAll:()=>links},freezeHomeDeparture:()=>frozen++,resetHomeToFirstCard(){},openHomeBiblePicker(){}});
  for(const act of ['find','archive','media']){
    handlers[act]({button:0,ctrlKey:true});handlers[act]({button:0,metaKey:true});
    handlers[act]({button:1});handlers[act]({button:0,defaultPrevented:true});
  }
  assert.equal(frozen,0);
  for(const act of ['find','archive','media'])handlers[act]({button:0});
  assert.equal(frozen,3);
  console.log('PASS: 8 first-paint targets; pending/failed images keep text visible; outgoing animation/image cancellation; resume; modified-click navigation');
})().catch(error=>{console.error(error);process.exitCode=1;});
