import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const reader = fs.readFileSync(path.join(root, 'reader.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'js/audio-engine.js'), 'utf8');

test('mobile linked verse uses the touch gesture surface instead of document scroll', () => {
  assert.match(reader, /window\.__gomnaPlainVerseGestureScrollToRange\s*=\s*scrollToRange/);
  assert.match(
    reader,
    /window\.__gomnaPlainVerseGestureScrollToRange\(firstItem,lastItem,\{centerRatio:\.5\}\)\)return;/
  );
});

test('single and ranged links share the same exact center calculation', () => {
  assert.match(reader, /return scrollToRange\(item, item, options\);/);
  assert.match(reader, /mid = \(offset\.y \+ lastOffset\.y \+ lastOffset\.height\) \/ 2;/);
  assert.match(reader, /idealPanY = clampY\(viewportH \* ratio - mid \* scale\);/);
});

test('mobile entry target is the visible-area midpoint', () => {
  assert.match(reader, /centerRatio:\.5/);
});

test('v50 audio engine remains unchanged in purpose and connected', () => {
  assert.match(reader, /audio-engine\.js\?v=20260919-ios-memory-handoff-v50-restored-v56/);
  assert.match(engine, /nextPrefetchObjectUrl/);
  assert.match(engine, /URL\.revokeObjectURL/);
});
