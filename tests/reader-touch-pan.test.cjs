// DOM event simulation; real Android hardware is not available in this runner.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]}));
const source=fs.readFileSync(require('node:path').join(__dirname,'../reader.html'),'utf8');
const start=source.indexOf('(function() {',source.indexOf('/* 일반 성경 본문 전용 —'));
const end=source.indexOf('/* 말씀풀이 팝업 전용 —',start);
const engine=source.slice(start,end);
const css=source.match(/\n#verseGestureViewport\{([\s\S]*?)\}/)[1];
assert.match(css,/touch-action:\s*pinch-zoom\s*;/,'custom pan must not allow native vertical scrolling');
assert.doesNotMatch(css,/touch-action:\s*none/,'native pinch must remain available');
const w=new JSDOM('<html class="reader-verse-active"><body><main class="phone-frame"><header id="verseReadHeader"></header><div id="verseView" class="active"><div id="verseList"><div class="verse-item" data-verse="1">1</div></div></div></main></body></html>',{runScripts:'outside-only',pretendToBeVisual:true}).window;
w.gomnaShouldUseTouchGestureEngine=()=>true;
Object.defineProperty(w,'innerHeight',{value:700});
const proto=w.HTMLElement.prototype;
proto.getBoundingClientRect=function(){const height=this.id==='verseReadHeader'?50:2200;return {x:0,y:0,top:0,left:0,right:390,bottom:height,width:390,height}};
for(const key of ['offsetHeight','scrollHeight','clientHeight'])Object.defineProperty(proto,key,{get(){return this.id==='verseReadHeader'?50:2200}});
for(const key of ['offsetWidth','scrollWidth','clientWidth'])Object.defineProperty(proto,key,{get(){return 390}});
let queue=new Map(),seq=0;
w.requestAnimationFrame=fn=>{queue.set(++seq,fn);return seq};w.cancelAnimationFrame=id=>queue.delete(id);
const flush=()=>{const pending=[...queue.values()];queue.clear();pending.forEach(fn=>fn(100))};
w.eval(engine);w.syncPlainVerseGestureMode();
const viewport=w.document.getElementById('verseGestureViewport'),surface=w.document.getElementById('verseGestureSurface');
const y=()=>Number(surface.style.transform.match(/translate3d\([^,]+,([^p]+)px/)[1]);
function pointer(type,pos,id=1){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',clientX:150,clientY:pos,button:0});viewport.dispatchEvent(e);flush();return e}
pointer('pointerdown',600);pointer('pointermove',580);pointer('pointermove',300);assert.ok(y()<-200,'finger up moves down through passage');pointer('pointercancel',300);const stopped=y();flush();assert.equal(y(),stopped,'cancel does not launch inertia');
pointer('pointerdown',300);pointer('pointermove',320);pointer('pointermove',500);assert.ok(y()>stopped,'finger down returns toward earlier verses');pointer('pointercancel',500);
pointer('pointerdown',400);const second=pointer('pointerdown',450,2);assert.equal(second.defaultPrevented,false,'two-finger zoom handed to browser');pointer('pointercancel',400);pointer('pointercancel',450,2);
w.document.documentElement.classList.remove('reader-verse-active');w.syncPlainVerseGestureMode();assert.equal(w.document.getElementById('verseGestureViewport'),null,'leaving passage removes scroll lock');assert.ok(!w.document.documentElement.classList.contains('plain-verse-gesture-active'));
w.document.documentElement.classList.add('reader-verse-active');w.syncPlainVerseGestureMode();assert.ok(w.document.getElementById('verseGestureViewport'),'returning to passage works');
let scripts=0;for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|application\/ld\+json/.test(m[1]))continue;new vm.Script(m[2]);scripts++}
console.log('PASS: pan up/down, cancellation, pinch handoff, leave/reenter, CSS gesture ownership; '+scripts+' inline scripts parse');w.close();
