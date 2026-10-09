import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const feature = read('gomna_category_feature.js');
const entry = read('js/gomna-guide-home-entry.js');
const css = read('js/gomna-guide-colorful.css');

const openButtons = feature.match(/class="guide-image-open"/g) || [];
assert.equal(openButtons.length, 2);

const visuals = JSON.parse(feature.match(/var visuals = (\{[^;]*\});/)[1]);
const files = new Set([...Object.values(visuals).map((v) => v[0]), 'guide-tablets-fire-v20.webp']);
assert.equal(Object.keys(visuals).length, 10);
for (const file of files) {
  assert.ok(fs.existsSync(new URL(`../assets/guide-thumbnails/${file}`, import.meta.url)), file);
  assert.ok(fs.existsSync(new URL(`../assets/guide-thumbnails/${file.replace(/\.webp$/, '-large.webp')}`, import.meta.url)), file);
}

assert.doesNotMatch(entry, /guide-image-dialog|guide-image-close|createElement\('button'\)/);
assert.doesNotMatch(css, /guide-image-dialog|guide-image-close/);
assert.match(entry, /closest\('#scriptureAllGuidesBody \.guide-image-open'\)/);
assert.match(entry, /openImageOnlyViewer\(trigger,thumbnail\);/);

const viewer = entry.slice(entry.indexOf('function openImageOnlyViewer'), entry.indexOf('if(!window.gomnaGuideImageZoomInstalled)'));
assert.match(viewer, /image\.src=largeImageSrc\(thumbnail\)/);
assert.match(viewer, /tapStarted&&!moved&&!multiTouch&&touchCount===0/);
assert.match(viewer, /if\(e\.touches\.length<2\)e\.preventDefault\(\)/);
assert.match(viewer, /item\[0\]\.scrollTop=item\[1\]/);

const viewerCss = css.match(/\.guide-image-viewer\{[^}]*\}/)[0];
assert.match(viewerCss, /border-radius:0/);
assert.match(viewerCss, /background:#000/);
assert.match(css, /\.guide-image-viewer>img\{[^}]*width:100%;height:100%;object-fit:contain/);

console.log('guide image viewer checks passed');
