/**
 * Guard: locale commentary cards / book shards must not be SW cache-first.
 * Mirrors sw.js isFreshAppAsset path rules so stale 1:1-1:10 JSON cannot stick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('service worker marks commentary-cards and audio/manifests as fresh assets', () => {
  assert.match(swSource, /\/data\\\/commentary-cards\\\//);
  assert.match(swSource, /\/audio\\\/manifests\\\//);
  assert.match(swSource, /2026-07-24-commentary-header-verse-v1/);
});

test('reader loads locale cards with asset-version cache bust', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  assert.match(reader, /GOMNA_ASSET_VERSION = "20260724-commentary-header-verse-v1"/);
  assert.match(
    reader,
    /data\/commentary-cards\/' \+\s*\n?\s*encodeURIComponent\(locale\)/,
  );
  assert.match(reader, /\?v=' \+ encodeURIComponent\(assetVersion\)/);
  assert.match(reader, /cache: 'no-cache'/);
});
