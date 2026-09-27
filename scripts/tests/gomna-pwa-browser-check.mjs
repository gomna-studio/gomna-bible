// Run with GOMNA_CHROME_BIN pointing to a Chromium executable.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root=new URL('../../',import.meta.url);
const helper=fs.readFileSync(new URL('js/gomna-pwa-recovery.js',root),'utf8');
const worker=fs.readFileSync(new URL('sw.js',root),'utf8');
const version=worker.match(/const CACHE_VERSION = '([^']+)'/)[1];
let phase='legacy',manifestRequests=0;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/sw.js'){
  res.setHeader('Content-Type','text/javascript');
  return res.end(phase==='legacy'?"self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));":phase==='future'?worker.replaceAll(version,version+'-next'):worker);
 }
 if(u.pathname==='/js/gomna-pwa-recovery.js'){res.setHeader('Content-Type','text/javascript');return res.end(helper);}
 if(u.pathname==='/audio/audio-manifest.json'){manifestRequests++;res.statusCode=503;return res.end('unavailable');}
 if(u.pathname!=='/'&&u.pathname!=='/index.html'&&u.pathname!=='/reader.html'&&u.pathname!=='/meditation.html'){res.setHeader('Content-Type','text/javascript');return res.end('');}
 const release=u.searchParams.get('appRelease')||version;
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body data-gomna-page="meditation"><input id="edit"><nav id="gomnaHomeTabbar" style="position:fixed;top:370px;height:60px;width:100%;">tabs</nav><script>window.audioState={isPlaying:false};window.GOMNA_AUDIO_ENGINE={getState:()=>audioState};window.pageId=Math.random();</script>${u.searchParams.has('legacy')?`<script>navigator.serviceWorker.register('/sw.js?v=old')</script>`:`<script src="/js/gomna-pwa-recovery.js" data-release="${release}" defer></script>`}</body>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.GOMNA_CHROME_BIN});
try{
 const context=await browser.newContext({viewport:{width:390,height:780}});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'userAgent',{get:()=> 'iPhone'});Object.defineProperty(navigator,'standalone',{get:()=>true});
  window.simulatedHeight=430;window.simulatedScale=1;
  Object.defineProperty(window.visualViewport,'height',{get:()=>window.simulatedHeight});Object.defineProperty(window.visualViewport,'scale',{get:()=>window.simulatedScale});
 });
 const page=await context.newPage();
 await page.goto(origin+'/?legacy');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.evaluate(()=>localStorage.setItem('saved-verse','john.2.2'));
 phase='current';await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 await page.waitForTimeout(1500);assert(page.url().includes('legacy'));
 console.log('PASS old client remains undisturbed with new worker waiting');
 await page.goto(origin+'/?new');
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r&&!r.waiting&&r.active&&r.active.scriptURL.includes('v=2026');});
 await page.waitForFunction(()=>window.GOMNA_PWA_VIEWPORT.read().height===780);
 assert.equal(await page.locator('#gomnaHomeTabbar').evaluate(el=>Math.round(el.getBoundingClientRect().bottom)),780);
 await page.locator('#edit').focus();assert.equal(await page.evaluate(()=>GOMNA_PWA_VIEWPORT.read().height),430);
 await page.locator('#edit').blur();await page.waitForTimeout(1100);
 await page.evaluate(()=>simulatedScale=1.5);assert.equal(await page.evaluate(()=>GOMNA_PWA_VIEWPORT.read().height),430);await page.evaluate(()=>simulatedScale=1);
 console.log('PASS actual DOM layout repair, keyboard and pinch exclusions');
 const id=await page.evaluate(()=>pageId);await page.evaluate(()=>audioState.isPlaying=true);phase='future';
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>pageId),id);
 await page.evaluate(()=>{audioState.isPlaying=false;dispatchEvent(new CustomEvent('audio:end'));});
 await page.waitForURL('**appRelease=*',{timeout:20000});
 assert.equal(new URL(page.url()).searchParams.get('appRelease'),version+'-next');
 assert.equal(await page.evaluate(()=>localStorage.getItem('saved-verse')),'john.2.2');
 const after=await page.evaluate(()=>pageId);await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>pageId),after);
 assert.equal(manifestRequests,0);
 console.log('PASS real worker update waits for playback, reloads once after stop, retains stored verse; no install-time manifest request');
 await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
