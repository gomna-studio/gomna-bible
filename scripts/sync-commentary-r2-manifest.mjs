import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');

const DEFAULT_TARGET = {
  book: '창세기',
  bookId: 'genesis',
  language: 'ko-KR',
  chapter: 1,
  verse: 4,
  chapter3: '001',
  verse3: '004',
  r2BaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev/commentary/ko/gae/genesis/001/004',
};

const COMMENTARY_TYPES = [
  {
    type: 'original-language',
    typeKr: '원어분석',
    voicePreset: 'study',
    fileName: 'original-language-study.mp3',
    preview: '이 구절의 핵심 원어와 표현을 살펴봅니다.',
  },
  {
    type: 'history',
    typeKr: '역사적배경',
    voicePreset: 'warm',
    fileName: 'history-warm.mp3',
    preview: '이 말씀이 기록되던 시대 배경을 살펴봅니다.',
  },
  {
    type: 'theology',
    typeKr: '신학적의미',
    voicePreset: 'warm',
    fileName: 'theology-warm.mp3',
    preview: '이 말씀의 신학적 의미를 살펴봅니다.',
  },
  {
    type: 'typology',
    typeKr: '예표론',
    voicePreset: 'study',
    fileName: 'typology-study.mp3',
    preview: '이 본문이 구속사와 어떻게 연결되는지 살펴봅니다.',
  },
  {
    type: 'matthew-henry',
    typeKr: '매튜헨리',
    voicePreset: 'calm',
    fileName: 'matthew-henry-calm.mp3',
    preview: '이 구절에 대한 매튜 헨리의 고전적 해석을 살펴봅니다.',
  },
  {
    type: 'sermon',
    typeKr: '설교자료',
    voicePreset: 'strong',
    fileName: 'sermon-strong.mp3',
    preview: '이 본문을 설교로 전할 때 강조할 내용을 살펴봅니다.',
  },
  {
    type: 'hymn',
    typeKr: '찬송가',
    voicePreset: 'soft',
    fileName: 'hymn-soft.mp3',
    preview: '이 말씀과 함께 묵상할 수 있는 찬송을 살펴봅니다.',
  },
  {
    type: 'counseling',
    typeKr: '상담적용',
    voicePreset: 'warm',
    fileName: 'counseling-warm.mp3',
    preview: '이 말씀이 오늘의 마음과 삶에 어떻게 적용되는지 살펴봅니다.',
  },
  {
    type: 'cross-reference',
    typeKr: '교차참조',
    voicePreset: 'calm',
    fileName: 'cross-reference-calm.mp3',
    preview: '이 구절과 연결되는 다른 말씀들을 살펴봅니다.',
  },
];

function usage() {
  console.error('Usage: node scripts/sync-commentary-r2-manifest.mjs --locale ko-KR --book genesis --chapter 1 --verse 4 --dry-run');
  console.error('   or: node scripts/sync-commentary-r2-manifest.mjs --locale ko-KR --book genesis --chapter 1 --verse 4 --write');
  console.error('Default mode is --dry-run. Current safe target is ko-KR genesis 1:4 commentary only.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    dryRun: true,
    write: false,
  };
  let dryRunExplicit = false;
  let writeExplicit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--locale' || arg === '--language') {
      args.locale = argv[++i];
    } else if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--verse') {
      args.verse = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      dryRunExplicit = true;
      args.dryRun = true;
    } else if (arg === '--write') {
      writeExplicit = true;
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

  if (dryRunExplicit && writeExplicit) {
    throw new Error('--dry-run과 --write는 동시에 사용할 수 없습니다.');
  }

  if (!args.bookId || !args.chapter || !args.verse || !args.locale) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  return args;
}

function assertTargetScope(args) {
  if (!isDefaultTarget(args) && !isPipelineAllowedTarget(args)) {
    throw new Error('이 스크립트는 현재 ko-KR 창세기 1장 4절 또는 master pipeline이 정확히 허용한 말씀풀이 manifest 동기화에만 사용할 수 있습니다.');
  }
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function targetKey(args) {
  return `${args.locale}:${args.bookId}:${args.chapter}:${args.verse}`;
}

function isDefaultTarget(args) {
  return (
    args.locale === DEFAULT_TARGET.language &&
    args.bookId === DEFAULT_TARGET.bookId &&
    args.chapter === DEFAULT_TARGET.chapter &&
    args.verse === DEFAULT_TARGET.verse
  );
}

function isPipelineAllowedTarget(args) {
  return (
    process.env.GOMNA_COMMENTARY_PIPELINE === '1' &&
    process.env.GOMNA_COMMENTARY_ALLOWED_TARGET === targetKey(args)
  );
}

function buildTarget(args) {
  const chapter3 = pad3(args.chapter);
  const verse3 = pad3(args.verse);

  return {
    book: args.bookId === 'genesis' ? '창세기' : args.bookId,
    bookId: args.bookId,
    language: args.locale,
    chapter: args.chapter,
    verse: args.verse,
    chapter3,
    verse3,
    r2BaseUrl: `https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev/commentary/ko/gae/${args.bookId}/${chapter3}/${verse3}`,
  };
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function buildAudioId(type, target) {
  return `${target.bookId}.${target.chapter3}.${target.verse3}.${type}`;
}

function localAudioPath(fileName, target) {
  return path.join(
    ROOT,
    'audio',
    'v1',
    target.language,
    target.bookId,
    target.chapter3,
    target.verse3,
    fileName,
  );
}

function readDuration(filePath) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.status !== 0) return 0;

  const duration = Number.parseFloat(String(result.stdout || '').trim());
  return Number.isFinite(duration) ? Number(duration.toFixed(3)) : 0;
}

function buildEntry(item, target) {
  const id = buildAudioId(item.type, target);
  const filePath = localAudioPath(item.fileName, target);
  const exists = fs.existsSync(filePath);
  const fileSize = exists ? fs.statSync(filePath).size : 0;

  if (!exists || fileSize <= 0) {
    throw new Error(`로컬 MP3를 찾지 못했거나 비어 있습니다: ${path.relative(ROOT, filePath)}`);
  }

  return {
    id,
    book: target.book,
    bookId: target.bookId,
    language: target.language,
    chapter: target.chapter,
    verse: target.verse,
    type: item.type,
    typeKr: item.typeKr,
    voicePreset: item.voicePreset,
    filePath: `${target.r2BaseUrl}/${item.fileName}`,
    duration: readDuration(filePath),
    fileSize,
    status: 'published',
    preview: item.preview,
  };
}

function buildNextManifest(manifest, target) {
  const existingAudios = manifest.audios || {};
  const nextAudios = { ...existingAudios };
  const plannedEntries = COMMENTARY_TYPES.map((item) => buildEntry(item, target));

  for (const entry of plannedEntries) {
    nextAudios[entry.id] = entry;
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

function pickComparableManifestEntries(manifest, ids) {
  const audios = manifest.audios || {};
  return Object.fromEntries(ids.map((id) => [id, audios[id] || null]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTargetScope(args);
  const target = buildTarget(args);

  const manifest = readManifest();
  const watchedIds = [
    ...COMMENTARY_TYPES.map((item) => `genesis.001.001.${item.type}`),
    ...COMMENTARY_TYPES.map((item) => `genesis.001.002.${item.type}`),
    ...COMMENTARY_TYPES.map((item) => `genesis.001.003.${item.type}`),
  ];
  const beforeWatchedEntries = pickComparableManifestEntries(manifest, watchedIds);
  const { nextManifest, plannedEntries } = buildNextManifest(manifest, target);
  const afterWatchedEntries = pickComparableManifestEntries(nextManifest, watchedIds);

  const currentSerialized = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const nextSerialized = serializeManifest(nextManifest);
  const manifestModified = currentSerialized !== nextSerialized;

  if (args.write) {
    fs.writeFileSync(MANIFEST_PATH, nextSerialized, 'utf8');
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }

  const existingAudios = manifest.audios || {};
  const existingTargetEntries = plannedEntries.filter((entry) => existingAudios[entry.id]);
  const createdEntries = plannedEntries.filter((entry) => !existingAudios[entry.id]);
  const updatedEntries = existingTargetEntries.filter((entry) => (
    JSON.stringify(existingAudios[entry.id]) !== JSON.stringify(entry)
  ));
  const filePathChangedEntries = plannedEntries.filter((entry) => (
    !existingAudios[entry.id] ||
    existingAudios[entry.id].filePath !== entry.filePath
  ));
  const watchedEntriesChanged = JSON.stringify(beforeWatchedEntries) !== JSON.stringify(afterWatchedEntries);

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    fileModified: args.write ? manifestModified : false,
    manifestModified,
    manifestPath: path.relative(ROOT, MANIFEST_PATH),
    target: {
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
      language: target.language,
    },
    r2KeyBase: `commentary/ko/gae/${target.bookId}/${target.chapter3}/${target.verse3}`,
    targetCount: plannedEntries.length,
    createdCount: createdEntries.length,
    updatedCount: updatedEntries.length,
    publishedCount: plannedEntries.filter((entry) => entry.status === 'published').length,
    filePathChangedCount: filePathChangedEntries.length,
    fileSizePositiveCount: plannedEntries.filter((entry) => entry.fileSize > 0).length,
    durationPositiveCount: plannedEntries.filter((entry) => entry.duration > 0).length,
    previousVersesChanged: watchedEntriesChanged,
    unexpectedFallbackToGenesis001001: plannedEntries.some((entry) => /genesis\/001\/001|genesis\.001\.001/.test(entry.filePath)),
    entries: plannedEntries,
  }, null, 2));
}

main();
