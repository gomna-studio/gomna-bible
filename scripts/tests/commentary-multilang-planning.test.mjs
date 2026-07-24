import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  extractSourceCards,
  listCommentaryTypes,
} from '../lib/commentary-type-registry.mjs';
import { buildCommentaryMultilangTargets } from '../lib/commentary-multilang-targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function createMissingEightTypeFixture() {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gomna-planning-fixture-'),
  );
  fs.symlinkSync(
    path.join(ROOT, 'gomna_data_genesis.js'),
    path.join(fixtureRoot, 'gomna_data_genesis.js'),
  );
  fs.mkdirSync(path.join(fixtureRoot, 'audio'), { recursive: true });
  fs.symlinkSync(
    path.join(ROOT, 'audio/audio-manifest.json'),
    path.join(fixtureRoot, 'audio/audio-manifest.json'),
  );
  fs.mkdirSync(path.join(fixtureRoot, 'tts-scripts'), { recursive: true });
  fs.symlinkSync(
    path.join(ROOT, 'tts-scripts/ko-KR'),
    path.join(fixtureRoot, 'tts-scripts/ko-KR'),
  );

  for (const locale of ['en-US', 'ja-JP']) {
    for (const verse of [1, 2, 3]) {
      const v = String(verse).padStart(3, '0');
      const scriptDir = path.join(
        fixtureRoot,
        `tts-scripts/${locale}/genesis/001/${v}`,
      );
      fs.mkdirSync(scriptDir, { recursive: true });
      for (const file of [
        'original-language.txt',
        'original-language.meta.json',
      ]) {
        fs.symlinkSync(
          path.join(ROOT, `tts-scripts/${locale}/genesis/001/${v}/${file}`),
          path.join(scriptDir, file),
        );
      }

      const audioDir = path.join(
        fixtureRoot,
        `audio/v1/${locale}/genesis/001/${v}`,
      );
      fs.mkdirSync(audioDir, { recursive: true });
      fs.symlinkSync(
        path.join(
          ROOT,
          `audio/v1/${locale}/genesis/001/${v}/original-language-study.mp3`,
        ),
        path.join(audioDir, 'original-language-study.mp3'),
      );

      const cueDir = path.join(
        fixtureRoot,
        `audio/cues/${locale}/genesis/001/${v}`,
      );
      fs.mkdirSync(cueDir, { recursive: true });
      fs.symlinkSync(
        path.join(
          ROOT,
          `audio/cues/${locale}/genesis/001/${v}/original-language.json`,
        ),
        path.join(cueDir, 'original-language.json'),
      );
    }
  }

  return fixtureRoot;
}

const EXPECTED_CARD_COUNTS = Object.freeze({
  'original-language': 5,
  history: 3,
  theology: 3,
  typology: 3,
  'matthew-henry': 3,
  sermon: 6,
  hymn: 4,
  counseling: 3,
  'cross-reference': 8,
});

function loadGenesisEntry(verse) {
  const filePath = path.join(ROOT, 'gomna_data_genesis.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    window: { pastorCommentaryData: {} },
    pastorCommentaryData: {},
    commentaryData: {},
    module: { exports: {} },
  };
  vm.runInNewContext(source, sandbox, { filename: filePath });
  const data = Object.keys(sandbox.pastorCommentaryData).length
    ? sandbox.pastorCommentaryData
    : sandbox.window.pastorCommentaryData;
  return data[`창세기_1_${verse}`];
}

test('Genesis 1:1-3 source extraction yields expected card counts and indexes', () => {
  for (const verse of [1, 2, 3]) {
    const entry = loadGenesisEntry(verse);
    assert.ok(entry, `missing Genesis 1:${verse}`);
    for (const definition of listCommentaryTypes()) {
      const cards = extractSourceCards(entry, definition.type);
      assert.equal(
        cards.length,
        EXPECTED_CARD_COUNTS[definition.type],
        `${definition.type} verse ${verse}`,
      );
      for (let index = 0; index < cards.length; index += 1) {
        assert.equal(cards[index].itemIndex, index);
      }
      assert.equal(new Set(cards.map((card) => card.identity)).size, cards.length);
    }
  }
});

test('matthew-henry / hymn / cross-reference do not invent extra cards from nested fields', () => {
  const entry = loadGenesisEntry(1);

  const mh = extractSourceCards(entry, 'matthew-henry');
  assert.equal(mh.length, 3);
  assert.ok(mh[0].fields.영어원문);
  assert.ok(mh[0].fields.한국어번역);

  const hymn = extractSourceCards(entry, 'hymn');
  assert.equal(hymn.length, 4);
  assert.ok(hymn[0].fields.제목);
  assert.ok(hymn[0].fields.새찬송가);

  const xr = extractSourceCards(entry, 'cross-reference');
  assert.equal(xr.length, 8);
  assert.match(xr[0].fields.구절, /:/);
  // Nested verse text stays inside the same card fields.
  assert.ok(xr[0].fields.연결점);
});

test('sermon indexes are contiguous 0-5 and cross-reference 0-7', () => {
  const entry = loadGenesisEntry(1);
  const sermon = extractSourceCards(entry, 'sermon');
  assert.equal(sermon.length, 6);
  sermon.forEach((card, index) => assert.equal(card.itemIndex, index));
  const xr = extractSourceCards(entry, 'cross-reference');
  assert.equal(xr.length, 8);
  xr.forEach((card, index) => assert.equal(card.itemIndex, index));
});

test('planning --types all yields 54 unique targets with 6 complete and 48 missing narrations', async () => {
  const fixtureRoot = createMissingEightTypeFixture();
  try {
    process.env.GOMNA_ROOT = fixtureRoot;
    const { buildCommentaryMultilangTargets: buildPlan } = await import(
      `../lib/commentary-multilang-targets.mjs?fixture=${Date.now()}`
    );

    const plan = buildPlan({
      locales: 'en-US,ja-JP',
      bookId: 'genesis',
      chapter: 1,
      fromVerse: 1,
      toVerse: 3,
      types: 'all',
    });

    assert.equal(plan.targetCount, 54);
    assert.equal(plan.sourceCount, 27);
    assert.equal(plan.types.length, 9);
    assert.equal(new Set(plan.targets.map((target) => target.audioId)).size, 54);

    const complete = plan.targets.filter(
      (target) =>
        target.narrationExists &&
        target.metaApproved &&
        target.audioExists &&
        target.cueExists &&
        target.manifestPublished,
    );
    const missingNarration = plan.targets.filter(
      (target) => !target.narrationExists,
    );

    assert.equal(complete.length, 6);
    assert.equal(missingNarration.length, 48);
    assert.ok(complete.every((target) => target.type === 'original-language'));
    assert.ok(
      missingNarration.every((target) => target.type !== 'original-language'),
    );

    for (const definition of listCommentaryTypes()) {
      const typed = plan.targets.filter(
        (target) => target.type === definition.type,
      );
      assert.equal(typed.length, 6);
      for (const target of typed) {
        assert.equal(target.cardCount, EXPECTED_CARD_COUNTS[definition.type]);
        assert.equal(target.voicePreset, definition.voicePreset);
        assert.equal(
          path.basename(target.audioPath),
          `${definition.type}-${definition.voicePreset}.mp3`,
        );
        assert.equal(path.basename(target.cuePath), `${definition.type}.json`);
      }
    }
  } finally {
    delete process.env.GOMNA_ROOT;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('planning --type and comma --types remain compatible', () => {
  const single = buildCommentaryMultilangTargets({
    locales: 'en-US,ja-JP',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 1,
    toVerse: 3,
    type: 'original-language',
  });
  assert.equal(single.targetCount, 6);

  const multi = buildCommentaryMultilangTargets({
    locales: 'en-US',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 1,
    toVerse: 1,
    types: 'theology,history',
  });
  assert.deepEqual(
    multi.targets.map((target) => target.type),
    ['history', 'theology'],
  );
});
