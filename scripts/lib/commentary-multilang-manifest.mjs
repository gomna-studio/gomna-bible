/**
 * Multilingual commentary manifest helpers (en-US / ja-JP).
 * Import-side-effect free. No OpenAI access. Korean keys are impossible.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  sha256Bytes,
  validateApprovedNarrationTarget,
  validateMp3File,
} from './commentary-multilang-audio.mjs';
import {
  validateCommentaryCueDocument,
} from './commentary-multilang-cue.mjs';
import { ROOT } from './commentary-multilang-targets.mjs';
import {
  assertTypeManifestEligible,
  assertVoicePresetForType,
  getCommentaryManifestPreview,
  getCommentaryTypeKr,
  getCommentaryVoicePreset,
  isRegisteredCommentaryType,
  listCommentaryTypes,
} from './commentary-type-registry.mjs';
import {
  DURATION_MATCH_EPSILON_SECONDS,
  PUBLIC_BASE_URL,
  buildMultilangPublicUrl,
  buildMultilangR2Key,
  createExclusiveTempDownload,
  inspectRemoteObjectCore,
  removeTempDownload,
  validateMultilangR2Key,
} from './commentary-multilang-upload.mjs';

export const MANIFEST_RELATIVE_PATH = 'audio/audio-manifest.json';
export const DEFAULT_MANIFEST_PATH = path.join(ROOT, MANIFEST_RELATIVE_PATH);

export const SUPPORTED_MANIFEST_LOCALES = Object.freeze(['en-US', 'ja-JP']);
/** @deprecated Use the commentary-type registry. */
export const SUPPORTED_MANIFEST_TYPE = 'original-language';
/** @deprecated Use the commentary-type registry. */
export const SUPPORTED_VOICE_PRESET = 'study';
export const REQUIRED_MANIFEST_FLAG = '1';
/** @deprecated Use getCommentaryTypeKr(type). */
export const MANIFEST_TYPE_KR = '원어분석';
export const MANIFEST_STATUS_PUBLISHED = 'published';

/** One global lock for every multilingual production manifest write. */
export const GLOBAL_MANIFEST_LOCK_PATH =
  '/tmp/gomna-commentary-multilang-manifest.lock';

export const TEST_MODE_ENV = 'GOMNA_COMMENTARY_MULTILANG_TEST_MODE';

/**
 * Fixed per-locale previews from the authoritative type registry.
 */
export const MULTILANG_TYPE_PREVIEWS = Object.freeze(
  Object.fromEntries(
    ['en-US', 'ja-JP'].map((locale) => [
      locale,
      Object.freeze(
        Object.fromEntries(
          listCommentaryTypes().map((definition) => [
            definition.type,
            definition.previews[locale],
          ]),
        ),
      ),
    ]),
  ),
);

export const MULTILANG_BOOK_DISPLAY_NAMES = Object.freeze({
  'en-US': Object.freeze({ genesis: 'Genesis' }),
  'ja-JP': Object.freeze({ genesis: '創世記' }),
});

const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_MANIFEST_LOCALES);
const FORBIDDEN_LOCALE_SET = new Set(['ko', 'ko-KR']);

export function isManifestTestMode(env = process.env) {
  return String(env?.[TEST_MODE_ENV] || '') === '1';
}

export function createTestRealIoError(label) {
  const error = new Error(`block_test_real_io: ${label} blocked in test mode`);
  error.action = 'block_test_real_io';
  return error;
}

function assertProductionIoAllowed(label) {
  if (isManifestTestMode()) {
    throw createTestRealIoError(label);
  }
}

function requireDependency(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`${name} dependency is required`);
  }
  return value;
}

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

export function normalizeManifestDuration(durationSeconds) {
  const value = Number(durationSeconds);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid manifest duration: ${durationSeconds}`);
  }
  return Number(value.toFixed(3));
}

/**
 * Proven byte-stable serialization used by the Korean sync writer.
 * Round-trips the current audio/audio-manifest.json exactly.
 */
export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildManifestLockPath(_allowedTargetString = null, options = {}) {
  if (options.lockPath) {
    return options.lockPath;
  }
  return GLOBAL_MANIFEST_LOCK_PATH;
}

export function acquireManifestLock(lockPath, options = {}) {
  const mkdirSync = options.mkdirSync || fs.mkdirSync;
  if (typeof lockPath !== 'string' || !lockPath.trim()) {
    return {
      ok: false,
      action: 'block_manifest_lock_failed',
      reason: 'manifest lock path is required',
      lockPath: lockPath || null,
    };
  }

  try {
    mkdirSync(lockPath);
    return {
      ok: true,
      action: 'manifest_lock_acquired',
      reason: 'exclusive manifest lock directory created',
      lockPath,
    };
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return {
        ok: false,
        action: 'block_manifest_lock_held',
        reason: `manifest lock already held: ${lockPath}`,
        lockPath,
      };
    }
    return {
      ok: false,
      action: 'block_manifest_lock_failed',
      reason: `manifest lock acquisition failed: ${error.message}`,
      lockPath,
    };
  }
}

export function releaseManifestLock(lockPath, options = {}) {
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

export function buildManifestBookDisplayName(locale, bookId) {
  const normalizedLocale = String(locale || '').trim();
  const normalizedBook = String(bookId || '').trim();
  if (FORBIDDEN_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }
  if (!SUPPORTED_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Unsupported manifest locale: ${normalizedLocale}`);
  }
  const byLocale = MULTILANG_BOOK_DISPLAY_NAMES[normalizedLocale];
  const name = byLocale?.[normalizedBook];
  if (!name) {
    throw new Error(
      `Unsupported book display mapping: ${normalizedLocale}/${normalizedBook}`,
    );
  }
  return name;
}

export function buildManifestPreview(locale, type) {
  const normalizedLocale = String(locale || '').trim();
  const normalizedType = String(type || '').trim();
  if (FORBIDDEN_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }
  if (!SUPPORTED_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Unsupported manifest locale: ${normalizedLocale}`);
  }
  assertTypeManifestEligible(normalizedType);
  return getCommentaryManifestPreview(normalizedLocale, normalizedType);
}

export function buildCanonicalManifestId({
  bookId,
  chapter,
  verse,
  type = SUPPORTED_MANIFEST_TYPE,
  locale,
} = {}) {
  const normalizedLocale = String(locale || '').trim();
  if (FORBIDDEN_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Korean locale is rejected: ${normalizedLocale}`);
  }
  if (!SUPPORTED_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(`Unsupported manifest locale: ${normalizedLocale}`);
  }
  const normalizedType = String(type || '').trim();
  if (!isRegisteredCommentaryType(normalizedType)) {
    throw new Error(`Unsupported manifest type: ${normalizedType}`);
  }
  assertTypeManifestEligible(normalizedType);
  const book = String(bookId || '').trim();
  if (!book || book.includes('/') || book.includes('\\') || book.includes('..')) {
    throw new Error(`Invalid bookId: ${bookId}`);
  }
  return `${book}.${pad3(chapter)}.${pad3(verse)}.${normalizedType}.${normalizedLocale}`;
}

export function buildCanonicalManifestPublicUrl({
  locale,
  bookId,
  chapter,
  verse,
  type = SUPPORTED_MANIFEST_TYPE,
  voicePreset,
} = {}) {
  const normalizedType = String(type || '').trim();
  const r2Key = buildMultilangR2Key({
    locale,
    bookId,
    chapter,
    verse,
    type: normalizedType,
    voicePreset: voicePreset || getCommentaryVoicePreset(normalizedType),
  });
  return buildMultilangPublicUrl(r2Key);
}

/**
 * Build a canonical multilingual manifest entry using the Genesis 1:1 field order.
 */
export function buildCanonicalManifestEntry({
  locale,
  bookId,
  chapter,
  verse,
  type = SUPPORTED_MANIFEST_TYPE,
  voicePreset,
  durationSeconds,
  fileSize,
} = {}) {
  const normalizedLocale = String(locale || '').trim();
  const normalizedType = String(type || '').trim();
  assertTypeManifestEligible(normalizedType);
  const normalizedPreset = assertVoicePresetForType(
    normalizedType,
    voicePreset || getCommentaryVoicePreset(normalizedType),
  );

  const id = buildCanonicalManifestId({
    bookId,
    chapter,
    verse,
    type: normalizedType,
    locale: normalizedLocale,
  });
  const filePath = buildCanonicalManifestPublicUrl({
    locale: normalizedLocale,
    bookId,
    chapter,
    verse,
    type: normalizedType,
    voicePreset: normalizedPreset,
  });
  const size = Number(fileSize);
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`Invalid manifest fileSize: ${fileSize}`);
  }

  // Exact Genesis 1:1 field order.
  return {
    id,
    book: buildManifestBookDisplayName(normalizedLocale, bookId),
    bookId: String(bookId).trim(),
    language: normalizedLocale,
    chapter: Number(chapter),
    verse: Number(verse),
    type: normalizedType,
    typeKr: getCommentaryTypeKr(normalizedType),
    voicePreset: normalizedPreset,
    filePath,
    duration: normalizeManifestDuration(durationSeconds),
    fileSize: size,
    status: MANIFEST_STATUS_PUBLISHED,
    preview: buildManifestPreview(normalizedLocale, normalizedType),
  };
}

export function entriesDeepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function loadManifestCore({
  manifestPath = DEFAULT_MANIFEST_PATH,
  readFileSync = fs.readFileSync,
} = {}) {
  const raw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('manifest root must be an object');
  }
  if (!parsed.audios || typeof parsed.audios !== 'object' || Array.isArray(parsed.audios)) {
    throw new Error('manifest.audios must be an object');
  }
  return {
    ok: true,
    manifest: parsed,
    raw,
    serialized: serializeManifest(parsed),
    path: manifestPath,
  };
}

export function loadManifestProduction(options = {}) {
  assertProductionIoAllowed('default manifest loader');
  return loadManifestCore(options);
}

function findDuplicateUrls(audios) {
  const byUrl = new Map();
  const duplicates = [];
  for (const [id, entry] of Object.entries(audios || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const url = entry.filePath;
    if (typeof url !== 'string' || !url) continue;
    if (!byUrl.has(url)) {
      byUrl.set(url, id);
      continue;
    }
    duplicates.push({ url, ids: [byUrl.get(url), id] });
  }
  return duplicates;
}

export function inspectManifestDuplicates(manifest) {
  const audios = manifest?.audios || {};
  const ids = Object.keys(audios);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    return {
      ok: false,
      action: 'block_manifest_duplicate',
      reason: 'duplicate manifest IDs present',
    };
  }
  const urlDupes = findDuplicateUrls(audios);
  if (urlDupes.length) {
    return {
      ok: false,
      action: 'block_manifest_duplicate',
      reason: `duplicate manifest URLs present: ${urlDupes[0].url}`,
      duplicates: urlDupes,
    };
  }
  return { ok: true };
}

export function compareManifestRegistration({
  manifest,
  canonicalEntry,
} = {}) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      ok: false,
      action: 'block_manifest_conflict',
      reason: 'manifest object is required',
    };
  }

  const dup = inspectManifestDuplicates(manifest);
  if (!dup.ok) {
    return dup;
  }

  const audios = manifest.audios || {};
  const byId = audios[canonicalEntry.id] || null;
  const urlOwners = Object.entries(audios).filter(
    ([, entry]) => entry && entry.filePath === canonicalEntry.filePath,
  );

  if (byId) {
    if (entriesDeepEqual(byId, canonicalEntry)) {
      return {
        ok: true,
        action: 'skip_existing_manifest_verified',
        reason: 'existing manifest entry matches canonical entry exactly',
        existingEntry: byId,
        canonicalEntry,
      };
    }
    return {
      ok: false,
      action: 'block_manifest_conflict',
      reason: `existing manifest ID ${canonicalEntry.id} differs from canonical entry`,
      existingEntry: byId,
      canonicalEntry,
    };
  }

  if (urlOwners.length === 1) {
    return {
      ok: false,
      action: 'block_manifest_conflict',
      reason: `canonical URL already registered under different ID ${urlOwners[0][0]}`,
      existingEntry: urlOwners[0][1],
      canonicalEntry,
    };
  }

  if (urlOwners.length > 1) {
    return {
      ok: false,
      action: 'block_manifest_duplicate',
      reason: `canonical URL owned by multiple IDs`,
      canonicalEntry,
    };
  }

  return {
    ok: true,
    action: 'planned_manifest_append',
    reason: 'canonical ID and URL are absent from the manifest',
    existingEntry: null,
    canonicalEntry,
  };
}

export function validateManifestCueGate({
  target,
  durationSeconds,
  cardCount,
  toAbsolute = defaultToAbsolute,
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
} = {}) {
  const cueRel = String(target?.cuePath || '');
  if (!cueRel) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: 'cue path missing',
    };
  }
  if (
    cueRel.includes('..') ||
    cueRel.includes('\\') ||
    cueRel.includes('//') ||
    path.isAbsolute(cueRel) ||
    cueRel.includes('ko-KR') ||
    cueRel.includes('/ko/')
  ) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: `rejected cue path: ${cueRel}`,
    };
  }

  const cueAbs = toAbsolute(cueRel);
  if (!existsSync(cueAbs)) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: `missing Cue: ${cueRel}`,
    };
  }

  let document;
  try {
    document = JSON.parse(readFileSync(cueAbs, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: `invalid Cue JSON: ${error.message}`,
    };
  }

  const expectedLocale = String(target.locale || '');
  const expectedAudioId = String(target.audioId || '');
  if (document?.audioId !== expectedAudioId) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: `cue audioId=${document?.audioId} expected=${expectedAudioId}`,
    };
  }
  if (
    typeof document?.testAudioPath === 'string' &&
    !document.testAudioPath.startsWith(`audio/v1/${expectedLocale}/`)
  ) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: `cue path locale mismatch: ${document.testAudioPath}`,
    };
  }

  const validated = validateCommentaryCueDocument(document, {
    target,
    durationSeconds,
    cardCount: cardCount ?? target.cardCount,
    type: target.type,
  });
  if (!validated.ok) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: validated.reason,
      document,
    };
  }

  const itemSegments = (document.segments || []).filter(
    (segment) => segment && segment.type === 'item',
  );
  return {
    ok: true,
    action: 'cue_validated',
    reason: 'cue timing structure validates against narration cards',
    document,
    cueSegmentCount: document.segments.length,
    cueItemCount: itemSegments.length,
  };
}

function remapRemoteInspection(inspection) {
  if (!inspection) {
    return {
      ok: false,
      action: 'block_manifest_remote_probe_failed',
      reason: 'remote inspection returned no result',
      remoteResult: 'probe_failed',
    };
  }

  if (inspection.action === 'skip_existing_verified') {
    return {
      ...inspection,
      ok: true,
      action: 'remote_exact_match',
      remoteResult: 'exact_match',
    };
  }

  if (inspection.action === 'planned_upload') {
    return {
      ...inspection,
      ok: false,
      action: 'block_manifest_remote_mismatch',
      reason: inspection.reason || 'remote object missing',
      remoteResult: 'missing',
    };
  }

  if (
    inspection.action === 'block_remote_conflict' ||
    String(inspection.reason || '').includes('byte size') ||
    String(inspection.reason || '').includes('SHA-256') ||
    String(inspection.reason || '').includes('duration')
  ) {
    return {
      ...inspection,
      ok: false,
      action: 'block_manifest_remote_mismatch',
      remoteResult: 'mismatch',
    };
  }

  return {
    ...inspection,
    ok: false,
    action: 'block_manifest_remote_probe_failed',
    remoteResult: 'probe_failed',
  };
}

export async function inspectManifestRemoteCore(options = {}) {
  const inspection = await inspectRemoteObjectCore(options);
  return remapRemoteInspection(inspection);
}

export async function inspectManifestRemoteProduction(options = {}) {
  assertProductionIoAllowed('default manifest remote inspector');
  return inspectManifestRemoteCore(options);
}

export function createEmptyManifestCounters() {
  return {
    plannedTargets: 0,
    cueValidatedTargets: 0,
    remoteVerifiedTargets: 0,
    existingManifestVerifiedTargets: 0,
    plannedManifestEntries: 0,
    writtenManifestEntries: 0,
    blockedTargets: 0,
    failedTargets: 0,
    remoteVerificationAttempts: 0,
    manifestLockAcquired: 0,
    manifestLockReleased: 0,
  };
}

function assertSupportedManifestTarget(target) {
  const locale = String(target?.locale || '').trim();
  const type = String(target?.type || '').trim();

  if (FORBIDDEN_LOCALE_SET.has(locale) || locale === 'ko') {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: `Korean locale is rejected: ${locale}`,
    };
  }
  if (!SUPPORTED_LOCALE_SET.has(locale)) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: `unsupported manifest locale: ${locale}`,
    };
  }

  let preset;
  try {
    assertTypeManifestEligible(type);
    preset = assertVoicePresetForType(
      type,
      target?.voicePreset || getCommentaryVoicePreset(type),
    );
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_type',
      reason: error.message,
    };
  }
  return { ok: true, locale, type, preset };
}

/**
 * Classify one target for manifest registration.
 * Requires injected manifestLoader and remoteInspector.
 */
export async function classifyManifestTarget({
  target,
  root = ROOT,
  toAbsolute = defaultToAbsolute,
  counters = null,
  manifestLoader,
  remoteInspector,
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
} = {}) {
  requireDependency('manifestLoader', manifestLoader);
  requireDependency('remoteInspector', remoteInspector);

  const supported = assertSupportedManifestTarget(target);
  if (!supported.ok) {
    return {
      ok: false,
      ...supported,
      locale: target?.locale,
      book: target?.bookId,
      chapter: target?.chapter,
      verse: target?.verse,
      manifestId: target?.audioId || null,
      publicUrl: target?.publicUrl || null,
      action: supported.action,
    };
  }

  const narration = validateApprovedNarrationTarget({
    target,
    toAbsolute,
  });
  if (!narration.ok) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl: target.publicUrl || null,
      action: narration.action,
      reason: narration.reason,
      remoteResult: null,
      manifestResult: null,
    };
  }

  const audioAbs = toAbsolute(target.audioPath);
  const mp3 = validateMp3File(audioAbs, { readFileSync, existsSync });
  if (!mp3.ok) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl: target.publicUrl || null,
      action: 'block_invalid_mp3',
      reason: mp3.reason,
      remoteResult: null,
      manifestResult: null,
    };
  }

  let r2Key;
  let publicUrl;
  try {
    r2Key = buildMultilangR2Key({
      locale: target.locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: target.type,
      voicePreset: target.voicePreset || getCommentaryVoicePreset(target.type),
    });
    publicUrl = buildMultilangPublicUrl(r2Key);
    validateMultilangR2Key(r2Key, {
      locale: target.locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: target.type,
      voicePreset: target.voicePreset || getCommentaryVoicePreset(target.type),
    });
  } catch (error) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl: null,
      action: 'block_invalid_r2_key',
      reason: error.message,
      remoteResult: null,
      manifestResult: null,
    };
  }

  const expectedManifestId = buildCanonicalManifestId({
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: target.type,
    locale: target.locale,
  });
  if (target.audioId !== expectedManifestId) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl,
      action: 'block_manifest_conflict',
      reason: `target audioId ${target.audioId} != canonical ${expectedManifestId}`,
      remoteResult: null,
      manifestResult: null,
    };
  }

  const cue = validateManifestCueGate({
    target,
    durationSeconds: mp3.duration,
    cardCount: target.cardCount,
    toAbsolute,
    readFileSync,
    existsSync,
  });
  if (!cue.ok) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl,
      localSize: mp3.byteSize,
      localSha256: mp3.sha256,
      localDuration: normalizeManifestDuration(mp3.duration),
      cueSegmentCount: null,
      cueItemCount: null,
      action: 'block_manifest_cue_invalid',
      reason: cue.reason,
      remoteResult: null,
      manifestResult: null,
    };
  }

  if (counters) {
    counters.cueValidatedTargets = (counters.cueValidatedTargets || 0) + 1;
  }

  if (counters) {
    counters.remoteVerificationAttempts =
      (counters.remoteVerificationAttempts || 0) + 1;
  }

  const remote = await remoteInspector({
    publicUrl,
    localByteSize: mp3.byteSize,
    localSha256: mp3.sha256,
    localDuration: mp3.duration,
    createTemp: createExclusiveTempDownload,
    removeTemp: removeTempDownload,
    validateDownloadedMp3: validateMp3File,
    counters,
    countVerification: false,
  });

  if (!remote.ok) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl,
      localSize: mp3.byteSize,
      localSha256: mp3.sha256,
      localDuration: normalizeManifestDuration(mp3.duration),
      cueSegmentCount: cue.cueSegmentCount,
      cueItemCount: cue.cueItemCount,
      action: remote.action,
      reason: remote.reason,
      remoteResult: remote.remoteResult,
      remoteHttpStatus: remote.remoteHttpStatus ?? null,
      remoteByteSize: remote.remoteByteSize ?? null,
      remoteSha256: remote.remoteSha256 ?? null,
      remoteDuration: remote.remoteDuration ?? null,
      manifestResult: null,
    };
  }

  if (counters) {
    counters.remoteVerifiedTargets = (counters.remoteVerifiedTargets || 0) + 1;
  }

  let canonicalEntry;
  try {
    canonicalEntry = buildCanonicalManifestEntry({
      locale: target.locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: target.type,
      voicePreset: target.voicePreset || getCommentaryVoicePreset(target.type),
      durationSeconds: mp3.duration,
      fileSize: mp3.byteSize,
    });
  } catch (error) {
    return {
      ok: false,
      locale: target.locale,
      book: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      manifestId: target.audioId,
      publicUrl,
      action: 'block_manifest_conflict',
      reason: error.message,
      remoteResult: remote.remoteResult,
      manifestResult: null,
    };
  }

  const loaded = manifestLoader({ root, toAbsolute });
  const manifest = loaded?.manifest || loaded;
  const comparison = compareManifestRegistration({
    manifest,
    canonicalEntry,
  });

  if (comparison.action === 'skip_existing_manifest_verified' && counters) {
    counters.existingManifestVerifiedTargets =
      (counters.existingManifestVerifiedTargets || 0) + 1;
  }
  if (comparison.action === 'planned_manifest_append' && counters) {
    counters.plannedManifestEntries =
      (counters.plannedManifestEntries || 0) + 1;
  }

  return {
    ok: comparison.ok,
    locale: target.locale,
    book: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    manifestId: canonicalEntry.id,
    publicUrl: canonicalEntry.filePath,
    localSize: mp3.byteSize,
    localSha256: mp3.sha256,
    localDuration: canonicalEntry.duration,
    cueSegmentCount: cue.cueSegmentCount,
    cueItemCount: cue.cueItemCount,
    remoteResult: remote.remoteResult,
    remoteHttpStatus: remote.remoteHttpStatus ?? null,
    remoteByteSize: remote.remoteByteSize ?? null,
    remoteSha256: remote.remoteSha256 ?? null,
    remoteDuration: remote.remoteDuration ?? null,
    manifestResult: comparison.action,
    action: comparison.action,
    reason: comparison.reason,
    canonicalEntry,
    existingEntry: comparison.existingEntry || null,
    r2Key,
  };
}

export function buildNextManifestDocument({
  currentManifest,
  appendEntries,
  now = () => new Date().toISOString(),
} = {}) {
  if (!currentManifest || typeof currentManifest !== 'object') {
    throw new Error('currentManifest is required');
  }
  if (!Array.isArray(appendEntries)) {
    throw new Error('appendEntries must be an array');
  }

  const nextAudios = { ...currentManifest.audios };
  for (const entry of appendEntries) {
    if (!entry?.id) {
      throw new Error('append entry missing id');
    }
    if (nextAudios[entry.id]) {
      throw new Error(`refusing to overwrite existing manifest id ${entry.id}`);
    }
    nextAudios[entry.id] = entry;
  }

  return {
    version: currentManifest.version,
    lastUpdated: typeof now === 'function' ? now() : now,
    totalAudios: Object.keys(nextAudios).length,
    audios: nextAudios,
  };
}

export function assertUnrelatedEntriesUnchanged(beforeManifest, afterManifest, touchedIds) {
  const touched = new Set(touchedIds || []);
  const beforeAudios = beforeManifest.audios || {};
  const afterAudios = afterManifest.audios || {};

  for (const [id, entry] of Object.entries(beforeAudios)) {
    if (touched.has(id)) continue;
    if (!entriesDeepEqual(entry, afterAudios[id])) {
      throw new Error(`unrelated manifest entry changed: ${id}`);
    }
  }

  for (const id of Object.keys(afterAudios)) {
    if (touched.has(id)) continue;
    if (!Object.prototype.hasOwnProperty.call(beforeAudios, id)) {
      throw new Error(`unexpected new unrelated manifest entry: ${id}`);
    }
  }
}

export function writeManifestAtomicCore({
  manifestPath = DEFAULT_MANIFEST_PATH,
  nextManifest,
  writeFileSync = fs.writeFileSync,
  renameSync = fs.renameSync,
  readFileSync = fs.readFileSync,
  openSync = fs.openSync,
  writeSync = fs.writeSync,
  fsyncSync = fs.fsyncSync,
  closeSync = fs.closeSync,
  unlinkSync = fs.unlinkSync,
  existsSync = fs.existsSync,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!nextManifest || typeof nextManifest !== 'object') {
    throw new Error('nextManifest is required');
  }

  const serialized = serializeManifest(nextManifest);
  // Guard: serialization must parse back.
  JSON.parse(serialized);

  const directory = path.dirname(manifestPath);
  const tempName = `.audio-manifest.${process.pid}.${Date.now()}.${randomBytes(8).toString('hex')}.tmp.json`;
  const tempPath = path.join(directory, tempName);
  let fd = null;
  let renamed = false;

  try {
    fd = openSync(tempPath, 'wx');
    writeSync(fd, serialized, 0, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    const tempParsed = JSON.parse(readFileSync(tempPath, 'utf8'));
    if (!tempParsed?.audios || typeof tempParsed.audios !== 'object') {
      throw new Error('temporary manifest failed validation');
    }

    renameSync(tempPath, manifestPath);
    renamed = true;

    const verifiedRaw = readFileSync(manifestPath, 'utf8');
    if (verifiedRaw !== serialized) {
      throw new Error('post-rename manifest bytes differ from intended serialization');
    }
    JSON.parse(verifiedRaw);

    return {
      ok: true,
      manifestPath,
      tempPath,
      byteSize: Buffer.byteLength(serialized, 'utf8'),
      serialized,
    };
  } catch (error) {
    if (fd != null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    if (!renamed && existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
    const wrapped = new Error(`manifest atomic write failed: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

export function writeManifestAtomicProduction(options = {}) {
  assertProductionIoAllowed('default manifest writer');
  return writeManifestAtomicCore(options);
}

export function createProductionManifestAdapters(options = {}) {
  if (isManifestTestMode() && options.allowInTestMode !== true) {
    throw createTestRealIoError('createProductionManifestAdapters');
  }

  return {
    manifestLoader: (loaderOptions = {}) =>
      loadManifestProduction({
        manifestPath: loaderOptions.manifestPath || DEFAULT_MANIFEST_PATH,
        readFileSync: loaderOptions.readFileSync || fs.readFileSync,
      }),
    manifestWriter: (writerOptions = {}) =>
      writeManifestAtomicProduction(writerOptions),
    remoteInspector: (remoteOptions = {}) =>
      inspectManifestRemoteProduction(remoteOptions),
    lockAdapter: {
      path: GLOBAL_MANIFEST_LOCK_PATH,
      acquire: (lockPath = GLOBAL_MANIFEST_LOCK_PATH, lockOptions) =>
        acquireManifestLock(lockPath, lockOptions),
      release: (lockPath = GLOBAL_MANIFEST_LOCK_PATH, lockOptions) =>
        releaseManifestLock(lockPath, lockOptions),
    },
    temporaryFileAdapter: {
      createExclusiveTempDownload,
      removeTempDownload,
    },
    sleep: options.sleep || defaultSleep,
  };
}

/**
 * All-or-nothing range write. Any blocker aborts before mutation.
 */
export async function writeManifestForTargets({
  targets,
  toAbsolute = defaultToAbsolute,
  counters = null,
  manifestLoader,
  manifestWriter,
  remoteInspector,
  now = () => new Date().toISOString(),
} = {}) {
  requireDependency('manifestLoader', manifestLoader);
  requireDependency('manifestWriter', manifestWriter);
  requireDependency('remoteInspector', remoteInspector);

  if (!Array.isArray(targets) || !targets.length) {
    throw new Error('targets are required');
  }

  const localCounters = counters || createEmptyManifestCounters();
  localCounters.plannedTargets = targets.length;

  const classifications = [];
  for (const target of targets) {
    const classified = await classifyManifestTarget({
      target,
      toAbsolute,
      counters: localCounters,
      manifestLoader,
      remoteInspector,
    });
    classifications.push({ target, ...classified });
  }

  const blockers = classifications.filter((item) =>
    String(item.action).startsWith('block_'),
  );
  if (blockers.length) {
    localCounters.blockedTargets = blockers.length;
    return {
      ok: false,
      action: 'block_manifest_write_aborted',
      reason: 'one or more targets are blocked',
      classifications,
      blockers,
      written: false,
    };
  }

  const toAppend = classifications.filter(
    (item) => item.action === 'planned_manifest_append',
  );
  const skipped = classifications.filter(
    (item) => item.action === 'skip_existing_manifest_verified',
  );

  if (!toAppend.length) {
    return {
      ok: true,
      action: 'manifest_unchanged',
      reason: 'all targets already verified in manifest',
      classifications,
      skipped,
      written: false,
      writtenManifestEntries: 0,
    };
  }

  const loaded = manifestLoader({ toAbsolute });
  const currentManifest = loaded.manifest || loaded;
  // Re-check after reload.
  for (const item of toAppend) {
    const again = compareManifestRegistration({
      manifest: currentManifest,
      canonicalEntry: item.canonicalEntry,
    });
    if (again.action !== 'planned_manifest_append') {
      localCounters.blockedTargets += 1;
      return {
        ok: false,
        action: 'block_manifest_write_aborted',
        reason: `recheck changed append state for ${item.manifestId}: ${again.action}`,
        classifications,
        written: false,
      };
    }
  }

  const nextManifest = buildNextManifestDocument({
    currentManifest,
    appendEntries: toAppend.map((item) => item.canonicalEntry),
    now,
  });

  assertUnrelatedEntriesUnchanged(
    currentManifest,
    nextManifest,
    toAppend.map((item) => item.canonicalEntry.id),
  );

  // Preserve skipped entries byte-identical.
  for (const item of skipped) {
    const after = nextManifest.audios[item.canonicalEntry.id];
    if (!entriesDeepEqual(item.canonicalEntry, after)) {
      throw new Error(
        `skip entry mutated during manifest build: ${item.canonicalEntry.id}`,
      );
    }
  }

  const written = manifestWriter({
    manifestPath: loaded.path || DEFAULT_MANIFEST_PATH,
    nextManifest,
  });

  const reloaded = manifestLoader({
    toAbsolute,
    manifestPath: loaded.path || DEFAULT_MANIFEST_PATH,
  });
  const finalManifest = reloaded.manifest || reloaded;

  for (const item of toAppend) {
    const finalEntry = finalManifest.audios[item.canonicalEntry.id];
    if (!entriesDeepEqual(finalEntry, item.canonicalEntry)) {
      throw new Error(
        `post-write verification failed for ${item.canonicalEntry.id}`,
      );
    }
  }

  assertUnrelatedEntriesUnchanged(
    currentManifest,
    finalManifest,
    toAppend.map((item) => item.canonicalEntry.id),
  );

  localCounters.writtenManifestEntries = toAppend.length;

  return {
    ok: true,
    action: 'manifest_written',
    reason: `appended ${toAppend.length} manifest entries`,
    classifications,
    skipped,
    appended: toAppend,
    written: true,
    writtenManifestEntries: toAppend.length,
    byteSize: written.byteSize,
    lastUpdated: nextManifest.lastUpdated,
  };
}

export { PUBLIC_BASE_URL, sha256Bytes };
