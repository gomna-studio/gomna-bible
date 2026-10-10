import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const reader = read('reader.html');
const css = read('css/gomna-audio-player.css');
const ui = read('js/gomna-audio-ui.js');

assert.doesNotMatch(reader, /verseRangeBoxBtn/);
assert.doesNotMatch(reader, /data-audio-action="play-range"/);
assert.doesNotMatch(reader, /class="verse-range-box"/);
assert.match(reader, /id="gomna-audio-mini-player"/);
assert.match(reader, /id="gomna-audio-expanded-player"/);
assert.match(reader, /data-audio-action="toggle"/);
assert.match(reader, /data-audio-action="stop"/);
assert.match(reader, /GOMNA_AUDIO_UI\.playVisibleVerseRange/);
assert.match(ui, /playVisibleVerseRange:\s*playVisibleVerseRange/);
assert.match(ui, /function showMiniPlayer\(/);
assert.match(ui, /function hideMiniPlayer\(/);
assert.doesNotMatch(css, /\.gomna-mini-player\b/);
assert.doesNotMatch(css, /\.gomna-audio-mini-player-pc\b/);
assert.doesNotMatch(css, /\.verse-range-box\b/);
assert.match(css, /\.gomna-audio-mini-player\b/);
assert.match(css, /#gomna-audio-mini-player\[hidden\][\s\S]*display:\s*none\s*!important/);

console.log('legacy audio card regression checks passed');
