import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=new URL('../../',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.GOMNA_CHROME_BIN,headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:3});
 const home=fs.readFileSync(new URL('index.html',root),'utf8');
 await page.setContent(home.match(/<style id="gomna-home-card-no-selection">[\s\S]*?<\/style>/)[0] + '<section id="gomnaHomeFeed"><h2>성경 속 이야기와 인물</h2><input value="편집"><div contenteditable="true"><span>메모</span></div></section><p id="outside">본문</p>');
 assert.equal(await page.locator('h2').evaluate(e=>getComputedStyle(e).userSelect),'none');
 for(const selector of ['input','[contenteditable] span']) assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).userSelect),'text');
 assert.notEqual(await page.locator('#outside').evaluate(e=>getComputedStyle(e).userSelect),'none');
 console.log('PASS home card selection disabled; editable fields and outside text preserved');
 await page.goto('about:blank');
 for(const file of ['index.html','meditation.html','reader.html','toolbar','home-books']) {
  const html=fs.readFileSync(new URL(file==='toolbar'?'reader.html':file==='home-books'?'index.html':file,root),'utf8');
  assert.ok(html.includes('/js/gomna-nav-magnifier.js?v=20260927-4'));
  const nav=file==='home-books'?'<nav>'+html.match(/<button[^>]*data-ghd-read[^>]*>[\s\S]*?<\/button>/g).join('')+'</nav>':file==='toolbar'?'<nav id="opt4VerseToolbar">'+html.match(/<div id="opt4VerseToolbar"[\s\S]*?<\/nav>/)[0].match(/<button[^>]*id="(?:verseToolbarLocationButton|opt4VerseListen|opt4VerseCommentary|opt4VerseMore)"[\s\S]*?<\/button>/g).join('')+'</nav>':html.match(file==='reader.html'?/<nav id="scriptureDock"[\s\S]*?<\/nav>/:/<nav class="gomna-home-tabbar"[\s\S]*?<\/nav>/)[0];
  await page.setContent(`<style>nav{position:fixed;bottom:0;display:flex;width:374px}nav>a,nav>button{flex:1;min-width:0}nav svg{width:24px;height:24px}nav span{display:block}.home-policy-links{display:none}</style>${nav}`);
  await page.evaluate(()=>{
   window.actions=0;
   document.querySelectorAll('nav a,nav button').forEach(e=>{e.removeAttribute('onclick');e.addEventListener('click',ev=>{ev.preventDefault();window.actions++;});});
  });
  await page.addScriptTag({path:new URL('js/gomna-nav-magnifier.js',root).pathname});
  const items=page.locator('nav .gomna-home-tab,nav .scripture-dock-item, #opt4VerseToolbar > button, button[data-ghd-read]');
  const count=await items.count();
  for(let i=0;i<count;i++) {
   const el=items.nth(i), b=await el.boundingBox();
   const x=b.x+b.width/2,y=b.y+b.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(550);
   assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),true);
   assert.equal(await page.locator('#gomnaNavMagnifier svg').count(),1);
   assert.equal(await page.locator('#gomnaNavMagnifier svg').evaluate(e=>getComputedStyle(e).filter),'none');
   assert.equal((await page.locator('#gomnaNavMagnifier > span').last().textContent()).trim(),await el.evaluate(e=>(e.querySelector('.opt4-bar-label, .verse-toolbar-location-text')||e).textContent.trim()));
   const box=await page.locator('#gomnaNavMagnifier').boundingBox();
   assert.ok(box.x>=0 && box.x+box.width<=390 && box.y+box.height<y);
   await page.mouse.up();
   assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.actions),i);
   await el.click();
   assert.equal(await page.evaluate(()=>window.actions),i+1);
  }
  const el=items.first(),b=await el.boundingBox();
  await page.mouse.move(b.x+10,b.y+10);await page.mouse.down();await page.mouse.move(b.x+30,b.y+10);await page.waitForTimeout(550);
  assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),false);
  await page.mouse.up();
  // Touch cancellation must hide the overlay and never navigate.
  await el.dispatchEvent('pointerdown',{pointerId:9,isPrimary:true,button:0,clientX:20,clientY:800,pointerType:'touch'});
  await page.waitForTimeout(550);
  assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),true);
   assert.equal(await page.locator('#gomnaNavMagnifier svg').count(),1);
   assert.equal(await page.locator('#gomnaNavMagnifier svg').evaluate(e=>getComputedStyle(e).filter),'none');
  await el.dispatchEvent('pointercancel',{pointerId:9});
  assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),false);
  // A second finger cancels the pending long press, allowing pinch gestures.
  await el.dispatchEvent('pointerdown',{pointerId:10,isPrimary:true,button:0,clientX:20,clientY:800});
  await el.dispatchEvent('pointerdown',{pointerId:11,isPrimary:false,button:0});
  await page.waitForTimeout(550);
  assert.equal(await page.locator('#gomnaNavMagnifier').isVisible(),false);
  console.log(`PASS ${file}: ${count} icons; hold/release, next tap, bounds, drag, cancel, multitouch`);
  await page.goto('about:blank');
 }
} finally {await browser.close();}
