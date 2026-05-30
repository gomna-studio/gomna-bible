import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const CONFIG = {
  chapter: '001',
  verseStart: 3,
  verseEnd: 31,
  sourceBaseDir: path.join(ROOT, 'audio', 'v1', 'ko-KR', 'genesis', '001'),
  outputDir: path.join(os.homedir(), 'Downloads', 'r2-upload-genesis-001-full'),
  sourceFileName: 'bible-calm.mp3',
  r2KeyPrefix: 'bible/ko/gae/genesis/001',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
};

function usage() {
  console.error('Usage: node scripts/prepare-genesis-001-r2-upload.mjs [--dry-run|--write]');
  console.error('Default: --dry-run');
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    write: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
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

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function buildPlanItem(verse) {
  const verse3 = pad3(verse);
  const sourcePath = path.join(CONFIG.sourceBaseDir, verse3, CONFIG.sourceFileName);
  const targetFileName = `${verse3}.mp3`;
  const targetPath = path.join(CONFIG.outputDir, targetFileName);
  const r2Key = `${CONFIG.r2KeyPrefix}/${targetFileName}`;

  return {
    verse,
    verse3,
    sourcePath,
    sourceRelativePath: path.relative(ROOT, sourcePath),
    targetPath,
    targetDisplayPath: path.join('~', path.relative(os.homedir(), targetPath)),
    targetFileName,
    r2Key,
    publicUrl: `${CONFIG.publicBaseUrl}/${r2Key}`,
    exists: fs.existsSync(sourcePath),
  };
}

function buildPlan() {
  const items = [];

  for (let verse = CONFIG.verseStart; verse <= CONFIG.verseEnd; verse++) {
    items.push(buildPlanItem(verse));
  }

  return items;
}

function copyExistingItems(items) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  for (const item of items) {
    if (!item.exists) continue;
    fs.copyFileSync(item.sourcePath, item.targetPath);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const items = buildPlan();
  const existingItems = items.filter((item) => item.exists);
  const missingItems = items.filter((item) => !item.exists);

  if (args.write) {
    copyExistingItems(items);
  }

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    fileModified: args.write && existingItems.length > 0,
    sourceBaseDir: path.relative(ROOT, CONFIG.sourceBaseDir),
    outputDir: path.join('~', path.relative(os.homedir(), CONFIG.outputDir)),
    r2Bucket: 'gomna-bible-audio-prod',
    r2KeyPrefix: CONFIG.r2KeyPrefix,
    publicBaseUrl: CONFIG.publicBaseUrl,
    targetCount: items.length,
    copyPlannedCount: existingItems.length,
    missingCount: missingItems.length,
    copiedCount: args.write ? existingItems.length : 0,
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
