/**
 * Checkpoint / resume helpers for commentary multilang pipeline v2.
 * Import-side-effect free. Writes only when callers request save.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

export const CHECKPOINT_SCHEMA_VERSION = 1;

const TERMINAL_RESUME_STATUSES = new Set([
  'skipped-existing',
  'published',
  'manifest-ready',
  'url-verified',
  'structural-qa-passed',
  'qa-passed',
  'jobs-exported',
  'translation-qa-passed',
  'translation-qa-review',
  'translation-qa-source-review',
  'translation-qa-failed',
  'translation-batch-ok',
  'cards-staged',
  'narration-staged',
]);

export function buildTargetKey(target) {
  if (!target || typeof target !== 'object') {
    throw new Error('target is required');
  }
  const book = String(target.bookId || target.book || '').trim();
  const chapter = Number(target.chapter);
  const verse = Number(target.verse);
  const type = String(target.commentaryType || target.type || '').trim();
  const locale = String(target.locale || '').trim();
  if (!book || !type || !locale) {
    throw new Error('target bookId, type, and locale are required');
  }
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`Invalid target chapter: ${target.chapter}`);
  }
  if (!Number.isInteger(verse) || verse < 1) {
    throw new Error(`Invalid target verse: ${target.verse}`);
  }
  return `${book}.${chapter}.${verse}.${type}.${locale}`;
}

export function detectRepositoryHead(cwd = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to detect repository HEAD: ${(result.stderr || '').trim()}`,
    );
  }
  return String(result.stdout || '').trim();
}

export function createEmptyCheckpoint(meta = {}) {
  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    createdAt: meta.createdAt || new Date().toISOString(),
    updatedAt: meta.updatedAt || null,
    repositoryHead: meta.repositoryHead || null,
    branch: meta.branch || null,
    planFingerprint: meta.planFingerprint || null,
    plan: meta.plan || null,
    items: {},
    stats: {
      total: 0,
      byStatus: {},
    },
  };
}

function normalizeStatusCounts(items) {
  const byStatus = {};
  for (const item of Object.values(items)) {
    const status = item && item.status ? String(item.status) : 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return {
    total: Object.keys(items).length,
    byStatus,
  };
}

export function assertCheckpointUsable(checkpoint, options = {}) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('checkpoint object is required');
  }
  if (Number(checkpoint.schemaVersion) !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported checkpoint schemaVersion: ${checkpoint.schemaVersion}`,
    );
  }
  if (!checkpoint.items || typeof checkpoint.items !== 'object') {
    throw new Error('Checkpoint missing items map');
  }

  const expectedHead = options.repositoryHead || null;
  if (
    expectedHead &&
    checkpoint.repositoryHead &&
    checkpoint.repositoryHead !== expectedHead
  ) {
    throw new Error(
      `Checkpoint repositoryHead mismatch: checkpoint=${checkpoint.repositoryHead} current=${expectedHead}`,
    );
  }

  return true;
}

export function loadCheckpoint(filePath, options = {}) {
  if (!filePath) {
    throw new Error('checkpoint path is required');
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read checkpoint: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Corrupted checkpoint JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid checkpoint JSON: ${filePath}`);
  }

  assertCheckpointUsable(parsed, options);
  return parsed;
}

export function saveCheckpoint(filePath, checkpoint) {
  if (!filePath) {
    throw new Error('checkpoint path is required');
  }
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('checkpoint object is required');
  }

  const absolute = path.resolve(filePath);
  const dir = path.dirname(absolute);
  fs.mkdirSync(dir, { recursive: true });

  const next = {
    ...checkpoint,
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    stats: normalizeStatusCounts(checkpoint.items || {}),
  };

  const tmp = path.join(
    dir,
    `.${path.basename(absolute)}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, absolute);
  return next;
}

export function upsertCheckpointItem(checkpoint, target, patch = {}) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('checkpoint is required');
  }
  if (!checkpoint.items || typeof checkpoint.items !== 'object') {
    checkpoint.items = {};
  }
  const key = buildTargetKey(target);
  const previous = checkpoint.items[key] || {};
  checkpoint.items[key] = {
    ...previous,
    key,
    bookId: target.bookId || target.book,
    chapter: target.chapter,
    verse: target.verse,
    commentaryType: target.commentaryType || target.type,
    locale: target.locale,
    audioId: target.audioId || previous.audioId || null,
    sourceHash:
      patch.sourceHash != null
        ? patch.sourceHash
        : target.sourceHash != null
          ? target.sourceHash
          : previous.sourceHash || null,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  checkpoint.stats = normalizeStatusCounts(checkpoint.items);
  return checkpoint.items[key];
}

/**
 * Invalidate terminal completion when Korean sourceHash changes.
 */
export function invalidateCheckpointItemIfSourceHashChanged(
  checkpoint,
  target,
  currentSourceHash,
) {
  if (!checkpoint?.items) return null;
  const key = buildTargetKey(target);
  const item = checkpoint.items[key];
  if (!item) return null;
  if (!item.sourceHash || !currentSourceHash) return item;
  if (item.sourceHash === currentSourceHash) return item;

  checkpoint.items[key] = {
    ...item,
    status: 'source-hash-changed',
    resumeComplete: false,
    previousStatus: item.status,
    previousSourceHash: item.sourceHash,
    sourceHash: currentSourceHash,
    updatedAt: new Date().toISOString(),
  };
  checkpoint.stats = normalizeStatusCounts(checkpoint.items);
  return checkpoint.items[key];
}

/**
 * Resume filter: skip terminal-success items unless sourceHash changed.
 */
export function shouldProcessTarget(
  checkpoint,
  target,
  { resume = false, currentSourceHash = null } = {},
) {
  if (!resume || !checkpoint) return true;
  const key = buildTargetKey(target);
  const item = checkpoint.items[key];
  if (!item) return true;

  if (
    currentSourceHash &&
    item.sourceHash &&
    item.sourceHash !== currentSourceHash
  ) {
    return true;
  }

  if (TERMINAL_RESUME_STATUSES.has(item.status) && item.resumeComplete === true) {
    return false;
  }
  return true;
}

export function listCheckpointFailures(checkpoint) {
  if (!checkpoint || !checkpoint.items) return [];
  return Object.values(checkpoint.items).filter((item) => {
    const status = String(item.status || '');
    return (
      status === 'failed' ||
      status === 'review-required' ||
      status === 'source-hash-changed'
    );
  });
}

export function countResumeReuse(checkpoint, targets) {
  if (!checkpoint?.items) {
    return { reusable: 0, reprocess: targets.length, total: targets.length };
  }
  let reusable = 0;
  let reprocess = 0;
  for (const target of targets) {
    if (shouldProcessTarget(checkpoint, target, { resume: true })) {
      reprocess += 1;
    } else {
      reusable += 1;
    }
  }
  return { reusable, reprocess, total: targets.length };
}
