import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_MAIL_CATCHUP_MINUTES, MAX_MAIL_SEND_ATTEMPTS, MAIL_CRON_JOB,
  MAIL_VAULT_SECRETS, createMemoryMailStore, evaluateMailDue,
  mailClaimDecision, mailLocalDateKey, parseMailTime, readMailPrefs,
  runReliableMailSend
} from '../../supabase/functions/_shared/mail-reliable.mjs';

const rootText = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const subscriber = (overrides = {}) => ({
  email: 'reader@example.com', email_hash: 'reader-hash', active: true,
  timezone: 'Asia/Seoul', send_time: '08:30', locale: 'ko', ...overrides
});

test('mail catch-up is explicit and stays below one hour', () => {
  assert.equal(MAX_MAIL_CATCHUP_MINUTES, 30);
  assert.ok(MAX_MAIL_CATCHUP_MINUTES < 60);
});

test('Seoul 08:30 is due at the exact local minute', () => {
  const due = evaluateMailDue({ timezone: 'Asia/Seoul', sendTime: '08:30' }, new Date('2026-09-15T23:30:05Z'));
  assert.equal(due.due.sendDate, '2026-09-16');
  assert.equal(due.due.localTime, '08:30');
  assert.ok(due.due.delayMinutes < 1);
});

test('a short outage catches up but a late mail does not arrive hours later', () => {
  assert.ok(evaluateMailDue({ timezone: 'Asia/Seoul', sendTime: '08:30' }, new Date('2026-09-15T23:50:00Z')).due);
  assert.equal(evaluateMailDue({ timezone: 'Asia/Seoul', sendTime: '08:30' }, new Date('2026-09-16T00:00:00Z')).due, null);
});

test('timezone and local date are evaluated per subscriber', () => {
  const now = new Date('2026-09-16T07:00:00Z');
  assert.equal(mailLocalDateKey('Asia/Seoul', now), '2026-09-16');
  assert.equal(mailLocalDateKey('America/Los_Angeles', now), '2026-09-16');
  assert.ok(evaluateMailDue({ timezone: 'America/Los_Angeles', sendTime: '00:00' }, now).due);
});

test('invalid delivery time and timezone are rejected', () => {
  assert.deepEqual(parseMailTime('08:30:00'), { hour: 8, minute: 30, hhmm: '08:30' });
  assert.equal(parseMailTime('08:30:01'), null);
  assert.equal(parseMailTime('24:00'), null);
  assert.equal(readMailPrefs(subscriber({ send_time: '25:10' })).reason, 'invalid_send_time');
  assert.equal(readMailPrefs(subscriber({ timezone: 'Not/AZone' })).reason, 'invalid_timezone');
});

test('same recipient and local day sends only once', async () => {
  const store = createMemoryMailStore();
  const sent = [];
  const input = {
    now: new Date('2026-09-15T23:30:05Z'), subscriptions: [subscriber()], store,
    sendMail: async (row, due) => { sent.push([row.email_hash, due.sendDate]); return { ok: true, id: 'mail-1' }; }
  };
  const first = await runReliableMailSend(input);
  const second = await runReliableMailSend(input);
  assert.equal(first.sent, 1);
  assert.equal(second.alreadySent, 1);
  assert.equal(sent.length, 1);
});

test('dry run reports due recipients without sending', async () => {
  let called = false;
  const result = await runReliableMailSend({
    now: new Date('2026-09-15T23:30:00Z'), dryRun: true,
    subscriptions: [subscriber()], store: createMemoryMailStore(),
    sendMail: async () => { called = true; return { ok: true }; }
  });
  assert.equal(result.due, 1);
  assert.equal(result.dueDetails[0].disposition, 'will_send');
  assert.equal(called, false);
});

test('temporary failures retry and permanent failures exhaust attempts', () => {
  assert.equal(mailClaimDecision({ status: 'failed', attemptCount: 1, claimedAt: 0 }, Date.now()).action, 'retry');
  assert.equal(mailClaimDecision({ status: 'failed', attemptCount: MAX_MAIL_SEND_ATTEMPTS, claimedAt: 0 }, Date.now()).reason, 'attempts_exhausted');
});

test('mail cron is every minute and refuses missing secrets', () => {
  const sql = rootText('supabase/sql/install-mail-production-cron.sql');
  assert.equal(MAIL_CRON_JOB, 'gomna-mail-send-daily-every-minute');
  assert.match(sql, /'\* \* \* \* \*'/);
  for (const name of MAIL_VAULT_SECRETS) assert.ok(sql.includes(name));
  assert.match(sql, /missing Vault secrets/);
  assert.match(sql, /apikey/);
});

test('GitHub scheduled workflow no longer duplicates scheduled email', () => {
  const workflow = rootText('.github/workflows/daily-today-word-push.yml');
  assert.match(workflow, /mail:\n\s+#[^\n]*\n\s+if: github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow, /10 15 \* \* \*/);
});

test('migration stores local delivery time and reliable claim state', () => {
  const sql = rootText('supabase/migrations/20260916051627_mail_delivery_time.sql');
  for (const token of ['send_time', 'attempt_count', 'claimed_at', 'last_error_kind', 'sent_at drop not null']) {
    assert.ok(sql.toLowerCase().includes(token));
  }
});
