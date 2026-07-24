/**
 * Containment + quality gates for unverified EN/JA Genesis 1:11–1:31.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTAINED_MULTILANG_SCOPE,
  MULTILANG_QUALITY_CRITERIA,
  VERIFIED_MULTILANG_SCOPE,
  assertMultilangStageAllowed,
  isContainedUnverifiedMultilangVerse,
  isVerifiedMultilangVerse,
} from '../lib/commentary-multilang-quality-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('EN/JA Genesis 1:11–1:31 is contained; 1:1–1:10 is verified; KO never contained', () => {
  assert.equal(VERIFIED_MULTILANG_SCOPE.verseTo, 10);
  assert.equal(CONTAINED_MULTILANG_SCOPE.verseFrom, 11);
  assert.equal(CONTAINED_MULTILANG_SCOPE.verseTo, 31);

  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 12,
      locale: 'en-US',
    }),
    true,
  );
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 31,
      locale: 'ja-JP',
    }),
    true,
  );
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 10,
      locale: 'en-US',
    }),
    false,
  );
  assert.equal(
    isVerifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 8,
      locale: 'ja-JP',
    }),
    true,
  );
  assert.equal(
    isContainedUnverifiedMultilangVerse({
      bookId: 'genesis',
      chapter: 1,
      verse: 12,
      locale: 'ko-KR',
    }),
    false,
  );
});

test('quality criteria and pipeline stage gates are fixed in code', () => {
  const ids = MULTILANG_QUALITY_CRITERIA.map((c) => c.id);
  for (const required of [
    'card_count_match',
    'no_field_meaning_loss',
    'no_arbitrary_abbreviation',
    'no_language_mixing',
    'card_tts_alignment',
    'natural_narration',
    'tts_requires_translation_approval',
    'r2_requires_audio_approval',
    'structured_cross_refs',
  ]) {
    assert.ok(ids.includes(required), required);
  }

  assert.equal(assertMultilangStageAllowed('tts', {}).ok, false);
  assert.equal(
    assertMultilangStageAllowed('tts', { translationApproved: true }).ok,
    true,
  );
  assert.equal(assertMultilangStageAllowed('r2', {}).ok, false);
  assert.equal(assertMultilangStageAllowed('r2', { audioApproved: true }).ok, true);
});

test('reader wires containment policy, preparing copy, and structured ref links', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
  assert.match(reader, /gomna-bible-ref\.js/);
  assert.match(reader, /gomna-commentary-multilang-policy\.js/);
  assert.match(reader, /isContainedUnverifiedMultilangVerse/);
  assert.match(reader, /commentary\.multilang\.preparing/);
  assert.match(reader, /말씀풀이 번역을 준비하고 있습니다\./);
  assert.match(reader, /buildStructuredVerseLink/);
  assert.match(reader, /showVersePopupFromStructured/);
  assert.match(reader, /data-book-id=/);
  assert.doesNotMatch(reader, /이미 span 태그 안에 있으면/);
});

test('quality doc records containment and criteria', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs/commentary-multilang-quality.md'),
    'utf8',
  );
  assert.match(doc, /1:11–1:31/);
  assert.match(doc, /No TTS generation before translation review approval/);
  assert.match(doc, /No R2 publish before audio review approval/);
  assert.match(doc, /bookId/);
  assert.match(doc, /말씀풀이 번역을 준비하고 있습니다/);
});
