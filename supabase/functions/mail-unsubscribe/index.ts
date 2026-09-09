import { corsHeaders, json, sha32, sb } from '../_shared/push-http.ts';

function normalizeEmail(raw: unknown) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e || e.length > 254) return '';
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return '';
  return e;
}

async function tokenHash(email: string) {
  const secret = Deno.env.get('MAIL_UNSUB_SECRET') || Deno.env.get('PUSH_CRON_SECRET') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + email));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function page(ok: boolean) {
  const msg = ok ? '오늘의 말씀 이메일 수신이 해지되었습니다.' : '수신 해지 링크를 확인해 주세요.';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>은혜의말씀</title></head>'
    + '<body style="margin:0;padding:48px 24px;background:#FCFAF6;color:#152033;font-family:-apple-system,sans-serif;text-align:center;">'
    + '<p style="font-size:18px;font-weight:800;">은혜의말씀</p><p>' + msg + '</p></body></html>';
}

async function deactivateByHash(hash: string) {
  return sb('gomna_mail_subscribers?email_hash=eq.' + hash, {
    method: 'PATCH',
    body: JSON.stringify({ active: false, unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method === 'GET') {
    const token = url.searchParams.get('t') || '';
    const list = await sb('gomna_mail_subscribers?select=email,email_hash,active', { method: 'GET' });
    const rows = list.ok ? await list.json() as { email: string; email_hash: string; active: boolean }[] : [];
    let hit = null as { email: string; email_hash: string } | null;
    for (const row of rows) {
      if (await tokenHash(row.email) === token) { hit = row; break; }
    }
    if (hit) await deactivateByHash(hit.email_hash);
    return new Response(page(!!hit), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (!email) return json(200, { ok: true, active: false }, origin);
  const hash = await sha32(email);
  await deactivateByHash(hash);
  return json(200, { ok: true, active: false }, origin);
});
