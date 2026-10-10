import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const meditation = read('js/gomna-meditation.js');
const library = read('js/gomna-bible-library.js');
const libraryReturn = read('js/gomna-library-return.js');
const controls = read('js/gomna-bible-listen-controls.js');
const reader = read('reader.html');
const home = read('index.html');

assert.match(meditation, /<a class="gmd-btn" href="'\+esc\(readUrl\)\+'">말씀 보기<\/a>/);
assert.doesNotMatch(meditation, /listenUrl|>말씀 듣기</);

assert.match(library, /<div class="gbl-actions"><a href="'\+esc\(readerUrl\(item\)\)\+'">말씀 보기<\/a><\/div>/);
assert.doesNotMatch(library, /본문 듣기|home-main-listen|'listen','1'/);
assert.match(libraryReturn, /directListen: hideUntilDone/);
assert.match(libraryReturn, /start: function \(\)/);

const listenHandler = reader.slice(
  reader.indexOf("listenBtn.addEventListener('click', function(e) {"),
  reader.indexOf('if (listenOnlyBtn) {')
);
assert.ok(listenHandler.length > 0);
assert.doesNotMatch(listenHandler, /playSelectedVersesQueue/);
assert.match(listenHandler, /gomnaLibraryListen\.directListen && window\.gomnaLibraryListen\.play\(\)/);
assert.match(listenHandler, /openVerseListenModeMenu\(\)/);
assert.match(reader, /if \(getSelectedVerseCount\(\) >= 1\) \{\s*closeVerseListenModeMenu\(\);[\s\S]{0,200}playSelectedVersesQueue\(\);/);
assert.match(reader, /reader\.listen\.selectedN/);
assert.match(reader, /id="opt4VerseListenModeChapter"/);
assert.match(reader, /id="opt4VerseListenModeContinuous"/);
assert.match(reader, /id="opt4VerseListenOnly"/);
assert.match(reader, /id="opt4VerseListenFromHere"/);

assert.match(controls, /bible-\(\?:single-verse\|multi-select\|verse-range\):/);
assert.match(controls, /opt4VerseListenModeReturn/);
assert.doesNotMatch(controls + reader, /말씀 듣기가 끝났습니다/);

assert.match(home, /data-ghd-listen/);

console.log('word view merge regression checks passed');
