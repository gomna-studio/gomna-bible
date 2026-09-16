'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const subscribe = fs.readFileSync(path.join(root, 'supabase/functions/mail-subscribe/index.ts'), 'utf8');
const daily = fs.readFileSync(path.join(root, 'supabase/functions/mail-send-daily/index.ts'), 'utf8');
const status = fs.readFileSync(path.join(root, 'supabase/functions/mail-status/index.ts'), 'utf8');

test('confirmation email is branded and no longer presented as a test', () => {
  assert.match(subscribe, /이메일 수신 신청이 완료되었습니다/);
  assert.match(subscribe, /매일.*formatClock/);
  assert.doesNotMatch(subscribe, /이메일 테스트/);
  assert.match(subscribe, /Words of Grace/);
});

test('daily email contains verse link and unsubscribe link', () => {
  assert.match(daily, /오늘의 말씀/);
  assert.match(daily, /source=home-today/);
  assert.match(daily, /은혜의말씀에서 보기/);
  assert.match(daily, /수신 해지/);
});

test('subscriber endpoints persist and return delivery preferences', () => {
  assert.match(subscribe, /send_time: sendTime\.hhmm/);
  assert.match(subscribe, /timezone,/);
  assert.match(status, /select=active,send_time,timezone/);
  assert.match(status, /sendTime:/);
});

test('daily sender uses reliable scheduler and explicit recipient test mode', () => {
  assert.match(daily, /runReliableMailSend/);
  assert.match(daily, /explicit-email-required/);
  assert.match(daily, /createRestMailStore/);
  assert.match(daily, /mode === 'test' \? createMemoryMailStore\(\) : createRestMailStore\(\)/);
  assert.match(daily, /resolution=ignore-duplicates/);
});
