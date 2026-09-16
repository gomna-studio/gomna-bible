import { corsHeaders, json, sb } from '../_shared/push-http.ts';
import { buildPayload, nativeLocale } from '../_shared/today-word.ts';
import {
  MAX_MAIL_SEND_ATTEMPTS, classifyMailError, isRetryableMailError,
  createMemoryMailStore, mailClaimDecision, mailStatusWriteAllowed, runReliableMailSend
} from '../_shared/mail-reliable.mjs';

type SubRow = {
  email: string; email_hash: string; locale: string; timezone: string;
  send_time: string; active: boolean;
};

async function authorized(req: Request, mode: string) {
  const secret = mode === 'daily' ? Deno.env.get('MAIL_CRON_SECRET') || '' : Deno.env.get('MAIL_DEV_SECRET') || '';
  const header = mode === 'daily' ? req.headers.get('x-gomna-mail-cron') || '' : req.headers.get('x-gomna-mail-dev') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!secret && (header === secret || bearer === secret);
}

function escapeHtml(value: string) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrap(inner: string) {
  return '<!DOCTYPE html><html lang="ko"><body style="margin:0;padding:24px;background:#FCFAF6;color:#152033;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;">'
    + '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;">' + inner + '</div></body></html>';
}

function todayHtml(payload: ReturnType<typeof buildPayload>, href: string, unsub: string) {
  const lines = String(payload.body || '').split('\n');
  const ref = lines[0] || '';
  const body = lines.slice(1).join('\n');
  return wrap(
    '<p style="margin:0;font-size:18px;font-weight:800;">은혜의말씀</p>'
    + '<p style="margin:4px 0 0;font-size:13px;color:#8a929c;font-style:italic;">Words of Grace</p>'
    + '<p style="margin:22px 0 6px;font-size:12px;font-weight:700;color:#5b6573;">오늘의 말씀</p>'
    + '<p style="margin:0 0 12px;font-size:15px;font-weight:650;">' + escapeHtml(ref) + '</p>'
    + '<p style="margin:0 0 24px;font-size:16px;line-height:1.65;">' + escapeHtml(body) + '</p>'
    + '<p><a href="' + escapeHtml(href) + '" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#1A2332;color:#fff;text-decoration:none;font-weight:700;">은혜의말씀에서 보기</a></p>'
    + '<p style="margin:28px 0 8px;font-size:12px;color:#8a929c;">이 이메일은 오늘의 말씀 수신 신청에 따라 발송되었습니다.</p>'
    + '<p><a href="' + escapeHtml(unsub) + '" style="font-size:12px;color:#8a929c;">수신 해지</a></p>'
  );
}

async function unsubToken(email: string) {
  const secret = Deno.env.get('MAIL_UNSUB_SECRET') || Deno.env.get('MAIL_CRON_SECRET') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + email));
  return Array.from(new Uint8Array(buf)).map((value) => value.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function sendResend(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('MAIL_FROM') || '은혜의말씀 <noreply@gomnastudio.com>';
  if (!key) return { ok: false, statusCode: 0, id: '', error: 'provider-missing', errorKind: 'configuration_error' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    return response.ok
      ? { ok: true, statusCode: response.status, id: String(body.id || ''), error: '', errorKind: '' }
      : { ok: false, statusCode: response.status, id: '', error: String(body.message || response.status), errorKind: classifyMailError(response.status, body) };
  } catch (error) {
    return { ok: false, statusCode: 0, id: '', error: String(error), errorKind: classifyMailError(0, error) };
  }
}

async function responseRows(response: Response) {
  if (!response.ok) throw new Error('storage_http_' + response.status);
  const value = await response.json().catch(() => []);
  return Array.isArray(value) ? value : [];
}

const enc = (value: string) => encodeURIComponent(value);
const claimKey = (date: string, hash: string) => date + '|' + hash;
function splitClaimKey(key: string) {
  const bar = key.indexOf('|');
  return { date: key.slice(0, bar), hash: key.slice(bar + 1) };
}

function createRestMailStore() {
  return {
    async peek(date: string, hash: string) {
      const rows = await responseRows(await sb(
        'gomna_mail_sends?send_date=eq.' + enc(date) + '&email_hash=eq.' + enc(hash)
          + '&select=status,attempt_count,claimed_at&order=sent_at.desc.nullslast&limit=1', { method: 'GET' }
      ));
      if (!rows[0]) return null;
      return {
        status: String(rows[0].status || ''),
        attemptCount: Number(rows[0].attempt_count || 0),
        claimedAt: rows[0].claimed_at ? new Date(String(rows[0].claimed_at)).getTime() : 0
      };
    },
    async claim(input: { sendDate: string; emailHash: string; localTime: string; now: Date }) {
      const existing = await this.peek(input.sendDate, input.emailHash);
      const decision = mailClaimDecision(existing, input.now.getTime());
      if (decision.action === 'skip') return { status: 'already', reason: decision.reason, attemptCount: existing ? existing.attemptCount : 0 };
      const nowIso = input.now.toISOString();
      if (decision.action === 'insert') {
        const inserted = await responseRows(await sb('gomna_mail_sends', {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify({
            send_date: input.sendDate, email_hash: input.emailHash, verse_id: 'daily',
            status: 'claimed', attempt_count: 1, local_time: input.localTime,
            claimed_at: nowIso, sent_at: null, updated_at: nowIso
          })
        }));
        if (inserted[0]) return { status: 'new', key: claimKey(input.sendDate, input.emailHash), attemptCount: 1 };
        return { status: 'already', reason: 'in_flight', attemptCount: 0 };
      }
      const nextAttempt = Number(existing && existing.attemptCount || 0) + 1;
      const rows = await responseRows(await sb(
        'gomna_mail_sends?send_date=eq.' + enc(input.sendDate) + '&email_hash=eq.' + enc(input.emailHash)
          + '&verse_id=eq.daily&status=eq.' + enc(String(existing && existing.status || 'failed'))
          + '&attempt_count=eq.' + Number(existing && existing.attemptCount || 0),
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          status: 'claimed', attempt_count: nextAttempt, local_time: input.localTime,
          claimed_at: nowIso, updated_at: nowIso
        }) }
      ));
      return rows[0]
        ? { status: 'retry', key: claimKey(input.sendDate, input.emailHash), attemptCount: nextAttempt }
        : { status: 'already', reason: 'in_flight', attemptCount: Number(existing && existing.attemptCount || 0) };
    },
    async markSent(key: string, now: Date, claim: { attemptCount: number }, sent: { id?: string }) {
      const part = splitClaimKey(key);
      const allowed = mailStatusWriteAllowed(await this.peek(part.date, part.hash), claim.attemptCount);
      if (!allowed.ok) return allowed;
      const rows = await responseRows(await sb(
        'gomna_mail_sends?send_date=eq.' + enc(part.date) + '&email_hash=eq.' + enc(part.hash)
          + '&verse_id=eq.daily&status=eq.claimed&attempt_count=eq.' + claim.attemptCount,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          status: 'sent', provider_id: sent.id || null, sent_at: now.toISOString(),
          error: null, last_error_kind: null, last_http_status: null, updated_at: now.toISOString()
        }) }
      ));
      return rows[0] ? { ok: true } : { ok: false, reason: 'attempt_mismatch' };
    },
    async markFailed(key: string, failed: { errorKind: string; statusCode: number; error?: string }, claim: { attemptCount: number }) {
      const part = splitClaimKey(key);
      const allowed = mailStatusWriteAllowed(await this.peek(part.date, part.hash), claim.attemptCount);
      if (!allowed.ok) return allowed;
      const body: Record<string, unknown> = {
        status: 'failed', error: String(failed.error || '').slice(0, 500),
        last_error_kind: failed.errorKind, last_http_status: failed.statusCode || 0,
        updated_at: new Date().toISOString()
      };
      if (!isRetryableMailError(failed.errorKind)) body.attempt_count = MAX_MAIL_SEND_ATTEMPTS;
      const rows = await responseRows(await sb(
        'gomna_mail_sends?send_date=eq.' + enc(part.date) + '&email_hash=eq.' + enc(part.hash)
          + '&verse_id=eq.daily&status=eq.claimed&attempt_count=eq.' + claim.attemptCount,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }
      ));
      return rows[0] ? { ok: true } : { ok: false, reason: 'attempt_mismatch' };
    }
  };
}

async function listActiveSubscribers() {
  const pageSize = 500;
  const all: SubRow[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const rows = await responseRows(await sb(
      'gomna_mail_subscribers?active=eq.true&order=email_hash.asc&select=email,email_hash,locale,timezone,send_time,active',
      { method: 'GET', headers: { Range: offset + '-' + (offset + pageSize - 1), 'Range-Unit': 'items' } }
    )) as SubRow[];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new Error('subscriber-limit-exceeded');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method' }, origin);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = body.mode === 'test' ? 'test' : 'daily';
  if (!await authorized(req, mode)) return json(401, { ok: false, error: 'unauthorized' }, origin);

  let rows: SubRow[];
  try { rows = await listActiveSubscribers(); }
  catch { return json(500, { ok: false, error: 'list-failed', failureClass: 'storage' }, origin); }
  if (mode === 'test') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return json(400, { ok: false, error: 'explicit-email-required' }, origin);
    rows = rows.filter((row) => row.email === email);
    if (rows.length !== 1) return json(404, { ok: false, error: 'subscriber-not-found' }, origin);
  }

  const now = body.now ? new Date(String(body.now)) : new Date();
  if (Number.isNaN(now.getTime())) return json(400, { ok: false, error: 'invalid-now' }, origin);
  const app = String(Deno.env.get('MAIL_APP_ORIGIN') || 'https://gomnastudio.com').replace(/\/$/, '');
  const dryRun = body.dryRun === true;
  const force = mode === 'test' || body.force === true;
  const requestedDate = body.date == null ? '' : String(body.date);
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return json(400, { ok: false, error: 'invalid-date' }, origin);

  const result = await runReliableMailSend({
    now, dryRun, force, subscriptions: rows,
    store: mode === 'test' ? createMemoryMailStore() : createRestMailStore(),
    async sendMail(row: SubRow, due: { sendDate: string }) {
      const date = requestedDate || due.sendDate;
      const payload = buildPayload({ date, locale: nativeLocale(row.locale) });
      const data = payload.data || {};
      const href = app + '/?source=home-today&date=' + encodeURIComponent(date)
        + '&book=' + encodeURIComponent(String(data.book || ''))
        + '&chapter=' + encodeURIComponent(String(data.chapter || ''))
        + '&start=' + encodeURIComponent(String(data.startVerse || ''))
        + '&end=' + encodeURIComponent(String(data.endVerse || ''));
      const unsub = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/mail-unsubscribe?t=' + encodeURIComponent(await unsubToken(row.email));
      const html = todayHtml(payload, href, unsub);
      const text = payload.title + '\n' + payload.body + '\n' + href;
      return sendResend(row.email, '오늘의 말씀 · ' + String((payload.body || '').split('\n')[0] || ''), html, text);
    }
  });
  console.log(JSON.stringify({ event: 'daily_mail_run', ok: result.ok, dryRun, scanned: result.scanned, due: result.due, sent: result.sent, failed: result.failed }));
  const status = result.ok ? 200 : result.failureClass === 'mail' ? 422 : 500;
  return json(status, { mode, ...result }, origin);
});
