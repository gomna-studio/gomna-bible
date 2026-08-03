import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');
const VERIFY_REPORT_PATH = path.join(
  ROOT,
  'reports',
  'commentary-r2-upload',
  'genesis-004-050-full-verify.json',
);
const R2_PUBLIC_BASE = 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev';

const DEFAULT_TARGET = {
  book: '창세기',
  bookId: 'genesis',
  language: 'ko-KR',
  chapter: 1,
  verse: 4,
  chapter3: '001',
  verse3: '004',
  r2BaseUrl: `${R2_PUBLIC_BASE}/commentary/ko/gae/genesis/001/004`,
};

const GENESIS_VERSE_COUNTS = {
  1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 22, 7: 24, 8: 22, 9: 29, 10: 32,
  11: 32, 12: 20, 13: 18, 14: 24, 15: 21, 16: 16, 17: 27, 18: 33, 19: 38, 20: 18,
  21: 34, 22: 24, 23: 20, 24: 67, 25: 34, 26: 35, 27: 46, 28: 22, 29: 35, 30: 43,
  31: 55, 32: 32, 33: 20, 34: 31, 35: 29, 36: 43, 37: 36, 38: 30, 39: 23, 40: 23,
  41: 57, 42: 38, 43: 34, 44: 34, 45: 28, 46: 34, 47: 31, 48: 22, 49: 33, 50: 26,
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
  console.error('Usage:');
  console.error('  node scripts/sync-commentary-r2-manifest.mjs --locale ko-KR --book genesis --chapter 1 --verse 4 [--dry-run|--write]');
  console.error('  node scripts/sync-commentary-r2-manifest.mjs --locale ko-KR --book genesis --from-chapter 4 --to-chapter 50 [--dry-run|--write --confirm-create-count 13077]');
  console.error('Default mode is --dry-run.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    fromChapter: null,
    toChapter: null,
    dryRun: true,
    write: false,
    confirmCreateCount: null,
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
    } else if (arg === '--from-chapter') {
      args.fromChapter = Number(argv[++i]);
    } else if (arg === '--to-chapter') {
      args.toChapter = Number(argv[++i]);
    } else if (arg === '--confirm-create-count') {
      args.confirmCreateCount = Number(argv[++i]);
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

  if (!args.bookId || !args.locale) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  const rangeMode = args.fromChapter != null || args.toChapter != null;
  const verseMode = args.chapter != null || args.verse != null;
  if (rangeMode && verseMode) {
    throw new Error('범위 모드(--from-chapter/--to-chapter)와 단일 절 모드(--chapter/--verse)는 함께 쓸 수 없습니다.');
  }
  if (!rangeMode && (!args.chapter || !args.verse)) {
    usage();
    throw new Error('단일 절 모드에는 --chapter/--verse가 필요합니다.');
  }
  if (rangeMode && (!Number.isInteger(args.fromChapter) || !Number.isInteger(args.toChapter))) {
    throw new Error('--from-chapter/--to-chapter가 필요합니다.');
  }
  if (args.write && rangeMode && (!Number.isInteger(args.confirmCreateCount) || args.confirmCreateCount < 1)) {
    throw new Error('범위 --write에는 --confirm-create-count N이 필요합니다.');
  }

  args.rangeMode = rangeMode;
  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function targetKey(args) {
  return `${args.locale}:${args.bookId}:${args.chapter}:${args.verse}`;
}

function isDefaultTarget(args) {
  return (
    !args.rangeMode &&
    args.locale === DEFAULT_TARGET.language &&
    args.bookId === DEFAULT_TARGET.bookId &&
    args.chapter === DEFAULT_TARGET.chapter &&
    args.verse === DEFAULT_TARGET.verse
  );
}

function isPipelineAllowedTarget(args) {
  return (
    !args.rangeMode &&
    process.env.GOMNA_COMMENTARY_PIPELINE === '1' &&
    process.env.GOMNA_COMMENTARY_ALLOWED_TARGET === targetKey(args)
  );
}

function isGenesis4to50Range(args) {
  return (
    args.rangeMode &&
    args.locale === 'ko-KR' &&
    args.bookId === 'genesis' &&
    args.fromChapter === 4 &&
    args.toChapter === 50
  );
}

function assertTargetScope(args) {
  if (isDefaultTarget(args) || isPipelineAllowedTarget(args) || isGenesis4to50Range(args)) {
    return;
  }
  throw new Error(
    '이 스크립트는 ko-KR 창세기 단일 절(기본/파이프라인 허용) 또는 승인된 창세기 4~50장 범위 manifest 동기화에만 사용할 수 있습니다.',
  );
}

function buildTarget(bookId, language, chapter, verse) {
  const chapter3 = pad3(chapter);
  const verse3 = pad3(verse);
  return {
    book: bookId === 'genesis' ? '창세기' : bookId,
    bookId,
    language,
    chapter,
    verse,
    chapter3,
    verse3,
    r2BaseUrl: `${R2_PUBLIC_BASE}/commentary/ko/gae/${bookId}/${chapter3}/${verse3}`,
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

function localCuePath(type, target) {
  return path.join(
    ROOT,
    'audio',
    'cues',
    target.language,
    target.bookId,
    target.chapter3,
    target.verse3,
    `${type}.json`,
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

function readDurationAsync(filePath) {
  return new Promise((resolve) => {
    const child = spawn(
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
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(0);
        return;
      }
      const duration = Number.parseFloat(String(stdout || '').trim());
      resolve(Number.isFinite(duration) ? Number(duration.toFixed(3)) : 0);
    });
    child.on('error', () => resolve(0));
  });
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => run()));
  return results;
}

function buildEntry(item, target, { duration = null } = {}) {
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
    duration: duration == null ? readDuration(filePath) : duration,
    fileSize,
    status: 'published',
    preview: item.preview,
  };
}

function listRangeTargets(args) {
  const targets = [];
  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    const maxVerse = GENESIS_VERSE_COUNTS[chapter];
    if (!maxVerse) throw new Error(`unknown chapter ${chapter}`);
    for (let verse = 1; verse <= maxVerse; verse++) {
      targets.push(buildTarget(args.bookId, args.locale, chapter, verse));
    }
  }
  return targets;
}

function objectKeyFromEntry(entry) {
  return `commentary/ko/gae/${entry.bookId}/${pad3(entry.chapter)}/${pad3(entry.verse)}/${
    COMMENTARY_TYPES.find((t) => t.type === entry.type).fileName
  }`;
}

function countGenesisCommentary(audios, fromChapter, toChapter) {
  let count = 0;
  for (const id of Object.keys(audios || {})) {
    const parts = id.split('.');
    if (parts.length < 4 || parts[0] !== 'genesis') continue;
    const type = parts[parts.length - 1];
    if (!COMMENTARY_TYPES.some((item) => item.type === type)) continue;
    const chapter = Number(parts[1]);
    if (chapter >= fromChapter && chapter <= toChapter) count += 1;
  }
  return count;
}

function pickComparableManifestEntries(manifest, ids) {
  const audios = manifest.audios || {};
  return Object.fromEntries(ids.map((id) => [id, audios[id] || null]));
}

function readVerifyReportOrThrow() {
  if (!fs.existsSync(VERIFY_REPORT_PATH)) {
    throw new Error(`최종 원격 검증 보고서가 없습니다: ${path.relative(ROOT, VERIFY_REPORT_PATH)}`);
  }
  const report = JSON.parse(fs.readFileSync(VERIFY_REPORT_PATH, 'utf8'));
  const allOk = report.all_ok === true || report.all_ok === 13077;
  if (report.expected !== 13077 || !allOk || report.remote_exist !== 13077 || report.bad_count !== 0) {
    throw new Error('최종 원격 검증 보고서가 PASS 상태가 아닙니다.');
  }
  return report;
}

async function planRange(args, manifest) {
  const verifyReport = readVerifyReportOrThrow();
  const targets = listRangeTargets(args);
  const plannedEntries = [];
  const localMp3Missing = [];
  const cueMissing = [];
  const plannedIds = [];
  const plannedUrls = [];

  for (const target of targets) {
    for (const item of COMMENTARY_TYPES) {
      const localMp3 = localAudioPath(item.fileName, target);
      const cue = localCuePath(item.type, target);
      if (!fs.existsSync(localMp3) || fs.statSync(localMp3).size <= 0) {
        localMp3Missing.push(path.relative(ROOT, localMp3));
        continue;
      }
      if (!fs.existsSync(cue)) {
        cueMissing.push(path.relative(ROOT, cue));
      }
      plannedIds.push(buildAudioId(item.type, target));
      plannedUrls.push(`${target.r2BaseUrl}/${item.fileName}`);
      plannedEntries.push({ target, item, localMp3 });
    }
  }

  const uniqueIds = new Set(plannedIds);
  const uniqueUrls = new Set(plannedUrls);
  const existingAudios = manifest.audios || {};
  const alreadyPresent = plannedIds.filter((id) => existingAudios[id]).length;
  const createCount = plannedIds.length - alreadyPresent;

  const outOfScope = {
    genesis1to3: plannedEntries.filter(({ target }) => target.chapter <= 3).length,
    otherBooks: plannedEntries.filter(({ target }) => target.bookId !== 'genesis').length,
    bibleAudio: 0,
  };

  return {
    verifyReportOk: true,
    verifyExpected: verifyReport.expected,
    chapterFrom: args.fromChapter,
    chapterTo: args.toChapter,
    verseCount: targets.length,
    topicsPerVerse: COMMENTARY_TYPES.length,
    plannedCount: plannedEntries.length,
    uniqueIdCount: uniqueIds.size,
    uniqueUrlCount: uniqueUrls.size,
    duplicateIdCount: plannedIds.length - uniqueIds.size,
    duplicateUrlCount: plannedUrls.length - uniqueUrls.size,
    localMp3MissingCount: localMp3Missing.length,
    cueMissingCount: cueMissing.length,
    verifyReportGapCount: verifyReport.all_ok ? 0 : plannedEntries.length,
    alreadyPresentCount: alreadyPresent,
    createCount,
    outOfScope,
    firstEntryMeta: plannedEntries[0]
      ? {
        id: buildAudioId(plannedEntries[0].item.type, plannedEntries[0].target),
        chapter: plannedEntries[0].target.chapter,
        verse: plannedEntries[0].target.verse,
        type: plannedEntries[0].item.type,
        filePath: `${plannedEntries[0].target.r2BaseUrl}/${plannedEntries[0].item.fileName}`,
      }
      : null,
    lastEntryMeta: plannedEntries.length
      ? {
        id: buildAudioId(
          plannedEntries[plannedEntries.length - 1].item.type,
          plannedEntries[plannedEntries.length - 1].target,
        ),
        chapter: plannedEntries[plannedEntries.length - 1].target.chapter,
        verse: plannedEntries[plannedEntries.length - 1].target.verse,
        type: plannedEntries[plannedEntries.length - 1].item.type,
        filePath: `${plannedEntries[plannedEntries.length - 1].target.r2BaseUrl}/${plannedEntries[plannedEntries.length - 1].item.fileName}`,
      }
      : null,
    plannedEntries,
    localMp3Missing: localMp3Missing.slice(0, 20),
    cueMissing: cueMissing.slice(0, 20),
  };
}

async function buildRangeEntries(plan) {
  process.stderr.write(`○ ffprobe durations start count=${plan.plannedEntries.length}\n`);
  const durations = await mapPool(plan.plannedEntries, 8, async ({ localMp3 }) => readDurationAsync(localMp3));
  process.stderr.write('○ ffprobe durations done\n');
  return plan.plannedEntries.map((row, index) => buildEntry(row.item, row.target, { duration: durations[index] }));
}

function buildNextManifestFromEntries(manifest, plannedEntries) {
  const existingAudios = manifest.audios || {};
  const nextAudios = { ...existingAudios };
  for (const entry of plannedEntries) {
    if (!nextAudios[entry.id]) {
      nextAudios[entry.id] = entry;
    }
  }
  return {
    ...manifest,
    lastUpdated: new Date().toISOString().slice(0, 10),
    totalAudios: Object.keys(nextAudios).length,
    audios: nextAudios,
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

async function mainRange(args) {
  const manifest = readManifest();
  const before1to3 = countGenesisCommentary(manifest.audios, 1, 3);
  const before4to50 = countGenesisCommentary(manifest.audios, 4, 50);
  const plan = await planRange(args, manifest);

  const dryRunOk = (
    plan.verseCount === 1453 &&
    plan.topicsPerVerse === 9 &&
    plan.plannedCount === 13077 &&
    plan.uniqueIdCount === 13077 &&
    plan.uniqueUrlCount === 13077 &&
    plan.duplicateIdCount === 0 &&
    plan.duplicateUrlCount === 0 &&
    plan.localMp3MissingCount === 0 &&
    plan.cueMissingCount === 0 &&
    plan.verifyReportGapCount === 0 &&
    plan.outOfScope.genesis1to3 === 0 &&
    plan.outOfScope.otherBooks === 0 &&
    plan.createCount === 13077 &&
    before1to3 === 720 &&
    before4to50 === 0
  );

  if (!args.write) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      rangeMode: true,
      dryRunOk,
      chapterFrom: plan.chapterFrom,
      chapterTo: plan.chapterTo,
      verseCount: plan.verseCount,
      topicsPerVerse: plan.topicsPerVerse,
      plannedCount: plan.plannedCount,
      uniqueIdCount: plan.uniqueIdCount,
      uniqueUrlCount: plan.uniqueUrlCount,
      duplicateIdCount: plan.duplicateIdCount,
      duplicateUrlCount: plan.duplicateUrlCount,
      localMp3MissingCount: plan.localMp3MissingCount,
      cueMissingCount: plan.cueMissingCount,
      verifyReportGapCount: plan.verifyReportGapCount,
      createCount: plan.createCount,
      alreadyPresentCount: plan.alreadyPresentCount,
      beforeGenesis1to3: before1to3,
      beforeGenesis4to50: before4to50,
      outOfScope: plan.outOfScope,
      firstEntry: plan.firstEntryMeta,
      lastEntry: plan.lastEntryMeta,
      localMp3Missing: plan.localMp3Missing,
      cueMissing: plan.cueMissing,
    }, null, 2));
    if (!dryRunOk) process.exitCode = 1;
    return;
  }

  if (!dryRunOk) {
    throw new Error('dry-run 조건 불충족으로 write를 중단합니다.');
  }
  if (plan.createCount !== args.confirmCreateCount) {
    throw new Error(`createCount ${plan.createCount} != confirm ${args.confirmCreateCount}`);
  }

  const plannedEntries = await buildRangeEntries(plan);
  const durationZero = plannedEntries.filter((entry) => !(entry.duration > 0)).length;
  if (durationZero > 0) {
    throw new Error(`duration<=0 항목 ${durationZero}건 — write 중단`);
  }

  const watchedIds = [
    ...COMMENTARY_TYPES.map((item) => `genesis.001.001.${item.type}`),
    ...COMMENTARY_TYPES.map((item) => `genesis.001.002.${item.type}`),
    ...COMMENTARY_TYPES.map((item) => `genesis.001.003.${item.type}`),
  ];
  const beforeWatchedEntries = pickComparableManifestEntries(manifest, watchedIds);
  const nextManifest = buildNextManifestFromEntries(manifest, plannedEntries);
  const afterWatchedEntries = pickComparableManifestEntries(nextManifest, watchedIds);
  const watchedEntriesChanged = JSON.stringify(beforeWatchedEntries) !== JSON.stringify(afterWatchedEntries);
  if (watchedEntriesChanged) {
    throw new Error('창세기 1장 1–3절 watched entries가 변경되어 write를 중단합니다.');
  }

  const after1to3 = countGenesisCommentary(nextManifest.audios, 1, 3);
  const after4to50 = countGenesisCommentary(nextManifest.audios, 4, 50);
  if (after1to3 !== 720 || after4to50 !== 13077) {
    throw new Error(`집계 불일치 before write flush: 1-3=${after1to3} 4-50=${after4to50}`);
  }

  fs.writeFileSync(MANIFEST_PATH, serializeManifest(nextManifest), 'utf8');
  JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  console.log(JSON.stringify({
    mode: 'write',
    rangeMode: true,
    fileModified: true,
    createCount: plan.createCount,
    plannedCount: plannedEntries.length,
    beforeGenesis1to3: before1to3,
    afterGenesis1to3: after1to3,
    beforeGenesis4to50: before4to50,
    afterGenesis4to50: after4to50,
    afterGenesis1to50: after1to3 + after4to50,
    totalAudios: nextManifest.totalAudios,
    previousVersesChanged: watchedEntriesChanged,
    firstEntry: plan.firstEntryMeta,
    lastEntry: plan.lastEntryMeta,
    durationPositiveCount: plannedEntries.filter((entry) => entry.duration > 0).length,
  }, null, 2));
}

function mainSingle(args) {
  const target = buildTarget(args.bookId, args.locale, args.chapter, args.verse);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTargetScope(args);
  if (args.rangeMode) {
    await mainRange(args);
    return;
  }
  mainSingle(args);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
