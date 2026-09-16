import { corsHeaders, json, sha32, sb } from '../_shared/push-http.ts';

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
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (!email) return json(200, { ok: true, active: false }, origin);
  const hash = await sha32(email);
  const res = await sb('gomna_mail_subscribers?email_hash=eq.' + hash + '&select=active,send_time,timezone', { method: 'GET' });
  const rows = res.ok ? await res.json() as { active?: boolean; send_time?: string; timezone?: string }[] : [];
  const row = rows[0] || null;
  return json(200, {
    ok: true,
    active: !!(row && row.active),
    email,
    sendTime: String(row && row.send_time || '07:30').slice(0, 5),
    timezone: String(row && row.timezone || '')
  }, origin);
});
