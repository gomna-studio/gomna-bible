import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const feature = read('gomna_category_feature.js');
const entry = read('js/gomna-guide-home-entry.js');
const css = read('js/gomna-guide-colorful.css');

const imageOnlyButtons = feature.match(/data-guide-zoom="image-only"/g) || [];
assert.equal(imageOnlyButtons.length, 1);
assert.match(feature, /guide-image-open" data-guide-zoom="image-only" aria-label="'\+item\[1\]\+' 확대"/);

const viewer = entry.slice(entry.indexOf('function openImageOnlyViewer'), entry.indexOf('if(!window.gomnaGuideImageZoomInstalled)'));
assert.ok(viewer.length > 0);
assert.doesNotMatch(viewer, /createElement\('button'\)/);
assert.doesNotMatch(viewer, /guide-image-close/);
assert.match(viewer, /image\.src=largeImageSrc\(thumbnail\)/);
assert.match(viewer, /tapStarted&&!moved&&!multiTouch&&touchCount===0/);
assert.match(viewer, /if\(e\.touches\.length<2\)e\.preventDefault\(\)/);
assert.match(viewer, /item\[0\]\.scrollTop=item\[1\]/);
assert.match(entry, /data-guide-zoom'\)==='image-only'/);
assert.match(entry, /close\.className='guide-image-close'/);

const viewerCss = css.match(/\.guide-image-viewer\{[^}]*\}/)[0];
assert.match(viewerCss, /border-radius:0/);
assert.match(viewerCss, /background:#000/);
assert.match(css, /\.guide-image-viewer>img\{[^}]*width:100%;height:100%;object-fit:contain/);

console.log('guide image viewer checks passed');
