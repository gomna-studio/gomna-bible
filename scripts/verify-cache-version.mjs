#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CHECKS = [
  { file: 'reader.html', label: 'reader manifest', pattern: /manifest\.json\?v=([^"'\s>]+)/ },
  { file: 'reader.html', label: 'reader audio css', pattern: /\/css\/gomna-audio-player\.css\?v=([^"'\s>]+)/ },
  { file: 'reader.html', label: 'reader commentary js', pattern: /\/js\/gomna-audio-commentary-buttons\.js\?v=([^"'\s>]+)/ },
  { file: 'reader.html', label: 'reader audio ui js', pattern: /\/js\/gomna-audio-ui\.js\?v=([^"'\s>]+)/ },
  { file: 'reader.html', label: 'reader sw asset version', pattern: /window\.GOMNA_ASSET_VERSION\s*=\s*["']([^"']+)["']/ },
  { file: 'index.html', label: 'index manifest', pattern: /manifest\.json\?v=([^"'\s>]+)/ },
  { file: 'index.html', label: 'index sw asset version', pattern: /window\.GOMNA_ASSET_VERSION\s*=\s*["']([^"']+)["']/ },
  { file: 'sw.js', label: 'sw audio css', pattern: /\/css\/gomna-audio-player\.css\?v=([^"'\s>]+)/ },
  { file: 'sw.js', label: 'sw commentary js', pattern: /\/js\/gomna-audio-commentary-buttons\.js\?v=([^"'\s>]+)/ },
  { file: 'sw.js', label: 'sw audio ui js', pattern: /\/js\/gomna-audio-ui\.js\?v=([^"'\s>]+)/ },
  { file: 'sw.js', label: 'sw manifest', pattern: /\/manifest\.json\?v=([^"'\s>]+)/ }
];

function compactCacheVersion(cacheVersion) {
  const match = cacheVersion.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[1]}${match[2]}${match[3]}-${match[4]}` : cacheVersion;
}

async function readProjectFile(fileName) {
  return readFile(path.join(ROOT, fileName), 'utf8');
}

async function main() {
  const cache = new Map();
  const results = [];

  for (const check of CHECKS) {
    if (!cache.has(check.file)) {
      cache.set(check.file, await readProjectFile(check.file));
    }

    const match = cache.get(check.file).match(check.pattern);

    if (!match) {
      throw new Error(`Missing version: ${check.label} (${check.file})`);
    }

    results.push({ ...check, version: match[1] });
  }

  const swSource = cache.get('sw.js') || await readProjectFile('sw.js');
  const cacheVersionMatch = swSource.match(/const CACHE_VERSION = ['"]([^'"]+)['"];/);

  if (!cacheVersionMatch) {
    throw new Error('Missing version: sw CACHE_VERSION (sw.js)');
  }

  const swCacheVersion = cacheVersionMatch[1];
  const normalizedSwCacheVersion = compactCacheVersion(swCacheVersion);
  const versions = new Set(results.map(result => result.version));
  versions.add(normalizedSwCacheVersion);

  for (const result of results) {
    console.log(`${result.label}: ${result.version}`);
  }
  console.log(`sw CACHE_VERSION: ${swCacheVersion} (${normalizedSwCacheVersion})`);

  if (versions.size !== 1) {
    throw new Error(`Cache versions do not match: ${Array.from(versions).join(', ')}`);
  }

  console.log(`OK: all checked cache versions match ${Array.from(versions)[0]}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
