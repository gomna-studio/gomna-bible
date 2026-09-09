'use strict';
const assert = require('assert');
const path = require('path');
const DAILY = require(path.resolve(__dirname, '../../js/gomna-daily-verses.js'));
const createMailApi = require('../push/mail.cjs');

const mail = createMailApi({
  root: path.resolve(__dirname, '../..'),
  daily: DAILY,
  json: function () {},
  readBody: async function () { return {}; },
  env: { MAIL_APP_ORIGIN: 'https://gomnastudio.com' }
});

assert.strictEqual(mail.normalizeEmail('  Foo.Bar+1@Gmail.COM '), 'foo.bar+1@gmail.com');
assert.strictEqual(mail.normalizeEmail('not-an-email'), '');
assert.strictEqual(mail.normalizeEmail(''), '');

const a = DAILY.resolveVerse({ date: '2026-09-09', locale: 'ko' });
const built = mail.todayMail('https://gomnastudio.com', 'reader@example.com', 'ko', '2026-09-09');
assert.strictEqual(a.canonicalRef, '로마서 8:38-39');
assert.ok(built.html.indexOf('로마서 8:38-39') !== -1);
assert.ok(built.html.indexOf('source=home-today') !== -1);
assert.ok(built.html.indexOf('book=') !== -1);
assert.ok(built.html.indexOf('수신 해지') !== -1);
assert.ok(built.html.indexOf('은혜의말씀에서 보기') !== -1);
assert.strictEqual(built.verse.canonicalRef, a.canonicalRef);

const test = mail.testMail();
assert.strictEqual(test.subject, '은혜의말씀 이메일 테스트');
assert.ok(test.text.indexOf('연결이 완료되었습니다') !== -1);

console.log('today-word-mail.test ok', a.canonicalRef);
