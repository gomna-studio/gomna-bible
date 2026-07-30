import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';
import vm from 'vm';
import {
  COMMENTARY_TYPES,
  splitParagraphs,
  buildGenerationPlan,
  countPlannedSegments,
  countPlannedItems,
  expectedItemCount,
} from './lib/commentary-highlight-plan.mjs';
import { buildWordCuesFromPlan } from './lib/word-cue-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const BOOK_FILE_MAP = {
  창세기: 'genesis', 출애굽기: 'exodus', 레위기: 'leviticus', 민수기: 'numbers', 신명기: 'deuteronomy',
  여호수아: 'joshua', 사사기: 'judges', 룻기: 'ruth', 사무엘상: '1samuel', 사무엘하: '2samuel',
  열왕기상: '1kings', 열왕기하: '2kings', 역대상: '1chronicles', 역대하: '2chronicles',
  에스라: 'ezra', 느헤미야: 'nehemiah', 에스더: 'esther', 욥기: 'job', 시편: 'psalms',
  잠언: 'proverbs', 전도서: 'ecclesiastes', 아가: 'song', 이사야: 'isaiah', 예레미야: 'jeremiah',
  예레미야애가: 'lamentations', 에스겔: 'ezekiel', 다니엘: 'daniel', 호세아: 'hosea',
  요엘: 'joel', 아모스: 'amos', 오바댜: 'obadiah', 요나: 'jonah', 미가: 'micah',
  나훔: 'nahum', 하박국: 'habakkuk', 스바냐: 'zephaniah', 학개: 'haggai',
  스가랴: 'zechariah', 말라기: 'malachi', 마태복음: 'matthew', 마가복음: 'mark',
  누가복음: 'luke', 요한복음: 'john', 사도행전: 'acts', 로마서: 'romans',
  고린도전서: '1corinthians', 고린도후서: '2corinthians', 갈라디아서: 'galatians',
  에베소서: 'ephesians', 빌립보서: 'philippians', 골로새서: 'colossians',
  데살로니가전서: '1thessalonians', 데살로니가후서: '2thessalonians',
  디모데전서: '1timothy', 디모데후서: '2timothy', 디도서: 'titus', 빌레몬서: 'philemon',
  히브리서: 'hebrews', 야고보서: 'james', 베드로전서: '1peter', 베드로후서: '2peter',
  요한일서: '1john', 요한이서: '2john', 요한삼서: '3john', 유다서: 'jude', 요한계시록: 'revelation',
};

const BOOK_ID_TO_NAME = Object.fromEntries(
  Object.entries(BOOK_FILE_MAP).map(([name, id]) => [id, name]),
);

const TTS_DEFAULTS = {
  model: 'gpt-4o-mini-tts',
  providerVoice: 'marin',
  outputFormat: 'mp3',
  instructions: [
    '한국어 문장은 자연스러운 한국어로 읽는다.',
    '“창세기”는 한국어 성경 책 이름으로 자연스럽게 “창-세-기”라고 읽는다.',
    '“창세기”의 첫 음절 “창”은 받침 ㅇ을 분명하게 하되 과장하지 않는다.',
    '성경 구절 제목은 또박또박 자연스러운 한국어 성경 낭독 톤으로 읽는다.',
    '“창세기”를 다른 단어처럼 뭉개거나 이상하게 발음하지 않는다.',
    '영어 원문 문장은 생략하지 않는다.',
    '영어 원문은 번역하지 않는다.',
    '영어 원문은 영어 문장 그대로 읽는다.',
    '따옴표 안의 영어 문장도 반드시 읽는다.',
    '매튜헨리의 영어 원문은 한국어식으로 읽지 말고, 자연스러운 영어 발음으로 읽는다.',
    '영어 원문 줄은 영어 문장처럼 분명히 끊어 읽는다.',
    '영어 원문과 한국어 해설 사이에는 짧게 쉬어 읽는다.',
    '한국어 해설은 기존처럼 차분한 한국어 낭독 톤을 유지한다.',
    '매튜헨리 항목에서는 영어원문과 한국어 해설을 모두 읽는다.',
  ].join(' '),
};

const BUILD_SEGMENTS_BASE = path.join(ROOT, 'audio', 'highlight-build');
const BUILD_CUES_BASE = path.join(ROOT, 'audio', 'cues-build');
const REPORTS_BASE = path.join(ROOT, 'reports', 'commentary-highlight-cues');
const TTS_ROOT = path.join(ROOT, 'tts-scripts', 'ko-KR');

function usage() {
  console.error('Usage:');
  console.error('  node scripts/build-commentary-highlight-cues.mjs --audit|--dry-run|--write [scope]');
  console.error('Scope: --all | --book <id> [--chapter N] [--verse N] [--type <type>]');
  console.error('Options: --locale ko-KR (default), --force, --production-output');
  console.error('  --production-output  최종 MP3를 audio/v1에, cue를 audio/cues에 기록 (기본 scoped 동작은 highlight-test 유지)');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
    type: null,
    all: false,
    audit: false,
    dryRun: false,
    write: false,
    force: false,
    confirmAllGeneration: false,
    productionOutput: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--locale' || arg === '--language') args.locale = argv[++i];
    else if (arg === '--book') args.bookId = argv[++i];
    else if (arg === '--chapter') args.chapter = Number(argv[++i]);
    else if (arg === '--verse') args.verse = Number(argv[++i]);
    else if (arg === '--type') args.type = argv[++i];
    else if (arg === '--all') args.all = true;
    else if (arg === '--audit') args.audit = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--confirm-all-generation') args.confirmAllGeneration = true;
    else if (arg === '--production-output') args.productionOutput = true;
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }

  const modeCount = [args.audit, args.dryRun, args.write].filter(Boolean).length;
  if (modeCount !== 1) {
    throw new Error('--audit, --dry-run, --write 중 하나만 지정해야 합니다.');
  }

  if (args.all && args.write) {
    throw new Error('--all --write 조합은 허용되지 않습니다.');
  }

  if (args.all && args.write && args.confirmAllGeneration) {
    throw new Error('--all --write --confirm-all-generation 조합은 허용되지 않습니다.');
  }

  if (args.productionOutput && args.all) {
    throw new Error('--production-output은 --all과 함께 사용할 수 없습니다. --book 범위를 지정하세요.');
  }

  if (!args.all && !args.bookId) {
    throw new Error('--all 또는 --book <id> 범위를 지정해야 합니다.');
  }

  if (args.bookId && !BOOK_ID_TO_NAME[args.bookId]) {
    throw new Error(`알 수 없는 bookId: ${args.bookId}`);
  }

  if (args.type && !COMMENTARY_TYPES.some((item) => item.type === args.type)) {
    throw new Error(`알 수 없는 type: ${args.type}`);
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function timestampSlug() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function discoverVerseDirectories({ locale, bookId, chapter, verse }) {
  const base = path.join(ROOT, 'tts-scripts', locale);
  const results = [];

  const bookIds = bookId ? [bookId] : fs.readdirSync(base).filter((entry) => {
    const full = path.join(base, entry);
    return fs.statSync(full).isDirectory();
  }).sort();

  for (const currentBookId of bookIds) {
    const bookPath = path.join(base, currentBookId);
    if (!fs.existsSync(bookPath)) continue;

    const chapters = chapter
      ? [pad3(chapter)]
      : fs.readdirSync(bookPath).filter((entry) => fs.statSync(path.join(bookPath, entry)).isDirectory()).sort();

    for (const chapter3 of chapters) {
      const chapterPath = path.join(bookPath, chapter3);
      const verses = verse
        ? [pad3(verse)]
        : fs.readdirSync(chapterPath).filter((entry) => fs.statSync(path.join(chapterPath, entry)).isDirectory()).sort();

      for (const verse3 of verses) {
        results.push({
          locale,
          bookId: currentBookId,
          bookName: BOOK_ID_TO_NAME[currentBookId] || currentBookId,
          chapter: Number(chapter3),
          verse: Number(verse3),
          verseDir: path.join(chapterPath, verse3),
        });
      }
    }
  }

  return results;
}

const commentaryDataCache = new Map();

function loadCommentaryData(bookId) {
  if (commentaryDataCache.has(bookId)) {
    return commentaryDataCache.get(bookId);
  }

  const filePath = path.join(ROOT, `gomna_data_${bookId}.js`);
  if (!fs.existsSync(filePath)) {
    const result = { ok: false, error: 'data_file_missing', data: null };
    commentaryDataCache.set(bookId, result);
    return result;
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
    const result = { ok: true, error: null, data };
    commentaryDataCache.set(bookId, result);
    return result;
  } catch (error) {
    const result = { ok: false, error: `data_load_failed: ${error.message}`, data: null };
    commentaryDataCache.set(bookId, result);
    return result;
  }
}

function buildVerseKey(bookName, chapter, verse) {
  return `${bookName}_${chapter}_${verse}`;
}

function buildAudioId(bookId, chapter, verse, type) {
  return `${bookId}.${pad3(chapter)}.${pad3(verse)}.${type}`;
}

function getTypeConfigs(typeFilter) {
  return typeFilter
    ? COMMENTARY_TYPES.filter((item) => item.type === typeFilter)
    : COMMENTARY_TYPES;
}

function resolveOutputOptions(args) {
  if (args.productionOutput) {
    return { productionOutput: true, useTestOutputs: false };
  }
  // Existing scoped behavior: write final MP3 under highlight-test; --all uses build paths.
  return { productionOutput: false, useTestOutputs: !args.all };
}

function getOutputPaths(target, typeConfig, { useTestOutputs = false, productionOutput = false } = {}) {
  const chapter3 = pad3(target.chapter);
  const verse3 = pad3(target.verse);

  let segmentsBase;
  let mp3Base;
  let cuesBase;

  if (productionOutput) {
    // Single production path: segment TTS cache → concat → audio/v1 MP3 + audio/cues.
    segmentsBase = path.join(ROOT, 'audio', 'highlight-segments');
    mp3Base = path.join(ROOT, 'audio', 'v1');
    cuesBase = path.join(ROOT, 'audio', 'cues');
  } else if (useTestOutputs) {
    segmentsBase = path.join(ROOT, 'audio', 'highlight-segments');
    mp3Base = path.join(ROOT, 'audio', 'highlight-test');
    cuesBase = path.join(ROOT, 'audio', 'cues');
  } else {
    segmentsBase = BUILD_SEGMENTS_BASE;
    mp3Base = BUILD_SEGMENTS_BASE;
    cuesBase = BUILD_CUES_BASE;
  }

  const segmentDir = path.join(
    segmentsBase,
    target.locale,
    target.bookId,
    chapter3,
    verse3,
    typeConfig.type,
  );
  const finalMp3Path = path.join(
    mp3Base,
    target.locale,
    target.bookId,
    chapter3,
    verse3,
    `${typeConfig.type}-${typeConfig.voicePreset}.mp3`,
  );
  const cuePath = path.join(
    cuesBase,
    target.locale,
    target.bookId,
    chapter3,
    verse3,
    `${typeConfig.type}.json`,
  );
  const markerPath = path.join(segmentDir, '.build-complete.json');
  const tmpWorkDir = path.join(segmentDir, '_tmp');

  return { segmentDir, finalMp3Path, cuePath, markerPath, tmpWorkDir };
}

function inspectTypeTarget({ target, typeConfig, mode, useTestOutputs = false, productionOutput = false }) {
  const txtPath = path.join(target.verseDir, `${typeConfig.type}.txt`);
  const audioId = buildAudioId(target.bookId, target.chapter, target.verse, typeConfig.type);
  const outputs = getOutputPaths(target, typeConfig, { useTestOutputs, productionOutput });
  const blocker = {
    book: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    type: typeConfig.type,
    txtPath: toRelativePath(txtPath),
    reason: null,
    paragraphCount: null,
    expectedCardCount: null,
    expectedItemCount: null,
    audioId,
  };

  if (!fs.existsSync(txtPath)) {
    blocker.reason = 'txt_missing';
    return { status: 'txt_missing', blocker, plan: null, outputs };
  }

  const raw = fs.readFileSync(txtPath, 'utf8');
  if (!raw.trim()) {
    blocker.reason = 'txt_empty';
    return { status: 'txt_empty', blocker, plan: null, outputs };
  }

  const paragraphs = splitParagraphs(raw);
  blocker.paragraphCount = paragraphs.length;

  const dataResult = loadCommentaryData(target.bookId);
  if (!dataResult.ok) {
    blocker.reason = dataResult.error;
    return { status: 'invalid', blocker, plan: null, outputs };
  }

  const verseKey = buildVerseKey(target.bookName, target.chapter, target.verse);
  const entry = dataResult.data[verseKey];
  if (!entry || !Array.isArray(entry[typeConfig.tableKey])) {
    blocker.reason = 'commentary_rows_missing';
    return { status: 'invalid', blocker, plan: null, outputs };
  }

  const rowCount = entry[typeConfig.tableKey].length;
  const rows = entry[typeConfig.tableKey];
  blocker.expectedCardCount = rowCount;

  const plan = buildGenerationPlan({
    typeConfig,
    paragraphs,
    rowCount,
    rows,
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
  });

  if (!plan) {
    blocker.reason = 'paragraph_plan_mismatch';
    return { status: 'invalid', blocker, plan: null, outputs };
  }

  const plannedItems = countPlannedItems(plan);
  blocker.expectedItemCount = expectedItemCount(typeConfig.type, rowCount, plan);
  if (plan.unmappedCards?.length) {
    blocker.unmappedCards = plan.unmappedCards;
  }

  if (typeConfig.type === 'cross-reference') {
    for (const unit of plan) {
      if (unit.kind === 'item' && unit.itemIndices) {
        blocker.reason = 'cross_reference_combined_item_indices_not_allowed';
        return { status: 'invalid', blocker, plan: null, outputs };
      }
    }
    if (plannedItems !== rowCount) {
      blocker.reason = `item_count_mismatch:${plannedItems}!=${rowCount}`;
      return { status: 'invalid', blocker, plan: null, outputs };
    }
  }

  if (typeConfig.type !== 'sermon' && typeConfig.type !== 'cross-reference' && plannedItems !== rowCount) {
    blocker.reason = `item_count_mismatch:${plannedItems}!=${rowCount}`;
    return { status: 'invalid', blocker, plan: null, outputs };
  }

  const segmentCount = countPlannedSegments(plan);
  const complete = fs.existsSync(outputs.markerPath)
    && fs.existsSync(outputs.cuePath)
    && fs.existsSync(outputs.finalMp3Path);

  if (complete && mode === 'write') {
    return {
      status: 'skip_complete',
      blocker: null,
      plan,
      outputs,
      audioId,
      rowCount,
      segmentCount,
      plannedItems,
      paragraphCount: paragraphs.length,
      paragraphs,
      verseKey,
    };
  }

  return {
    status: 'valid',
    blocker: null,
    plan,
    outputs,
    audioId,
    rowCount,
    segmentCount,
    plannedItems,
    paragraphCount: paragraphs.length,
    paragraphs,
    verseKey,
  };
}

function probeDurationSeconds(filePath) {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
    { encoding: 'utf8' },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe duration 실패: ${filePath}`);
  }
  return duration;
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function detectLeadingSilenceSeconds(filePath) {
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', filePath, '-af', 'silencedetect=noise=-30dB:d=0.05', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const stderr = result.stderr || '';
  const silenceStartMatch = stderr.match(/silence_start: ([0-9.]+)/);
  if (!silenceStartMatch || Number(silenceStartMatch[1]) > 0.001) {
    return 0;
  }
  const silenceEndMatch = stderr.match(/silence_end: ([0-9.]+)/);
  return silenceEndMatch ? roundTime(Number(silenceEndMatch[1])) : 0;
}

function shellEscapePath(filePath) {
  return filePath.replace(/'/g, "'\\''");
}

function mp3ToWav(mp3Path, wavPath) {
  execFileSync(
    'ffmpeg',
    ['-y', '-i', mp3Path, '-ar', '24000', '-ac', '1', '-sample_fmt', 's16', wavPath],
    { stdio: 'pipe' },
  );
}

function concatWavsToMp3(wavPaths, outputMp3Path, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const listPath = path.join(workDir, 'wav-list.txt');
  const combinedWav = path.join(workDir, 'combined.wav');

  fs.writeFileSync(
    listPath,
    `${wavPaths.map((wavPath) => `file '${shellEscapePath(wavPath)}'`).join('\n')}\n`,
  );

  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', combinedWav],
    { stdio: 'pipe' },
  );

  execFileSync(
    'ffmpeg',
    ['-y', '-i', combinedWav, '-codec:a', 'libmp3lame', '-qscale:a', '2', outputMp3Path],
    { stdio: 'pipe' },
  );
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (!value || value.startsWith('#')) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function getOpenAiApiKey() {
  loadEnvFile(path.join(ROOT, '.env'));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다.');
  return apiKey;
}

async function callOpenAiTts({ apiKey, text }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_DEFAULTS.model,
      voice: TTS_DEFAULTS.providerVoice,
      instructions: TTS_DEFAULTS.instructions,
      input: text,
      response_format: TTS_DEFAULTS.outputFormat,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS 실패: HTTP ${response.status} ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function segmentTypeFromKind(kind) {
  if (kind === 'item') return 'item';
  if (kind === 'intro') return 'intro';
  if (kind === 'closing') return 'closing';
  return 'bridge';
}

function buildCueSegments(units, unitDurations) {
  const segments = [];
  let cursor = 0;

  for (const unit of units) {
    const duration = unitDurations.get(unit) || 0;
    const start = cursor;
    const end = cursor + duration;
    cursor = end;

    const segment = {
      type: segmentTypeFromKind(unit.kind),
      itemIndex: unit.itemIndex ?? -1,
      start: roundTime(start),
      end: roundTime(end),
    };

    if (unit.itemIndices) segment.itemIndices = unit.itemIndices;
    segments.push(segment);
  }

  return segments;
}

function buildCueSegmentsFromSpeechOnsets(units, unitSpeechStarts, totalDuration) {
  const itemUnits = units.filter((unit) => unit.kind === 'item');
  const itemSpeechStarts = itemUnits.map((unit) => unitSpeechStarts.get(unit) ?? 0);
  const firstItemSpeechStart = itemSpeechStarts[0] ?? totalDuration;
  const segments = [];

  for (const unit of units) {
    let start;
    let end;

    if (unit.kind === 'intro') {
      start = 0;
      end = firstItemSpeechStart;
    } else if (unit.kind === 'item') {
      const itemIndex = itemUnits.indexOf(unit);
      start = itemSpeechStarts[itemIndex] ?? 0;
      end = itemIndex < itemSpeechStarts.length - 1
        ? itemSpeechStarts[itemIndex + 1]
        : totalDuration;
    } else {
      start = unitSpeechStarts.get(unit) ?? 0;
      const unitIndex = units.indexOf(unit);
      const nextUnit = units[unitIndex + 1];
      end = nextUnit
        ? (nextUnit.kind === 'item'
          ? itemSpeechStarts[itemUnits.indexOf(nextUnit)]
          : unitSpeechStarts.get(nextUnit))
        : totalDuration;
    }

    const segment = {
      type: segmentTypeFromKind(unit.kind),
      itemIndex: unit.itemIndex ?? -1,
      start: roundTime(start),
      end: roundTime(end),
    };

    if (unit.itemIndices) segment.itemIndices = unit.itemIndices;
    segments.push(segment);
  }

  return segments;
}

function validateBuiltCue({ duration, finalMp3Duration, segments, rowCount, type, plannedItems }) {
  const errors = [];
  if (!segments.length) errors.push('segments empty');

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.end <= seg.start) errors.push(`segment ${i} end <= start`);
    if (i > 0 && Math.abs(segments[i - 1].end - seg.start) > 0.001) {
      errors.push(`segment ${i} discontinuity`);
    }
  }

  const itemSegments = segments.filter((seg) => seg.type === 'item');
  if (plannedItems != null && itemSegments.length !== plannedItems) {
    errors.push(`item segment count ${itemSegments.length} != planned ${plannedItems}`);
  }

  if (type !== 'sermon' && type !== 'cross-reference' && itemSegments.length !== rowCount) {
    errors.push(`item segment count ${itemSegments.length} != rowCount ${rowCount}`);
  }

  if (type === 'cross-reference') {
    for (const seg of itemSegments) {
      if (seg.itemIndices) {
        errors.push(`cross-reference segment combines itemIndices ${seg.itemIndices.join(',')}`);
      }
    }
    if (itemSegments.length !== rowCount) {
      errors.push(`item segment count ${itemSegments.length} != rowCount ${rowCount}`);
    }
  }

  const lastEnd = segments[segments.length - 1]?.end;
  if (Math.abs(lastEnd - duration) > 0.001) errors.push('last end != cue duration');
  if (finalMp3Duration != null && Math.abs(lastEnd - finalMp3Duration) > 0.05) {
    errors.push(`final mp3 delta ${Math.abs(lastEnd - finalMp3Duration).toFixed(3)}s > 0.05s`);
  }

  return errors;
}

async function writeTypeTarget({ inspected, apiKey, force }) {
  const {
    plan,
    outputs,
    paragraphs,
    audioId,
    rowCount,
    segmentCount,
    plannedItems,
    typeConfig,
  } = inspected;

  if (inspected.status === 'skip_complete' && !force) {
    return { status: 'skipped', audioId, errors: [] };
  }

  const unitDurations = new Map();
  const unitSpeechStarts = new Map();
  const orderedSegmentMp3s = [];
  let timelineCursor = 0;

  for (let unitIndex = 0; unitIndex < plan.length; unitIndex++) {
    const unit = plan[unitIndex];
    let unitDuration = 0;
    let unitSpeechStart = null;

    const ttsTexts = Array.isArray(unit.ttsTexts) && unit.ttsTexts.length
      ? unit.ttsTexts
      : unit.paragraphIndices.map((paragraphIndex) => paragraphs[paragraphIndex]);

    for (let textIndex = 0; textIndex < ttsTexts.length; textIndex++) {
      const paragraphIndex = unit.paragraphIndices[textIndex] ?? unit.paragraphIndices[0] ?? 0;
      const segFile = path.join(
        outputs.segmentDir,
        `unit-${String(unitIndex).padStart(2, '0')}-para-${String(paragraphIndex).padStart(2, '0')}${ttsTexts.length > 1 ? `-part-${String(textIndex).padStart(2, '0')}` : ''}.mp3`,
      );

      if (fs.existsSync(segFile) && !force) {
        const duration = probeDurationSeconds(segFile);
        if (unitSpeechStart == null) {
          unitSpeechStart = roundTime(timelineCursor + detectLeadingSilenceSeconds(segFile));
        }
        unitDuration += duration;
        orderedSegmentMp3s.push(segFile);
        timelineCursor += duration;
        continue;
      }

      fs.mkdirSync(path.dirname(segFile), { recursive: true });
      const audio = await callOpenAiTts({ apiKey, text: ttsTexts[textIndex] });
      fs.writeFileSync(segFile, audio);
      const duration = probeDurationSeconds(segFile);
      if (unitSpeechStart == null) {
        unitSpeechStart = roundTime(timelineCursor + detectLeadingSilenceSeconds(segFile));
      }
      unitDuration += duration;
      orderedSegmentMp3s.push(segFile);
      timelineCursor += duration;
    }

    unitDurations.set(unit, unitDuration);
    unitSpeechStarts.set(unit, unitSpeechStart ?? timelineCursor);
  }

  const measuredTotal = roundTime(Array.from(unitDurations.values()).reduce((sum, v) => sum + v, 0));
  const segments = buildCueSegmentsFromSpeechOnsets(plan, unitSpeechStarts, measuredTotal);

  const wavDir = path.join(outputs.tmpWorkDir, 'wav');
  fs.mkdirSync(wavDir, { recursive: true });
  const wavPaths = orderedSegmentMp3s.map((mp3Path, index) => {
    const wavPath = path.join(wavDir, `seg-${String(index).padStart(3, '0')}.wav`);
    mp3ToWav(mp3Path, wavPath);
    return wavPath;
  });

  const tmpMp3 = path.join(outputs.tmpWorkDir, 'final.tmp.mp3');
  fs.mkdirSync(path.dirname(outputs.finalMp3Path), { recursive: true });
  concatWavsToMp3(wavPaths, tmpMp3, outputs.tmpWorkDir);
  fs.renameSync(tmpMp3, outputs.finalMp3Path);
  const finalMp3Duration = roundTime(probeDurationSeconds(outputs.finalMp3Path));

  const words = buildWordCuesFromPlan({
    plan,
    paragraphs,
    segmentDir: outputs.segmentDir,
  });

  const cue = {
    audioId,
    duration: measuredTotal,
    measuredDuration: measuredTotal,
    testAudioPath: toRelativePath(outputs.finalMp3Path),
    finalMp3Duration,
    segments,
    words,
  };

  const errors = validateBuiltCue({
    duration: cue.duration,
    finalMp3Duration,
    segments,
    rowCount,
    type: typeConfig.type,
    plannedItems,
  });

  if (errors.length) {
    return { status: 'failed', audioId, errors };
  }

  fs.mkdirSync(path.dirname(outputs.cuePath), { recursive: true });
  fs.writeFileSync(outputs.cuePath, `${JSON.stringify(cue, null, 2)}\n`);
  fs.writeFileSync(outputs.markerPath, `${JSON.stringify({
    audioId,
    completedAt: new Date().toISOString(),
    segmentCount,
    finalMp3Duration,
    cuePath: toRelativePath(outputs.cuePath),
  }, null, 2)}\n`);

  return { status: 'written', audioId, errors: [], finalMp3Duration, durationDelta: 0 };
}

function initReport(mode, args) {
  return {
    generatedAt: new Date().toISOString(),
    mode,
    scope: {
      all: args.all,
      bookId: args.bookId,
      chapter: args.chapter,
      verse: args.verse,
      type: args.type,
      locale: args.locale,
      productionOutput: Boolean(args.productionOutput),
    },
    summary: {
      totalVerseDirectoryCount: 0,
      totalTypeTargetCount: 0,
      totalTxtFoundCount: 0,
      totalTxtMissingCount: 0,
      totalValidCount: 0,
      totalInvalidCount: 0,
      totalPlannedSegmentCount: 0,
      totalPlannedFinalMp3Count: 0,
      totalPlannedCueCount: 0,
      totalSkippedCount: 0,
      totalWouldWriteCount: 0,
      totalWrittenCount: 0,
      totalFailedWriteCount: 0,
      blockerCount: 0,
    },
    countsByBook: {},
    countsByType: {},
    blockers: [],
    ttsInventory: {
      books: [],
      totalVerseDirectories: 0,
      totalTxtFiles: 0,
    },
    bibleCatalog: {
      bookCount: Object.keys(BOOK_ID_TO_NAME).length,
      booksWithTtsScripts: [],
      booksWithoutTtsScripts: [],
    },
    results: [],
  };
}

function bumpCount(bucket, key, field, amount = 1) {
  if (!bucket[key]) bucket[key] = {};
  bucket[key][field] = (bucket[key][field] || 0) + amount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.audit ? 'audit' : args.dryRun ? 'dry-run' : 'write';
  const verseTargets = discoverVerseDirectories(args);
  const typeConfigs = getTypeConfigs(args.type);
  const report = initReport(mode, args);

  report.summary.totalVerseDirectoryCount = verseTargets.length;
  report.ttsInventory.totalVerseDirectories = verseTargets.length;

  const ttsBooks = fs.existsSync(TTS_ROOT)
    ? fs.readdirSync(TTS_ROOT).filter((entry) => fs.statSync(path.join(TTS_ROOT, entry)).isDirectory()).sort()
    : [];

  report.ttsInventory.books = ttsBooks;
  report.bibleCatalog.booksWithTtsScripts = ttsBooks;
  report.bibleCatalog.booksWithoutTtsScripts = Object.keys(BOOK_ID_TO_NAME)
    .filter((bookId) => !ttsBooks.includes(bookId))
    .sort();

  let txtFiles = 0;
  for (const target of verseTargets) {
    for (const typeConfig of typeConfigs) {
      report.summary.totalTypeTargetCount += 1;
      bumpCount(report.countsByType, typeConfig.type, 'targets');

      const txtPath = path.join(target.verseDir, `${typeConfig.type}.txt`);
      if (!fs.existsSync(txtPath)) {
        report.summary.totalTxtMissingCount += 1;
        if (mode !== 'audit') {
          const blocker = {
            book: target.bookId,
            chapter: target.chapter,
            verse: target.verse,
            type: typeConfig.type,
            txtPath: toRelativePath(txtPath),
            reason: 'txt_missing',
          };
          report.blockers.push(blocker);
          report.summary.totalInvalidCount += 1;
          report.summary.blockerCount += 1;
          bumpCount(report.countsByBook, target.bookId, 'invalid');
          bumpCount(report.countsByType, typeConfig.type, 'invalid');
        }
        bumpCount(report.countsByBook, target.bookId, 'txtMissing');
        bumpCount(report.countsByType, typeConfig.type, 'txtMissing');
        continue;
      }

      report.summary.totalTxtFoundCount += 1;
      txtFiles += 1;
      bumpCount(report.countsByBook, target.bookId, 'txtFound');
      bumpCount(report.countsByType, typeConfig.type, 'txtFound');

      if (mode === 'audit') {
        continue;
      }

      const outputOptions = resolveOutputOptions(args);
      const inspected = inspectTypeTarget({
        target,
        typeConfig,
        mode,
        ...outputOptions,
      });
      inspected.typeConfig = typeConfig;

      if (inspected.status === 'invalid' || inspected.status === 'txt_missing' || inspected.status === 'txt_empty') {
        report.summary.totalInvalidCount += 1;
        report.summary.blockerCount += 1;
        report.blockers.push(inspected.blocker);
        bumpCount(report.countsByBook, target.bookId, 'invalid');
        bumpCount(report.countsByType, typeConfig.type, 'invalid');
        continue;
      }

      report.summary.totalValidCount += 1;
      report.summary.totalPlannedSegmentCount += inspected.segmentCount;
      report.summary.totalPlannedFinalMp3Count += 1;
      report.summary.totalPlannedCueCount += 1;
      bumpCount(report.countsByBook, target.bookId, 'valid');
      bumpCount(report.countsByType, typeConfig.type, 'valid');

      if (inspected.status === 'skip_complete') {
        report.summary.totalSkippedCount += 1;
        bumpCount(report.countsByBook, target.bookId, 'skipped');
      } else if (mode === 'dry-run') {
        report.summary.totalWouldWriteCount += 1;
      }

      report.results.push({
        book: target.bookId,
        chapter: target.chapter,
        verse: target.verse,
        type: typeConfig.type,
        audioId: inspected.audioId,
        status: inspected.status,
        paragraphCount: inspected.paragraphCount,
        expectedCardCount: inspected.rowCount,
        plannedItemCount: inspected.plannedItems,
        plannedSegmentCount: inspected.segmentCount,
        cuePath: toRelativePath(inspected.outputs.cuePath),
        buildAudioPath: toRelativePath(inspected.outputs.finalMp3Path),
      });
    }
  }

  report.ttsInventory.totalTxtFiles = txtFiles;

  if (mode === 'write') {
    const apiKey = getOpenAiApiKey();
    const outputOptions = resolveOutputOptions(args);
    for (const item of report.results) {
      if (item.status !== 'valid' && item.status !== 'skip_complete') continue;
      const target = verseTargets.find((entry) => (
        entry.bookId === item.book
        && entry.chapter === item.chapter
        && entry.verse === item.verse
      ));
      const typeConfig = COMMENTARY_TYPES.find((entry) => entry.type === item.type);
      const inspected = inspectTypeTarget({
        target,
        typeConfig,
        mode,
        ...outputOptions,
      });
      inspected.typeConfig = typeConfig;
      let writeResult;
      try {
        writeResult = await writeTypeTarget({ inspected, apiKey, force: args.force });
      } catch (error) {
        writeResult = {
          status: 'failed',
          audioId: inspected.audioId,
          errors: [error.message],
        };
      }
      item.writeStatus = writeResult.status;
      item.writeErrors = writeResult.errors;
      if (writeResult.status === 'written') report.summary.totalWrittenCount += 1;
      else if (writeResult.status === 'skipped') report.summary.totalSkippedCount += 1;
      else if (writeResult.status === 'failed') {
        report.summary.totalFailedWriteCount += 1;
        report.blockers.push({
          book: item.book,
          chapter: item.chapter,
          verse: item.verse,
          type: item.type,
          txtPath: item.cuePath,
          reason: `write_failed:${writeResult.errors.join(',')}`,
        });
      }
    }
  }

  fs.mkdirSync(REPORTS_BASE, { recursive: true });
  const reportPath = path.join(REPORTS_BASE, `${timestampSlug()}-all-${mode}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    mode,
    reportPath: toRelativePath(reportPath),
    summary: report.summary,
    countsByBook: report.countsByBook,
    countsByType: report.countsByType,
    blockerSample: report.blockers.slice(0, 20),
    ttsInventory: report.ttsInventory,
    bibleCatalog: report.bibleCatalog,
  }, null, 2));

  if (report.summary.blockerCount > 0 && mode !== 'audit') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
