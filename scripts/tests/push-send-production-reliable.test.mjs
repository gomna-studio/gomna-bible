import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_CATCHUP_MINUTES, MAX_SEND_ATTEMPTS, PRODUCTION_CRON_JOB,
  PRODUCTION_VAULT_SECRETS, applyStatusWrite, buildProductionPayload,
  createMemorySendStore, evaluateDueSlots, readPrefs, runProductionSend
} from '../../supabase/functions/_shared/push-reliable.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const source = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const AT_0916_KST = new Date('2026-09-16T00:16:00.000Z');

function subscription(hash = 'iphone-new') {
  return {
    endpoint_hash: hash, endpoint: 'https://push.example/' + hash, p256dh: 'p', auth: 'a', active: true,
    locale: 'ko', timezone: 'Asia/Seoul', schedule_mode: 'interval', frequency: 1,
    first_send_time: '08:30', second_send_time: '20:30', interval_hours: 1,
    interval_start_time: '09:16', interval_end_time: '22:00'
  };
}

function productionBuilder(opts) {
  const collapsed = opts.slot === 'second' ? 'second' : 'first';
  return { title: '오늘의 말씀', tag: 'gomna-today-' + opts.date + '-' + collapsed,
    data: { source: 'home-today', date: opts.date, slot: collapsed } };
}

async function run(extra = {}) {
  const sends = [];
  const store = extra.store || createMemorySendStore();
  const result = await runProductionSend({
    now: extra.now || AT_0916_KST,
    dryRun: extra.dryRun === true,
    subscriptions: extra.subscriptions || [subscription()],
    store,
    buildPayload: productionBuilder,
    sendPush: extra.sendPush || (async (row, payload) => {
      sends.push({ row, payload });
      return { ok: true, statusCode: 201 };
    }),
    deactivate: extra.deactivate || (async () => ({ ok: true }))
  });
  return { result, sends, store };
}

test('production catch-up is 30 minutes for one-minute cron', () => {
  assert.equal(MAX_CATCHUP_MINUTES, 30);
  const prefs = readPrefs(subscription()).prefs;
  assert.equal(evaluateDueSlots(prefs, AT_0916_KST).slots[0].slot, 'interval-0916');
  assert.equal(evaluateDueSlots(prefs, new Date(AT_0916_KST.getTime() + 29 * 60000)).slots.length, 1);
  assert.equal(evaluateDueSlots(prefs, new Date(AT_0916_KST.getTime() + 30 * 60000)).slots.length, 0);
});

test('09:16 iPhone schedule is selected and sent', async () => {
  const { result, sends } = await run();
  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(sends.length, 1);
  assert.equal(result.dueDetails[0].localTime, '09:16');
});

test('every active subscription is evaluated without a test target list', async () => {
  const { result, sends } = await run({ subscriptions: [subscription('iphone'), subscription('mac')] });
  assert.equal(result.scanned, 2);
  assert.equal(result.active, 2);
  assert.equal(result.sent, 2);
  assert.deepEqual(sends.map((item) => item.row.endpoint_hash).sort(), ['iphone', 'mac']);
});

test('interval payload preserves the real slot and production namespace', async () => {
  const { sends } = await run();
  assert.equal(sends[0].payload.tag, 'gomna-today-2026-09-16-interval-0916');
  assert.equal(sends[0].payload.data.slot, 'interval-0916');
});

test('same device/date/slot sends once across repeated runs', async () => {
  const store = createMemorySendStore();
  const first = await run({ store });
  const second = await run({ store });
  assert.equal(first.result.sent, 1);
  assert.equal(second.result.sent, 0);
  assert.equal(second.result.alreadySent, 1);
});

test('overlapping runs claim a slot only once', async () => {
  const store = createMemorySendStore();
  const [a, b] = await Promise.all([run({ store }), run({ store })]);
  assert.equal(a.result.sent + b.result.sent, 1);
  assert.equal(a.result.alreadySent + b.result.alreadySent, 1);
});

test('manual force remains available without consuming a timed slot', async () => {
  const sends = [];
  const result = await runProductionSend({
    now: AT_0916_KST, force: true, payloadDate: '2026-09-15',
    subscriptions: [subscription()], store: createMemorySendStore(), buildPayload: productionBuilder,
    sendPush: async (_row, payload) => { sends.push(payload); return { ok: true, statusCode: 201 }; },
    deactivate: async () => ({ ok: true })
  });
  assert.equal(result.sent, 1);
  assert.equal(result.dueDetails[0].slot, 'manual');
  assert.equal(sends[0].tag, 'gomna-today-2026-09-15-manual');
});

test('retryable failure is retried and then recorded sent', async () => {
  const store = createMemorySendStore();
  const failed = await run({ store, sendPush: async () => ({ ok: false, statusCode: 503, errorKind: 'server_error' }) });
  const retried = await run({ store });
  assert.equal(failed.result.failed, 1);
  assert.equal(failed.result.ok, false);
  assert.equal(retried.result.retried, 1);
  assert.equal(retried.result.sent, 1);
});

test('late attempt cannot overwrite a newer claim', () => {
  assert.deepEqual(applyStatusWrite({ status: 'claimed', attemptCount: 2 }, 1), { ok: false, reason: 'attempt_mismatch' });
  assert.equal(MAX_SEND_ATTEMPTS, 3);
});

test('invalid timezone is visible and never silently changed to UTC', async () => {
  const { result } = await run({ subscriptions: [subscription('bad'), { ...subscription('bad'), timezone: 'Not/AZone' }] });
  assert.equal(result.invalidPreferences, 1);
  assert.equal(result.exclusions[0].reason, 'invalid_timezone');
});

test('production function is isolated from reliable-test targets and tables', () => {
  const index = source('supabase/functions/push-send-daily/index.ts');
  const core = source('supabase/functions/_shared/push-reliable.mjs');
  assert.doesNotMatch(index + core, /push-reliable-test|reliable_test_targets|reliable_test_sends/);
  assert.match(index, /gomna_push_subscriptions\?active=eq\.true/);
});

test('database migration adds claim, retry, and conditional-write fields', () => {
  const sql = source('supabase/migrations/20260916004439_gomna_push_production_reliable_delivery.sql');
  for (const name of ['attempt_count', 'last_error_kind', 'last_http_status', 'local_time', 'claimed_at', 'updated_at']) {
    assert.match(sql, new RegExp(name));
  }
  assert.match(sql, /sent_at drop not null/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /gomna_validate_push_cron_secret/);
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute[^;]+service_role/is);
});

test('Supabase production cron runs every minute and fails closed without secrets', () => {
  const sql = source('supabase/sql/install-push-production-cron.sql');
  assert.match(sql, new RegExp(PRODUCTION_CRON_JOB));
  assert.match(sql, /'\* \* \* \* \*'/);
  assert.match(sql, /raise exception/i);
  assert.match(sql, /timeout_milliseconds\s*:=\s*240000/);
  for (const name of PRODUCTION_VAULT_SECRETS) assert.match(sql, new RegExp(name));
});

test('GitHub fifteen-minute schedule remains as a deduplicated backup clock', () => {
  const workflow = source('.github/workflows/daily-today-word-push.yml');
  assert.match(workflow, /cron:\s*'\*\/15 \* \* \* \*'/);
  const rollback = source('supabase/sql/unschedule-push-production-cron.sql');
  assert.match(rollback, new RegExp(PRODUCTION_CRON_JOB));
  assert.doesNotMatch(rollback, /drop\s+table|gomna_push_subscriptions/i);
});

test('manual test mode cannot silently choose the first subscriber', () => {
  const index = source('supabase/functions/push-send-daily/index.ts');
  assert.match(index, /explicit-endpoint-required/);
  assert.doesNotMatch(index, /rows\.slice\(0,\s*1\)/);
  assert.match(index, /rpc\/gomna_validate_push_cron_secret/);
});

test('payload builder rejects malformed date and slot', () => {
  assert.equal(buildProductionPayload(productionBuilder, { date: 'bad', slot: 'first' }).ok, false);
  assert.equal(buildProductionPayload(productionBuilder, { date: '2026-09-16', slot: 'interval-2561' }).ok, false);
});
