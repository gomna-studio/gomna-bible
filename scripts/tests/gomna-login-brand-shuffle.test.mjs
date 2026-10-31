import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/gomna-login-brand-shuffle.js', import.meta.url), 'utf8');

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    }
  };
}

function element(attributes = {}) {
  const names = new Set();
  return Object.assign(target(), {
    style: {}, textContent: '', offsetWidth: 200,
    getAttribute: name => attributes[name],
    classList: {
      add: (...values) => values.forEach(value => names.add(value)),
      remove: (...values) => values.forEach(value => names.delete(value)),
      contains: value => names.has(value),
      toggle: (value, force) => force ? names.add(value) : names.delete(value)
    }
  });
}

function fixture({ reduced = false, hidden = false, order = [1, 2, 3] } = {}) {
  let now = 0, id = 0, open = false;
  const timers = new Map(), observers = [];
  const cards = order.map(number => element({ 'data-brand-card': String(number), 'data-brand-caption': `caption-${number}` }));
  const dots = [element(), element(), element()];
  const visual = element(), lead = element(), overlay = element(), dotsWrap = element();
  visual.querySelectorAll = () => cards;
  dotsWrap.querySelectorAll = () => dots;
  overlay.getClientRects = () => open ? [{}] : [];
  const elements = { loginBrandVisual: visual, loginBrandLead: lead, loginModal: overlay, loginBrandDots: dotsWrap };
  const document = Object.assign(target(), { readyState: 'complete', hidden, getElementById: id => elements[id] });
  function setTimeout(fn, ms) { const key = ++id; timers.set(key, { at: now + ms, fn }); return key; }
  function clearTimeout(key) { timers.delete(key); }
  function MutationObserver(fn) { this.observe = () => observers.push(fn); }
  const window = Object.assign(target(), {
    setTimeout, clearTimeout, MutationObserver,
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: fn => setTimeout(fn, 0)
  });
  vm.runInNewContext(source, { window, document, MutationObserver });
  function advance(ms) {
    const end = now + ms;
    for (let n = 0; n < 1000; n++) {
      const task = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!task) { now = end; return; }
      now = task[1].at; timers.delete(task[0]); task[1].fn();
    }
    throw new Error('timer loop did not settle');
  }
  return {
    api: window.GomnaLoginBrandShuffle, lead, cards, dots, visual, timers, advance,
    setOpen(value) { open = value; observers.forEach(fn => fn()); advance(0); },
    setHidden(value) { document.hidden = value; document.dispatch('visibilitychange'); advance(0); },
    setReduced(value) { reduced = value; },
    pagehide() { window.dispatch('pagehide'); advance(0); },
    pageshow() { window.dispatch('pageshow'); advance(0); },
    dot(index) { dots[index].dispatch('click', { preventDefault() {} }); advance(0); },
    swipe(dx, dy = 0) {
      visual.dispatch('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
      visual.dispatch('touchend', { changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
      advance(0);
    }
  };
}

test('closed modal has no autoplay timer; normal motion keeps the four-second hold and 800ms caption delay', () => {
  const f = fixture();
  f.advance(0);
  assert.equal(f.timers.size, 0);
  f.setOpen(true); f.advance(3999); assert.equal(f.api.current(), 0);
  f.advance(1); assert.equal(f.api.current(), 1); assert.equal(f.lead.textContent, 'caption-1');
  f.advance(800); assert.equal(f.lead.textContent, 'caption-2');
  f.advance(3999); assert.equal(f.api.current(), 1);
  f.advance(1); assert.equal(f.api.current(), 2);
});

test('the explicitly requested smooth logo shuffle retains 800ms movement even with reduced motion enabled', () => {
  const f = fixture({ reduced: true });
  f.setOpen(true); f.advance(4000);
  assert.equal(f.api.current(), 1); assert.equal(f.lead.textContent, 'caption-1');
  assert.equal(f.dots[0].classList.contains('is-on'), true);
  f.advance(799); assert.equal(f.lead.textContent, 'caption-1');
  f.advance(1); assert.equal(f.lead.textContent, 'caption-2');
  assert.equal(f.dots[1].classList.contains('is-on'), true);
  f.advance(3999); assert.equal(f.api.current(), 1);
  f.advance(1); assert.equal(f.api.current(), 2); assert.equal(f.lead.textContent, 'caption-2');
  f.advance(800); assert.equal(f.lead.textContent, 'caption-3');
});

test('changing the system preference mid-shuffle does not shorten or restart this component timing', () => {
  const f = fixture({ reduced: true });
  f.setOpen(true); f.advance(4200); f.setReduced(false);
  assert.equal(f.lead.textContent, 'caption-1');
  f.advance(600); assert.equal(f.lead.textContent, 'caption-2');
  f.advance(3999); assert.equal(f.api.current(), 1);
  f.setReduced(true); f.advance(1);
  assert.equal(f.api.current(), 2);
  assert.equal(f.lead.textContent, 'caption-2');
  f.advance(800); assert.equal(f.lead.textContent, 'caption-3');
});

test('close cancels pending work; reopening resets the first card even when DOM order differs', () => {
  const f = fixture({ order: [2, 3, 1] });
  f.setOpen(true); f.advance(4200); f.setOpen(false);
  assert.equal(f.timers.size, 0); f.advance(10000); assert.equal(f.api.current(), 1);
  f.setOpen(true); assert.equal(f.api.current(), 0); assert.equal(f.lead.textContent, 'caption-1');
  assert.equal(f.visual.classList.contains('is-instant'), false, 'only initial reset disables movement');
  assert.equal(f.cards[2].classList.contains('login-brand-card--slot-center'), true);
  f.advance(4000); assert.equal(f.api.current(), 1);
});

test('hidden tabs pause and resume with a fresh hold, including an initially hidden page', () => {
  const f = fixture();
  f.setOpen(true); f.advance(2000); f.setHidden(true);
  assert.equal(f.timers.size, 0); f.advance(20000); assert.equal(f.api.current(), 0);
  f.setHidden(false); f.advance(3999); assert.equal(f.api.current(), 0);
  f.advance(1); assert.equal(f.api.current(), 1);
  const initiallyHidden = fixture({ hidden: true });
  initiallyHidden.setOpen(true); initiallyHidden.advance(10000); assert.equal(initiallyHidden.api.current(), 0);
  initiallyHidden.setHidden(false); initiallyHidden.advance(4000); assert.equal(initiallyHidden.api.current(), 1);
});

test('pagehide pauses BFCache work and pageshow restarts only an open modal', () => {
  const f = fixture(); f.setOpen(true); f.advance(4200); f.pagehide();
  assert.equal(f.timers.size, 0); f.advance(20000); assert.equal(f.api.current(), 1);
  f.pageshow(); f.advance(4000); assert.equal(f.api.current(), 2);
  f.setOpen(false); f.pagehide(); f.pageshow(); f.advance(10000);
  assert.equal(f.timers.size, 0); assert.equal(f.api.current(), 2);
});

test('dots and horizontal swipes retain manual navigation and six-second resume; vertical pan is untouched', () => {
  const f = fixture({ reduced: true }); f.setOpen(true); f.dot(2);
  assert.equal(f.api.current(), 2); f.advance(5999); assert.equal(f.api.current(), 2);
  f.advance(1); assert.equal(f.api.current(), 0);
  f.swipe(-70); assert.equal(f.api.current(), 1); f.swipe(70); assert.equal(f.api.current(), 0);
  f.swipe(45, 80); assert.equal(f.api.current(), 0); f.swipe(20); assert.equal(f.api.current(), 0);
});

test('rapid manual changes synchronize the caption only after the final 800ms move', () => {
  const f = fixture({ reduced: true }); f.setOpen(true); f.dot(2); f.advance(200); f.swipe(70);
  assert.equal(f.api.current(), 1); assert.equal(f.lead.textContent, 'caption-1');
  f.advance(600); assert.equal(f.lead.textContent, 'caption-1', 'the canceled move cannot update the caption early');
  f.advance(200); assert.equal(f.lead.textContent, 'caption-2');
  assert.equal(f.dots[1].classList.contains('is-on'), true);
});
