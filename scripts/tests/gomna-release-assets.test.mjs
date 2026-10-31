import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sw = read('sw.js');
const release = sw.match(/const CACHE_VERSION = '([^']+)'/)[1];
const version = release.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1$2$3');
const precache = [...sw.match(/const STATIC_URLS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const latestAssets = ['/js/gomna-account-white.css'];
const versionedAssets = [
  '/js/gomna-account-white.css',
  '/js/audio-config.js', '/js/audio-engine.js', '/js/gomna-audio-telemetry.js',
  '/js/gomna-bible-library.js', '/js/gomna-daily-verses.js', '/js/gomna-home-feed.css',
  '/js/gomna-home-feed.js', '/js/gomna-home-resume.js', '/js/gomna-screen-transition.js',
  '/js/gomna-ux-telemetry.js', '/topics/topic-reading.css'
];
const pages = ['index.html', 'reader.html', 'meditation.html', 'studio/index.html',
  'topics/anxiety/index.html', 'topics/comfort/index.html', 'topics/dawn-prayer/index.html'];

test('core pages and active worker identify the same release', () => {
  for (const page of pages.slice(0, 3)) {
    assert.equal(read(page).match(/data-release="([^"]+)"/)[1], release, page);
  }
});

test('asset URLs agree across pages and precache; changed CSS has a fresh revision', () => {
  const seen = new Map();
  for (const page of pages) {
    const base = new URL(page, 'https://gomnastudio.com/');
    for (const match of read(page).matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(match[1], base);
      if (!versionedAssets.includes(url.pathname)) continue;
      assert.ok(url.searchParams.get('v'), `${page}: ${url.pathname}`);
      if (latestAssets.includes(url.pathname)) assert.equal(url.searchParams.get('v'), version, `${page}: ${url.pathname}`);
      if (seen.has(url.pathname)) assert.equal(url.search, seen.get(url.pathname), `${page}: inconsistent ${url.pathname}`);
      assert(precache.includes(url.pathname + url.search), `missing precache: ${url.pathname + url.search}`);
      seen.set(url.pathname, url.search);
    }
  }
  assert.deepEqual([...seen.keys()].sort(), [...versionedAssets].sort());
});

test('precache has no missing local files or bulk audio/Bible downloads', () => {
  for (const entry of precache) {
    const pathname = new URL(entry, 'https://gomnastudio.com').pathname;
    assert(fs.existsSync(path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1))), entry);
    assert(!/\/audio\/audio-manifest\.json$|\/(?:old|new)_testament\.js$/.test(pathname), entry);
  }
});
