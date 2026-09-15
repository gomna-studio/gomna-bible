import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_CATCHUP_MINUTES,
  MAX_CATCHUP_REASON,
  MAX_SEND_ATTEMPTS,
  CLAIM_STALE_MS,
  PG_NET_TIMEOUT_MS,
  INTERVAL_HOURS,
  CRON_JOB_NAME,
  REQUIRED_VAULT_SECRETS,
  isValidTimeZone,
  zonedLocalToUtcMs,
  localDateKey,
  evaluateDueSlots,
  prefsFromRow,
  readPrefs,
  listSlotDefs,
  applyClaimDecision,
  applyStatusWrite,
  restStatusWriteFilter,
  createConditionalSendStore,
  createMemorySendStore,
  runReliableSend,
  classifySendError,
  classifyDryRunSlot,
  catchUpInfo,
  authorizeReliableTestRequest,
  decideRegisterTarget,
  assertVaultSecretsForCron,
  inspectTeardownSql,
  responseStatusFor,
  registerStatusFor,
  sanitizeSendSlot,
  buildReliableTestPayload,
  reliableTestTag,
  dummyPayload
} from '../../supabase/functions/_shared/push-reliable-test.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CRON_SQL = readFileSync(resolve(HERE, '../../supabase/migrations/20260915075411_gomna_push_reliable_test_cron.sql'), 'utf8');
const TEARDOWN_SQL = readFileSync(resolve(HERE, '../../supabase/sql/unschedule-push-reliable-test.sql'), 'utf8');

const SEOUL_0658 = new Date('2026-09-14T21:58:00.000Z');
const DEVICE = 'hash-seoul-iphone';

function seoulFixed(extra) {
  return {
    endpoint_hash: DEVICE,
    active: true,
    locale: 'ko',
    timezone: 'Asia/Seoul',
    schedule_mode: 'fixed',
    frequency: 1,
    first_send_time: '06:58',
    second_send_time: '20:30',
    ...extra
  };
}

function target(hash) {
  return { endpoint_hash: hash, enabled: true };
}

async function runAt(now, opts) {
  const store = opts.store || createMemorySendStore();
  const sends = [];
  const deactivated = [];
  const result = await runReliableSend({
    now,
    dryRun: opts.dryRun === true,
    targets: opts.targets || [target(DEVICE)],
    subscriptions: opts.subscriptions || [seoulFixed()],
    store,
    sendPush: opts.sendPush || (async (row, payload) => {
      sends.push({ endpoint_hash: row.endpoint_hash, payload });
      return { ok: true, statusCode: 201 };
    }),
    deactivate: opts.deactivate || (async (hash) => {
      deactivated.push(hash);
      return { ok: true };
    }),
    buildPayload: opts.buildPayload,
    maxCatchup: opts.maxCatchup
  });
  return { result, store, sends, deactivated };
}

test('catch-up constant is explicit and 30 minutes', () => {
  assert.equal(MAX_CATCHUP_MINUTES, 30);
  assert.match(MAX_CATCHUP_REASON, /30/);
  assert.match(MAX_CATCHUP_REASON, /1 hour|1시간|60/);
  const info = catchUpInfo();
  assert.equal(info.maxMinutes, 30);
  assert.equal(info.reason, MAX_CATCHUP_REASON);
});

test('Seoul 06:58 setting fires at 06:58', async () => {
  const { result, sends } = await runAt(SEOUL_0658, {});
  assert.equal(result.ok, true);
  assert.equal(result.testTargets, 1);
  assert.equal(result.scanned, 1);
  assert.equal(result.active, 1);
  assert.equal(result.due, 1);
  assert.equal(result.notDue, 0);
  assert.equal(result.claimed, 1);
  assert.equal(result.attempted, 1);
  assert.equal(result.sent, 1);
  assert.equal(sends.length, 1);
  assert.equal(result.dueDetails[0].slot, 'first');
  assert.equal(result.dueDetails[0].sendDate, '2026-09-15');
  assert.equal(result.dueDetails[0].localTime, '06:58');
});

test('Seoul 06:58 still fires a few minutes late', async () => {
  const late = new Date('2026-09-14T22:05:00.000Z');
  const { result } = await runAt(late, {});
  assert.equal(result.due, 1);
  assert.equal(result.sent, 1);
  assert.ok(result.dueDetails[0].delayMinutes > 6);
  assert.ok(result.dueDetails[0].delayMinutes < 8);
});

test('catch-up inside max delay still sends', async () => {
  const almost = new Date(SEOUL_0658.getTime() + (MAX_CATCHUP_MINUTES - 1) * 60000);
  const { result } = await runAt(almost, {});
  assert.equal(result.due, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.dueDetails[0].sendDate, '2026-09-15');
});

test('catch-up past max delay does not send', async () => {
  const tooLate = new Date(SEOUL_0658.getTime() + MAX_CATCHUP_MINUTES * 60000);
  const { result, sends } = await runAt(tooLate, {});
  assert.equal(result.due, 0);
  assert.equal(result.notDue, 1);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
  assert.equal(result.exclusions[0].reason, 'not_due');
});

test('same slot called twice sends only once', async () => {
  const store = createMemorySendStore();
  const first = await runAt(SEOUL_0658, { store });
  const second = await runAt(SEOUL_0658, { store });
  assert.equal(first.result.sent, 1);
  assert.equal(second.result.sent, 0);
  assert.equal(second.result.alreadySent, 1);
  assert.equal(first.sends.length + second.sends.length, 1);
});

test('twice-daily sends each slot once', async () => {
  const store = createMemorySendStore();
  const sub = seoulFixed({ frequency: 2, first_send_time: '06:58', second_send_time: '20:30' });
  const morning = await runAt(SEOUL_0658, { store, subscriptions: [sub] });
  const evening = await runAt(new Date('2026-09-15T11:30:00.000Z'), { store, subscriptions: [sub] });
  assert.equal(morning.result.sent, 1);
  assert.equal(morning.result.dueDetails[0].slot, 'first');
  assert.equal(evening.result.sent, 1);
  assert.equal(evening.result.dueDetails[0].slot, 'second');
  assert.equal(store.rows.size, 2);
});

test('identical first and second times do not double-send', async () => {
  const evaluated = evaluateDueSlots(prefsFromRow(seoulFixed({
    frequency: 2,
    first_send_time: '06:58',
    second_send_time: '06:58'
  })), SEOUL_0658);
  assert.equal(evaluated.ok, true);
  assert.deepEqual(evaluated.slots.map((s) => s.slot), ['first']);
  const { result, sends } = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({ frequency: 2, first_send_time: '06:58', second_send_time: '06:58' })]
  });
  assert.equal(result.due, 1);
  assert.equal(sends.length, 1);
});

for (const hours of INTERVAL_HOURS) {
  test('interval ' + hours + 'h includes start and lands on later steps', () => {
    const prefs = prefsFromRow({
      schedule_mode: 'interval',
      interval_hours: hours,
      interval_start_time: '07:00',
      interval_end_time: '22:00',
      timezone: 'Asia/Seoul'
    });
    const defs = listSlotDefs(prefs);
    assert.equal(defs[0].hhmm, '07:00');
    assert.equal(defs[0].slot, 'interval-0700');
    const start = evaluateDueSlots(prefs, new Date('2026-09-14T22:00:00.000Z'));
    assert.equal(start.ok, true);
    assert.equal(start.slots.some((s) => s.slot === 'interval-0700'), true);
    const laterLocal = 7 + hours;
    if (laterLocal <= 22) {
      const hh = String(laterLocal).padStart(2, '0');
      const later = evaluateDueSlots(prefs, new Date(Date.UTC(2026, 8, 14, laterLocal - 9, 0, 0)));
      assert.equal(later.slots.some((s) => s.slot === 'interval-' + hh + '00'), true, 'expected slot ' + hh + ':00');
    }
  });
}

test('interval end time is inclusive', () => {
  const prefs = prefsFromRow({
    schedule_mode: 'interval',
    interval_hours: 1,
    interval_start_time: '07:00',
    interval_end_time: '22:00',
    timezone: 'Asia/Seoul'
  });
  const atEnd = evaluateDueSlots(prefs, new Date('2026-09-15T13:00:00.000Z'));
  assert.equal(atEnd.ok, true);
  assert.equal(atEnd.slots.some((s) => s.slot === 'interval-2200'), true);
});

test('invalid interval range is recorded, not silently empty', async () => {
  const { result, sends } = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({
      schedule_mode: 'interval',
      interval_hours: 2,
      interval_start_time: '22:00',
      interval_end_time: '07:00'
    })]
  });
  assert.equal(result.invalidPreferences, 1);
  assert.equal(result.due, 0);
  assert.equal(result.notDue, 0);
  assert.equal(sends.length, 0);
  assert.equal(result.exclusions[0].reason, 'invalid_interval_range');
});

test('equal interval start and end is invalid_interval_range', () => {
  const evaluated = evaluateDueSlots(prefsFromRow({
    schedule_mode: 'interval',
    interval_hours: 1,
    interval_start_time: '07:00',
    interval_end_time: '07:00',
    timezone: 'Asia/Seoul'
  }), SEOUL_0658);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.reason, 'invalid_interval_range');
});

test('date rolls correctly around midnight in Asia/Seoul', () => {
  const before = evaluateDueSlots(prefsFromRow(seoulFixed({ first_send_time: '23:50' })), new Date('2026-09-14T14:50:00.000Z'));
  assert.equal(before.slots[0].sendDate, '2026-09-14');
  const after = evaluateDueSlots(prefsFromRow(seoulFixed({ first_send_time: '23:50' })), new Date('2026-09-14T15:10:00.000Z'));
  assert.equal(after.ok, true);
  assert.equal(after.slots.length, 1);
  assert.equal(after.slots[0].sendDate, '2026-09-14');
  assert.ok(after.slots[0].delayMinutes > 19 && after.slots[0].delayMinutes < 21);
  const nextMorning = evaluateDueSlots(prefsFromRow(seoulFixed({ first_send_time: '00:05' })), new Date('2026-09-14T15:10:00.000Z'));
  assert.equal(nextMorning.slots[0].sendDate, '2026-09-15');
  assert.equal(nextMorning.slots[0].localTime, '00:05');
});

test('Asia/Seoul, UTC, and another valid IANA zone convert without silent UTC fallback', () => {
  assert.equal(isValidTimeZone('Asia/Seoul'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('America/Los_Angeles'), true);
  assert.equal(zonedLocalToUtcMs(2026, 9, 15, 6, 58, 'Asia/Seoul'), SEOUL_0658.getTime());
  assert.equal(zonedLocalToUtcMs(2026, 9, 15, 6, 58, 'UTC'), Date.UTC(2026, 8, 15, 6, 58, 0));
  assert.equal(zonedLocalToUtcMs(2026, 9, 9, 7, 30, 'America/Los_Angeles'), Date.UTC(2026, 8, 9, 14, 30, 0));
  assert.equal(localDateKey('America/Los_Angeles', new Date('2026-09-09T14:30:00.000Z')), '2026-09-09');
  const utcDue = evaluateDueSlots(prefsFromRow({
    timezone: 'UTC',
    first_send_time: '06:58',
    frequency: 1,
    schedule_mode: 'fixed'
  }), new Date('2026-09-15T06:58:00.000Z'));
  assert.equal(utcDue.slots[0].sendDate, '2026-09-15');
  const laDue = evaluateDueSlots(prefsFromRow({
    timezone: 'America/Los_Angeles',
    first_send_time: '07:30',
    frequency: 1,
    schedule_mode: 'fixed'
  }), new Date('2026-09-09T14:30:00.000Z'));
  assert.equal(laDue.slots[0].slot, 'first');
});

test('invalid timezone is recorded as invalid_timezone', async () => {
  const { result, sends } = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({ timezone: 'Not/AZone' })]
  });
  assert.equal(result.invalidPreferences, 1);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
  assert.equal(result.exclusions[0].reason, 'invalid_timezone');
  const empty = evaluateDueSlots(prefsFromRow({ timezone: '', first_send_time: '06:58' }), SEOUL_0658);
  assert.equal(empty.reason, 'invalid_timezone');
});

test('zero active subscriptions reports active 0', async () => {
  const { result } = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({ active: false })]
  });
  assert.equal(result.testTargets, 1);
  assert.equal(result.scanned, 1);
  assert.equal(result.active, 0);
  assert.equal(result.sent, 0);
  assert.equal(result.exclusions.some((row) => row.reason === 'inactive'), true);
});

test('zero test targets never scans production-style subscribers', async () => {
  const { result, sends } = await runAt(SEOUL_0658, {
    targets: [],
    subscriptions: [seoulFixed(), seoulFixed({ endpoint_hash: 'other-device' })]
  });
  assert.equal(result.testTargets, 0);
  assert.equal(result.scanned, 0);
  assert.equal(result.active, 0);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
});

test('only registered test devices are sent, never the rest of the subscription list', async () => {
  const { result, sends } = await runAt(SEOUL_0658, {
    targets: [target(DEVICE)],
    subscriptions: [
      seoulFixed(),
      seoulFixed({ endpoint_hash: 'prod-device-a' }),
      seoulFixed({ endpoint_hash: 'prod-device-b' })
    ]
  });
  assert.equal(result.testTargets, 1);
  assert.equal(result.scanned, 1);
  assert.equal(result.sent, 1);
  assert.deepEqual(sends.map((row) => row.endpoint_hash), [DEVICE]);
});

test('expired endpoint 404 deactivates', async () => {
  const { result, deactivated } = await runAt(SEOUL_0658, {
    sendPush: async () => ({ ok: false, statusCode: 404, errorKind: 'gone' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'push');
  assert.equal(result.error, 'push_failed');
  assert.equal(responseStatusFor(result), 422);
  assert.equal(result.failed, 1);
  assert.equal(result.deactivated, 1);
  assert.equal(result.failures[0].httpStatus, 404);
  assert.deepEqual(deactivated, [DEVICE]);
});

test('expired endpoint 404/410 deactivates and does not retry', async () => {
  const store = createMemorySendStore();
  const first = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: false, statusCode: 410, errorKind: 'gone' })
  });
  assert.equal(first.result.ok, false);
  assert.equal(first.result.failureClass, 'push');
  assert.equal(first.result.failed, 1);
  assert.equal(first.result.deactivated, 1);
  assert.deepEqual(first.deactivated, [DEVICE]);
  assert.equal(first.result.failures[0].errorKind, 'gone');
  assert.equal(first.result.failures[0].httpStatus, 410);
  assert.equal(first.result.failures[0].endpoint_hash, DEVICE);
  assert.equal(first.result.failures[0].slot, 'first');
  assert.equal(first.result.failures[0].localDate, '2026-09-15');
  assert.equal(first.result.failures[0].localTime, '06:58');
  const second = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: true, statusCode: 201 })
  });
  assert.equal(second.result.sent, 0);
  assert.equal(second.result.alreadySent, 1);
});

test('temporary server failure is retried then sent', async () => {
  const store = createMemorySendStore();
  const first = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: false, statusCode: 503, errorKind: 'server_error' })
  });
  assert.equal(first.result.ok, false);
  assert.equal(first.result.failureClass, 'push');
  assert.equal(first.result.failed, 1);
  assert.equal(first.result.sent, 0);
  assert.equal(first.result.retried, 0);
  assert.equal(first.result.failures[0].attemptCount, 1);
  const second = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: true, statusCode: 201 })
  });
  assert.equal(second.result.retried, 1);
  assert.equal(second.result.sent, 1);
  assert.equal(second.result.failed, 0);
});

test('overlapping runs claim one send only', async () => {
  const store = createMemorySendStore();
  let started = 0;
  const sendPush = async () => {
    started += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { ok: true, statusCode: 201 };
  };
  const [a, b] = await Promise.all([
    runAt(SEOUL_0658, { store, sendPush }),
    runAt(SEOUL_0658, { store, sendPush })
  ]);
  assert.equal(a.result.sent + b.result.sent, 1);
  assert.equal(a.result.alreadySent + b.result.alreadySent, 1);
  assert.equal(started, 1);
  const inFlight = applyClaimDecision({ status: 'claimed', attemptCount: 1, claimedAt: Date.now() }, Date.now());
  assert.equal(inFlight.action, 'skip');
  assert.equal(inFlight.reason, 'in_flight');
  const stale = applyClaimDecision({ status: 'claimed', attemptCount: 1, claimedAt: Date.now() - CLAIM_STALE_MS }, Date.now());
  assert.equal(stale.action, 'retry');
});

test('dryRun lists due targets and exclusion reasons without sending', async () => {
  const store = createMemorySendStore();
  await runAt(SEOUL_0658, { store });
  const { result, sends } = await runAt(SEOUL_0658, {
    store,
    dryRun: true,
    subscriptions: [
      seoulFixed(),
      seoulFixed({ endpoint_hash: 'not-due', first_send_time: '21:00' }),
      seoulFixed({ endpoint_hash: 'bad-tz', timezone: 'Nope/Zone' })
    ],
    targets: [target(DEVICE), target('not-due'), target('bad-tz'), target('missing')]
  });
  assert.equal(result.dryRun, true);
  assert.equal(sends.length, 0);
  assert.equal(result.testTargets, 4);
  assert.equal(result.scanned, 3);
  assert.equal(result.active, 3);
  assert.equal(result.due, 1);
  assert.equal(result.notDue, 1);
  assert.equal(result.invalidPreferences, 1);
  assert.equal(result.alreadySent, 1);
  assert.equal(result.claimed, 0);
  assert.equal(result.attempted, 0);
  assert.equal(result.sent, 0);
  const reasons = result.exclusions.map((row) => row.reason).sort();
  assert.deepEqual(reasons, ['invalid_timezone', 'not_due', 'subscription_missing']);
  assert.equal(result.dueDetails[0].endpoint_hash, DEVICE);
  assert.equal(result.dueDetails[0].disposition, 'already_sent');
});

test('locales ko/en/ja/zh stay on the due detail', async () => {
  for (const locale of ['ko', 'en', 'ja', 'zh']) {
    const { result } = await runAt(SEOUL_0658, {
      subscriptions: [seoulFixed({ locale })],
      store: createMemorySendStore()
    });
    assert.equal(result.dueDetails[0].locale, locale);
  }
});

test('error classifier covers gone, retryable, and network', () => {
  assert.equal(classifySendError(404), 'gone');
  assert.equal(classifySendError(410), 'gone');
  assert.equal(classifySendError(429), 'rate_limited');
  assert.equal(classifySendError(503), 'server_error');
  assert.equal(classifySendError(403), 'client_error');
  assert.equal(classifySendError(0, new Error('reset')), 'network_error');
});

test('retry stops after MAX_SEND_ATTEMPTS', async () => {
  const store = createMemorySendStore();
  for (let i = 0; i < MAX_SEND_ATTEMPTS; i += 1) {
    const step = await runAt(SEOUL_0658, {
      store,
      sendPush: async () => ({ ok: false, statusCode: 500, errorKind: 'server_error' })
    });
    assert.equal(step.result.failed, 1);
    assert.equal(step.result.ok, false);
  }
  const extra = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: true, statusCode: 201 })
  });
  assert.equal(extra.result.sent, 0);
  assert.equal(extra.result.alreadySent, 1);
});

test('a late previous attempt cannot overwrite a newer attempt', async () => {
  const store = createConditionalSendStore();
  const first = store.claim({
    sendDate: '2026-09-15',
    endpointHash: DEVICE,
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  assert.equal(first.attemptCount, 1);
  const row = store.peek('2026-09-15', DEVICE, 'first');
  row.claimedAt = SEOUL_0658.getTime() - CLAIM_STALE_MS;
  const second = store.claim({
    sendDate: '2026-09-15',
    endpointHash: DEVICE,
    slot: 'first',
    localTime: '06:58',
    now: new Date(SEOUL_0658.getTime() + CLAIM_STALE_MS)
  });
  assert.equal(second.status, 'retry');
  assert.equal(second.attemptCount, 2);
  const staleWrite = store.markSent(first.key, new Date(), { attemptCount: first.attemptCount });
  assert.equal(staleWrite.ok, false);
  assert.equal(staleWrite.reason, 'attempt_mismatch');
  assert.equal(store.peek('2026-09-15', DEVICE, 'first').status, 'claimed');
  assert.equal(store.peek('2026-09-15', DEVICE, 'first').attemptCount, 2);
  const freshWrite = store.markSent(second.key, new Date(), { attemptCount: second.attemptCount });
  assert.equal(freshWrite.ok, true);
  assert.equal(store.peek('2026-09-15', DEVICE, 'first').status, 'sent');
  assert.equal(applyStatusWrite({ status: 'claimed', attemptCount: 2 }, 1).ok, false);
  assert.equal(restStatusWriteFilter(2), 'status=eq.claimed&attempt_count=eq.2');
});

test('markSent DB failure does not increment sent', async () => {
  const inner = createConditionalSendStore();
  const store = {
    peek: (...args) => inner.peek(...args),
    claim: (...args) => inner.claim(...args),
    markSent: async () => ({ ok: false, reason: 'db_error' }),
    markFailed: (...args) => inner.markFailed(...args)
  };
  const { result } = await runAt(SEOUL_0658, { store });
  assert.equal(result.sent, 0);
  assert.equal(result.attempted, 1);
  assert.equal(result.claimed, 1);
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'storage');
  assert.equal(result.error, 'persist_sent_failed');
  assert.equal(result.storageErrors[0].op, 'markSent');
  assert.equal(responseStatusFor(result), 500);
});

test('markFailed DB failure is diagnosed and does not increment failed', async () => {
  const inner = createConditionalSendStore();
  const store = {
    peek: (...args) => inner.peek(...args),
    claim: (...args) => inner.claim(...args),
    markSent: (...args) => inner.markSent(...args),
    markFailed: async () => ({ ok: false, reason: 'db_error' })
  };
  const { result } = await runAt(SEOUL_0658, {
    store,
    sendPush: async () => ({ ok: false, statusCode: 503, errorKind: 'server_error' })
  });
  assert.equal(result.failed, 0);
  assert.equal(result.sent, 0);
  assert.equal(result.attempted, 1);
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'storage');
  assert.equal(result.error, 'persist_failed_failed');
  assert.equal(result.storageErrors[0].op, 'markFailed');
  assert.equal(result.storageErrors[0].httpStatus, 503);
});

test('deactivate failure does not increment deactivated', async () => {
  const { result, deactivated } = await runAt(SEOUL_0658, {
    sendPush: async () => ({ ok: false, statusCode: 410, errorKind: 'gone' }),
    deactivate: async () => ({ ok: false, reason: 'db_error' })
  });
  assert.equal(result.failed, 1);
  assert.equal(result.deactivated, 0);
  assert.equal(deactivated.length, 0);
  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'storage');
  assert.equal(result.error, 'deactivate_failed');
  assert.equal(result.storageErrors[0].op, 'deactivate');
});

test('all push failures are not reported as success', async () => {
  const { result } = await runAt(SEOUL_0658, {
    sendPush: async () => ({ ok: false, statusCode: 503, errorKind: 'server_error' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'push_failed');
  assert.equal(result.failureClass, 'push');
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(responseStatusFor(result), 422);
});

test('invalid clock times and interval hours are recorded, not defaulted', async () => {
  const badFirst = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({ first_send_time: '26:00' })]
  });
  assert.equal(badFirst.result.invalidPreferences, 1);
  assert.equal(badFirst.result.sent, 0);
  assert.equal(badFirst.result.exclusions[0].reason, 'invalid_first_send_time');
  assert.equal(readPrefs(seoulFixed({ first_send_time: '26:00' })).prefs.firstTime, '26:00');

  const badSecond = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({ frequency: 2, second_send_time: '07:99' })]
  });
  assert.equal(badSecond.result.exclusions[0].reason, 'invalid_second_send_time');

  const badHours = await runAt(SEOUL_0658, {
    subscriptions: [seoulFixed({
      schedule_mode: 'interval',
      interval_hours: 5,
      interval_start_time: '07:00',
      interval_end_time: '22:00'
    })]
  });
  assert.equal(badHours.result.exclusions[0].reason, 'invalid_interval_hours');
  assert.equal(readPrefs({
    timezone: 'Asia/Seoul',
    schedule_mode: 'interval',
    interval_hours: 5,
    interval_start_time: '07:00',
    interval_end_time: '22:00'
  }).reason, 'invalid_interval_hours');
});

test('dryRun distinguishes every pending and excluded state', async () => {
  const store = createConditionalSendStore();
  store.claim({
    sendDate: '2026-09-15',
    endpointHash: 'already',
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  store.markSent('2026-09-15|already|first', SEOUL_0658, { attemptCount: 1 });
  store.claim({
    sendDate: '2026-09-15',
    endpointHash: 'inflight',
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  const retryRow = store.claim({
    sendDate: '2026-09-15',
    endpointHash: 'retry',
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  store.markFailed(retryRow.key, { errorKind: 'server_error', statusCode: 503 }, { attemptCount: 1 });
  const exhausted = store.claim({
    sendDate: '2026-09-15',
    endpointHash: 'exhausted',
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  store.markFailed(exhausted.key, { errorKind: 'gone', statusCode: 410 }, { attemptCount: 1 });

  const { result, sends } = await runAt(SEOUL_0658, {
    store,
    dryRun: true,
    targets: [
      target(DEVICE),
      target('already'),
      target('inflight'),
      target('retry'),
      target('exhausted'),
      target('bad-pref'),
      target('missing'),
      target('inactive')
    ],
    subscriptions: [
      seoulFixed(),
      seoulFixed({ endpoint_hash: 'already' }),
      seoulFixed({ endpoint_hash: 'inflight' }),
      seoulFixed({ endpoint_hash: 'retry' }),
      seoulFixed({ endpoint_hash: 'exhausted' }),
      seoulFixed({ endpoint_hash: 'bad-pref', first_send_time: '99:00' }),
      seoulFixed({ endpoint_hash: 'inactive', active: false })
    ]
  });
  assert.equal(sends.length, 0);
  const byDisposition = {};
  for (const row of result.dueDetails) {
    byDisposition[row.disposition] = (byDisposition[row.disposition] || 0) + 1;
  }
  for (const row of result.exclusions) {
    byDisposition[row.disposition] = (byDisposition[row.disposition] || 0) + 1;
  }
  assert.equal(byDisposition.will_send, 1);
  assert.equal(byDisposition.will_retry, 1);
  assert.equal(byDisposition.already_sent, 1);
  assert.equal(byDisposition.in_flight, 1);
  assert.equal(byDisposition.attempts_exhausted, 1);
  assert.equal(byDisposition.invalid_preferences, 1);
  assert.equal(byDisposition.subscription_missing, 1);
  assert.equal(byDisposition.inactive, 1);
  assert.equal(classifyDryRunSlot(null, Date.now()), 'will_send');
});

test('cron install fails when vault secrets are missing', () => {
  assert.throws(
    () => assertVaultSecretsForCron({}),
    /missing vault secrets/
  );
  assert.throws(
    () => assertVaultSecretsForCron({
      gomna_push_reliable_test_function_url: 'https://example.supabase.co/functions/v1/push-send-reliable-test'
    }),
    /gomna_push_reliable_test_cron_secret/
  );
  assertVaultSecretsForCron({
    gomna_push_reliable_test_function_url: 'https://example.supabase.co/functions/v1/push-send-reliable-test',
    gomna_push_reliable_test_cron_secret: 'set',
    gomna_push_reliable_test_gateway_apikey: 'set'
  });
  assert.match(CRON_SQL, /raise exception 'gomna_push_reliable_test cron install failed: missing vault secrets/);
  for (const name of REQUIRED_VAULT_SECRETS) {
    assert.match(CRON_SQL, new RegExp(name));
  }
  assert.doesNotMatch(CRON_SQL, /where exists \(\s*select 1\s*from vault\.decrypted_secrets/i);
  assert.match(CRON_SQL, new RegExp('timeout_milliseconds := ' + PG_NET_TIMEOUT_MS));
  assert.ok(PG_NET_TIMEOUT_MS >= 32 * 4000);
});

test('conditional REST-style updates require matching attempt_count', () => {
  const store = createConditionalSendStore();
  const claimed = store.claim({
    sendDate: '2026-09-15',
    endpointHash: DEVICE,
    slot: 'first',
    localTime: '06:58',
    now: SEOUL_0658
  });
  const filter = restStatusWriteFilter(claimed.attemptCount);
  assert.equal(filter, 'status=eq.claimed&attempt_count=eq.1');
  assert.equal(applyStatusWrite(store.peek('2026-09-15', DEVICE, 'first'), 1).ok, true);
  store.peek('2026-09-15', DEVICE, 'first').attemptCount = 2;
  assert.equal(applyStatusWrite(store.peek('2026-09-15', DEVICE, 'first'), 1).reason, 'attempt_mismatch');
  assert.equal(store.markFailed(claimed.key, { errorKind: 'server_error', statusCode: 500 }, { attemptCount: 1 }).ok, false);
  assert.equal(store.peek('2026-09-15', DEVICE, 'first').status, 'claimed');
  assert.equal(store.markSent(claimed.key, SEOUL_0658, { attemptCount: 2 }).ok, true);
});

test('teardown SQL removes only the test cron and test tables', () => {
  const inspected = inspectTeardownSql(TEARDOWN_SQL);
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.unschedules, [CRON_JOB_NAME]);
  assert.ok(inspected.drops.includes('gomna_push_reliable_test_targets'));
  assert.ok(inspected.drops.includes('gomna_push_reliable_test_sends'));
  assert.deepEqual(inspected.forbidden, []);
  assert.doesNotMatch(TEARDOWN_SQL, /gomna_push_subscriptions/);
  assert.doesNotMatch(TEARDOWN_SQL, /gomna_push_sends[^_]/);
  assert.doesNotMatch(TEARDOWN_SQL, /push-send-daily/);
  assert.doesNotMatch(TEARDOWN_SQL, /daily-today-word-push/);
});

test('register-target requires an existing subscription and is not a 200 success', () => {
  const missing = decideRegisterTarget(null);
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'subscription-missing');
  assert.equal(registerStatusFor(missing), 404);
  assert.notEqual(registerStatusFor(missing), 200);
  const found = decideRegisterTarget({ endpoint_hash: DEVICE, active: true });
  assert.equal(found.ok, true);
  assert.equal(registerStatusFor(found), 200);
});

test('cron and manual callers must send apikey plus the test secret', () => {
  assert.equal(authorizeReliableTestRequest({
    apikey: '',
    testSecret: 's',
    expectedSecret: 's',
    expectedApikey: 'k'
  }), false);
  assert.equal(authorizeReliableTestRequest({
    apikey: 'k',
    testSecret: '',
    expectedSecret: 's',
    expectedApikey: 'k'
  }), false);
  assert.equal(authorizeReliableTestRequest({
    apikey: 'k',
    testSecret: 's',
    expectedSecret: 's',
    expectedApikey: 'k'
  }), true);
  assert.equal(authorizeReliableTestRequest({
    apikey: 'other',
    testSecret: 's',
    expectedSecret: 's',
    expectedApikey: 'k'
  }), false);
});

function collapsingTodayWordBuild(opts) {
  const coerced = opts.slot === 'second' ? 'second' : 'first';
  return {
    title: coerced === 'second' ? '오늘의 말씀을 다시 묵상해보세요' : '오늘의 말씀',
    tag: 'gomna-today-' + opts.date + '-' + coerced,
    data: { source: 'home-today', date: opts.date, slot: coerced, locale: opts.locale }
  };
}

test('interval-1855 and interval-1955 keep distinct tags and real data.slot', () => {
  const a = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'ko',
    slot: 'interval-1855'
  });
  const b = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'ko',
    slot: 'interval-1955'
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.payload.tag, 'gomna-reliable-test-2026-09-15-interval-1855');
  assert.equal(b.payload.tag, 'gomna-reliable-test-2026-09-15-interval-1955');
  assert.notEqual(a.payload.tag, b.payload.tag);
  assert.equal(a.payload.data.slot, 'interval-1855');
  assert.equal(b.payload.data.slot, 'interval-1955');
});

test('same date and interval slot always reuse the same tag', () => {
  const first = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'ko',
    slot: 'interval-1855'
  });
  const second = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'en',
    slot: 'interval-1855'
  });
  assert.equal(first.payload.tag, second.payload.tag);
  assert.equal(first.payload.tag, reliableTestTag('2026-09-15', 'interval-1855'));
  assert.equal(first.payload.tag.indexOf(String(Date.now())), -1);
});

test('first and second use the reliable-test tag namespace', () => {
  const first = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'ko',
    slot: 'first'
  });
  const second = buildReliableTestPayload(collapsingTodayWordBuild, {
    date: '2026-09-15',
    locale: 'ko',
    slot: 'second'
  });
  assert.equal(first.payload.tag, 'gomna-reliable-test-2026-09-15-first');
  assert.equal(second.payload.tag, 'gomna-reliable-test-2026-09-15-second');
  assert.equal(first.payload.data.slot, 'first');
  assert.equal(second.payload.data.slot, 'second');
});

test('unsafe or malformed slots are rejected', () => {
  const rejected = [
    'interval-9999',
    'interval-2460',
    'interval-1855-extra',
    'interval-1855<script>',
    '../../first',
    'first\nsecond',
    'INTERVAL-1855',
    '',
    null,
    'manual'
  ];
  for (const slot of rejected) {
    const checked = sanitizeSendSlot(slot);
    assert.equal(checked.ok, false, String(slot));
    const built = buildReliableTestPayload(collapsingTodayWordBuild, {
      date: '2026-09-15',
      slot
    });
    assert.equal(built.ok, false, String(slot));
    assert.equal(built.reason, 'invalid_slot');
    assert.equal(built.payload, null);
  }
});

test('send path preserves interval slots even when production builder collapses them', async () => {
  const { sends } = await runAt(new Date('2026-09-15T09:55:00.000Z'), {
    subscriptions: [seoulFixed({
      schedule_mode: 'interval',
      interval_hours: 1,
      interval_start_time: '18:55',
      interval_end_time: '20:55'
    })],
    buildPayload: collapsingTodayWordBuild
  });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.data.slot, 'interval-1855');
  assert.equal(sends[0].payload.tag, 'gomna-reliable-test-2026-09-15-interval-1855');
  assert.equal(sends[0].payload.tag.startsWith('gomna-today-'), false);
});

test('reliable-test tags never use the production gomna-today- namespace', () => {
  const slots = ['first', 'second', 'interval-1855', 'interval-1955'];
  for (const slot of slots) {
    const built = buildReliableTestPayload(collapsingTodayWordBuild, {
      date: '2026-09-15',
      locale: 'ko',
      slot
    });
    assert.equal(built.ok, true, slot);
    assert.equal(built.payload.tag, 'gomna-reliable-test-2026-09-15-' + slot);
    assert.equal(built.payload.tag.startsWith('gomna-today-'), false, slot);
    assert.equal(built.payload.tag.startsWith('gomna-reliable-test-'), true, slot);
  }
  const dummy = dummyPayload({ date: '2026-09-15', locale: 'ko', slot: 'interval-1855' });
  assert.equal(dummy.tag, 'gomna-reliable-test-2026-09-15-interval-1855');
  assert.equal(dummy.data.slot, 'interval-1855');
  assert.equal(dummy.tag.startsWith('gomna-today-'), false);
  assert.equal(reliableTestTag('2026-09-15', 'first'), 'gomna-reliable-test-2026-09-15-first');
});

test('slot correction runs only once inside runReliableSend', async () => {
  const indexSrc = readFileSync(resolve(HERE, '../../supabase/functions/push-send-reliable-test/index.ts'), 'utf8');
  assert.match(indexSrc, /buildPayload:\s*\(opts:[^)]*\)\s*=>\s*buildPayload\(opts\)/);
  assert.doesNotMatch(indexSrc, /buildReliableTestPayload\(/);

  let productionCalls = 0;
  let wrapCalls = 0;
  const result = await runReliableSend({
    now: new Date('2026-09-15T09:55:00.000Z'),
    targets: [target(DEVICE)],
    subscriptions: [seoulFixed({
      schedule_mode: 'interval',
      interval_hours: 1,
      interval_start_time: '18:55',
      interval_end_time: '20:55'
    })],
    store: createMemorySendStore(),
    buildPayload(opts) {
      productionCalls += 1;
      return collapsingTodayWordBuild(opts);
    },
    buildReliableTestPayload(productionBuild, opts) {
      wrapCalls += 1;
      return buildReliableTestPayload(productionBuild, opts);
    }
  });
  assert.equal(result.sent, 1);
  assert.equal(wrapCalls, 1);
  assert.equal(productionCalls, 1);
});
