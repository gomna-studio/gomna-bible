import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/gomna-audio-player.css', import.meta.url), 'utf8');

const selected = css.match(
  /#commentaryContent\s+\.commentary-tab\.gomna-audio-commentary-tab--active:not\(\[data-gomna-commentary-sequence-button='true'\]\),\s*#commentaryContent \.commentary-tab\.active:not\(\[data-gomna-commentary-sequence-button='true'\]\) \{([^}]*)\}/
);
assert.ok(selected, 'selected and playing tabs share one rule');
assert.match(selected[1], /background: #397fc4 !important/);
assert.match(selected[1], /color: #ffffff !important/);
assert.match(css, /\.commentary-tabs:has\(\.gomna-audio-commentary-tab--active[^)]*\)\)\s*\.commentary-tab\.active:not\(\.gomna-audio-commentary-tab--active\)/);
assert.doesNotMatch(css, /#commentaryContent \.commentary-tab\.active \{/);

const track = css.match(/#gomnaCommentaryInlineControls\.gomna-commentary-inline-controls::before \{([^}]*)\}/);
assert.ok(track);
assert.match(track[1], /border-radius: 999px !important/);
assert.match(track[1], /background: #f4ede1 !important/);
assert.match(track[1], /bottom: calc\(11px \+ env\(safe-area-inset-bottom, 0px\)\)/);
assert.match(css, /#gomnaCommentaryListenBtn::before \{\s*background: #397fc4 !important;/);
assert.match(css, /min-height: 40px !important;\s*height: 40px !important;/);

console.log('commentary button regression checks passed');
