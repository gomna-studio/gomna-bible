import { corsHeaders, json, sha32, sb } from '../_shared/push-http.ts';
import { prefsFromRow } from '../_shared/push-prefs.ts';

function endpointOf(body: Record<string, unknown>) {
  const sub = (body.subscription && typeof body.subscription === 'object') ? body.subscription as Record<string, unknown> : body;
  return String(sub.endpoint || body.endpoint || '');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const endpoint = endpointOf(body);
    if (!endpoint) return json(400, { ok: false, error: 'invalid-subscription' }, origin);
    const hash = await sha32(endpoint);
    const res = await sb(
      'gomna_push_subscriptions?endpoint_hash=eq.' + hash + '&select=endpoint_hash,active,frequency,first_send_time,second_send_time,timezone,locale',
      { method: 'GET' }
    );
    if (!res.ok) return json(500, { ok: false, error: 'read-failed' }, origin);
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] as Record<string, unknown> : null;
    if (!row) {
      return json(200, { ok: true, found: false, active: false, preferences: prefsFromRow({ active: false }) }, origin);
    }
    const prefs = prefsFromRow(row);
    return json(200, {
      ok: true,
      found: true,
      id: hash,
      active: !!row.active,
      preferences: prefs
    }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
