/* 은혜의말씀 — 네이버 로그인 사용자 정보 변환기
   Supabase Custom OAuth가 읽을 수 있도록 네이버의 중첩 응답을 표준 클레임으로 평탄화한다.
   전달받은 네이버 access token은 고정된 네이버 사용자 정보 API에만 보내며 저장하거나 기록하지 않는다.

   이 함수의 Authorization 헤더에는 Supabase JWT가 아니라 네이버 access token이 들어오므로
   배포할 때 JWT 검증을 끄고(verify_jwt = false) 사용해야 한다. */

type NaverProfile = {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  nickname?: unknown;
  profile_image?: unknown;
};

type NaverResponse = {
  resultcode?: unknown;
  message?: unknown;
  response?: NaverProfile;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function flattenNaverProfile(data: NaverResponse): Record<string, unknown> | null {
  if (cleanString(data.resultcode) !== '00' || !data.response) return null;

  const id = cleanString(data.response.id);
  if (id === '') return null;

  const email = cleanString(data.response.email);
  const name = cleanString(data.response.name);
  const nickname = cleanString(data.response.nickname);
  const picture = cleanString(data.response.profile_image);

  return {
    sub: id,
    provider_id: id,
    ...(email !== '' ? { email, email_verified: true } : {}),
    ...(name !== '' ? { name, full_name: name } : {}),
    ...(nickname !== '' ? { nickname, preferred_username: nickname } : {}),
    ...(picture !== '' ? { picture, avatar_url: picture } : {})
  };
}

export async function handleNaverUserinfo(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  const authorization = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json(401, { error: 'missing_bearer_token' });
  }

  let response: Response;
  try {
    response = await fetch('https://openapi.naver.com/v1/nid/me', {
      method: 'GET',
      headers: {
        Authorization: authorization,
        Accept: 'application/json'
      }
    });
  } catch {
    return json(502, { error: 'naver_userinfo_unavailable' });
  }

  const data = await response.json().catch(() => null) as NaverResponse | null;
  if (!response.ok || !data) {
    return json(response.status === 401 ? 401 : 502, { error: 'naver_userinfo_failed' });
  }

  const claims = flattenNaverProfile(data);
  if (!claims) return json(502, { error: 'invalid_naver_profile' });
  return json(200, claims);
}

if (typeof Deno !== 'undefined') Deno.serve(handleNaverUserinfo);
