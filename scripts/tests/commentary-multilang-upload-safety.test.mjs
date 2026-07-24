import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  GLOBAL_UPLOAD_LOCK_PATH,
  acquireUploadLock,
  buildMultilangR2Key,
  classifyUploadTarget,
  createProductionUploadAdapters,
  isUploadTestMode,
  releaseUploadLock,
  validateMultilangR2Key,
} from '../lib/commentary-multilang-upload.mjs';
import { validateMp3File } from '../lib/commentary-multilang-audio.mjs';

process.env.GOMNA_COMMENTARY_MULTILANG_TEST_MODE = '1';
delete process.env.GOMNA_COMMENTARY_MULTILANG_UPLOAD;
delete process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
delete process.env.OPENAI_API_KEY;

const FIXTURE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'gomna-upload-safety-'),
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

test.after(() => {
  releaseUploadLock(GLOBAL_UPLOAD_LOCK_PATH);
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test('test mode is active and production adapters are fenced', () => {
  assert.equal(isUploadTestMode(), true);
  assert.throws(
    () => createProductionUploadAdapters(),
    /block_test_real_io/,
  );
});

test('global upload lock path remains exact', () => {
  assert.equal(
    GLOBAL_UPLOAD_LOCK_PATH,
    '/tmp/gomna-commentary-multilang-upload.lock',
  );
  releaseUploadLock(GLOBAL_UPLOAD_LOCK_PATH);
  const lock = acquireUploadLock(GLOBAL_UPLOAD_LOCK_PATH);
  assert.equal(lock.ok, true);
  releaseUploadLock(GLOBAL_UPLOAD_LOCK_PATH);
});

test('R2 keys accept registered type/preset pairs and reject mismatches', () => {
  assert.equal(
    buildMultilangR2Key({
      locale: 'en-US',
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'original-language',
      voicePreset: 'study',
    }),
    'commentary/en-US/genesis/001/001/original-language-study.mp3',
  );
  assert.equal(
    buildMultilangR2Key({
      locale: 'ja-JP',
      bookId: 'genesis',
      chapter: 1,
      verse: 2,
      type: 'history',
      voicePreset: 'warm',
    }),
    'commentary/ja-JP/genesis/001/002/history-warm.mp3',
  );
  assert.throws(() =>
    buildMultilangR2Key({
      locale: 'en-US',
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'history',
      voicePreset: 'study',
    }),
  );
  assert.throws(() =>
    validateMultilangR2Key(
      'commentary/en-US/genesis/001/001/history-study.mp3',
    ),
  );
});

test('classifyUploadTarget stays fixture-driven and rejects unsupported locale', async () => {
  ensureFixtureMp3();
  const result = await classifyUploadTarget({
    target: {
      locale: 'ko-KR',
      bookId: 'genesis',
      chapter: 1,
      verse: 1,
      type: 'original-language',
      voicePreset: 'study',
      audioId: 'genesis.001.001.original-language.ko-KR',
      audioPath: 'audio/v1/en-US/genesis/001/001/original-language-study.mp3',
      narrationPath: 'tts-scripts/en-US/genesis/001/001/original-language.txt',
      metaPath: 'tts-scripts/en-US/genesis/001/001/original-language.meta.json',
      cuePath: 'audio/cues/en-US/genesis/001/001/original-language.json',
    },
    remoteInspector: async () => {
      throw new Error('should not inspect remote in this assertion');
    },
  });
  assert.equal(result.action, 'block_unsupported_locale');
});
