'use strict';
const assert = require('assert');
const PREFS = require('../../js/gomna-push-prefs.js');
const DAILY = require('../../js/gomna-daily-verses.js');

const d = PREFS.defaults({ locale: 'ko', timezone: 'Asia/Seoul' });
assert.strictEqual(d.frequency, 1);
assert.strictEqual(d.firstTime, '07:30');
assert.strictEqual(d.secondTime, '20:30');

const prev = PREFS.normalizePrefs({ frequency: 1, firstTime: '08:00', timezone: 'America/Los_Angeles', locale: 'en' });
const restored = PREFS.normalizePrefs({ enabled: true }, prev);
assert.strictEqual(restored.firstTime, '08:00');
assert.strictEqual(restored.timezone, 'America/Los_Angeles');
assert.strictEqual(restored.frequency, 1);

const twice = PREFS.normalizePrefs({ frequency: 2, firstTime: '07:30', secondTime: '20:30', timezone: 'Asia/Seoul' });
assert.deepStrictEqual(
  PREFS.dueSlots(twice, new Date('2026-09-09T22:30:00Z')),
  ['first']
);
assert.deepStrictEqual(
  PREFS.dueSlots(twice, new Date('2026-09-09T11:30:00Z')),
  ['second']
);
assert.deepStrictEqual(
  PREFS.dueSlots({ frequency: 1, firstTime: '07:30', secondTime: '20:30', timezone: 'Asia/Seoul' }, new Date('2026-09-09T11:30:00Z')),
  []
);

const la = PREFS.normalizePrefs({ frequency: 1, firstTime: '07:30', timezone: 'America/Los_Angeles' });
assert.deepStrictEqual(
  PREFS.dueSlots(la, new Date('2026-09-09T14:30:00Z')),
  ['first']
);
assert.strictEqual(PREFS.localDateKey('America/Los_Angeles', new Date('2026-09-09T14:30:00Z')), '2026-09-09');

const first = DAILY.buildPayload({ date: '2026-09-09', locale: 'ko', slot: 'first' });
const second = DAILY.buildPayload({ date: '2026-09-09', locale: 'ko', slot: 'second' });
assert.strictEqual(first.title, '오늘의 말씀');
assert.strictEqual(second.title, '오늘의 말씀을 다시 묵상해보세요');
assert.ok(first.tag.indexOf('-first') !== -1);
assert.ok(second.tag.indexOf('-second') !== -1);
assert.strictEqual(first.data.source, 'home-today');
assert.notStrictEqual(first.tag, second.tag);

console.log('push-prefs.test ok');
