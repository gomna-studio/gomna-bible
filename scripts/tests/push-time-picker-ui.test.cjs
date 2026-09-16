'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/gomna-home-feed.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function clockHelpers() {
  const match = source.match(/function padNotifyTimePart[\s\S]*?(?=  function ensureNotifyTimeOptions)/);
  assert.ok(match, 'clock conversion helpers must exist');
  return Function(`${match[0]}; return { splitNotifyClock, joinNotifyClock };`)();
}

test('custom time picker does not depend on browser type=time UI', () => {
  const block = html.match(/<div class="ghd-notify-time-custom"[\s\S]*?<\/div>\s*<p class="ghd-notify-selection-note"/);
  assert.ok(block, 'custom picker markup must exist');
  assert.doesNotMatch(block[0], /type="time"/);
  assert.match(block[0], /data-ghd-time-period="am"/);
  assert.match(block[0], /data-ghd-time-period="pm"/);
  assert.match(block[0], /id="ghdNotifyTimeHour"/);
  assert.match(block[0], /id="ghdNotifyTimeMinute"/);
  assert.doesNotMatch(block[0], /id="ghdNotifyTimeHourVisible"/);
});

test('hour and minute use the same browser-normalized closed control', () => {
  assert.match(html, /\.ghd-notify-time-field select\{[\s\S]*?-webkit-appearance:none;appearance:none/);
  assert.match(html, /\.ghd-notify-time-field select\{[\s\S]*?text-align:center;text-align-last:center/);
  assert.match(html, /\.ghd-notify-time-field::after\{[\s\S]*?pointer-events:none/);
  assert.doesNotMatch(html, /#ghdNotifyTimeHourVisible\{/);
  assert.match(html, /\.ghd-notify-time-field select:focus,\.ghd-notify-time-field select:focus-visible\{[\s\S]*?outline:none!important;[\s\S]*?border-color:#d7e1ee!important/);
});

test('time controls keep one explicit two-row layout at every width', () => {
  assert.match(html, /\.ghd-notify-time-custom\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(html, /\.ghd-notify-time-period\{grid-column:1\/-1;/);
  assert.doesNotMatch(html, /grid-template-columns:1fr 1fr auto 1fr/);
  assert.match(html, /#ghdNotifyTimeSheet \.ghd-notify-pref-panel\{[\s\S]*?max-height:calc\(var\(--ghd-vv-h,100dvh\) - 20px\);[\s\S]*?overflow-x:hidden/);
});

test('Android time controls cannot scroll beneath the action buttons', () => {
  assert.match(html, /#ghdNotifyTimeSheet \.ghd-notify-pref-actions\{[\s\S]*?position:static;[\s\S]*?bottom:auto;[\s\S]*?z-index:auto/);
});

test('notification and email time controls share the AM and PM button height', () => {
  assert.match(html, /\.ghd-notify-time-period button\{\s*height:37px;min-height:37px/);
  assert.match(html, /\.ghd-notify-time-field select\{[\s\S]*?height:37px;min-height:37px/);
  assert.match(html, /#ghdNotifyTimeSheet \.ghd-notify-option,[\s\S]*?#ghdNotifyTimeSheet \.ghd-notify-pref-actions button\{\s*height:37px;min-height:37px/);
  assert.match(html, /#ghdMailSheet \.ghd-sheet-cta,[\s\S]*?#ghdMailSheet \.ghd-sheet-text\{height:37px;min-height:37px/);
});

test('active AM or PM uses one very slim border', () => {
  assert.match(html, /\.ghd-notify-time-period button\.is-on\{\s*border:\.5px solid #315f9e;[\s\S]*?box-shadow:none/);
  assert.doesNotMatch(html, /box-shadow:inset 0 0 0 1px #315f9e/);
});

test('installed apps request the current time-control service worker', () => {
  assert.match(html, /serviceWorker\.register\("\/sw\.js\?v=20260916-android-time-footer-v4"/);
  assert.match(serviceWorker, /CACHE_VERSION = '2026-09-16-android-time-footer-v4'/);
});

test('picker preserves exact minutes and noon or midnight correctly', () => {
  const { splitNotifyClock, joinNotifyClock } = clockHelpers();
  assert.deepEqual(splitNotifyClock('00:07'), { period: 'am', hour: '12', minute: '07' });
  assert.deepEqual(splitNotifyClock('12:46'), { period: 'pm', hour: '12', minute: '46' });
  assert.deepEqual(splitNotifyClock('23:59'), { period: 'pm', hour: '11', minute: '59' });
  assert.equal(joinNotifyClock('am', '12', '07'), '00:07');
  assert.equal(joinNotifyClock('pm', '12', '46'), '12:46');
  assert.equal(joinNotifyClock('pm', '11', '59'), '23:59');
});

test('minute picker offers every minute and avoids Safari showPicker', () => {
  assert.match(source, /for\(i=0;i<60;i\+\+\)/);
  assert.doesNotMatch(source, /\.showPicker\s*&&/);
  assert.match(source, /updateNotifyTimeDraftFromControls/);
});

test('notification off control is visible before the scrollable preferences', () => {
  const offIndex = html.indexOf('id="ghdNotifyOff"');
  const prefsIndex = html.indexOf('id="ghdNotifyPrefs"');
  assert.ok(offIndex >= 0, 'notification off button must exist');
  assert.ok(prefsIndex > offIndex, 'notification off button must be above preferences');
  assert.match(html, /#ghdNotifySheet \.ghd-notify-panel\{\s*max-height:calc\(100dvh - 20px\)/);
});

test('interval labels use clear notification wording', () => {
  assert.match(html, />알림 시작 시간<\/span>/);
  assert.match(html, />알림 종료 시간<\/span>/);
  assert.doesNotMatch(html, />수신 시작 시간<\/span>/);
  assert.doesNotMatch(html, />수신 종료 시간<\/span>/);
  assert.match(source, /'알림 시작 시간'/);
  assert.match(source, /'알림 종료 시간'/);
});
