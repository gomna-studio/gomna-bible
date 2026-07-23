#!/usr/bin/env node
/**
 * Multilingual commentary pipeline.
 *
 * Planning mode (default): --dry-run only.
 * Narration stage: --stage narration --dry-run| --write
 * Audio stage: --stage audio --dry-run| --write
 * Cue stage: --stage cue --dry-run| --write
 * Upload stage: --stage upload --dry-run| --write
 * Manifest stage: --stage manifest --dry-run| --write
 */

import fs from 'fs';
import path from 'path';
import {
  atomicCreateMp3,
  createEmptyAudioCounters,
  requestCommentaryMp3,
  validateApprovedNarrationTarget,
  validateMp3File,
} from './lib/commentary-multilang-audio.mjs';
import {
  atomicCreateCueFile,
  createEmptyCueCounters,
  validateCueTargetInputs,
} from './lib/commentary-multilang-cue.mjs';
import {
  GLOBAL_MANIFEST_LOCK_PATH,
  REQUIRED_MANIFEST_FLAG,
  acquireManifestLock,
  buildManifestLockPath,
  classifyManifestTarget,
  createEmptyManifestCounters,
  createProductionManifestAdapters,
  isManifestTestMode,
  releaseManifestLock,
  writeManifestForTargets,
} from './lib/commentary-multilang-manifest.mjs';
import {
  buildCommentaryMultilangTargets,
  inventoryCommentarySource,
  ROOT,
} from './lib/commentary-multilang-targets.mjs';
import {
  DEFAULT_TRANSLATION_MODEL,
  atomicCreateDraftPair,
  buildKoreanSourcePath,
  buildNarrationStructureSignature,
  inspectKoreanSourceText,
  parseNarrationStructure,
  sha256Text,
  translateCommentaryNarration,
  validateTranslatedNarrationStructure,
} from './lib/commentary-multilang-translation.mjs';
import {
  GLOBAL_UPLOAD_LOCK_PATH,
  UPLOAD_WRITE_PROTECTIONS,
  acquireUploadLock,
  buildUploadLockPath,
  classifyUploadTarget,
  createEmptyUploadCounters,
  createProductionUploadAdapters,
  isUploadTestMode,
  releaseUploadLock,
  uploadOneTarget,
} from './lib/commentary-multilang-upload.mjs';

const ABSOLUTELY_FORBIDDEN = new Set([
  '--upload',
  '--manifest',
  '--publish',
  '--force',
  '--overwrite',
]);

const ACCEPTED_STAGES = new Set([
  'narration',
  'audio',
  'cue',
  'upload',
  'manifest',
]);

const REQUIRED_TRANSLATION_FLAG = '1';
const REQUIRED_ALLOWED_TARGET =
  'genesis:1:1-3:original-language:en-US,ja-JP';
const REQUIRED_REPAIR_ALLOWED_TARGET =
  'genesis:1:2-3:original-language:en-US';
const REQUIRED_REPAIR_FLAG = '1';
const REQUIRED_AUDIO_FLAG = '1';
const REQUIRED_CUE_FLAG = '1';
const REQUIRED_UPLOAD_FLAG = '1';

function printUsage() {
  return [
    'Usage (planning):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language --dry-run',
    '',
    'Usage (narration stage):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language \\',
    '    --stage narration --dry-run',
    '',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    ... --stage narration --write',
    '',
    'Usage (repair invalid drafts):',
    '  ... --stage narration --repair-invalid-drafts --dry-run',
    '  ... --stage narration --repair-invalid-drafts --write',
    '',
    'Usage (audio stage):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language \\',
    '    --stage audio --dry-run',
    '',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    ... --stage audio --write',
    '',
    'Usage (cue stage):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language \\',
    '    --stage cue --dry-run',
    '',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    ... --stage cue --write',
    '',
    'Usage (upload stage):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language \\',
    '    --stage upload --dry-run',
    '',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    ... --stage upload --write',
    '',
    'Usage (manifest stage):',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP --book genesis --chapter 1 \\',
    '    --from-verse 1 --to-verse 3 --type original-language \\',
    '    --stage manifest --dry-run',
    '',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    ... --stage manifest --write',
    '',
    'Notes:',
    '  Planning mode requires --dry-run and rejects --write.',
    '  Narration write requires --stage narration --write plus env guards.',
    '  Audio write requires --stage audio --write plus audio env guards.',
    '  Cue write requires --stage cue --write plus cue env guards.',
    '  Upload write requires --stage upload --write plus upload env guards.',
    '  Manifest write requires --stage manifest --write plus manifest env guards.',
    '  Accepted stages: narration, audio, cue, upload, manifest.',
    '  --upload/--manifest/--publish/--force/--overwrite are always rejected.',
    '  Optional: --json (planning mode).',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    locales: null,
    book: null,
    chapter: null,
    fromVerse: null,
    toVerse: null,
    type: null,
    types: null,
    dryRun: false,
    write: false,
    stage: null,
    repairInvalidDrafts: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (ABSOLUTELY_FORBIDDEN.has(token)) {
      throw new Error(`Forbidden flag: ${token}`);
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--write') {
      args.write = true;
      continue;
    }

    if (token === '--repair-invalid-drafts') {
      args.repairInvalidDrafts = true;
      continue;
    }

    if (token === '--json') {
      args.json = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    const takeValue = (label) => {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error(`Missing value for ${label}`);
      }
      i += 1;
      return value;
    };

    if (token === '--locales') {
      args.locales = takeValue('--locales');
      continue;
    }
    if (token === '--book') {
      args.book = takeValue('--book');
      continue;
    }
    if (token === '--chapter') {
      args.chapter = takeValue('--chapter');
      continue;
    }
    if (token === '--from-verse') {
      args.fromVerse = takeValue('--from-verse');
      continue;
    }
    if (token === '--to-verse') {
      args.toVerse = takeValue('--to-verse');
      continue;
    }
    if (token === '--type') {
      args.type = takeValue('--type');
      continue;
    }
    if (token === '--types') {
      args.types = takeValue('--types');
      continue;
    }
    if (token === '--stage') {
      args.stage = takeValue('--stage');
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function toAbsolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (!value || value.startsWith('#')) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getOpenAiApiKey() {
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, '.env.local'));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }
  return apiKey;
}

function classifyPlan(plan) {
  const complete = [];
  const approvedNarrations = [];
  const existingMp3 = [];
  const existingCue = [];
  const existingManifest = [];
  const missingNarrations = [];
  const missingMetaOrApproval = [];
  const missingMp3 = [];
  const missingCue = [];
  const missingManifest = [];
  const blockers = [];

  for (const target of plan.targets) {
    const narrationOk = target.narrationExists && target.metaApproved;
    const audioOk = target.audioExists;
    const cueOk = target.cueExists;
    const manifestOk = target.manifestExists && target.manifestPublished;

    if (target.metaError) {
      blockers.push(`${target.audioId}: ${target.metaError}`);
    }

    if (narrationOk) approvedNarrations.push(target);
    else {
      if (!target.narrationExists) missingNarrations.push(target);
      if (!target.metaExists || !target.metaApproved) {
        missingMetaOrApproval.push(target);
      }
    }

    if (audioOk) existingMp3.push(target);
    else missingMp3.push(target);

    if (cueOk) existingCue.push(target);
    else missingCue.push(target);

    if (manifestOk) existingManifest.push(target);
    else missingManifest.push(target);

    if (narrationOk && audioOk && cueOk && manifestOk) {
      complete.push(target);
    }
  }

  return {
    complete,
    approvedNarrations,
    existingMp3,
    existingCue,
    existingManifest,
    missingNarrations,
    missingMetaOrApproval,
    missingMp3,
    missingCue,
    missingManifest,
    blockers,
  };
}

function formatTargetLine(target) {
  const narration = target.narrationExists
    ? target.metaApproved
      ? 'narration=approved'
      : target.metaExists
        ? `narration=meta:${target.metaStatus || 'unapproved'}`
        : 'narration=txt-only'
    : 'narration=missing';

  const audio = target.audioExists ? 'audio=present' : 'audio=missing';
  const cue = target.cueExists ? 'cue=present' : 'cue=missing';
  const manifest = target.manifestExists
    ? target.manifestPublished
      ? 'manifest=published'
      : 'manifest=unpublished'
    : 'manifest=missing';

  return [
    `  - ${target.locale}`,
    `${target.bookId}/${target.chapter}/${target.verse}`,
    target.type,
    `cards=${target.cardCount}`,
    target.audioId,
    narration,
    audio,
    cue,
    manifest,
  ].join(' | ');
}

function printReadable(plan, summary, inventory) {
  const lines = [];

  lines.push('○ Request');
  lines.push(
    `  locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} types=${plan.types.join(',')}`,
  );
  lines.push('');

  lines.push('○ Validated range');
  lines.push(
    `  ${plan.bookName} ${plan.chapter}:${plan.fromVerse}-${plan.toVerse} (${plan.locales.length} locales)`,
  );
  lines.push('');

  lines.push('○ Commentary source count');
  lines.push(`  ${plan.sourceCount}`);
  lines.push('');

  lines.push('○ Locale target count');
  lines.push(`  ${plan.targetCount}`);
  lines.push('');

  lines.push('○ Complete targets');
  lines.push(`  ${summary.complete.length}`);
  for (const target of summary.complete) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Existing approved narrations');
  lines.push(`  ${summary.approvedNarrations.length}`);
  for (const target of summary.approvedNarrations) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Existing MP3 files');
  lines.push(`  ${summary.existingMp3.length}`);
  for (const target of summary.existingMp3) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Existing Cue files');
  lines.push(`  ${summary.existingCue.length}`);
  for (const target of summary.existingCue) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Existing manifest entries');
  lines.push(`  ${summary.existingManifest.length}`);
  for (const target of summary.existingManifest) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Missing narrations');
  lines.push(`  ${summary.missingNarrations.length}`);
  for (const target of summary.missingNarrations) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Missing metadata or approval');
  lines.push(`  ${summary.missingMetaOrApproval.length}`);
  for (const target of summary.missingMetaOrApproval) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Missing MP3 files');
  lines.push(`  ${summary.missingMp3.length}`);
  for (const target of summary.missingMp3) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Missing Cue files');
  lines.push(`  ${summary.missingCue.length}`);
  for (const target of summary.missingCue) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Missing manifest entries');
  lines.push(`  ${summary.missingManifest.length}`);
  for (const target of summary.missingManifest) {
    lines.push(formatTargetLine(target));
  }
  lines.push('');

  lines.push('○ Blockers');
  if (!summary.blockers.length) {
    lines.push('  none');
  } else {
    for (const blocker of summary.blockers) {
      lines.push(`  - ${blocker}`);
    }
  }
  lines.push('');

  lines.push('○ Repository inventory (read-only)');
  lines.push(`  booksLoaded=${inventory.booksLoadedCount}`);
  lines.push(
    `  uniqueVerseKeysWithAnyStructure=${inventory.uniqueVerseKeysWithAnyStructure}`,
  );
  lines.push(
    `  uniqueVerseKeysWithAtLeastOneType=${inventory.uniqueVerseKeysWithAtLeastOneType}`,
  );
  lines.push(
    `  totalCommentaryTypeRecords=${inventory.totalCommentaryTypeRecords}`,
  );
  lines.push(`  duplicateExactKeys=${inventory.duplicateExactKeys.length}`);
  lines.push(`  malformedKeys=${inventory.malformedKeys.length}`);
  if (inventory.booksFailed.length) {
    lines.push(
      `  booksFailed=${inventory.booksFailed.map((item) => item.bookId).join(',')}`,
    );
  }
  lines.push('');
  lines.push('○ Mode: dry-run only (no writes)');

  return lines.join('\n');
}

function buildJsonPayload(plan, summary, inventory) {
  return {
    mode: 'dry-run',
    request: {
      locales: plan.locales,
      bookId: plan.bookId,
      chapter: plan.chapter,
      fromVerse: plan.fromVerse,
      toVerse: plan.toVerse,
      types: plan.types,
    },
    validatedRange: {
      bookName: plan.bookName,
      chapter: plan.chapter,
      fromVerse: plan.fromVerse,
      toVerse: plan.toVerse,
    },
    commentarySourceCount: plan.sourceCount,
    localeTargetCount: plan.targetCount,
    targets: plan.targets,
    summary: {
      completeTargets: summary.complete.map((t) => t.audioId),
      existingApprovedNarrations: summary.approvedNarrations.map(
        (t) => t.audioId,
      ),
      existingMp3Files: summary.existingMp3.map((t) => t.audioId),
      existingCueFiles: summary.existingCue.map((t) => t.audioId),
      existingManifestEntries: summary.existingManifest.map((t) => t.audioId),
      missingNarrations: summary.missingNarrations.map((t) => t.audioId),
      missingMetadataOrApproval: summary.missingMetaOrApproval.map(
        (t) => t.audioId,
      ),
      missingMp3Files: summary.missingMp3.map((t) => t.audioId),
      missingCueFiles: summary.missingCue.map((t) => t.audioId),
      missingManifestEntries: summary.missingManifest.map((t) => t.audioId),
      blockers: summary.blockers,
    },
    inventory,
    writes: false,
  };
}

function readKoreanSource(bookId, chapter, verse, type) {
  const sourcePath = buildKoreanSourcePath(bookId, chapter, verse, type);
  const absolutePath = toAbsolute(sourcePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      sourcePath,
      errors: [`Korean source missing: ${sourcePath}`],
    };
  }

  const sourceBytes = fs.readFileSync(absolutePath);
  let text;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    text = decoder.decode(sourceBytes);
  } catch (error) {
    return {
      ok: false,
      sourcePath,
      errors: [`Korean source is not valid UTF-8: ${sourcePath}`],
    };
  }

  const inspection = inspectKoreanSourceText(text, {
    sourcePath,
    sourceBytes,
  });

  return {
    ...inspection,
    sourcePath,
    absolutePath,
    text,
  };
}

function readMetadataIfExists(metaPath) {
  const absolutePath = toAbsolute(metaPath);
  if (!fs.existsSync(absolutePath)) {
    return { exists: false, data: null, error: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return { exists: true, data, error: null };
  } catch (error) {
    return {
      exists: true,
      data: null,
      error: `malformed_metadata: ${error.message}`,
    };
  }
}

function classifyNarrationAction(target, koreanSource) {
  const narrationAbs = toAbsolute(target.narrationPath);
  const metaAbs = toAbsolute(target.metaPath);
  const narrationExists = fs.existsSync(narrationAbs);
  const meta = readMetadataIfExists(target.metaPath);

  if (meta.error) {
    return {
      action: 'unsafe',
      reason: meta.error,
      audioId: target.audioId,
    };
  }

  if (!narrationExists && !meta.exists) {
    return {
      action: 'planned_translation',
      reason: 'both target files absent',
      audioId: target.audioId,
    };
  }

  if (meta.exists && meta.data && meta.data.status === 'approved') {
    if (!narrationExists) {
      return {
        action: 'unsafe',
        reason: 'approved metadata exists but narration is missing',
        audioId: target.audioId,
      };
    }

    if (meta.data.sourceHash !== koreanSource.sourceSha256) {
      return {
        action: 'source_hash_changed',
        reason: `approved sourceHash=${meta.data.sourceHash} current=${koreanSource.sourceSha256}`,
        audioId: target.audioId,
      };
    }

    return {
      action: 'skip_approved',
      reason: 'approved narration and matching Korean source hash',
      audioId: target.audioId,
      sourceHash: meta.data.sourceHash,
    };
  }

  if (meta.exists && meta.data && meta.data.sourceHash !== koreanSource.sourceSha256) {
    return {
      action: 'source_hash_changed',
      reason: `stored sourceHash=${meta.data.sourceHash} current=${koreanSource.sourceSha256}`,
      audioId: target.audioId,
    };
  }

  return {
    action: 'existing_draft_requires_review',
    reason: narrationExists && meta.exists
      ? `existing draft status=${meta.data?.status || 'unknown'}`
      : narrationExists
        ? 'narration exists without approved metadata'
        : 'metadata exists without approved narration pair',
    audioId: target.audioId,
    status: meta.data?.status || null,
  };
}

function buildRequestedTargetString(args) {
  return `${args.book}:${args.chapter}:${args.fromVerse}-${args.toVerse}:${args.type}:${args.locales}`;
}

function assertNarrationWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_TRANSLATION;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = buildRequestedTargetString(args);

  if (flag !== REQUIRED_TRANSLATION_FLAG) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_TRANSLATION must be exactly "${REQUIRED_TRANSLATION_FLAG}" for --write`,
    );
  }

  if (args.repairInvalidDrafts) {
    const repairFlag = process.env.GOMNA_COMMENTARY_MULTILANG_REPAIR_INVALID_DRAFTS;
    if (repairFlag !== REQUIRED_REPAIR_FLAG) {
      throw new Error(
        `GOMNA_COMMENTARY_MULTILANG_REPAIR_INVALID_DRAFTS must be exactly "${REQUIRED_REPAIR_FLAG}"`,
      );
    }
    if (allowed !== REQUIRED_REPAIR_ALLOWED_TARGET) {
      throw new Error(
        `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${REQUIRED_REPAIR_ALLOWED_TARGET}" for repair`,
      );
    }
    if (expected !== REQUIRED_REPAIR_ALLOWED_TARGET) {
      throw new Error(
        `Request ${expected} is outside the allowed repair target ${REQUIRED_REPAIR_ALLOWED_TARGET}`,
      );
    }
    return;
  }

  if (allowed !== REQUIRED_ALLOWED_TARGET) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${REQUIRED_ALLOWED_TARGET}"`,
    );
  }

  if (expected !== REQUIRED_ALLOWED_TARGET) {
    throw new Error(
      `Request ${expected} is outside the allowed write target ${REQUIRED_ALLOWED_TARGET}`,
    );
  }
}

function assertAudioWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_AUDIO;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = buildRequestedTargetString(args);

  if (flag !== REQUIRED_AUDIO_FLAG) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_AUDIO must be exactly "${REQUIRED_AUDIO_FLAG}" for --write`,
    );
  }

  if (allowed !== expected) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${expected}"`,
    );
  }
}

function assertCueWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_CUE;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = buildRequestedTargetString(args);

  if (flag !== REQUIRED_CUE_FLAG) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_CUE must be exactly "${REQUIRED_CUE_FLAG}" for --write`,
    );
  }

  if (allowed !== expected) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${expected}"`,
    );
  }
}

function assertUploadWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_UPLOAD;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = buildRequestedTargetString(args);

  if (flag !== REQUIRED_UPLOAD_FLAG) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_UPLOAD must be exactly "${REQUIRED_UPLOAD_FLAG}" for --write`,
    );
  }

  if (allowed !== expected) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${expected}"`,
    );
  }
}

function assertManifestWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_MANIFEST;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = buildRequestedTargetString(args);

  if (flag !== REQUIRED_MANIFEST_FLAG) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_MANIFEST must be exactly "${REQUIRED_MANIFEST_FLAG}" for --write`,
    );
  }

  if (allowed !== expected) {
    throw new Error(
      `GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET must be exactly "${expected}"`,
    );
  }
}

function buildNarrationPreflight(plan) {
  const sourceCache = new Map();
  const actions = [];
  const blockers = [];
  const koreanSources = [];

  for (const target of plan.targets) {
    const cacheKey = `${target.bookId}:${target.chapter}:${target.verse}:${target.type}`;
    let koreanSource = sourceCache.get(cacheKey);
    if (!koreanSource) {
      koreanSource = readKoreanSource(
        target.bookId,
        target.chapter,
        target.verse,
        target.type,
      );
      sourceCache.set(cacheKey, koreanSource);
      koreanSources.push(koreanSource);
    }

    if (!koreanSource.ok) {
      blockers.push(
        `${target.audioId}: ${(koreanSource.errors || []).join('; ')}`,
      );
      actions.push({
        target,
        action: 'unsafe',
        reason: (koreanSource.errors || []).join('; '),
      });
      continue;
    }

    const classified = classifyNarrationAction(target, koreanSource);
    actions.push({
      target,
      koreanSource,
      ...classified,
    });

    if (
      classified.action === 'unsafe' ||
      classified.action === 'source_hash_changed'
    ) {
      blockers.push(`${classified.audioId}: ${classified.action} (${classified.reason})`);
    }

    if (classified.action === 'existing_draft_requires_review') {
      // Per-target stop: never overwrite drafts; other missing targets may still proceed.
      blockers.push(
        `${classified.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter((item) => item.action === 'planned_translation');
  const skipped = actions.filter((item) => item.action === 'skip_approved');
  const draftBlocked = actions.filter(
    (item) => item.action === 'existing_draft_requires_review',
  );
  const hardBlockers = actions.filter(
    (item) =>
      item.action === 'unsafe' || item.action === 'source_hash_changed',
  );

  return {
    actions,
    blockers,
    hardBlockers,
    draftBlocked,
    planned,
    skipped,
    koreanSources,
    apiTranslationsRequired: planned.length,
  };
}

function printKoreanSources(koreanSources) {
  const unique = [];
  const seen = new Set();
  for (const source of koreanSources) {
    if (!source.sourcePath || seen.has(source.sourcePath)) continue;
    seen.add(source.sourcePath);
    unique.push(source);
  }

  for (const source of unique) {
    console.log('○ Korean source');
    console.log(`  ${source.sourcePath}`);
    if (!source.ok) {
      for (const error of source.errors || []) {
        console.log(`  error: ${error}`);
      }
      continue;
    }
    console.log('○ Paragraph count');
    console.log(`  ${source.paragraphCount}`);
    console.log('○ Per-paragraph character count');
    source.paragraphCharCounts.forEach((count, index) => {
      console.log(`  ${index + 1}: ${count}`);
    });
    console.log('○ SHA-256');
    console.log(`  ${source.sourceSha256}`);
    console.log('');
  }
}

function printNarrationPlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=narration mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Narration actions');
  for (const item of preflight.actions) {
    console.log(
      `  - ${item.target.locale} | ${item.target.bookId}/${item.target.chapter}/${item.target.verse} | ${item.target.type} | ${item.target.audioId} | ${item.action}`,
    );
  }
  console.log('');
  console.log('○ skip_approved');
  console.log(`  ${preflight.skipped.length}`);
  for (const item of preflight.skipped) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ planned_translation');
  console.log(`  ${preflight.planned.length}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ API translations required');
  console.log(`  ${preflight.apiTranslationsRequired}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: narration dry-run (no API call, no writes)'
      : '○ Mode: narration write',
  );
}

function classifyRepairAction(target, koreanSource) {
  const narrationAbs = toAbsolute(target.narrationPath);
  const narrationExists = fs.existsSync(narrationAbs);
  const meta = readMetadataIfExists(target.metaPath);

  if (meta.error) {
    return {
      action: 'unsafe',
      reason: meta.error,
      audioId: target.audioId,
    };
  }

  if (!narrationExists || !meta.exists) {
    return {
      action: 'unsafe',
      reason: 'repair requires both existing draft narration and metadata',
      audioId: target.audioId,
    };
  }

  if (!meta.data || meta.data.status !== 'draft') {
    return {
      action: 'unsafe',
      reason: `repair rejects non-draft status=${meta.data?.status || 'missing'}`,
      audioId: target.audioId,
    };
  }

  if (meta.data.sourceHash !== koreanSource.sourceSha256) {
    return {
      action: 'source_hash_changed',
      reason: `draft sourceHash=${meta.data.sourceHash} current=${koreanSource.sourceSha256}`,
      audioId: target.audioId,
    };
  }

  const currentText = fs.readFileSync(narrationAbs, 'utf8');
  const currentSignature = buildNarrationStructureSignature(currentText);
  const expectedSignature = koreanSource.signature;
  const structural = validateTranslatedNarrationStructure({
    sourceText: koreanSource.text,
    translatedParagraphs: parseNarrationStructure(currentText),
    targetLocale: target.locale,
    type: target.type,
    cardCount: target.cardCount,
  });

  if (structural.ok) {
    return {
      action: 'skip_structurally_valid_draft',
      reason: `already valid signature=${JSON.stringify(currentSignature.lineCounts)}`,
      audioId: target.audioId,
      currentSignature,
      expectedSignature,
    };
  }

  return {
    action: 'planned_repair_invalid_draft',
    reason: `invalid signature=${JSON.stringify(currentSignature.lineCounts)} expected=${JSON.stringify(expectedSignature.lineCounts)}`,
    audioId: target.audioId,
    currentSignature,
    expectedSignature,
    previousNarrationSha256: sha256Text(currentText),
    previousNarrationText: currentText,
    previousMetadata: meta.data,
    structuralErrors: structural.errors,
  };
}

function buildRepairPreflight(plan) {
  const sourceCache = new Map();
  const actions = [];
  const blockers = [];
  const koreanSources = [];

  for (const target of plan.targets) {
    const cacheKey = `${target.bookId}:${target.chapter}:${target.verse}:${target.type}`;
    let koreanSource = sourceCache.get(cacheKey);
    if (!koreanSource) {
      koreanSource = readKoreanSource(
        target.bookId,
        target.chapter,
        target.verse,
        target.type,
      );
      sourceCache.set(cacheKey, koreanSource);
      koreanSources.push(koreanSource);
    }

    if (!koreanSource.ok) {
      blockers.push(
        `${target.audioId}: ${(koreanSource.errors || []).join('; ')}`,
      );
      actions.push({
        target,
        action: 'unsafe',
        reason: (koreanSource.errors || []).join('; '),
      });
      continue;
    }

    const classified = classifyRepairAction(target, koreanSource);
    actions.push({
      target,
      koreanSource,
      ...classified,
    });

    if (
      classified.action === 'unsafe' ||
      classified.action === 'source_hash_changed'
    ) {
      blockers.push(
        `${classified.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter(
    (item) => item.action === 'planned_repair_invalid_draft',
  );
  const skippedValid = actions.filter(
    (item) => item.action === 'skip_structurally_valid_draft',
  );
  const hardBlockers = actions.filter(
    (item) =>
      item.action === 'unsafe' || item.action === 'source_hash_changed',
  );

  return {
    actions,
    blockers,
    hardBlockers,
    planned,
    skippedValid,
    koreanSources,
    apiTranslationsRequired: planned.length,
  };
}

function printRepairPlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=narration repair-invalid-drafts mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Repair actions');
  for (const item of preflight.actions) {
    const current = item.currentSignature
      ? JSON.stringify(item.currentSignature.lineCounts)
      : 'n/a';
    const expected = item.expectedSignature
      ? JSON.stringify(item.expectedSignature.lineCounts)
      : 'n/a';
    console.log(
      `  - ${item.target.locale} | ${item.target.bookId}/${item.target.chapter}/${item.target.verse} | ${item.target.type} | ${item.target.audioId} | ${item.action} | current=${current} expected=${expected}`,
    );
  }
  console.log('');
  console.log('○ planned_repair_invalid_draft');
  console.log(`  ${preflight.planned.length}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ skip_structurally_valid_draft');
  console.log(`  ${preflight.skippedValid.length}`);
  console.log('');
  console.log('○ API translations required');
  console.log(`  ${preflight.apiTranslationsRequired}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: repair dry-run (no API call, no writes)'
      : '○ Mode: repair write',
  );
}

function printApiCounters(counters, label) {
  console.log(`○ API counters (${label})`);
  console.log(`  plannedCalls=${counters.plannedCalls}`);
  console.log(`  attemptedCalls=${counters.attemptedCalls}`);
  console.log(`  successfulCalls=${counters.successfulCalls}`);
  console.log(`  failedCalls=${counters.failedCalls}`);
  console.log(`  validationFailedCalls=${counters.validationFailedCalls}`);
  console.log(`  retriedCalls=${counters.retriedCalls}`);
  console.log(`  totalCalls=${counters.totalCalls}`);
}

function atomicReplaceDraftPair({
  narrationPath,
  metaPath,
  narrationText,
  metadataJson,
}) {
  const narrationAbs = toAbsolute(narrationPath);
  const metaAbs = toAbsolute(metaPath);
  const narrationTmp = `${narrationAbs}.repair-tmp`;
  const metaTmp = `${metaAbs}.repair-tmp`;

  const originalNarration = fs.readFileSync(narrationAbs);
  const originalMeta = fs.readFileSync(metaAbs);

  const cleanupTemps = () => {
    for (const tempPath of [narrationTmp, metaTmp]) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  };

  try {
    fs.writeFileSync(narrationTmp, narrationText, 'utf8');
    fs.writeFileSync(metaTmp, metadataJson, 'utf8');

    const tmpNarrationText = fs.readFileSync(narrationTmp, 'utf8');
    const tmpMeta = JSON.parse(fs.readFileSync(metaTmp, 'utf8'));
    if (tmpNarrationText !== narrationText) {
      throw new Error('temporary narration mismatch after write');
    }
    if (tmpMeta.status !== 'draft') {
      throw new Error('temporary metadata status must remain draft');
    }
    if (sha256Text(tmpNarrationText) !== tmpMeta.narrationHash) {
      throw new Error('temporary metadata narrationHash mismatch');
    }

    fs.renameSync(narrationTmp, narrationAbs);
    try {
      fs.renameSync(metaTmp, metaAbs);
    } catch (error) {
      fs.writeFileSync(narrationAbs, originalNarration);
      throw error;
    }
  } catch (error) {
    try {
      fs.writeFileSync(narrationAbs, originalNarration);
      fs.writeFileSync(metaAbs, originalMeta);
    } catch {
      // best-effort restore
    }
    cleanupTemps();
    throw error;
  }

  cleanupTemps();
}

async function runRepairStage(args, plan) {
  const preflight = buildRepairPreflight(plan);
  printKoreanSources(preflight.koreanSources);
  printRepairPlan(plan, preflight, args.write ? 'write' : 'dry-run');

  if (preflight.koreanSources.some((source) => !source.ok)) {
    console.error('○ STOP: invalid Korean source narration');
    process.exit(1);
  }

  if (preflight.hardBlockers.length) {
    console.error('○ STOP: repair preflight hard blockers present');
    process.exit(1);
  }

  if (args.dryRun) {
    if (preflight.planned.length !== plan.targetCount) {
      console.error(
        '○ STOP: dry-run expected every target to be planned_repair_invalid_draft',
      );
      process.exit(1);
    }
    console.log('○ Exactly 2 API calls are planned');
    console.log('○ No API call occurs in dry-run');
    process.exit(0);
  }

  if (!preflight.planned.length) {
    console.error('○ STOP: no invalid drafts available for repair');
    process.exit(1);
  }

  const apiKey = getOpenAiApiKey();
  const counters = {
    plannedCalls: 0,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    validationFailedCalls: 0,
    retriedCalls: 0,
    totalCalls: 0,
  };

  const results = [];

  for (const item of preflight.actions) {
    if (item.action === 'skip_structurally_valid_draft') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: true,
      });
      continue;
    }

    if (item.action !== 'planned_repair_invalid_draft') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: false,
        error: item.reason,
      });
      continue;
    }

    console.log(`○ Repairing ${item.audioId}`);

    const translation = await translateCommentaryNarration({
      sourceText: item.koreanSource.text,
      sourceBytes: fs.readFileSync(item.koreanSource.absolutePath),
      sourceLocale: 'ko-KR',
      targetLocale: item.target.locale,
      bookId: item.target.bookId,
      chapter: item.target.chapter,
      verse: item.target.verse,
      type: item.target.type,
      cardCount: item.target.cardCount,
      sourcePath: item.koreanSource.sourcePath,
      sourceSha256: item.koreanSource.sourceSha256,
      apiKey,
      model: DEFAULT_TRANSLATION_MODEL,
      maxAttempts: 2,
      repairReason: 'invalid_card_line_structure',
      previousNarrationSha256: item.previousNarrationSha256,
      counters,
    });

    if (!translation.ok) {
      console.error(`○ Repair translation failed: ${item.audioId}`);
      console.error(`  ${translation.error}`);
      console.error('○ Original English draft pair preserved');
      results.push({
        audioId: item.audioId,
        action: 'repair_failed',
        ok: false,
        error: translation.error,
      });
      printApiCounters(counters, 'current repair execution only');
      process.exit(1);
    }

    try {
      atomicReplaceDraftPair({
        narrationPath: item.target.narrationPath,
        metaPath: item.target.metaPath,
        narrationText: translation.narrationText,
        metadataJson: translation.metadataJson,
      });
    } catch (error) {
      console.error(`○ Repair write failed: ${item.audioId}`);
      console.error(`  ${error.message}`);
      console.error('○ Original English draft pair preserved/restored');
      results.push({
        audioId: item.audioId,
        action: 'repair_write_failed',
        ok: false,
        error: error.message,
      });
      printApiCounters(counters, 'current repair execution only');
      process.exit(1);
    }

    console.log(`○ Repaired draft narration: ${item.target.narrationPath}`);
    console.log(`○ Repaired draft metadata: ${item.target.metaPath}`);
    results.push({
      audioId: item.audioId,
      action: 'repaired_draft',
      ok: true,
      model: translation.model,
      lineCounts: translation.narrationSignature.lineCounts,
    });
  }

  const repaired = results.filter((item) => item.action === 'repaired_draft');
  const failed = results.filter((item) => !item.ok);

  console.log('');
  console.log('○ Repair write summary');
  console.log(`  repaired_drafts=${repaired.length}`);
  console.log(`  failures=${failed.length}`);
  for (const item of repaired) {
    console.log(
      `  + ${item.audioId} model=${item.model} lineCounts=${JSON.stringify(item.lineCounts)}`,
    );
  }
  printApiCounters(counters, 'current repair execution only');

  if (failed.length || repaired.length !== preflight.planned.length) {
    process.exit(1);
  }

  process.exit(0);
}

async function runNarrationStage(args, plan) {
  if (args.write) {
    // Deterministic: env guards before any narration/repair preflight or writes.
    assertNarrationWriteGuards(args);
  }

  if (args.repairInvalidDrafts) {
    await runRepairStage(args, plan);
    return;
  }

  const preflight = buildNarrationPreflight(plan);
  printKoreanSources(preflight.koreanSources);
  printNarrationPlan(plan, preflight, args.write ? 'write' : 'dry-run');

  if (preflight.koreanSources.some((source) => !source.ok)) {
    console.error('○ STOP: invalid Korean source narration');
    process.exit(1);
  }

  if (args.dryRun) {
    if (preflight.hardBlockers.length) {
      console.error('○ STOP: narration preflight hard blockers present');
      process.exit(1);
    }
    process.exit(0);
  }

  if (preflight.hardBlockers.length) {
    console.error(
      '○ STOP: aborting before API call due to unsafe target state',
    );
    process.exit(1);
  }

  if (!preflight.planned.length) {
    console.error(
      '○ STOP: no planned translations remain; resolve existing drafts before retrying overwritten targets',
    );
    for (const item of preflight.draftBlocked) {
      console.error(`  - ${item.audioId}: ${item.reason}`);
    }
    process.exit(1);
  }

  if (preflight.draftBlocked.length) {
    console.log('○ Existing drafts will be left untouched');
    for (const item of preflight.draftBlocked) {
      console.log(`  - ${item.audioId}: ${item.reason}`);
    }
    console.log('');
  }

  // OPENAI_API_KEY is required only when at least one API request will be made.
  const apiKey = getOpenAiApiKey();
  const counters = {
    plannedCalls: 0,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    validationFailedCalls: 0,
    retriedCalls: 0,
    totalCalls: 0,
  };

  const results = [];

  for (const item of preflight.actions) {
    if (item.action === 'skip_approved') {
      results.push({
        audioId: item.audioId,
        action: 'skip_approved',
        ok: true,
      });
      continue;
    }

    if (item.action === 'existing_draft_requires_review') {
      results.push({
        audioId: item.audioId,
        action: 'existing_draft_requires_review',
        ok: true,
        untouched: true,
        error: item.reason,
      });
      continue;
    }

    if (item.action !== 'planned_translation') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: false,
        error: item.reason,
      });
      continue;
    }

    console.log(`○ Translating ${item.audioId}`);

    const translation = await translateCommentaryNarration({
      sourceText: item.koreanSource.text,
      sourceBytes: fs.readFileSync(item.koreanSource.absolutePath),
      sourceLocale: 'ko-KR',
      targetLocale: item.target.locale,
      bookId: item.target.bookId,
      chapter: item.target.chapter,
      verse: item.target.verse,
      type: item.target.type,
      cardCount: item.target.cardCount,
      sourcePath: item.koreanSource.sourcePath,
      sourceSha256: item.koreanSource.sourceSha256,
      apiKey,
      model: DEFAULT_TRANSLATION_MODEL,
      counters,
    });

    if (!translation.ok) {
      console.error(`○ Translation failed: ${item.audioId}`);
      console.error(`  ${translation.error}`);
      results.push({
        audioId: item.audioId,
        action: 'translation_failed',
        ok: false,
        error: translation.error,
        errors: translation.errors || [],
      });
      continue;
    }

    try {
      atomicCreateDraftPair({
        narrationPath: toAbsolute(item.target.narrationPath),
        metaPath: toAbsolute(item.target.metaPath),
        narrationText: translation.narrationText,
        metadataJson: translation.metadataJson,
        sourceText: item.koreanSource.text,
        targetLocale: item.target.locale,
        type: item.target.type,
        cardCount: item.target.cardCount,
        expectedSourceHash: item.koreanSource.sourceSha256,
        expectedTargetLocale: item.target.locale,
        expectedBookId: item.target.bookId,
        expectedChapter: item.target.chapter,
        expectedVerse: item.target.verse,
        expectedType: item.target.type,
      });
    } catch (error) {
      console.error(`○ Write failed: ${item.audioId}`);
      console.error(`  ${error.message}`);
      results.push({
        audioId: item.audioId,
        action: 'write_failed',
        ok: false,
        error: error.message,
      });
      continue;
    }

    console.log(`○ Wrote draft narration: ${item.target.narrationPath}`);
    console.log(`○ Wrote draft metadata: ${item.target.metaPath}`);
    results.push({
      audioId: item.audioId,
      action: 'created_draft',
      ok: true,
      model: translation.model,
      narrationPath: item.target.narrationPath,
      metaPath: item.target.metaPath,
      paragraphCount: translation.paragraphCount,
      narrationSha256: translation.narrationSha256,
      sourceSha256: translation.metadata.sourceHash,
    });
  }

  const created = results.filter((item) => item.action === 'created_draft');
  const failed = results.filter((item) => !item.ok);
  const skipped = results.filter((item) => item.action === 'skip_approved');
  const untouchedDrafts = results.filter(
    (item) => item.action === 'existing_draft_requires_review',
  );

  console.log('');
  console.log('○ Narration write summary');
  console.log(`  skipped_approved=${skipped.length}`);
  console.log(`  untouched_existing_drafts=${untouchedDrafts.length}`);
  console.log(`  created_drafts=${created.length}`);
  console.log(`  failures=${failed.length}`);
  printApiCounters(counters, 'current narration write execution only');
  for (const item of created) {
    console.log(
      `  + ${item.audioId} model=${item.model} paragraphs=${item.paragraphCount}`,
    );
  }
  for (const item of untouchedDrafts) {
    console.log(`  = ${item.audioId} left untouched: ${item.error}`);
  }
  for (const item of failed) {
    console.log(`  ! ${item.audioId} ${item.action}: ${item.error}`);
  }

  if (failed.length) {
    process.exit(1);
  }

  process.exit(0);
}

function classifyAudioAction(target) {
  const validated = validateApprovedNarrationTarget({
    target,
    toAbsolute,
  });

  if (!validated.ok) {
    return {
      action: validated.action,
      reason: validated.reason,
      audioId: target.audioId,
    };
  }

  const audioAbs = toAbsolute(target.audioPath);
  if (fs.existsSync(audioAbs)) {
    const mp3 = validateMp3File(audioAbs);
    if (!mp3.ok) {
      return {
        action: 'block_invalid_existing_mp3',
        reason: mp3.reason,
        audioId: target.audioId,
      };
    }

    return {
      action: 'skip_existing_verified',
      reason: `existing MP3 duration=${mp3.duration} size=${mp3.byteSize}`,
      audioId: target.audioId,
      byteSize: mp3.byteSize,
      duration: mp3.duration,
      sha256: mp3.sha256,
      validated,
    };
  }

  return {
    action: 'planned_generate_audio',
    reason: 'approved narration ready; MP3 absent',
    audioId: target.audioId,
    validated,
  };
}

function buildAudioPreflight(plan) {
  const actions = [];
  const blockers = [];

  for (const target of plan.targets) {
    const classified = classifyAudioAction(target);
    actions.push({
      target,
      ...classified,
    });

    if (String(classified.action).startsWith('block_')) {
      blockers.push(
        `${classified.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter(
    (item) => item.action === 'planned_generate_audio',
  );
  const skipped = actions.filter(
    (item) => item.action === 'skip_existing_verified',
  );
  const hardBlockers = actions.filter((item) =>
    String(item.action).startsWith('block_'),
  );

  return {
    actions,
    blockers,
    hardBlockers,
    planned,
    skipped,
    plannedTargets: planned.length,
    skippedExistingTargets: skipped.length,
  };
}

function printAudioPlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=audio mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Audio actions');
  for (const item of preflight.actions) {
    console.log(
      `  - ${item.target.locale} | ${item.target.bookId}/${item.target.chapter}/${item.target.verse} | ${item.target.type} | ${item.target.audioId} | ${item.action} | ${item.target.audioPath}`,
    );
  }
  console.log('');
  console.log('○ planned_generate_audio');
  console.log(`  ${preflight.plannedTargets}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ skip_existing_verified');
  console.log(`  ${preflight.skippedExistingTargets}`);
  for (const item of preflight.skipped) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ plannedTargets');
  console.log(`  ${preflight.plannedTargets}`);
  console.log('○ skippedExistingTargets');
  console.log(`  ${preflight.skippedExistingTargets}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: audio dry-run (no API call, no writes, no directories)'
      : '○ Mode: audio write',
  );
}

function printAudioCounters(counters) {
  console.log('○ API counters (current audio write execution only)');
  console.log(`  plannedTargets=${counters.plannedTargets}`);
  console.log(`  attemptedTargets=${counters.attemptedTargets}`);
  console.log(`  successfulTargets=${counters.successfulTargets}`);
  console.log(`  failedTargets=${counters.failedTargets}`);
  console.log(`  skippedExistingTargets=${counters.skippedExistingTargets}`);
  console.log(`  totalApiCalls=${counters.totalApiCalls}`);
  console.log(`  retriedCalls=${counters.retriedCalls}`);
}

async function runAudioStage(args, plan) {
  if (args.write) {
    assertAudioWriteGuards(args);
  }

  const preflight = buildAudioPreflight(plan);
  printAudioPlan(plan, preflight, args.write ? 'write' : 'dry-run');

  if (args.dryRun) {
    if (preflight.hardBlockers.length) {
      console.error('○ STOP: audio preflight hard blockers present');
      process.exit(1);
    }
    process.exit(0);
  }

  if (preflight.hardBlockers.length) {
    console.error('○ STOP: aborting before API call due to unsafe audio target state');
    process.exit(1);
  }

  const counters = createEmptyAudioCounters();
  counters.plannedTargets = preflight.plannedTargets;
  counters.skippedExistingTargets = preflight.skippedExistingTargets;

  const results = [];
  let apiKey = null;

  for (const item of preflight.actions) {
    if (item.action === 'skip_existing_verified') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: true,
        untouched: true,
      });
      continue;
    }

    if (item.action !== 'planned_generate_audio') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: false,
        error: item.reason,
      });
      continue;
    }

    // Read API key only immediately before the first real audio request.
    if (apiKey == null) {
      apiKey = getOpenAiApiKey();
    }

    counters.attemptedTargets += 1;
    console.log(`○ Generating audio ${item.audioId}`);

    const speech = await requestCommentaryMp3({
      apiKey,
      narrationText: item.validated.narrationText,
      ttsConfig: item.validated.ttsConfig,
      maxAttempts: 2,
      counters,
    });

    if (!speech.ok) {
      counters.failedTargets += 1;
      console.error(`○ Audio generation failed: ${item.audioId}`);
      console.error(`  ${speech.error}`);
      results.push({
        audioId: item.audioId,
        action: 'audio_generation_failed',
        ok: false,
        error: speech.error,
      });
      continue;
    }

    try {
      const published = atomicCreateMp3({
        mp3Path: toAbsolute(item.target.audioPath),
        audioBytes: speech.audioBytes,
        model: speech.model,
        voice: speech.voice,
        voicePreset: speech.voicePreset,
        apiAttempts: speech.attempts,
      });
      counters.successfulTargets += 1;
      console.log(`○ Wrote MP3: ${item.target.audioPath}`);
      console.log(
        `  bytes=${published.byteSize} duration=${published.duration} sha256=${published.sha256}`,
      );
      results.push({
        audioId: item.audioId,
        action: 'created_audio',
        ok: true,
        audioPath: item.target.audioPath,
        byteSize: published.byteSize,
        duration: published.duration,
        sha256: published.sha256,
      });
    } catch (error) {
      counters.failedTargets += 1;
      console.error(`○ Audio write failed: ${item.audioId}`);
      console.error(`  ${error.message}`);
      results.push({
        audioId: item.audioId,
        action: 'audio_write_failed',
        ok: false,
        error: error.message,
      });
    }
  }

  const created = results.filter((item) => item.action === 'created_audio');
  const failed = results.filter((item) => !item.ok);
  const skipped = results.filter(
    (item) => item.action === 'skip_existing_verified',
  );

  console.log('');
  console.log('○ Audio write summary');
  console.log(`  skipped_existing_verified=${skipped.length}`);
  console.log(`  created_audio=${created.length}`);
  console.log(`  failures=${failed.length}`);
  printAudioCounters(counters);
  for (const item of created) {
    console.log(
      `  + ${item.audioId} bytes=${item.byteSize} duration=${item.duration}`,
    );
  }
  for (const item of failed) {
    console.log(`  ! ${item.audioId} ${item.action}: ${item.error}`);
  }

  if (failed.length) {
    process.exit(1);
  }

  process.exit(0);
}

function classifyCueAction(target) {
  return validateCueTargetInputs({
    target,
    toAbsolute,
    analyzeAudio: true,
  });
}

function buildCuePreflight(plan) {
  const actions = [];
  const blockers = [];

  for (const target of plan.targets) {
    const classified = classifyCueAction(target);
    actions.push({
      target,
      audioId: target.audioId,
      ...classified,
    });

    if (String(classified.action).startsWith('block_')) {
      blockers.push(
        `${target.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter(
    (item) => item.action === 'planned_generate_cue',
  );
  const skipped = actions.filter(
    (item) => item.action === 'skip_existing_verified',
  );
  const hardBlockers = actions.filter((item) =>
    String(item.action).startsWith('block_'),
  );

  return {
    actions,
    blockers,
    hardBlockers,
    planned,
    skipped,
    plannedTargets: planned.length,
    skippedExistingTargets: skipped.length,
  };
}

function printCueDiagnostics(item) {
  const selection = item.selection || {};
  const silence = item.silence || {};
  const expected = item.expected || {};
  const mp3 = item.mp3 || {};
  const speechUnits = item.speechUnits || [];
  const primaryPlan = selection.primaryPlan || null;

  console.log(`○ Cue diagnostics ${item.target.audioId}`);
  console.log(`  locale=${item.target.locale}`);
  console.log(
    `  identity=${item.target.bookId}/${item.target.chapter}/${item.target.verse}/${item.target.type}`,
  );
  console.log(`  mp3Path=${item.target.audioPath}`);
  console.log(`  cuePath=${item.target.cuePath}`);
  console.log(`  mp3Duration=${mp3.duration ?? 'n/a'}`);
  console.log(`  speechUnitCount=${speechUnits.length || 'n/a'}`);
  console.log(`  cardCount=${item.target.cardCount}`);
  console.log(
    `  expectedBoundaries=${JSON.stringify(expected.expectedBoundaries || selection.expectedBoundaries || [])}`,
  );
  console.log(
    `  primaryCandidateCount=${silence.primaryCandidateCount ?? silence.candidateCount ?? 'n/a'}`,
  );
  console.log(
    `  supplementalOnlyCandidateCount=${silence.supplementalOnlyCandidateCount ?? 'n/a'}`,
  );
  console.log(
    `  primaryPlanResult=${primaryPlan ? `${primaryPlan.ok ? 'ok' : primaryPlan.action}:${primaryPlan.reason || ''}` : 'n/a'}`,
  );
  console.log(
    `  fallbackRequired=${selection.fallbackRequired ?? 'n/a'}`,
  );
  console.log(`  strategy=${selection.strategy ?? 'n/a'}`);
  console.log(
    `  selectedBoundaries=${JSON.stringify(selection.selectedBoundaries || [])}`,
  );
  console.log(
    `  selectedBoundarySources=${JSON.stringify(selection.selectedSources || [])}`,
  );
  console.log(
    `  selectedSilenceDurations=${JSON.stringify(selection.selectedSilenceDurations || [])}`,
  );
  console.log(
    `  boundaryDifferences=${JSON.stringify(selection.boundaryDifferences || [])}`,
  );
  console.log(`  maximumBoundaryDifference=${selection.maxDifference ?? 'n/a'}`);
  console.log(`  introDuration=${selection.introDuration ?? 'n/a'}`);
  console.log(
    `  cardDurations=${JSON.stringify(selection.cardDurations || [])}`,
  );
  console.log(`  closingDuration=${selection.closingDuration ?? 'n/a'}`);
  console.log(
    `  minimumCardDuration=${selection.minimumCardDuration ?? 'n/a'}`,
  );
  console.log(
    `  segmentDurations=${JSON.stringify(selection.segmentDurations || [])}`,
  );
  console.log(`  plannedAction=${item.action}`);
  if (item.reason) {
    console.log(`  reason=${item.reason}`);
  }
}

function printCuePlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=cue mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Cue actions');
  for (const item of preflight.actions) {
    console.log(
      `  - ${item.target.locale} | ${item.target.bookId}/${item.target.chapter}/${item.target.verse} | ${item.target.type} | ${item.target.audioId} | ${item.action} | ${item.target.cuePath}`,
    );
  }
  console.log('');

  for (const item of preflight.actions) {
    printCueDiagnostics(item);
    console.log('');
  }

  console.log('○ planned_generate_cue');
  console.log(`  ${preflight.plannedTargets}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ skip_existing_verified');
  console.log(`  ${preflight.skippedExistingTargets}`);
  for (const item of preflight.skipped) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ plannedTargets');
  console.log(`  ${preflight.plannedTargets}`);
  console.log('○ skippedExistingTargets');
  console.log(`  ${preflight.skippedExistingTargets}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: cue dry-run (no API call, no writes, no directories)'
      : '○ Mode: cue write',
  );
}

function printCueCounters(counters) {
  console.log('○ Cue counters (current cue write execution only)');
  console.log(`  plannedTargets=${counters.plannedTargets}`);
  console.log(`  attemptedTargets=${counters.attemptedTargets}`);
  console.log(`  successfulTargets=${counters.successfulTargets}`);
  console.log(`  failedTargets=${counters.failedTargets}`);
  console.log(`  skippedExistingTargets=${counters.skippedExistingTargets}`);
}

function runCueStage(args, plan) {
  if (args.write) {
    assertCueWriteGuards(args);
  }

  const preflight = buildCuePreflight(plan);
  printCuePlan(plan, preflight, args.write ? 'write' : 'dry-run');

  if (args.dryRun) {
    if (preflight.hardBlockers.length) {
      console.error('○ STOP: cue preflight hard blockers present');
      process.exit(1);
    }
    process.exit(0);
  }

  if (preflight.hardBlockers.length) {
    console.error('○ STOP: aborting before cue write due to unsafe target state');
    process.exit(1);
  }

  const counters = createEmptyCueCounters();
  counters.plannedTargets = preflight.plannedTargets;
  counters.skippedExistingTargets = preflight.skippedExistingTargets;

  const results = [];

  for (const item of preflight.actions) {
    if (item.action === 'skip_existing_verified') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: true,
        untouched: true,
      });
      continue;
    }

    if (item.action !== 'planned_generate_cue') {
      results.push({
        audioId: item.audioId,
        action: item.action,
        ok: false,
        error: item.reason,
      });
      continue;
    }

    counters.attemptedTargets += 1;
    console.log(`○ Writing cue ${item.audioId}`);

    try {
      const published = atomicCreateCueFile({
        cuePath: toAbsolute(item.target.cuePath),
        document: item.cueDocument,
        target: item.target,
        durationSeconds: item.mp3.duration,
        cardCount: item.target.cardCount,
      });
      counters.successfulTargets += 1;
      console.log(`○ Wrote Cue: ${item.target.cuePath}`);
      console.log(`  bytes=${published.byteSize}`);
      results.push({
        audioId: item.audioId,
        action: 'created_cue',
        ok: true,
        cuePath: item.target.cuePath,
        byteSize: published.byteSize,
      });
    } catch (error) {
      counters.failedTargets += 1;
      console.error(`○ Cue write failed: ${item.audioId}`);
      console.error(`  ${error.message}`);
      results.push({
        audioId: item.audioId,
        action: 'cue_write_failed',
        ok: false,
        error: error.message,
      });
    }
  }

  const created = results.filter((item) => item.action === 'created_cue');
  const failed = results.filter((item) => !item.ok);
  const skipped = results.filter(
    (item) => item.action === 'skip_existing_verified',
  );

  console.log('');
  console.log('○ Cue write summary');
  console.log(`  skipped_existing_verified=${skipped.length}`);
  console.log(`  created_cue=${created.length}`);
  console.log(`  failures=${failed.length}`);
  printCueCounters(counters);
  for (const item of created) {
    console.log(`  + ${item.audioId} bytes=${item.byteSize}`);
  }
  for (const item of failed) {
    console.log(`  ! ${item.audioId} ${item.action}: ${item.error}`);
  }

  if (failed.length) {
    process.exit(1);
  }

  process.exit(0);
}

async function buildUploadPreflight(plan, counters = null, adapters = null) {
  if (!adapters || typeof adapters.remoteInspector !== 'function') {
    throw new Error('upload adapters.remoteInspector is required');
  }

  const actions = [];
  const blockers = [];

  for (const target of plan.targets) {
    const classified = await classifyUploadTarget({
      target,
      root: ROOT,
      toAbsolute,
      counters,
      remoteInspector: adapters.remoteInspector,
    });
    actions.push({
      target,
      ...classified,
    });

    if (String(classified.action).startsWith('block_')) {
      blockers.push(
        `${classified.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter((item) => item.action === 'planned_upload');
  const skipped = actions.filter(
    (item) => item.action === 'skip_existing_verified',
  );
  const hardBlockers = actions.filter((item) =>
    String(item.action).startsWith('block_'),
  );

  return {
    actions,
    blockers,
    hardBlockers,
    planned,
    skipped,
    plannedTargets: planned.length,
    skippedExistingTargets: skipped.length,
  };
}

function printUploadDiagnostics(item) {
  console.log(`○ Upload diagnostics ${item.audioId}`);
  console.log(`  locale=${item.locale}`);
  console.log(`  identity=${item.identity}`);
  console.log(`  localMp3Path=${item.localMp3Path}`);
  console.log(`  localByteSize=${item.localByteSize ?? 'n/a'}`);
  console.log(`  localDuration=${item.localDuration ?? 'n/a'}`);
  console.log(`  localSha256=${item.localSha256 ?? 'n/a'}`);
  console.log(`  r2Bucket=${item.r2Bucket}`);
  console.log(`  r2Key=${item.r2Key ?? 'n/a'}`);
  console.log(`  publicUrl=${item.publicUrl ?? 'n/a'}`);
  console.log(`  remoteHttpStatus=${item.remoteHttpStatus ?? 'n/a'}`);
  console.log(`  remoteByteSize=${item.remoteByteSize ?? 'n/a'}`);
  console.log(`  remoteDuration=${item.remoteDuration ?? 'n/a'}`);
  console.log(`  remoteSha256=${item.remoteSha256 ?? 'n/a'}`);
  console.log(`  action=${item.action}`);
  if (item.reason) {
    console.log(`  reason=${item.reason}`);
  }
}

function printUploadPlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=upload mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Upload actions');
  for (const item of preflight.actions) {
    console.log(
      `  - ${item.target.locale} | ${item.target.bookId}/${item.target.chapter}/${item.target.verse} | ${item.target.type} | ${item.target.audioId} | ${item.action} | ${item.r2Key || item.target.audioPath}`,
    );
  }
  console.log('');

  for (const item of preflight.actions) {
    printUploadDiagnostics(item);
    console.log('');
  }

  console.log('○ planned_upload');
  console.log(`  ${preflight.plannedTargets}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ skip_existing_verified');
  console.log(`  ${preflight.skippedExistingTargets}`);
  for (const item of preflight.skipped) {
    console.log(`  - ${item.audioId}`);
  }
  console.log('');
  console.log('○ plannedTargets');
  console.log(`  ${preflight.plannedTargets}`);
  console.log('○ skippedExistingTargets');
  console.log(`  ${preflight.skippedExistingTargets}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: upload dry-run (no API call, no Wrangler put, no R2 mutation)'
      : '○ Mode: upload write',
  );
}

function printUploadCounters(counters) {
  console.log('○ Upload counters (current upload write execution only)');
  console.log(`  plannedTargets=${counters.plannedTargets}`);
  console.log(`  attemptedTargets=${counters.attemptedTargets}`);
  console.log(`  successfulTargets=${counters.successfulTargets}`);
  console.log(`  failedTargets=${counters.failedTargets}`);
  console.log(`  skippedExistingTargets=${counters.skippedExistingTargets}`);
  console.log(`  remotePreflightChecks=${counters.remotePreflightChecks}`);
  console.log(
    `  remoteImmediateRechecks=${counters.remoteImmediateRechecks}`,
  );
  console.log(`  totalUploadAttempts=${counters.totalUploadAttempts}`);
  console.log(
    `  remoteVerificationAttempts=${counters.remoteVerificationAttempts}`,
  );
  console.log(`  uploadLockAcquired=${counters.uploadLockAcquired}`);
  console.log(`  uploadLockReleased=${counters.uploadLockReleased}`);
}

function printUploadWriteProtections() {
  console.log('○ Upload write protections');
  console.log(
    `  localSingleWriterLock=${UPLOAD_WRITE_PROTECTIONS.localSingleWriterLock}`,
  );
  console.log(
    `  globalUploadLock=${UPLOAD_WRITE_PROTECTIONS.globalUploadLock}`,
  );
  console.log(`  uploadLockPath=${GLOBAL_UPLOAD_LOCK_PATH}`);
  console.log(
    `  immediateRemoteRecheck=${UPLOAD_WRITE_PROTECTIONS.immediateRemoteRecheck}`,
  );
  console.log(
    `  onePutMaximumPerTarget=${UPLOAD_WRITE_PROTECTIONS.onePutMaximumPerTarget}`,
  );
  console.log(
    `  postUploadByteVerification=${UPLOAD_WRITE_PROTECTIONS.postUploadByteVerification}`,
  );
  console.log(
    `  externalWriterRaceNotAtomicallyEliminated=${UPLOAD_WRITE_PROTECTIONS.externalWriterRaceNotAtomicallyEliminated}`,
  );
  console.log(
    `  nativeWranglerConditionalCreate=${UPLOAD_WRITE_PROTECTIONS.nativeWranglerConditionalCreate}`,
  );
}

async function runUploadStage(args, plan) {
  // Test mode must never inherit production write guards or real I/O adapters.
  if (isUploadTestMode()) {
    console.error(
      '○ STOP: GOMNA_COMMENTARY_MULTILANG_TEST_MODE=1 blocks the production upload stage',
    );
    process.exit(1);
  }

  if (args.dryRun) {
    const adapters = createProductionUploadAdapters();
    const preflight = await buildUploadPreflight(plan, null, adapters);
    printUploadPlan(plan, preflight, 'dry-run');
    console.log('○ Upload lock');
    console.log(`  uploadLockPath=${GLOBAL_UPLOAD_LOCK_PATH}`);
    console.log('  uploadLockAcquired=false');
    console.log('  acquired=false (dry-run does not acquire a write lock)');
    if (preflight.hardBlockers.length) {
      console.error('○ STOP: upload preflight hard blockers present');
      process.exit(1);
    }
    process.exit(0);
  }

  assertUploadWriteGuards(args);

  const adapters = createProductionUploadAdapters();
  const lockPath = buildUploadLockPath();
  const counters = createEmptyUploadCounters();
  let lockHeld = false;
  let exitCode = 0;

  try {
    const lock = acquireUploadLock(lockPath);
    if (!lock.ok) {
      console.error(`○ STOP: ${lock.action}`);
      console.error(`  ${lock.reason}`);
      console.error(`  uploadLockPath=${lockPath}`);
      process.exit(1);
    }
    lockHeld = true;
    counters.uploadLockAcquired = 1;

    printUploadWriteProtections();
    console.log('○ Upload lock');
    console.log(`  uploadLockPath=${lockPath}`);
    console.log('  uploadLockAcquired=true');
    console.log('  acquired=true');

    const preflight = await buildUploadPreflight(plan, counters, adapters);
    printUploadPlan(plan, preflight, 'write');

    if (preflight.hardBlockers.length) {
      console.error(
        '○ STOP: aborting before upload due to unsafe target state',
      );
      exitCode = 1;
      return;
    }

    counters.plannedTargets = preflight.plannedTargets;
    counters.skippedExistingTargets = preflight.skippedExistingTargets;

    const results = [];

    for (const item of preflight.actions) {
      if (item.action === 'skip_existing_verified') {
        results.push({
          audioId: item.audioId,
          action: item.action,
          ok: true,
          untouched: true,
        });
        continue;
      }

      if (item.action !== 'planned_upload') {
        counters.failedTargets += 1;
        results.push({
          audioId: item.audioId,
          action: item.action,
          ok: false,
          error: item.reason,
        });
        continue;
      }

      console.log(`○ Uploading ${item.audioId}`);
      const uploaded = await uploadOneTarget({
        target: item.target,
        classified: item,
        toAbsolute,
        counters,
        remoteInspector: adapters.remoteInspector,
        wranglerRunner: adapters.wranglerRunner,
        sleep: adapters.sleep,
      });
      results.push(uploaded);

      if (uploaded.ok) {
        console.log(`○ Upload result: ${uploaded.action}`);
        console.log(`  r2Key=${uploaded.r2Key}`);
        console.log(`  publicUrl=${uploaded.publicUrl}`);
      } else {
        console.error(`○ Upload failed: ${item.audioId}`);
        console.error(`  ${uploaded.action}: ${uploaded.reason}`);
      }
    }

    const successful = results.filter((item) => item.ok && !item.untouched);
    const failed = results.filter((item) => !item.ok);
    const skipped = results.filter(
      (item) => item.action === 'skip_existing_verified',
    );

    if (failed.length) {
      exitCode = 1;
    }

    console.log('');
    console.log('○ Upload write summary');
    console.log(`  skipped_existing_verified=${skipped.length}`);
    console.log(`  successful=${successful.length}`);
    console.log(`  failures=${failed.length}`);
    for (const item of successful) {
      console.log(`  + ${item.audioId} ${item.action}`);
    }
    for (const item of failed) {
      console.log(
        `  ! ${item.audioId} ${item.action}: ${item.error || item.reason}`,
      );
    }
  } catch (error) {
    exitCode = 1;
    console.error(`○ STOP: upload write failed: ${error.message}`);
  } finally {
    if (lockHeld) {
      const released = releaseUploadLock(lockPath);
      counters.uploadLockReleased = released.ok ? 1 : 0;
      console.log('○ Upload lock');
      console.log(`  uploadLockPath=${lockPath}`);
      console.log(`  uploadLockReleased=${released.ok}`);
      console.log(`  released=${released.ok}`);
      if (!released.ok) {
        console.error(`  release failed: ${released.reason}`);
        exitCode = 1;
      }
    }
    printUploadCounters(counters);
  }

  process.exit(exitCode);
}

async function buildManifestPreflight(plan, counters = null, adapters = null) {
  if (!adapters || typeof adapters.remoteInspector !== 'function') {
    throw new Error('manifest adapters.remoteInspector is required');
  }
  if (!adapters || typeof adapters.manifestLoader !== 'function') {
    throw new Error('manifest adapters.manifestLoader is required');
  }

  const actions = [];
  const blockers = [];

  for (const target of plan.targets) {
    const classified = await classifyManifestTarget({
      target,
      root: ROOT,
      toAbsolute,
      counters,
      manifestLoader: adapters.manifestLoader,
      remoteInspector: adapters.remoteInspector,
    });
    actions.push({
      target,
      ...classified,
    });

    if (String(classified.action).startsWith('block_')) {
      blockers.push(
        `${classified.manifestId || classified.audioId || target.audioId}: ${classified.action} (${classified.reason})`,
      );
    }
  }

  const planned = actions.filter(
    (item) => item.action === 'planned_manifest_append',
  );
  const skipped = actions.filter(
    (item) => item.action === 'skip_existing_manifest_verified',
  );
  const hardBlockers = actions.filter((item) =>
    String(item.action).startsWith('block_'),
  );

  return {
    actions,
    blockers,
    hardBlockers,
    planned,
    skipped,
    plannedTargets: plan.targets.length,
    plannedManifestEntries: planned.length,
    existingManifestVerifiedTargets: skipped.length,
  };
}

function printManifestDiagnostics(item) {
  console.log(`○ Manifest diagnostics ${item.manifestId || item.target?.audioId}`);
  console.log(`  locale=${item.locale}`);
  console.log(`  book=${item.book}`);
  console.log(`  chapter=${item.chapter}`);
  console.log(`  verse=${item.verse}`);
  console.log(`  manifestId=${item.manifestId}`);
  console.log(`  publicUrl=${item.publicUrl ?? 'n/a'}`);
  console.log(`  localSize=${item.localSize ?? 'n/a'}`);
  console.log(`  localSha256=${item.localSha256 ?? 'n/a'}`);
  console.log(`  localDuration=${item.localDuration ?? 'n/a'}`);
  console.log(`  cueSegmentCount=${item.cueSegmentCount ?? 'n/a'}`);
  console.log(`  cueItemCount=${item.cueItemCount ?? 'n/a'}`);
  console.log(`  remoteResult=${item.remoteResult ?? 'n/a'}`);
  console.log(`  manifestResult=${item.manifestResult ?? item.action}`);
  console.log(`  action=${item.action}`);
  if (item.reason) {
    console.log(`  reason=${item.reason}`);
  }
}

function printManifestPlan(plan, preflight, mode) {
  console.log('○ Request');
  console.log(
    `  stage=manifest mode=${mode} locales=${plan.locales.join(',')} book=${plan.bookId} chapter=${plan.chapter} verses=${plan.fromVerse}-${plan.toVerse} type=${plan.types.join(',')}`,
  );
  console.log('');
  console.log('○ Locale target count');
  console.log(`  ${plan.targetCount}`);
  console.log('');
  console.log('○ Manifest actions');
  for (const item of preflight.actions) {
    console.log(
      `  - ${item.locale} | ${item.book}/${item.chapter}/${item.verse} | ${item.manifestId} | ${item.action} | ${item.publicUrl || 'n/a'}`,
    );
  }
  console.log('');

  for (const item of preflight.actions) {
    printManifestDiagnostics(item);
    console.log('');
  }

  console.log('○ planned_manifest_append');
  console.log(`  ${preflight.plannedManifestEntries}`);
  for (const item of preflight.planned) {
    console.log(`  - ${item.manifestId}`);
  }
  console.log('');
  console.log('○ skip_existing_manifest_verified');
  console.log(`  ${preflight.existingManifestVerifiedTargets}`);
  for (const item of preflight.skipped) {
    console.log(`  - ${item.manifestId}`);
  }
  console.log('');
  console.log('○ plannedTargets');
  console.log(`  ${preflight.plannedTargets}`);
  console.log('○ plannedManifestEntries');
  console.log(`  ${preflight.plannedManifestEntries}`);
  console.log('○ existingManifestVerifiedTargets');
  console.log(`  ${preflight.existingManifestVerifiedTargets}`);
  console.log('');
  console.log('○ Blockers');
  if (!preflight.blockers.length) {
    console.log('  none');
  } else {
    for (const blocker of preflight.blockers) {
      console.log(`  - ${blocker}`);
    }
  }
  console.log('');
  console.log(
    mode === 'dry-run'
      ? '○ Mode: manifest dry-run (no lock, no manifest write, no R2 mutation)'
      : '○ Mode: manifest write',
  );
}

function printManifestCounters(counters) {
  console.log('○ Manifest counters (current manifest write execution only)');
  console.log(`  plannedTargets=${counters.plannedTargets}`);
  console.log(`  cueValidatedTargets=${counters.cueValidatedTargets}`);
  console.log(`  remoteVerifiedTargets=${counters.remoteVerifiedTargets}`);
  console.log(
    `  existingManifestVerifiedTargets=${counters.existingManifestVerifiedTargets}`,
  );
  console.log(`  plannedManifestEntries=${counters.plannedManifestEntries}`);
  console.log(`  writtenManifestEntries=${counters.writtenManifestEntries}`);
  console.log(`  blockedTargets=${counters.blockedTargets}`);
  console.log(`  failedTargets=${counters.failedTargets}`);
  console.log(
    `  remoteVerificationAttempts=${counters.remoteVerificationAttempts}`,
  );
  console.log(`  manifestLockAcquired=${counters.manifestLockAcquired}`);
  console.log(`  manifestLockReleased=${counters.manifestLockReleased}`);
}

async function runManifestStage(args, plan) {
  if (isManifestTestMode()) {
    console.error(
      '○ STOP: GOMNA_COMMENTARY_MULTILANG_TEST_MODE=1 blocks the production manifest stage',
    );
    process.exit(1);
  }

  if (args.dryRun) {
    const adapters = createProductionManifestAdapters();
    const preflight = await buildManifestPreflight(plan, null, adapters);
    printManifestPlan(plan, preflight, 'dry-run');
    console.log('○ Manifest lock');
    console.log(`  manifestLockPath=${GLOBAL_MANIFEST_LOCK_PATH}`);
    console.log('  manifestLockAcquired=false');
    console.log('  acquired=false (dry-run does not acquire a write lock)');
    if (preflight.hardBlockers.length) {
      console.error('○ STOP: manifest preflight hard blockers present');
      process.exit(1);
    }
    process.exit(0);
  }

  assertManifestWriteGuards(args);

  const adapters = createProductionManifestAdapters();
  const lockPath = buildManifestLockPath();
  const counters = createEmptyManifestCounters();
  let lockHeld = false;
  let exitCode = 0;

  try {
    const lock = acquireManifestLock(lockPath);
    if (!lock.ok) {
      console.error(`○ STOP: ${lock.action}`);
      console.error(`  ${lock.reason}`);
      console.error(`  manifestLockPath=${lockPath}`);
      process.exit(1);
    }
    lockHeld = true;
    counters.manifestLockAcquired = 1;

    console.log('○ Manifest lock');
    console.log(`  manifestLockPath=${lockPath}`);
    console.log('  manifestLockAcquired=true');
    console.log('  acquired=true');

    const result = await writeManifestForTargets({
      targets: plan.targets,
      toAbsolute,
      counters,
      manifestLoader: adapters.manifestLoader,
      manifestWriter: adapters.manifestWriter,
      remoteInspector: adapters.remoteInspector,
    });

    printManifestPlan(
      plan,
      {
        actions: result.classifications,
        blockers: (result.blockers || []).map(
          (item) =>
            `${item.manifestId}: ${item.action} (${item.reason})`,
        ),
        hardBlockers: result.blockers || [],
        planned: (result.classifications || []).filter(
          (item) => item.action === 'planned_manifest_append',
        ),
        skipped: (result.classifications || []).filter(
          (item) => item.action === 'skip_existing_manifest_verified',
        ),
        plannedTargets: plan.targets.length,
        plannedManifestEntries: (result.classifications || []).filter(
          (item) => item.action === 'planned_manifest_append',
        ).length,
        existingManifestVerifiedTargets: (result.classifications || []).filter(
          (item) => item.action === 'skip_existing_manifest_verified',
        ).length,
      },
      'write',
    );

    if (!result.ok) {
      exitCode = 1;
      console.error(`○ STOP: ${result.action}: ${result.reason}`);
    } else {
      console.log('');
      console.log('○ Manifest write summary');
      console.log(`  written=${result.written}`);
      console.log(
        `  writtenManifestEntries=${result.writtenManifestEntries || 0}`,
      );
      console.log(`  action=${result.action}`);
    }
  } catch (error) {
    exitCode = 1;
    console.error(`○ STOP: manifest write failed: ${error.message}`);
  } finally {
    if (lockHeld) {
      const released = releaseManifestLock(lockPath);
      counters.manifestLockReleased = released.ok ? 1 : 0;
      console.log('○ Manifest lock');
      console.log(`  manifestLockPath=${lockPath}`);
      console.log(`  manifestLockReleased=${released.ok}`);
      console.log(`  released=${released.ok}`);
      if (!released.ok) {
        console.error(`  release failed: ${released.reason}`);
        exitCode = 1;
      }
    }
    printManifestCounters(counters);
  }

  process.exit(exitCode);
}

function runPlanningMode(args) {
  if (!args.dryRun) {
    console.error('○ Error: planning mode requires --dry-run');
    console.error(printUsage());
    process.exit(1);
  }

  if (args.write) {
    console.error(
      '○ Error: --write requires --stage narration, --stage audio, --stage cue, --stage upload, or --stage manifest',
    );
    console.error(printUsage());
    process.exit(1);
  }

  let plan;
  try {
    plan = buildCommentaryMultilangTargets({
      locales: args.locales,
      bookId: args.book,
      chapter: args.chapter,
      fromVerse: args.fromVerse,
      toVerse: args.toVerse,
      type: args.type,
      types: args.types,
    });
  } catch (error) {
    console.error(`○ Error: ${error.message}`);
    process.exit(1);
  }

  const summary = classifyPlan(plan);
  if (summary.blockers.length) {
    console.error('○ Error: blockers detected');
    for (const blocker of summary.blockers) {
      console.error(`  - ${blocker}`);
    }
    process.exit(1);
  }

  let inventory;
  try {
    inventory = inventoryCommentarySource();
  } catch (error) {
    inventory = {
      limitation: `Inventory unavailable: ${error.message}`,
      booksLoadedCount: null,
      uniqueVerseKeysWithAnyStructure: null,
      uniqueVerseKeysWithAtLeastOneType: null,
      totalCommentaryTypeRecords: null,
      duplicateExactKeys: [],
      malformedKeys: [],
      booksFailed: [],
    };
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(buildJsonPayload(plan, summary, inventory), null, 2)}\n`,
    );
  } else {
    console.log(printReadable(plan, summary, inventory));
  }

  process.exit(0);
}

async function main() {
  let args;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`○ Error: ${error.message}`);
    console.error(printUsage());
    process.exit(1);
  }

  if (args.help) {
    console.log(printUsage());
    process.exit(0);
  }

  const required = [
    ['--locales', args.locales],
    ['--book', args.book],
    ['--chapter', args.chapter],
    ['--from-verse', args.fromVerse],
    ['--to-verse', args.toVerse],
  ];

  for (const [label, value] of required) {
    if (value == null || String(value).trim() === '') {
      console.error(`○ Error: ${label} is required`);
      console.error(printUsage());
      process.exit(1);
    }
  }

  if (args.stage && !ACCEPTED_STAGES.has(args.stage)) {
    console.error(`○ Error: unsupported --stage ${args.stage}`);
    process.exit(1);
  }

  if (args.write && !ACCEPTED_STAGES.has(args.stage)) {
    console.error(
      '○ Error: --write requires --stage narration, --stage audio, --stage cue, --stage upload, or --stage manifest',
    );
    console.error(printUsage());
    process.exit(1);
  }

  if (args.write && args.dryRun) {
    console.error('○ Error: --write and --dry-run cannot be combined');
    process.exit(1);
  }

  if (args.repairInvalidDrafts && args.stage !== 'narration') {
    console.error(
      '○ Error: --repair-invalid-drafts requires --stage narration',
    );
    process.exit(1);
  }

  if (
    args.stage === 'narration' ||
    args.stage === 'audio' ||
    args.stage === 'cue' ||
    args.stage === 'upload' ||
    args.stage === 'manifest'
  ) {
    if (!args.dryRun && !args.write) {
      console.error(
        `○ Error: --stage ${args.stage} requires either --dry-run or --write`,
      );
      process.exit(1);
    }

    if (args.types != null) {
      console.error(
        `○ Error: --types all is rejected for the ${args.stage} stage in this pilot`,
      );
      process.exit(1);
    }

    if (args.type == null || String(args.type).trim() === '') {
      console.error(`○ Error: --type is required for the ${args.stage} stage`);
      process.exit(1);
    }

    if (args.json) {
      console.error(
        `○ Error: --json is not supported for --stage ${args.stage}`,
      );
      process.exit(1);
    }

    if (args.stage === 'audio' && args.repairInvalidDrafts) {
      console.error(
        '○ Error: --repair-invalid-drafts is invalid for --stage audio',
      );
      process.exit(1);
    }

    if (args.stage === 'cue' && args.repairInvalidDrafts) {
      console.error(
        '○ Error: --repair-invalid-drafts is invalid for --stage cue',
      );
      process.exit(1);
    }

    if (args.stage === 'upload' && args.repairInvalidDrafts) {
      console.error(
        '○ Error: --repair-invalid-drafts is invalid for --stage upload',
      );
      process.exit(1);
    }

    if (args.stage === 'manifest' && args.repairInvalidDrafts) {
      console.error(
        '○ Error: --repair-invalid-drafts is invalid for --stage manifest',
      );
      process.exit(1);
    }

    let plan;
    try {
      plan = buildCommentaryMultilangTargets({
        locales: args.locales,
        bookId: args.book,
        chapter: args.chapter,
        fromVerse: args.fromVerse,
        toVerse: args.toVerse,
        type: args.type,
      });
    } catch (error) {
      console.error(`○ Error: ${error.message}`);
      process.exit(1);
    }

    if (args.stage === 'narration') {
      await runNarrationStage(args, plan);
      return;
    }

    if (args.stage === 'audio') {
      await runAudioStage(args, plan);
      return;
    }

    if (args.stage === 'cue') {
      runCueStage(args, plan);
      return;
    }

    if (args.stage === 'upload') {
      await runUploadStage(args, plan);
      return;
    }

    await runManifestStage(args, plan);
    return;
  }

  if (args.repairInvalidDrafts) {
    console.error(
      '○ Error: --repair-invalid-drafts is invalid in planning-only mode',
    );
    process.exit(1);
  }

  runPlanningMode(args);
}

main().catch((error) => {
  console.error(`○ STOP: ${error.message}`);
  process.exit(1);
});
