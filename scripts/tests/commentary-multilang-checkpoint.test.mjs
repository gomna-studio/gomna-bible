import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildTargetKey,
  countResumeReuse,
  createEmptyCheckpoint,
  invalidateCheckpointItemIfSourceHashChanged,
  loadCheckpoint,
  saveCheckpoint,
  shouldProcessTarget,
  upsertCheckpointItem,
} from '../lib/commentary-multilang-checkpoint.mjs';

test('buildTargetKey is stable and unique', () => {
  assert.equal(
    buildTargetKey({
      bookId: 'genesis',
      chapter: 1,
      verse: 11,
      type: 'history',
      locale: 'en-US',
    }),
    'genesis.1.11.history.en-US',
  );
  assert.notEqual(
    buildTargetKey({
      bookId: 'genesis',
      chapter: 1,
      verse: 11,
      type: 'cross-reference',
      locale: 'en-US',
    }),
    buildTargetKey({
      bookId: 'genesis',
      chapter: 1,
      verse: 11,
      type: 'history',
      locale: 'en-US',
    }),
  );
});

test('checkpoint save/load is atomic and resume skips completed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-checkpoint-'));
  const file = path.join(dir, 'cp.json');
  const checkpoint = createEmptyCheckpoint({
    plan: { book: 'genesis' },
    repositoryHead: 'abc123',
  });
  const target = {
    bookId: 'genesis',
    chapter: 1,
    verse: 11,
    type: 'theology',
    locale: 'ja-JP',
    audioId: 'genesis.001.011.theology.ja-JP',
  };

  upsertCheckpointItem(checkpoint, target, {
    status: 'structural-qa-passed',
    resumeComplete: true,
    sourceHash: 'hash-a',
  });
  saveCheckpoint(file, checkpoint);

  const loaded = loadCheckpoint(file, { repositoryHead: 'abc123' });
  assert.equal(loaded.stats.total, 1);
  assert.equal(
    shouldProcessTarget(loaded, target, { resume: true }),
    false,
  );
  assert.equal(
    countResumeReuse(loaded, [target, { ...target, verse: 12 }]).reusable,
    1,
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('corrupted checkpoint JSON is detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-checkpoint-bad-'));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, '{not-json', 'utf8');
  assert.throws(() => loadCheckpoint(file), /Corrupted checkpoint JSON/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkpoint from different repository HEAD is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomna-checkpoint-head-'));
  const file = path.join(dir, 'cp.json');
  const checkpoint = createEmptyCheckpoint({ repositoryHead: 'old-head' });
  saveCheckpoint(file, checkpoint);
  assert.throws(
    () => loadCheckpoint(file, { repositoryHead: 'new-head' }),
    /repositoryHead mismatch/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sourceHash change invalidates completed resume state', () => {
  const checkpoint = createEmptyCheckpoint();
  const target = {
    bookId: 'genesis',
    chapter: 1,
    verse: 11,
    type: 'history',
    locale: 'en-US',
  };
  upsertCheckpointItem(checkpoint, target, {
    status: 'structural-qa-passed',
    resumeComplete: true,
    sourceHash: 'old',
  });
  invalidateCheckpointItemIfSourceHashChanged(checkpoint, target, 'new');
  assert.equal(
    checkpoint.items['genesis.1.11.history.en-US'].status,
    'source-hash-changed',
  );
  assert.equal(
    shouldProcessTarget(checkpoint, target, {
      resume: true,
      currentSourceHash: 'new',
    }),
    true,
  );
});

test('failed targets remain reprocessable under resume', () => {
  const checkpoint = createEmptyCheckpoint();
  const target = {
    bookId: 'genesis',
    chapter: 1,
    verse: 12,
    type: 'sermon',
    locale: 'en-US',
  };
  upsertCheckpointItem(checkpoint, target, {
    status: 'failed',
    resumeComplete: false,
  });
  assert.equal(shouldProcessTarget(checkpoint, target, { resume: true }), true);
});
