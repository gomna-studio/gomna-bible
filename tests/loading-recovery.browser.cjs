/* Real-browser regression checks. Requires a runtime that permits Chromium and
 * loopback sockets. These checks do not contact production or analytics hosts.
 * PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/usr/bin/chromium \
 *   node tests/loading-recovery.browser.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const results = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  const type = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' }[path.extname(file)];
  res.setHeader('Content-Type', type || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout:15000 });
let browser, base;
async function contextWith(routeHandler) {
  const context = await browser.newContext({
    viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, serviceWorkers:'block',
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    return routeHandler ? routeHandler(route, url) : route.continue();
  });
  return { context, page, errors };
}
async function normalRoutes() {
  const { context, page, errors } = await contextWith();
  await page.addInitScript(() => {
    window.__visibleTitles = [];
    const sample = () => {
      const title = document.getElementById('readerDockTopTitle');
      if (title && !document.documentElement.classList.contains('reader-panel-entry-pending') && getComputedStyle(title).visibility === 'visible') {
        window.__visibleTitles.push(title.textContent.trim());
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (const [action, view, label] of [['find','easyView','찾기'], ['archive','favView','내 보관함']]) {
    await page.goto(base + '/index.html', { waitUntil:'domcontentloaded' });
    await page.locator('.gomna-home-tab[data-ghd-nav="' + action + '"]').click();
    await waitFor(page, id => document.getElementById(id)?.classList.contains('active') && !document.documentElement.classList.contains('reader-panel-entry-pending'), view);
    await waitFor(page, () => window.__visibleTitles.length > 0);
    const observed = await page.evaluate(() => ({ titles:window.__visibleTitles, recoveryHidden:document.getElementById('readerEntryRecovery').hidden, width:document.documentElement.scrollWidth, viewport:innerWidth }));
    assert(observed.recoveryHidden, 'normal entry must remove recovery controls');
    assert(observed.titles.every(title => title === label), action + ': wrong heading flashed');
    assert(observed.width <= observed.viewport + 1, action + ': horizontal overflow');
    await page.goBack({ waitUntil:'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('gomna-route-leaving')), false);
    results.push({ case:'normal ' + action + ' and Back', passed:true });
  }
  await page.locator('.gomna-home-tab[data-ghd-nav="bible"]').click();
  await waitFor(page, () => document.getElementById('homeBiblePickerOverlay')?.classList.contains('is-ready'));
  assert(await page.locator('#homeBiblePickerRecovery').isHidden());
  await page.goBack();
  await waitFor(page, () => document.getElementById('homeBiblePickerOverlay').hidden);
  results.push({ case:'normal Bible and Back', passed:true, pageErrors:errors });
  assert.deepEqual(errors, [], 'normal routes must not throw JavaScript errors');
  await context.close();
}
async function stalledPicker() {
  let attempt = 0, secondRoute, releaseSecondRoute;
  const secondRouteRequested = new Promise(resolve => { releaseSecondRoute = resolve; });
  const { context, page } = await contextWith((route, url) => {
    if (url.pathname === '/reader.html' && url.searchParams.get('source') === 'home-bible-picker') {
      attempt++;
      if (attempt === 1) return route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Intentionally no ready message</title>' });
      if (attempt === 2) { secondRoute = route; releaseSecondRoute(); return; }
    }
    return route.continue();
  });
  await page.goto(base + '/index.html', { waitUntil:'domcontentloaded' });
  await page.locator('.gomna-home-tab[data-ghd-nav="bible"]').click();
  await page.locator('.home-picker-close').waitFor({ state:'visible' });
  await page.evaluate(() => { window.__oldPickerWindow = document.getElementById('homeBiblePickerFrame').contentWindow; });
  await page.locator('[data-picker-retry]').waitFor({ state:'visible', timeout:7500 });
  const history = await page.evaluate(() => window.history.length);
  await page.locator('[data-picker-retry]').click();
  assert.equal(await page.evaluate(() => window.history.length), history, 'retry must not add a Back entry');
  await page.evaluate(() => {
    dispatchEvent(new MessageEvent('message', { origin:location.origin, source:window.__oldPickerWindow, data:{source:'gomna-home-bible-picker',action:'ready'} }));
    dispatchEvent(new MessageEvent('message', { origin:location.origin, source:document.getElementById('homeBiblePickerFrame').contentWindow, data:{source:'gomna-home-bible-picker',action:'ready',requestId:'stale'} }));
  });
  assert.equal(await page.evaluate(() => document.getElementById('homeBiblePickerOverlay').classList.contains('is-ready')), false, 'old frame or token cannot reveal new frame');
  await Promise.race([secondRouteRequested, new Promise((_, reject) => {
    const timeout = setTimeout(() => reject(new Error('new frame did not request its own document')), 5000);
    secondRouteRequested.then(() => clearTimeout(timeout));
  })]);
  assert(secondRoute, 'new frame must request its own document');
  await secondRoute.continue();
  await waitFor(page, () => document.getElementById('homeBiblePickerOverlay').classList.contains('is-ready'));
  await page.goBack();
  await waitFor(page, () => document.getElementById('homeBiblePickerOverlay').hidden);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('home-bible-picker-open')), false);
  results.push({ case:'stalled picker, retry, stale response rejected, ready, Back', passed:true });
  await context.close();
}
async function stalledReader() {
  let block = true, documents = 0;
  const held = [];
  const { context, page } = await contextWith((route, url) => {
    if (url.pathname === '/reader.html') documents++;
    if (block && url.pathname === '/js/gomna-screen-transition.js') { held.push(route); return; }
    return route.continue();
  });
  await page.goto(base + '/reader.html?easy=1', { waitUntil:'commit' });
  await page.locator('#readerEntryRecovery').waitFor({ state:'visible', timeout:3000 });
  assert(await page.locator('#readerEntryBack').isVisible());
  await page.locator('#readerEntryRetry').waitFor({ state:'visible', timeout:7000 });
  assert.equal(await page.evaluate(() => {
    const b = document.getElementById('readerEntryRetry').getBoundingClientRect();
    return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.id;
  }), 'readerEntryRetry', 'recovery must be above every pending backdrop');
  await page.evaluate(() => { window.GOMNA_AUDIO_ENGINE = {getState:() => ({isPlaying:true})}; });
  await page.locator('#readerEntryRetry').click();
  assert.equal(documents, 1, 'active audio must block document retry');
  assert.match(await page.locator('#readerEntryMessage').textContent(), /재생 중|작성 중/);
  await page.evaluate(() => { window.GOMNA_AUDIO_ENGINE = {getState:() => ({})}; });
  block = false;
  await page.locator('#readerEntryRetry').click();
  for (const route of held) await route.abort().catch(() => {});
  await waitFor(page, () => document.getElementById('easyView')?.classList.contains('active') && !document.documentElement.classList.contains('reader-panel-entry-pending'));
  assert.equal(documents, 2);
  assert(await page.locator('#readerEntryRecovery').isHidden());
  results.push({ case:'blocked dependency, visible controls, audio guard, explicit retry recovers', passed:true });
  await context.close();
}
(async () => {
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
    await normalRoutes();
    await stalledPicker();
    await stalledReader();
    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
