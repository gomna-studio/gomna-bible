/**
 * Commentary multilang v2 publish staging helpers.
 * Plans R2 uploads and book-unit manifest shards under /tmp only.
 * This phase never writes ops audio/manifests and never performs real R2 puts.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateMp3File } from './commentary-multilang-audio.mjs';
import {
  classifyAudioEligibleTargets,
  buildAudioCueStagingTarget,
  verifyStagedAudioCue,
} from './commentary-multilang-audio-cue-stage.mjs';
import {
  buildCanonicalManifestEntry,
  buildCanonicalManifestId,
  inspectManifestDuplicates,
  normalizeManifestDuration,
  serializeManifest,
  validateManifestCueGate,
} from './commentary-multilang-manifest.mjs';
import {
  PUBLIC_BASE_URL,
  R2_BUCKET,
  buildMultilangPublicUrl,
  buildMultilangR2Key,
  inspectRemoteObjectCore,
  validateMultilangR2Key,
} from './commentary-multilang-upload.mjs';
import { getCommentaryVoicePreset } from './commentary-type-registry.mjs';
import {
  assertStagingPath,
} from './commentary-multilang-translation-io.mjs';
import { sha256Text } from './commentary-multilang-translation.mjs';

export const PUBLISH_PHASE_BLOCKS_REAL_UPLOAD = true;
export const BOOK_MANIFEST_RELATIVE_ROOT = 'audio/manifests';

const fsExistsSync = fs.existsSync.bind(fs);
const fsMkdirSync = fs.mkdirSync.bind(fs);
const fsReadFileSync = fs.readFileSync.bind(fs);
const fsWriteFileSync = fs.writeFileSync.bind(fs);

export function classifyPublishEligibleTargets(jobs, results, options = {}) {
  const classified = classifyAudioEligibleTargets(jobs, results, options);
  return {
    ...classified,
    excluded: classified.excluded.map((item) => ({
      ...item,
      status:
        item.grade === 'SOURCE_REVIEW_REQUIRED'
          ? 'publish-excluded-source-review'
          : 'publish-excluded-non-pass',
    })),
    sourceReviewExcluded: classified.sourceReviewExcluded.map((item) => ({
      ...item,
      status: 'publish-excluded-source-review',
    })),
  };
}

export function buildBookManifestRelativePath(locale, bookId) {
  const normalizedLocale = String(locale || '').trim();
  const book = String(bookId || '').trim();
  if (!['en-US', 'ja-JP'].includes(normalizedLocale)) {
    throw new Error(`unsupported manifest shard locale: ${normalizedLocale}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book)) {
    throw new Error(`invalid bookId for manifest shard: ${bookId}`);
  }
  return `${BOOK_MANIFEST_RELATIVE_ROOT}/${normalizedLocale}/${book}.json`;
}

/**
 * Build one upload-plan candidate from staged MP3 + Cue.
 * Does not touch network.
 */
export function buildUploadPlanCandidate(job, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-publish'),
    'stagingRoot',
  );
  let target;
  try {
    target = buildAudioCueStagingTarget(job, { stagingRoot });
  } catch (error) {
    return {
      ok: false,
      action: 'block_unsupported_locale',
      reason: error.message,
      targetId: job.targetId,
      audioId: job.audioId || null,
    };
  }
  const voicePreset = target.voicePreset || getCommentaryVoicePreset(job.type);

  let r2Key;
  let publicUrl;
  try {
    r2Key = buildMultilangR2Key({
      locale: target.locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: target.type,
      voicePreset,
    });
    publicUrl = buildMultilangPublicUrl(r2Key);
    validateMultilangR2Key(r2Key, {
      locale: target.locale,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      type: target.type,
      voicePreset,
    });
  } catch (error) {
    return {
      ok: false,
      action: 'block_invalid_r2_key',
      reason: error.message,
      targetId: job.targetId,
      audioId: target.audioId,
      target,
    };
  }

  if (!fsExistsSync(target.audioAbs)) {
    return {
      ok: false,
      action: 'block_missing_mp3',
      reason: `missing staged MP3: ${target.audioPath}`,
      targetId: job.targetId,
      audioId: target.audioId,
      r2Key,
      publicUrl,
      target,
    };
  }

  const mp3 = (options.validateMp3File || validateMp3File)(target.audioAbs);
  if (!mp3.ok) {
    return {
      ok: false,
      action: 'block_invalid_mp3',
      reason: mp3.reason,
      targetId: job.targetId,
      audioId: target.audioId,
      r2Key,
      publicUrl,
      target,
    };
  }
  if (!(mp3.byteSize > 0) || !(mp3.duration > 0) || !mp3.sha256) {
    return {
      ok: false,
      action: 'block_invalid_mp3',
      reason: 'mp3 size/duration/hash missing',
      targetId: job.targetId,
      audioId: target.audioId,
      r2Key,
      publicUrl,
      target,
    };
  }

  const cueGate = validateManifestCueGate({
    target,
    durationSeconds: mp3.duration,
    cardCount: target.cardCount,
    toAbsolute: (rel) => path.join(stagingRoot, rel),
  });

  // Soften closing requirement for types whose staged cue omits closing.
  let cueOk = cueGate.ok;
  let cueReason = cueGate.reason;
  let cueDocument = cueGate.document || null;
  if (!cueOk && fsExistsSync(target.cueAbs)) {
    const verified = verifyStagedAudioCue(target);
    if (verified.ok) {
      cueOk = true;
      cueReason = 'cue verified via staged audio-cue verifier';
      cueDocument = verified.document;
    }
  }
  if (!cueOk) {
    return {
      ok: false,
      action: 'block_manifest_cue_invalid',
      reason: cueReason || 'cue validation failed',
      targetId: job.targetId,
      audioId: target.audioId,
      r2Key,
      publicUrl,
      target,
      mp3,
    };
  }

  const manifestId = buildCanonicalManifestId({
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: target.type,
    locale: target.locale,
  });
  if (manifestId !== target.audioId) {
    return {
      ok: false,
      action: 'block_audio_id_mismatch',
      reason: `manifestId=${manifestId} audioId=${target.audioId}`,
      targetId: job.targetId,
      audioId: target.audioId,
      r2Key,
      publicUrl,
      target,
    };
  }

  const manifestEntry = buildCanonicalManifestEntry({
    locale: target.locale,
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: target.type,
    voicePreset,
    durationSeconds: mp3.duration,
    fileSize: mp3.byteSize,
  });

  return {
    ok: true,
    action: 'planned_upload',
    reason: 'staged MP3+Cue validated; upload candidate ready',
    targetId: job.targetId,
    audioId: target.audioId,
    locale: target.locale,
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: target.type,
    voicePreset,
    audioPath: target.audioPath,
    cuePath: target.cuePath,
    audioAbs: target.audioAbs,
    cueAbs: target.cueAbs,
    r2Bucket: R2_BUCKET,
    r2Key,
    publicUrl,
    byteSize: mp3.byteSize,
    duration: normalizeManifestDuration(mp3.duration),
    sha256: mp3.sha256,
    manifestId,
    manifestEntry,
    cueDocument,
    target,
    status: 'upload-planned',
  };
}

export function buildUploadPlan(jobs, options = {}) {
  const candidates = [];
  const blocked = [];
  for (const job of jobs || []) {
    const candidate = buildUploadPlanCandidate(job, options);
    if (candidate.ok) candidates.push(candidate);
    else blocked.push(candidate);
  }

  const duplicateKeys = findDuplicates(candidates.map((item) => item.r2Key));
  const duplicateIds = findDuplicates(candidates.map((item) => item.audioId));

  return {
    ok: duplicateKeys.length === 0 && duplicateIds.length === 0 && blocked.length === 0,
    candidates,
    blocked,
    counts: {
      total: (jobs || []).length,
      planned: candidates.length,
      blocked: blocked.length,
      byLocale: countBy(candidates, (item) => item.locale),
    },
    duplicateR2Keys: duplicateKeys,
    duplicateAudioIds: duplicateIds,
    missingSizeOrDuration: candidates.filter(
      (item) => !(item.byteSize > 0) || !(item.duration > 0),
    ),
    cueUnverified: blocked.filter(
      (item) => item.action === 'block_manifest_cue_invalid',
    ),
  };
}

function findDuplicates(values) {
  const seen = new Map();
  const dupes = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) {
      if (!dupes.includes(value)) dupes.push(value);
    } else {
      seen.set(value, true);
    }
  }
  return dupes;
}

function countBy(list, keyFn) {
  const out = {};
  for (const item of list) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * Phase-5 r2-upload: never performs a real put.
 * Classifies against an optional remote inspector (mock/network).
 */
export async function planR2UploadActions(candidates, options = {}) {
  const {
    executeNetwork = false,
    allowRealUpload = false,
    remoteInspector = null,
    fetchImpl = null,
  } = options;

  if (allowRealUpload && PUBLISH_PHASE_BLOCKS_REAL_UPLOAD) {
    throw new Error(
      'Real R2 upload is blocked in publish staging phase-5 (PUBLISH_PHASE_BLOCKS_REAL_UPLOAD)',
    );
  }

  const actions = [];
  let networkCalls = 0;

  for (const candidate of candidates || []) {
    if (!executeNetwork || !remoteInspector) {
      actions.push({
        ...candidate,
        uploadAction: 'upload_planned_dry_run',
        status: 'upload-planned',
        uploaded: false,
        networkCalled: false,
        reason: executeNetwork
          ? 'execute-network set but remote inspector not provided; dry plan only'
          : 'dry-run: no network; upload candidate retained',
      });
      continue;
    }

    networkCalls += 1;
    const remote = await remoteInspector({
      publicUrl: candidate.publicUrl,
      localByteSize: candidate.byteSize,
      localSha256: candidate.sha256,
      localDuration: candidate.duration,
      fetchImpl: fetchImpl || globalThis.fetch,
    });

    if (remote.action === 'skip_existing_verified') {
      actions.push({
        ...candidate,
        uploadAction: 'skip_existing_verified',
        status: 'upload-skipped-existing',
        uploaded: false,
        networkCalled: true,
        remote,
        reason: remote.reason,
      });
      continue;
    }

    if (remote.action === 'block_remote_conflict') {
      actions.push({
        ...candidate,
        uploadAction: 'block_remote_conflict',
        status: 'upload-conflict',
        uploaded: false,
        networkCalled: true,
        remote,
        reason: remote.reason,
        ok: false,
      });
      continue;
    }

    if (remote.action === 'planned_upload') {
      // Phase-5: never put. Record blocked upload that would have run.
      actions.push({
        ...candidate,
        uploadAction: 'upload_blocked_phase5',
        status: 'upload-blocked-phase5',
        uploaded: false,
        networkCalled: true,
        remote,
        reason:
          'remote absent; real wrangler put blocked in phase-5 publish staging',
      });
      continue;
    }

    actions.push({
      ok: false,
      ...candidate,
      uploadAction: remote.action || 'block_remote_probe_failed',
      status: 'upload-conflict',
      uploaded: false,
      networkCalled: true,
      remote,
      reason: remote.reason || 'remote probe failed',
    });
  }

  return {
    actions,
    networkCalls,
    realUploads: 0,
    planned: actions.filter((item) =>
      ['upload_planned_dry_run', 'upload_blocked_phase5', 'upload-planned'].includes(
        item.uploadAction || item.status,
      ),
    ).length,
    skippedExisting: actions.filter(
      (item) => item.uploadAction === 'skip_existing_verified',
    ).length,
    conflicts: actions.filter(
      (item) =>
        item.uploadAction === 'block_remote_conflict' ||
        item.status === 'upload-conflict',
    ).length,
  };
}

/**
 * URL verify step. Without execute-network, validates plan completeness only.
 */
export async function verifyUploadUrls(actions, options = {}) {
  const {
    executeNetwork = false,
    fetchImpl = null,
    inspectRemote = inspectRemoteObjectCore,
  } = options;

  const results = [];
  let networkCalls = 0;

  for (const action of actions || []) {
    if (!executeNetwork) {
      const complete =
        !!action.publicUrl &&
        action.byteSize > 0 &&
        action.duration > 0 &&
        !!action.sha256 &&
        !!action.r2Key;
      results.push({
        targetId: action.targetId,
        audioId: action.audioId,
        publicUrl: action.publicUrl,
        ok: complete,
        status: complete ? 'url-verified' : 'url-verify-failed',
        action: complete ? 'url_plan_complete' : 'url_plan_incomplete',
        reason: complete
          ? 'dry-run url fields complete (no network)'
          : 'missing url/size/duration/hash',
        networkCalled: false,
        expectedByteSize: action.byteSize,
      });
      continue;
    }

    networkCalls += 1;
    const remote = await inspectRemote({
      publicUrl: action.publicUrl,
      localByteSize: action.byteSize,
      localSha256: action.sha256,
      localDuration: action.duration,
      fetchImpl: fetchImpl || globalThis.fetch,
    });

    if (remote.action === 'skip_existing_verified') {
      results.push({
        targetId: action.targetId,
        audioId: action.audioId,
        publicUrl: action.publicUrl,
        ok: true,
        status: 'url-verified',
        action: 'url_200_size_match',
        reason: remote.reason,
        networkCalled: true,
        remoteHttpStatus: 200,
        expectedByteSize: action.byteSize,
        remoteByteSize: remote.remoteByteSize,
      });
      continue;
    }

    if (remote.remoteHttpStatus === 404 || remote.action === 'planned_upload') {
      results.push({
        targetId: action.targetId,
        audioId: action.audioId,
        publicUrl: action.publicUrl,
        ok: false,
        status: 'url-verify-failed',
        action: 'url_404',
        reason: remote.reason || 'HTTP 404',
        networkCalled: true,
        remoteHttpStatus: 404,
        expectedByteSize: action.byteSize,
      });
      continue;
    }

    if (remote.action === 'block_remote_conflict') {
      const sizeMismatch = String(remote.reason || '').includes('byte size');
      results.push({
        targetId: action.targetId,
        audioId: action.audioId,
        publicUrl: action.publicUrl,
        ok: false,
        status: 'url-verify-failed',
        action: sizeMismatch ? 'url_size_mismatch' : 'url_conflict',
        reason: remote.reason,
        networkCalled: true,
        remoteHttpStatus: remote.remoteHttpStatus,
        expectedByteSize: action.byteSize,
        remoteByteSize: remote.remoteByteSize,
      });
      continue;
    }

    results.push({
      targetId: action.targetId,
      audioId: action.audioId,
      publicUrl: action.publicUrl,
      ok: false,
      status: 'url-verify-failed',
      action: remote.action || 'url_probe_failed',
      reason: remote.reason || 'url verify failed',
      networkCalled: true,
      remoteHttpStatus: remote.remoteHttpStatus,
      expectedByteSize: action.byteSize,
    });
  }

  return {
    results,
    networkCalls,
    okCount: results.filter((item) => item.ok).length,
    failCount: results.filter((item) => !item.ok).length,
  };
}

/**
 * Stage book-unit manifest shards under stagingRoot only.
 * Never writes repository audio/manifests or audio/audio-manifest.json.
 */
export function stageBookManifestShards(candidates, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-publish'),
    'stagingRoot',
  );

  const byLocaleBook = new Map();
  for (const candidate of candidates || []) {
    if (!candidate?.manifestEntry) continue;
    const key = `${candidate.locale}::${candidate.bookId}`;
    if (!byLocaleBook.has(key)) {
      byLocaleBook.set(key, {
        locale: candidate.locale,
        bookId: candidate.bookId,
        entries: [],
      });
    }
    byLocaleBook.get(key).entries.push(candidate);
  }

  const shards = [];
  for (const group of byLocaleBook.values()) {
    const relativePath = buildBookManifestRelativePath(
      group.locale,
      group.bookId,
    );
    const audios = {};
    // Deterministic key order by audioId.
    const sorted = group.entries
      .slice()
      .sort((a, b) => String(a.audioId).localeCompare(String(b.audioId)));
    for (const item of sorted) {
      if (audios[item.audioId]) {
        throw new Error(`duplicate manifest audio id: ${item.audioId}`);
      }
      audios[item.audioId] = item.manifestEntry;
    }

    const document = {
      schemaVersion: 1,
      locale: group.locale,
      bookId: group.bookId,
      relativePath,
      publicBaseUrl: PUBLIC_BASE_URL,
      entryCount: Object.keys(audios).length,
      audios,
    };

    const dup = inspectManifestDuplicates(document);
    if (!dup.ok) {
      throw new Error(dup.reason || 'manifest shard duplicate detected');
    }

    const absolutePath = path.join(stagingRoot, relativePath);
    const stablePayload = serializeManifest(document);
    const contentSha256 = sha256Text(stablePayload);

    const documentWithMeta = {
      ...document,
      generatedAt: options.generatedAt || new Date().toISOString(),
      contentSha256,
    };
    const payload = serializeManifest(documentWithMeta);
    fsMkdirSync(path.dirname(absolutePath), { recursive: true });
    fsWriteFileSync(absolutePath, payload, 'utf8');

    shards.push({
      locale: group.locale,
      bookId: group.bookId,
      relativePath,
      absolutePath,
      entryCount: document.entryCount,
      sha256: contentSha256,
      document: documentWithMeta,
    });
  }

  shards.sort((a, b) =>
    `${a.locale}/${a.bookId}`.localeCompare(`${b.locale}/${b.bookId}`),
  );

  return {
    stagingRoot,
    shards,
    countsByLocale: Object.fromEntries(
      shards.map((shard) => [shard.locale, shard.entryCount]),
    ),
    opsManifestWrites: 0,
  };
}

export function computePublishPlanHash({ uploadPlan, shards } = {}) {
  const normalized = {
    candidates: (uploadPlan?.candidates || []).map((item) => ({
      audioId: item.audioId,
      r2Key: item.r2Key,
      publicUrl: item.publicUrl,
      byteSize: item.byteSize,
      duration: item.duration,
      sha256: item.sha256,
      voicePreset: item.voicePreset,
    })),
    shards: (shards || []).map((shard) => ({
      locale: shard.locale,
      bookId: shard.bookId,
      relativePath: shard.relativePath,
      entryCount: shard.entryCount,
      sha256: shard.sha256,
      audioIds: Object.keys(shard.document?.audios || {}).sort(),
    })),
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export function assertOpsManifestUntouched(repoRoot, beforeSnapshot = null) {
  const manifestPath = path.join(repoRoot, 'audio/audio-manifest.json');
  const exists = fsExistsSync(manifestPath);
  if (!beforeSnapshot) {
    return {
      ok: true,
      path: 'audio/audio-manifest.json',
      exists,
    };
  }
  if (beforeSnapshot.exists !== exists) {
    return {
      ok: false,
      reason: 'ops manifest existence changed',
    };
  }
  if (!exists) return { ok: true };
  const current = fsReadFileSync(manifestPath);
  const sha = crypto.createHash('sha256').update(current).digest('hex');
  if (beforeSnapshot.sha256 && beforeSnapshot.sha256 !== sha) {
    return {
      ok: false,
      reason: 'ops audio/audio-manifest.json changed',
      before: beforeSnapshot.sha256,
      after: sha,
    };
  }
  return { ok: true, sha256: sha };
}

export function snapshotOpsManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, 'audio/audio-manifest.json');
  if (!fsExistsSync(manifestPath)) {
    return { exists: false, sha256: null, mtimeMs: null };
  }
  const buf = fsReadFileSync(manifestPath);
  const st = fs.statSync(manifestPath);
  return {
    exists: true,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    size: buf.length,
    mtimeMs: st.mtimeMs,
  };
}

export function createMockRemoteInspector(options = {}) {
  const {
    mode = 'missing', // missing | match | conflict-size | conflict-hash | status
    status = 200,
    remoteByteSize = null,
    remoteSha256 = null,
  } = options;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async inspect(args = {}) {
      calls += 1;
      if (mode === 'missing') {
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
      if (mode === 'match') {
        return {
          ok: true,
          action: 'skip_existing_verified',
          reason: 'remote object matches local MP3 byte-for-byte',
          remoteHttpStatus: 200,
          remoteByteSize: args.localByteSize,
          remoteSha256: args.localSha256,
          remoteDuration: args.localDuration,
        };
      }
      if (mode === 'conflict-size') {
        return {
          ok: false,
          action: 'block_remote_conflict',
          reason: `remote byte size ${remoteByteSize ?? args.localByteSize + 1} !== local ${args.localByteSize}`,
          remoteHttpStatus: 200,
          remoteByteSize: remoteByteSize ?? args.localByteSize + 1,
          remoteSha256: remoteSha256 || 'deadbeef',
          remoteDuration: args.localDuration,
        };
      }
      if (mode === 'conflict-hash') {
        return {
          ok: false,
          action: 'block_remote_conflict',
          reason: 'remote SHA-256 differs from local',
          remoteHttpStatus: 200,
          remoteByteSize: args.localByteSize,
          remoteSha256: remoteSha256 || 'deadbeef',
          remoteDuration: args.localDuration,
        };
      }
      return {
        ok: false,
        action: 'block_remote_probe_failed',
        reason: `unexpected remote HTTP status: ${status}`,
        remoteHttpStatus: status,
      };
    },
  };
}

export {
  classifyAudioEligibleTargets,
  inspectRemoteObjectCore,
  PUBLIC_BASE_URL,
  R2_BUCKET,
};
