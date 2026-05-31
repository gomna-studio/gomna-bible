import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');
const READER_HTML_PATH = path.join(ROOT, 'reader.html');
const DEFAULT_VERIFIED_LIST_PATH = path.join(ROOT, 'reports', 'verified-audio-ko-KR.json');

const CONFIG = {
  book: '창세기',
  bookId: 'genesis',
  language: 'ko-KR',
  type: 'bible',
  typeKr: '본문',
  voicePreset: 'calm',
  fileName: 'bible-calm.mp3',
  r2KeyBase: 'bible/ko/gae/genesis',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
};

function usage() {
  console.error('Usage: node scripts/sync-genesis-r2-manifest.mjs --chapter 2 --from-verse 1 --to-verse 25 --verified-list reports/verified-audio-ko-KR.json [--dry-run|--write]');
  console.error('Default mode: --dry-run');
}

function parseArgs(argv) {
  const args = {
    chapter: null,
    fromVerse: null,
    toVerse: null,
    verifiedListPath: DEFAULT_VERIFIED_LIST_PATH,
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
    } else if (arg === '--verified-list') {
      const verifiedListPath = argv[++i];
      args.verifiedListPath = path.isAbsolute(verifiedListPath)
        ? verifiedListPath
        : path.join(ROOT, verifiedListPath);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findObjectLiteralEnd(source, startIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }

  throw new Error('성경 데이터 객체의 끝을 찾지 못했습니다.');
}

function extractJsonObject(source, variableName) {
  const marker = `var ${variableName} =`;
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`${variableName} 선언을 찾지 못했습니다.`);
  }

  const objectStart = source.indexOf('{', markerIndex);
  if (objectStart === -1) {
    throw new Error(`${variableName} 객체 시작 위치를 찾지 못했습니다.`);
  }

  const objectEnd = findObjectLiteralEnd(source, objectStart);
  const objectLiteral = source.slice(objectStart, objectEnd);

  return JSON.parse(objectLiteral);
}

function readGenesisChapterVerses(chapter, fromVerse, toVerse) {
  const readerHtml = fs.readFileSync(READER_HTML_PATH, 'utf8');
  const oldTestamentData = extractJsonObject(readerHtml, 'oldTestamentData');
  const genesis = oldTestamentData.books.find((book) => book.name === CONFIG.book);

  if (!genesis) {
    throw new Error('reader.html oldTestamentData에서 창세기를 찾지 못했습니다.');
  }

  const chapterData = genesis.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`reader.html oldTestamentData에서 창세기 ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData.verses
    .filter((verse) => verse.verse >= fromVerse && verse.verse <= toVerse)
    .map((verse) => ({
      chapter,
      verse: verse.verse,
      preview: String(verse.text || '').trim(),
    }));
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

function buildAudioId(chapter, verse) {
  return `${CONFIG.bookId}.${pad3(chapter)}.${pad3(verse)}.${CONFIG.type}`;
}

function buildLocalPath(chapter, verse) {
  return `/audio/v1/${CONFIG.language}/${CONFIG.bookId}/${pad3(chapter)}/${pad3(verse)}/${CONFIG.fileName}`;
}

function buildR2Url(chapter, verse) {
  return `${CONFIG.publicBaseUrl}/${CONFIG.r2KeyBase}/${pad3(chapter)}/${pad3(verse)}.mp3`;
}

function buildNextEntry({ verseData, existingEntry, verified }) {
  const id = buildAudioId(verseData.chapter, verseData.verse);
  const status = verified ? 'published' : 'draft';
  const filePath = verified
    ? buildR2Url(verseData.chapter, verseData.verse)
    : buildLocalPath(verseData.chapter, verseData.verse);

  return {
    id,
    book: CONFIG.book,
    bookId: CONFIG.bookId,
    language: CONFIG.language,
    chapter: verseData.chapter,
    verse: verseData.verse,
    type: CONFIG.type,
    typeKr: CONFIG.typeKr,
    voicePreset: existingEntry && existingEntry.voicePreset ? existingEntry.voicePreset : CONFIG.voicePreset,
    filePath,
    duration: existingEntry && Number.isFinite(existingEntry.duration) ? existingEntry.duration : 0,
    fileSize: existingEntry && Number.isFinite(existingEntry.fileSize) ? existingEntry.fileSize : 0,
    status,
    preview: verseData.preview,
  };
}

function buildNextManifest({ manifest, verses, verifiedAudioIds }) {
  const existingAudios = manifest.audios || {};
  const nextAudios = { ...existingAudios };
  const plannedEntries = [];

  for (const verseData of verses) {
    const id = buildAudioId(verseData.chapter, verseData.verse);
    const existingEntry = existingAudios[id] || null;
    const verified = verifiedAudioIds.has(id);
    const nextEntry = buildNextEntry({ verseData, existingEntry, verified });

    nextAudios[id] = nextEntry;
    plannedEntries.push({
      id,
      chapter: verseData.chapter,
      verse: verseData.verse,
      status: nextEntry.status,
      verified,
      created: !existingEntry,
      previousStatus: existingEntry ? existingEntry.status || null : null,
      statusChanged: !existingEntry || existingEntry.status !== nextEntry.status,
      previousFilePath: existingEntry ? existingEntry.filePath || null : null,
      filePath: nextEntry.filePath,
      filePathChanged: !existingEntry || existingEntry.filePath !== nextEntry.filePath,
      preview: nextEntry.preview,
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
    createdCount: entries.filter((entry) => entry.created).length,
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
  const verses = readGenesisChapterVerses(args.chapter, args.fromVerse, args.toVerse);
  const { nextManifest, plannedEntries } = buildNextManifest({ manifest, verses, verifiedAudioIds });
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
    source: path.relative(ROOT, READER_HTML_PATH),
    verifiedListPath: path.relative(ROOT, args.verifiedListPath),
    verifiedListCount: verifiedAudioIds.size,
    publicBaseUrl: CONFIG.publicBaseUrl,
    r2KeyBase: CONFIG.r2KeyBase,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    targetCount: plannedEntries.length,
    summary: countStatus(plannedEntries),
    publishedEntries: plannedEntries
      .filter((entry) => entry.status === 'published')
      .map((entry) => entry.id),
    draftEntries: plannedEntries
      .filter((entry) => entry.status === 'draft')
      .map((entry) => entry.id),
    sampleEntries: plannedEntries.filter((entry) => (
      entry.verse === args.fromVerse ||
      entry.verse === args.toVerse ||
      entry.created ||
      entry.filePathChanged ||
      entry.statusChanged
    )),
  }, null, 2));
}

main();
