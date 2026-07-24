/**
 * Regression: published EN/JA card field schemas must match reader expectations.
 * Empty required body fields are FAIL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATTHEW_HENRY_TABLE_KEY,
  MATTHEW_HENRY_FIELDS_BY_LOCALE,
  normalizeCommentaryCardRow,
  validateCommentaryTableRows,
  NON_MATTHEW_HENRY_FIELDS_BY_TABLE,
} from '../lib/commentary-card-field-schema.mjs';
import {
  buildCardRowsFromTranslatedCards,
  buildStagedVerseEntry,
} from '../lib/commentary-multilang-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('normalizeCommentaryCardRow remaps JA/EN Matthew Henry aliases without changing values', () => {
  const ja = normalizeCommentaryCardRow(MATTHEW_HENRY_TABLE_KEY, 'ja-JP', {
    영어원문: 'Original English',
    한국어번역: '日本語の解説',
    핵심통찰: '洞察',
  });
  assert.deepEqual(ja, {
    英語原文: 'Original English',
    日本語訳: '日本語の解説',
    核心的洞察: '洞察',
  });

  const en = normalizeCommentaryCardRow(MATTHEW_HENRY_TABLE_KEY, 'en-US', {
    영어원문: 'Original English',
    한국어번역: 'English explanation',
    핵심통찰: 'Insight',
  });
  assert.deepEqual(en, {
    'English Original': 'Original English',
    'English Explanation': 'English explanation',
    'Key Insight': 'Insight',
  });

  const enSpaced = normalizeCommentaryCardRow(MATTHEW_HENRY_TABLE_KEY, 'en-US', {
    EnglishOriginal: 'A',
    KoreanTranslation: 'B',
    KeyInsight: 'C',
  });
  assert.deepEqual(enSpaced, {
    'English Original': 'A',
    'English Explanation': 'B',
    'Key Insight': 'C',
  });
});

test('staging Matthew Henry rows emit locale schema keys', () => {
  const job = {
    targetId: 'genesis.1.12.matthew-henry.ja-JP',
    bookId: 'genesis',
    chapter: 1,
    verse: 12,
    locale: 'ja-JP',
    type: 'matthew-henry',
    tableKey: MATTHEW_HENRY_TABLE_KEY,
  };
  const result = {
    targetId: job.targetId,
    translatedCards: [
      {
        itemIndex: 0,
        fields: {
          영어원문: 'God delights to behold His work thriving.',
          한국어번역: '神は繁栄する自身の作品を喜ばれる。',
          핵심통찰: '成長は喜び',
        },
      },
    ],
  };
  const built = buildStagedVerseEntry({ job, result, locale: 'ja-JP' });
  const row = built.entry[MATTHEW_HENRY_TABLE_KEY][0];
  assert.deepEqual(Object.keys(row), [...MATTHEW_HENRY_FIELDS_BY_LOCALE['ja-JP']]);
  assert.equal(row['日本語訳'], '神は繁栄する自身の作品を喜ばれる。');

  const fromBuilder = buildCardRowsFromTranslatedCards(result.translatedCards, {
    tableKey: MATTHEW_HENRY_TABLE_KEY,
    locale: 'en-US',
  });
  assert.deepEqual(Object.keys(fromBuilder[0]), [
    ...MATTHEW_HENRY_FIELDS_BY_LOCALE['en-US'],
  ]);
});

test('Genesis 1:11-1:31 EN/JA cards have non-empty bodies under locale schema', () => {
  const tables = [MATTHEW_HENRY_TABLE_KEY, ...Object.keys(NON_MATTHEW_HENRY_FIELDS_BY_TABLE)];
  for (const locale of ['en-US', 'ja-JP']) {
    const doc = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'data/commentary-cards', locale, 'genesis.json'),
        'utf8',
      ),
    );
    for (let verse = 11; verse <= 31; verse += 1) {
      const verseKey = `창세기_1_${verse}`;
      const entry = doc.verses[verseKey];
      assert.ok(entry, `${locale} missing ${verseKey}`);
      for (const tableKey of tables) {
        if (verse >= 11 && verse <= 15 && tableKey === '표6_설교자료') {
          assert.equal(
            entry[tableKey],
            undefined,
            `${locale} ${verseKey} sermon should be absent`,
          );
          continue;
        }
        const rows = entry[tableKey];
        const result = validateCommentaryTableRows(tableKey, locale, rows);
        assert.equal(
          result.ok,
          true,
          `${locale} ${verseKey} ${tableKey}: ${JSON.stringify(result.failures)}`,
        );
      }
    }
  }
});

test('Genesis 1:1-1:10 Matthew Henry schema remains the approved locale keys', () => {
  for (const locale of ['en-US', 'ja-JP']) {
    const doc = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'data/commentary-cards', locale, 'genesis.json'),
        'utf8',
      ),
    );
    const expected = MATTHEW_HENRY_FIELDS_BY_LOCALE[locale];
    for (let verse = 1; verse <= 10; verse += 1) {
      const rows = doc.verses[`창세기_1_${verse}`][MATTHEW_HENRY_TABLE_KEY];
      assert.deepEqual(Object.keys(rows[0]), [...expected]);
      for (const row of rows) {
        for (const field of expected) {
          assert.ok(String(row[field] || '').trim(), `empty ${locale} 1:${verse} ${field}`);
        }
      }
    }
  }
});
