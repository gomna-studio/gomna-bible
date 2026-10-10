import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const theme = read('js/gomna-theme.js');
const guide = read('js/gomna-guide-colorful.css');
const library = read('js/gomna-bible-library.css');
const category = read('gomna_category_feature.js');

// Run the production CSS collector, rather than duplicating its exclusion regex.
const collectorStart = theme.indexOf('(function () {') + '(function () {'.length;
const collectorEnd = theme.indexOf('  function scanSheets()');
assert.ok(collectorStart > 0 && collectorEnd > collectorStart);
const context = { document: { documentElement: {} }, window: {} };
vm.createContext(context);
vm.runInContext(theme.slice(collectorStart, collectorEnd), context);

// Leaf rules are enough for these literal palettes and selector contracts. This
// fixture supplies CSSStyleDeclaration's interface to the real collector.
function rules(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => !match[1].trim().startsWith('@'))
    .map(([, selectorText, cssText]) => {
      const declarations = new Map();
      for (const declaration of cssText.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
      }
      const properties = [...declarations.keys()];
      const style = {
        cssText, length: properties.length,
        getPropertyValue: key => (declarations.get(key) || '').replace(/!important\s*$/, '').trim(),
        getPropertyPriority: key => /!important\s*$/.test(declarations.get(key) || '') ? 'important' : ''
      };
      properties.forEach((property, index) => { style[index] = property; });
      return { selectorText: selectorText.trim(), style, declarations };
    });
}
const guideRules = rules(guide);
const libraryRules = rules(library);

// Include dynamically injected guide CSS: it can arrive after theme startup.
const injectionStart = category.indexOf('  var styleEl =');
const injectionEnd = category.indexOf('  document.head.appendChild(styleEl);');
assert.ok(injectionStart >= 0 && injectionEnd > injectionStart);
const injection = { document: { createElement: () => ({}) } };
vm.createContext(injection);
vm.runInContext(category.slice(injectionStart, injectionEnd), injection);
const injectedRules = rules(injection.styleEl.textContent);

const protectedRules = [...guideRules, ...libraryRules, ...injectedRules]
  .filter(rule => /#scripture(?:All)?Guide|#gomnaBibleLibrary|\.scripture-(?:guide|all-guides)-|body\.gbl-open/.test(rule.selectorText));
for (const selector of ['#scriptureAllGuidesOverlay', '#scriptureGuideOverlay', '.scripture-guide-body', '#gomnaBibleLibrary', 'body.gbl-open']) {
  assert.ok(protectedRules.some(rule => rule.selectorText.includes(selector)), 'exercise actual rules for ' + selector);
}
const generated = [];
context.collect(protectedRules, '', generated);
assert.deepEqual(generated, [], 'generic dark recoloring must leave complete content palettes intact');
context.collect(rules('.outside-panel {color:#222;background-color:#fff}'), '', generated);
assert.equal(generated.length, 1, 'ordinary app UI still receives automatic dark colors');
assert.match(generated[0], /color:var\(--gomna-text\)/);
assert.match(generated[0], /background-color:var\(--gomna-surface\)/);

function ruleWith(allRules, selector) {
  const rule = allRules.find(rule => rule.selectorText === selector);
  assert.ok(rule, 'missing palette/control rule: ' + selector);
  return rule;
}
function tokens(rule, prefix) {
  return Object.fromEntries([...rule.declarations]
    .filter(([key]) => key.startsWith('--' + prefix + '-'))
    .map(([key, value]) => [key, value.replace(/!important\s*$/, '').trim()]));
}
const guideLight = tokens(ruleWith(guideRules, '#scriptureAllGuidesOverlay,#scriptureGuideOverlay'), 'guide');
const guideDark = tokens(ruleWith(guideRules, 'html[data-gomna-theme="dark"] :is(#scriptureAllGuidesOverlay,#scriptureGuideOverlay)'), 'guide');
const libraryLight = tokens(ruleWith(libraryRules, '#gomnaBibleLibrary'), 'gbl');
const libraryDark = tokens(ruleWith(libraryRules, 'html[data-gomna-theme="dark"] #gomnaBibleLibrary'), 'gbl');

function luminance(color) {
  assert.match(color, /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i, 'contrast colors must be opaque');
  let hex = color.slice(1);
  if (hex.length === 3) hex = [...hex].map(char => char + char).join('');
  const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(ink, background) {
  const [low, high] = [luminance(ink), luminance(background)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}
let checkedPairs = 0;
function checkPairs(palette, prefix, inks, backgrounds) {
  for (const ink of inks) for (const background of backgrounds) {
    const ratio = contrast(palette['--' + prefix + '-' + ink], palette['--' + prefix + '-' + background]);
    assert.ok(ratio >= 4.5, prefix + ' ' + ink + '/' + background + ' text contrast is ' + ratio.toFixed(2));
    checkedPairs++;
  }
}
for (const palette of [guideLight, guideDark]) checkPairs(palette, 'guide', ['ink', 'muted', 'accent'], ['bg', 'surface']);
for (const palette of [libraryLight, libraryDark]) {
  checkPairs(palette, 'gbl', ['ink', 'muted', 'gold'], ['bg', 'surface', 'soft']);
  checkPairs(palette, 'gbl', ['ink'], ['control']);
  checkPairs(palette, 'gbl', ['selected-ink'], ['selected-bg']);
}

// These controls were vulnerable to an inherited text-fill or a fixed black X.
const closeRules = guideRules.filter(rule => rule.selectorText.includes('.scripture-guide-head-close') && rule.declarations.has('color'));
assert.ok(closeRules.length >= 2);
for (const rule of closeRules) assert.match(rule.declarations.get('color'), /var\(--guide-ink(?:,[^)]+)?\)!important$/);
assert.doesNotMatch(category, /class="scripture-guide-head-close"[^>]*style="[^"]*color:/);
assert.ok(guideRules.some(rule => rule.selectorText.endsWith('.scripture-all-guides-article') && rule.declarations.get('--guide-accent') === 'inherit!important'), 'article accents inherit the readable current-mode palette');
assert.ok(guideRules.some(rule => rule.selectorText.includes(':is(h1,') && rule.declarations.get('-webkit-text-fill-color') === 'currentColor'));
assert.ok(libraryRules.some(rule => rule.selectorText.includes(':is(h1,') && rule.declarations.get('-webkit-text-fill-color') === 'currentColor'));
const selected = ruleWith(libraryRules, '#gomnaBibleLibrary .gbl-filters [aria-pressed="true"]');
assert.equal(selected.declarations.get('background'), 'var(--gbl-selected-bg)');
assert.equal(selected.declarations.get('color'), 'var(--gbl-selected-ink)');
const page = ruleWith(libraryRules, 'html[data-gomna-theme="dark"] body.gbl-open');
assert.equal(page.declarations.get('--gbl-page-bg'), libraryDark['--gbl-bg']);

console.log('PASS guide/library theme: production collector + ' + checkedPairs + ' light/dark text contrast pairs and controls');
