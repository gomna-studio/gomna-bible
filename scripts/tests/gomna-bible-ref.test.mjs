/**
 * Multilingual display refs → internal bookId / chapter / verse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBibleReference,
  resolveBookToken,
} from '../lib/gomna-bible-ref.mjs';

const REQUIRED_SAMPLES = [
  { display: '詩 1:3', bookId: 'psalms', chapter: 1, verseStart: 3, verseEnd: 3 },
  { display: '箴 11:30', bookId: 'proverbs', chapter: 11, verseStart: 30, verseEnd: 30 },
  { display: 'ヨハ 15:5', bookId: 'john', chapter: 15, verseStart: 5, verseEnd: 5 },
  {
    display: 'ガラ 5:22-23',
    bookId: 'galatians',
    chapter: 5,
    verseStart: 22,
    verseEnd: 23,
    rangeText: '22-23',
  },
  { display: 'Psalm 1:3', bookId: 'psalms', chapter: 1, verseStart: 3, verseEnd: 3 },
  { display: 'John 15:5', bookId: 'john', chapter: 15, verseStart: 5, verseEnd: 5 },
  {
    display: 'Galatians 5:22-23',
    bookId: 'galatians',
    chapter: 5,
    verseStart: 22,
    verseEnd: 23,
    rangeText: '22-23',
  },
];

test('required EN/JA related-verse formats resolve to bookId/chapter/verse', () => {
  for (const sample of REQUIRED_SAMPLES) {
    const parsed = parseBibleReference(sample.display);
    assert.equal(parsed.ok, true, sample.display);
    assert.equal(parsed.bookId, sample.bookId, sample.display);
    assert.equal(parsed.chapter, sample.chapter, sample.display);
    assert.equal(parsed.verseStart, sample.verseStart, sample.display);
    assert.equal(parsed.verse, sample.verseStart, `${sample.display} verse alias`);
    assert.equal(parsed.verseEnd, sample.verseEnd, sample.display);
    if (sample.rangeText) {
      assert.equal(parsed.rangeText, sample.rangeText, sample.display);
    }
  }
});

test('range refs keep range label while navigating from verseStart', () => {
  const parsed = parseBibleReference('ガラ 5:22-23');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.verse, 22);
  assert.equal(parsed.verseStart, 22);
  assert.equal(parsed.verseEnd, 23);
  assert.equal(parsed.rangeText, '22-23');
});

test('resolveBookToken maps JA/EN aliases used in cards', () => {
  assert.equal(resolveBookToken('詩'), 'psalms');
  assert.equal(resolveBookToken('箴'), 'proverbs');
  assert.equal(resolveBookToken('ヨハ'), 'john');
  assert.equal(resolveBookToken('ガラ'), 'galatians');
  assert.equal(resolveBookToken('Psalm'), 'psalms');
  assert.equal(resolveBookToken('John'), 'john');
  assert.equal(resolveBookToken('Galatians'), 'galatians');
});
