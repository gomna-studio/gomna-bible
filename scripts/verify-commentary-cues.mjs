import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: node scripts/verify-commentary-cues.mjs --locale ko-KR --book genesis --chapter 1 --verse 5');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    verse: null,
  };

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
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !Number.isInteger(args.chapter) || !Number.isInteger(args.verse)) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  return args;
}

function pad3(num) {
  return String(num).padStart(3, '0');
}

function toRelativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function isEnglishCueLine(line) {
  const trimmed = line.trim();
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(trimmed)) return false;
  return /^[A-Za-z0-9 "'.,;:!?()[\]-]+$/.test(trimmed);
}

function extractExpectedCueTexts(args) {
  const scriptPath = path.join(
    ROOT,
    'tts-scripts',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(args.verse),
    'matthew-henry.txt',
  );

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`매튜헨리 TTS 스크립트가 없습니다: ${toRelativePath(scriptPath)}`);
  }

  const expectedCueTexts = fs.readFileSync(scriptPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isEnglishCueLine);

  return {
    scriptPath,
    expectedCueTexts,
  };
}

function findObjectLiteralForKey(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`['"]${escapedKey}['"]\\s*:\\s*\\{`, 'm');
  const match = keyPattern.exec(source);
  if (!match) return null;

  let depth = 0;
  const start = match.index + match[0].lastIndexOf('{');

  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start + 1, index);
    }
  }

  return null;
}

function parseCueEntries(objectLiteral) {
  if (!objectLiteral) return {};

  const entries = {};
  const entryPattern = /['"]([^'"]+)['"]\s*:\s*(?:(['"])(.*?)\2|([0-9]+(?:\.[0-9]+)?))/gs;
  let match = entryPattern.exec(objectLiteral);

  while (match) {
    const cueId = match[1];
    entries[cueId] = match[3] ?? Number(match[4]);
    match = entryPattern.exec(objectLiteral);
  }

  return entries;
}

function extractObjectSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';

  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const audioId = `${args.bookId}.${pad3(args.chapter)}.${pad3(args.verse)}.matthew-henry`;
  const { scriptPath, expectedCueTexts } = extractExpectedCueTexts(args);
  const jsPath = path.join(ROOT, 'js', 'gomna-audio-commentary-buttons.js');
  const jsSource = fs.readFileSync(jsPath, 'utf8');
  const cueTimesSection = extractObjectSection(jsSource, 'var COMMENTARY_MANUAL_CUES = {', 'var COMMENTARY_MANUAL_CUE_TEXTS = {');
  const cueTextsSection = extractObjectSection(jsSource, 'var COMMENTARY_MANUAL_CUE_TEXTS = {', 'function pad3');

  const cueTexts = parseCueEntries(findObjectLiteralForKey(cueTextsSection, audioId));
  const cueTimes = parseCueEntries(findObjectLiteralForKey(cueTimesSection, audioId));
  const actualCueTextValues = Object.values(cueTexts).filter((value) => typeof value === 'string');
  const actualCueTimeIds = Object.entries(cueTimes)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([cueId]) => cueId);
  const expectedCueIds = expectedCueTexts.map((_, index) => `mh-en-${index + 1}`);

  const missingCueTexts = expectedCueTexts.filter((text) => !actualCueTextValues.includes(text));
  const missingCueTimes = expectedCueIds.filter((cueId) => !actualCueTimeIds.includes(cueId));
  const status = missingCueTexts.length === 0 && missingCueTimes.length === 0 ? 'PASS' : 'FAIL';

  const output = {
    audioId,
    scriptPath: toRelativePath(scriptPath),
    jsPath: toRelativePath(jsPath),
    expectedCueTextCount: expectedCueTexts.length,
    actualCueTextCount: actualCueTextValues.length,
    actualCueTimeCount: actualCueTimeIds.length,
    missingCueTexts,
    missingCueTimes,
    status,
  };

  console.log(JSON.stringify(output, null, 2));

  if (status !== 'PASS') {
    process.exitCode = 1;
  }
}

main();
