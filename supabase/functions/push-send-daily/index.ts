import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json, sb } from '../_shared/push-http.ts';
import { buildPayload, kstDateKey } from '../_shared/today-word.ts';
import { dueSlots, localDateKey, prefsFromRow } from '../_shared/push-prefs.ts';

type SubRow = {
  endpoint: string;
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  locale: string;
  timezone?: string;
  frequency?: number;
  first_send_time?: string;
  second_send_time?: string;
  active: boolean;
};

function authorized(req: Request, mode: string) {
  const cron = Deno.env.get('PUSH_CRON_SECRET') || '';
  const dev = Deno.env.get('PUSH_DEV_SECRET') || '';
  const header = req.headers.get('x-gomna-push-cron') || req.headers.get('x-gomna-push-dev') || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (mode === 'daily') return !!cron && (header === cron || bearer === cron);
  if (mode === 'test') return !!dev && (header === dev || bearer === dev);
  return false;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { ok: false }, origin);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = body.mode === 'test' ? 'test' : 'daily';
  if (!authorized(req, mode)) return json(401, { ok: false, error: 'unauthorized' }, origin);

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'https://gomnastudio.com';
  if (!publicKey || !privateKey) return json(500, { ok: false, error: 'vapid-missing' }, origin);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const now = body.now ? new Date(String(body.now)) : new Date();
  const force = body.force === true || mode === 'test';
  const verseDate = String(body.date || kstDateKey(now));
  const listRes = await sb(
    'gomna_push_subscriptions?active=eq.true&select=endpoint,endpoint_hash,p256dh,auth,locale,timezone,frequency,first_send_time,second_send_time,active',
    { method: 'GET' }
  );
  if (!listRes.ok) return json(500, { ok: false, error: 'list-failed' }, origin);
  let rows = await listRes.json() as SubRow[];
  if (mode === 'test') {
    const want = String((body.subscription && (body.subscription as { endpoint?: string }).endpoint) || body.endpoint || '');
    rows = want ? rows.filter((r) => r.endpoint === want) : rows.slice(0, 1);
  }

  let sent = 0, skipped = 0, failed = 0, deactivated = 0;
  for (const row of rows) {
    const prefs = prefsFromRow(row as unknown as Record<string, unknown>);
    const slots = force
      ? (prefs.frequency === 2 ? ['first', 'second'] as const : ['first'] as const)
      : dueSlots(prefs, now);
    if (!slots.length) continue;
    const localDate = localDateKey(prefs.timezone, now);
    for (const slot of slots) {
      const payload = (mode === 'test' && body.useTodayWord !== true)
        ? {
          title: '은혜의말씀 테스트',
          body: '푸시 알림 연결 확인',
          lang: prefs.locale,
          tag: 'gomna-push-probe',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { source: 'home-today', probe: true, url: '/?source=home-today' }
        }
        : buildPayload({ date: verseDate, locale: prefs.locale, slot });
      if (mode !== 'test') {
        const exists = await sb(
          'gomna_push_sends?send_date=eq.' + localDate + '&endpoint_hash=eq.' + row.endpoint_hash + '&slot=eq.' + slot + '&select=slot',
          { method: 'GET' }
        );
        if (exists.ok) {
          const found = await exists.json();
          if (Array.isArray(found) && found.length) { skipped += 1; continue; }
        }
      }
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: 'normal' }
        );
        sent += 1;
        await sb('gomna_push_sends', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({
            send_date: localDate,
            endpoint_hash: row.endpoint_hash,
            verse_id: (payload as { verseId?: string }).verseId || payload.tag || slot,
            slot,
            status: 'sent'
          })
        });
      } catch (err) {
        failed += 1;
        const status = (err as { statusCode?: number }).statusCode || 0;
        if (status === 404 || status === 410) {
          deactivated += 1;
          await sb('gomna_push_subscriptions?endpoint_hash=eq.' + row.endpoint_hash, {
            method: 'PATCH',
            body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
          });
        }
      }
    }
  }
  return json(200, { ok: true, mode, date: verseDate, sent, skipped, failed, deactivated }, origin);
});
