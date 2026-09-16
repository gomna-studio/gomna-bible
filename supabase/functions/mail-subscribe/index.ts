import { corsHeaders, json, nativeLocale, sha32, sb } from '../_shared/push-http.ts';
import { isValidMailTimezone, parseMailTime } from '../_shared/mail-reliable.mjs';

function normalizeEmail(raw: unknown) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e || e.length > 254) return '';
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return '';
  return e;
}

function formatClock(hhmm: string) {
  const time = parseMailTime(hhmm) || { hour: 7, minute: 30 };
  const period = time.hour < 12 ? '오전' : '오후';
  return period + ' ' + String((time.hour % 12) || 12) + ':' + String(time.minute).padStart(2, '0');
}

function confirmationHtml(sendTime: string) {
  return '<!DOCTYPE html><html lang="ko"><body style="margin:0;padding:24px;background:#FCFAF6;color:#152033;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;padding:30px 24px;">'
    + '<p style="margin:0;font-size:20px;font-weight:800;">은혜의말씀</p>'
    + '<p style="margin:4px 0 24px;font-size:13px;color:#7d8794;font-style:italic;">Words of Grace</p>'
    + '<h1 style="margin:0 0 12px;font-size:22px;">이메일 수신 신청이 완료되었습니다</h1>'
    + '<p style="margin:0;line-height:1.7;">매일 <strong>' + formatClock(sendTime) + '</strong>에 오늘의 말씀을 보내드릴게요.</p>'
    + '<p style="margin:20px 0 0;font-size:13px;color:#7d8794;">수신 시간은 은혜의말씀에서 언제든 변경할 수 있습니다.</p>'
    + '</div></body></html>';
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
    const timezone = String(body.timezone || '').trim();
    const sendTime = parseMailTime(body.sendTime || body.send_time);
    if (!isValidMailTimezone(timezone)) return json(400, { ok: false, error: 'invalid-timezone' }, origin);
    if (!sendTime) return json(400, { ok: false, error: 'invalid-send-time' }, origin);
    const existing = await sb('gomna_mail_subscribers?email_hash=eq.' + hash + '&select=active,consented_at,created_at', { method: 'GET' });
    const rows = existing.ok ? await existing.json() : [];
    const prev = Array.isArray(rows) && rows[0] ? rows[0] as { active?: boolean; consented_at?: string; created_at?: string } : null;
    const already = !!(prev && prev.active);
    const row = {
      email,
      email_hash: hash,
      active: true,
      locale: nativeLocale(body.locale),
      timezone,
      send_time: sendTime.hhmm,
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
    if (!already) {
      const key = Deno.env.get('RESEND_API_KEY') || '';
      const from = Deno.env.get('MAIL_FROM') || '은혜의말씀 <noreply@gomnastudio.com>';
      if (key) {
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [email],
            subject: '은혜의말씀 이메일 수신 신청이 완료되었습니다',
            text: '이메일 수신 신청이 완료되었습니다. 매일 ' + formatClock(sendTime.hhmm) + '에 오늘의 말씀을 보내드릴게요.',
            html: confirmationHtml(sendTime.hhmm)
          })
        });
        mailed = send.ok;
      }
    }
    return json(200, { ok: true, active: true, already, mailed, sendTime: sendTime.hhmm, timezone }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
