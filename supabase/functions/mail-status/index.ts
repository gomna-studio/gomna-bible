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
  const res = await sb('gomna_mail_subscribers?email_hash=eq.' + hash + '&select=active', { method: 'GET' });
  const rows = res.ok ? await res.json() as { active?: boolean }[] : [];
  return json(200, { ok: true, active: !!(rows[0] && rows[0].active), email }, origin);
});
