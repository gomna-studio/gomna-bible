import { corsHeaders, json, nativeLocale, sha32, sb } from '../_shared/push-http.ts';

function normalizeEmail(raw: unknown) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e || e.length > 254) return '';
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return '';
  return e;
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
    if (!already) {
      const key = Deno.env.get('RESEND_API_KEY') || '';
      const from = Deno.env.get('MAIL_FROM') || '은혜의말씀 <beth.t@example.com>';
      if (key) {
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [email],
            subject: '은혜의말씀 이메일 테스트',
            text: '오늘의 말씀 이메일 연결이 완료되었습니다.',
            html: '<p>오늘의 말씀 이메일 연결이 완료되었습니다.</p>'
          })
        });
        mailed = send.ok;
      }
    }
    return json(200, { ok: true, active: true, already, mailed }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
