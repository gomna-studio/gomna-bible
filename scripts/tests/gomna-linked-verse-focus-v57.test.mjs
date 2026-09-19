import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('book picker keeps the exact verse before rendering the new chapter', () => {
  assert.match(
    reader,
    /setLinkedVerseEntryTarget\(name, ch, \[verseNum\]\);\s*}\s*renderVerses\(verseNum\);/
  );
});

test('book-picker verse becomes the toolbar and commentary target', () => {
  assert.match(reader, /\.verse-item--entry-focus\[data-verse\]/);
  assert.match(reader, /return focusedVerse;/);
  assert.match(reader, /function getToolbarCommentaryVerses\(\)[\s\S]*?verse-item--entry-focus\[data-verse\]/);
});

test('every explicit book chapter verse URL enters the shared highlight path', () => {
  assert.match(reader, /function hasExplicitScriptureVerseQuery\(p\)/);
  assert.match(reader, /!isScriptureEntrySource\(source\) && !hasExplicitScriptureVerseQuery\(p\)/);
});

test('linked verses reuse the existing mobile-safe reading-area centering', () => {
  assert.match(reader, /window\.__gomnaCenterVerseInReadingArea\(firstVerse\)/);
  assert.match(reader, /requestAnimationFrame\(function\(\) \{\s*requestAnimationFrame\(centerTargetVerse\)/);
  assert.match(reader, /setTimeout\(centerTargetVerse, 180\)/);
});

test('linked verse uses the approved blue highlight', () => {
  assert.match(reader, /\.verse-item--entry-focus\{background:#E8F0FC/);
});

test('installed app receives the latest linked-verse release cache', () => {
  assert.match(reader, /sw\.js\?v=2026-09-19-mobile-entry-center-v60/);
  assert.match(sw, /CACHE_VERSION = '2026-09-19-mobile-entry-center-v60'/);
});
