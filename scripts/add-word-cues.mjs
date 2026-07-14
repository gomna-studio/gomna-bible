import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import {
  COMMENTARY_TYPES,
  splitParagraphs,
  buildGenerationPlan,
} from './lib/commentary-highlight-plan.mjs';
import { buildWordCuesFromPlan } from './lib/word-cue-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const BOOK_ID_TO_NAME = {
  genesis: '창세기',
};

function usage() {
  console.error('Usage: node scripts/add-word-cues.mjs --dry-run|--write [--book genesis] [--chapter N] [--verse N] [--type cross-reference]');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    write: false,
    bookId: 'genesis',
    chapter: null,
    verse: null,
    type: 'cross-reference',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--book') args.bookId = argv[++i];
    else if (arg === '--chapter') args.chapter = Number(argv[++i]);
    else if (arg === '--verse') args.verse = Number(argv[++i]);
    else if (arg === '--type') args.type = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }

  if (args.dryRun === args.write) {
    throw new Error('--dry-run 또는 --write 중 하나만 지정해야 합니다.');
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function loadCommentaryData(bookId) {
  const filePath = path.join(ROOT, `gomna_data_${bookId}.js`);
  const sandbox = { pastorCommentaryData: {} };
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), vm.createContext(sandbox));
  return sandbox.pastorCommentaryData;
}

function discoverTargets(args) {
  const base = path.join(ROOT, 'tts-scripts/ko-KR', args.bookId);
  const targets = [];

  const chapters = args.chapter
    ? [pad3(args.chapter)]
    : fs.readdirSync(base).filter((entry) => fs.statSync(path.join(base, entry)).isDirectory()).sort();

  for (const chapter3 of chapters) {
    const chapterPath = path.join(base, chapter3);
    const verses = args.verse
      ? [pad3(args.verse)]
      : fs.readdirSync(chapterPath).filter((entry) => fs.statSync(path.join(chapterPath, entry)).isDirectory()).sort();

    for (const verse3 of verses) {
      targets.push({
        bookId: args.bookId,
        bookName: BOOK_ID_TO_NAME[args.bookId] || args.bookId,
        chapter: Number(chapter3),
        verse: Number(verse3),
        verseDir: path.join(chapterPath, verse3),
      });
    }
  }

  return targets;
}

function validateWords(words, duration) {
  const errors = [];
  if (!words.length) errors.push('words_empty');

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word.text) errors.push(`word_${i}_missing_text`);
    if (word.end <= word.start) errors.push(`word_${i}_invalid_range`);
    if (i > 0 && word.start < words[i - 1].start) errors.push(`word_${i}_non_monotonic`);
  }

  const lastEnd = words[words.length - 1]?.end ?? 0;
  if (Math.abs(lastEnd - duration) > 0.05) {
    errors.push(`last_word_end_delta:${Math.abs(lastEnd - duration).toFixed(3)}`);
  }

  return errors;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const typeConfig = COMMENTARY_TYPES.find((item) => item.type === args.type);
  if (!typeConfig) throw new Error(`알 수 없는 type: ${args.type}`);

  const data = loadCommentaryData(args.bookId);
  const targets = discoverTargets(args);
  const results = [];

  for (const target of targets) {
    const chapter3 = pad3(target.chapter);
    const verse3 = pad3(target.verse);
    const txtPath = path.join(target.verseDir, `${args.type}.txt`);
    const cuePath = path.join(ROOT, 'audio/cues/ko-KR', args.bookId, chapter3, verse3, `${args.type}.json`);
    const segmentDir = path.join(ROOT, 'audio/highlight-segments/ko-KR', args.bookId, chapter3, verse3, args.type);

    if (!fs.existsSync(txtPath) || !fs.existsSync(cuePath) || !fs.existsSync(segmentDir)) {
      results.push({
        chapter: target.chapter,
        verse: target.verse,
        status: 'skipped',
        reason: 'missing_inputs',
      });
      continue;
    }

    const cue = JSON.parse(fs.readFileSync(cuePath, 'utf8'));
    const paragraphs = splitParagraphs(fs.readFileSync(txtPath, 'utf8'));
    const verseKey = `${target.bookName}_${target.chapter}_${target.verse}`;
    const rows = data[verseKey]?.[typeConfig.tableKey] || [];
    const plan = buildGenerationPlan({
      typeConfig,
      paragraphs,
      rows,
      rowCount: rows.length,
      bookId: target.bookId,
      chapter: target.chapter,
      verse: target.verse,
    });

    if (!plan) {
      results.push({
        chapter: target.chapter,
        verse: target.verse,
        status: 'skipped',
        reason: 'plan_invalid',
      });
      continue;
    }

    const words = buildWordCuesFromPlan({ plan, paragraphs, segmentDir });
    const errors = validateWords(words, cue.duration);

    if (errors.length) {
      results.push({
        chapter: target.chapter,
        verse: target.verse,
        status: 'failed',
        errors,
        wordCount: words.length,
      });
      continue;
    }

    if (args.write) {
      const nextCue = { ...cue, words };
      fs.writeFileSync(cuePath, `${JSON.stringify(nextCue, null, 2)}\n`);
    }

    results.push({
      chapter: target.chapter,
      verse: target.verse,
      status: args.write ? 'written' : 'ready',
      wordCount: words.length,
      sample: words.slice(0, 4),
    });
  }

  console.log(JSON.stringify({
    mode: args.write ? 'write' : 'dry-run',
    type: args.type,
    bookId: args.bookId,
    summary: {
      total: results.length,
      written: results.filter((item) => item.status === 'written').length,
      ready: results.filter((item) => item.status === 'ready').length,
      failed: results.filter((item) => item.status === 'failed').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
    },
    results,
  }, null, 2));

  if (results.some((item) => item.status === 'failed')) {
    process.exitCode = 1;
  }
}

main();
