import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  GLOBAL_MANIFEST_LOCK_PATH,
  acquireManifestLock,
  buildCanonicalManifestEntry,
  buildCanonicalManifestId,
  buildCanonicalManifestPublicUrl,
  compareManifestRegistration,
  createProductionManifestAdapters,
  isManifestTestMode,
  releaseManifestLock,
} from '../lib/commentary-multilang-manifest.mjs';
import { validateMp3File } from '../lib/commentary-multilang-audio.mjs';

process.env.GOMNA_COMMENTARY_MULTILANG_TEST_MODE = '1';
delete process.env.GOMNA_COMMENTARY_MULTILANG_MANIFEST;
delete process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
delete process.env.OPENAI_API_KEY;

const FIXTURE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'gomna-manifest-safety-'),
);
const FIXTURE_MP3 = path.join(FIXTURE_DIR, 'valid.mp3');

function ensureFixtureMp3() {
  if (fs.existsSync(FIXTURE_MP3) && fs.statSync(FIXTURE_MP3).size > 0) {
    return validateMp3File(FIXTURE_MP3);
  }
  const gen = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-codec:a',
      'libmp3lame',
      '-qscale:a',
      '9',
      FIXTURE_MP3,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(gen.status, 0, gen.stderr);
  return validateMp3File(FIXTURE_MP3);
}

function baseManifest(audios = {}) {
  return {
    version: '1.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    totalAudios: Object.keys(audios).length,
    audios,
  };
}

test.after(() => {
  releaseManifestLock(GLOBAL_MANIFEST_LOCK_PATH);
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test('test mode blocks real manifest I/O adapters', () => {
  assert.equal(isManifestTestMode(), true);
  assert.throws(
    () => createProductionManifestAdapters(),
    /block_test_real_io/,
  );
});

test('global manifest lock path remains exact', () => {
  assert.equal(
    GLOBAL_MANIFEST_LOCK_PATH,
    '/tmp/gomna-commentary-multilang-manifest.lock',
  );
  releaseManifestLock(GLOBAL_MANIFEST_LOCK_PATH);
  const lock = acquireManifestLock(GLOBAL_MANIFEST_LOCK_PATH);
  assert.equal(lock.ok, true);
  releaseManifestLock(GLOBAL_MANIFEST_LOCK_PATH);
});

test('canonical IDs and URLs are type/preset aware', () => {
  assert.equal(
    buildCanonicalManifestId({
      bookId: 'genesis',
      chapter: 1,
      verse: 2,
      type: 'original-language',
      locale: 'en-US',
    }),
    'genesis.001.002.original-language.en-US',
  );
  assert.equal(
    buildCanonicalManifestPublicUrl({
      locale: 'ja-JP',
      bookId: 'genesis',
      chapter: 1,
      verse: 3,
      type: 'history',
      voicePreset: 'warm',
    }),
    'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev/commentary/ja-JP/genesis/001/003/history-warm.mp3',
  );
  assert.throws(() =>
    buildCanonicalManifestPublicUrl({
      locale: 'en-US',
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'history',
      voicePreset: 'study',
    }),
  );
});

test('fixture manifest: existing exact entry skips; missing entry plans; conflicts block', () => {
  const mp3 = ensureFixtureMp3();
  const existing = buildCanonicalManifestEntry({
    locale: 'en-US',
    bookId: 'genesis',
    chapter: 1,
    verse: 8,
    type: 'original-language',
    voicePreset: 'study',
    durationSeconds: mp3.duration,
    fileSize: mp3.byteSize,
  });
  const manifest = baseManifest({ [existing.id]: existing });

  assert.equal(
    compareManifestRegistration({
      manifest,
      canonicalEntry: existing,
    }).action,
    'skip_existing_manifest_verified',
  );

  const missing = buildCanonicalManifestEntry({
    locale: 'ja-JP',
    bookId: 'genesis',
    chapter: 1,
    verse: 8,
    type: 'history',
    voicePreset: 'warm',
    durationSeconds: mp3.duration,
    fileSize: mp3.byteSize,
  });
  assert.equal(
    compareManifestRegistration({
      manifest,
      canonicalEntry: missing,
    }).action,
    'planned_manifest_append',
  );

  const conflict = {
    ...existing,
    filePath: existing.filePath.replace('.mp3', '-conflict.mp3'),
  };
  assert.equal(
    compareManifestRegistration({
      manifest,
      canonicalEntry: conflict,
    }).action,
    'block_manifest_conflict',
  );
});

test('synthetic Genesis 1:2-3 classifications stay independent of the live manifest', () => {
  const mp3 = ensureFixtureMp3();
  const empty = baseManifest();
  const seeded = {};

  for (const verse of [2, 3]) {
    for (const locale of ['en-US', 'ja-JP']) {
      const entry = buildCanonicalManifestEntry({
        locale,
        bookId: 'genesis',
        chapter: 1,
        verse,
        type: 'original-language',
        voicePreset: 'study',
        durationSeconds: mp3.duration,
        fileSize: mp3.byteSize,
      });
      assert.equal(
        compareManifestRegistration({
          manifest: empty,
          canonicalEntry: entry,
        }).action,
        'planned_manifest_append',
      );
      seeded[entry.id] = entry;
    }
  }

  const filled = baseManifest(seeded);
  for (const entry of Object.values(seeded)) {
    assert.equal(
      compareManifestRegistration({
        manifest: filled,
        canonicalEntry: entry,
      }).action,
      'skip_existing_manifest_verified',
    );
  }
});
