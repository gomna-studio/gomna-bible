import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json, sha32, sb } from '../_shared/push-http.ts';
import { buildPayload } from '../_shared/today-word.ts';
import {
  MAX_SEND_ATTEMPTS,
  CLAIM_STALE_MS,
  classifySendError,
  applyClaimDecision,
  applyStatusWrite,
  restStatusWriteFilter,
  authorizeReliableTestRequest,
  decideRegisterTarget,
  catchUpInfo,
  publicFailureLog,
  responseStatusFor,
  registerStatusFor,
  runReliableSend
} from '../_shared/push-reliable-test.mjs';

type SubRow = {
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  locale?: string;
  timezone?: string;
  schedule_mode?: string;
  frequency?: number;
  first_send_time?: string;
  second_send_time?: string;
  interval_hours?: number;
  interval_start_time?: string;
  interval_end_time?: string;
  active: boolean;
};

function testCorsHeaders(origin: string) {
  const headers = corsHeaders(origin);
  headers['Access-Control-Allow-Headers'] =
    'authorization, apikey, content-type, x-gomna-push-reliable-test';
  return headers;
}

function jsonWithCors(status: number, body: unknown, origin: string) {
  const res = json(status, body, origin);
  const headers = new Headers(res.headers);
  const extra = testCorsHeaders(origin);
  Object.keys(extra).forEach((key) => headers.set(key, extra[key]));
  return new Response(res.body, { status: res.status, headers });
}

function authorized(req: Request) {
  const expectedSecret = Deno.env.get('PUSH_RELIABLE_TEST_CRON_SECRET') || '';
  const expectedApikey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  return authorizeReliableTestRequest({
    apikey: req.headers.get('apikey') || '',
    testSecret: req.headers.get('x-gomna-push-reliable-test') || '',
    expectedSecret,
    expectedApikey
  });
}

function safeLog(event: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...payload }));
}

async function readJson(res: Response) {
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body;
}

function sendKey(sendDate: string, endpointHash: string, slot: string) {
  return sendDate + '|' + endpointHash + '|' + slot;
}

function splitKey(key: string) {
  const parts = String(key).split('|');
  return {
    sendDate: parts[0],
    endpointHash: parts[1],
    slot: parts.slice(2).join('|')
  };
}

function createRestSendStore() {
  return {
    async peek(sendDate: string, endpointHash: string, slot: string) {
      const res = await sb(
        'gomna_push_reliable_test_sends?send_date=eq.' + sendDate +
          '&endpoint_hash=eq.' + endpointHash +
          '&slot=eq.' + encodeURIComponent(slot) +
          '&select=send_date,endpoint_hash,slot,status,attempt_count,claimed_at',
        { method: 'GET' }
      );
      const rows = await readJson(res);
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!row) return null;
      return {
        status: String(row.status || ''),
        attemptCount: Number(row.attempt_count || 0),
        claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).getTime() : 0
      };
    },
    async claim(input: { sendDate: string; endpointHash: string; slot: string; localTime: string; now: Date }) {
      const nowIso = input.now.toISOString();
      const insert = await sb('gomna_push_reliable_test_sends', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({
          send_date: input.sendDate,
          endpoint_hash: input.endpointHash,
          slot: input.slot,
          status: 'claimed',
          attempt_count: 1,
          local_time: input.localTime,
          claimed_at: nowIso,
          updated_at: nowIso
        })
      });
      const inserted = await readJson(insert);
      if (Array.isArray(inserted) && inserted[0]) {
        return { status: 'new', key: sendKey(input.sendDate, input.endpointHash, input.slot), attemptCount: 1 };
      }
      const existing = await this.peek(input.sendDate, input.endpointHash, input.slot);
      const decision = applyClaimDecision(existing, input.now.getTime());
      if (decision.action !== 'retry' || !existing) {
        return { status: 'already', reason: decision.reason || 'already_sent', attemptCount: existing ? existing.attemptCount : 0 };
      }
      const nextAttempt = existing.attemptCount + 1;
      const filter = existing.status === 'failed'
        ? 'status=eq.failed&attempt_count=eq.' + existing.attemptCount
        : 'status=eq.claimed&attempt_count=eq.' + existing.attemptCount;
      const patch = await sb(
        'gomna_push_reliable_test_sends?send_date=eq.' + input.sendDate +
          '&endpoint_hash=eq.' + input.endpointHash +
          '&slot=eq.' + encodeURIComponent(input.slot) +
          '&' + filter,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'claimed',
            attempt_count: nextAttempt,
            local_time: input.localTime,
            claimed_at: nowIso,
            updated_at: nowIso
          })
        }
      );
      const patched = await readJson(patch);
      if (!Array.isArray(patched) || !patched[0]) {
        return { status: 'already', reason: 'in_flight', attemptCount: existing.attemptCount };
      }
      return { status: 'retry', key: sendKey(input.sendDate, input.endpointHash, input.slot), attemptCount: nextAttempt };
    },
    async markSent(key: string, now: Date, claim: { attemptCount: number }) {
      const parts = splitKey(key);
      const current = await this.peek(parts.sendDate, parts.endpointHash, parts.slot);
      const allowed = applyStatusWrite(current, claim.attemptCount);
      if (!allowed.ok) return { ok: false, reason: allowed.reason };
      const res = await sb(
        'gomna_push_reliable_test_sends?send_date=eq.' + parts.sendDate +
          '&endpoint_hash=eq.' + parts.endpointHash +
          '&slot=eq.' + encodeURIComponent(parts.slot) +
          '&' + restStatusWriteFilter(claim.attemptCount),
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'sent',
            sent_at: now.toISOString(),
            last_error_kind: null,
            last_http_status: null,
            updated_at: now.toISOString()
          })
        }
      );
      const rows = await readJson(res);
      if (!Array.isArray(rows) || !rows[0]) return { ok: false, reason: 'attempt_mismatch' };
      return { ok: true };
    },
    async markFailed(key: string, result: { errorKind: string; statusCode: number }, claim: { attemptCount: number }) {
      const parts = splitKey(key);
      const current = await this.peek(parts.sendDate, parts.endpointHash, parts.slot);
      const allowed = applyStatusWrite(current, claim.attemptCount);
      if (!allowed.ok) return { ok: false, reason: allowed.reason };
      const body: Record<string, unknown> = {
        status: 'failed',
        last_error_kind: result.errorKind,
        last_http_status: result.statusCode || 0,
        updated_at: new Date().toISOString()
      };
      if (!['server_error', 'rate_limited', 'network_error'].includes(result.errorKind)) {
        body.attempt_count = MAX_SEND_ATTEMPTS;
      }
      const res = await sb(
        'gomna_push_reliable_test_sends?send_date=eq.' + parts.sendDate +
          '&endpoint_hash=eq.' + parts.endpointHash +
          '&slot=eq.' + encodeURIComponent(parts.slot) +
          '&' + restStatusWriteFilter(claim.attemptCount),
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(body)
        }
      );
      const rows = await readJson(res);
      if (!Array.isArray(rows) || !rows[0]) return { ok: false, reason: 'attempt_mismatch' };
      return { ok: true };
    }
  };
}

function hashInFilter(hashes: string[]) {
  return hashes.map((h) => encodeURIComponent(h)).join(',');
}

async function listTargets() {
  const res = await sb(
    'gomna_push_reliable_test_targets?enabled=eq.true&select=endpoint_hash,enabled,note',
    { method: 'GET' }
  );
  const rows = await readJson(res);
  if (!Array.isArray(rows)) throw new Error('list-targets-failed');
  return rows as Array<{ endpoint_hash: string; enabled: boolean; note?: string }>;
}

async function listSubscriptions(hashes: string[]) {
  if (!hashes.length) return [] as SubRow[];
  const res = await sb(
    'gomna_push_subscriptions?endpoint_hash=in.(' + hashInFilter(hashes) +
      ')&select=endpoint,endpoint_hash,p256dh,auth,locale,timezone,schedule_mode,frequency,first_send_time,second_send_time,interval_hours,interval_start_time,interval_end_time,active',
    { method: 'GET' }
  );
  const rows = await readJson(res);
  if (!Array.isArray(rows)) throw new Error('list-subscriptions-failed');
  return rows as SubRow[];
}

async function registerTarget(body: Record<string, unknown>) {
  const endpoint = String(body.endpoint || '');
  const endpointHash = String(body.endpointHash || body.endpoint_hash || (endpoint ? await sha32(endpoint) : ''));
  if (!endpointHash || endpointHash.length > 64) {
    return { ok: false, error: 'invalid-target', failureClass: 'function' };
  }
  const found = await sb(
    'gomna_push_subscriptions?endpoint_hash=eq.' + encodeURIComponent(endpointHash) + '&select=endpoint_hash,active',
    { method: 'GET' }
  );
  if (!found.ok) return { ok: false, error: 'lookup-failed', failureClass: 'storage' };
  const rows = await readJson(found);
  const sub = Array.isArray(rows) && rows[0] ? rows[0] as { endpoint_hash: string; active: boolean } : null;
  const decision = decideRegisterTarget(sub);
  if (!decision.ok) return decision;
  const nowIso = new Date().toISOString();
  const res = await sb('gomna_push_reliable_test_targets?on_conflict=endpoint_hash', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      endpoint_hash: endpointHash,
      note: String(body.note || '').slice(0, 120),
      enabled: true,
      updated_at: nowIso
    })
  });
  const saved = await readJson(res);
  if (!res.ok || !saved) return { ok: false, error: 'register-failed', failureClass: 'storage' };
  return {
    ok: true,
    action: 'register-target',
    endpoint_hash: endpointHash,
    enabled: true,
    foundSubscription: true,
    subscriptionActive: !!sub.active,
    failureClass: 'none'
  };
}

async function unregisterTarget(body: Record<string, unknown>) {
  const endpoint = String(body.endpoint || '');
  const endpointHash = String(body.endpointHash || body.endpoint_hash || (endpoint ? await sha32(endpoint) : ''));
  if (!endpointHash) return { ok: false, error: 'invalid-target', failureClass: 'function' };
  const res = await sb('gomna_push_reliable_test_targets?endpoint_hash=eq.' + encodeURIComponent(endpointHash), {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() })
  });
  const rows = await readJson(res);
  if (!res.ok || !Array.isArray(rows)) return { ok: false, error: 'unregister-failed', failureClass: 'storage' };
  return { ok: true, action: 'unregister-target', endpoint_hash: endpointHash, enabled: false, failureClass: 'none' };
}

function registerStatus(result: { ok: boolean; error?: string }) {
  return registerStatusFor(result);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: testCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonWithCors(405, { ok: false, error: 'method', failureClass: 'function' }, origin);
  if (!authorized(req)) return jsonWithCors(401, { ok: false, error: 'unauthorized', failureClass: 'function' }, origin);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || 'send');
  if (action === 'register-target') {
    const result = await registerTarget(body);
    return jsonWithCors(registerStatus(result), result, origin);
  }
  if (action === 'unregister-target') {
    const result = await unregisterTarget(body);
    return jsonWithCors(result.ok ? 200 : registerStatus(result), result, origin);
  }

  const dryRun = body.dryRun === true;
  const now = body.now ? new Date(String(body.now)) : new Date();
  if (Number.isNaN(now.getTime())) return jsonWithCors(400, { ok: false, error: 'invalid-now', failureClass: 'function' }, origin);

  let targets;
  try {
    targets = await listTargets();
  } catch {
    return jsonWithCors(500, { ok: false, error: 'list-targets-failed', failureClass: 'storage' }, origin);
  }

  let subscriptions: SubRow[];
  try {
    subscriptions = await listSubscriptions(targets.map((t) => t.endpoint_hash));
  } catch {
    return jsonWithCors(500, { ok: false, error: 'list-subscriptions-failed', failureClass: 'storage' }, origin);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'https://gomnastudio.com';
  if (!dryRun) {
    if (!publicKey || !privateKey) return jsonWithCors(500, { ok: false, error: 'vapid-missing', failureClass: 'function' }, origin);
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  const store = createRestSendStore();
  const result = await runReliableSend({
    now,
    dryRun,
    targets,
    subscriptions,
    store,
    buildPayload: (opts: { date?: string; locale?: string; slot?: string }) => buildPayload(opts),
    async sendPush(row: SubRow, payload: unknown) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 30 * 60, urgency: 'normal' }
        );
        return { ok: true, statusCode: 201 };
      } catch (err) {
        const statusCode = Number((err as { statusCode?: number }).statusCode || 0);
        return { ok: false, statusCode, errorKind: classifySendError(statusCode, err) };
      }
    },
    async deactivate(endpointHash: string) {
      const res = await sb('gomna_push_subscriptions?endpoint_hash=eq.' + encodeURIComponent(endpointHash), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
      });
      const rows = await readJson(res);
      if (!res.ok || !Array.isArray(rows) || !rows[0]) return { ok: false, reason: 'deactivate_failed' };
      return { ok: true };
    }
  });

  safeLog('gomna-push-reliable-test', {
    dryRun,
    ok: result.ok,
    error: result.error || null,
    failureClass: result.failureClass || 'none',
    catchUpMinutes: catchUpInfo().maxMinutes,
    scanned: result.scanned,
    active: result.active,
    testTargets: result.testTargets,
    due: result.due,
    notDue: result.notDue,
    invalidPreferences: result.invalidPreferences,
    alreadySent: result.alreadySent,
    claimed: result.claimed,
    attempted: result.attempted,
    sent: result.sent,
    failed: result.failed,
    deactivated: result.deactivated,
    retried: result.retried,
    failures: Array.isArray(result.failures) ? result.failures.map((row) => publicFailureLog(row)) : [],
    storageErrors: Array.isArray(result.storageErrors) ? result.storageErrors : [],
    claimStaleMs: CLAIM_STALE_MS
  });

  return jsonWithCors(responseStatusFor(result), {
    mode: 'reliable-test',
    ...result
  }, origin);
});
