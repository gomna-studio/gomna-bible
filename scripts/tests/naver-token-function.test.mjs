import assert from 'node:assert/strict';
import test from 'node:test';

const { handleNaverToken, readBasicCredentials } = await import(
  '../../supabase/functions/naver-token/index.ts'
);

test('decodes percent-escaped Basic credentials', () => {
  const encoded = Buffer.from('client%20id:secret%2Bvalue').toString('base64');
  assert.deepEqual(readBasicCredentials(`Basic ${encoded}`), {
    clientId: 'client id',
    clientSecret: 'secret+value'
  });
});

test('rejects malformed requests before contacting Naver', async () => {
  const wrongMethod = await handleNaverToken(new Request('https://example.test'));
  assert.equal(wrongMethod.status, 405);

  const wrongType = await handleNaverToken(new Request('https://example.test', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json' }
  }));
  assert.equal(wrongType.status, 415);

  const noCredentials = await handleNaverToken(new Request('https://example.test', {
    method: 'POST',
    body: 'grant_type=authorization_code',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }));
  assert.equal(noCredentials.status, 401);
});

test('moves Basic credentials into the Naver form body', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ access_token: 'token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const encoded = Buffer.from('client-id:client-secret').toString('base64');
  const response = await handleNaverToken(new Request('https://example.test', {
    method: 'POST',
    body: 'grant_type=authorization_code&code=one-time-code',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }));

  assert.equal(response.status, 200);
  assert.equal(captured.url, 'https://nid.naver.com/oauth2/token');
  assert.equal(captured.init.headers.Authorization, undefined);

  const forwarded = new URLSearchParams(captured.init.body);
  assert.equal(forwarded.get('client_id'), 'client-id');
  assert.equal(forwarded.get('client_secret'), 'client-secret');
  assert.equal(forwarded.get('code'), 'one-time-code');
});
