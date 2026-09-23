import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function functionSource(name, nextName) {
  const start = reader.indexOf(`function ${name}(`);
  const end = reader.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source not found`);
  return reader.slice(start, end);
}

test('entry veil is removed before the mobile center command is retried', () => {
  const source = functionSource('centerScriptureEntryAfterReveal', 'finishScriptureEntryReveal');
  const reveal = source.indexOf('revealScriptureEntry();');
  const raf = source.indexOf("requestAnimationFrame(function()");
  const delayed = source.indexOf('setTimeout(placeAfterGestureReady,220);');
  assert.ok(reveal >= 0);
  assert.ok(raf > reveal);
  assert.ok(delayed > raf);
});

test('home-life and search entry both use the post-reveal center path', () => {
  const source = functionSource('finishScriptureEntryReveal', 'refreshPendingVerses');
  assert.equal((source.match(/centerScriptureEntryAfterReveal\(firstItem,lastItem\)/g) || []).length, 2);
  assert.doesNotMatch(source, /placeScriptureEntry\(\);\s*revealScriptureEntry\(\)/);
});

test('post-reveal center uses the mobile gesture midpoint', () => {
  assert.match(reader, /__gomnaPlainVerseGestureScrollToRange\(firstItem,lastItem,\{centerRatio:\.5\}\)/);
});

test('installed app cache identifies the current release without forced navigation', () => {
  assert.match(reader, /sw\.js\?v=2026-09-23-naver-profile-name-v63/);
  assert.match(sw, /CACHE_VERSION = '2026-09-23-naver-profile-name-v63'/);
  assert.doesNotMatch(sw, /\.then\(\(\) => refreshInstalledAppClients\(\)\)/);
});
