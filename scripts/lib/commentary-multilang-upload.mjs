/**
 * Multilingual commentary R2 upload helpers.
 * Import-side-effect free. No OpenAI access. Korean keys are impossible.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  DEFAULT_AUDIO_VOICE_PRESET,
  sha256Bytes,
  validateApprovedNarrationTarget,
  validateMp3File,
} from './commentary-multilang-audio.mjs';
import { ROOT } from './commentary-multilang-targets.mjs';

export const R2_BUCKET = 'gomna-bible-audio-prod';
export const PUBLIC_BASE_URL =
  'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev';
export const CONTENT_TYPE = 'audio/mpeg';
export const SUPPORTED_UPLOAD_LOCALES = Object.freeze(['en-US', 'ja-JP']);
export const SUPPORTED_UPLOAD_TYPE = 'original-language';
export const SUPPORTED_VOICE_PRESET = 'study';
export const REQUIRED_UPLOAD_FLAG = '1';
export const DURATION_MATCH_EPSILON_SECONDS = 0.001;
export const VERIFY_POLL_DELAYS_MS = Object.freeze([1000, 2000, 4000]);
export const MAX_VERIFICATION_ROUNDS = 4;

/** One global lock for every multilingual production upload (all ranges). */
export const GLOBAL_UPLOAD_LOCK_PATH =
  '/tmp/gomna-commentary-multilang-upload.lock';

export const TEST_MODE_ENV = 'GOMNA_COMMENTARY_MULTILANG_TEST_MODE';

/** Honest single-writer protections when standard Wrangler put is used. */
export const UPLOAD_WRITE_PROTECTIONS = Object.freeze({
  localSingleWriterLock: true,
  globalUploadLock: true,
  immediateRemoteRecheck: true,
  onePutMaximumPerTarget: true,
  postUploadByteVerification: true,
  externalWriterRaceNotAtomicallyEliminated: true,
  nativeWranglerConditionalCreate: false,
});

export function isUploadTestMode(env = process.env) {
  return String(env?.[TEST_MODE_ENV] || '') === '1';
}

export function createTestRealIoError(label) {
  const error = new Error(`block_test_real_io: ${label} blocked in test mode`);
  error.action = 'block_test_real_io';
  return error;
}

function assertProductionIoAllowed(label) {
  if (isUploadTestMode()) {
    throw createTestRealIoError(label);
  }
}

function requireDependency(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`${name} dependency is required`);
  }
  return value;
}

const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_UPLOAD_LOCALES);
const FORBIDDEN_LOCALE_SET = new Set(['ko', 'ko-KR']);
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BOOK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAD3_PATTERN = /^\d{3}$/;

function defaultToAbsolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pad3(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid chapter/verse for pad3: ${value}`);
  }
  return String(number).padStart(3, '0');
}

function hasEncodedTraversal(value) {
  const lowered = String(value).toLowerCase();
  return (
    lowered.includes('%2e') ||
    lowered.includes('%2f') ||
    lowered.includes('%5c') ||
    lowered.includes('%00')
  );
}

function assertSafePathSegment(label, value, pattern) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (
    value.includes('..') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('//') ||
    hasEncodedTraversal(value) ||
    !pattern.test(value)
  ) {
    throw new Error(`Invalid ${label} segment: ${value}`);
  }
  return value;
}

/**
 * Build the multilingual R2 object key.
 * Pattern: commentary/{locale}/{book}/{chapter3}/{verse3}/{type}-study.mp3
 */
export function buildMultilangR2Key({
  locale,
  bookId,
  chapter,
  verse,
  type,
  voicePreset = SUPPORTED_VOICE_PRESET,
} = {}) {
  const normalizedLocale = String(locale || '').trim();
  if (FORBIDDEN_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }
  if (!SUPPORTED_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(
      `Unsupported upload locale: ${normalizedLocale}. Allowed: ${SUPPORTED_UPLOAD_LOCALES.join(', ')}`,
    );
  }

  const normalizedType = String(type || '').trim();
  if (normalizedType !== SUPPORTED_UPLOAD_TYPE) {
    throw new Error(
      `Unsupported upload type: ${normalizedType}. Allowed: ${SUPPORTED_UPLOAD_TYPE}`,
    );
  }

  const normalizedPreset = String(voicePreset || '').trim();
  if (normalizedPreset !== SUPPORTED_VOICE_PRESET) {
    throw new Error(
      `Unsupported upload voicePreset: ${normalizedPreset}. Allowed: ${SUPPORTED_VOICE_PRESET}`,
    );
  }

  const book = assertSafePathSegment('bookId', String(bookId || '').trim(), BOOK_PATTERN);
  const chapter3 = pad3(chapter);
  const verse3 = pad3(verse);
  assertSafePathSegment('chapter3', chapter3, PAD3_PATTERN);
  assertSafePathSegment('verse3', verse3, PAD3_PATTERN);
  assertSafePathSegment('type', normalizedType, SEGMENT_PATTERN);
  assertSafePathSegment('voicePreset', normalizedPreset, SEGMENT_PATTERN);

  const fileName = `${normalizedType}-${normalizedPreset}.mp3`;
  const key = [
    'commentary',
    normalizedLocale,
    book,
    chapter3,
    verse3,
    fileName,
  ].join('/');

  validateMultilangR2Key(key, {
    locale: normalizedLocale,
    bookId: book,
    chapter,
    verse,
    type: normalizedType,
    voicePreset: normalizedPreset,
  });

  return key;
}

export function buildMultilangPublicUrl(r2Key) {
  validateMultilangR2Key(r2Key);
  if (
    typeof r2Key !== 'string' ||
    r2Key.includes('\\') ||
    r2Key.includes('//') ||
    r2Key.includes('..') ||
    path.isAbsolute(r2Key) ||
    hasEncodedTraversal(r2Key)
  ) {
    throw new Error(`Invalid R2 key for public URL: ${r2Key}`);
  }
  return `${PUBLIC_BASE_URL}/${r2Key}`;
}

export function validateMultilangR2Key(r2Key, expected = {}) {
  if (typeof r2Key !== 'string' || !r2Key.trim()) {
    throw new Error('R2 key must be a non-empty string');
  }
  if (
    r2Key.includes('..') ||
    r2Key.includes('\\') ||
    r2Key.includes('//') ||
    path.isAbsolute(r2Key) ||
    hasEncodedTraversal(r2Key) ||
    r2Key.startsWith('/') ||
    r2Key.endsWith('/')
  ) {
    throw new Error(`Malformed R2 key: ${r2Key}`);
  }

  const lowered = r2Key.toLowerCase();
  if (
    lowered.startsWith('commentary/ko/') ||
    lowered.startsWith('commentary/ko-kr/') ||
    lowered.includes('/ko/gae/') ||
    /(^|\/)gae(\/|$)/.test(lowered)
  ) {
    throw new Error(`Forbidden Korean or bible-version R2 key: ${r2Key}`);
  }

  const parts = r2Key.split('/');
  if (parts.length !== 6) {
    throw new Error(`R2 key must have exactly 6 segments: ${r2Key}`);
  }

  const [root, locale, book, chapter3, verse3, fileName] = parts;
  if (root !== 'commentary') {
    throw new Error(`R2 key must start with commentary/: ${r2Key}`);
  }
  if (!SUPPORTED_LOCALE_SET.has(locale)) {
    throw new Error(`R2 key locale is unsupported: ${locale}`);
  }
  if (!BOOK_PATTERN.test(book) || !PAD3_PATTERN.test(chapter3) || !PAD3_PATTERN.test(verse3)) {
    throw new Error(`R2 key path segments are invalid: ${r2Key}`);
  }

  const fileMatch = /^([A-Za-z0-9][A-Za-z0-9._-]*)-([A-Za-z0-9][A-Za-z0-9._-]*)\.mp3$/.exec(
    fileName,
  );
  if (!fileMatch) {
    throw new Error(`R2 key file name is invalid: ${fileName}`);
  }

  const type = fileMatch[1];
  const voicePreset = fileMatch[2];
  if (type !== SUPPORTED_UPLOAD_TYPE || voicePreset !== SUPPORTED_VOICE_PRESET) {
    throw new Error(
      `R2 key must end with ${SUPPORTED_UPLOAD_TYPE}-${SUPPORTED_VOICE_PRESET}.mp3: ${r2Key}`,
    );
  }

  if (expected.locale && locale !== expected.locale) {
    throw new Error(`R2 key locale mismatch: ${locale} !== ${expected.locale}`);
  }
  if (expected.bookId && book !== expected.bookId) {
    throw new Error(`R2 key book mismatch: ${book} !== ${expected.bookId}`);
  }
  if (expected.chapter != null && chapter3 !== pad3(expected.chapter)) {
    throw new Error(`R2 key chapter mismatch: ${chapter3}`);
  }
  if (expected.verse != null && verse3 !== pad3(expected.verse)) {
    throw new Error(`R2 key verse mismatch: ${verse3}`);
  }
  if (expected.type && type !== expected.type) {
    throw new Error(`R2 key type mismatch: ${type}`);
  }
  if (expected.voicePreset && voicePreset !== expected.voicePreset) {
    throw new Error(`R2 key voicePreset mismatch: ${voicePreset}`);
  }

  return {
    root,
    locale,
    bookId: book,
    chapter3,
    verse3,
    type,
    voicePreset,
    fileName,
  };
}

export function validateLocalAudioPath(localRelativePath, expected = {}) {
  if (typeof localRelativePath !== 'string' || !localRelativePath.trim()) {
    throw new Error('local MP3 path is required');
  }
  if (
    path.isAbsolute(localRelativePath) ||
    localRelativePath.includes('..') ||
    localRelativePath.includes('\\') ||
    localRelativePath.includes('//') ||
    hasEncodedTraversal(localRelativePath)
  ) {
    throw new Error(`Malformed local MP3 path: ${localRelativePath}`);
  }

  const parts = localRelativePath.split('/');
  if (parts.length !== 7 || parts[0] !== 'audio' || parts[1] !== 'v1') {
    throw new Error(`Local MP3 path must be under audio/v1/{locale}/...: ${localRelativePath}`);
  }

  const [, , locale, book, chapter3, verse3, fileName] = parts;
  if (!SUPPORTED_LOCALE_SET.has(locale)) {
    throw new Error(`Local MP3 locale is unsupported: ${locale}`);
  }
  if (!BOOK_PATTERN.test(book) || !PAD3_PATTERN.test(chapter3) || !PAD3_PATTERN.test(verse3)) {
    throw new Error(`Local MP3 path segments are invalid: ${localRelativePath}`);
  }

  const fileMatch = /^([A-Za-z0-9][A-Za-z0-9._-]*)-([A-Za-z0-9][A-Za-z0-9._-]*)\.mp3$/.exec(
    fileName,
  );
  if (!fileMatch) {
    throw new Error(`Local MP3 file name is invalid: ${fileName}`);
  }

  const type = fileMatch[1];
  const voicePreset = fileMatch[2];
  if (type !== SUPPORTED_UPLOAD_TYPE || voicePreset !== SUPPORTED_VOICE_PRESET) {
    throw new Error(
      `Local MP3 must be ${SUPPORTED_UPLOAD_TYPE}-${SUPPORTED_VOICE_PRESET}.mp3: ${localRelativePath}`,
    );
  }

  if (expected.locale && locale !== expected.locale) {
    throw new Error(`Local MP3 locale mismatch: ${locale}`);
  }
  if (expected.bookId && book !== expected.bookId) {
    throw new Error(`Local MP3 book mismatch: ${book}`);
  }
  if (expected.chapter != null && chapter3 !== pad3(expected.chapter)) {
    throw new Error(`Local MP3 chapter mismatch: ${chapter3}`);
  }
  if (expected.verse != null && verse3 !== pad3(expected.verse)) {
    throw new Error(`Local MP3 verse mismatch: ${verse3}`);
  }
  if (expected.type && type !== expected.type) {
    throw new Error(`Local MP3 type mismatch: ${type}`);
  }
  if (expected.voicePreset && voicePreset !== expected.voicePreset) {
    throw new Error(`Local MP3 voicePreset mismatch: ${voicePreset}`);
  }

  return {
    locale,
    bookId: book,
    chapter3,
    verse3,
    type,
    voicePreset,
    fileName,
  };
}

export function validateUploadTargetPaths({
  target,
  r2Key,
  publicUrl,
  localRelativePath,
} = {}) {
  const expected = {
    locale: target.locale,
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: target.type,
    voicePreset: target.voicePreset || SUPPORTED_VOICE_PRESET,
  };

  validateLocalAudioPath(localRelativePath, expected);
  const parsedKey = validateMultilangR2Key(r2Key, expected);

  if (!publicUrl.startsWith(`${PUBLIC_BASE_URL}/`)) {
    throw new Error(`Public URL must use fixed base: ${publicUrl}`);
  }

  const urlKey = publicUrl.slice(`${PUBLIC_BASE_URL}/`.length);
  if (urlKey.includes('?') || urlKey.includes('#')) {
    throw new Error(`Public URL must not include query/fragment in stored form: ${publicUrl}`);
  }
  if (urlKey !== r2Key) {
    throw new Error(`Public URL key mismatch: ${urlKey} !== ${r2Key}`);
  }

  if (
    !r2Key.startsWith(`commentary/${expected.locale}/`) ||
    !localRelativePath.startsWith(`audio/v1/${expected.locale}/`)
  ) {
    throw new Error('Locale confinement failed for local path or R2 key');
  }

  return parsedKey;
}

/**
 * Global lock path for every multilingual production upload.
 * Overlapping ranges (e.g. 1:2-3 and 1:3) share this single lock.
 * The allowed-target argument is ignored and kept only for call-site compatibility.
 */
export function buildUploadLockPath(_allowedTargetString = null, options = {}) {
  if (options.lockPath) {
    return options.lockPath;
  }
  return GLOBAL_UPLOAD_LOCK_PATH;
}

/**
 * Acquire an atomic local single-writer lock via exclusive directory creation.
 */
export function acquireUploadLock(lockPath, options = {}) {
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  if (typeof lockPath !== 'string' || !lockPath.trim()) {
    return {
      ok: false,
      action: 'block_upload_lock_failed',
      reason: 'upload lock path is required',
      lockPath: lockPath || null,
    };
  }

  try {
    mkdirSync(lockPath);
    return {
      ok: true,
      action: 'upload_lock_acquired',
      reason: 'exclusive upload lock directory created',
      lockPath,
    };
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return {
        ok: false,
        action: 'block_upload_lock_held',
        reason: `upload lock already held: ${lockPath}`,
        lockPath,
      };
    }
    return {
      ok: false,
      action: 'block_upload_lock_failed',
      reason: `upload lock acquisition failed: ${error.message}`,
      lockPath,
    };
  }
}

export function releaseUploadLock(lockPath, options = {}) {
  if (!lockPath) {
    return { ok: true, released: false };
  }
  const rmSync = options.rmSync || fs.rmSync;
  const existsSync = options.existsSync || fs.existsSync;
  try {
    if (existsSync(lockPath)) {
      rmSync(lockPath, { recursive: true, force: true });
    }
    return { ok: true, released: true, lockPath };
  } catch (error) {
    return {
      ok: false,
      released: false,
      lockPath,
      reason: error.message,
    };
  }
}

export function createExclusiveTempDownload(options = {}) {
  // Always under /tmp — never os.tmpdir()/var/folders.
  const tmpdir = options.tmpdir || '/tmp';
  const mkdtempSync = options.mkdtempSync || fs.mkdtempSync;
  const dir = mkdtempSync(path.join(tmpdir, 'gomna-multilang-upload-'));
  const file = path.join(
    dir,
    `remote-${crypto.randomBytes(12).toString('hex')}.mp3`,
  );
  return { dir, file };
}

export function removeTempDownload(temp, options = {}) {
  if (!temp) return;
  const rmSync = options.rmSync || fs.rmSync;
  const unlinkSync = options.unlinkSync || fs.unlinkSync;
  const existsSync = options.existsSync || fs.existsSync;

  try {
    if (temp.file && existsSync(temp.file)) {
      unlinkSync(temp.file);
    }
  } catch {
    // continue cleanup
  }

  try {
    if (temp.dir && existsSync(temp.dir)) {
      rmSync(temp.dir, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

function withCacheBust(publicUrl, options = {}) {
  const bust =
    typeof options.cacheBust === 'function'
      ? options.cacheBust()
      : `cb=${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const separator = publicUrl.includes('?') ? '&' : '?';
  return `${publicUrl}${separator}${bust}`;
}

async function readResponseBytes(response) {
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  if (typeof response.buffer === 'function') {
    return Buffer.from(await response.buffer());
  }
  throw new Error('Response body is unreadable');
}

/**
 * Core read-only remote inspection. No test-mode fence.
 * Callers must inject this only through an explicit adapter.
 */
export async function inspectRemoteObjectCore({
  publicUrl,
  localByteSize,
  localSha256,
  localDuration,
  fetchImpl = globalThis.fetch,
  validateDownloadedMp3 = validateMp3File,
  createTemp = createExclusiveTempDownload,
  removeTemp = removeTempDownload,
  writeFileSync = fs.writeFileSync,
  counters = null,
  countVerification = false,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      action: 'block_remote_probe_failed',
      reason: 'fetch implementation is unavailable',
      remoteHttpStatus: null,
    };
  }

  let response;
  const probeUrl = withCacheBust(publicUrl);
  try {
    response = await fetchImpl(probeUrl, { method: 'GET' });
  } catch (error) {
    return {
      ok: false,
      action: 'block_remote_probe_failed',
      reason: `remote probe failed: ${error.message}`,
      remoteHttpStatus: null,
    };
  }

  const status = Number(response.status);
  if (status === 404) {
    return {
      ok: true,
      action: 'planned_upload',
      reason: 'remote object absent (HTTP 404)',
      remoteHttpStatus: 404,
      remoteByteSize: null,
      remoteSha256: null,
      remoteDuration: null,
    };
  }

  if (status !== 200) {
    return {
      ok: false,
      action: 'block_remote_probe_failed',
      reason: `unexpected remote HTTP status: ${status}`,
      remoteHttpStatus: status,
      remoteByteSize: null,
      remoteSha256: null,
      remoteDuration: null,
    };
  }

  let temp = null;
  try {
    if (counters && countVerification) {
      counters.remoteVerificationAttempts =
        (counters.remoteVerificationAttempts || 0) + 1;
    }

    const bytes = await readResponseBytes(response);
    temp = createTemp();
    writeFileSync(temp.file, bytes);

    const remoteByteSize = bytes.length;
    const remoteSha256 = sha256Bytes(bytes);

    if (remoteByteSize !== localByteSize) {
      return {
        ok: false,
        action: 'block_remote_conflict',
        reason: `remote byte size ${remoteByteSize} !== local ${localByteSize}`,
        remoteHttpStatus: status,
        remoteByteSize,
        remoteSha256,
        remoteDuration: null,
      };
    }

    if (remoteSha256 !== localSha256) {
      return {
        ok: false,
        action: 'block_remote_conflict',
        reason: `remote SHA-256 differs from local`,
        remoteHttpStatus: status,
        remoteByteSize,
        remoteSha256,
        remoteDuration: null,
      };
    }

    const mp3 = validateDownloadedMp3(temp.file);
    if (!mp3.ok) {
      return {
        ok: false,
        action: 'block_remote_conflict',
        reason: `remote object is not a valid MP3: ${mp3.reason}`,
        remoteHttpStatus: status,
        remoteByteSize,
        remoteSha256,
        remoteDuration: null,
      };
    }

    if (
      !Number.isFinite(mp3.duration) ||
      Math.abs(mp3.duration - localDuration) > DURATION_MATCH_EPSILON_SECONDS
    ) {
      return {
        ok: false,
        action: 'block_remote_conflict',
        reason: `remote duration ${mp3.duration} differs from local ${localDuration}`,
        remoteHttpStatus: status,
        remoteByteSize,
        remoteSha256,
        remoteDuration: mp3.duration,
      };
    }

    return {
      ok: true,
      action: 'skip_existing_verified',
      reason: 'remote object matches local MP3 byte-for-byte',
      remoteHttpStatus: status,
      remoteByteSize,
      remoteSha256,
      remoteDuration: mp3.duration,
    };
  } catch (error) {
    return {
      ok: false,
      action: 'block_remote_probe_failed',
      reason: `remote download/validation failed: ${error.message}`,
      remoteHttpStatus: status,
      remoteByteSize: null,
      remoteSha256: null,
      remoteDuration: null,
    };
  } finally {
    removeTemp(temp);
  }
}

/**
 * Production remote inspector. Blocked when GOMNA_COMMENTARY_MULTILANG_TEST_MODE=1.
 */
export async function inspectRemoteObjectProduction(options = {}) {
  assertProductionIoAllowed('default remote inspector');
  return inspectRemoteObjectCore(options);
}

/** @deprecated Prefer explicit production/core adapters via DI. */
export async function inspectRemoteObject(options = {}) {
  return inspectRemoteObjectProduction(options);
}

/**
 * Core Wrangler put. No test-mode fence.
 */
export function runWranglerR2PutCore({
  bucket = R2_BUCKET,
  r2Key,
  absoluteLocalPath,
  contentType = CONTENT_TYPE,
  cwd = ROOT,
  spawnImpl = spawnSync,
} = {}) {
  validateMultilangR2Key(r2Key);
  if (
    typeof absoluteLocalPath !== 'string' ||
    !path.isAbsolute(absoluteLocalPath)
  ) {
    throw new Error('absoluteLocalPath must be an absolute filesystem path');
  }

  const objectPath = `${bucket}/${r2Key}`;
  const result = spawnImpl(
    'npx',
    [
      '--yes',
      'wrangler',
      'r2',
      'object',
      'put',
      objectPath,
      '--file',
      absoluteLocalPath,
      '--content-type',
      contentType,
      '--remote',
    ],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

  if (result.status !== 0) {
    const error = new Error(output || 'wrangler r2 object put failed');
    error.output = output;
    error.status = result.status;
    throw error;
  }

  if (/Resource location:\s*local/i.test(output)) {
    throw new Error(
      'wrangler stored the object locally; --remote upload was not applied',
    );
  }

  if (!/Resource location:\s*remote/i.test(output)) {
    throw new Error('wrangler output did not confirm remote upload');
  }

  return output;
}

/**
 * Production Wrangler runner. Blocked when GOMNA_COMMENTARY_MULTILANG_TEST_MODE=1.
 */
export function runWranglerR2PutProduction(options = {}) {
  assertProductionIoAllowed('default Wrangler runner');
  return runWranglerR2PutCore(options);
}

/** @deprecated Prefer explicit production/core adapters via DI. */
export function runWranglerR2Put(options = {}) {
  return runWranglerR2PutProduction(options);
}

/**
 * Wire production adapters. Refused in test mode so pure tests cannot
 * accidentally obtain real R2/Wrangler defaults.
 */
export function createProductionUploadAdapters(options = {}) {
  if (isUploadTestMode() && options.allowInTestMode !== true) {
    throw createTestRealIoError('createProductionUploadAdapters');
  }

  return {
    remoteInspector: inspectRemoteObjectProduction,
    wranglerRunner: runWranglerR2PutProduction,
    lockAdapter: {
      path: GLOBAL_UPLOAD_LOCK_PATH,
      acquire: (lockPath = GLOBAL_UPLOAD_LOCK_PATH, lockOptions) =>
        acquireUploadLock(lockPath, lockOptions),
      release: (lockPath = GLOBAL_UPLOAD_LOCK_PATH, lockOptions) =>
        releaseUploadLock(lockPath, lockOptions),
    },
    sleep: defaultSleep,
    temporaryFileAdapter: {
      create: createExclusiveTempDownload,
      remove: removeTempDownload,
    },
  };
}

export async function verifyUploadedRemoteObject(options = {}) {
  const inspect =
    typeof options.remoteInspector === 'function'
      ? options.remoteInspector
      : inspectRemoteObjectCore;
  const inspection = await inspect({
    ...options,
    countVerification: options.countVerification === true,
  });
  if (inspection.action === 'skip_existing_verified') {
    return {
      ok: true,
      action: 'verified_uploaded',
      reason: inspection.reason,
      ...inspection,
    };
  }

  return {
    ok: false,
    action:
      inspection.action === 'planned_upload'
        ? 'block_remote_probe_failed'
        : inspection.action,
    reason:
      inspection.action === 'planned_upload'
        ? 'uploaded object is still absent during verification'
        : inspection.reason,
    ...inspection,
  };
}

export async function verifyUploadedWithPolling(options = {}) {
  const sleep = options.sleep || defaultSleep;
  const delays = options.delaysMs || VERIFY_POLL_DELAYS_MS;
  const maxRounds = options.maxRounds || MAX_VERIFICATION_ROUNDS;
  let last = null;

  for (let round = 0; round < maxRounds; round += 1) {
    if (round > 0) {
      const delay = delays[Math.min(round - 1, delays.length - 1)];
      await sleep(delay);
    }
    last = await verifyUploadedRemoteObject({
      ...options,
      countVerification: options.countVerification === true,
    });
    if (last.ok) {
      return last;
    }
  }

  return last;
}

/**
 * Classify one upload target. Network only when local validation passes.
 * Requires an injected remoteInspector (wired by CLI production adapters).
 */
export async function classifyUploadTarget({
  target,
  root = ROOT,
  toAbsolute = defaultToAbsolute,
  fetchImpl = globalThis.fetch,
  validateNarration = validateApprovedNarrationTarget,
  validateMp3 = validateMp3File,
  remoteInspector = null,
  inspectRemote = null,
  counters = null,
} = {}) {
  const inspect = requireDependency(
    'remoteInspector',
    remoteInspector || inspectRemote,
  );
  const identity = `${target.bookId}/${target.chapter}/${target.verse}/${target.type}`;
  const base = {
    locale: target.locale,
    identity,
    audioId: target.audioId,
    localMp3Path: target.audioPath,
    localByteSize: null,
    localDuration: null,
    localSha256: null,
    r2Bucket: R2_BUCKET,
    r2Key: null,
    publicUrl: null,
    remoteHttpStatus: null,
    remoteByteSize: null,
    remoteDuration: null,
    remoteSha256: null,
    action: null,
    reason: null,
  };

  const locale = String(target?.locale || '').trim();
  if (FORBIDDEN_LOCALE_SET.has(locale) || !SUPPORTED_LOCALE_SET.has(locale)) {
    return {
      ...base,
      action: 'block_unsupported_locale',
      reason: `unsupported upload locale: ${locale || '(empty)'}`,
    };
  }

  const commentaryType = String(target?.type || '').trim();
  if (commentaryType !== SUPPORTED_UPLOAD_TYPE) {
    return {
      ...base,
      action: 'block_unsupported_upload_type',
      reason: `unsupported upload type: ${commentaryType}. Allowed: ${SUPPORTED_UPLOAD_TYPE}`,
    };
  }

  const voicePreset = String(
    target?.voicePreset || DEFAULT_AUDIO_VOICE_PRESET,
  ).trim();
  if (voicePreset !== SUPPORTED_VOICE_PRESET) {
    return {
      ...base,
      action: 'block_unsupported_upload_type',
      reason: `voicePreset=${voicePreset} is unsupported; only ${SUPPORTED_VOICE_PRESET} is allowed`,
    };
  }

  const narration = validateNarration({
    target,
    root,
    toAbsolute,
  });
  if (!narration.ok) {
    return {
      ...base,
      action: narration.action,
      reason: narration.reason,
    };
  }

  let r2Key;
  let publicUrl;
  try {
    r2Key = buildMultilangR2Key({
      locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: commentaryType,
      voicePreset,
    });
    publicUrl = buildMultilangPublicUrl(r2Key);
    validateUploadTargetPaths({
      target: {
        locale,
        bookId: target.bookId,
        chapter: target.chapter,
        verse: target.verse,
        type: commentaryType,
        voicePreset,
      },
      r2Key,
      publicUrl,
      localRelativePath: target.audioPath,
    });

    if (target.r2Key && target.r2Key !== r2Key) {
      throw new Error(
        `target.r2Key mismatch: ${target.r2Key} !== ${r2Key}`,
      );
    }
    if (target.publicUrl && target.publicUrl !== publicUrl) {
      throw new Error(
        `target.publicUrl mismatch: ${target.publicUrl} !== ${publicUrl}`,
      );
    }
  } catch (error) {
    return {
      ...base,
      r2Key: r2Key || null,
      publicUrl: publicUrl || null,
      action: 'block_invalid_r2_key',
      reason: error.message,
    };
  }

  const audioAbs = toAbsolute(target.audioPath);
  if (!fs.existsSync(audioAbs)) {
    return {
      ...base,
      r2Key,
      publicUrl,
      action: 'block_missing_mp3',
      reason: `missing MP3: ${target.audioPath}`,
    };
  }

  const mp3 = validateMp3(audioAbs);
  if (!mp3.ok) {
    return {
      ...base,
      r2Key,
      publicUrl,
      action: 'block_invalid_mp3',
      reason: mp3.reason,
    };
  }

  if (counters) {
    counters.remotePreflightChecks =
      (counters.remotePreflightChecks || 0) + 1;
  }

  const remote = await inspect({
    publicUrl,
    localByteSize: mp3.byteSize,
    localSha256: mp3.sha256,
    localDuration: mp3.duration,
    fetchImpl,
    counters,
  });

  return {
    ...base,
    r2Key,
    publicUrl,
    localByteSize: mp3.byteSize,
    localDuration: mp3.duration,
    localSha256: mp3.sha256,
    remoteHttpStatus: remote.remoteHttpStatus,
    remoteByteSize: remote.remoteByteSize,
    remoteDuration: remote.remoteDuration,
    remoteSha256: remote.remoteSha256,
    action: remote.action,
    reason: remote.reason,
    mp3,
    narration,
  };
}

export function createEmptyUploadCounters() {
  return {
    plannedTargets: 0,
    attemptedTargets: 0,
    successfulTargets: 0,
    failedTargets: 0,
    skippedExistingTargets: 0,
    remotePreflightChecks: 0,
    remoteImmediateRechecks: 0,
    totalUploadAttempts: 0,
    remoteVerificationAttempts: 0,
    uploadLockAcquired: 0,
    uploadLockReleased: 0,
  };
}

/**
 * Execute one planned upload with immediate remote recheck, one Wrangler put,
 * and post-upload byte verification. Never issues a second put for a target.
 * Requires injected remoteInspector and wranglerRunner.
 */
export async function uploadOneTarget({
  target,
  classified,
  toAbsolute = defaultToAbsolute,
  fetchImpl = globalThis.fetch,
  remoteInspector = null,
  inspectRemote = null,
  wranglerRunner = null,
  runPut = null,
  verifyRemote = verifyUploadedWithPolling,
  sleep = defaultSleep,
  counters = null,
} = {}) {
  const inspect = requireDependency(
    'remoteInspector',
    remoteInspector || inspectRemote,
  );
  const put = requireDependency('wranglerRunner', wranglerRunner || runPut);

  const localAbsolutePath = toAbsolute(target.audioPath);
  const base = {
    audioId: target.audioId,
    locale: target.locale,
    r2Key: classified.r2Key,
    publicUrl: classified.publicUrl,
    localMp3Path: target.audioPath,
  };

  if (counters) {
    counters.remoteImmediateRechecks =
      (counters.remoteImmediateRechecks || 0) + 1;
  }

  // Immediate fresh remote check — a preflight 404 is not a reservation.
  const reinspect = await inspect({
    publicUrl: classified.publicUrl,
    localByteSize: classified.localByteSize,
    localSha256: classified.localSha256,
    localDuration: classified.localDuration,
    fetchImpl,
    counters,
  });

  if (reinspect.action === 'skip_existing_verified') {
    if (counters) {
      counters.skippedExistingTargets += 1;
    }
    return {
      ...base,
      ok: true,
      action: 'skip_existing_verified',
      reason:
        'immediate recheck found an identical remote object; Wrangler put skipped',
      remoteHttpStatus: reinspect.remoteHttpStatus,
      remoteByteSize: reinspect.remoteByteSize,
      remoteSha256: reinspect.remoteSha256,
      remoteDuration: reinspect.remoteDuration,
      putAttempted: false,
    };
  }

  if (reinspect.action === 'block_remote_conflict') {
    if (counters) {
      counters.failedTargets += 1;
    }
    return {
      ...base,
      ok: false,
      action: 'block_remote_conflict',
      reason: reinspect.reason,
      remoteHttpStatus: reinspect.remoteHttpStatus,
      remoteByteSize: reinspect.remoteByteSize,
      remoteSha256: reinspect.remoteSha256,
      remoteDuration: reinspect.remoteDuration,
      putAttempted: false,
    };
  }

  if (reinspect.action !== 'planned_upload') {
    if (counters) {
      counters.failedTargets += 1;
    }
    return {
      ...base,
      ok: false,
      action: 'block_remote_probe_failed',
      reason: reinspect.reason || 'immediate recheck did not confirm absence',
      remoteHttpStatus: reinspect.remoteHttpStatus,
      putAttempted: false,
    };
  }

  if (counters) {
    counters.attemptedTargets += 1;
    counters.totalUploadAttempts += 1;
  }

  let wranglerError = null;
  try {
    put({
      bucket: R2_BUCKET,
      r2Key: classified.r2Key,
      absoluteLocalPath: localAbsolutePath,
      contentType: CONTENT_TYPE,
    });
  } catch (error) {
    wranglerError = error;
  }

  const verified = await verifyRemote({
    publicUrl: classified.publicUrl,
    localByteSize: classified.localByteSize,
    localSha256: classified.localSha256,
    localDuration: classified.localDuration,
    fetchImpl,
    counters,
    countVerification: true,
    remoteInspector: inspect,
    sleep,
  });

  if (verified.ok) {
    if (counters) {
      counters.successfulTargets += 1;
    }
    return {
      ...base,
      ok: true,
      action: wranglerError
        ? 'uploaded_verified_after_wrangler_error'
        : 'uploaded',
      reason: wranglerError
        ? `wrangler failed but remote object matches local MP3: ${wranglerError.message}`
        : 'wrangler put succeeded and remote object matches local MP3',
      remoteHttpStatus: verified.remoteHttpStatus,
      remoteByteSize: verified.remoteByteSize,
      remoteSha256: verified.remoteSha256,
      remoteDuration: verified.remoteDuration,
      wranglerError: wranglerError ? wranglerError.message : null,
      putAttempted: true,
    };
  }

  if (counters) {
    counters.failedTargets += 1;
  }

  let action = verified.action || 'block_remote_probe_failed';
  if (wranglerError && verified.action === 'block_remote_conflict') {
    action = 'block_remote_conflict';
  } else if (wranglerError) {
    action = 'upload_failed';
  }

  return {
    ...base,
    ok: false,
    action,
    reason: wranglerError
      ? `wrangler failed and remote state is not verified equal: ${wranglerError.message}; verify=${verified.reason}`
      : verified.reason,
    remoteHttpStatus: verified.remoteHttpStatus,
    remoteByteSize: verified.remoteByteSize,
    remoteSha256: verified.remoteSha256,
    remoteDuration: verified.remoteDuration,
    wranglerError: wranglerError ? wranglerError.message : null,
    putAttempted: true,
  };
}
