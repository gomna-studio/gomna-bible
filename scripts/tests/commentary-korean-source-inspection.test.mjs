import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  extractSourceCards,
  listCommentaryTypes,
} from '../lib/commentary-type-registry.mjs';
import { loadCommentarySourceCards } from '../lib/commentary-multilang-targets.mjs';
import { inspectKoreanSourceText } from '../lib/commentary-multilang-translation.mjs';
import { buildCommentaryMultilangTargets } from '../lib/commentary-multilang-targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PIPELINE = path.join(ROOT, 'scripts/run-commentary-multilang-pipeline.mjs');

const EIGHT_TYPES =
  'history,theology,typology,matthew-henry,sermon,hymn,counseling,cross-reference';

function readKoSource(verse, type) {
  return fs.readFileSync(
    path.join(
      ROOT,
      'tts-scripts/ko-KR/genesis/001',
      String(verse).padStart(3, '0'),
      `${type}.txt`,
    ),
    'utf8',
  );
}

test('Genesis 1:2-3 eight-type Korean sources pass with two paragraphs when cards are valid', () => {
  for (const verse of [2, 3]) {
    for (const definition of listCommentaryTypes()) {
      if (definition.type === 'original-language') continue;
      const extracted = loadCommentarySourceCards('genesis', 1, verse, definition.type);
      const text = readKoSource(verse, definition.type);
      const result = inspectKoreanSourceText(text, {
        type: definition.type,
        cardCount: extracted.cardCount,
        cards: extracted.cards,
      });
      assert.equal(
        result.ok,
        true,
        `verse ${verse} ${definition.type}: ${result.errors.join('; ')}`,
      );
      assert.ok(result.paragraphCount < 3);
      assert.equal(result.cardCount, extracted.cardCount);
    }
  }
});

test('empty or missing cards still block non-original-language sources', () => {
  const text = readKoSource(2, 'history');
  const blockedMissing = inspectKoreanSourceText(text, {
    type: 'history',
    cardCount: 3,
    cards: [],
  });
  assert.equal(blockedMissing.ok, false);
  assert.match(blockedMissing.errors.join(' '), /Missing source cards/);

  const extracted = loadCommentarySourceCards('genesis', 1, 2, 'history');
  const emptyCard = {
    itemIndex: 0,
    identity: '',
    fields: { 항목: '', 내용: '', 목회적활용: '' },
  };
  const blockedEmpty = inspectKoreanSourceText(text, {
    type: 'history',
    cardCount: extracted.cardCount,
    cards: [emptyCard, extracted.cards[1], extracted.cards[2]],
  });
  assert.equal(blockedEmpty.ok, false);
  assert.match(blockedEmpty.errors.join(' '), /Empty source card/);
});

test('original-language still requires at least three paragraphs', () => {
  const twoParagraph = 'intro line\n\nonly one more paragraph\n';
  const cards = [
    {
      itemIndex: 0,
      identity: 'a',
      fields: { 원어: 'a', 의미_문법: 'b', 설교포인트: 'c' },
    },
  ];
  const blocked = inspectKoreanSourceText(twoParagraph, {
    type: 'original-language',
    cardCount: 1,
    cards,
  });
  assert.equal(blocked.ok, false);
  assert.match(
    blocked.errors.join(' '),
    /paragraph count must be at least 3/,
  );

  const real = readKoSource(1, 'original-language');
  const extracted = loadCommentarySourceCards(
    'genesis',
    1,
    1,
    'original-language',
  );
  const ok = inspectKoreanSourceText(real, {
    type: 'original-language',
    cardCount: extracted.cardCount,
    cards: extracted.cards,
  });
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.ok(ok.paragraphCount >= 3);
});

test('narration dry-run for eight types plans all 48 translations with zero blockers', () => {
  const result = spawnSync(
    process.execPath,
    [
      PIPELINE,
      '--locales',
      'en-US,ja-JP',
      '--book',
      'genesis',
      '--chapter',
      '1',
      '--from-verse',
      '1',
      '--to-verse',
      '3',
      '--types',
      EIGHT_TYPES,
      '--stage',
      'narration',
      '--dry-run',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENAI_API_KEY: '',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /○ Locale target count\n {2}48/);
  assert.match(result.stdout, /○ planned_translation\n {2}48/);
  assert.match(result.stdout, /○ API translations required\n {2}48/);
  assert.match(result.stdout, /○ Blockers\n {2}none/);
  assert.doesNotMatch(result.stdout, /original-language/);
  assert.doesNotMatch(result.stdout, /paragraph count must be at least 3/);
});

test('original-language six targets remain complete and approved', () => {
  const plan = buildCommentaryMultilangTargets({
    locales: 'en-US,ja-JP',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 1,
    toVerse: 3,
    type: 'original-language',
  });
  assert.equal(plan.targetCount, 6);
  assert.ok(
    plan.targets.every(
      (target) =>
        target.type === 'original-language' &&
        target.narrationExists &&
        target.metaApproved &&
        target.audioExists &&
        target.cueExists &&
        target.manifestPublished,
    ),
  );

  const narration = spawnSync(
    process.execPath,
    [
      PIPELINE,
      '--locales',
      'en-US,ja-JP',
      '--book',
      'genesis',
      '--chapter',
      '1',
      '--from-verse',
      '1',
      '--to-verse',
      '3',
      '--type',
      'original-language',
      '--stage',
      'narration',
      '--dry-run',
    ],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' } },
  );
  assert.equal(narration.status, 0, narration.stderr || narration.stdout);
  assert.match(narration.stdout, /○ skip_approved\n {2}6/);
  assert.match(narration.stdout, /○ planned_translation\n {2}0/);
});

test('card extraction remains independent of TTS paragraph count', () => {
  const extracted = loadCommentarySourceCards('genesis', 1, 2, 'sermon');
  assert.equal(extracted.cardCount, 6);
  extracted.cards.forEach((card, index) => assert.equal(card.itemIndex, index));
  const again = extractSourceCards(
    {
      표6_설교자료: extracted.cards.map((card) => ({ ...card.fields })),
    },
    'sermon',
  );
  assert.equal(again.length, 6);
});
