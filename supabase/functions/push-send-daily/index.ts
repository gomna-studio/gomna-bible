import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json, sb } from '../_shared/push-http.ts';
import { buildPayload } from '../_shared/today-word.ts';
import {
  MAX_SEND_ATTEMPTS, applyClaimDecision, applyStatusWrite,
  classifySendError, isRetryableError, runProductionSend
} from '../_shared/push-reliable.mjs';

type SubRow = {
  endpoint: string; endpoint_hash: string; p256dh: string; auth: string;
  locale?: string; timezone?: string; schedule_mode?: string; frequency?: number;
  first_send_time?: string; second_send_time?: string; interval_hours?: number;
  interval_start_time?: string; interval_end_time?: string; active: boolean;
};

async function authorized(req: Request, mode: string) {
  const secret = mode === 'test' ? Deno.env.get('PUSH_DEV_SECRET') || '' : Deno.env.get('PUSH_CRON_SECRET') || '';
  const header = mode === 'test' ? req.headers.get('x-gomna-push-dev') || '' : req.headers.get('x-gomna-push-cron') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!!secret && (header === secret || bearer === secret)) return true;
  if (mode !== 'daily' || !header) return false;
  try {
    const res = await sb('rpc/gomna_validate_push_cron_secret', {
      method: 'POST', body: JSON.stringify({ p_secret: header })
    });
    if (!res.ok) return false;
    return (await res.json().catch(() => false)) === true;
  } catch {
    return false;
  }
}

async function responseRows(res: Response) {
  if (!res.ok) throw new Error('storage_http_' + res.status);
  const value = await res.json().catch(() => []);
  return Array.isArray(value) ? value : [];
}

const enc = (value: string) => encodeURIComponent(value);
const keyOf = (date: string, hash: string, slot: string) => date + '|' + hash + '|' + slot;
function splitKey(key: string) {
  const parts = key.split('|');
  return { date: parts[0], hash: parts[1], slot: parts.slice(2).join('|') };
}

function createRestSendStore() {
  return {
    async peek(date: string, hash: string, slot: string) {
      const rows = await responseRows(await sb(
        'gomna_push_sends?send_date=eq.' + enc(date) + '&endpoint_hash=eq.' + enc(hash) +
          '&slot=eq.' + enc(slot) + '&select=status,attempt_count,claimed_at', { method: 'GET' }
      ));
      if (!rows[0]) return null;
      return {
        status: String(rows[0].status || ''), attemptCount: Number(rows[0].attempt_count || 0),
        claimedAt: rows[0].claimed_at ? new Date(String(rows[0].claimed_at)).getTime() : 0
      };
    },
    async claim(input: { sendDate: string; endpointHash: string; slot: string; localTime: string; now: Date }) {
      const nowIso = input.now.toISOString();
      const inserted = await responseRows(await sb('gomna_push_sends', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({
          send_date: input.sendDate, endpoint_hash: input.endpointHash,
          verse_id: input.sendDate + '|' + input.slot, slot: input.slot,
          status: 'claimed', attempt_count: 1, local_time: input.localTime,
          claimed_at: nowIso, sent_at: null, updated_at: nowIso
        })
      }));
      const key = keyOf(input.sendDate, input.endpointHash, input.slot);
      if (inserted[0]) return { status: 'new', key, attemptCount: 1 };
      const existing = await this.peek(input.sendDate, input.endpointHash, input.slot);
      const decision = applyClaimDecision(existing, input.now.getTime());
      if (decision.action !== 'retry' || !existing) {
        return { status: 'already', reason: decision.reason || 'in_flight', attemptCount: existing ? existing.attemptCount : 0 };
      }
      const nextAttempt = existing.attemptCount + 1;
      const expectedStatus = existing.status === 'failed' ? 'failed' : 'claimed';
      const patched = await responseRows(await sb(
        'gomna_push_sends?send_date=eq.' + enc(input.sendDate) + '&endpoint_hash=eq.' + enc(input.endpointHash) +
          '&slot=eq.' + enc(input.slot) + '&status=eq.' + expectedStatus + '&attempt_count=eq.' + existing.attemptCount,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          status: 'claimed', attempt_count: nextAttempt, local_time: input.localTime,
          claimed_at: nowIso, updated_at: nowIso
        }) }
      ));
      if (!patched[0]) return { status: 'already', reason: 'in_flight', attemptCount: existing.attemptCount };
      return { status: 'retry', key, attemptCount: nextAttempt };
    },
    async markSent(key: string, now: Date, claim: { attemptCount: number }) {
      const part = splitKey(key);
      const allowed = applyStatusWrite(await this.peek(part.date, part.hash, part.slot), claim.attemptCount);
      if (!allowed.ok) return allowed;
      const rows = await responseRows(await sb(
        'gomna_push_sends?send_date=eq.' + enc(part.date) + '&endpoint_hash=eq.' + enc(part.hash) +
          '&slot=eq.' + enc(part.slot) + '&status=eq.claimed&attempt_count=eq.' + claim.attemptCount,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          status: 'sent', sent_at: now.toISOString(), last_error_kind: null,
          last_http_status: null, updated_at: now.toISOString()
        }) }
      ));
      return rows[0] ? { ok: true } : { ok: false, reason: 'attempt_mismatch' };
    },
    async markFailed(key: string, result: { errorKind: string; statusCode: number }, claim: { attemptCount: number }) {
      const part = splitKey(key);
      const allowed = applyStatusWrite(await this.peek(part.date, part.hash, part.slot), claim.attemptCount);
      if (!allowed.ok) return allowed;
      const body: Record<string, unknown> = {
        status: 'failed', last_error_kind: result.errorKind,
        last_http_status: result.statusCode || 0, updated_at: new Date().toISOString()
      };
      if (!isRetryableError(result.errorKind)) body.attempt_count = MAX_SEND_ATTEMPTS;
      const rows = await responseRows(await sb(
        'gomna_push_sends?send_date=eq.' + enc(part.date) + '&endpoint_hash=eq.' + enc(part.hash) +
          '&slot=eq.' + enc(part.slot) + '&status=eq.claimed&attempt_count=eq.' + claim.attemptCount,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }
      ));
      return rows[0] ? { ok: true } : { ok: false, reason: 'attempt_mismatch' };
    }
  };
}

async function listActiveSubscriptions() {
  const pageSize = 500;
  const all: SubRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const page = await responseRows(await sb(
      'gomna_push_subscriptions?active=eq.true&order=endpoint_hash.asc&select=endpoint,endpoint_hash,p256dh,auth,locale,timezone,schedule_mode,frequency,first_send_time,second_send_time,interval_hours,interval_start_time,interval_end_time,active',
      { method: 'GET', headers: { Range: offset + '-' + (offset + pageSize - 1), 'Range-Unit': 'items' } }
    )) as SubRow[];
    all.push(...page);
    if (page.length < pageSize) return all;
  }
  throw new Error('subscription-limit-exceeded');
}

async function deactivate(hash: string) {
  const rows = await responseRows(await sb(
    'gomna_push_subscriptions?endpoint_hash=eq.' + enc(hash) + '&active=eq.true',
    { method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }) }
  ));
  return rows[0] ? { ok: true } : { ok: false, reason: 'not_updated' };
}

function statusFor(result: { ok?: boolean; failureClass?: string }) {
  if (result.ok) return 200;
  return result.failureClass === 'push' ? 422 : 500;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method' }, origin);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = body.mode === 'test' ? 'test' : 'daily';
  if (!await authorized(req, mode)) return json(401, { ok: false, error: 'unauthorized' }, origin);

  let subscriptions: SubRow[];
  try { subscriptions = await listActiveSubscriptions(); }
  catch { return json(500, { ok: false, error: 'list-failed', failureClass: 'storage' }, origin); }

  if (mode === 'test') {
    const endpoint = String(body.endpoint || (body.subscription as { endpoint?: string } | undefined)?.endpoint || '');
    if (!endpoint) return json(400, { ok: false, error: 'explicit-endpoint-required' }, origin);
    subscriptions = subscriptions.filter((row) => row.endpoint === endpoint);
    if (subscriptions.length !== 1) return json(404, { ok: false, error: 'subscription-not-found' }, origin);
  }

  const dryRun = body.dryRun === true;
  const now = body.now ? new Date(String(body.now)) : new Date();
  if (Number.isNaN(now.getTime())) return json(400, { ok: false, error: 'invalid-now' }, origin);
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'https://gomnastudio.com';
  if (!dryRun && (!publicKey || !privateKey)) return json(500, { ok: false, error: 'vapid-missing' }, origin);
  if (!dryRun) webpush.setVapidDetails(subject, publicKey, privateKey);

  if (mode === 'test') {
    try {
      await webpush.sendNotification(
        { endpoint: subscriptions[0].endpoint, keys: { p256dh: subscriptions[0].p256dh, auth: subscriptions[0].auth } },
        JSON.stringify({
          title: '은혜의말씀 테스트', body: '푸시 알림 연결 확인', lang: subscriptions[0].locale || 'ko',
          tag: 'gomna-push-probe', icon: '/icon-192.png', badge: '/icon-192.png',
          data: { source: 'home-today', probe: true, url: '/?source=home-today' }
        }),
        { TTL: 3600, urgency: 'high' }
      );
      return json(200, { ok: true, mode: 'test', sent: 1 }, origin);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode) || 0;
      return json(422, { ok: false, mode: 'test', sent: 0, error: classifySendError(statusCode, error), statusCode }, origin);
    }
  }

  const payloadDate = body.date == null ? '' : String(body.date);
  if (payloadDate && !/^\d{4}-\d{2}-\d{2}$/.test(payloadDate)) {
    return json(400, { ok: false, error: 'invalid-date' }, origin);
  }
  const result = await runProductionSend({
    now, dryRun, force: body.force === true, payloadDate: payloadDate || undefined,
    subscriptions, store: createRestSendStore(), buildPayload, deactivate,
    async sendPush(row: SubRow, payload: unknown) {
      try {
        const response = await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'normal' }
        );
        return { ok: true, statusCode: Number(response && response.statusCode) || 201 };
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode) || 0;
        return { ok: false, statusCode, errorKind: classifySendError(statusCode, error) };
      }
    }
  });
  console.log(JSON.stringify({
    event: 'production_push_run', ok: result.ok, dryRun, scanned: result.scanned,
    due: result.due, sent: result.sent, failed: result.failed, storageErrors: result.storageErrors.length
  }));
  return json(statusFor(result), { mode: 'daily', ...result }, origin);
});
