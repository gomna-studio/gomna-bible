#!/usr/bin/env node
/**
 * Multilingual commentary pipeline.
 *
 * Planning mode (default): --dry-run only.
 * Narration stage: --stage narration --dry-run| --write
 */

import fs from 'fs';
import path from 'path';
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

const ABSOLUTELY_FORBIDDEN = new Set([
  '--upload',
  '--publish',
  '--force',
  '--overwrite',
]);

const REQUIRED_TRANSLATION_FLAG = '1';
const REQUIRED_ALLOWED_TARGET =
  'genesis:1:1-3:original-language:en-US,ja-JP';
const REQUIRED_REPAIR_ALLOWED_TARGET =
  'genesis:1:2-3:original-language:en-US';
const REQUIRED_REPAIR_FLAG = '1';

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
    'Notes:',
    '  Planning mode requires --dry-run and rejects --write.',
    '  Narration write requires --stage narration --write plus env guards.',
    '  --upload/--publish/--force/--overwrite are always rejected.',
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

function assertNarrationWriteGuards(args) {
  const flag = process.env.GOMNA_COMMENTARY_MULTILANG_TRANSLATION;
  const allowed = process.env.GOMNA_COMMENTARY_MULTILANG_ALLOWED_TARGET;
  const expected = `${args.book}:${args.chapter}:${args.fromVerse}-${args.toVerse}:${args.type}:${args.locales}`;

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

function runPlanningMode(args) {
  if (!args.dryRun) {
    console.error('○ Error: planning mode requires --dry-run');
    console.error(printUsage());
    process.exit(1);
  }

  if (args.write) {
    console.error('○ Error: --write requires --stage narration');
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

  if (args.stage && args.stage !== 'narration') {
    console.error(`○ Error: unsupported --stage ${args.stage}`);
    process.exit(1);
  }

  if (args.write && args.stage !== 'narration') {
    console.error('○ Error: --write requires --stage narration');
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

  if (args.stage === 'narration') {
    if (!args.dryRun && !args.write) {
      console.error(
        '○ Error: --stage narration requires either --dry-run or --write',
      );
      process.exit(1);
    }

    if (args.types != null) {
      console.error(
        '○ Error: --types all is rejected for the narration stage in this pilot',
      );
      process.exit(1);
    }

    if (args.type == null || String(args.type).trim() === '') {
      console.error('○ Error: --type is required for the narration stage');
      process.exit(1);
    }

    if (args.json) {
      console.error('○ Error: --json is not supported for --stage narration');
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

    await runNarrationStage(args, plan);
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
