import { corsHeaders, json, nativeLocale, sha32, sb } from '../_shared/push-http.ts';
import { buildPayload, kstDateKey } from '../_shared/today-word.ts';

function normalizeEmail(raw: unknown) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e || e.length > 254) return '';
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return '';
  return e;
}

function escapeHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrap(inner: string) {
  return '<!DOCTYPE html><html lang="ko"><body style="margin:0;padding:24px;background:#FCFAF6;color:#152033;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;">'
    + '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;">' + inner + '</div></body></html>';
}

function confirmationHtml(payload: ReturnType<typeof buildPayload>, href: string, unsub: string) {
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
    + '<p style="margin:28px 0 8px;font-size:12px;color:#8a929c;">오늘의 말씀 이메일 수신이 시작되었습니다.</p>'
    + '<p><a href="' + escapeHtml(unsub) + '" style="font-size:12px;color:#8a929c;">수신 해지</a></p>'
  );
}

async function unsubToken(email: string) {
  const secret = Deno.env.get('MAIL_UNSUB_SECRET') || Deno.env.get('PUSH_CRON_SECRET') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + email));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    if (!email) return json(400, { ok: false, error: 'invalid-email' }, origin);
    if (body.consent !== true && body.consent !== '1' && body.consent !== 1) {
      return json(400, { ok: false, error: 'consent-required' }, origin);
    }
    const hash = await sha32(email);
    const now = new Date().toISOString();
    const existing = await sb('gomna_mail_subscribers?email_hash=eq.' + hash + '&select=active,consented_at,created_at', { method: 'GET' });
    const rows = existing.ok ? await existing.json() : [];
    const prev = Array.isArray(rows) && rows[0] ? rows[0] as { active?: boolean; consented_at?: string; created_at?: string } : null;
    const already = !!(prev && prev.active);
    const row = {
      email,
      email_hash: hash,
      active: true,
      locale: nativeLocale(body.locale),
      timezone: String(body.timezone || 'Asia/Seoul').slice(0, 64),
      consented_at: prev && prev.consented_at ? prev.consented_at : now,
      updated_at: now,
      unsubscribed_at: null
    };
    const res = await sb('gomna_mail_subscribers?on_conflict=email_hash', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    });
    if (!res.ok) return json(500, { ok: false, error: 'save-failed' }, origin);
    let mailed = false;
    let mailId = '';
    let mailError = '';
    if (!already) {
      const key = Deno.env.get('RESEND_API_KEY') || '';
      const from = Deno.env.get('MAIL_FROM') || '은혜의말씀 <beth.t@example.com>';
      if (key) {
        const date = kstDateKey();
        const payload = buildPayload({ date, locale: nativeLocale(body.locale) });
        const data = payload.data || {};
        const app = String(Deno.env.get('MAIL_APP_ORIGIN') || 'https://gomnastudio.com').replace(/\/$/, '');
        const href = app + '/?source=home-today&date=' + encodeURIComponent(date)
          + '&book=' + encodeURIComponent(String(data.book || ''))
          + '&chapter=' + encodeURIComponent(String(data.chapter || ''))
          + '&start=' + encodeURIComponent(String(data.startVerse || ''))
          + '&end=' + encodeURIComponent(String(data.endVerse || ''));
        const unsub = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/mail-unsubscribe?t=' + encodeURIComponent(await unsubToken(email));
        const html = confirmationHtml(payload, href, unsub);
        const text = payload.title + '\n' + payload.body + '\n' + href;
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [email],
            subject: '오늘의 말씀 이메일 수신이 시작되었습니다',
            text,
            html
          })
        });
        const sendBody = await send.json().catch(() => ({})) as { id?: string; message?: string };
        mailed = send.ok;
        mailId = mailed ? String(sendBody.id || '') : '';
        mailError = mailed ? '' : String(sendBody.message || send.status);
        console.log(JSON.stringify({ event: 'mail-confirmation', mailed, mailId, mailError }));
      }
    }
    return json(200, { ok: true, active: true, already, mailed, mailId, mailError }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
