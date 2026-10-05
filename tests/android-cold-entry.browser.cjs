const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=process.cwd();
const server=http.createServer((q,r)=>{let f=path.join(root,new URL(q.url,'http://localhost').pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile()){r.writeHead(404);return r.end()}r.setHeader('Content-Type',f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.webp')?'image/webp':'application/octet-stream');fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});try{
 for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let release;const hold=new Promise(r=>release=r);await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(/\/(old|new)_testament\.js$/.test(u.pathname))await hold;return route.continue()});
 await page.goto(base+'/reader.html?easy=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#easyView').classList.contains('active')&&!document.documentElement.classList.contains('reader-panel-entry-pending'),{timeout:3500});
 assert.equal(await page.evaluate(()=>window.__gomnaBibleDataReady),false);console.log('early find visible before Bible data',width,errors);
 const input=page.locator('#easyFindSearchInput');await input.fill('사랑');await input.dispatchEvent('input');assert((await page.locator('#easyFindSearchResults').innerText()).includes('준비'));release();await page.waitForFunction(()=>window.__gomnaBibleDataReady,{timeout:20000});assert.equal(await input.inputValue(),'사랑');console.log('query preserved and results ready',width,errors);await context.close();
 }
 for(const mode of ['clear','failure','queued']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),pg=await ctx.newPage();let unlock;const hold=new Promise(r=>unlock=r);const errors=[];pg.on('pageerror',e=>errors.push(e.message));await pg.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(/\/(old|new)_testament\.js$/.test(u.pathname)){await hold;if(mode==='failure')return route.abort()}return route.continue()});await pg.goto(base+'/reader.html?easy=1',{waitUntil:'domcontentloaded'});await pg.waitForFunction(()=>!document.documentElement.classList.contains('reader-panel-entry-pending'));
 const inp=pg.locator('#easyFindSearchInput');await inp.fill('사랑');
 if(mode==='clear')await inp.fill('');
 if(mode==='queued')await inp.press('Enter');
 unlock();await pg.waitForFunction(()=>_gomnaBibleAppInitialized,{timeout:20000});await pg.waitForTimeout(100);
 if(mode==='clear'){assert.equal(await inp.inputValue(),'');assert.equal(await pg.locator('#easyFindSearchResults').isVisible(),false)}
 if(mode==='failure'){assert.equal(await pg.evaluate(()=>window.__gomnaBibleDataReady),false);assert((await pg.locator('#easyFindSearchResults').innerText()).includes('불러오지 못'))}
 assert.equal(errors.length,0,errors.join(';'));console.log(mode,'passed');await ctx.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();let release;const hold=new Promise(r=>release=r);await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname.endsWith('.webp'))await hold;return route.continue()});await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});assert.equal(await page.locator('.gomna-home-card[data-card="0"] .gomna-home-card-inner').evaluate(e=>getComputedStyle(e).visibility),'hidden');release();await page.waitForFunction(()=>!document.querySelector('.gomna-home-card[data-card="0"]').classList.contains('ghd-image-pending'));assert.equal(await page.locator('.gomna-home-card[data-card="0"] .gomna-home-card-inner').evaluate(e=>getComputedStyle(e).visibility),'visible');console.log('home text held until background decoded');await context.close();
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
