/* 은혜의말씀 — 카카오톡 간편로그인(모바일) 전용 인가 코드 교환
   하는 일은 딱 하나다: 인가 코드를 카카오 토큰 엔드포인트와 서버에서 교환해 id_token만 돌려준다.
   브라우저는 그 id_token으로 supabase.auth.signInWithIdToken({ provider:'kakao' })만 부른다.
   비밀값은 코드에 두지 않고 환경변수로만 읽는다: KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET
   (Client Secret은 카카오 앱에서 사용하도록 설정한 경우에만 필요하다.)
   access_token·refresh_token은 돌려주지 않고, account_email 같은 동의 항목도 요청하지 않는다. */

const DEFAULT_ORIGINS = [
  'https://gomnastudio.com',
  'https://www.gomnastudio.com',
  'http://localhost:8797',
  'http://127.0.0.1:8797'
];

function allowedOrigins(): string[] {
  const extra = (Deno.env.get('GOMNA_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
  return DEFAULT_ORIGINS.concat(extra);
}

function corsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
  if (origin !== '' && allowedOrigins().indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

/* 복귀 주소는 우리 사이트의 콜백 경로만 허용한다(임의 주소로의 코드 사용 방지). */
function redirectAllowed(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (allowedOrigins().indexOf(url.origin) === -1) return false;
    return url.pathname === '/auth/callback.html';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);
  if (origin !== '' && allowedOrigins().indexOf(origin) === -1) {
    return json(403, { error: 'origin_not_allowed' }, origin);
  }

  let code = '';
  let redirectUri = '';
  try {
    const body = await req.json();
    code = typeof body?.code === 'string' ? body.code : '';
    redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
  } catch {
    return json(400, { error: 'bad_request' }, origin);
  }
  if (code === '' || !redirectAllowed(redirectUri)) return json(400, { error: 'bad_request' }, origin);

  const restKey = Deno.env.get('KAKAO_REST_API_KEY') ?? '';
  if (restKey === '') return json(500, { error: 'not_configured' }, origin);
  const clientSecret = Deno.env.get('KAKAO_CLIENT_SECRET') ?? '';

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restKey,
    redirect_uri: redirectUri,
    code
  });
  if (clientSecret !== '') form.set('client_secret', clientSecret);

  let idToken = '';
  try {
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: form
    });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.id_token === 'string') idToken = data.id_token;
  } catch {
    idToken = '';
  }

  /* 카카오 원문 오류는 그대로 흘리지 않는다(비밀값·내부 정보 노출 방지). */
  if (idToken === '') return json(400, { error: 'kakao_token_failed' }, origin);

  return json(200, { id_token: idToken }, origin);
});
