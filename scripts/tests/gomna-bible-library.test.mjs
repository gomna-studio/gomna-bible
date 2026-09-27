// GOMNA_CHROME_BIN=/path/to/chrome node scripts/tests/gomna-bible-library.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/gomna-bible-library-data.js'),'utf8'),context);
const items=context.window.GOMNA_BIBLE_LIBRARY_DATA;
assert.equal(items.filter(i=>i.kind==='people').length,27);assert.equal(items.filter(i=>i.kind==='stories').length,12);
assert.equal(new Set(items.map(i=>i.id)).size,39);
const books={'창세기':1,'출애굽기':2,'여호수아':6,'사사기':7,'룻기':8,'사무엘상':9,'열왕기상':11,'느헤미야':16,'에스더':17,'다니엘':27,'요나':32,'마가복음':41,'누가복음':42,'요한복음':43,'사도행전':44};
const bible=JSON.parse(fs.readFileSync(path.join(root,'js/bible/webp.json'),'utf8')).books;
for(const i of items){assert.ok(fs.existsSync(path.join(root,i.image)),i.image);assert.ok(i.body.length>80);assert.ok(i.start<=i.end);for(let v=i.start;v<=i.end;v++)assert.ok(bible[books[i.book]]?.[i.chapter]?.[v],i.id+' missing verse '+v);}
console.log('PASS 39 unique entries, images and every referenced verse exist; Lot/Ruth distinct');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');const f=path.join(root,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.GOMNA_CHROME_BIN});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>{if(e.stack?.includes('gomna-bible-library'))errors.push(e.message);});
 await p.goto(origin+'/#bible-library/people');await p.locator('[data-gbl-item="abraham"]').waitFor();
 assert.equal(await p.locator('.gbl-tile').count(),27);
 await p.locator('#gblSearch').fill('없는이름');assert.equal(await p.locator('.gbl-tile').count(),0);assert.ok(await p.locator('.gbl-empty').isVisible());
 await p.locator('#gblSearch').fill('룻');assert.equal(await p.locator('.gbl-tile').count(),1);await p.locator('[data-gbl-item="ruth"]').click();assert.equal(await p.locator('#gblTitle').textContent(),'룻');await p.locator('[data-gbl-back]').click();assert.equal(await p.locator('#gblSearch').inputValue(),'룻');
 await p.locator('#gblSearch').fill('');await p.locator('[data-gbl-group="신약"]').click();assert.equal(await p.locator('.gbl-tile').count(),9);
 await p.locator('[data-gbl-kind="stories"]').click();assert.equal(await p.locator('.gbl-tile').count(),12);await p.locator('[data-gbl-group="비유"]').click();assert.equal(await p.locator('.gbl-tile').count(),3);
 await p.locator('[data-gbl-item="samaritan"]').click();assert.ok((await p.locator('.gbl-article').textContent()).includes('예수님이 들려주신 비유'));
 const read=new URL(await p.locator('.gbl-actions a').first().getAttribute('href'),origin);assert.equal(read.searchParams.get('book'),'누가복음');assert.equal(read.searchParams.get('chapter'),'10');assert.equal(read.searchParams.get('verse'),'25');assert.equal(read.searchParams.get('verseEnd'),'37');
 const listen=new URL(await p.locator('.gbl-actions a').last().getAttribute('href'),origin);assert.equal(listen.searchParams.get('listen'),'1');assert.equal(listen.searchParams.get('source'),'home-main-listen');assert.ok(fs.readFileSync(path.join(root,'reader.html'),'utf8').includes("src==='home-main-listen'"));assert.equal(listen.searchParams.get('startVerse'),'25');assert.equal(listen.searchParams.get('endVerse'),'37');
 await p.goBack();assert.equal(await p.locator('.gbl-tile').count(),3);assert.equal(await p.locator('[data-gbl-group="비유"]').getAttribute('aria-pressed'),'true');
 await p.locator('[data-gbl-kind="people"]').click();await p.locator('[data-gbl-group="전체"]').click();
 await p.mouse.move(190,500);await p.mouse.wheel(0,650);await p.waitForTimeout(250);const position=await p.locator('.gbl-scroll').evaluate(e=>e.scrollTop);assert.ok(position>0,'wheel must scroll list, not home');
 const target=p.locator('[data-gbl-item="hannah"]');await target.scrollIntoViewIfNeeded();const before=await p.locator('.gbl-scroll').evaluate(e=>e.scrollTop);await target.click();await p.locator('[data-gbl-back]').click();assert.ok(Math.abs((await p.locator('.gbl-scroll').evaluate(e=>e.scrollTop))-before)<3);
 await p.reload();await p.locator('[data-gbl-item="hannah"]').waitFor();assert.ok(Math.abs((await p.locator('.gbl-scroll').evaluate(e=>e.scrollTop))-before)<3);
 console.log('PASS search, empty results, filters, story types, passage ranges, browser back and scroll restore');
 for(const width of [320,390,430,768,1440]){
  await p.setViewportSize({width,height:844});await p.goto(origin+'/#bible-library/people/abraham');await p.locator('.gbl-detail').waitFor();
  const box=await p.locator('#gomnaBibleLibrary').boundingBox();assert.equal(box.width,Math.min(width,420));
  const overflow=await p.locator('.gbl-scroll').evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(overflow,false);
  await p.locator('.gbl-actions').scrollIntoViewIfNeeded();for(const a of await p.locator('.gbl-actions a').all()){const ab=await a.boundingBox();assert.ok(ab.x>=box.x&&ab.x+ab.width<=box.x+box.width+1);}
 }
 await p.setViewportSize({width:390,height:667});await p.goto(origin+'/#bible-library/people');await p.evaluate(()=>document.documentElement.style.setProperty('--gomna-text-scale','1.5'));await p.locator('[data-gbl-item="abraham"]').waitFor();assert.equal(await p.locator('#gblResults').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
 assert.deepEqual(errors,[]);console.log('PASS 320–1440px widths, enlarged text, no horizontal overflow');
 await p.goto(origin+'/');await p.waitForTimeout(600);const reject=p.getByRole('button',{name:'거부',exact:true});if(await reject.isVisible())await reject.click();await p.mouse.move(190,400);for(let n=0;n<4;n++){await p.mouse.wheel(0,650);await p.waitForTimeout(550);}
 await p.locator('[data-gbl-discover="open"]').click();await p.locator('[data-gbl-open="people"]').click();assert.ok(await p.locator('#gomnaBibleLibrary').isVisible());await p.locator('[data-gbl-home]').click();assert.equal(await p.locator('#gomnaBibleLibrary').isVisible(),false);assert.equal(await p.locator('#gomnaHomeFeed').evaluate(e=>e.inert),false);
 await p.locator('[data-gbl-open="stories"]').click();assert.equal(await p.locator('.gbl-tile').count(),3);await p.locator('[data-gbl-group="전체"]').click();assert.equal(await p.locator('.gbl-tile').count(),12);await p.locator('#gomnaHomeTabbar [data-ghd-nav="home"]').click();assert.equal(await p.locator('#gomnaBibleLibrary').isVisible(),false);
 console.log('PASS real home card entry, close, bottom Home navigation, original card restored');
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});await touch.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const tp=await touch.newPage();await tp.goto(origin+'/#bible-library/people');await tp.locator('[data-gbl-item="abraham"]').tap();assert.equal(await tp.locator('#gblTitle').textContent(),'아브라함');await tp.locator('[data-gbl-back]').tap();assert.equal(await tp.locator('.gbl-tile').count(),27);console.log('PASS touch taps open and return');
 await tp.goto(origin+'/');await tp.waitForTimeout(800);const tr=tp.getByRole('button',{name:'거부',exact:true});if(await tr.isVisible())await tr.tap();
 const cdp=await touch.newCDPSession(tp);
 for(let n=0;n<4;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:620}]});for(const y of [560,490,420,340,250]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y}]});await tp.waitForTimeout(35);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tp.waitForTimeout(550);}
 assert.equal(await tp.locator('[data-ghd-story-chip]').count(),7);
 async function horizontal(from,to){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y:410}]});for(let n=1;n<=6;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*n/6,y:410}]});await tp.waitForTimeout(35);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tp.waitForTimeout(500);}
 await horizontal(320,65);assert.ok(await tp.locator('.gbl-discover-page').isVisible());
 await horizontal(65,320);assert.ok(await tp.locator('.gbl-original-page').isVisible());
 console.log('PASS third card touch left/right opens discovery and restores seven original pills');
 await tp.locator('[data-gbl-discover="open"]').tap();await tp.locator('[data-gbl-open="people"]').tap();assert.ok(await tp.locator('#gomnaBibleLibrary').isVisible());console.log('PASS touch swipes through real home and taps new entry');

 // A real Reader render checks the query contract without changing the audio engine.
 await p.goto(read.href);await p.waitForFunction(()=>document.querySelector('#verseList .verse-item'),null,{timeout:20000});assert.ok((await p.locator('#verseList').textContent()).includes('사마리아'));console.log('PASS linked Reader loads the actual Luke 10 passage');
}finally{await browser.close();await new Promise(r=>server.close(r));}
