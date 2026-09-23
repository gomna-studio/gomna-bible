import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../../js/gomna-auth.js', import.meta.url), 'utf8');
const home = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const callback = await readFile(new URL('../../auth/callback.html', import.meta.url), 'utf8');
const reader = await readFile(new URL('../../reader.html', import.meta.url), 'utf8');

function functionBody(name) {
  const start = auth.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = auth.indexOf('\n  function ', start + 1);
  return auth.slice(start, next === -1 ? auth.length : next);
}

test('Google legacy hit target starts authentication on the first click', () => {
  const body = functionBody('onGoogleButtonClick');
  assert.match(body, /startOAuth\('google', button, true\)/);
  assert.doesNotMatch(body, /loadGoogleGis/);
  assert.doesNotMatch(body, /renderGoogleButton/);
});

test('Google uses one OAuth redirect path and never renders a transparent GIS overlay', () => {
  const refreshBody = functionBody('refreshGoogleButtons');
  const queueBody = functionBody('queueGoogleButtonRefresh');
  assert.doesNotMatch(refreshBody, /loadGoogleGis|renderGoogleButton/);
  assert.doesNotMatch(queueBody, /setTimeout|refreshGoogleButtons/);
});

test('home, reader and callback load the same auth asset version', () => {
  const homeVersion = home.match(/gomna-auth\.js\?v=([^"']+)/)?.[1];
  const callbackVersion = callback.match(/gomna-auth\.js\?v=([^"']+)/)?.[1];
  const readerVersion = reader.match(/gomna-auth\.js\?v=([^"']+)/)?.[1];
  assert.ok(homeVersion);
  assert.equal(callbackVersion, homeVersion);
  assert.equal(readerVersion, homeVersion);
});

test('password recovery is captured on callback and reopened on the app page', () => {
  assert.match(auth, /event !== 'PASSWORD_RECOVERY'/);
  assert.match(auth, /writeStore\(RECOVERY_KEY, '1'\)/);
  assert.match(auth, /redirectTo: redirectTo \+ '\?action=password-recovery'/);
  assert.match(auth, /params\.get\('action'\) === 'password-recovery'/);
  assert.match(auth, /openPendingPasswordRecovery\(session\)/);
  assert.match(auth, /setEmailMode\('newpw'\)/);
});

test('OTP screen exposes a path to password login', () => {
  assert.match(auth, /emailMode !== 'otp' && emailMode !== 'signup' && emailMode !== 'reset'/);
  assert.match(auth, /emailMode === 'otp'\) \? '비밀번호로 로그인'/);
});

test('production does not persist temporary auth diagnostics', () => {
  const body = functionBody('debugNote');
  assert.match(body, /if \(!isLocalHost\(\)\) return/);
});

test('returning from an external provider unlocks login controls', () => {
  assert.match(auth, /addEventListener\('pageshow', resetSignInBusy\)/);
  assert.doesNotMatch(auth, /addEventListener\('focus', resetSignInBusy\)/);
});

test('Naver display name prefers member name, then nickname, without exposing the login id', () => {
  const body = functionBody('metaDisplayName');
  assert.match(body, /pickProvider\(user\) === 'naver'/);
  assert.ok(body.indexOf('meta.name') < body.indexOf('meta.preferred_username'));
  assert.ok(body.indexOf('meta.full_name') < body.indexOf('meta.nickname'));
  assert.ok(body.indexOf('meta.nickname') < body.indexOf('meta.display_name'));
  assert.doesNotMatch(body, /provider_id|meta\.user_name/);

  const pickBody = functionBody('pickName');
  assert.ok(
    pickBody.indexOf("provider === 'kakao' || provider === 'naver'") < pickBody.indexOf('var email = pickEmail(user)'),
    'social-provider fallback must run before any email local-part fallback'
  );
});

test('profile loading is single-flight and account changes cannot update the new session metadata', () => {
  const loadBody = functionBody('loadProfileRow');
  assert.match(loadBody, /profileLoadPromise && profileLoadFor === uid/);
  assert.doesNotMatch(loadBody, /profileRowFor = uid;\s*try/);

  const persistBody = functionBody('persistDisplayName');
  assert.match(persistBody, /if \(!currentUser \|\| currentUser\.id !== uid\) return true/);

  const sessionBody = functionBody('applySession');
  assert.match(sessionBody, /previousUserId !== nextUserId/);
  assert.match(sessionBody, /nameConfirmShown = false/);
});

test('Naver asks for a display name when neither member name nor nickname is available', () => {
  const body = functionBody('maybeCompleteSocialName');
  assert.match(body, /provider !== 'kakao' && provider !== 'naver'/);
  assert.match(body, /metaDisplayName\(currentUser\)/);
  assert.match(body, /openNameConfirm\(\)/);
  assert.match(functionBody('normalizeDisplayName'), /name === '네이버 사용자'/);
});
