/**
 * Commentary header scripture must follow KO/EN/JA immediately on language change,
 * using the same updateCompactCommentaryHeader path as play-start.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readerSource = fs.readFileSync(path.join(ROOT, 'reader.html'), 'utf8');
const audioButtonsSource = fs.readFileSync(
  path.join(ROOT, 'js/gomna-audio-commentary-buttons.js'),
  'utf8',
);

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  assert.ok(i >= 0);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadHeaderHelpers(sandboxExtras) {
  const code = [
    extractFunction(readerSource, 'getKoreanBibleVerseText'),
    extractFunction(readerSource, 'getLocaleCardVerseText'),
    extractFunction(readerSource, 'getCommentaryHeaderVerseText'),
    extractFunction(readerSource, 'getCommentaryCardLocale'),
    extractFunction(readerSource, 'peekLocaleCommentaryCards'),
  ].join('\n');
  const sandbox = {
    BOOK_FILE_MAP: { 창세기: 'genesis' },
    getReaderUiLangCode: function () { return 'ko'; },
    oldTestamentData: {
      books: [{
        name: '창세기',
        chapters: [{
          chapter: 1,
          verses: [
            { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
            { verse: 27, text: '하나님이 자기 형상 곧 하나님의 형상대로 사람을 창조하시되 남자와 여자를 창조하시고' },
          ],
        }],
      }],
    },
    newTestamentData: { books: [] },
    _localeCommentaryCards: {},
    ...sandboxExtras,
  };
  vm.runInNewContext(code + '\nthis.getCommentaryHeaderVerseText = getCommentaryHeaderVerseText;', sandbox);
  return sandbox;
}

test('reader wires languagechange to commentary refresh and shared header update', () => {
  assert.match(readerSource, /gomna:languagechange/);
  assert.match(readerSource, /refreshCommentaryForUiLanguageChange/);
  assert.match(readerSource, /updateCompactCommentaryHeaderForCurrentVerse/);
  assert.match(readerSource, /getLocaleCardVerseText/);
  assert.match(readerSource, /__gomnaBridgeDisplayLang/);
  assert.match(
    audioButtonsSource,
    /updateCompactCommentaryHeaderForCurrentVerse/,
  );
});

test('KO uses Korean bible; EN/JA prefer card verseText then Korean fallback', () => {
  const cards = {
    status: 'ready',
    data: {
      verses: {
        창세기_1_1: { verseText: 'In the beginning God created the heaven and the earth.' },
        창세기_1_27: { verseText: '' },
      },
    },
  };
  const sandbox = loadHeaderHelpers({
    getReaderUiLangCode: function () { return sandbox.__lang; },
    _localeCommentaryCards: {
      'en-US|genesis': cards,
      'ja-JP|genesis': {
        status: 'ready',
        data: {
          verses: {
            창세기_1_1: { verseText: '初めに、神は天と地を創造された。' },
            창세기_1_27: { verseText: '神がご自身の形に人を創造された' },
          },
        },
      },
    },
  });

  sandbox.__lang = 'ko';
  assert.equal(
    sandbox.getCommentaryHeaderVerseText('창세기', 1, 1),
    '태초에 하나님이 천지를 창조하시니라',
  );

  sandbox.__lang = 'en';
  assert.equal(
    sandbox.getCommentaryHeaderVerseText('창세기', 1, 1),
    'In the beginning God created the heaven and the earth.',
  );
  assert.equal(
    sandbox.getCommentaryHeaderVerseText('창세기', 1, 27),
    '하나님이 자기 형상 곧 하나님의 형상대로 사람을 창조하시되 남자와 여자를 창조하시고',
  );

  sandbox.__lang = 'ja';
  assert.equal(
    sandbox.getCommentaryHeaderVerseText('창세기', 1, 1),
    '初めに、神は天と地を創造された。',
  );
  assert.equal(
    sandbox.getCommentaryHeaderVerseText('창세기', 1, 27),
    '神がご自身の形に人を創造された',
  );
});

test('published Genesis EN/JA card JSON has verseText for 1:21 and 1:27', () => {
  for (const locale of ['en-US', 'ja-JP']) {
    const doc = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data/commentary-cards', locale, 'genesis.json'), 'utf8'),
    );
    for (const verse of [21, 27]) {
      const text = String(doc.verses['창세기_1_' + verse].verseText || '').trim();
      assert.ok(text.length > 10, locale + ' 1:' + verse + ' verseText missing');
      if (locale === 'en-US') {
        assert.match(text, /[A-Za-z]/);
        assert.doesNotMatch(text, /[가-힣]/);
      } else {
        assert.match(text, /[ぁ-んァ-ン一-龯]/);
        assert.doesNotMatch(text, /[가-힣]/);
      }
    }
  }
});
