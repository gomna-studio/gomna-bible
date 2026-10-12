// DOM/CSS simulation, not a substitute for iPhone Safari/PWA verification.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..'),base='35b4d2bf99b3e1ecebd6b71c258384f07c446e53';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function page(old=false,saved='light'){
 const w=new JSDOM('<html class="reader-hide-chrome"><head></head><body><button data-gbl-open="people">인물</button><button data-gbl-open="stories">이야기</button></body></html>',{url:'https://gomnastudio.com/',runScripts:'outside-only',pretendToBeVisual:true}).window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLImageElement.prototype.decode=()=>Promise.resolve();
 w.localStorage.setItem('gomna_theme_v1',saved);
 const sheet=w.document.createElement('style');sheet.textContent=read('js/gomna-bible-library.css');w.document.head.append(sheet);
 w.eval(old?execFileSync('git',['show',base+':js/gomna-theme.js'],{cwd:root,encoding:'utf8'}):read('js/gomna-theme.js'));
 for(const p of ['js/gomna-bible-library-data.js','js/gomna-bible-library.js'])w.eval(read(p));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const value=(el,v,n=0)=>{assert.ok(n<15,'variable cycle');return v.replace(/var\((--[\w-]+)(?:,([^()]+))?\)/g,(_,k,f)=>{for(let e=el;e;e=e.parentElement){const x=w.getComputedStyle(e).getPropertyValue(k).trim();if(x)return value(e,x,n+1)}return f||''})};
 const color=(el,p='color')=>value(el,w.getComputedStyle(el).getPropertyValue(p));
 return {w,color,close:()=>w.close()};
}
function rgb(s){if(s.startsWith('#')){s=s.slice(1);if(s.length===3)s=s.split('').map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16))}return s.match(/[\d.]+/g).slice(0,3).map(Number)}
function ratio(a,b){const L=s=>rgb(s).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const old=page(true),fixed=page();let checked=0,min=100;
for(const kind of ['people','stories']){
 for(const p of [old,fixed])p.w.document.querySelector(`[data-gbl-open="${kind}"]`).click();
 const samples=['#gblTitle','[data-gbl-back]','[data-gbl-home]','.gbl-tile strong','.gbl-tile-copy>span'];
 for(const sel of samples)assert.deepEqual(rgb(old.color(old.w.document.querySelector(sel))),rgb(fixed.color(fixed.w.document.querySelector(sel))),'light unchanged '+sel);
 for(const p of [old,fixed])p.w.GomnaTheme.set('dark');
 assert.ok(ratio(old.color(old.w.document.querySelector('#gblTitle')),'#262019')<2,'reproduce navy title');
 for(const el of fixed.w.document.querySelectorAll('#gblTitle,[data-gbl-back],[data-gbl-home],.gbl-tile strong,.gbl-tile-copy>span')){const r=ratio(fixed.color(el),'#262019');assert.ok(r>=4.5,el.textContent+' '+r);min=Math.min(min,r);checked++}
 // Actual dynamically rendered detail markup, then back and switch kind.
 for(const p of [old,fixed])p.w.document.querySelector('.gbl-tile').click();
 for(const el of fixed.w.document.querySelectorAll('#gblTitle,.gbl-article h2,.gbl-article h3,.gbl-body,.gbl-intro,.gbl-eyebrow,.gbl-question p,.gbl-related button')){const r=ratio(fixed.color(el),'#262019');assert.ok(r>=4.5,el.className+' '+r);min=Math.min(min,r);checked++}
 for(const p of [old,fixed]){p.w.document.querySelector('[data-gbl-back]').click();assert.ok(p.w.document.querySelector('.gbl-grid'));p.w.GomnaTheme.set('light')}
}
const reopened=page(false,'dark');reopened.w.document.querySelector('[data-gbl-open="people"]').click();assert.equal(reopened.w.GomnaTheme.mode(),'dark');assert.ok(ratio(reopened.color(reopened.w.document.querySelector('#gblTitle')),'#262019')>=4.5);
console.log(`PASS ${checked} real people/story text and button samples; minimum ${min.toFixed(2)}:1; light unchanged, toggle, saved theme, late DOM, detail/back routes`);
for(const p of [old,fixed,reopened])p.close();
