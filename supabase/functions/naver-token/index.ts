/* 은혜의말씀 — 네이버 OAuth 토큰 요청 호환 중계기
   Supabase가 HTTP Basic으로 전달한 클라이언트 자격 증명을 네이버가 요구하는
   application/x-www-form-urlencoded 본문 형식으로 옮긴다.
   코드와 비밀키는 저장하거나 기록하지 않고 네이버 토큰 API로만 전달한다. */

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2/token';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function readBasicCredentials(authorization: string): {
  clientId: string;
  clientSecret: string;
} | null {
  const match = /^Basic\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;

  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    if (separator < 1) return null;

    const clientId = decodeURIComponent(decoded.slice(0, separator));
    const clientSecret = decodeURIComponent(decoded.slice(separator + 1));
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

export async function handleNaverToken(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return json(415, { error: 'unsupported_media_type' });
  }

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const credentials = readBasicCredentials(req.headers.get('authorization') ?? '');

  if (credentials) {
    params.set('client_id', credentials.clientId);
    params.set('client_secret', credentials.clientSecret);
  }

  if (!params.get('client_id') || !params.get('client_secret')) {
    return json(401, { error: 'missing_client_credentials' });
  }

  let upstream: Response;
  try {
    upstream = await fetch(NAVER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });
  } catch {
    return json(502, { error: 'naver_token_unavailable' });
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

if (typeof Deno !== 'undefined') Deno.serve(handleNaverToken);
