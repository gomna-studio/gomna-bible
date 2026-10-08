import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const swSource = read('sw.js');
const homeSource = read('js/gomna-home-feed.js');
const homeHtml = read('index.html');
const release = /const CACHE_VERSION = '([^']+)'/.exec(swSource)[1];
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
const tick = () => new Promise(resolve => setImmediate(resolve));
function sw(fetcher, failCache = false) {
  const buckets = new Map(), handlers = {}, timers = [];
  const key = req => new URL(typeof req === 'string' ? req : req.url, 'https://gomnastudio.com').href;
  const cache = name => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const data = buckets.get(name);
    return {match: async req => data.get(key(req)), put: async (req, value) => data.set(key(req), value)};
  };
  const context = vm.createContext({
    self: {location: {origin: 'https://gomnastudio.com', hostname: 'gomnastudio.com'}, addEventListener: (name, fn) => { handlers[name] = fn; }},
    caches: {open: async name => {if (failCache) throw Error('cache unavailable'); return cache(name);}, match: async req => {
      if (failCache) throw Error('cache unavailable');
      for (const data of buckets.values()) if (data.has(key(req))) return data.get(key(req));
    }},
    fetch: fetcher, URL, Request, Response, AbortController, console,
    setTimeout: (fn, delay) => {const timer = {fn, delay}; timers.push(timer); return timer;}, clearTimeout: () => {}
  });
  vm.runInContext(swSource, context);
  return {context, cache, timers, handlers};
}
function request(path, mode = 'cors') {
  return {url: 'https://gomnastudio.com' + path, method: 'GET', mode, destination: mode === 'navigate' ? 'document' : 'script', headers: new Headers()};
}

await test('uncached slow script remains pending then returns the same successful request', async () => {
  let finish, calls = 0;
  const env = sw(() => {calls++; return new Promise(resolve => {finish = resolve;});});
  const pending = env.context.networkFirst(request('/slow.js?v=1'));
  await tick();
  assert.equal(env.timers.length, 0);
  finish(new Response('late success'));
  assert.equal(await (await pending).text(), 'late success');
  assert.equal(calls, 1);
});
await test('cached home returns at the fallback deadline while network is stalled', async () => {
  const env = sw(() => new Promise(() => {}));
  await env.cache('current').put('/index.html', new Response('cached home'));
  const pending = env.context.networkFirst(request('/?source=pwa', 'navigate'), '/index.html', 1200);
  await tick();
  assert.equal(env.timers[0].delay, 1200);
  env.timers[0].fn();
  assert.equal(await (await pending).text(), 'cached home');
});
await test('home HTTP error uses cache, unrelated missing route remains 404', async () => {
  const env = sw(async () => new Response('not found', {status: 404}));
  await env.cache('current').put('/index.html', new Response('cached home'));
  assert.equal(await (await env.context.networkFirst(request('/'), '/index.html')).text(), 'cached home');
  assert.equal((await env.context.networkFirst(request('/missing.html'))).status, 404);
});
await test('current exact version cache serves without a network round trip', async () => {
  let calls = 0;
  const env = sw(async () => {calls++; return new Response('network');});
  await env.cache('gomna-static-' + release).put('/app.js?v=current', new Response('current asset'));
  assert.equal(await (await env.context.versionedAppAsset(request('/app.js?v=current'))).text(), 'current asset');
  assert.equal(calls, 0);
  assert.equal(await (await env.context.versionedAppAsset(request('/app.js?v=new'))).text(), 'network');
  assert.equal(calls, 1);
});
await test('unavailable Cache API does not discard a successful network response', async () => {
  const env = sw(async () => new Response('online'), true);
  assert.equal(await (await env.context.versionedAppAsset(request('/app.js?v=1'))).text(), 'online');
});
await test('known retired shortcuts preserve query/hash; other paths stay 404', () => {
  const code = /<script>([\s\S]*?)<\/script>/.exec(read('404.html'))[1];
  for (const pathname of ['/index_new.html','/gomna-bible','/gomna-bible/','/gomna-bible/index.html','/gomna-bible/index_new.html']) {
    let destination;
    vm.runInNewContext(code, {location: {pathname, search: '?book=genesis&chapter=1', hash: '#verse-2', replace: value => {destination = value;}}});
    assert.equal(destination, '/index.html?book=genesis&chapter=1#verse-2');
  }
  for (const pathname of ['/index.html','/','/missing','/gomna-bible/unrelated.html']) {
    vm.runInNewContext(code, {location: {pathname, replace: () => {assert.fail('unexpected redirect');}}});
  }
});
function imageHarness() {
  const images = [], timers = [];
  const context = vm.createContext({homeImageCache: {}, Promise, window: {
    setTimeout: fn => {timers.push(fn); return timers.length;}, clearTimeout: () => {}
  }, Image: class {constructor(){images.push(this);} decode(){return Promise.resolve();}}});
  vm.runInContext(homeSource.slice(homeSource.indexOf('  function ensureHomeImageReady('), homeSource.indexOf('  function cardOpenImage(')), context);
  return {context, images, timers};
}
await test('image ready only after decode; duplicate requests share one download', async () => {
  const env = imageHarness(); let decode;
  const pending = env.context.ensureHomeImageReady('hero.webp', 'high');
  assert.equal(env.context.ensureHomeImageReady('hero.webp', 'low'), pending);
  env.images[0].decode = () => new Promise(resolve => {decode = resolve;});
  env.images[0].onload();
  assert.equal(env.context.isHomeImageReady('hero.webp'), false);
  decode(); assert.equal(await pending, true);
  assert.equal(env.images.length, 1);
});
await test('image deadline releases wait and late success restores readiness', async () => {
  const env = imageHarness();
  const pending = env.context.ensureHomeImageReady('slow.webp', 'high');
  env.timers[0](); assert.equal(await pending, false);
  env.images[0].onload(); await tick();
  assert.equal(env.context.isHomeImageReady('slow.webp'), true);
  assert.equal(await env.context.ensureHomeImageReady('slow.webp','high'), true);
  assert.doesNotMatch(read('js/gomna-home-feed.css'), /ghd-image-failed[^}]*background-image/);
});
await test('hung decode also releases wait; normal home boot does not wait for DOMContentLoaded', async () => {
  const env = imageHarness();
  const pending = env.context.ensureHomeImageReady('decode.webp', 'high');
  env.images[0].decode = () => new Promise(() => {});
  env.images[0].onload(); env.timers[0](); assert.equal(await pending, false);
  const boot = homeSource.slice(homeSource.indexOf("  if(document.getElementById('gomnaHomeFeed')"), homeSource.lastIndexOf('})();'));
  let initialized = 0;
  vm.runInNewContext(boot, {init: () => initialized++, document: {readyState: 'loading', getElementById: () => ({}), addEventListener: () => assert.fail('blocked by DCL')}});
  assert.equal(initialized, 1);
});
await test('releases stay coherent and first image has early high priority', () => {
  for (const path of ['index.html','reader.html','meditation.html']) {
    assert.equal(/data-release="([^"]+)"/.exec(read(path))[1], release);
  }
  const hero = /<link rel="preload" as="image"[^>]+fetchpriority="high">/.exec(homeHtml);
  assert.ok(hero && hero.index < homeHtml.indexOf('<script src='));
  assert.equal((homeHtml.match(/<link rel="preload" as="image"/g) || []).length, 1);
  assert.match(read('js/gomna-coffee-steam.css'), /meditation-coffee\.png\?v=20261007-coffee-v1/);
  assert.match(homeSource.split('\n').find(line => line.includes('var BASE_CARD_IMAGES=')), /bible-discovery-journey-v5\.webp/);
});
console.log(`${passed} startup regression groups passed`);
