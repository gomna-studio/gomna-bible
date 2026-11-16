const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('reader.html', 'utf8');
const marker = html.indexOf('var savedConsent = null;');
assert.ok(marker > 0, 'Reader consent controller exists');
const source = html.slice(html.lastIndexOf('<script>', marker) + 8, html.indexOf('</script>', marker));

function setup({ stored, storageBlocked = false, internal = false } = {}) {
  const values = new Map();
  if (stored !== undefined) values.set('cookieChoice', stored);
  const banner = { style: { display: 'none' } };
  const scripts = [], calls = [], listeners = {};
  let explicitConsent;
  const localStorage = {
    getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); values.set(key, value); }
  };
  function allowed() {
    if (internal) return false;
    if (typeof explicitConsent === 'boolean') return explicitConsent;
    try { return JSON.parse(localStorage.getItem('cookieChoice') || 'null')?.analytics === true; }
    catch { return false; }
  }
  const window = {
    addEventListener(name, handler) { (listeners[name] ||= []).push(handler); },
    GomnaAnalyticsControl: { isInternal: () => internal },
    GomnaGa4: {
      allowed,
      start() { calls.push({ action: 'start', allowed: allowed() }); return allowed(); },
      consentChanged(value) { explicitConsent = value; calls.push({ action: 'choice', value }); return allowed(); }
    }
  };
  const document = {
    getElementById: id => id === 'cookie-banner' ? banner : null,
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: node => scripts.push(node) } }]
  };
  const context = vm.createContext({ window, document, localStorage, Date });
  vm.runInContext(source, context);
  return { banner, scripts, calls, values, context, window,
    accept: () => vm.runInContext('acceptAllCookies()', context),
    reject: () => vm.runInContext('rejectCookies()', context),
    clarityCommands: () => Array.from(window.clarity?.q || [], command => Array.from(command)),
    storage: (key, raw) => {
      if (raw === null) values.delete(key); else values.set(key, raw);
      explicitConsent = undefined; // The shared module handles this storage event first.
      (listeners.storage || []).forEach(handler => handler({ key, newValue: raw }));
    }
  };
}

test('missing, malformed and legacy choices show the Reader banner without starting tracking', () => {
  for (const stored of [undefined, '{broken', 'null', '{}', '[]', '{"marketing":false}', '{"analytics":"true"}', '{"analytics":1}']) {
    const page = setup({ stored });
    assert.equal(page.banner.style.display, 'block', String(stored));
    assert.equal(page.scripts.length, 0);
    assert.equal(page.calls.length, 0);
  }
});

test('saved boolean acceptance starts the shared gate and Clarity only once', () => {
  const page = setup({ stored: '{"analytics":true,"marketing":false}' });
  assert.equal(page.banner.style.display, 'none');
  assert.equal(page.scripts.length, 1);
  vm.runInContext('applyConsent({analytics:true});loadAnalytics()', page.context);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.calls.some(call => call.action === 'choice'), false, 'saved choice is not a new explicit grant');
});

test('saved refusal reconciles the shared stop gate without loading Clarity', () => {
  const page = setup({ stored: '{"analytics":false}' });
  assert.equal(page.banner.style.display, 'none');
  assert.deepEqual(page.calls, [{ action: 'start', allowed: false }]);
  assert.equal(page.scripts.length, 0);
});

test('an explicit acceptance is saved and immediately passed to the shared collector', () => {
  const page = setup({ stored: '{}' });
  page.accept();
  assert.equal(JSON.parse(page.values.get('cookieChoice')).analytics, true);
  assert.equal(page.banner.style.display, 'none');
  assert.deepEqual(page.calls.filter(call => call.action === 'choice'), [{ action: 'choice', value: true }]);
  assert.equal(page.scripts.length, 1);
});

test('a same-document refusal immediately reaches the shared collector', () => {
  const page = setup();
  page.accept(); page.reject();
  assert.equal(JSON.parse(page.values.get('cookieChoice')).analytics, false);
  assert.deepEqual(page.calls.filter(call => call.action === 'choice'), [
    { action: 'choice', value: true }, { action: 'choice', value: false }
  ]);
  assert.equal(page.scripts.length, 1, 'refusal does not load another tracker');
});

test('blocked storage preserves a usable choice and forwards only an explicit document-local grant', () => {
  const page = setup({ storageBlocked: true });
  assert.equal(page.banner.style.display, 'block');
  assert.equal(page.calls.length, 0);
  assert.doesNotThrow(() => page.accept());
  assert.equal(page.banner.style.display, 'none');
  assert.equal(page.scripts.length, 1);
  assert.doesNotThrow(() => page.reject());
  assert.deepEqual(page.calls.filter(call => call.action === 'choice').map(call => call.value), [true, false]);
  const nextDocument = setup({ storageBlocked: true });
  assert.equal(nextDocument.banner.style.display, 'block');
  assert.equal(nextDocument.calls.length, 0, 'the next document does not infer consent');
});

test('internal devices remain excluded even after an explicit acceptance', () => {
  const page = setup({ internal: true });
  page.accept();
  assert.equal(page.scripts.length, 0);
});

test('invalid programmatic values do not dismiss the pending choice', () => {
  const page = setup();
  vm.runInContext('saveAndApply({analytics:"true"});applyConsent(null)', page.context);
  assert.equal(page.banner.style.display, 'block');
  assert.equal(page.calls.length, 0);
});

test('Clarity receives analytics consent without implicitly granting marketing', () => {
  const page = setup({ stored: '{"analytics":true,"marketing":false}' });
  const first = page.clarityCommands()[0];
  assert.equal(first[0], 'consentv2');
  assert.equal(first[1].analytics_Storage, 'granted');
  assert.equal(first[1].ad_Storage, 'denied');
});

test('Clarity refusal denies storage and stops collection; reacceptance resumes without reinjecting', () => {
  const page = setup();
  page.accept(); page.reject();
  const commands = page.clarityCommands();
  assert.equal(commands.at(-2)[0], 'consentv2');
  assert.equal(commands.at(-2)[1].analytics_Storage, 'denied');
  assert.equal(commands.at(-2)[1].ad_Storage, 'denied');
  assert.deepEqual(commands.at(-1), ['stop']);
  page.accept();
  assert.deepEqual(page.clarityCommands().at(-1), ['start']);
  assert.equal(page.scripts.length, 1);
});

test('a different tab can grant and revoke consent while Reader stays visible', () => {
  const page = setup();
  page.storage('cookieChoice', '{"analytics":true,"marketing":false}');
  assert.equal(page.banner.style.display, 'none');
  assert.equal(page.scripts.length, 1);
  page.storage('cookieChoice', '{"analytics":false,"marketing":false}');
  assert.equal(page.clarityCommands().filter(command => command[0] === 'stop').length, 1);
  page.storage('cookieChoice', '{}');
  assert.equal(page.banner.style.display, 'block');
  assert.equal(page.scripts.length, 1, 'invalid replacement never reinjects a collector');
});
