import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const READER_HTML_PATH = path.join(ROOT, 'reader.html');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');

const BOOKS = {
  genesis: {
    book: '창세기',
    testamentVariable: 'oldTestamentData',
  },
};

const AUDIO_TYPE = {
  type: 'bible',
  typeKr: '본문',
  fileNamePrefix: 'bible',
};

function usage() {
  console.error('Usage: node scripts/sync-audio-manifest.mjs --book genesis --language ko-KR --voice calm --dry-run');
  console.error('Optional dry-run flags: --verified-list reports/verified-audio-ko-KR.json');
  console.error('Optional unsafe dry-run flag: --allow-unverified');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    language: null,
    voicePreset: null,
    verifiedListPath: null,
    allowUnverified: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--language') {
      args.language = argv[++i];
    } else if (arg === '--voice') {
      args.voicePreset = argv[++i];
    } else if (arg === '--verified-list') {
      args.verifiedListPath = argv[++i];
    } else if (arg === '--allow-unverified') {
      args.allowUnverified = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--write') {
      throw new Error('--write는 아직 구현하지 않습니다. 이번 단계는 --dry-run 전용입니다.');
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !args.language || !args.voicePreset || !args.dryRun) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book id입니다: ${args.bookId}`);
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
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

function readBookVerses(bookId, language) {
  const bookConfig = BOOKS[bookId];
  const readerHtml = fs.readFileSync(READER_HTML_PATH, 'utf8');
  const testamentData = extractJsonObject(readerHtml, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error(`${bookConfig.book} 데이터를 찾지 못했습니다.`);
  }

  return bookData.chapters.flatMap((chapterData) => chapterData.verses.map((verse) => {
    const text = String(verse.text || '').trim();

    if (!text) {
      throw new Error(`${bookConfig.book} ${chapterData.chapter}장 ${verse.verse}절 본문이 비어 있습니다.`);
    }

    return {
      language,
      book: bookConfig.book,
      bookId,
      chapter: chapterData.chapter,
      verse: verse.verse,
      text,
    };
  }));
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function readVerifiedAudioIds(verifiedListPath) {
  if (!verifiedListPath) return new Set();

  const resolvedPath = path.isAbsolute(verifiedListPath)
    ? verifiedListPath
    : path.join(ROOT, verifiedListPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`검증 목록 파일을 찾지 못했습니다: ${path.relative(ROOT, resolvedPath)}`);
  }

  const verifiedData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const rawItems = Array.isArray(verifiedData)
    ? verifiedData
    : verifiedData.verifiedAudios || verifiedData.audios || [];

  return new Set(rawItems.map((item) => {
    if (typeof item === 'string') return item;
    return item.id || item.audioId;
  }).filter(Boolean));
}

function buildPlannedEntry(verse, voicePreset, verifiedAudioIds, allowUnverified) {
  const chapter3 = pad3(verse.chapter);
  const verse3 = pad3(verse.verse);
  const audioId = `${verse.bookId}.${chapter3}.${verse3}.${AUDIO_TYPE.type}`;
  const fileName = `${AUDIO_TYPE.fileNamePrefix}-${voicePreset}.mp3`;
  const filePath = `/audio/v1/${verse.language}/${verse.bookId}/${chapter3}/${verse3}/${fileName}`;
  const localFilePath = path.join(
    ROOT,
    'audio',
    'v1',
    verse.language,
    verse.bookId,
    chapter3,
    verse3,
    fileName,
  );
  const hasMp3 = fs.existsSync(localFilePath);
  const verified = verifiedAudioIds.has(audioId);
  const plannedStatus = hasMp3 && (verified || allowUnverified) ? 'published' : 'draft';
  const verificationStatus = hasMp3
    ? (verified ? 'verified' : (allowUnverified ? 'allowed-unverified' : 'unverified'))
    : 'missing';

  return {
    id: audioId,
    language: verse.language,
    book: verse.book,
    bookId: verse.bookId,
    chapter: verse.chapter,
    verse: verse.verse,
    type: AUDIO_TYPE.type,
    typeKr: AUDIO_TYPE.typeKr,
    voicePreset,
    filePath,
    localFilePath: path.relative(ROOT, localFilePath),
    plannedStatus,
    verificationStatus,
    verified,
    hasMp3,
    preview: verse.text,
  };
}

function summarizeChapters(verses) {
  const chapterCounts = new Map();

  for (const verse of verses) {
    chapterCounts.set(verse.chapter, (chapterCounts.get(verse.chapter) || 0) + 1);
  }

  return Array.from(chapterCounts.entries())
    .sort(([chapterA], [chapterB]) => chapterA - chapterB)
    .map(([chapter, verseCount]) => ({ chapter, verseCount }));
}

function findMissingChaptersAndVerses(verses) {
  const chapterMap = new Map();

  for (const verse of verses) {
    if (!chapterMap.has(verse.chapter)) {
      chapterMap.set(verse.chapter, []);
    }

    chapterMap.get(verse.chapter).push(verse.verse);
  }

  const chapters = Array.from(chapterMap.keys());
  const maxChapter = Math.max(...chapters);
  const missingChapters = [];
  const missingVerses = [];

  for (let chapter = 1; chapter <= maxChapter; chapter++) {
    if (!chapterMap.has(chapter)) {
      missingChapters.push(chapter);
    }
  }

  for (const [chapter, verseNumbers] of chapterMap.entries()) {
    const maxVerse = Math.max(...verseNumbers);
    const verseSet = new Set(verseNumbers);

    for (let verse = 1; verse <= maxVerse; verse++) {
      if (!verseSet.has(verse)) {
        missingVerses.push({ chapter, verse });
      }
    }
  }

  missingVerses.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);

  return {
    missingChapters,
    missingVerses,
  };
}

function pickSample(plannedEntries, id) {
  const entry = plannedEntries.find((item) => item.id === id);

  if (!entry) return null;

  return {
    id: entry.id,
    filePath: entry.filePath,
    localFilePath: entry.localFilePath,
    plannedStatus: entry.plannedStatus,
    verificationStatus: entry.verificationStatus,
    verified: entry.verified,
    preview: entry.preview,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verses = readBookVerses(args.bookId, args.language);
  const manifest = readManifest();
  const verifiedAudioIds = readVerifiedAudioIds(args.verifiedListPath);
  const plannedEntries = verses.map((verse) => buildPlannedEntry(
    verse,
    args.voicePreset,
    verifiedAudioIds,
    args.allowUnverified,
  ));
  const publishedPlanned = plannedEntries.filter((entry) => entry.plannedStatus === 'published');
  const draftPlanned = plannedEntries.filter((entry) => entry.plannedStatus === 'draft');
  const mp3Present = plannedEntries.filter((entry) => entry.hasMp3);
  const verifiedMp3 = plannedEntries.filter((entry) => entry.hasMp3 && entry.verified);
  const unverifiedMp3 = plannedEntries.filter((entry) => entry.hasMp3 && !entry.verified);
  const missingMp3 = plannedEntries.filter((entry) => !entry.hasMp3);
  const existingAudios = manifest.audios || {};
  const plannedIds = new Set(plannedEntries.map((entry) => entry.id));
  const preservedExistingIds = Object.keys(existingAudios).filter((id) => !plannedIds.has(id));
  const expectedTotalAudios = preservedExistingIds.length + plannedIds.size;
  const chapterVerseCounts = summarizeChapters(verses);
  const { missingChapters, missingVerses } = findMissingChaptersAndVerses(verses);
  const sampleIds = [
    'genesis.001.001.bible',
    'genesis.001.031.bible',
    'genesis.050.026.bible',
  ];

  console.log(JSON.stringify({
    mode: 'dry-run',
    fileModified: false,
    manifestModified: false,
    source: path.relative(ROOT, READER_HTML_PATH),
    manifestPath: path.relative(ROOT, MANIFEST_PATH),
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    language: args.language,
    voicePreset: args.voicePreset,
    verificationPolicy: args.allowUnverified
      ? 'unsafe: existing MP3 files are allowed to become published without a verified list'
      : 'safe: existing MP3 files stay draft unless listed in a verified audio list',
    verifiedListPath: args.verifiedListPath,
    verifiedListCount: verifiedAudioIds.size,
    allowUnverified: args.allowUnverified,
    targetChapterCount: chapterVerseCounts.length,
    targetVerseCount: verses.length,
    chapterVerseCounts,
    existingManifestAudioCount: Object.keys(existingAudios).length,
    preservedExistingAudioCount: preservedExistingIds.length,
    preservedExistingAudioNote: '기존 manifest의 다른 오디오 항목은 dry-run에서 보존 대상으로 계산합니다.',
    expectedTotalAudios,
    publishedPlannedCount: publishedPlanned.length,
    draftPlannedCount: draftPlanned.length,
    mp3PresentCount: mp3Present.length,
    verifiedMp3Count: verifiedMp3.length,
    unverifiedMp3Count: unverifiedMp3.length,
    missingMp3Count: missingMp3.length,
    unverifiedMp3Entries: unverifiedMp3.map((entry) => ({
      id: entry.id,
      localFilePath: entry.localFilePath,
      plannedStatus: entry.plannedStatus,
      verificationStatus: entry.verificationStatus,
    })),
    missingChapters,
    missingVerses,
    allVersesTargeted: verses.length === 1533 && missingChapters.length === 0 && missingVerses.length === 0,
    previewSource: 'reader.html oldTestamentData',
    previewGeneratedManually: false,
    sampleEntries: sampleIds.map((id) => pickSample(plannedEntries, id)),
  }, null, 2));
}

main();
