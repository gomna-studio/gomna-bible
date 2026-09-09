#!/usr/bin/env node
/**
 * Compare native ko/en/ja UI string keys in js/gomna-ui-i18n.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'gomna-ui-i18n.js');
const src = fs.readFileSync(file, 'utf8');
const match = src.match(/var STRINGS = (\{[\s\S]*?\n  \});/);
if (!match) {
  console.error('STRINGS block not found');
  process.exit(1);
}
const STRINGS = Function('return (' + match[1] + ')')();
const ko = Object.keys(STRINGS.ko);
let failed = 0;
['en', 'ja', 'zh'].forEach((lang) => {
  const missing = ko.filter((k) => !STRINGS[lang][k]);
  const extra = Object.keys(STRINGS[lang]).filter((k) => !STRINGS.ko[k]);
  if (missing.length || extra.length) {
    failed += 1;
    if (missing.length) console.error(lang, 'missing', missing.length, missing.join(', '));
    if (extra.length) console.error(lang, 'extra', extra.length, extra.join(', '));
  } else {
    console.log(lang, 'ok', ko.length, 'keys');
  }
});
process.exit(failed ? 1 : 0);
