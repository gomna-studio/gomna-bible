/**
 * Contained EN/JA Genesis 1:11–1:31 audio control visibility.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isContainedUnverifiedMultilangVerse } from '../lib/commentary-multilang-quality-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const audioButtons = fs.readFileSync(
  path.join(ROOT, 'js/gomna-audio-commentary-buttons.js'),
  'utf8',
);
const reader = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');

function mockEl() {
  const attrs = new Map();
  const classes = new Set();
  return {
    hidden: false,
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
    },
  };
}

function setAudioControlContainedHidden(el, hide) {
  const ATTR = 'data-gomna-contained-audio-hidden';
  const CLASS = 'gomna-contained-audio-control-hidden';
  if (hide) {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
    el.classList.add(CLASS);
    el.setAttribute(ATTR, '1');
    return;
  }
  if (el.getAttribute(ATTR) !== '1') return;
  el.hidden = false;
  el.removeAttribute('aria-hidden');
  el.removeAttribute('tabindex');
  el.classList.remove(CLASS);
  el.removeAttribute(ATTR);
}

test('policy: KO visible; EN/JA 1:8 visible; EN/JA 1:11-31 hidden', () => {
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 12,
      locale: 'ko-KR',
    }),
    false,
  );
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 8,
      locale: 'en-US',
    }),
    false,
  );
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 8,
      locale: 'ja-JP',
    }),
    false,
  );
  for (const verse of [11, 12, 31]) {
    for (const locale of ['en-US', 'ja-JP']) {
      assert.equal(
        isContainedUnverifiedMultilangVerse({
          bookId: 'genesis',
          chapter: 1,
          verse,
          locale,
        }),
        true,
        `${locale} ${verse}`,
      );
    }
  }
});

test('hide/restore leaves keyboard inaccessible while hidden and restores cleanly', () => {
  const el = mockEl();
  setAudioControlContainedHidden(el, true);
  assert.equal(el.hidden, true);
  assert.equal(el.getAttribute('aria-hidden'), 'true');
  assert.equal(el.getAttribute('tabindex'), '-1');
  assert.equal(el.classList.contains('gomna-contained-audio-control-hidden'), true);

  setAudioControlContainedHidden(el, false);
  assert.equal(el.hidden, false);
  assert.equal(el.getAttribute('aria-hidden'), null);
  assert.equal(el.getAttribute('tabindex'), null);
  assert.equal(el.classList.contains('gomna-contained-audio-control-hidden'), false);
  assert.equal(el.getAttribute('data-gomna-contained-audio-hidden'), null);
});

test('audio buttons module wires shared sync on open/verse/lang/render paths', () => {
  assert.match(audioButtons, /function syncContainedMultilangAudioControlsVisibility/);
  assert.match(audioButtons, /isContainedUnverifiedMultilangVerse/);
  assert.match(audioButtons, /syncContainedAudioControlsVisibility/);
  assert.match(audioButtons, /gomnaCommentaryInlineControls/);
  assert.match(audioButtons, /gomna-audio-commentary-controls-footer/);
  assert.match(audioButtons, /gomna:languagechange/);
  // call sites
  assert.match(audioButtons, /syncContainedMultilangAudioControlsVisibility\(\)/);
  assert.ok(
    (audioButtons.match(/syncContainedMultilangAudioControlsVisibility\(\)/g) || [])
      .length >= 8,
  );
});

test('reader CSS + showCommentary call the shared visibility sync', () => {
  assert.match(reader, /gomna-contained-audio-control-hidden/);
  assert.match(reader, /syncContainedAudioControlsVisibility/);
  assert.match(reader, /gomna-audio-commentary-buttons\.js\?v=20260725-contained-audio-hide-v1/);
  assert.match(reader, /data-gomna-multilang-contained="1"/);
});

test('language-switch visibility matrix uses the same policy outcomes', () => {
  const steps = [
    { locale: 'ko-KR', verse: 12, expectHide: false },
    { locale: 'en-US', verse: 12, expectHide: true },
    { locale: 'ja-JP', verse: 12, expectHide: true },
    { locale: 'ko-KR', verse: 12, expectHide: false },
  ];
  for (const step of steps) {
    assert.equal(
      isContainedUnverifiedMultilangVerse({
        bookId: 'genesis',
        chapter: 1,
        verse: step.verse,
        locale: step.locale,
      }),
      step.expectHide,
      JSON.stringify(step),
    );
  }
});
