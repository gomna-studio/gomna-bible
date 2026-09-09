const DEFAULT_ORIGINS = [
  'https://gomnastudio.com',
  'https://www.gomnastudio.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

export function corsHeaders(origin: string): Record<string, string> {
  const extra = (Deno.env.get('GOMNA_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
  const allowed = DEFAULT_ORIGINS.concat(extra);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-gomna-push-dev, x-gomna-push-cron, x-gomna-mail-cron, x-gomna-mail-dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
  if (origin && allowed.indexOf(origin) !== -1) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

export function nativeLocale(raw: unknown): 'ko' | 'en' | 'ja' | 'zh' {
  const s = String(raw || 'ko').toLowerCase();
  if (s === 'en' || s === 'ja' || s === 'zh' || s === 'ko') return s;
  return 'ko';
}

export async function sha32(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return null;
  return { url, key };
}

export async function sb(path: string, init: RequestInit) {
  const admin = adminClient();
  if (!admin) throw new Error('no-admin');
  const res = await fetch(admin.url + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: admin.key,
      Authorization: 'Bearer ' + admin.key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {})
    }
  });
  return res;
}
