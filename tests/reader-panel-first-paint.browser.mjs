import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import http from 'node:http';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.join(process.cwd(),pathname==='/'?'index.html':pathname);
  if(!file.startsWith(process.cwd()+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const baseline = execFileSync('git', ['show','origin/main:reader.html'], {encoding:'utf8',maxBuffer:4e6});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],headless:true});
const results=[];
try {
  for (const width of [390,1280]) {
    for (const original of [true,false]) {
      const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='127.0.0.1') return route.abort();
        if(original && url.pathname==='/reader.html') return route.fulfill({contentType:'text/html',body:baseline});
        if(/\/(old|new)_testament\.js$/.test(url.pathname)) await new Promise(r=>setTimeout(r,1200));
        return route.continue();
      });
      await page.addInitScript(()=>{
        window.__frames=[];
        function sample(){
          const root=document.documentElement;
          const title=document.getElementById('readerDockTopTitle');
          if(title){
            const hidden=getComputedStyle(title).visibility==='hidden'||root.classList.contains('reader-panel-entry-pending');
            window.__frames.push({title:title.textContent.trim(),hidden,view:document.querySelector('main.content .view.active')?.id});
          }
          if(window.__frames.length<400) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
      await page.locator('.gomna-home-tab[data-ghd-nav="find"]').click();
      await page.waitForFunction(()=>document.getElementById('readerDockTopTitle')?.textContent.trim()==='찾기' && !document.documentElement.classList.contains('reader-panel-entry-pending'),{timeout:15000});
      await page.waitForTimeout(150);
      const frames=await page.evaluate(()=>window.__frames);
      const wrong=frames.filter(f=>!f.hidden && f.title!=='찾기');
      results.push({width,original,frames:frames.length,wrongFrames:wrong.length,errors});
      if(original) assert.ok(wrong.length>0,'baseline must reproduce incorrect first paint');
      else assert.equal(wrong.length,0,'fixed route must never expose incorrect heading');
      await context.close();
    }
  }
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  for(const [query,view] of [['easy','easyView'],['easy=1&cb=abc','easyView'],['favorites=1','favView'],['focus=search','searchView'],['q=사랑','searchView']]){
    await page.goto(base+'/reader.html?'+query,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(id=>document.getElementById(id)?.classList.contains('active')&&!document.documentElement.classList.contains('reader-panel-entry-pending'),view,{timeout:15000});
    results.push({query,view,passed:true});
  }
  // Returning to Home and repeating the actual bottom Find interaction.
  for(let i=0;i<5;i++){
    await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('.gomna-home-tab[data-ghd-nav="find"]').click();
    await page.waitForFunction(()=>document.getElementById('easyView')?.classList.contains('active')&&!document.documentElement.classList.contains('reader-panel-entry-pending'));
    await page.goBack({waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('gomna-route-leaving')),false);
  }
  results.push({repeatAndBack:5,passed:true});
  for(const source of ['home-daily-read','home-life','home-bible-person','home-card-listen','home-main-listen','home-resume-read','search-related','guide-related','bible-tab']){
    await page.goto(base+'/reader.html?book='+encodeURIComponent('창세기')+'&chapter=1&verse=3&source='+source,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#verseList .verse-item')&&!document.documentElement.classList.contains('reader-panel-entry-pending'),{timeout:15000});
    results.push({scriptureSource:source,passed:true});
  }
  for(const source of ['home-card-commentary','home-main-commentary','meditation-commentary']){
    await page.goto(base+'/reader.html?book='+encodeURIComponent('창세기')+'&chapter=1&verse=3&commentary=1&source='+source,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('commentaryPopup')?.classList.contains('show')&&!document.documentElement.classList.contains('reader-panel-entry-pending'),{timeout:15000});
    results.push({commentarySource:source,passed:true});
  }
  await page.goto(base+'/reader.html?book='+encodeURIComponent('창세기')+'&chapter=1&verse=15&source=home-daily-read',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('reader-panel-entry-pending'));
  const positions=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];let start=performance.now();
    function frame(){const item=document.querySelector('.verse-item--entry-focus');samples.push({scroll:scrollY,y:item?.getBoundingClientRect().y});if(performance.now()-start<600)requestAnimationFrame(frame);else resolve(samples);}
    frame();
  }));
  assert.ok(positions.every(p=>p.scroll===positions[0].scroll&&p.y===positions[0].y),'verse must stay in place after reveal');
  results.push({versePositionStable600ms:true});
  /* The boot guard is one-shot; ready navigation must remain revealed. */
  await page.goto(base+'/reader.html?easy=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('reader-panel-entry-pending'));
  await page.evaluate(()=>{
    document.getElementById('easyView').classList.remove('active');
  });
  assert.equal(await page.evaluate(()=>window.__gomnaRevealPanelEntry()),true);
  await page.evaluate(()=>{
    document.getElementById('easyView').classList.add('active');
  });
  assert.equal(await page.evaluate(()=>window.__gomnaRevealPanelEntry()),true);
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('reader-panel-entry-failed')),false);
  results.push({oneShotGuard:true});
  await context.close();
  console.log(JSON.stringify(results,null,2));
} finally {await browser.close();server.close();}
