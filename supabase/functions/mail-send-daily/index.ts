import { corsHeaders, json, sb } from '../_shared/push-http.ts';
import { buildPayload, kstDateKey, nativeLocale } from '../_shared/today-word.ts';

type SubRow = { email: string; email_hash: string; locale: string; active: boolean };

function authorized(req: Request, mode: string) {
  const cron = Deno.env.get('MAIL_CRON_SECRET') || Deno.env.get('PUSH_CRON_SECRET') || '';
  const dev = Deno.env.get('MAIL_DEV_SECRET') || Deno.env.get('PUSH_DEV_SECRET') || '';
  const header = req.headers.get('x-gomna-mail-cron') || req.headers.get('x-gomna-push-cron') || req.headers.get('x-gomna-mail-dev') || req.headers.get('x-gomna-push-dev') || '';
  if (mode === 'daily') return !!cron && header === cron;
  if (mode === 'test') return !!dev && header === dev;
  return false;
}

function escapeHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  const secret = Deno.env.get('MAIL_UNSUB_SECRET') || Deno.env.get('PUSH_CRON_SECRET') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + email));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function sendResend(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('MAIL_FROM') || '은혜의말씀 <beth.t@example.com>';
  if (!key) return { ok: false, invalid: false, id: '', error: 'provider-missing' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text })
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, invalid: res.status === 422, id: '', error: String(body.message || res.status) };
  return { ok: true, invalid: false, id: String(body.id || ''), error: '' };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = body.mode === 'test' ? 'test' : 'daily';
  if (!authorized(req, mode)) return json(401, { ok: false, error: 'unauthorized' }, origin);

  const date = String(body.date || kstDateKey());
  const app = String(Deno.env.get('MAIL_APP_ORIGIN') || 'https://gomnastudio.com').replace(/\/$/, '');
  const listRes = await sb('gomna_mail_subscribers?active=eq.true&select=email,email_hash,locale,active', { method: 'GET' });
  if (!listRes.ok) return json(500, { ok: false, error: 'list-failed' }, origin);
  let rows = await listRes.json() as SubRow[];
  if (mode === 'test') {
    const want = String(body.email || '').trim().toLowerCase();
    rows = want ? rows.filter((r) => r.email === want) : rows.slice(0, 1);
  }

  let sent = 0, skipped = 0, failed = 0, deactivated = 0;
  for (const row of rows) {
    const payload = buildPayload({ date, locale: nativeLocale(row.locale) });
    const verseId = String(payload.verseId || date);
    if (mode !== 'test') {
      const exists = await sb(
        'gomna_mail_sends?send_date=eq.' + date + '&email_hash=eq.' + row.email_hash + '&verse_id=eq.' + encodeURIComponent(verseId) + '&select=verse_id',
        { method: 'GET' }
      );
      if (exists.ok) {
        const found = await exists.json();
        if (Array.isArray(found) && found.length) { skipped += 1; continue; }
      }
    }
    const data = payload.data || {};
    const href = app + '/?source=home-today&date=' + encodeURIComponent(date)
      + '&book=' + encodeURIComponent(String(data.book || ''))
      + '&chapter=' + encodeURIComponent(String(data.chapter || ''))
      + '&start=' + encodeURIComponent(String(data.startVerse || ''))
      + '&end=' + encodeURIComponent(String(data.endVerse || ''));
    const unsub = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/mail-unsubscribe?t=' + encodeURIComponent(await unsubToken(row.email));
    const html = todayHtml(payload, href, unsub);
    const text = payload.title + '\n' + payload.body + '\n' + href;
    const result = await sendResend(row.email, '오늘의 말씀 · ' + String((payload.body || '').split('\n')[0] || ''), html, text);
    if (result.ok) {
      sent += 1;
      await sb('gomna_mail_sends', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ send_date: date, email_hash: row.email_hash, verse_id: verseId, status: 'sent', provider_id: result.id })
      });
    } else {
      failed += 1;
      if (result.invalid) {
        deactivated += 1;
        await sb('gomna_mail_subscribers?email_hash=eq.' + row.email_hash, {
          method: 'PATCH',
          body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
        });
      }
    }
  }
  return json(200, { ok: true, mode, date, sent, skipped, failed, deactivated }, origin);
});
