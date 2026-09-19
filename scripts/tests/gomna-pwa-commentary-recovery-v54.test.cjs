const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('home commentary can never keep the installed app permanently covered', () => {
  assert.match(reader, /__gomnaHomeCommentaryRecovery/);
  assert.match(reader, /setTimeout\(window\.__gomnaHomeCommentaryRecovery,5000\)/);
  assert.match(reader, /classList\.remove\('gomna-home-commentary-loading'\)/);
  assert.match(reader, /classList\.remove\('scripture-entry-pending'\)/);
});

test('the five-second watchdog actually reveals a simulated stuck iPhone page', () => {
  const match = reader.match(/<script>(\/\* v72: reader\.html always uses official dock \*\/[\s\S]*?)<\/script>/);
  assert.ok(match, 'early reader boot script must exist');

  const classes = new Set();
  const attributes = new Map();
  const timers = [];
  const pageshow = [];
  const rootElement = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attributes.set(name, value); }
  };
  const sandbox = {
    URLSearchParams,
    location: {
      search: '?book=%EC%8B%9C%ED%8E%B8&chapter=119&verse=105&commentary=1&source=home-card-commentary'
    },
    document: { documentElement: rootElement },
    window: {
      setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
      addEventListener(name, fn) { if (name === 'pageshow') pageshow.push(fn); }
    }
  };

  vm.runInNewContext(match[1], sandbox);
  assert.equal(classes.has('gomna-home-commentary-loading'), true);
  assert.equal(classes.has('scripture-entry-pending'), true);
  const watchdog = timers.find((item) => item.delay === 5000);
  assert.ok(watchdog, 'five-second recovery timer must be registered');
  watchdog.fn();
  assert.equal(classes.has('gomna-home-commentary-loading'), false);
  assert.equal(classes.has('scripture-entry-pending'), false);
  assert.equal(attributes.get('data-gomna-commentary-recovered'), '1');
  assert.equal(pageshow.length, 1);
});

test('a restored iPhone standalone page receives the same recovery', () => {
  assert.match(reader, /addEventListener\('pageshow'/);
  assert.match(reader, /ev&&ev\.persisted/);
});

test('normal commentary still clears the watchdog and uses the existing reveal path', () => {
  assert.match(reader, /clearTimeout\(window\.__gomnaHomeCommentaryRecoveryTimer\)/);
  assert.match(reader, /if\(typeof window\.__gomnaRevealScriptureEntry==='function'\)window\.__gomnaRevealScriptureEntry\(\)/);
  assert.match(reader, /function revealHomeCommentary\(\)/);
});

test('v54 uses the safe service worker update path without forced client navigation', () => {
  assert.match(index, /sw\.js\?v=2026-09-19-pwa-commentary-recovery-v54/);
  assert.match(reader, /sw\.js\?v=2026-09-19-pwa-commentary-recovery-v54/);
  assert.match(sw, /const CACHE_VERSION = '2026-09-19-pwa-commentary-recovery-v54'/);
  assert.doesNotMatch(sw, /\.then\(\(\) => refreshInstalledAppClients\(\)\)/);
  assert.doesNotMatch(sw, /cache\.add\('\/audio\/audio-manifest\.json'\)/);
});
