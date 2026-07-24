/**
 * Apply approved PASS publish artifacts into repository ops paths and
 * build merged book-unit manifest shards.
 *
 * Never writes MP3 into the repository.
 * Never modifies audio/audio-manifest.json.
 * Never creates SOURCE_REVIEW_REQUIRED artifacts.
 */

import fs from 'fs';
import path from 'path';
import {
  buildCanonicalManifestEntry,
  inspectManifestDuplicates,
  serializeManifest,
} from './commentary-multilang-manifest.mjs';
import {
  buildBookManifestRelativePath,
  buildUploadPlan,
  classifyPublishEligibleTargets,
} from './commentary-multilang-publish-stage.mjs';
import { PUBLIC_BASE_URL } from './commentary-multilang-upload.mjs';
import {
  formatMetadataJson,
  sha256Text,
} from './commentary-multilang-translation.mjs';
import { sha256Bytes } from './commentary-multilang-audio.mjs';
import { ROOT } from './commentary-multilang-targets.mjs';
import { buildAudioCueStagingTarget } from './commentary-multilang-audio-cue-stage.mjs';
import {
  requireMultilangStageApproval,
  resolveAudioApproved,
} from './commentary-multilang-quality-policy.mjs';

const OPS_META_KEYS = Object.freeze([
  'sourcePath',
  'sourceHashAlgorithm',
  'sourceHash',
  'sourceLocale',
  'targetLocale',
  'status',
  'translatedAt',
  'reviewedAt',
  'approvedAt',
  'bookId',
  'chapter',
  'verse',
  'type',
  'paragraphCount',
  'cardCount',
  'narrationHashAlgorithm',
  'narrationHash',
  'model',
  'humanReviewRequired',
  'structureValidated',
  'sourceStructure',
  'narrationStructure',
  // Honest batch-sample approval marker (optional; ignored by strict validators).
  'approvalPolicy',
]);

const PRESERVE_VERSE_MAX = 10;

function hashJson(value) {
  return sha256Text(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.publish-tmp-${process.pid}`;
  const payload =
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, filePath);
}

function parseVerseKey(verseKey) {
  // 창세기_1_11
  const match = String(verseKey || '').match(/_(\d+)_(\d+)$/);
  if (!match) return null;
  return { chapter: Number(match[1]), verse: Number(match[2]) };
}

/**
 * Snapshot 1:1–1:10 card verse hashes + related ops files for immutability checks.
 */
export function snapshotPreservedOpsRange(repoRoot = ROOT, options = {}) {
  const maxVerse = options.maxVerse || PRESERVE_VERSE_MAX;
  const out = {
    cards: {},
    narration: {},
    cues: {},
    singleManifest: null,
  };

  for (const locale of ['en-US', 'ja-JP']) {
    const cardsPath = path.join(
      repoRoot,
      'data/commentary-cards',
      locale,
      'genesis.json',
    );
    if (!fs.existsSync(cardsPath)) continue;
    const doc = readJson(cardsPath);
    const verseHashes = {};
    for (const [verseKey, entry] of Object.entries(doc.verses || {})) {
      const parsed = parseVerseKey(verseKey);
      if (!parsed || parsed.chapter !== 1 || parsed.verse > maxVerse) continue;
      verseHashes[verseKey] = hashJson(entry);
    }
    out.cards[locale] = {
      path: path.relative(repoRoot, cardsPath),
      fileSha256: sha256Bytes(fs.readFileSync(cardsPath)),
      verseHashes,
    };
  }

  for (const locale of ['en-US', 'ja-JP']) {
    for (let verse = 1; verse <= maxVerse; verse += 1) {
      const vv = String(verse).padStart(3, '0');
      const baseTxt = path.join(
        repoRoot,
        'tts-scripts',
        locale,
        'genesis',
        '001',
        vv,
      );
      const baseCue = path.join(
        repoRoot,
        'audio/cues',
        locale,
        'genesis',
        '001',
        vv,
      );
      if (fs.existsSync(baseTxt)) {
        for (const name of fs.readdirSync(baseTxt)) {
          const abs = path.join(baseTxt, name);
          if (!fs.statSync(abs).isFile()) continue;
          const rel = path.relative(repoRoot, abs);
          out.narration[rel] = sha256Bytes(fs.readFileSync(abs));
        }
      }
      if (fs.existsSync(baseCue)) {
        for (const name of fs.readdirSync(baseCue)) {
          const abs = path.join(baseCue, name);
          if (!fs.statSync(abs).isFile()) continue;
          const rel = path.relative(repoRoot, abs);
          out.cues[rel] = sha256Bytes(fs.readFileSync(abs));
        }
      }
    }
  }

  const manifestPath = path.join(repoRoot, 'audio/audio-manifest.json');
  if (fs.existsSync(manifestPath)) {
    out.singleManifest = {
      path: 'audio/audio-manifest.json',
      sha256: sha256Bytes(fs.readFileSync(manifestPath)),
    };
  }

  return out;
}

export function assertPreservedOpsUnchanged(before, repoRoot = ROOT) {
  const after = snapshotPreservedOpsRange(repoRoot);
  const conflicts = [];

  for (const locale of Object.keys(before.cards || {})) {
    const b = before.cards[locale];
    const a = after.cards[locale];
    if (!a) {
      conflicts.push({ kind: 'cards-missing', locale });
      continue;
    }
    for (const [verseKey, hash] of Object.entries(b.verseHashes || {})) {
      if (a.verseHashes[verseKey] !== hash) {
        conflicts.push({ kind: 'cards-verse', locale, verseKey });
      }
    }
  }

  for (const [rel, hash] of Object.entries(before.narration || {})) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      conflicts.push({ kind: 'narration-missing', path: rel });
      continue;
    }
    if (sha256Bytes(fs.readFileSync(abs)) !== hash) {
      conflicts.push({ kind: 'narration-changed', path: rel });
    }
  }

  for (const [rel, hash] of Object.entries(before.cues || {})) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      conflicts.push({ kind: 'cue-missing', path: rel });
      continue;
    }
    if (sha256Bytes(fs.readFileSync(abs)) !== hash) {
      conflicts.push({ kind: 'cue-changed', path: rel });
    }
  }

  if (before.singleManifest?.sha256) {
    const abs = path.join(repoRoot, 'audio/audio-manifest.json');
    const now = sha256Bytes(fs.readFileSync(abs));
    if (now !== before.singleManifest.sha256) {
      conflicts.push({ kind: 'single-manifest-changed' });
    }
  }

  return { ok: conflicts.length === 0, conflicts, after };
}

/**
 * Promote staged approved-candidate meta into ops-compatible approved meta.
 */
export function promoteMetaToApproved(candidateMeta, options = {}) {
  const approvedAt =
    options.approvedAt ||
    candidateMeta.approvedAt ||
    candidateMeta.reviewedAt ||
    candidateMeta.candidateAt ||
    new Date().toISOString();
  const out = {};
  for (const key of OPS_META_KEYS) {
    if (key === 'status') {
      out.status = 'approved';
      continue;
    }
    if (key === 'approvedAt' || key === 'reviewedAt') {
      out[key] = approvedAt;
      continue;
    }
    if (key === 'humanReviewRequired') {
      out.humanReviewRequired = false;
      continue;
    }
    if (key === 'approvalPolicy') {
      out.approvalPolicy =
        candidateMeta.approvalPolicy ||
        options.approvalPolicy ||
        'sample-approved-batch';
      continue;
    }
    if (candidateMeta[key] !== undefined) {
      out[key] = candidateMeta[key];
    }
  }
  return out;
}

/**
 * Merge staged EN/JA card documents into ops cards without touching 1:1–1:10.
 */
export function mergeStagedCardsIntoOps(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const stagedCardsRoot = options.stagedCardsRoot;
  const maxPreserveVerse = options.maxPreserveVerse || PRESERVE_VERSE_MAX;
  const bookId = options.bookId || 'genesis';
  const written = [];
  const conflicts = [];

  for (const locale of options.locales || ['en-US', 'ja-JP']) {
    const stagedPath = path.join(
      stagedCardsRoot,
      'data/commentary-cards',
      locale,
      `${bookId}.json`,
    );
    const opsPath = path.join(
      repoRoot,
      'data/commentary-cards',
      locale,
      `${bookId}.json`,
    );
    if (!fs.existsSync(stagedPath)) {
      throw new Error(`missing staged cards: ${stagedPath}`);
    }
    if (!fs.existsSync(opsPath)) {
      throw new Error(`missing ops cards: ${opsPath}`);
    }

    const staged = readJson(stagedPath);
    const ops = readJson(opsPath);
    const priorKeys = Object.keys(ops.verses || {});
    const beforeVerseHashes = {};
    for (const [verseKey, entry] of Object.entries(ops.verses || {})) {
      const parsed = parseVerseKey(verseKey);
      if (
        parsed &&
        parsed.chapter === 1 &&
        parsed.verse >= 1 &&
        parsed.verse <= maxPreserveVerse
      ) {
        beforeVerseHashes[verseKey] = hashJson(entry);
      }
    }

    for (const [verseKey, entry] of Object.entries(staged.verses || {})) {
      const parsed = parseVerseKey(verseKey);
      if (!parsed) {
        conflicts.push({ locale, verseKey, reason: 'unparseable_verse_key' });
        continue;
      }
      if (parsed.chapter === 1 && parsed.verse <= maxPreserveVerse) {
        conflicts.push({
          locale,
          verseKey,
          reason: 'staged_overlaps_preserved_range',
        });
        continue;
      }
      if (ops.verses?.[verseKey]) {
        const existingHash = hashJson(ops.verses[verseKey]);
        const incomingHash = hashJson(entry);
        if (existingHash !== incomingHash) {
          conflicts.push({
            locale,
            verseKey,
            reason: 'ops_verse_already_exists_with_different_content',
          });
          continue;
        }
        // identical — skip rewrite
        continue;
      }
      ops.verses[verseKey] = entry;
    }

    if (conflicts.length) {
      return { ok: false, conflicts, written };
    }

    // Preserve 1:1-10 hashes after merge.
    for (const [verseKey, hash] of Object.entries(beforeVerseHashes)) {
      if (hashJson(ops.verses[verseKey]) !== hash) {
        conflicts.push({
          locale,
          verseKey,
          reason: 'preserved_verse_mutated_during_merge',
        });
      }
    }
    if (conflicts.length) {
      return { ok: false, conflicts, written };
    }

    // Keep existing verse order; append newly added keys in verse order.
    const allKeys = Object.keys(ops.verses);
    const newKeys = allKeys
      .filter((key) => !priorKeys.includes(key))
      .sort((a, b) => {
        const pa = parseVerseKey(a);
        const pb = parseVerseKey(b);
        if (!pa || !pb) return a.localeCompare(b);
        return pa.chapter - pb.chapter || pa.verse - pb.verse || a.localeCompare(b);
      });
    const orderedVerses = {};
    for (const key of [...priorKeys, ...newKeys]) {
      if (ops.verses[key]) orderedVerses[key] = ops.verses[key];
    }
    for (const key of allKeys) {
      if (!orderedVerses[key]) orderedVerses[key] = ops.verses[key];
    }
    ops.verses = orderedVerses;
    ops.scope = options.scope || ops.scope || `${bookId}-1-1-31-en-ja`;
    ops.note =
      options.note ||
      'Published multilingual commentary cards. Genesis 1:1-1:10 preserved; 1:11-1:31 PASS merged.';

    writeJsonAtomic(opsPath, ops);
    written.push({
      locale,
      path: path.relative(repoRoot, opsPath),
      verseCount: Object.keys(ops.verses).length,
      added: newKeys.length,
    });
  }

  return { ok: true, conflicts: [], written };
}

/**
 * Copy PASS narration TXT + promoted meta and Cue JSON into ops.
 * Skips SOURCE_REVIEW targets. Never writes MP3.
 */
export function applyNarrationAndCuesToOps(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const jobs = options.jobs || [];
  const narrationStagingRoot = options.narrationStagingRoot;
  const audioStagingRoot = options.audioStagingRoot;
  const approvedAt = options.approvedAt || new Date().toISOString();
  const approvalPolicy =
    options.approvalPolicy || 'sample-approved-batch-pass368';

  const written = {
    txt: 0,
    meta: 0,
    cue: 0,
    skippedExisting: 0,
    paths: [],
  };
  const blocked = [];

  for (const job of jobs) {
    if (job.chapter === 1 && job.verse >= 1 && job.verse <= PRESERVE_VERSE_MAX) {
      blocked.push({
        targetId: job.targetId,
        reason: 'refusing_write_into_preserved_1_1_10',
      });
      continue;
    }

    const stagedNarration = buildAudioCueStagingTarget(job, {
      stagingRoot: narrationStagingRoot,
    });
    const stagedAudio = buildAudioCueStagingTarget(job, {
      stagingRoot: audioStagingRoot,
    });

    const opsTxt = path.join(repoRoot, stagedNarration.narrationPath);
    const opsMeta = path.join(repoRoot, stagedNarration.metaPath);
    const opsCue = path.join(repoRoot, stagedAudio.cuePath);

    if (!fs.existsSync(stagedNarration.narrationAbs)) {
      blocked.push({
        targetId: job.targetId,
        reason: `missing staged txt: ${stagedNarration.narrationAbs}`,
      });
      continue;
    }
    if (!fs.existsSync(stagedNarration.metaAbs)) {
      blocked.push({
        targetId: job.targetId,
        reason: `missing staged meta: ${stagedNarration.metaAbs}`,
      });
      continue;
    }
    if (!fs.existsSync(stagedAudio.cueAbs)) {
      blocked.push({
        targetId: job.targetId,
        reason: `missing staged cue: ${stagedAudio.cueAbs}`,
      });
      continue;
    }

    // Refuse overwrite of existing ops artifacts unless byte-identical.
    const txtBytes = fs.readFileSync(stagedNarration.narrationAbs);
    if (fs.existsSync(opsTxt)) {
      const existing = fs.readFileSync(opsTxt);
      if (sha256Bytes(existing) !== sha256Bytes(txtBytes)) {
        blocked.push({
          targetId: job.targetId,
          reason: 'ops_txt_conflict',
          path: stagedNarration.narrationPath,
        });
        continue;
      }
      written.skippedExisting += 1;
    } else {
      fs.mkdirSync(path.dirname(opsTxt), { recursive: true });
      const tmp = `${opsTxt}.publish-tmp`;
      fs.writeFileSync(tmp, txtBytes);
      fs.renameSync(tmp, opsTxt);
      written.txt += 1;
      written.paths.push(stagedNarration.narrationPath);
    }

    const candidateMeta = readJson(stagedNarration.metaAbs);
    const promoted = promoteMetaToApproved(candidateMeta, {
      approvedAt,
      approvalPolicy,
    });
    const metaPayload = formatMetadataJson(promoted);
    if (fs.existsSync(opsMeta)) {
      const existing = fs.readFileSync(opsMeta, 'utf8');
      if (sha256Text(existing) !== sha256Text(metaPayload)) {
        // Allow identical content ignoring key order by comparing promoted fields.
        let existingJson;
        try {
          existingJson = JSON.parse(existing);
        } catch {
          blocked.push({
            targetId: job.targetId,
            reason: 'ops_meta_unreadable',
            path: stagedNarration.metaPath,
          });
          continue;
        }
        if (
          existingJson.status === 'approved' &&
          existingJson.sourceHash === promoted.sourceHash &&
          existingJson.narrationHash === promoted.narrationHash
        ) {
          written.skippedExisting += 1;
        } else {
          blocked.push({
            targetId: job.targetId,
            reason: 'ops_meta_conflict',
            path: stagedNarration.metaPath,
          });
          continue;
        }
      } else {
        written.skippedExisting += 1;
      }
    } else {
      fs.mkdirSync(path.dirname(opsMeta), { recursive: true });
      const tmp = `${opsMeta}.publish-tmp`;
      fs.writeFileSync(tmp, metaPayload, 'utf8');
      fs.renameSync(tmp, opsMeta);
      written.meta += 1;
      written.paths.push(stagedNarration.metaPath);
    }

    const cueBytes = fs.readFileSync(stagedAudio.cueAbs);
    if (fs.existsSync(opsCue)) {
      const existing = fs.readFileSync(opsCue);
      if (sha256Bytes(existing) !== sha256Bytes(cueBytes)) {
        blocked.push({
          targetId: job.targetId,
          reason: 'ops_cue_conflict',
          path: stagedAudio.cuePath,
        });
        continue;
      }
      written.skippedExisting += 1;
    } else {
      fs.mkdirSync(path.dirname(opsCue), { recursive: true });
      const tmp = `${opsCue}.publish-tmp`;
      fs.writeFileSync(tmp, cueBytes);
      fs.renameSync(tmp, opsCue);
      written.cue += 1;
      written.paths.push(stagedAudio.cuePath);
    }
  }

  return {
    ok: blocked.length === 0,
    blocked,
    written,
  };
}

/**
 * Collect existing published 1:1–1:10 EN/JA entries from the single ops manifest.
 */
export function collectExistingBookManifestEntries(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const bookId = options.bookId || 'genesis';
  const maxVerse = options.maxVerse || PRESERVE_VERSE_MAX;
  const locales = options.locales || ['en-US', 'ja-JP'];
  const manifestPath = path.join(repoRoot, 'audio/audio-manifest.json');
  const doc = readJson(manifestPath);
  const audios = doc.audios || {};
  const byLocale = Object.fromEntries(locales.map((locale) => [locale, {}]));

  for (const [id, entry] of Object.entries(audios)) {
    const locale = entry.language || entry.locale;
    if (!locales.includes(locale)) continue;
    if (String(entry.bookId || '').toLowerCase() !== bookId) continue;
    if (Number(entry.chapter) !== 1) continue;
    if (Number(entry.verse) < 1 || Number(entry.verse) > maxVerse) continue;
    if (!id.endsWith(`.${locale}`)) continue;
    byLocale[locale][id] = entry;
  }

  return byLocale;
}

/**
 * Build merged book shards: preserved 1:1–1:10 + new PASS candidates.
 * Writes under outputRoot (ops or /tmp). Never touches audio/audio-manifest.json.
 */
export function writeMergedBookManifestShards(options = {}) {
  if (options.requireAudioApproval) {
    requireMultilangStageApproval('r2', {
      audioApproved: resolveAudioApproved({
        audioApproved: options.audioApproved,
      }),
    });
  }
  const repoRoot = options.repoRoot || ROOT;
  const outputRoot = options.outputRoot || repoRoot;
  const bookId = options.bookId || 'genesis';
  const candidates = options.candidates || [];
  const existingByLocale = collectExistingBookManifestEntries({
    repoRoot,
    bookId,
    maxVerse: options.maxPreserveVerse || PRESERVE_VERSE_MAX,
  });

  const locales = options.locales || ['en-US', 'ja-JP'];
  const shards = [];

  for (const locale of locales) {
    const audios = { ...(existingByLocale[locale] || {}) };
    const existingCount = Object.keys(audios).length;

    for (const candidate of candidates.filter((item) => item.locale === locale)) {
      const id = candidate.audioId || candidate.manifestId;
      if (!id) throw new Error(`candidate missing audioId: ${candidate.targetId}`);
      if (audios[id]) {
        throw new Error(`duplicate manifest audio id while merging: ${id}`);
      }
      audios[id] =
        candidate.manifestEntry ||
        buildCanonicalManifestEntry({
          locale: candidate.locale,
          bookId: candidate.bookId,
          chapter: candidate.chapter,
          verse: candidate.verse,
          type: candidate.type,
          voicePreset: candidate.voicePreset,
          durationSeconds: candidate.duration,
          fileSize: candidate.byteSize,
        });
    }

    // Stable key order.
    const ordered = {};
    for (const id of Object.keys(audios).sort()) {
      ordered[id] = audios[id];
    }

    const relativePath = buildBookManifestRelativePath(locale, bookId);
    const document = {
      schemaVersion: 1,
      locale,
      bookId,
      relativePath,
      publicBaseUrl: PUBLIC_BASE_URL,
      entryCount: Object.keys(ordered).length,
      audios: ordered,
    };

    const dup = inspectManifestDuplicates(document);
    if (!dup.ok) {
      throw new Error(dup.reason || 'merged shard duplicate detected');
    }

    const stablePayload = serializeManifest(document);
    const contentSha256 = sha256Text(stablePayload);
    const documentWithMeta = {
      ...document,
      generatedAt: options.generatedAt || new Date().toISOString(),
      contentSha256,
    };
    const absolutePath = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(
      absolutePath,
      serializeManifest(documentWithMeta),
      'utf8',
    );

    shards.push({
      locale,
      bookId,
      relativePath,
      absolutePath,
      entryCount: document.entryCount,
      existingCount,
      newCount: document.entryCount - existingCount,
      sha256: contentSha256,
      document: documentWithMeta,
    });
  }

  return {
    shards,
    countsByLocale: Object.fromEntries(
      shards.map((shard) => [shard.locale, shard.entryCount]),
    ),
    opsSingleManifestWrites: 0,
  };
}

/**
 * Execute real R2 uploads for planned candidates with concurrency, skip-on-match,
 * conflict abort, and checkpoint-friendly results.
 */
export async function executeRealR2Uploads(candidates, options = {}) {
  const {
    remoteInspector,
    wranglerRunner,
    concurrency = 3,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onItem,
    audioApproved,
  } = options;

  requireMultilangStageApproval('r2', {
    audioApproved: resolveAudioApproved({ audioApproved }),
  });

  if (typeof remoteInspector !== 'function') {
    throw new Error('remoteInspector is required');
  }
  if (typeof wranglerRunner !== 'function') {
    throw new Error('wranglerRunner is required');
  }

  const results = [];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let conflicts = 0;
  let networkCalls = 0;

  const queue = [...(candidates || [])];
  const workers = Array.from(
    { length: Math.max(1, Number(concurrency) || 1) },
    async () => {
      while (queue.length) {
        const candidate = queue.shift();
        if (!candidate) return;

        networkCalls += 1;
        const remote = await remoteInspector({
          publicUrl: candidate.publicUrl,
          localByteSize: candidate.byteSize,
          localSha256: candidate.sha256,
          localDuration: candidate.duration,
        });

        if (remote.action === 'skip_existing_verified') {
          skipped += 1;
          const item = {
            ok: true,
            targetId: candidate.targetId,
            audioId: candidate.audioId,
            uploadAction: 'skip_existing_verified',
            status: 'upload-skipped-existing',
            uploaded: false,
            reason: remote.reason,
            publicUrl: candidate.publicUrl,
            byteSize: candidate.byteSize,
            duration: candidate.duration,
            sha256: candidate.sha256,
            r2Key: candidate.r2Key,
          };
        results.push(item);
        if (onItem) {
          try {
            onItem(item);
          } catch (error) {
            item.checkpointError = error.message;
          }
        }
        continue;
      }

      if (remote.action === 'block_remote_conflict') {
        conflicts += 1;
        failed += 1;
        const item = {
          ok: false,
          targetId: candidate.targetId,
          audioId: candidate.audioId,
          uploadAction: 'block_remote_conflict',
          status: 'upload-conflict',
          uploaded: false,
          reason: remote.reason,
          publicUrl: candidate.publicUrl,
          r2Key: candidate.r2Key,
        };
        results.push(item);
        if (onItem) {
          try {
            onItem(item);
          } catch (error) {
            item.checkpointError = error.message;
          }
        }
        // Stop scheduling more work by clearing queue.
        queue.length = 0;
        continue;
      }

      if (remote.action !== 'planned_upload') {
        failed += 1;
        const item = {
          ok: false,
          targetId: candidate.targetId,
          audioId: candidate.audioId,
          uploadAction: remote.action || 'block_remote_probe_failed',
          status: 'upload-failed',
          uploaded: false,
          reason: remote.reason || 'remote probe failed',
          publicUrl: candidate.publicUrl,
          r2Key: candidate.r2Key,
        };
        results.push(item);
        if (onItem) {
          try {
            onItem(item);
          } catch (error) {
            item.checkpointError = error.message;
          }
        }
        continue;
      }

      try {
        wranglerRunner({
          r2Key: candidate.r2Key,
          absoluteLocalPath: candidate.audioAbs,
        });
        // brief settle then verify
        await sleep(250);
        networkCalls += 1;
        const verified = await remoteInspector({
          publicUrl: candidate.publicUrl,
          localByteSize: candidate.byteSize,
          localSha256: candidate.sha256,
          localDuration: candidate.duration,
        });
        if (verified.action !== 'skip_existing_verified') {
          failed += 1;
          const item = {
            ok: false,
            targetId: candidate.targetId,
            audioId: candidate.audioId,
            uploadAction: 'upload_verify_failed',
            status: 'upload-verify-failed',
            uploaded: true,
            reason: verified.reason || 'post-upload verify failed',
            publicUrl: candidate.publicUrl,
            r2Key: candidate.r2Key,
          };
          results.push(item);
          if (onItem) {
            try {
              onItem(item);
            } catch (error) {
              item.checkpointError = error.message;
            }
          }
          continue;
        }
        uploaded += 1;
        const item = {
          ok: true,
          targetId: candidate.targetId,
          audioId: candidate.audioId,
          uploadAction: 'uploaded_verified',
          status: 'upload-complete',
          uploaded: true,
          reason: 'wrangler put + remote byte match',
          publicUrl: candidate.publicUrl,
          byteSize: candidate.byteSize,
          duration: candidate.duration,
          sha256: candidate.sha256,
          r2Key: candidate.r2Key,
        };
        results.push(item);
        if (onItem) {
          try {
            onItem(item);
          } catch (error) {
            item.checkpointError = error.message;
          }
        }
      } catch (error) {
        failed += 1;
        const item = {
          ok: false,
          targetId: candidate.targetId,
          audioId: candidate.audioId,
          uploadAction: 'upload_failed',
          status: 'upload-failed',
          uploaded: false,
          reason: error.message,
          publicUrl: candidate.publicUrl,
          r2Key: candidate.r2Key,
        };
        results.push(item);
        if (onItem) {
          try {
            onItem(item);
          } catch (checkpointError) {
            item.checkpointError = checkpointError.message;
          }
        }
      }
      }
    },
  );

  await Promise.all(workers);

  return {
    results,
    uploaded,
    skipped,
    failed,
    conflicts,
    networkCalls,
    ok: failed === 0 && conflicts === 0,
  };
}

export function buildPassPublishPlan(jobs, results, audioStagingRoot) {
  const classified = classifyPublishEligibleTargets(jobs, results);
  const uploadPlan = buildUploadPlan(
    classified.eligible.map((item) => item.job),
    { stagingRoot: audioStagingRoot },
  );
  return { classified, uploadPlan };
}
