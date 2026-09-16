'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/gomna-home-feed.js'), 'utf8');

test('email delivery time uses cross-browser AM PM hour minute controls', () => {
  assert.match(html, /id="ghdMailTimeHour"/);
  assert.match(html, /id="ghdMailTimeMinute"/);
  assert.match(html, /data-ghd-mail-period="am"/);
  assert.match(html, /data-ghd-mail-period="pm"/);
  assert.doesNotMatch(html, /id="ghdMailTime"[^>]*type="time"/);
});

test('email subscribe sends exact time and device timezone', () => {
  assert.match(js, /timezone:deviceTimezone\(\)/);
  assert.match(js, /sendTime:sendTime/);
  assert.doesNotMatch(js, /timezone:'Asia\/Seoul'/);
});

test('active subscribers can change time or turn email off on one screen', () => {
  assert.match(html, /id="ghdMailSaveTime"[^>]*>수신 시간 저장/);
  assert.match(html, /id="ghdMailOff"[^>]*>이메일 수신 끄기/);
  assert.match(js, /mailSaveTime\.addEventListener\('click',saveMailTime\)/);
});

test('email card preserves its structure, uses the app icon, and has no close control', () => {
  const start = html.indexOf('id="ghdMailSheet"');
  const end = html.indexOf('id="ghdCommentSheet"', start);
  const mail = html.slice(start, end);
  assert.match(mail, /class="ghd-mail-app-icon"[^>]*src="app-icon-180\.png/);
  assert.doesNotMatch(mail, /home-thumbnail-bible-gold/);
  assert.doesNotMatch(mail, /📖|📚|📕/);
  assert.doesNotMatch(mail, /data-ghd-sheet-close|aria-label="닫기"|>×<|>X</);
});

test('email card closes when the empty backdrop is tapped', () => {
  assert.match(js, /var isBackdrop=ev\.target===sheet/);
  assert.match(js, /if\(!isBackdrop\)return/);
  assert.match(js, /closeSheet\(sheet\.id, 'backdrop'\)/);
  assert.match(js, /panel\.addEventListener\('click',[\s\S]*?ev\.stopPropagation\(\)/);
});

test('mail status restores server delivery time', () => {
  assert.match(js, /showMailState\(true, saved, body\.sendTime\)/);
  assert.match(js, /writeMailTime\(body\.sendTime\|\|sendTime\)/);
});

test('service worker cache and script URL are bumped together', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /2026-09-16-mail-delivery-time-v4/);
  assert.match(html, /gomna-home-feed\.js\?v=20260916-mail-delivery-time-v4/);
});
