// DOM/CSS contrast checks of dynamically rendered meditation routes.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');process.chdir(path.resolve(__dirname,'..'));const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.GOMNA_QA_MODULES||process.cwd()]}));
for(const view of ['main','session','done','walk','history','notes','note']){const file='meditation.html';
 const w=new JSDOM(fs.readFileSync(file,'utf8'),{url:'https://gomnastudio.com/'+file+'?view='+view+'&date=2026-10-12',runScripts:'outside-only'}).window;
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});
 for(const l of w.document.querySelectorAll('link[rel=stylesheet]')){let p=l.getAttribute('href').split('?')[0].replace(/^\//,'');if(fs.existsSync(p)){let s=w.document.createElement('style');s.textContent=fs.readFileSync(p,'utf8');l.replaceWith(s)}}
 if(file==='meditation.html'){for(const p of ['js/gomna-daily-verses.js','js/gomna-meditation-data.js','js/gomna-meditation-store.js','js/gomna-meditation.js']){try{w.eval(fs.readFileSync(p,'utf8'))}catch(e){console.log(p,e.message)}}w.document.dispatchEvent(new w.Event('DOMContentLoaded'));}
 w.eval(fs.readFileSync('js/gomna-theme.js','utf8'));w.GomnaTheme.set('dark');
 const val=(el,s,n=0)=>n>12?'':s.replace(/var\((--[\w-]+)(?:,([^()]+))?\)/g,(_,k,f)=>{for(let e=el;e;e=e.parentElement){let v=w.getComputedStyle(e).getPropertyValue(k).trim();if(v)return val(e,v,n+1)}return f||''});
 const rgb=s=>{if(s.startsWith('#')){s=s.slice(1);if(s.length===3)s=s.split('').map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16))}const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):null};
 const lum=s=>{const c=rgb(s);return c&&c.map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)};
 let seen=new Set(),count=0;
 for(const el of w.document.querySelectorAll('h1,h2,h3,p,button,a,label,span')){if(!el.textContent.trim())continue;const st=w.getComputedStyle(el);let c=val(el,st.color),bg='';for(let e=el;e;e=e.parentElement){const x=val(e,w.getComputedStyle(e).backgroundColor);if(x&&x!=='transparent'&&x!=='rgba(0, 0, 0, 0)'){bg=x;break}}if(!bg)continue;const x=lum(c),y=lum(bg);if(x===null||y===null)continue;const ratio=(Math.max(x,y)+.05)/(Math.min(x,y)+.05);let key=el.className+c+bg;assert.ok(ratio>=4.5,view+' '+el.className+' '+ratio);count++;}
 assert.ok(count>0,view+' rendered');console.log('PASS meditation '+view+': '+count+' text samples >=4.5:1');w.close();
}
