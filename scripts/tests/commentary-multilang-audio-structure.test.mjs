import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  validateApprovedNarrationTarget,
} from '../lib/commentary-multilang-audio.mjs';
import {
  getCommentaryType,
  listCommentaryTypes,
} from '../lib/commentary-type-registry.mjs';
import {
  buildNarrationStructureSignature,
  parseNarrationStructure,
  sha256Text,
} from '../lib/commentary-multilang-translation.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

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

const TEMP_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), 'gomna-audio-structure-'),
);

function cleanupTemp() {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(relPath, contents) {
  const abs = path.join(TEMP_ROOT, relPath);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, contents);
  return abs;
}

function sha256File(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function buildApprovedMeta({
  sourcePath,
  sourceHash,
  locale,
  type,
  verse,
  cardCount,
  cardIdentities,
  narrationText,
  sourceText,
  status = 'approved',
  humanReviewRequired = false,
}) {
  const sourceStructure = buildNarrationStructureSignature(
    parseNarrationStructure(sourceText),
  );
  const narrationStructure = buildNarrationStructureSignature(
    parseNarrationStructure(narrationText),
  );
  const stamp = '2026-07-23T04:00:00Z';
  const meta = {
    sourcePath,
    sourceHashAlgorithm: 'sha256',
    sourceHash,
    sourceLocale: 'ko-KR',
    targetLocale: locale,
    status,
    translatedAt: stamp,
    bookId: 'genesis',
    chapter: 1,
    verse,
    type,
    paragraphCount: narrationStructure.paragraphCount,
    cardCount,
    narrationHashAlgorithm: 'sha256',
    narrationHash: sha256Text(narrationText),
    model: 'gpt-4o-2024-08-06',
    structureValidated: true,
    sourceStructure: {
      paragraphCount: sourceStructure.paragraphCount,
      lineCounts: sourceStructure.lineCounts,
      totalLineCount: sourceStructure.totalLineCount,
    },
    narrationStructure: {
      paragraphCount: narrationStructure.paragraphCount,
      lineCounts: narrationStructure.lineCounts,
      totalLineCount: narrationStructure.totalLineCount,
    },
    reviewedAt: stamp,
    approvedAt: stamp,
  };
  if (humanReviewRequired !== undefined) {
    meta.humanReviewRequired = humanReviewRequired;
  }
  if (Array.isArray(cardIdentities)) {
    meta.cardIdentities = cardIdentities;
  }
  return meta;
}

function makeTarget({
  locale,
  type,
  verse,
  cardCount,
  cardIdentities,
  voicePreset,
}) {
  const v = String(verse).padStart(3, '0');
  const definition = getCommentaryType(type);
  return {
    audioId: `genesis.001.${v}.${type}.${locale}`,
    bookId: 'genesis',
    chapter: 1,
    verse,
    type,
    locale,
    cardCount,
    cardIdentities,
    voicePreset: voicePreset || definition.voicePreset,
    narrationPath: `tts-scripts/${locale}/genesis/001/${v}/${type}.txt`,
    metaPath: `tts-scripts/${locale}/genesis/001/${v}/${type}.meta.json`,
    sourcePath: `tts-scripts/ko-KR/genesis/001/${v}/${type}.txt`,
  };
}

function installPair({
  locale,
  type,
  verse,
  sourceText,
  narrationText,
  cardCount,
  cardIdentities,
  metaOverrides = {},
}) {
  const v = String(verse).padStart(3, '0');
  const sourcePath = `tts-scripts/ko-KR/genesis/001/${v}/${type}.txt`;
  const narrationPath = `tts-scripts/${locale}/genesis/001/${v}/${type}.txt`;
  const metaPath = `tts-scripts/${locale}/genesis/001/${v}/${type}.meta.json`;
  writeFile(sourcePath, sourceText);
  writeFile(narrationPath, narrationText);
  const sourceHash = sha256File(path.join(TEMP_ROOT, sourcePath));
  const meta = {
    ...buildApprovedMeta({
      sourcePath,
      sourceHash,
      locale,
      type,
      verse,
      cardCount,
      cardIdentities,
      narrationText,
      sourceText,
    }),
    ...metaOverrides,
  };
  if (metaOverrides.omitHumanReviewRequired) {
    delete meta.humanReviewRequired;
    delete meta.omitHumanReviewRequired;
  }
  writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return makeTarget({
    locale,
    type,
    verse,
    cardCount,
    cardIdentities,
  });
}

function validate(target) {
  return validateApprovedNarrationTarget({
    target,
    root: TEMP_ROOT,
    toAbsolute: (relativePath) => path.join(TEMP_ROOT, relativePath),
  });
}

test('non-original-language two-paragraph narrations pass audio validation for all eight types', () => {
  const sourceText =
    'Genesis fixture intro line.\n\nCard one line.\nCard two line.\nCard three line.\n';
  const narrationText =
    'Translated fixture intro line.\n\nCard one line.\nCard two line.\nCard three line.\n';
  const cardIdentities = ['a', 'b', 'c'];

  for (const type of EIGHT_TYPES) {
    const cardCount =
      type === 'sermon' ? 6 : type === 'cross-reference' ? 8 : type === 'hymn' ? 4 : 3;
    const identities = Array.from({ length: cardCount }, (_, index) => `id-${index}`);
    const cardsBlock = identities.map((id) => `Card ${id}`).join('\n');
    const typedSource = `Intro for ${type}.\n\n${cardsBlock}\n`;
    const typedNarration = `Intro for ${type} translated.\n\n${cardsBlock}\n`;
    const target = installPair({
      locale: 'en-US',
      type,
      verse: 2,
      sourceText: typedSource,
      narrationText: typedNarration,
      cardCount,
      cardIdentities: identities,
    });
    const result = validate(target);
    assert.equal(result.ok, true, `${type}: ${result.reason}`);
    assert.equal(result.ttsConfig.voicePreset, getCommentaryType(type).voicePreset);
    assert.equal(result.sourceSignature.paragraphCount, 2);
  }
});

test('original-language two-paragraph narration remains blocked', () => {
  const sourceText = 'Intro only.\n\nOne card line.\n';
  const narrationText = 'Intro only translated.\n\nOne card line.\n';
  const target = installPair({
    locale: 'en-US',
    type: 'original-language',
    verse: 2,
    sourceText,
    narrationText,
    cardCount: 1,
    cardIdentities: ['term'],
  });
  const result = validate(target);
  assert.equal(result.ok, false);
  assert.equal(result.action, 'block_structure_mismatch');
  assert.match(result.reason, /intro, card lines, and closing/);
});

test('empty narration and invalid metadata are blocked', () => {
  const sourceText =
    'Intro.\n\nCard A.\nCard B.\nCard C.\n\nClosing.\n';
  const goodNarration =
    'Intro translated.\n\nCard A.\nCard B.\nCard C.\n\nClosing.\n';
  const identities = ['A', 'B', 'C'];

  const emptyTarget = installPair({
    locale: 'ja-JP',
    type: 'history',
    verse: 3,
    sourceText,
    narrationText: goodNarration,
    cardCount: 3,
    cardIdentities: identities,
  });
  fs.writeFileSync(
    path.join(TEMP_ROOT, emptyTarget.narrationPath),
    '   \n',
  );
  const emptyMeta = JSON.parse(
    fs.readFileSync(path.join(TEMP_ROOT, emptyTarget.metaPath), 'utf8'),
  );
  emptyMeta.narrationHash = sha256Text('   \n');
  emptyMeta.narrationStructure = {
    paragraphCount: 0,
    lineCounts: [],
    totalLineCount: 0,
  };
  emptyMeta.paragraphCount = 0;
  fs.writeFileSync(
    path.join(TEMP_ROOT, emptyTarget.metaPath),
    `${JSON.stringify(emptyMeta, null, 2)}\n`,
  );
  const emptyResult = validate(emptyTarget);
  assert.equal(emptyResult.ok, false);
  assert.match(emptyResult.reason, /empty|structure/i);

  const draftTarget = installPair({
    locale: 'en-US',
    type: 'theology',
    verse: 3,
    sourceText,
    narrationText: goodNarration,
    cardCount: 3,
    cardIdentities: identities,
    metaOverrides: { status: 'draft', humanReviewRequired: true },
  });
  const draftResult = validate(draftTarget);
  assert.equal(draftResult.ok, false);
  assert.equal(draftResult.action, 'block_unapproved_narration');

  const badCountTarget = installPair({
    locale: 'en-US',
    type: 'counseling',
    verse: 3,
    sourceText,
    narrationText: goodNarration,
    cardCount: 3,
    cardIdentities: identities,
    metaOverrides: { cardCount: 99 },
  });
  const badCountResult = validate(badCountTarget);
  assert.equal(badCountResult.ok, false);
  assert.match(String(badCountResult.reason), /cardCount/);
});

test('registry voicePreset is enforced for every commentary type', () => {
  for (const definition of listCommentaryTypes()) {
    if (definition.type === 'original-language') continue;
    const cardCount = 3;
    const identities = ['x', 'y', 'z'];
    const sourceText = 'Intro.\n\nA\nB\nC\n';
    const narrationText = 'Intro en.\n\nA\nB\nC\n';
    const target = installPair({
      locale: 'en-US',
      type: definition.type,
      verse: 1,
      sourceText,
      narrationText,
      cardCount,
      cardIdentities: identities,
    });
    target.voicePreset = 'mismatched-preset';
    const result = validate(target);
    assert.equal(result.ok, false, definition.type);
    assert.equal(result.action, 'block_unsupported_audio_preset');
  }
});

test.after(() => {
  cleanupTemp();
  assert.equal(fs.existsSync(TEMP_ROOT), false);
});
