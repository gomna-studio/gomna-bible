import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');
const DEFAULT_VERIFIED_LIST_PATH = path.join(ROOT, 'reports', 'verified-audio-ko-KR.json');

const CONFIG = {
  book: '창세기',
  bookId: 'genesis',
  language: 'ko-KR',
  chapter: 1,
  chapter3: '001',
  verseStart: 1,
  verseEnd: 31,
  type: 'bible',
  typeKr: '본문',
  voicePreset: 'calm',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
  r2KeyPrefix: 'bible/ko/gae/genesis/001',
};

function usage() {
  console.error('Usage: node scripts/sync-genesis-001-r2-manifest.mjs [--verified-list reports/verified-audio-ko-KR.json] [--dry-run|--write]');
  console.error('Default: --dry-run');
}

function parseArgs(argv) {
  const args = {
    verifiedListPath: DEFAULT_VERIFIED_LIST_PATH,
    dryRun: true,
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--verified-list') {
      args.verifiedListPath = path.isAbsolute(argv[++i])
        ? argv[i]
        : path.join(ROOT, argv[i]);
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

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readVerifiedAudioIds(verifiedListPath) {
  if (!fs.existsSync(verifiedListPath)) {
    throw new Error(`검수 목록 파일을 찾지 못했습니다: ${path.relative(ROOT, verifiedListPath)}`);
  }

  const data = readJson(verifiedListPath);
  const rawItems = Array.isArray(data)
    ? data
    : data.verifiedAudios || data.audios || [];

  return new Set(rawItems.map((item) => {
    if (typeof item === 'string') return item;
    return item.id || item.audioId;
  }).filter(Boolean));
}

function buildAudioId(verse) {
  return `${CONFIG.bookId}.${CONFIG.chapter3}.${pad3(verse)}.${CONFIG.type}`;
}

function buildR2Url(verse) {
  return `${CONFIG.publicBaseUrl}/${CONFIG.r2KeyPrefix}/${pad3(verse)}.mp3`;
}

function preserveOrBuildR2Url(existingEntry, verse, verified) {
  const expectedUrl = buildR2Url(verse);

  if (!verified) {
    return existingEntry && existingEntry.filePath ? existingEntry.filePath : expectedUrl;
  }

  if (
    existingEntry &&
    typeof existingEntry.filePath === 'string' &&
    existingEntry.filePath === expectedUrl
  ) {
    return existingEntry.filePath;
  }

  return expectedUrl;
}

function buildNextManifest(manifest, verifiedAudioIds) {
  const existingAudios = manifest.audios || {};
  const nextAudios = { ...existingAudios };
  const plannedEntries = [];

  for (let verse = CONFIG.verseStart; verse <= CONFIG.verseEnd; verse++) {
    const id = buildAudioId(verse);
    const existingEntry = existingAudios[id] || {};
    const verified = verifiedAudioIds.has(id);
    const status = verified ? 'published' : 'draft';
    const nextEntry = {
      id,
      book: CONFIG.book,
      bookId: CONFIG.bookId,
      language: CONFIG.language,
      chapter: CONFIG.chapter,
      verse,
      type: CONFIG.type,
      typeKr: CONFIG.typeKr,
      voicePreset: existingEntry.voicePreset || CONFIG.voicePreset,
      filePath: preserveOrBuildR2Url(existingEntry, verse, verified),
      duration: Number.isFinite(existingEntry.duration) ? existingEntry.duration : 0,
      fileSize: Number.isFinite(existingEntry.fileSize) ? existingEntry.fileSize : 0,
      status,
      verificationStatus: verified ? 'verified' : 'unverified',
      verified,
      preview: existingEntry.preview || '',
    };

    nextAudios[id] = nextEntry;
    plannedEntries.push({
      id,
      verse,
      status,
      verified,
      filePath: nextEntry.filePath,
      previousStatus: existingEntry.status || null,
      previousFilePath: existingEntry.filePath || null,
      filePathChanged: existingEntry.filePath !== nextEntry.filePath,
      statusChanged: existingEntry.status !== nextEntry.status,
    });
  }

  return {
    nextManifest: {
      ...manifest,
      lastUpdated: new Date().toISOString().slice(0, 10),
      totalAudios: Object.keys(nextAudios).length,
      audios: nextAudios,
    },
    plannedEntries,
  };
}

function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function countStatus(entries) {
  return {
    publishedCount: entries.filter((entry) => entry.status === 'published').length,
    draftCount: entries.filter((entry) => entry.status === 'draft').length,
    verifiedCount: entries.filter((entry) => entry.verified).length,
    filePathChangedCount: entries.filter((entry) => entry.filePathChanged).length,
    statusChangedCount: entries.filter((entry) => entry.statusChanged).length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJson(MANIFEST_PATH);
  const verifiedAudioIds = readVerifiedAudioIds(args.verifiedListPath);
  const { nextManifest, plannedEntries } = buildNextManifest(manifest, verifiedAudioIds);
  const currentSerialized = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const nextSerialized = serializeManifest(nextManifest);
  const manifestModified = currentSerialized !== nextSerialized;

  if (args.write) {
    fs.writeFileSync(MANIFEST_PATH, nextSerialized, 'utf8');
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    fileModified: args.write ? manifestModified : false,
    manifestModified,
    manifestPath: path.relative(ROOT, MANIFEST_PATH),
    verifiedListPath: path.relative(ROOT, args.verifiedListPath),
    verifiedListCount: verifiedAudioIds.size,
    publicBaseUrl: CONFIG.publicBaseUrl,
    r2KeyPrefix: CONFIG.r2KeyPrefix,
    targetCount: plannedEntries.length,
    summary: countStatus(plannedEntries),
    publishedEntries: plannedEntries
      .filter((entry) => entry.status === 'published')
      .map((entry) => entry.id),
    draftEntries: plannedEntries
      .filter((entry) => entry.status === 'draft')
      .map((entry) => entry.id),
    sampleEntries: plannedEntries.filter((entry) => entry.verse <= 3 || entry.verse === 31),
  }, null, 2));
}

main();
