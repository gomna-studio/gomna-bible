import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production helper shared by actual people/story result tiles and
// detail pages, including stalled decode and navigation before image completion.
const source = fs.readFileSync(new URL('../js/gomna-bible-library.js', import.meta.url), 'utf8');
const start = source.indexOf('  function revealWithImage(');
const end = source.indexOf('  function route()', start);
assert.ok(start >= 0 && end > start);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ mode = 'decode', complete = false, width = 0 } = {}) {
  const pending = deferred();
  const image = { hidden: false, style: {}, complete, naturalWidth: width };
  if (mode === 'decode') image.decode = () => pending.promise;
  if (mode === 'throws') image.decode = () => { throw new Error('decoder unavailable'); };
  const busy = new Map();
  const container = {
    isConnected: true, style: {}, image,
    controls: [{ disabled: false }, { disabled: false }],
    contains: node => node === container.image,
    setAttribute: (name, value) => busy.set(name, value),
    removeAttribute: name => busy.delete(name)
  };
  const timers = new Map(), frames = [];
  let nextId = 0;
  const context = {
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => frames.push(callback)
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.revealWithImage(container, image);
  return {
    container, image, busy, timers, frames,
    success() { image.naturalWidth = 128; pending.resolve(); },
    failure() { pending.reject(new Error('image unavailable')); },
    timeout() {
      const [id, timer] = [...timers][0] || [];
      assert.ok(timer, 'a stalled image has a finite deadline');
      assert.equal(timer.delay, 1500);
      timers.delete(id);
      timer.callback();
    },
    frame() { while (frames.length) frames.shift()(); },
    async flush() { await new Promise(setImmediate); this.frame(); }
  };
}

let count = 0;
async function test(name, callback) { await callback(); count++; }

await test('healthy portrait and its text reveal together after decode', async () => {
  const f = fixture();
  assert.equal(f.container.style.visibility, 'hidden');
  assert.equal(f.busy.get('aria-busy'), 'true');
  f.success();
  await f.flush();
  assert.equal(f.container.style.visibility, '');
  assert.equal(f.image.hidden, false);
  assert.equal(f.image.style.display, '');
  assert.equal(f.busy.has('aria-busy'), false);
  assert.equal(f.timers.size, 0);
});

await test('a never-settling image cannot leave people/story controls blank indefinitely', async () => {
  const f = fixture();
  f.timeout();
  f.frame();
  assert.equal(f.container.style.visibility, '');
  assert.equal(f.image.hidden, true);
  assert.equal(f.image.style.display, 'none');
  assert.equal(f.busy.has('aria-busy'), false);
  assert.ok(f.container.controls.every(control => !control.disabled));
});

await test('late image can join its own already-readable text after timeout', async () => {
  const f = fixture();
  f.timeout();
  f.frame();
  f.success();
  await f.flush();
  assert.equal(f.container.style.visibility, '');
  assert.equal(f.image.hidden, false);
  assert.equal(f.image.style.display, '');
});

await test('load failure reveals content and keeps remaining controls usable', async () => {
  const f = fixture();
  f.failure();
  await f.flush();
  assert.equal(f.container.style.visibility, '');
  assert.equal(f.image.hidden, true);
  assert.equal(f.busy.has('aria-busy'), false);
  assert.equal(f.timers.size, 0);
  assert.ok(f.container.controls.every(control => !control.disabled));
});

await test('synchronous decode exception recovers instead of breaking the library click handler', async () => {
  const f = fixture({ mode: 'throws' });
  await f.flush();
  assert.equal(f.container.style.visibility, '');
  assert.equal(f.image.hidden, true);
  assert.equal(f.timers.size, 0);
});

await test('fallback for browsers without decode handles cached success and cached error', async () => {
  for (const width of [128, 0]) {
    const f = fixture({ mode: 'fallback', complete: true, width });
    await f.flush();
    assert.equal(f.container.style.visibility, '');
    assert.equal(f.image.hidden, width === 0);
    assert.equal(f.timers.size, 0);
  }
});

await test('fallback load/error callbacks reveal the current page once', async () => {
  for (const success of [true, false]) {
    const f = fixture({ mode: 'fallback' });
    assert.equal(f.container.style.visibility, 'hidden');
    f.image.naturalWidth = success ? 128 : 0;
    f.image[success ? 'onload' : 'onerror']();
    await f.flush();
    assert.equal(f.container.style.visibility, '');
    assert.equal(f.image.hidden, !success);
  }
});

await test('navigating back or filtering results prevents a detached image completion from revealing stale content', async () => {
  const f = fixture();
  f.container.isConnected = false;
  f.success();
  await f.flush();
  assert.equal(f.container.style.visibility, 'hidden');
  assert.equal(f.image.style.display, undefined);
  assert.equal(f.frames.length, 0);
  assert.equal(f.timers.size, 0);
});

await test('a replaced image cannot release a newer person/story container', async () => {
  const f = fixture();
  f.container.image = { naturalWidth: 0 };
  f.success();
  await f.flush();
  assert.equal(f.container.style.visibility, 'hidden');
  assert.equal(f.image.style.display, undefined);
  assert.equal(f.timers.size, 0);
});

await test('navigation after decode but before its paint frame also rejects stale reveal', async () => {
  const f = fixture();
  f.success();
  await new Promise(setImmediate);
  assert.equal(f.frames.length, 1);
  f.container.isConnected = false;
  f.frame();
  assert.equal(f.container.style.visibility, 'hidden');
});

await test('an obsolete deadline cannot reveal a removed tile', async () => {
  const f = fixture();
  f.container.isConnected = false;
  f.timeout();
  f.frame();
  assert.equal(f.container.style.visibility, 'hidden');
  assert.equal(f.image.style.display, undefined);
});

console.log('PASS active library image readiness: ' + count + ' load/failure/deadline/navigation cases');
