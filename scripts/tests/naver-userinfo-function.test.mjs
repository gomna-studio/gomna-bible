import assert from 'node:assert/strict';
import test from 'node:test';

const { flattenNaverProfile, handleNaverUserinfo } = await import(
  '../../supabase/functions/naver-userinfo/index.ts'
);

test('flattens Naver response into OAuth claims', () => {
  assert.deepEqual(flattenNaverProfile({
    resultcode: '00',
    response: {
      id: 'naver-user-1',
      email: 'person@example.com',
      name: '홍길동',
      nickname: '길동',
      profile_image: 'https://example.com/profile.png'
    }
  }), {
    sub: 'naver-user-1',
    provider_id: 'naver-user-1',
    email: 'person@example.com',
    email_verified: true,
    name: '홍길동',
    full_name: '홍길동',
    nickname: '길동',
    preferred_username: '길동',
    picture: 'https://example.com/profile.png',
    avatar_url: 'https://example.com/profile.png'
  });
});

test('rejects malformed Naver responses', () => {
  assert.equal(flattenNaverProfile({ resultcode: '00', response: {} }), null);
  assert.equal(flattenNaverProfile({ resultcode: '99', response: { id: 'x' } }), null);
});

test('requires GET and a bearer token before contacting Naver', async () => {
  const wrongMethod = await handleNaverUserinfo(new Request('https://example.test', { method: 'POST' }));
  assert.equal(wrongMethod.status, 405);

  const noToken = await handleNaverUserinfo(new Request('https://example.test'));
  assert.equal(noToken.status, 401);
});
