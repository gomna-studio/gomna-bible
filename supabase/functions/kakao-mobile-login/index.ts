/* 은혜의말씀 — 카카오톡 간편로그인(모바일) 전용 인가 코드 교환
   인가 코드를 카카오 토큰 엔드포인트와 서버에서 교환해 id_token을 받는다.
   access_token은 닉네임 조회에만 쓰고 브라우저로 돌려주지 않는다.
   브라우저는 id_token으로 supabase.auth.signInWithIdToken({ provider:'kakao' })를 부른다.
   비밀값은 코드에 두지 않고 환경변수로만 읽는다: KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET
   (Client Secret은 카카오 앱에서 사용하도록 설정한 경우에만 필요하다.)
   refresh_token·프로필 사진 URL·사용자 정보 원문은 돌려주지 않는다. */

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

function readNickname(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const account = (data as { kakao_account?: { profile?: { nickname?: unknown; is_default_nickname?: unknown } } }).kakao_account;
  const profile = account && account.profile;
  if (profile && profile.is_default_nickname === true) return '';
  const nick = profile && typeof profile.nickname === 'string' ? profile.nickname.trim() : '';
  if (nick === '' || nick === '이름 없음') return '';
  return nick.length > 30 ? nick.slice(0, 30) : nick;
}

/* 닉네임만 요청한다. 프로필 사진 키는 넣지 않는다. 실패해도 로그인을 막지 않는다. */
async function fetchKakaoNickname(accessToken: string): Promise<string> {
  if (accessToken === '') return '';
  try {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams({
        property_keys: JSON.stringify(['kakao_account.profile.nickname'])
      })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return '';
    return readNickname(data);
  } catch {
    return '';
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
  let accessToken = '';
  let kakaoStatus = 0;
  let kakaoError = '';
  let kakaoErrorCode = '';
  try {
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: form
    });
    kakaoStatus = res.status;
    const data = await res.json().catch(() => null);
    if (data && typeof data === 'object') {
      if (typeof data.id_token === 'string') idToken = data.id_token;
      if (typeof data.access_token === 'string') accessToken = data.access_token;
      if (typeof data.error === 'string') kakaoError = data.error;
      if (typeof data.error_code === 'string') kakaoErrorCode = data.error_code;
    }
  } catch {
    idToken = '';
    accessToken = '';
  }

  try {
    const redirect = new URL(redirectUri);
    console.log(JSON.stringify({
      stage: 'kakao_token',
      kakao_status: kakaoStatus,
      kakao_error: kakaoError,
      kakao_error_code: kakaoErrorCode,
      has_client_secret: clientSecret !== '',
      redirect_origin: redirect.origin,
      redirect_path: redirect.pathname
    }));
  } catch {
    console.log(JSON.stringify({
      stage: 'kakao_token',
      kakao_status: kakaoStatus,
      kakao_error: kakaoError,
      kakao_error_code: kakaoErrorCode,
      has_client_secret: clientSecret !== ''
    }));
  }

  /* 비밀값·토큰·인가 코드는 로그와 응답에 넣지 않는다. */
  if (idToken === '') {
    if (accessToken !== '') {
      accessToken = '';
      return json(400, { error: 'kakao_id_token_missing' }, origin);
    }
    return json(400, {
      error: 'kakao_token_failed',
      kakao_error: kakaoError,
      kakao_error_code: kakaoErrorCode
    }, origin);
  }

  const nickname = await fetchKakaoNickname(accessToken);
  accessToken = '';

  return json(200, { id_token: idToken, nickname: nickname }, origin);
});
