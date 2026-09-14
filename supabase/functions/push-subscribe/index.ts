import webpush from 'npm:web-push@3.6.7';
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

async function sendConfirmation(keys: { endpoint: string; p256dh: string; auth: string }) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'https://gomnastudio.com';
  if (!publicKey || !privateKey) throw new Error('vapid-missing');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  await webpush.sendNotification(
    { endpoint: keys.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    JSON.stringify({
      title: '은혜의말씀',
      body: '말씀 알림이 설정되었습니다.',
      lang: 'ko',
      tag: 'gomna-push-confirmed',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { source: 'notification-settings', probe: true, url: '/?source=notification-settings' }
    }),
    { TTL: 60 * 60, urgency: 'high' }
  );
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
    if (body.frequency != null || body.firstTime || body.first_send_time || body.secondTime || body.second_send_time || body.scheduleMode || body.schedule_mode || body.intervalHours || body.interval_hours || body.intervalStartTime || body.interval_start_time || body.intervalEndTime || body.interval_end_time) {
      const prefs = normalizePrefs(body);
      row.schedule_mode = prefs.scheduleMode;
      row.frequency = prefs.frequency;
      row.first_send_time = prefs.firstTime;
      row.second_send_time = prefs.secondTime;
      row.interval_hours = prefs.intervalHours;
      row.interval_start_time = prefs.intervalStartTime;
      row.interval_end_time = prefs.intervalEndTime;
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
      scheduleMode: rec && rec.schedule_mode,
      frequency: rec && rec.frequency,
      firstTime: rec && rec.first_send_time,
      secondTime: rec && rec.second_send_time,
      intervalHours: rec && rec.interval_hours,
      intervalStartTime: rec && rec.interval_start_time,
      intervalEndTime: rec && rec.interval_end_time,
      timezone: rec && rec.timezone,
      locale: rec && rec.locale
    }, row);
    let confirmationSent = false;
    if (body.sendProbe === true) {
      try {
        await sendConfirmation(keys);
        confirmationSent = true;
      } catch {
        confirmationSent = false;
      }
    }
    return json(200, { ok: true, id: hash, active: true, preferences: prefs, confirmationSent }, origin);
  } catch {
    return json(500, { ok: false, error: 'server' }, origin);
  }
});
