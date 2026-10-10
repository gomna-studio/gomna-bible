'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/gomna-bible-library.js'), 'utf8');
const init = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();";
assert.ok(source.includes(init));

function fixture(decode) {
  const timers = new Map(), frames = [];
  let id = 0;
  const context = { window: {}, setTimeout(fn, delay) { timers.set(++id, {fn, delay}); return id; },
    clearTimeout(timer) { timers.delete(timer); }, requestAnimationFrame(fn) { frames.push(fn); } };
  vm.runInNewContext(source.replace(init, 'window.revealForTest=revealWithImage;'), context);
  const img = { naturalWidth: 0, hidden: false, style: {}, decode };
  const container = { isConnected: true, style: {}, attrs: {}, contains(node) { return node === img && this.hasImage !== false; },
    setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; } };
  return { img, container, timers, frames, reveal: context.window.revealForTest,
    paint() { for (const fn of frames.splice(0)) fn(); },
    expire() { for (const [timer, value] of [...timers]) { timers.delete(timer); assert.equal(value.delay, 1500); value.fn(); } } };
}
async function microtasks() { await Promise.resolve(); await Promise.resolve(); }

(async () => {
  let resolve;
  const healthy = fixture(() => new Promise(done => { resolve = done; }));
  healthy.reveal(healthy.container, healthy.img);
  assert.equal(healthy.container.style.visibility, 'hidden');
  healthy.img.naturalWidth = 320; resolve(); await microtasks();
  assert.equal(healthy.container.style.visibility, 'hidden', 'photo and text wait for the same frame');
  healthy.paint(); assert.equal(healthy.container.style.visibility, '');
  assert.equal(healthy.img.hidden, false); assert.equal(healthy.timers.size, 0);
  assert.equal(healthy.container.attrs['aria-busy'], undefined);

  let lateResolve;
  const slow = fixture(() => new Promise(done => { lateResolve = done; }));
  slow.reveal(slow.container, slow.img); slow.expire(); slow.paint();
  assert.equal(slow.container.style.visibility, '', 'hung portrait cannot keep story text blank');
  assert.equal(slow.img.hidden, true); assert.equal(slow.img.style.display, 'none');
  slow.img.naturalWidth = 320; lateResolve(); await microtasks(); slow.paint();
  assert.equal(slow.img.hidden, false, 'late valid portrait becomes available');
  assert.equal(slow.img.style.display, '');

  const failed = fixture(() => Promise.reject(new Error('network failure')));
  failed.reveal(failed.container, failed.img); await microtasks(); failed.paint();
  assert.equal(failed.container.style.visibility, ''); assert.equal(failed.img.hidden, true);
  assert.equal(failed.timers.size, 0, 'failed load reveals text without waiting for the deadline');

  const unsupported = fixture(undefined);
  unsupported.img.complete = true;
  unsupported.reveal(unsupported.container, unsupported.img); await microtasks(); unsupported.paint();
  assert.equal(unsupported.container.style.visibility, ''); assert.equal(unsupported.img.hidden, true,
    'already complete broken image is hidden without decode support');

  let staleResolve;
  const stale = fixture(() => new Promise(done => { staleResolve = done; }));
  stale.reveal(stale.container, stale.img);
  stale.container.hasImage = false;
  stale.img.naturalWidth = 320; staleResolve(); await microtasks(); stale.paint();
  assert.equal(stale.container.style.visibility, 'hidden', 'old portrait completion cannot reveal a replacement detail');
  assert.equal(stale.timers.size, 0);

  const removed = fixture(() => new Promise(() => {}));
  removed.reveal(removed.container, removed.img); removed.container.isConnected = false;
  removed.expire(); removed.paint(); assert.equal(removed.frames.length, 0);
  assert.equal(removed.container.style.visibility, 'hidden', 'detached story is not revealed by a stale deadline');
  console.log('PASS image readiness: atomic healthy load, bounded stalled load, late image, failure, no-decode broken image, stale detail and detached timer');
})().catch(error => { console.error(error); process.exitCode = 1; });
