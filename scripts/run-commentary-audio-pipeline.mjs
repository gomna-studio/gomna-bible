import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  COMMENTARY_TYPES as HIGHLIGHT_COMMENTARY_TYPES,
  splitParagraphs,
  buildGenerationPlan,
  countPlannedSegments,
} from './lib/commentary-highlight-plan.mjs';
import {
  loadSegmentCacheIndex,
  lookupSegmentCache,
  buildCacheKeyForText,
  expandPlanSegments,
} from './lib/commentary-segment-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const LEGACY_SAFE_TARGET = {
  locale: 'ko-KR',
  bookId: 'genesis',
  chapter: 1,
  fromVerse: 5,
  toVerse: 5,
};

const GENESIS_VERSE_COUNTS = {
  1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 22, 7: 24, 8: 22, 9: 29, 10: 32,
  11: 32, 12: 20, 13: 18, 14: 24, 15: 21, 16: 16, 17: 27, 18: 33, 19: 38, 20: 18,
  21: 34, 22: 24, 23: 20, 24: 67, 25: 34, 26: 35, 27: 46, 28: 22, 29: 35, 30: 43,
  31: 55, 32: 32, 33: 20, 34: 31, 35: 29, 36: 43, 37: 36, 38: 30, 39: 23, 40: 23,
  41: 57, 42: 38, 43: 34, 44: 34, 45: 28, 46: 34, 47: 31, 48: 22, 49: 33, 50: 26,
};

const SAFE_TARGET_RANGES = [
  LEGACY_SAFE_TARGET,
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 31,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 2,
    fromVerse: 1,
    toVerse: 25,
  },
  // Genesis 3: scripts write + production audio/cue plan allowed.
  // Production audio+cue write requires --confirm-production-audio-write.
  // Upload / manifest publish remain blocked for chapters 4–50.
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 3,
    fromVerse: 1,
    toVerse: 24,
  },
  // Genesis 4–50 book unit: scripts write + production audio/cue plan allowed.
  // Upload / manifest publish remain blocked until a later approved step.
  ...Object.entries(GENESIS_VERSE_COUNTS)
    .map(([chapter, toVerse]) => ({ chapter: Number(chapter), toVerse }))
    .filter(({ chapter }) => chapter >= 4 && chapter <= 50)
    .map(({ chapter, toVerse }) => ({
      locale: 'ko-KR',
      bookId: 'genesis',
      chapter,
      fromVerse: 1,
      toVerse,
    })),
];

const GENESIS_3_PRODUCTION_TARGET = {
  locale: 'ko-KR',
  bookId: 'genesis',
  chapter: 3,
  fromVerse: 1,
  toVerse: 24,
};

const COMMENTARY_TOPIC_TYPES = [
  { type: 'original-language', voicePreset: 'study' },
  { type: 'history', voicePreset: 'warm' },
  { type: 'theology', voicePreset: 'warm' },
  { type: 'typology', voicePreset: 'study' },
  { type: 'matthew-henry', voicePreset: 'calm' },
  { type: 'sermon', voicePreset: 'strong' },
  { type: 'hymn', voicePreset: 'soft' },
  { type: 'counseling', voicePreset: 'warm' },
  { type: 'cross-reference', voicePreset: 'calm' },
];

const APPROVED_AUDIO_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 16,
    toVerse: 20,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 21,
    toVerse: 25,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 26,
    toVerse: 31,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 2,
    fromVerse: 1,
    toVerse: 25,
  },
];

const APPROVED_UPLOAD_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 16,
    toVerse: 20,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 21,
    toVerse: 25,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 26,
    toVerse: 31,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 2,
    fromVerse: 1,
    toVerse: 25,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 3,
    fromVerse: 1,
    toVerse: 24,
  },
];

const APPROVED_MANIFEST_WRITE_TARGETS = [
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 6,
    toVerse: 10,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 11,
    toVerse: 15,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 16,
    toVerse: 20,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 21,
    toVerse: 25,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 1,
    fromVerse: 26,
    toVerse: 31,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 2,
    fromVerse: 1,
    toVerse: 25,
  },
  {
    locale: 'ko-KR',
    bookId: 'genesis',
    chapter: 3,
    fromVerse: 1,
    toVerse: 24,
  },
];

const REPORT_DIR = path.join(ROOT, 'reports', 'commentary-pipeline');
const STAGES = new Set(['prepare', 'scripts', 'audio', 'upload', 'manifest', 'publish', 'qa']);
const DEFAULT_STAGE = 'prepare';

function usage() {
  console.error('Usage: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --chapter 1 --verse 5 --stage prepare --dry-run');
  console.error('   or: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --chapter 1 --from-verse 6 --to-verse 10 --stage scripts --dry-run');
  console.error('   or: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --chapter 3 --from-verse 1 --to-verse 24 --stage prepare --dry-run');
  console.error('   or: node scripts/run-commentary-audio-pipeline.mjs --locale ko-KR --book genesis --from-chapter 4 --to-chapter 50 --stage prepare --dry-run');
  console.error('Stages: prepare, scripts, audio, upload, manifest, publish, qa.');
  console.error('Default mode: dry-run. Write/upload/manifest require explicit --write and approved targets.');
  console.error('Safe targets: ko-KR genesis 1:5, 1:6-31, 2:1-25, 3:1-24, 4:1–50:end.');
  console.error('Genesis 3–50: scripts --write allowed; audio uses production cue builder (not batch).');
  console.error('Production audio+cue write requires --confirm-production-audio-write.');
  console.error('Book-unit production audio also requires segment cache + --max-new-tts-calls N + --confirm-new-tts-calls N.');
  console.error('Emergency only: --allow-no-segment-cache');
  console.error('Genesis 3 upload/manifest write: --stage upload --write --upload / --stage manifest --write, verses 1–24 only.');
  console.error('Genesis 4–50 upload/manifest write: blocked.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    fromVerse: null,
    toVerse: null,
    fromChapter: null,
    toChapter: null,
    stages: [],
    dryRun: true,
    write: false,
    overwrite: false,
    upload: false,
    report: true,
    confirmProductionAudioWrite: false,
    maxNewTtsCalls: null,
    confirmNewTtsCalls: null,
    allowNoSegmentCache: false,
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
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--from-chapter') {
      args.fromChapter = Number(argv[++i]);
    } else if (arg === '--to-chapter') {
      args.toChapter = Number(argv[++i]);
    } else if (arg === '--stage') {
      args.stages.push(argv[++i]);
    } else if (arg === '--dry-run') {
      dryRunExplicit = true;
      args.dryRun = true;
    } else if (arg === '--write') {
      writeExplicit = true;
      args.write = true;
      args.dryRun = false;
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--upload') {
      args.upload = true;
    } else if (arg === '--confirm-production-audio-write') {
      args.confirmProductionAudioWrite = true;
    } else if (arg === '--max-new-tts-calls') {
      args.maxNewTtsCalls = Number(argv[++i]);
    } else if (arg === '--confirm-new-tts-calls') {
      args.confirmNewTtsCalls = Number(argv[++i]);
    } else if (arg === '--allow-no-segment-cache') {
      args.allowNoSegmentCache = true;
    } else if (arg === '--no-report') {
      args.report = false;
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
  if (!args.bookId) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  const bookMode = args.fromChapter != null || args.toChapter != null;
  if (bookMode) {
    if (args.fromChapter == null || args.toChapter == null) {
      throw new Error('--from-chapter와 --to-chapter는 함께 필요합니다.');
    }
    if (args.chapter != null || args.verse != null || args.fromVerse != null || args.toVerse != null) {
      throw new Error('책 단위 모드(--from-chapter/--to-chapter)에서는 --chapter/--verse/--from-verse/--to-verse를 함께 쓸 수 없습니다.');
    }
    if (args.fromChapter > args.toChapter) {
      throw new Error('--from-chapter는 --to-chapter보다 클 수 없습니다.');
    }
    for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
      if (!GENESIS_VERSE_COUNTS[chapter]) {
        throw new Error(`지원하지 않는 장입니다: ${chapter}`);
      }
    }
  } else {
    if (args.chapter == null) {
      usage();
      throw new Error('필수 옵션이 누락되었습니다.');
    }
    if (args.verse != null) {
      args.fromVerse = args.verse;
      args.toVerse = args.verse;
    }
    if (args.fromVerse == null || args.toVerse == null) {
      usage();
      throw new Error('--verse 또는 --from-verse/--to-verse가 필요합니다.');
    }
    if (args.fromVerse > args.toVerse) {
      throw new Error('--from-verse는 --to-verse보다 클 수 없습니다.');
    }
  }

  if (args.stages.length === 0) {
    args.stages.push(DEFAULT_STAGE);
  }
  for (const stage of args.stages) {
    if (!STAGES.has(stage)) {
      throw new Error(`지원하지 않는 stage입니다: ${stage}`);
    }
  }

  return args;
}

function expandChapterJobs(args) {
  if (args.fromChapter != null) {
    const jobs = [];
    for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
      jobs.push({
        ...args,
        chapter,
        fromVerse: 1,
        toVerse: GENESIS_VERSE_COUNTS[chapter],
        verse: null,
        fromChapter: null,
        toChapter: null,
      });
    }
    return jobs;
  }
  return [args];
}

function assertSafeTarget(args) {
  const matched = SAFE_TARGET_RANGES.some((range) => (
    args.locale === range.locale &&
    args.bookId === range.bookId &&
    args.chapter === range.chapter &&
    args.fromVerse >= range.fromVerse &&
    args.toVerse <= range.toVerse
  ));

  if (!matched) {
    throw new Error('master pipeline은 현재 ko-KR 창세기 1:5, 1:6-31, 2:1-25, 3:1-24, 또는 4:1–50:end 범위만 처리할 수 있습니다.');
  }
}

function resolveQaMode(args) {
  if (args.bookId === 'genesis' && args.chapter <= 2) return 'legacy';
  return 'strict';
}

function isGenesis3ProductionTarget(args) {
  return (
    args.locale === GENESIS_3_PRODUCTION_TARGET.locale &&
    args.bookId === GENESIS_3_PRODUCTION_TARGET.bookId &&
    args.chapter === GENESIS_3_PRODUCTION_TARGET.chapter &&
    args.fromVerse >= GENESIS_3_PRODUCTION_TARGET.fromVerse &&
    args.toVerse <= GENESIS_3_PRODUCTION_TARGET.toVerse
  );
}

function isGenesis4to50ProductionTarget(args) {
  if (args.locale !== 'ko-KR' || args.bookId !== 'genesis') return false;
  if (args.chapter < 4 || args.chapter > 50) return false;
  const maxVerse = GENESIS_VERSE_COUNTS[args.chapter];
  return args.fromVerse >= 1 && args.toVerse <= maxVerse;
}

function usesProductionCueBuilder(args) {
  return isGenesis3ProductionTarget(args) || isGenesis4to50ProductionTarget(args);
}

function countNonEmptyParagraphs(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

let genesisCommentaryDataCache = null;

function loadGenesisCommentaryData() {
  if (genesisCommentaryDataCache) return genesisCommentaryDataCache;
  const filePath = path.join(ROOT, 'gomna_data_genesis.js');
  if (!fs.existsSync(filePath)) {
    genesisCommentaryDataCache = { ok: false, data: null };
    return genesisCommentaryDataCache;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    window: { pastorCommentaryData: {} },
    pastorCommentaryData: {},
    commentaryData: {},
    module: { exports: {} },
  };
  try {
    vm.runInNewContext(source, sandbox, { filename: filePath });
    const data = Object.keys(sandbox.pastorCommentaryData).length
      ? sandbox.pastorCommentaryData
      : sandbox.window.pastorCommentaryData;
    genesisCommentaryDataCache = { ok: true, data };
  } catch {
    genesisCommentaryDataCache = { ok: false, data: null };
  }
  return genesisCommentaryDataCache;
}

function emptySegmentBreakdown(total = 0) {
  return { total, intro: 0, item: 0, closing: 0, other: 0 };
}

function estimateSegmentBreakdownFromScripts(args, scriptAbs, typeConfig, verse) {
  const raw = fs.readFileSync(scriptAbs, 'utf8');
  if (!usesProductionCueBuilder(args)) {
    const total = countNonEmptyParagraphs(raw);
    return { total, intro: 0, item: total, closing: 0, other: 0 };
  }

  const paragraphs = splitParagraphs(raw);
  const dataResult = loadGenesisCommentaryData();
  if (!dataResult.ok) {
    return emptySegmentBreakdown(countNonEmptyParagraphs(raw));
  }

  const highlightType = HIGHLIGHT_COMMENTARY_TYPES.find((item) => item.type === typeConfig.type);
  if (!highlightType) {
    return emptySegmentBreakdown(countNonEmptyParagraphs(raw));
  }

  const verseKey = `창세기_${args.chapter}_${verse}`;
  const entry = dataResult.data[verseKey];
  if (!entry || !Array.isArray(entry[highlightType.tableKey])) {
    return emptySegmentBreakdown(countNonEmptyParagraphs(raw));
  }

  const rowCount = entry[highlightType.tableKey].length;
  const rows = entry[highlightType.tableKey];
  const plan = buildGenerationPlan({
    typeConfig: highlightType,
    paragraphs,
    rowCount,
    rows,
    bookId: args.bookId,
    chapter: args.chapter,
    verse,
  });
  if (!plan) {
    return emptySegmentBreakdown(countNonEmptyParagraphs(raw));
  }

  const breakdown = emptySegmentBreakdown(0);
  for (const unit of plan) {
    const unitCount = Array.isArray(unit.ttsTexts) && unit.ttsTexts.length
      ? unit.ttsTexts.length
      : unit.paragraphIndices.length;
    breakdown.total += unitCount;
    if (unit.kind === 'intro') breakdown.intro += unitCount;
    else if (unit.kind === 'item') breakdown.item += unitCount;
    else if (unit.kind === 'closing') breakdown.closing += unitCount;
    else breakdown.other += unitCount;
  }
  return breakdown;
}

function isBookUnitProductionTarget(args) {
  return args.fromChapter != null && args.toChapter != null && usesProductionCueBuilder({
    ...args,
    chapter: args.fromChapter,
    fromVerse: 1,
    toVerse: GENESIS_VERSE_COUNTS[args.fromChapter] || 1,
  });
}

function estimateSegmentCachePlan(args) {
  const empty = {
    totalSegments: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    cacheHitRate: 0,
    expectedNewTtsCalls: 0,
    expectedReusedCalls: 0,
    totalNewInputCharacters: 0,
    cacheIndexOk: false,
    cacheIndexReason: 'not_checked',
    incompleteAudioIds: 0,
  };

  if (!usesProductionCueBuilder(args)) return empty;

  const loaded = loadSegmentCacheIndex(ROOT, args.locale);
  empty.cacheIndexOk = loaded.ok;
  empty.cacheIndexReason = loaded.ok ? null : loaded.reason;

  const dataResult = loadGenesisCommentaryData();
  if (!dataResult.ok) {
    empty.cacheIndexReason = empty.cacheIndexReason || 'commentary_data_unavailable';
    return empty;
  }

  let totalSegments = 0;
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let totalNewInputCharacters = 0;
  let incompleteAudioIds = 0;

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    for (const typeConfig of COMMENTARY_TOPIC_TYPES) {
      const mp3Abs = path.join(
        ROOT, 'audio', 'v1', args.locale, args.bookId,
        pad3(args.chapter), pad3(verse),
        `${typeConfig.type}-${typeConfig.voicePreset}.mp3`,
      );
      const cueAbs = path.join(
        ROOT, 'audio', 'cues', args.locale, args.bookId,
        pad3(args.chapter), pad3(verse),
        `${typeConfig.type}.json`,
      );
      const completePair = fs.existsSync(mp3Abs) && fs.statSync(mp3Abs).size > 0
        && fs.existsSync(cueAbs) && fs.statSync(cueAbs).size > 0;
      if (completePair && !args.overwrite) continue;

      incompleteAudioIds += 1;
      const scriptAbs = path.join(
        ROOT, 'tts-scripts', args.locale, args.bookId,
        pad3(args.chapter), pad3(verse),
        `${typeConfig.type}.txt`,
      );
      if (!fs.existsSync(scriptAbs)) continue;

      const highlightType = HIGHLIGHT_COMMENTARY_TYPES.find((item) => item.type === typeConfig.type);
      if (!highlightType) continue;
      const paragraphs = splitParagraphs(fs.readFileSync(scriptAbs, 'utf8'));
      const verseKey = `창세기_${args.chapter}_${verse}`;
      const entry = dataResult.data[verseKey];
      const rows = entry?.[highlightType.tableKey];
      if (!Array.isArray(rows)) continue;
      const plan = buildGenerationPlan({
        typeConfig: highlightType,
        paragraphs,
        rowCount: rows.length,
        rows,
        bookId: args.bookId,
        chapter: args.chapter,
        verse,
      });
      if (!plan) continue;

      for (const segment of expandPlanSegments(plan, paragraphs)) {
        totalSegments += 1;
        const keyInfo = buildCacheKeyForText(segment.text, { locale: args.locale });
        if (!loaded.ok) {
          // No usable index: treat every planned segment as a new TTS call.
          cacheMissCount += 1;
          totalNewInputCharacters += keyInfo.signature.text.length;
          continue;
        }
        const lookup = lookupSegmentCache(ROOT, args.locale, keyInfo.key, {
          index: loaded,
          skipValidate: true,
        });
        if (lookup.hit) {
          cacheHitCount += 1;
        } else {
          cacheMissCount += 1;
          totalNewInputCharacters += keyInfo.signature.text.length;
        }
      }
    }
  }

  return {
    totalSegments,
    cacheHitCount,
    cacheMissCount,
    cacheHitRate: totalSegments ? cacheHitCount / totalSegments : 0,
    expectedNewTtsCalls: cacheMissCount,
    expectedReusedCalls: cacheHitCount,
    totalNewInputCharacters,
    cacheIndexOk: loaded.ok,
    cacheIndexReason: loaded.ok ? null : loaded.reason,
    incompleteAudioIds,
  };
}

function buildProductionWriteBlockers(args) {
  const blockers = [];
  if (!args.write || !usesProductionCueBuilder(args)) return blockers;

  const stages = args.stages || [];
  const wantsAudio = stages.includes('audio') || stages.includes('prepare');
  const wantsPublish = stages.includes('publish');
  const wantsUpload = stages.includes('upload') || wantsPublish;
  const wantsManifest = stages.includes('manifest') || wantsPublish;
  const scriptsOnly = stages.length > 0 && stages.every((stage) => stage === 'scripts');
  const uploadOnly = stages.length === 1 && stages[0] === 'upload';
  const manifestOnly = stages.length === 1 && stages[0] === 'manifest';
  const chapterLabel = `창세기 ${args.chapter}장`;

  if (isGenesis4to50ProductionTarget(args)) {
    if (scriptsOnly) return blockers;
    if (wantsUpload || uploadOnly) {
      blockers.push(`${chapterLabel} upload write는 현재 차단됩니다.`);
    }
    if (wantsManifest || manifestOnly) {
      blockers.push(`${chapterLabel} manifest write는 현재 차단됩니다.`);
    }
    if (wantsPublish) {
      blockers.push(`${chapterLabel} publish 일괄 stage는 차단됩니다.`);
    }
    if (wantsAudio && !args.confirmProductionAudioWrite) {
      blockers.push(`${chapterLabel} production audio+cue write는 --confirm-production-audio-write가 필요합니다.`);
    }
    return blockers;
  }

  if (scriptsOnly || uploadOnly || manifestOnly) {
    return blockers;
  }

  if (wantsPublish) {
    blockers.push('창세기 3장 publish 일괄 stage는 차단됩니다. upload와 manifest를 각각 실행하세요.');
  }
  if (wantsAudio && !args.confirmProductionAudioWrite) {
    blockers.push('창세기 3장 production audio+cue write는 --confirm-production-audio-write가 필요합니다.');
  }

  return blockers;
}

function buildHardeningPlanSummary(args) {
  const verseCount = args.toVerse - args.fromVerse + 1;
  const topicsPerVerse = COMMENTARY_TOPIC_TYPES.length;
  const targetAudioCount = verseCount * topicsPerVerse;
  const targetCueCount = targetAudioCount;
  const productionPath = usesProductionCueBuilder(args);

  let existingScriptCount = 0;
  let existingMp3Count = 0;
  let existingCueCount = 0;
  let plannedGenerateCount = 0;
  let plannedSkipCount = 0;
  let plannedOverwriteCount = 0;
  let estimatedSegmentTtsCalls = 0;
  let segmentEstimateComplete = true;
  const blockers = buildProductionWriteBlockers(args);
  let introSegmentCount = 0;
  let itemSegmentCount = 0;
  let closingSegmentCount = 0;
  let otherSegmentCount = 0;

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    for (const typeConfig of COMMENTARY_TOPIC_TYPES) {
      const scriptAbs = path.join(
        ROOT,
        'tts-scripts',
        args.locale,
        args.bookId,
        pad3(args.chapter),
        pad3(verse),
        `${typeConfig.type}.txt`,
      );
      const mp3Abs = path.join(
        ROOT,
        'audio',
        'v1',
        args.locale,
        args.bookId,
        pad3(args.chapter),
        pad3(verse),
        `${typeConfig.type}-${typeConfig.voicePreset}.mp3`,
      );
      const cueAbs = path.join(
        ROOT,
        'audio',
        'cues',
        args.locale,
        args.bookId,
        pad3(args.chapter),
        pad3(verse),
        `${typeConfig.type}.json`,
      );

      const hasScript = fs.existsSync(scriptAbs) && fs.statSync(scriptAbs).size > 0;
      const hasMp3 = fs.existsSync(mp3Abs) && fs.statSync(mp3Abs).size > 0;
      const hasCue = fs.existsSync(cueAbs) && fs.statSync(cueAbs).size > 0;

      if (hasScript) {
        existingScriptCount += 1;
        const segmentBreakdown = estimateSegmentBreakdownFromScripts(args, scriptAbs, typeConfig, verse);
        estimatedSegmentTtsCalls += segmentBreakdown.total;
        introSegmentCount += segmentBreakdown.intro;
        itemSegmentCount += segmentBreakdown.item;
        closingSegmentCount += segmentBreakdown.closing;
        otherSegmentCount += segmentBreakdown.other;
      } else {
        segmentEstimateComplete = false;
      }
      if (hasMp3) existingMp3Count += 1;
      if (hasCue) existingCueCount += 1;

      const completePair = hasMp3 && hasCue;
      if (completePair && !args.overwrite) {
        plannedSkipCount += 1;
      } else if (hasMp3 && args.overwrite) {
        plannedOverwriteCount += 1;
        plannedGenerateCount += 1;
      } else {
        plannedGenerateCount += 1;
      }
    }
  }

  return {
    locale: args.locale,
    bookId: args.bookId,
    chapter: args.chapter,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    verseCount,
    topicsPerVerse,
    targetAudioCount,
    targetCueCount,
    existingScriptCount,
    existingMp3Count,
    existingCueCount,
    plannedGenerateCount,
    plannedSkipCount,
    plannedOverwriteCount,
    estimatedSegmentTtsCalls: segmentEstimateComplete ? estimatedSegmentTtsCalls : null,
    introSegmentCount: segmentEstimateComplete ? introSegmentCount : null,
    itemSegmentCount: segmentEstimateComplete ? itemSegmentCount : null,
    closingSegmentCount: segmentEstimateComplete ? closingSegmentCount : null,
    otherSegmentCount: segmentEstimateComplete ? otherSegmentCount : null,
    estimatedSegmentTtsNote: segmentEstimateComplete
      ? (productionPath
        ? '생성 대본 기준 production cue builder 세그먼트 수(카드별 TTS)'
        : '기존 대본 문단 수 합계(세그먼트 TTS 후보)')
      : '대본 미생성 항목이 있어 세그먼트 TTS 호출 수를 확정할 수 없음',
    outOfRangeTargetCount: 0,
    costNote: '비용 계산 자료 없음',
    qaMode: resolveQaMode(args),
    writeEnabled: Boolean(args.write),
    productionAudioPath: productionPath,
    batchDoubleGeneration: productionPath ? false : null,
    openAiWouldRun: Boolean(args.write && args.confirmProductionAudioWrite && productionPath && args.stages.includes('audio')),
    finalMp3Root: productionPath ? 'audio/v1' : null,
    cueRoot: productionPath ? 'audio/cues' : null,
    blockers,
    ...(() => {
      const cachePlan = productionPath ? estimateSegmentCachePlan(args) : null;
      if (!cachePlan) return {};
      return {
        totalSegments: cachePlan.totalSegments,
        cacheHitCount: cachePlan.cacheHitCount,
        cacheMissCount: cachePlan.cacheMissCount,
        cacheHitRate: cachePlan.cacheHitRate,
        expectedNewTtsCalls: cachePlan.expectedNewTtsCalls,
        expectedReusedCalls: cachePlan.expectedReusedCalls,
        totalNewInputCharacters: cachePlan.totalNewInputCharacters,
        incompleteAudioIds: cachePlan.incompleteAudioIds,
        cacheIndexOk: cachePlan.cacheIndexOk,
        cacheIndexReason: cachePlan.cacheIndexReason,
      };
    })(),
  };
}

function printHardeningPlanSummary(summary) {
  const segmentLine = summary.estimatedSegmentTtsCalls == null
    ? `○ 예상 카드별 TTS 세그먼트: 미확정 (${summary.estimatedSegmentTtsNote})`
    : `○ 예상 카드별 TTS 세그먼트: ${summary.estimatedSegmentTtsCalls}`;

  if (summary.productionAudioPath) {
    const chapterLabel = summary.fromChapter != null
      ? `${summary.fromChapter}–${summary.toChapter}`
      : String(summary.chapter);
    const lines = [
      '○ 말씀풀이 파이프라인 plan (API 호출 없음)',
      `○ 대상 장: ${chapterLabel}`,
      `○ 대상 절: ${summary.verseCount}`,
      `○ 최종 MP3: ${summary.targetAudioCount}`,
      `○ cue: ${summary.targetCueCount}`,
      segmentLine,
      `○ intro 세그먼트: ${summary.introSegmentCount ?? '미확정'}`,
      `○ item 세그먼트: ${summary.itemSegmentCount ?? '미확정'}`,
      `○ closing 세그먼트: ${summary.closingSegmentCount ?? '미확정'}`,
      `○ 기존 production MP3: ${summary.existingMp3Count}`,
      `○ 기존 cue: ${summary.existingCueCount}`,
      `○ 신규 생성 예정: ${summary.plannedGenerateCount}`,
      `○ skip 예정: ${summary.plannedSkipCount}`,
      `○ overwrite: ${summary.plannedOverwriteCount}`,
      '○ batch 이중 생성 없음',
      `○ OpenAI 실행 여부: ${summary.openAiWouldRun}`,
      `○ 최종 MP3 경로: ${summary.finalMp3Root}/ko-KR/genesis/{CCC}/{VVV}/{type}-{preset}.mp3`,
      `○ cue 경로: ${summary.cueRoot}/ko-KR/genesis/{CCC}/{VVV}/{type}.json`,
      `○ 기존 대본 수: ${summary.existingScriptCount}`,
      `○ segment cache index: ${summary.cacheIndexOk ? 'ok' : `missing/invalid (${summary.cacheIndexReason || 'n/a'})`}`,
      `○ 신규 audio ID: ${summary.incompleteAudioIds ?? 0}`,
      `○ cache hit: ${summary.cacheHitCount ?? 0}`,
      `○ cache miss / 예상 신규 TTS: ${summary.expectedNewTtsCalls ?? summary.cacheMissCount ?? 0}`,
      `○ cache hit rate: ${summary.cacheHitRate != null ? `${(summary.cacheHitRate * 100).toFixed(2)}%` : 'n/a'}`,
      `○ 재사용 예정 세그먼트: ${summary.expectedReusedCalls ?? 0}`,
      `○ 신규 입력 문자 수: ${summary.totalNewInputCharacters ?? 0}`,
      `○ blockers: ${summary.blockers.length ? summary.blockers.join(' | ') : '없음'}`,
      `○ write 실행 여부: ${summary.writeEnabled ? '예' : '아니오 (dry-run)'}`,
      `○ QA mode: ${summary.qaMode}`,
      `○ 예상 비용: ${summary.costNote}`,
    ];
    console.error(lines.join('\n'));
    return;
  }

  const lines = [
    '○ 말씀풀이 파이프라인 plan (API 호출 없음)',
    `○ 대상 언어: ${summary.locale}`,
    `○ 대상 책: ${summary.bookId}`,
    `○ 대상 장: ${summary.chapter}`,
    `○ 대상 절 수: ${summary.verseCount}`,
    `○ 절마다 주제 수: ${summary.topicsPerVerse}`,
    `○ 전체 말씀풀이 오디오 목표 수: ${summary.targetAudioCount}`,
    `○ 전체 cue 목표 수: ${summary.targetCueCount}`,
    `○ 기존 대본 수: ${summary.existingScriptCount}`,
    `○ 기존 MP3 수: ${summary.existingMp3Count}`,
    `○ 기존 cue 수: ${summary.existingCueCount}`,
    `○ 새로 생성 예정 수: ${summary.plannedGenerateCount}`,
    `○ 기존 파일 skip 예정 수: ${summary.plannedSkipCount}`,
    `○ 덮어쓰기 예정 수: ${summary.plannedOverwriteCount}`,
    segmentLine,
    `○ 범위 밖 대상 수: ${summary.outOfRangeTargetCount}`,
    `○ blockers: ${summary.blockers.length ? summary.blockers.join(' | ') : '없음'}`,
    `○ write 실행 여부: ${summary.writeEnabled ? '예' : '아니오 (dry-run)'}`,
    `○ QA mode: ${summary.qaMode}`,
    `○ 예상 API 비용: ${summary.costNote}`,
  ];
  console.error(lines.join('\n'));
}

function isLegacySafeTarget(args) {
  return (
    args.locale === LEGACY_SAFE_TARGET.locale &&
    args.bookId === LEGACY_SAFE_TARGET.bookId &&
    args.chapter === LEGACY_SAFE_TARGET.chapter &&
    args.fromVerse === LEGACY_SAFE_TARGET.fromVerse &&
    args.toVerse === LEGACY_SAFE_TARGET.toVerse
  );
}

function isApprovedAudioWriteTarget(args) {
  return APPROVED_AUDIO_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function isApprovedUploadWriteTarget(args) {
  return APPROVED_UPLOAD_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function isApprovedManifestWriteTarget(args) {
  return APPROVED_MANIFEST_WRITE_TARGETS.some((target) => (
    args.locale === target.locale &&
    args.bookId === target.bookId &&
    args.chapter === target.chapter &&
    args.fromVerse === target.fromVerse &&
    args.toVerse === target.toVerse
  ));
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function scriptsDirForVerse(args, verse) {
  return path.join(
    ROOT,
    'tts-scripts',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(verse),
  );
}

function countTextFiles(args, verse) {
  const scriptsDir = scriptsDirForVerse(args, verse);
  if (!fs.existsSync(scriptsDir)) return 0;

  return fs.readdirSync(scriptsDir).filter((fileName) => fileName.endsWith('.txt')).length;
}

function hasGeneratedScripts(args, verse) {
  return countTextFiles(args, verse) > 0;
}

function collectStepResults(finalPlan, stepName) {
  const results = [];

  for (const versePlan of finalPlan.verses) {
    for (const step of versePlan.steps) {
      if (step.step === stepName) {
        results.push({ verse: versePlan.verse, step });
      }
    }
  }

  return results;
}

function buildPipelineSummary({ args, finalPlan }) {
  let generatedTextFiles = false;
  let generatedTextFileCount = 0;
  let mp3Generated = false;
  let uploadPerformed = false;
  let manifestWritten = false;
  let validationExecuted = false;
  let validationFailCount = null;
  let validationWarnCount = null;
  let validationPassCount = null;

  let existingTextFilesCount = 0;
  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    existingTextFilesCount += countTextFiles(args, verse);
  }

  for (const { verse, step } of collectStepResults(finalPlan, 'build-scripts')) {
    if (!step.executed || step.result?.exitCode !== 0) continue;

    const parsed = step.result.parsedStdout;
    const txtCount = countTextFiles(args, verse);
    const expectedCount = parsed?.targetCount ?? txtCount;

    if (args.write && (parsed?.fileModified === true || txtCount >= expectedCount)) {
      generatedTextFiles = true;
      generatedTextFileCount += expectedCount;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'validate-scripts')) {
    if (!step.executed || step.result?.exitCode !== 0) continue;

    validationExecuted = true;
    const parsed = step.result.parsedStdout;
    if (!parsed) continue;

    validationFailCount = (validationFailCount ?? 0) + (parsed.failCount ?? 0);
    validationWarnCount = (validationWarnCount ?? 0) + (parsed.warnCount ?? 0);
    validationPassCount = (validationPassCount ?? 0) + (parsed.passCount ?? 0);
  }

  for (const { step } of collectStepResults(finalPlan, 'audio')) {
    if (step.executed && step.result?.parsedStdout?.mp3Generated === true) {
      mp3Generated = true;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'upload')) {
    if (step.executed && step.result?.parsedStdout?.uploadPerformed === true) {
      uploadPerformed = true;
    }
  }

  for (const { step } of collectStepResults(finalPlan, 'manifest')) {
    if (step.executed && args.write && step.result?.parsedStdout?.fileModified === true) {
      manifestWritten = true;
    }
  }

  return {
    generatedTextFiles,
    generatedTextFileCount: generatedTextFiles ? generatedTextFileCount : 0,
    existingTextFilesCount,
    scriptsAvailableForValidate: existingTextFilesCount > 0,
    validationExecuted,
    validationFailCount: validationExecuted ? validationFailCount : null,
    validationWarnCount: validationExecuted ? validationWarnCount : null,
    validationPassCount: validationExecuted ? validationPassCount : null,
    mp3Generated,
    uploadPerformed,
    manifestWritten,
    fileModified: generatedTextFiles || mp3Generated || manifestWritten,
  };
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function baseTargetArgs(args, verse) {
  return [
    '--locale',
    args.locale,
    '--book',
    args.bookId,
    '--chapter',
    String(args.chapter),
    '--verse',
    String(verse),
  ];
}

function pipelineEnv(args, verse) {
  return {
    GOMNA_COMMENTARY_PIPELINE: '1',
    GOMNA_COMMENTARY_ALLOWED_TARGET: `${args.locale}:${args.bookId}:${args.chapter}:${verse}`,
  };
}

function buildCommand(scriptPath, scriptArgs, env = {}) {
  return {
    command: 'node',
    args: [scriptPath, ...scriptArgs],
    display: ['node', scriptPath, ...scriptArgs].join(' '),
    env,
  };
}

function qaTargetArgs(args) {
  return [
    '--locale',
    args.locale,
    '--book',
    args.bookId,
    '--chapter',
    String(args.chapter),
    '--from-verse',
    String(args.fromVerse),
    '--to-verse',
    String(args.toVerse),
    '--mode',
    resolveQaMode(args),
    '--dry-run',
  ];
}

function stagesToSteps(stages, args = null) {
  const steps = [];
  const add = (step) => {
    if (!steps.includes(step)) steps.push(step);
  };

  for (const stage of stages) {
    if (stage === 'prepare') {
      add('build-scripts-dry-run');
      add('validate-scripts');
      add('audio-dry-run');
      add('upload-dry-run');
      add('manifest-dry-run');
    } else if (stage === 'scripts') {
      add('build-scripts');
      add('validate-scripts');
    } else if (stage === 'audio') {
      add('audio');
    } else if (stage === 'upload') {
      add('upload');
    } else if (stage === 'manifest') {
      // Production cue path uses highlight cue JSON (not matthew-henry manual cue-check in JS).
      if (!(args && usesProductionCueBuilder(args))) {
        add('cue-check');
      }
      add('manifest');
    } else if (stage === 'publish') {
      add('cue-check');
      add('upload');
      add('manifest');
    } else if (stage === 'qa') {
      add('qa');
    }
  }

  return steps;
}

function commandForStep({ args, verse, step }) {
  const targetArgs = baseTargetArgs(args, verse);
  const env = pipelineEnv(args, verse);

  if (step === 'build-scripts-dry-run') {
    return buildCommand('scripts/build-commentary-tts-scripts.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'build-scripts') {
    return buildCommand('scripts/build-commentary-tts-scripts.mjs', [...targetArgs, args.write ? '--write' : '--dry-run'], env);
  }
  if (step === 'validate-scripts') {
    return buildCommand('scripts/validate-commentary-tts-scripts.mjs', targetArgs, env);
  }
  if (step === 'audio-dry-run') {
    if (usesProductionCueBuilder(args)) {
      return buildCommand(
        'scripts/build-commentary-highlight-cues.mjs',
        [...targetArgs, '--production-output', '--dry-run'],
        env,
      );
    }
    return buildCommand('scripts/generate-commentary-audio-batch.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'audio') {
    if (usesProductionCueBuilder(args)) {
      const writeAudio = Boolean(args.write && args.confirmProductionAudioWrite);
      return buildCommand(
        'scripts/build-commentary-highlight-cues.mjs',
        [
          ...targetArgs,
          '--production-output',
          writeAudio ? '--write' : '--dry-run',
          writeAudio && args.overwrite ? '--force' : null,
          args.allowNoSegmentCache ? '--allow-no-segment-cache' : null,
        ].filter(Boolean),
        env,
      );
    }
    return buildCommand(
      'scripts/generate-commentary-audio-batch.mjs',
      [...targetArgs, args.overwrite ? '--overwrite' : null, args.write ? '--write' : '--dry-run'].filter(Boolean),
      env,
    );
  }
  if (step === 'upload-dry-run') {
    return buildCommand('scripts/prepare-commentary-r2-upload.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'upload') {
    const uploadAllowed = args.upload || args.stages.includes('publish');
    return buildCommand(
      'scripts/prepare-commentary-r2-upload.mjs',
      [...targetArgs, args.overwrite ? '--overwrite' : null, args.write && uploadAllowed ? '--upload' : '--dry-run'].filter(Boolean),
      env,
    );
  }
  if (step === 'manifest-dry-run') {
    return buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, '--dry-run'], env);
  }
  if (step === 'cue-check') {
    return buildCommand('scripts/verify-commentary-cues.mjs', targetArgs, env);
  }
  if (step === 'manifest') {
    return buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, args.write ? '--write' : '--dry-run'], env);
  }
  if (step === 'qa') {
    return buildCommand('scripts/verify-commentary-audio-qa.mjs', qaTargetArgs(args), {});
  }

  throw new Error(`알 수 없는 step입니다: ${step}`);
}

function isOnlyAudioStage(args, steps) {
  return (
    args.stages.length === 1 &&
    args.stages[0] === 'audio' &&
    steps.length === 1 &&
    steps[0] === 'audio'
  );
}

function isOnlyUploadStage(args, steps) {
  return (
    args.stages.length === 1 &&
    args.stages[0] === 'upload' &&
    steps.length === 1 &&
    steps[0] === 'upload'
  );
}

function isOnlyManifestStage(args, steps) {
  if (!(args.stages.length === 1 && args.stages[0] === 'manifest')) {
    return false;
  }
  if (usesProductionCueBuilder(args)) {
    return steps.length === 1 && steps[0] === 'manifest';
  }
  return (
    steps.length === 2 &&
    steps[0] === 'cue-check' &&
    steps[1] === 'manifest'
  );
}

function runPreflightCommand(commandSpec) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...commandSpec.env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let parsedStdout = null;
  try {
    parsedStdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsedStdout = null;
  }

  return {
    exitCode: result.status,
    stderr: result.stderr,
    parsedStdout,
  };
}

function validateApprovedAudioWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const textFileCount = countTextFiles(args, verse);
    if (textFileCount !== 9) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} txt 파일이 9개가 아닙니다 (${textFileCount}개).`);
      continue;
    }

    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const validation = runPreflightCommand(
      buildCommand('scripts/validate-commentary-tts-scripts.mjs', targetArgs, env),
    );
    const validationFailCount = validation.parsedStdout?.failCount;
    if (validation.exitCode !== 0 || validationFailCount !== 0) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} validate failCount=${validationFailCount ?? 'unknown'}.`);
      continue;
    }

    const audioDryRun = runPreflightCommand(
      buildCommand('scripts/generate-commentary-audio-batch.mjs', [...targetArgs, '--dry-run'], env),
    );
    const targetCount = audioDryRun.parsedStdout?.targetCount;
    if (audioDryRun.exitCode !== 0 || targetCount !== 9) {
      blockers.push(`audio write preflight 실패: ${args.bookId} ${args.chapter}:${verse} audio dry-run targetCount=${targetCount ?? 'unknown'}.`);
    }
  }

  return blockers;
}

function expectedR2KeyBase(args, verse) {
  if (args.locale !== 'ko-KR' || args.bookId !== 'genesis') {
    return null;
  }

  return `commentary/ko/gae/${args.bookId}/${pad3(args.chapter)}/${pad3(verse)}`;
}

function validateApprovedUploadWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const uploadDryRun = runPreflightCommand(
      buildCommand('scripts/prepare-commentary-r2-upload.mjs', [...targetArgs, '--dry-run'], env),
    );
    const parsed = uploadDryRun.parsedStdout;
    const expectedKeyBase = expectedR2KeyBase(args, verse);

    if (uploadDryRun.exitCode !== 0 || !parsed) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} upload dry-run이 실패했습니다.`);
      continue;
    }
    if (parsed.targetCount !== 9 || parsed.validCount !== 9 || parsed.missingOrEmptyCount !== 0) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} targetCount=${parsed.targetCount ?? 'unknown'}, validCount=${parsed.validCount ?? 'unknown'}, missingOrEmptyCount=${parsed.missingOrEmptyCount ?? 'unknown'}.`);
    }
    if (parsed.contentType !== 'audio/mpeg') {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} contentType=${parsed.contentType ?? 'unknown'}.`);
    }
    if (parsed.r2KeyBase !== expectedKeyBase) {
      blockers.push(`upload write preflight 실패: ${args.bookId} ${args.chapter}:${verse} r2KeyBase=${parsed.r2KeyBase ?? 'unknown'}.`);
    }
  }

  return blockers;
}

function validateGenesis3HighlightCuesPresent(args, verse) {
  const types = COMMENTARY_TOPIC_TYPES.map((item) => item.type);
  for (const type of types) {
    const cueAbs = path.join(
      ROOT,
      'audio',
      'cues',
      args.locale,
      args.bookId,
      pad3(args.chapter),
      pad3(verse),
      `${type}.json`,
    );
    if (!fs.existsSync(cueAbs) || fs.statSync(cueAbs).size <= 0) {
      return `manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} highlight cue 누락: ${type}.json`;
    }
  }
  return null;
}

function validateApprovedManifestWritePreflight(args) {
  const blockers = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    const targetArgs = baseTargetArgs(args, verse);
    const env = pipelineEnv(args, verse);
    const expectedKeyBase = expectedR2KeyBase(args, verse);

    if (usesProductionCueBuilder(args)) {
      const highlightCueBlocker = validateGenesis3HighlightCuesPresent(args, verse);
      if (highlightCueBlocker) {
        blockers.push(highlightCueBlocker);
        continue;
      }
    } else {
      const cueCheck = runPreflightCommand(
        buildCommand('scripts/verify-commentary-cues.mjs', targetArgs, env),
      );
      if (cueCheck.exitCode !== 0 || cueCheck.parsedStdout?.status !== 'PASS') {
        blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} cue-check가 PASS가 아닙니다.`);
        continue;
      }
    }

    const manifestDryRun = runPreflightCommand(
      buildCommand('scripts/sync-commentary-r2-manifest.mjs', [...targetArgs, '--dry-run'], env),
    );
    const parsed = manifestDryRun.parsedStdout;

    if (manifestDryRun.exitCode !== 0 || !parsed) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} manifest dry-run이 실패했습니다.`);
      continue;
    }
    if (
      parsed.targetCount !== 9 ||
      parsed.publishedCount !== 9 ||
      parsed.fileSizePositiveCount !== 9 ||
      parsed.durationPositiveCount !== 9
    ) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} targetCount=${parsed.targetCount ?? 'unknown'}, publishedCount=${parsed.publishedCount ?? 'unknown'}, fileSizePositiveCount=${parsed.fileSizePositiveCount ?? 'unknown'}, durationPositiveCount=${parsed.durationPositiveCount ?? 'unknown'}.`);
    }
    if (parsed.previousVersesChanged !== false) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} previousVersesChanged가 false가 아닙니다.`);
    }
    if (parsed.unexpectedFallbackToGenesis001001 !== false) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} unexpectedFallbackToGenesis001001가 false가 아닙니다.`);
    }
    if (parsed.r2KeyBase !== expectedKeyBase) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} r2KeyBase=${parsed.r2KeyBase ?? 'unknown'}.`);
    }
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const invalidFilePaths = entries.filter((entry) => (
      !entry.filePath ||
      !entry.filePath.includes(expectedKeyBase) ||
      /genesis\/001\/001|genesis\.001\.001/.test(entry.filePath)
    ));
    if (entries.length !== 9 || invalidFilePaths.length > 0) {
      blockers.push(`manifest write preflight 실패: ${args.bookId} ${args.chapter}:${verse} R2 URL 구조가 올바르지 않은 entry가 있습니다.`);
    }
  }

  return blockers;
}

function validateWriteSafety({ args, steps }) {
  if (!args.write) return [];

  const blockers = [];

  if (isGenesis4to50ProductionTarget(args)) {
    const scriptsOnly = steps.every((step) => step === 'build-scripts' || step === 'validate-scripts');
    if (scriptsOnly) {
      return [];
    }
    if (steps.includes('upload') || args.stages.includes('publish')) {
      blockers.push(`창세기 ${args.chapter}장 upload/publish write는 현재 차단됩니다.`);
    }
    if (steps.includes('manifest')) {
      blockers.push(`창세기 ${args.chapter}장 manifest write는 현재 차단됩니다.`);
    }
    if (steps.includes('audio')) {
      if (!args.confirmProductionAudioWrite) {
        blockers.push(`창세기 ${args.chapter}장 production audio+cue write는 --confirm-production-audio-write가 필요합니다.`);
      } else if (!isOnlyAudioStage(args, steps)) {
        blockers.push(`창세기 ${args.chapter}장 production audio+cue write는 --stage audio 단독 실행에서만 허용됩니다.`);
      }
    }
    return blockers;
  }

  if (isGenesis3ProductionTarget(args)) {
    const scriptsOnly = steps.every((step) => step === 'build-scripts' || step === 'validate-scripts');
    if (scriptsOnly) {
      return [];
    }
    if (args.stages.includes('publish')) {
      blockers.push('창세기 3장 publish 일괄 stage는 차단됩니다. upload와 manifest를 각각 실행하세요.');
    }
    if (steps.includes('upload')) {
      if (!isOnlyUploadStage(args, steps) || !isApprovedUploadWriteTarget(args) || !args.upload) {
        blockers.push('창세기 3장 upload write는 --stage upload --write --upload 정확한 범위(1–24)에서만 허용됩니다.');
      } else {
        blockers.push(...validateApprovedUploadWritePreflight(args));
      }
    }
    if (steps.includes('manifest')) {
      if (!isOnlyManifestStage(args, steps) || !isApprovedManifestWriteTarget(args)) {
        blockers.push('창세기 3장 manifest write는 --stage manifest --write 정확한 범위(1–24)에서만 허용됩니다.');
      } else {
        blockers.push(...validateApprovedManifestWritePreflight(args));
      }
    }
    if (steps.includes('audio')) {
      if (!args.confirmProductionAudioWrite) {
        blockers.push('창세기 3장 production audio+cue write는 --confirm-production-audio-write가 필요합니다.');
      } else if (!isOnlyAudioStage(args, steps)) {
        blockers.push('창세기 3장 production audio+cue write는 --stage audio 단독 실행에서만 허용됩니다.');
      }
    }
    return blockers;
  }

  const hasManifestWrite = steps.includes('manifest');

  if (!isLegacySafeTarget(args) && hasManifestWrite) {
    if (!isOnlyManifestStage(args, steps) || !isApprovedManifestWriteTarget(args)) {
      blockers.push('창세기 1장 6절~10절 manifest write는 --stage manifest --write 정확한 범위에서만 허용됩니다. publish 실제 write는 차단됩니다.');
    } else {
      blockers.push(...validateApprovedManifestWritePreflight(args));
    }
  }

  if (!isLegacySafeTarget(args) && steps.includes('audio')) {
    if (!isOnlyAudioStage(args, steps) || !isApprovedAudioWriteTarget(args) || !args.overwrite) {
      blockers.push('창세기 1장 6절~10절 audio write는 --stage audio --write --overwrite 정확한 범위에서만 허용됩니다.');
    } else {
      blockers.push(...validateApprovedAudioWritePreflight(args));
    }
  }
  if (!isLegacySafeTarget(args) && steps.includes('upload')) {
    if (!isOnlyUploadStage(args, steps) || !isApprovedUploadWriteTarget(args) || !args.upload) {
      blockers.push('창세기 1장 6절~10절 upload write는 --stage upload --write --upload 정확한 범위에서만 허용됩니다.');
    } else {
      blockers.push(...validateApprovedUploadWritePreflight(args));
    }
  }
  if (steps.includes('audio') && !args.overwrite) {
    blockers.push('audio stage --write는 MP3 재생성 보호를 위해 --overwrite가 필요합니다.');
  }
  if (steps.includes('upload') && !args.upload && !args.stages.includes('publish')) {
    blockers.push('upload stage --write는 실제 R2 업로드 보호를 위해 --upload 또는 --stage publish가 필요합니다.');
  }

  return blockers;
}

function runCommand(commandSpec) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...commandSpec.env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let parsedStdout = null;
  try {
    parsedStdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsedStdout = null;
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    parsedStdout,
  };
}

function dryRunExecutesSteps(stages) {
  return stages.some((stage) => (
    stage === 'scripts' ||
    stage === 'audio' ||
    stage === 'upload' ||
    stage === 'manifest' ||
    stage === 'publish'
  ));
}

function buildPlan(args) {
  const steps = stagesToSteps(args.stages, args);
  const safetyBlockers = validateWriteSafety({ args, steps });
  const verses = [];
  const planOnly = args.dryRun && !dryRunExecutesSteps(args.stages);

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    verses.push({
      verse,
      chapter3: pad3(args.chapter),
      verse3: pad3(verse),
      steps: steps.map((step) => {
        const command = commandForStep({ args, verse, step });
        return {
          step,
          command: command.display,
          env: command.env,
          executed: false,
          skippedReason: planOnly ? 'master-dry-run-plan-only' : null,
        };
      }),
    });
  }

  return {
    steps,
    safetyBlockers,
    verses,
  };
}

function shouldExecuteStep({ args, stepPlan, versePlan }) {
  if (!args.dryRun) {
    return { execute: true, skippedReason: null };
  }

  if (args.stages.includes('scripts')) {
    if (stepPlan.step === 'build-scripts') {
      return { execute: true, skippedReason: null };
    }

    if (stepPlan.step === 'validate-scripts') {
      if (!hasGeneratedScripts(args, versePlan.verse)) {
        return { execute: false, skippedReason: 'tts-scripts-missing-for-validate' };
      }

      return { execute: true, skippedReason: null };
    }
  }

  if (args.stages.includes('audio') && stepPlan.step === 'audio') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('upload') || args.stages.includes('publish')) && stepPlan.step === 'upload') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('manifest') || args.stages.includes('publish')) && stepPlan.step === 'cue-check') {
    return { execute: true, skippedReason: null };
  }

  if ((args.stages.includes('manifest') || args.stages.includes('publish')) && stepPlan.step === 'manifest') {
    return { execute: true, skippedReason: null };
  }

  return { execute: false, skippedReason: 'master-dry-run-plan-only' };
}

function executePlan({ args, plan }) {
  if (plan.safetyBlockers.length > 0) return plan;

  const safetyBlockers = [...plan.safetyBlockers];

  return {
    ...plan,
    safetyBlockers,
    verses: plan.verses.map((versePlan) => {
      let previousStepFailed = false;

      return {
        ...versePlan,
        steps: versePlan.steps.map((stepPlan) => {
          if (previousStepFailed) {
            return {
              ...stepPlan,
              executed: false,
              skippedReason: 'previous-step-failed',
            };
          }

          const decision = shouldExecuteStep({ args, stepPlan, versePlan });
          if (!decision.execute) {
            return {
              ...stepPlan,
              executed: false,
              skippedReason: decision.skippedReason,
            };
          }

          const command = commandForStep({ args, verse: versePlan.verse, step: stepPlan.step });
          const result = runCommand(command);
          if (stepPlan.step === 'cue-check' && result.exitCode !== 0) {
            safetyBlockers.push(`cue-check 실패: ${args.bookId} ${args.chapter}:${versePlan.verse} 매튜헨리 cue 누락을 먼저 보완해야 합니다.`);
          }
          if (result.exitCode !== 0) {
            previousStepFailed = true;
          }

          return {
            ...stepPlan,
            executed: true,
            skippedReason: null,
            result,
          };
        }),
      };
    }),
  };
}

function writeReport(output) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(
    REPORT_DIR,
    `${timestampForFileName()}-${output.target.bookId}-${pad3(output.target.chapter)}-${pad3(output.target.fromVerse)}-${pad3(output.target.toVerse)}-${output.stages.join('+')}-${output.mode}.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return reportPath;
}

function isOnlyQaStage(args) {
  return args.stages.length === 1 && args.stages[0] === 'qa';
}

function runQaStage(args) {
  const command = buildCommand('scripts/verify-commentary-audio-qa.mjs', qaTargetArgs(args), {});
  const result = runCommand(command);

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode || 1;
  }
  return result;
}

function mergeHardeningPlanSummaries(jobs, args) {
  const summaries = jobs.map((job) => buildHardeningPlanSummary(job));
  const merged = {
    locale: args.locale,
    bookId: args.bookId,
    chapter: args.fromChapter != null ? null : args.chapter,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    verseCount: 0,
    topicsPerVerse: COMMENTARY_TOPIC_TYPES.length,
    targetAudioCount: 0,
    targetCueCount: 0,
    existingScriptCount: 0,
    existingMp3Count: 0,
    existingCueCount: 0,
    plannedGenerateCount: 0,
    plannedSkipCount: 0,
    plannedOverwriteCount: 0,
    estimatedSegmentTtsCalls: 0,
    introSegmentCount: 0,
    itemSegmentCount: 0,
    closingSegmentCount: 0,
    otherSegmentCount: 0,
    estimatedSegmentTtsNote: null,
    outOfRangeTargetCount: 0,
    costNote: '비용 계산 자료 없음',
    qaMode: 'strict',
    writeEnabled: Boolean(args.write),
    productionAudioPath: true,
    batchDoubleGeneration: false,
    openAiWouldRun: false,
    finalMp3Root: 'audio/v1',
    cueRoot: 'audio/cues',
    blockers: [],
  };

  let segmentEstimateComplete = true;
  for (const summary of summaries) {
    merged.verseCount += summary.verseCount;
    merged.targetAudioCount += summary.targetAudioCount;
    merged.targetCueCount += summary.targetCueCount;
    merged.existingScriptCount += summary.existingScriptCount;
    merged.existingMp3Count += summary.existingMp3Count;
    merged.existingCueCount += summary.existingCueCount;
    merged.plannedGenerateCount += summary.plannedGenerateCount;
    merged.plannedSkipCount += summary.plannedSkipCount;
    merged.plannedOverwriteCount += summary.plannedOverwriteCount;
    merged.outOfRangeTargetCount += summary.outOfRangeTargetCount;
    merged.openAiWouldRun = merged.openAiWouldRun || summary.openAiWouldRun;
    merged.productionAudioPath = merged.productionAudioPath && summary.productionAudioPath;
    merged.blockers.push(...summary.blockers);
    if (summary.estimatedSegmentTtsCalls == null) {
      segmentEstimateComplete = false;
    } else {
      merged.estimatedSegmentTtsCalls += summary.estimatedSegmentTtsCalls;
      merged.introSegmentCount += summary.introSegmentCount || 0;
      merged.itemSegmentCount += summary.itemSegmentCount || 0;
      merged.closingSegmentCount += summary.closingSegmentCount || 0;
      merged.otherSegmentCount += summary.otherSegmentCount || 0;
    }
  }

  if (!segmentEstimateComplete) {
    merged.estimatedSegmentTtsCalls = null;
    merged.introSegmentCount = null;
    merged.itemSegmentCount = null;
    merged.closingSegmentCount = null;
    merged.otherSegmentCount = null;
    merged.estimatedSegmentTtsNote = '대본 미생성 항목이 있어 세그먼트 TTS 호출 수를 확정할 수 없음';
  } else {
    merged.estimatedSegmentTtsNote = '생성 대본 기준 production cue builder 세그먼트 수(카드별 TTS)';
  }

  // Book-unit cache / cost guards (aggregate across chapters).
  let totalSegments = 0;
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let totalNewInputCharacters = 0;
  let incompleteAudioIds = 0;
  let cacheIndexOk = true;
  let cacheIndexReason = null;
  for (const summary of summaries) {
    totalSegments += summary.totalSegments || 0;
    cacheHitCount += summary.cacheHitCount || 0;
    cacheMissCount += summary.cacheMissCount || 0;
    totalNewInputCharacters += summary.totalNewInputCharacters || 0;
    incompleteAudioIds += summary.incompleteAudioIds || 0;
    if (summary.cacheIndexOk === false) {
      cacheIndexOk = false;
      cacheIndexReason = summary.cacheIndexReason || 'cache_index_missing';
    }
  }
  merged.totalSegments = totalSegments;
  merged.cacheHitCount = cacheHitCount;
  merged.cacheMissCount = cacheMissCount;
  merged.cacheHitRate = totalSegments ? cacheHitCount / totalSegments : 0;
  merged.expectedNewTtsCalls = cacheMissCount;
  merged.expectedReusedCalls = cacheHitCount;
  merged.totalNewInputCharacters = totalNewInputCharacters;
  merged.incompleteAudioIds = incompleteAudioIds;
  merged.cacheIndexOk = cacheIndexOk;
  merged.cacheIndexReason = cacheIndexReason;

  const wantsAudioWrite = Boolean(
    args.write
    && args.confirmProductionAudioWrite
    && (args.stages || []).includes('audio'),
  );
  if (wantsAudioWrite) {
    if (!args.allowNoSegmentCache && !cacheIndexOk) {
      merged.blockers.push(
        `책 단위 production audio는 segment cache index가 필요합니다 (${cacheIndexReason || 'missing'}). `
        + '비상 시에만 --allow-no-segment-cache.',
      );
    }
    if (args.maxNewTtsCalls == null || !Number.isFinite(args.maxNewTtsCalls)) {
      merged.blockers.push('책 단위 production audio write는 --max-new-tts-calls N이 필요합니다.');
    }
    if (args.confirmNewTtsCalls == null || !Number.isFinite(args.confirmNewTtsCalls)) {
      merged.blockers.push('책 단위 production audio write는 --confirm-new-tts-calls N이 필요합니다.');
    }
    if (Number.isFinite(args.confirmNewTtsCalls) && args.confirmNewTtsCalls !== cacheMissCount) {
      merged.blockers.push(
        `--confirm-new-tts-calls(${args.confirmNewTtsCalls})가 계획 cache miss(${cacheMissCount})와 일치하지 않습니다.`,
      );
    }
    if (Number.isFinite(args.maxNewTtsCalls) && cacheMissCount > args.maxNewTtsCalls) {
      merged.blockers.push(
        `예상 신규 TTS(${cacheMissCount})가 --max-new-tts-calls(${args.maxNewTtsCalls})를 초과합니다.`,
      );
    }
  }

  merged.blockers = [...new Set(merged.blockers)];
  return merged;
}

function runSingleChapterPipeline(args, { printPlan = true, compactStdout = false } = {}) {
  assertSafeTarget(args);

  const hardeningPlan = buildHardeningPlanSummary(args);
  if (printPlan) {
    printHardeningPlanSummary(hardeningPlan);
  }

  if (isOnlyQaStage(args)) {
    runQaStage(args);
    return {
      success: process.exitCode ? false : true,
      hardeningPlan,
      output: null,
    };
  }

  const initialPlan = buildPlan(args);
  if (hardeningPlan.blockers.length) {
    initialPlan.safetyBlockers = [...new Set([
      ...initialPlan.safetyBlockers,
      ...hardeningPlan.blockers,
    ])];
  }

  const finalPlan = executePlan({ args, plan: initialPlan });
  const executedStepCount = finalPlan.verses.reduce((count, verse) => (
    count + verse.steps.filter((step) => step.executed).length
  ), 0);
  const hasFailures = finalPlan.verses.some((verse) => (
    verse.steps.some((step) => step.result && step.result.exitCode !== 0)
  ));
  const summary = buildPipelineSummary({ args, finalPlan });

  const output = {
    mode: args.write ? 'write' : 'dry-run',
    masterDryRunPlanOnly: args.dryRun && executedStepCount === 0,
    reportWritten: false,
    ...summary,
    hardeningPlan,
    target: {
      locale: args.locale,
      bookId: args.bookId,
      chapter: args.chapter,
      fromVerse: args.fromVerse,
      toVerse: args.toVerse,
      targetCount: args.toVerse - args.fromVerse + 1,
    },
    stages: args.stages,
    plannedSteps: finalPlan.steps,
    safetyBlockers: finalPlan.safetyBlockers,
    success: finalPlan.safetyBlockers.length === 0 && !hasFailures,
    plan: compactStdout ? undefined : finalPlan.verses,
    verseCount: finalPlan.verses.length,
  };

  if (args.report) {
    const reportPath = writeReport(output);
    output.reportWritten = true;
    output.reportPath = toRelativePath(reportPath);
  }

  return {
    success: output.success,
    hardeningPlan,
    output,
    hasFailures,
    safetyBlockers: finalPlan.safetyBlockers,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs = expandChapterJobs(args);

  if (jobs.length === 1) {
    const result = runSingleChapterPipeline(jobs[0]);
    console.log(JSON.stringify(result.output, null, 2));
    if (!result.success) {
      process.exitCode = 1;
    }
    return;
  }

  // Book-unit mode: aggregate plan, then run each chapter while preserving completed artifacts.
  const hardeningPlan = mergeHardeningPlanSummaries(jobs, args);
  printHardeningPlanSummary(hardeningPlan);

  if (isOnlyQaStage(args)) {
    let failed = false;
    for (const job of jobs) {
      console.error(`○ QA chapter ${job.chapter}`);
      const result = runSingleChapterPipeline(job, { printPlan: false, compactStdout: true });
      if (!result.success) failed = true;
    }
    if (failed) process.exitCode = 1;
    return;
  }

  // Prepare/plan-only book dry-run: do not expand thousands of per-verse command rows to stdout.
  const planOnly = args.dryRun && !dryRunExecutesSteps(args.stages);
  const chapterResults = [];
  let failed = hardeningPlan.blockers.length > 0;

  if (!planOnly && hardeningPlan.blockers.length === 0) {
    for (const job of jobs) {
      console.error(`○ chapter ${job.chapter}/${args.toChapter} start`);
      const result = runSingleChapterPipeline(job, { printPlan: false, compactStdout: true });
      chapterResults.push({
        chapter: job.chapter,
        success: result.success,
        reportPath: result.output?.reportPath || null,
        generatedTextFileCount: result.output?.generatedTextFileCount ?? null,
        safetyBlockers: result.safetyBlockers || [],
      });
      if (!result.success) {
        failed = true;
        console.error(`○ chapter ${job.chapter} failed (continuing remaining chapters)`);
      } else {
        console.error(`○ chapter ${job.chapter} done`);
      }
    }
  } else if (hardeningPlan.blockers.length > 0) {
    console.error(`○ book write blocked: ${hardeningPlan.blockers.join(' | ')}`);
  }

  const output = {
    mode: args.write ? 'write' : 'dry-run',
    masterDryRunPlanOnly: planOnly,
    reportWritten: false,
    hardeningPlan,
    target: {
      locale: args.locale,
      bookId: args.bookId,
      fromChapter: args.fromChapter,
      toChapter: args.toChapter,
      chapterCount: jobs.length,
      verseCount: hardeningPlan.verseCount,
      targetAudioCount: hardeningPlan.targetAudioCount,
    },
    stages: args.stages,
    safetyBlockers: hardeningPlan.blockers,
    success: hardeningPlan.blockers.length === 0 && !failed,
    chapterResults,
  };

  if (args.report) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(
      REPORT_DIR,
      `${timestampForFileName()}-${args.bookId}-${pad3(args.fromChapter)}-${pad3(args.toChapter)}-book-${args.stages.join('+')}-${output.mode}.json`,
    );
    fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    output.reportWritten = true;
    output.reportPath = toRelativePath(reportPath);
  }

  console.log(JSON.stringify(output, null, 2));
  if (!output.success) {
    process.exitCode = 1;
  }
}

main();
