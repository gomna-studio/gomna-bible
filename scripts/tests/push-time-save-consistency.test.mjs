import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../js/gomna-home-feed.js', import.meta.url), 'utf8');

test('time save reads the live iPhone time input instead of a stale draft', () => {
  const start = source.indexOf('function applyNotifyTime()');
  const end = source.indexOf('function openNotifyFreqSheet()', start);
  const body = source.slice(start, end);
  const liveRead = body.indexOf("document.getElementById('ghdNotifyTimeCustom')");
  const selected = body.indexOf('var selectedTime=notifyTimeDraft');
  const persist = body.indexOf('persistPushPrefs(next)');
  assert.ok(liveRead >= 0, 'the current time input must be read when Complete is pressed');
  assert.ok(liveRead < selected, 'the live input must replace the draft before the chosen time is frozen');
  assert.ok(selected < persist, 'the chosen time must be frozen before saving');
});

test('time sheet stays open when the server returns a different minute', () => {
  const start = source.indexOf('function applyNotifyTime()');
  const end = source.indexOf('function openNotifyFreqSheet()', start);
  const body = source.slice(start, end);
  assert.match(body, /notifyTimeValue\(saved\|\|currentPushPrefs\(\), notifyTimeSlot\)!==selectedTime/);
  assert.match(body, /선택한 시간과 저장된 시간이 다릅니다/);
  assert.ok(body.indexOf('!==selectedTime') < body.indexOf("closeSheet('ghdNotifyTimeSheet','button')"));
});
