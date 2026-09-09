import { corsHeaders, json, sha32, sb } from '../_shared/push-http.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sub = (body.subscription && typeof body.subscription === 'object') ? body.subscription as Record<string, unknown> : body;
    const endpoint = String(sub.endpoint || body.endpoint || '');
    if (!endpoint) return json(400, { ok: false, error: 'invalid-subscription' }, origin);
    const hash = await sha32(endpoint);
    const res = await sb('gomna_push_subscriptions?endpoint_hash=eq.' + hash, {
      method: 'PATCH',
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
    });
    if (!res.ok) return json(500, { ok: false, error: 'save-failed' }, origin);
    return json(200, { ok: true, active: false }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
