/**
 * External → native KO must tear down Google/bridge residue and re-own
 * Reader toolbar + dock from a single native locale source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readerHtml = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
const translateSrc = fs.readFileSync(path.join(ROOT, 'translate_feature.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(ROOT, 'js/gomna-ui-i18n.js'), 'utf8');

test('enterNativeLocale is the shared Home/Reader native entry', () => {
  assert.match(translateSrc, /function enterNativeLocale\(/);
  assert.match(translateSrc, /function teardownExternalTranslation\(/);
  assert.match(translateSrc, /homeNative\) \{\s*closeModal\(\{ skipHomeRestore: true \}\);\s*enterNativeLocale/s);
  assert.match(translateSrc, /readerNativePair\) \{\s*closeModal\(\{ skipHomeRestore: true \}\);\s*enterNativeLocale/s);
  assert.match(translateSrc, /syncReaderLocaleUi/);
  const enter = translateSrc.slice(
    translateSrc.indexOf('function enterNativeLocale'),
    translateSrc.indexOf('window.GomnaEnterNativeLocale')
  );
  assert.doesNotMatch(enter, /pendingReload/);
  assert.doesNotMatch(enter, /location\.reload/);
  assert.match(enter, /applyLocale\(code/);
});

test('native t\(\) follows selectedLocale, not stale currentLang', () => {
  const tFn = i18nSrc.slice(i18nSrc.indexOf('function t(key, lang)'), i18nSrc.indexOf('function format('));
  assert.match(tFn, /getSelectedLocale\(\)/);
});

test('Reader runtime locale sync does not require reload', () => {
  assert.match(readerHtml, /function syncReaderLocaleUi\(/);
  assert.match(readerHtml, /window\.__gomnaRefreshReaderI18n = syncReaderLocaleUi/);
  assert.match(readerHtml, /function resolveReaderChromeLang\(/);
  assert.match(readerHtml, /GomnaUII18n\.t\(key, lang\)/);
});

test('native applyLocale clears stale bridge display lang', () => {
  assert.match(i18nSrc, /global\.__gomnaBridgeDisplayLang = null/);
  assert.match(i18nSrc, /bumpLocaleGeneration: bumpLocaleGeneration/);
});

test('Reader dock and toolbar share GomnaUII18n keys', () => {
  assert.match(readerHtml, /scripture-dock-label" data-i18n-key="home\.tab\.home"/);
  assert.match(readerHtml, /scripture-dock-label" data-i18n-key="home\.tab\.bible"/);
  assert.match(readerHtml, /scripture-dock-label" data-i18n-key="home\.tab\.find"/);
  assert.match(readerHtml, /scripture-dock-label" data-i18n-key="reader\.tab\.archive"/);
  assert.match(readerHtml, /id="verseToolbarLocationText" data-i18n-key="reader\.find"/);
  assert.match(readerHtml, /id="opt4VerseListenLabel" data-i18n-key="reader\.listen"/);
  assert.match(readerHtml, /data-i18n-key="reader\.commentary"/);
  assert.match(readerHtml, /data-i18n-key="reader\.more"/);
});

test('Find/Listen are locked in native mode like commentary/more', () => {
  assert.match(readerHtml, /markReaderOwnedTranslate\(txt, nativeUi\)/);
  assert.match(readerHtml, /markReaderOwnedTranslate\(listenBtn, nativeUi\)/);
  assert.match(readerHtml, /markReaderOwnedTranslate\(locBtn, nativeUi\)/);
});

test('Google retranslate is a no-op on native selectedLocale', () => {
  assert.match(readerHtml, /requestGoogleUiRetranslate/);
  assert.match(readerHtml, /isNativeLocale\(window\.GomnaUII18n\.getSelectedLocale/);
  assert.match(translateSrc, /function retranslateReaderBody/);
  const retranslate = translateSrc.slice(
    translateSrc.indexOf('function retranslateReaderBody'),
    translateSrc.indexOf('function retranslateReaderBody') + 900
  );
  assert.match(retranslate, /isNativeLocale/);
  assert.match(retranslate, /__gomnaLocaleGen/);
});
