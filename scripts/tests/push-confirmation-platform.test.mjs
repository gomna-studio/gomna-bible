import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../js/gomna-home-feed.js', import.meta.url), 'utf8');

test('Mac never asks the server for an iPhone confirmation push', () => {
  assert.match(source, /function supportsPushConfirmationProbe\(\)/);
  assert.match(source, /sendProbe:!!\(options&&options\.sendProbe\) && supportsPushConfirmationProbe\(\)/);
});

test('Mac clears the false confirmation error instead of displaying it', () => {
  const start = source.indexOf('function ensurePushConfirmation()');
  const end = source.indexOf('function connectAllowedPush()', start);
  const body = source.slice(start, end);
  assert.match(body, /if\(!supportsPushConfirmationProbe\(\)\)/);
  assert.match(body, /setNotifyPrefError\('\'\)/);
  assert.ok(body.indexOf("if(!supportsPushConfirmationProbe())") < body.indexOf("savePushSubscription(pushSubCache"));
});
