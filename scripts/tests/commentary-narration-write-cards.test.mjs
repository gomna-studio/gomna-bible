import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCommentarySourceCards } from '../lib/commentary-multilang-targets.mjs';
import { buildCommentaryMultilangTargets } from '../lib/commentary-multilang-targets.mjs';
import {
  buildNarrationPreflight,
  buildNarrationTranslationOptions,
  runPlannedNarrationTranslations,
} from '../run-commentary-multilang-pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EIGHT_TYPES = [
  'history',
  'theology',
  'typology',
  'matthew-henry',
  'sermon',
  'hymn',
  'counseling',
  'cross-reference',
];

const TEMP_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'gomna-narration-write-cards-'),
);

function cleanupTemp() {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

function buildEightTypePlan() {
  return buildCommentaryMultilangTargets({
    locales: 'en-US,ja-JP',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 1,
    toVerse: 3,
    types: EIGHT_TYPES.join(','),
  });
}

test('write options always pass koreanSource.cards for all eight non-OL types', () => {
  const plan = buildEightTypePlan();
  assert.equal(plan.targetCount, 48);

  const preflight = buildNarrationPreflight(plan);
  assert.equal(preflight.planned.length, 48);
  assert.equal(preflight.hardBlockers.length, 0);

  const seenTypes = new Set();
  for (const item of preflight.planned) {
    assert.notEqual(item.target.type, 'original-language');
    seenTypes.add(item.target.type);

    const options = buildNarrationTranslationOptions(item, {
      sourceBytes: Buffer.from(item.koreanSource.text, 'utf8'),
      apiKey: 'test-key-must-not-be-used',
      model: 'fake-model',
      counters: { totalCalls: 0 },
    });

    assert.ok(Array.isArray(options.cards), `${item.audioId}: cards missing`);
    assert.equal(options.cards, item.koreanSource.cards);
    assert.equal(options.type, item.target.type);
    assert.equal(options.verse, item.target.verse);
    assert.equal(options.cardCount, item.target.cardCount);
    assert.equal(options.targetLocale, item.target.locale);

    const extracted = loadCommentarySourceCards(
      item.target.bookId,
      item.target.chapter,
      item.target.verse,
      item.target.type,
    );
    assert.equal(options.cards.length, extracted.cardCount);
    assert.equal(options.cardCount, extracted.cardCount);
    options.cards.forEach((card, index) => {
      assert.equal(card.itemIndex, index);
      assert.equal(card.itemIndex, extracted.cards[index].itemIndex);
    });
  }

  for (const type of EIGHT_TYPES) {
    assert.ok(seenTypes.has(type), `missing type ${type}`);
  }
});

test('write path with cards enters fake translator for all 48 targets', async () => {
  const markerPath = path.join(TEMP_DIR, 'fake-translate-calls.json');
  const plan = buildEightTypePlan();
  const preflight = buildNarrationPreflight(plan);
  assert.equal(preflight.planned.length, 48);

  let openaiCalls = 0;
  const fakeTranslateCalls = [];

  const translationRun = await runPlannedNarrationTranslations({
    actions: preflight.actions,
    apiKey: 'must-not-call-openai',
    model: 'fake-model',
    counters: { totalCalls: 0 },
    readSourceBytes: (absolutePath) => fs.readFileSync(absolutePath),
    translateFn: async (options) => {
      openaiCalls += 1;
      fakeTranslateCalls.push({
        audioId: `${options.bookId}:${options.chapter}:${options.verse}:${options.type}:${options.targetLocale}`,
        type: options.type,
        cardCount: options.cardCount,
        cardsLength: options.cards?.length,
        itemIndexes: (options.cards || []).map((card) => card.itemIndex),
      });
      return {
        ok: true,
        narrationText: 'fake',
        metadataJson: '{}',
        paragraphCount: 0,
        narrationSha256: 'fake',
        model: 'fake-model',
        metadata: { sourceHash: options.sourceSha256 },
      };
    },
  });

  fs.writeFileSync(markerPath, JSON.stringify(fakeTranslateCalls, null, 2));

  assert.equal(translationRun.translationCalls.length, 48);
  assert.equal(fakeTranslateCalls.length, 48);
  assert.equal(openaiCalls, 48);
  assert.equal(
    translationRun.results.filter((item) => item.action === 'translation_ok')
      .length,
    48,
  );
  assert.ok(
    translationRun.results.every((item) => item.reachedTranslator === true),
  );
  assert.equal(
    translationRun.results.filter((item) =>
      String(item.error || '').includes('Missing source cards'),
    ).length,
    0,
  );

  for (const options of translationRun.translationCalls) {
    assert.ok(Array.isArray(options.cards) && options.cards.length > 0);
    const extracted = loadCommentarySourceCards(
      options.bookId,
      options.chapter,
      options.verse,
      options.type,
    );
    assert.equal(options.cards.length, extracted.cards.length);
    options.cards.forEach((card, index) => {
      assert.equal(card.itemIndex, index);
      assert.equal(card.itemIndex, extracted.cards[index].itemIndex);
    });
  }

  // No production narration / metadata writes from this mock path.
  for (const item of preflight.planned) {
    const narrationAbs = path.join(ROOT, item.target.narrationPath);
    const metaAbs = path.join(ROOT, item.target.metaPath);
    assert.equal(fs.existsSync(narrationAbs), false, item.target.narrationPath);
    assert.equal(fs.existsSync(metaAbs), false, item.target.metaPath);
  }
});

test('write path without cards is blocked before fake translator', async () => {
  const plan = buildEightTypePlan();
  const preflight = buildNarrationPreflight(plan);
  const sample = preflight.planned.find(
    (item) => item.target.type === 'history' && item.target.verse === 1,
  );
  assert.ok(sample);

  const stripped = {
    ...sample,
    koreanSource: {
      ...sample.koreanSource,
      cards: [],
    },
  };

  let fakeCalls = 0;
  const translationRun = await runPlannedNarrationTranslations({
    actions: [stripped],
    apiKey: 'must-not-call-openai',
    readSourceBytes: () => Buffer.from(stripped.koreanSource.text, 'utf8'),
    translateFn: async () => {
      fakeCalls += 1;
      return { ok: true };
    },
  });

  assert.equal(fakeCalls, 0);
  assert.equal(translationRun.translationCalls.length, 0);
  assert.equal(translationRun.results.length, 1);
  assert.equal(translationRun.results[0].ok, false);
  assert.equal(translationRun.results[0].reachedTranslator, false);
  assert.match(
    translationRun.results[0].error,
    /Missing source cards for type history/,
  );
});

test('buildNarrationTranslationOptions wires cards from koreanSource only', () => {
  const extracted = loadCommentarySourceCards('genesis', 1, 1, 'sermon');
  const item = {
    target: {
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'sermon',
      locale: 'en-US',
      cardCount: extracted.cardCount,
    },
    koreanSource: {
      text: 'ko',
      cards: extracted.cards,
      sourcePath: 'tts-scripts/ko-KR/genesis/001/001/sermon.txt',
      sourceSha256: 'abc',
      absolutePath: path.join(
        ROOT,
        'tts-scripts/ko-KR/genesis/001/001/sermon.txt',
      ),
    },
  };

  const options = buildNarrationTranslationOptions(item, {
    sourceBytes: Buffer.from('ko'),
    apiKey: 'x',
  });
  assert.equal(options.cards, extracted.cards);
  assert.equal(options.cards.length, 6);
  options.cards.forEach((card, index) => assert.equal(card.itemIndex, index));
});

test.after(() => {
  cleanupTemp();
  assert.equal(fs.existsSync(TEMP_DIR), false);
});
