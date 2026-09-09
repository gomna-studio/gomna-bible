import { corsHeaders, json, nativeLocale, sha32, sb } from '../_shared/push-http.ts';
import { normalizePrefs } from '../_shared/push-prefs.ts';

function keysFrom(body: Record<string, unknown>) {
  const sub = (body.subscription && typeof body.subscription === 'object') ? body.subscription as Record<string, unknown> : body;
  const keys = (sub.keys && typeof sub.keys === 'object') ? sub.keys as Record<string, unknown> : {};
  return {
    endpoint: String(sub.endpoint || ''),
    p256dh: String(keys.p256dh || sub.p256dh || ''),
    auth: String(keys.auth || sub.auth || '')
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const keys = keysFrom(body);
    if (!keys.endpoint || !keys.p256dh || !keys.auth) return json(400, { ok: false, error: 'invalid-subscription' }, origin);
    const hash = await sha32(keys.endpoint);
    const row: Record<string, unknown> = {
      endpoint_hash: hash,
      endpoint: keys.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      locale: nativeLocale(body.locale),
      timezone: String(body.timezone || '').slice(0, 64) || 'UTC',
      active: true,
      updated_at: new Date().toISOString()
    };
    if (body.frequency != null || body.firstTime || body.first_send_time || body.secondTime || body.second_send_time) {
      const prefs = normalizePrefs(body);
      row.frequency = prefs.frequency;
      row.first_send_time = prefs.firstTime;
      row.second_send_time = prefs.secondTime;
      row.timezone = prefs.timezone;
      row.locale = prefs.locale;
    }
    const res = await sb('gomna_push_subscriptions?on_conflict=endpoint_hash', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row)
    });
    if (!res.ok) return json(500, { ok: false, error: 'save-failed' }, origin);
    const saved = await res.json().catch(() => []);
    const rec = Array.isArray(saved) ? saved[0] : saved;
    const prefs = normalizePrefs({
      enabled: true,
      frequency: rec && rec.frequency,
      firstTime: rec && rec.first_send_time,
      secondTime: rec && rec.second_send_time,
      timezone: rec && rec.timezone,
      locale: rec && rec.locale
    }, row);
    return json(200, { ok: true, id: hash, active: true, preferences: prefs }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
