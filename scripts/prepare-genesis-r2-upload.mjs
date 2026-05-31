import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const CONFIG = {
  bookId: 'genesis',
  language: 'ko-KR',
  sourceFileName: 'bible-calm.mp3',
  r2KeyBase: 'bible/ko/gae/genesis',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
};

function usage() {
  console.error('Usage: node scripts/prepare-genesis-r2-upload.mjs --chapter 2 --from-verse 1 --to-verse 25 [--dry-run|--write]');
  console.error('Default mode: --dry-run');
}

function parseArgs(argv) {
  const args = {
    chapter: null,
    fromVerse: null,
    toVerse: null,
    dryRun: true,
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--write') {
      args.write = true;
      args.dryRun = false;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!Number.isInteger(args.chapter) || args.chapter < 1) {
    usage();
    throw new Error('유효한 --chapter 값을 입력하세요.');
  }

  if (!Number.isInteger(args.fromVerse) || args.fromVerse < 1) {
    usage();
    throw new Error('유효한 --from-verse 값을 입력하세요.');
  }

  if (!Number.isInteger(args.toVerse) || args.toVerse < 1) {
    usage();
    throw new Error('유효한 --to-verse 값을 입력하세요.');
  }

  if (args.fromVerse > args.toVerse) {
    throw new Error('--from-verse 값은 --to-verse 값보다 클 수 없습니다.');
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function buildPlanItem({ chapter, verse }) {
  const chapter3 = pad3(chapter);
  const verse3 = pad3(verse);
  const sourcePath = path.join(
    ROOT,
    'audio',
    'v1',
    CONFIG.language,
    CONFIG.bookId,
    chapter3,
    verse3,
    CONFIG.sourceFileName,
  );
  const targetFileName = `${verse3}.mp3`;
  const outputDir = path.join(os.homedir(), 'Downloads', `r2-upload-genesis-${chapter3}`);
  const targetPath = path.join(outputDir, targetFileName);
  const r2Key = `${CONFIG.r2KeyBase}/${chapter3}/${targetFileName}`;

  return {
    chapter,
    chapter3,
    verse,
    verse3,
    sourcePath,
    sourceRelativePath: path.relative(ROOT, sourcePath),
    targetPath,
    targetDisplayPath: path.join('~', path.relative(os.homedir(), targetPath)),
    outputDir,
    outputDisplayDir: path.join('~', path.relative(os.homedir(), outputDir)),
    targetFileName,
    r2Key,
    publicUrl: `${CONFIG.publicBaseUrl}/${r2Key}`,
    exists: fs.existsSync(sourcePath),
  };
}

function buildPlan(args) {
  const items = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    items.push(buildPlanItem({ chapter: args.chapter, verse }));
  }

  return items;
}

function copyExistingItems(items) {
  const outputDirs = new Set(items.map((item) => item.outputDir));

  for (const outputDir of outputDirs) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const item of items) {
    if (!item.exists) continue;
    fs.copyFileSync(item.sourcePath, item.targetPath);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const items = buildPlan(args);
  const existingItems = items.filter((item) => item.exists);
  const missingItems = items.filter((item) => !item.exists);

  if (args.write) {
    copyExistingItems(items);
  }

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    fileModified: args.write && existingItems.length > 0,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    r2Bucket: 'gomna-bible-audio-prod',
    r2KeyBase: CONFIG.r2KeyBase,
    publicBaseUrl: CONFIG.publicBaseUrl,
    targetCount: items.length,
    copyPlannedCount: existingItems.length,
    missingCount: missingItems.length,
    copiedCount: args.write ? existingItems.length : 0,
    outputDir: items[0] ? items[0].outputDisplayDir : null,
    missing: missingItems.map((item) => ({
      verse: item.verse,
      sourceRelativePath: item.sourceRelativePath,
      targetFileName: item.targetFileName,
      r2Key: item.r2Key,
    })),
    plannedUploads: items.map((item) => ({
      verse: item.verse,
      sourceRelativePath: item.sourceRelativePath,
      targetDisplayPath: item.targetDisplayPath,
      r2Key: item.r2Key,
      publicUrl: item.publicUrl,
      exists: item.exists,
      action: item.exists ? (args.write ? 'copied' : 'copy-planned') : 'missing',
    })),
  }, null, 2));

  if (args.write && missingItems.length > 0) {
    process.exitCode = 1;
  }
}

main();
