'use strict';
const assert = require('assert');
const path = require('path');
const DAILY = require(path.resolve(__dirname, '../../js/gomna-daily-verses.js'));

const a = DAILY.resolveVerse({ date: '2026-09-09', locale: 'ko' });
const b = DAILY.resolveVerse({ date: '2026-09-10', locale: 'ko' });
assert.strictEqual(a.canonicalRef, '로마서 8:38-39');
assert.strictEqual(b.canonicalRef, '빌립보서 4:13');
assert.notStrictEqual(a.canonicalRef, b.canonicalRef);

const payA = DAILY.buildPayload({ date: '2026-09-09', locale: 'ko' });
const payB = DAILY.buildPayload({ date: '2026-09-10', locale: 'ko' });
assert.strictEqual(payA.title, '오늘의 말씀');
assert.ok(payA.body.indexOf('로마서 8:38-39') === 0);
assert.ok(payB.body.indexOf('빌립보서 4:13') === 0);
assert.strictEqual(payA.data.source, 'home-today');
assert.strictEqual(payA.data.book, '로마서');
assert.strictEqual(payA.data.chapter, 8);
assert.strictEqual(payA.data.startVerse, 38);
assert.strictEqual(payA.data.endVerse, 39);
assert.ok(payA.data.url.indexOf('source=home-today') !== -1);

const en = DAILY.buildPayload({ date: '2026-09-09', locale: 'en' });
assert.strictEqual(en.title, "Today's Word");
assert.ok(en.body.indexOf('Romans 8:38-39') === 0);
assert.strictEqual(DAILY.getVerseForDate('2026-09-09').r, '로마서 8:38-39');
console.log('today-word-push.test ok', a.canonicalRef, '→', b.canonicalRef);
