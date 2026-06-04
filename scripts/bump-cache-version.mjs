#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const HTML_FILES = ['index.html', 'reader.html'];
const SW_FILE = 'sw.js';

const VERSIONED_ASSETS = [
  'manifest.json',
  '/css/gomna-audio-player.css',
  '/js/audio-config.js',
  '/js/audio-engine.js',
  '/js/gomna-audio-listen-button.js',
  '/js/gomna-audio-commentary-buttons.js',
  '/js/gomna-audio-highlight.js',
  '/js/gomna-audio-ui.js'
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function makeVersion(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join('') + '-' + pad2(date.getHours()) + pad2(date.getMinutes());
}

function toCacheVersion(version) {
  const match = version.match(/^(\d{4})(\d{2})(\d{2})-(\d{4})$/);

  if (!match) {
    throw new Error(`Invalid cache version "${version}". Expected YYYYMMDD-HHMM.`);
  }

  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllVersionQueries(source, asset, version) {
  const pattern = new RegExp(`(${escapeRegExp(asset)}\\?v=)[^"'\\s)]+`, 'g');
  return source.replace(pattern, `$1${version}`);
}

function updateStaticUrlsBlock(source, version) {
  return source.replace(/const STATIC_URLS = \[([\s\S]*?)\];/, (fullMatch, body) => {
    let nextBody = body;

    for (const asset of VERSIONED_ASSETS) {
      const swAsset = asset.startsWith('/') ? asset : `/${asset}`;
      const pattern = new RegExp(`(['"])${escapeRegExp(swAsset)}(?:\\?v=[^'"]+)?\\1`, 'g');
      nextBody = nextBody.replace(pattern, `$1${swAsset}?v=${version}$1`);
    }

    return `const STATIC_URLS = [${nextBody}];`;
  });
}

async function updateHtmlFile(fileName, version) {
  const filePath = path.join(ROOT, fileName);
  let source = await readFile(filePath, 'utf8');
  let next = source.replace(
    /window\.GOMNA_ASSET_VERSION\s*=\s*["'][^"']+["']/,
    `window.GOMNA_ASSET_VERSION = "${version}"`
  );

  for (const asset of VERSIONED_ASSETS) {
    next = replaceAllVersionQueries(next, asset, version);
  }

  if (next !== source) {
    await writeFile(filePath, next);
  }

  return next !== source;
}

async function updateServiceWorker(version) {
  const filePath = path.join(ROOT, SW_FILE);
  const cacheVersion = toCacheVersion(version);
  let source = await readFile(filePath, 'utf8');
  let next = source.replace(
    /const CACHE_VERSION = ['"][^'"]+['"];/,
    `const CACHE_VERSION = '${cacheVersion}';`
  );

  next = updateStaticUrlsBlock(next, version);

  if (next !== source) {
    await writeFile(filePath, next);
  }

  return next !== source;
}

async function main() {
  const explicitVersion = process.argv.find(arg => /^--version=/.test(arg));
  const version = explicitVersion ? explicitVersion.split('=')[1] : makeVersion();
  const cacheVersion = toCacheVersion(version);
  const changed = [];

  for (const fileName of HTML_FILES) {
    if (await updateHtmlFile(fileName, version)) {
      changed.push(fileName);
    }
  }

  if (await updateServiceWorker(version)) {
    changed.push(SW_FILE);
  }

  console.log(`Cache version: ${version}`);
  console.log(`Service worker CACHE_VERSION: ${cacheVersion}`);
  console.log(changed.length ? `Updated: ${changed.join(', ')}` : 'Updated: none');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
