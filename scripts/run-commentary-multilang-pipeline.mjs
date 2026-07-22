#!/usr/bin/env node
/**
 * Multilingual commentary pipeline — planning / preflight only.
 *
 * This first version supports --dry-run planning. It does not generate
 * narrations, MP3s, Cue files, R2 uploads, or manifest entries.
 */

import {
  buildCommentaryMultilangTargets,
  inventoryCommentarySource,
} from './lib/commentary-multilang-targets.mjs';

const FORBIDDEN_FLAGS = new Set([
  '--write',
  '--upload',
  '--publish',
  '--force',
  '--overwrite',
]);

function printUsage() {
  return [
    'Usage:',
    '  node scripts/run-commentary-multilang-pipeline.mjs \\',
    '    --locales en-US,ja-JP \\',
    '    --book genesis \\',
    '    --chapter 1 \\',
    '    --from-verse 1 \\',
    '    --to-verse 3 \\',
    '    --type original-language \\',
    '    --dry-run',
    '',
    '  Exactly one of --type <name> or --types all is required.',
    '  --dry-run is mandatory. --write/--upload/--publish/--force/--overwrite are rejected.',
    '  Optional: --json',
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
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (FORBIDDEN_FLAGS.has(token)) {
      throw new Error(
        `Forbidden flag in this phase: ${token}. Planning is --dry-run only.`,
      );
    }

    if (token === '--dry-run') {
      args.dryRun = true;
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

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function statusLabel(exists, approvedOrPublished) {
  if (!exists) return 'missing';
  if (approvedOrPublished === true) return 'present+approved';
  if (approvedOrPublished === false) return 'present';
  return 'present';
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
  lines.push(
    `  duplicateExactKeys=${inventory.duplicateExactKeys.length}`,
  );
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

function main() {
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

  if (!args.dryRun) {
    console.error('○ Error: --dry-run is mandatory in this phase');
    console.error(printUsage());
    process.exit(1);
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

main();
