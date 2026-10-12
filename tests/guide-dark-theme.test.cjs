// DOM/CSS simulation; does not substitute for Safari or installed-PWA testing.
// npm install --prefix /tmp/gomna-theme-qa jsdom css-tree
// GOMNA_QA_MODULES=/tmp/gomna-theme-qa/node_modules node tests/guide-dark-theme.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const resolve=p=>require.resolve(p,{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]});
const {JSDOM}=require(resolve('jsdom'));
const cssTree=require(resolve('css-tree'));
const root=path.resolve(__dirname,'..');
const read=(p,base=false)=>base?execFileSync('git',['show','a58e2b0827eeadbae2106dc86367728058982921:'+p],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,p),'utf8');
const theme=read('js/gomna-theme.js');
function page(base=false,saved='light',late=false){
 const d=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://gomnastudio.com/reader.html',runScripts:'outside-only'});
 const w=d.window;w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.localStorage.setItem('gomna_theme_v1',saved);
 const css=read('js/gomna-guide-colorful.css',base);
 cssTree.parse(css,{onParseError:e=>{throw e}});
 const feature=read('gomna_category_feature.js',base);
 const start=feature.indexOf('var styleEl =');const end=feature.indexOf('document.head.appendChild(styleEl);');
 assert.ok(end>start);w.eval(feature.slice(start,end+'document.head.appendChild(styleEl);'.length));
 const sheet=w.document.createElement('style');sheet.textContent=css;w.document.head.appendChild(sheet);
 const markup=`<section id="scriptureAllGuidesOverlay"><header class="scripture-guide-head"><h1 class="scripture-guide-head-title">성경 길잡이</h1><button class="scripture-guide-head-btn scripture-all-guides-back">&lt;</button><button class="scripture-guide-head-close" style="${feature.match(/class="scripture-guide-head-close" style="([^"]+)"/)[1]}">✕</button></header><div id="scriptureAllGuidesBody"><article class="scripture-all-guides-article"><section class="scripture-guide-summary"><h2 class="scripture-guide-cat">모세오경</h2><p class="scripture-guide-alt">율법서 · 언약서</p><p>창세기부터 신명기까지 · 5권</p></section><section class="scripture-guide-card"><h3>시내산 — 성경 속 장소와 오늘날의 위치</h3><p>상세 본문</p></section></article></div></section>`;
 if(!late)w.document.body.innerHTML=markup;
 w.eval(theme);if(late)w.document.body.innerHTML=markup;
 const variable=(el,name)=>{for(let n=el;n;n=n.parentElement){const v=w.getComputedStyle(n).getPropertyValue(name).trim();if(v)return value(n,v)}return ''};
 const value=(el,v)=>v.replace(/var\((--[\w-]+)(?:,([^()]+))?\)/g,(_,key,fallback)=>variable(el,key)||fallback||'');
 const color=(sel,prop='color')=>{const e=w.document.querySelector(sel);return value(e,w.getComputedStyle(e).getPropertyValue(prop))};
 return {w,color,close:()=>w.close()};
}
function rgb(x){if(x.startsWith('#')){x=x.slice(1);if(x.length===3)x=x.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(x.slice(i,i+2),16))}return x.match(/[\d.]+/g).slice(0,3).map(Number)}
function contrast(a,b){const lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);let x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const selectors=['.scripture-guide-head-title','.scripture-all-guides-back','.scripture-guide-head-close','.scripture-guide-cat','.scripture-guide-alt','.scripture-guide-summary p:last-child','.scripture-guide-card h3','.scripture-guide-card p'];
const baseline=page(true),fixed=page();
for(const sel of selectors)assert.deepEqual(rgb(fixed.color(sel)),rgb(baseline.color(sel)),'light unchanged '+sel);
console.log('PASS light-mode sampled colors identical to main');
for(const p of [baseline,fixed])p.w.GomnaTheme.set('dark');
assert.ok(contrast(baseline.color('.scripture-guide-head-close'),baseline.color('.scripture-guide-head','background-color'))<4.5,'baseline black close reproduces');
for(const sel of selectors){const bg=fixed.color(sel.includes('head')||sel.includes('back')?'.scripture-guide-head':sel.includes('card')?'.scripture-guide-card':'.scripture-guide-summary','background-color');const ratio=contrast(fixed.color(sel),bg);assert.ok(ratio>=4.5,`${sel}: ${fixed.color(sel)} / ${bg}: ${ratio}`);console.log('PASS contrast',sel,ratio.toFixed(2));}
assert.equal(fixed.w.localStorage.getItem('gomna_theme_v1'),'dark');
fixed.w.GomnaTheme.set('light');baseline.w.GomnaTheme.set('light');
for(const sel of selectors)assert.deepEqual(rgb(fixed.color(sel)),rgb(baseline.color(sel)));
console.log('PASS light → dark → light and storage');
const reopened=page(false,'dark',true);
assert.equal(reopened.w.GomnaTheme.mode(),'dark');
assert.ok(contrast(reopened.color('.scripture-guide-cat'),reopened.color('.scripture-guide-summary','background-color'))>=4.5);
console.log('PASS saved preference on new DOM and content inserted after theme initialization');
for(const p of [baseline,fixed,reopened])p.close();
