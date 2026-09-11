import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function load(rel, sandbox) {
  const file = path.join(root, rel);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

function makeSandbox(auth) {
  const mem = {};
  const sandbox = {
    console,
    Date,
    Intl,
    JSON,
    String,
    Object,
    Number,
    Array,
    Math,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem(k, v) { mem[k] = String(v); },
      removeItem(k) { delete mem[k]; }
    },
    GomnaAuth: auth || {
      isSignedIn() { return false; },
      getAccount() { return null; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  load('js/gomna-daily-verses.js', sandbox);
  load('js/gomna-meditation-data.js', sandbox);
  load('js/gomna-meditation-store.js', sandbox);
  sandbox.__mem = mem;
  return sandbox;
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x) => (x < 10 ? '0' : '') + x;
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
}

test('daily verse matches GomnaDailyVerses for the same local date', () => {
  const s = makeSandbox();
  const date = s.GomnaMeditationData.localDateKey();
  const daily = s.GomnaDailyVerses.resolveVerse({ date, locale: 'ko' });
  const model = s.GomnaMeditationData.resolve({ date });
  assert.equal(model.canonicalRef, daily.canonicalRef);
  assert.equal(model.verseText, daily.body);
  assert.equal(model.verseRef, daily.refText);
});

test('theme images are the approved Home Card2 files, not untracked v8/v9 drafts', () => {
  const s = makeSandbox();
  const imgs = s.GomnaMeditationData.THEME_IMGS;
  const expected = {
    new: 'v5-card-new-life.png',
    prayer: 'v10-card-prayer-life.png',
    blessed: 'v12-card-blessed-life.png',
    faith: 'v6-card-faith-life.png',
    love: 'v10-card-love-life.png',
    wisdom: 'v5-card-wisdom-life.png',
    hope: 'v11-card-hope-life.png'
  };
  for (const id of s.GomnaMeditationData.THEME_ORDER) {
    assert.match(imgs[id], new RegExp(expected[id]));
    assert.equal(imgs[id].includes('v8-card'), false);
    assert.equal(imgs[id].includes('v9-card'), false);
  }
});

test('completion counts a date once and never uses fake totals', () => {
  const s = makeSandbox();
  const Store = s.GomnaMeditationStore;
  const first = Store.completeDay('2026-01-02', { title: 'a', verseRef: '시편 23:1' });
  assert.equal(first.added, true);
  assert.equal(first.total, 1);
  const again = Store.completeDay('2026-01-02', { title: 'a' });
  assert.equal(again.added, false);
  assert.equal(again.total, 1);
  Store.completeDay('2026-01-03', { title: 'b' });
  assert.equal(Store.totalDays(), 2);
});

test('guest notes do not leak into a signed-in namespace', () => {
  const s = makeSandbox();
  s.GomnaMeditationStore.saveNote('2026-01-04', 'guest only heart');
  s.GomnaMeditationStore.completeDay('2026-01-04', { note: 'guest only heart' });
  assert.equal(s.GomnaMeditationStore.namespace(), 'guest');
  assert.equal(s.GomnaMeditationStore.notesList()[0].note, 'guest only heart');

  s.GomnaAuth = {
    isSignedIn() { return true; },
    getAccount() { return { id: 'user-aaa' }; }
  };
  assert.equal(s.GomnaMeditationStore.namespace(), 'user:user-aaa');
  assert.equal(s.GomnaMeditationStore.totalDays(), 0);
  assert.equal(s.GomnaMeditationStore.notesList().length, 0);
});

test('badge thresholds unlock by cumulative days', () => {
  const s = makeSandbox();
  const Store = s.GomnaMeditationStore;
  let cursor = '2025-01-01';
  const need = [1, 7, 30, 50, 100, 200, 365];
  const names = ['첫걸음', '머무름', '동행', '깊어짐', '뿌리내림', '자라남', '열매'];
  let added = 0;
  for (let i = 0; i < 365; i++) {
    Store.completeDay(addDays(cursor, i), { title: 'd' + i });
    added += 1;
    const idx = need.indexOf(added);
    if (idx !== -1) {
      const info = Store.badgeForTotal(Store.totalDays());
      assert.equal(info.current.name, names[idx]);
      assert.equal(info.current.days, need[idx]);
    }
  }
  assert.equal(Store.totalDays(), 365);
  assert.equal(Store.badgeForTotal(365).next, null);
});

test('corrupt JSON does not throw and falls back empty', () => {
  const s = makeSandbox();
  s.localStorage.setItem('gomna.meditation.v1:guest', '{not json');
  assert.equal(s.GomnaMeditationStore.totalDays(), 0);
  const rec = s.GomnaMeditationStore.saveNote('2026-02-01', 'ok');
  assert.equal(rec.note, 'ok');
});

test('saveNote does not mark the day complete', () => {
  const s = makeSandbox();
  s.GomnaMeditationStore.saveNote('2026-03-01', 'thinking');
  const rec = s.GomnaMeditationStore.dayRecord('2026-03-01');
  assert.equal(rec.note, 'thinking');
  assert.equal(rec.meditationCompleted, false);
  assert.equal(s.GomnaMeditationStore.totalDays(), 0);
});

test('non-consecutive days keep cumulative total', () => {
  const s = makeSandbox();
  const Store = s.GomnaMeditationStore;
  Store.completeDay('2026-04-01', { title: 'a' });
  Store.completeDay('2026-04-05', { title: 'b' });
  Store.completeDay('2026-04-05', { title: 'b-again' });
  assert.equal(Store.totalDays(), 2);
});

test('badge assets are the approved PNGs on disk', () => {
  const s = makeSandbox();
  const need = {
    first: 'badge-001-first-step.png',
    stay: 'badge-007-stay.png',
    walk: 'badge-030-companion.png',
    deep: 'badge-050-deeper.png',
    root: 'badge-100-rooted.png',
    grow: 'badge-200-growing.png',
    fruit: 'badge-365-fruit.png'
  };
  for (const b of s.GomnaMeditationStore.BADGES) {
    assert.match(b.image, new RegExp(need[b.id]));
    assert.equal(fs.existsSync(path.join(root, b.image)), true);
  }
});

test('meditation UI does not touch Home, SW, or a new audio engine', () => {
  const ui = fs.readFileSync(path.join(root, 'js/gomna-meditation.js'), 'utf8');
  assert.equal(ui.includes('audio-engine'), false);
  assert.equal(ui.includes('new Audio'), false);
  assert.equal(ui.includes('serviceWorker'), false);
  assert.equal(ui.includes('gomna-home-feed'), false);
});

test('listen and commentary reuse Home reader query for the selected verse', () => {
  const s = makeSandbox();
  const model = s.GomnaMeditationData.resolve({ date: '2026-09-10' });
  const listen = s.GomnaMeditationData.readerUrl(model, 'listen');
  const commentary = s.GomnaMeditationData.readerUrl(model, 'commentary');
  const read = s.GomnaMeditationData.readerUrl(model, 'read');
  assert.ok(model.book);
  assert.ok(model.chapter);
  assert.ok(model.startVerse);
  assert.match(listen, /reader\.html\?/);
  assert.match(listen, /listen=1/);
  assert.match(listen, /source=home-card-listen/);
  assert.match(listen, new RegExp('book=' + encodeURIComponent(model.book)));
  assert.match(listen, new RegExp('chapter=' + String(model.chapter)));
  assert.match(commentary, /commentary=1/);
  assert.match(commentary, /source=home-card-commentary/);
  assert.match(commentary, new RegExp('book=' + encodeURIComponent(model.book)));
  assert.match(commentary, new RegExp('verse=' + String(model.startVerse)));
  assert.match(commentary, new RegExp('verseStart=' + String(model.startVerse)));
  assert.equal(commentary.includes('source=meditation'), false);
  assert.match(read, /source=home-daily-read/);
});

test('badge CSS keeps approved color medals (no grayscale washout)', () => {
  const css = fs.readFileSync(path.join(root, 'js/gomna-meditation.css'), 'utf8');
  assert.equal(/grayscale\s*\(/i.test(css), false);
  assert.match(css, /filter:\s*none/);
  const ui = fs.readFileSync(path.join(root, 'js/gomna-meditation.js'), 'utf8');
  assert.match(ui, /preventScroll:\s*true/);
  assert.match(ui, /말씀풀이 더 깊이 보기/);
  assert.match(ui, /calendarBlock\(\)/);
});
