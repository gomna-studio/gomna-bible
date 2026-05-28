import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const CONFIG = {
  book: '창세기',
  bookId: 'genesis',
  language: 'ko-KR',
  chapter: 1,
  chapterPadded: '001',
  verseStart: 1,
  verseEnd: 31,
  type: 'bible',
  typeKr: '본문',
  voicePreset: 'calm',
  fileName: 'bible-calm.mp3',
};

const READER_HTML_PATH = path.join(ROOT, 'reader.html');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');

function usage() {
  console.error('Usage: node scripts/sync-genesis-001-audio-manifest.mjs --dry-run');
  console.error('   or: node scripts/sync-genesis-001-audio-manifest.mjs --write');
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
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

  throw new Error('oldTestamentData 객체의 끝을 찾지 못했습니다.');
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

function readGenesisChapterOnePreviews() {
  const readerHtml = fs.readFileSync(READER_HTML_PATH, 'utf8');
  const oldTestamentData = extractJsonObject(readerHtml, 'oldTestamentData');
  const genesis = oldTestamentData.books.find((book) => book.name === CONFIG.book);

  if (!genesis) {
    throw new Error('oldTestamentData에서 창세기를 찾지 못했습니다.');
  }

  const chapter = genesis.chapters.find((item) => item.chapter === CONFIG.chapter);

  if (!chapter) {
    throw new Error('창세기 1장을 찾지 못했습니다.');
  }

  const previews = new Map();

  for (const verse of chapter.verses) {
    if (verse.verse >= CONFIG.verseStart && verse.verse <= CONFIG.verseEnd) {
      previews.set(verse.verse, String(verse.text || '').trim());
    }
  }

  for (let verse = CONFIG.verseStart; verse <= CONFIG.verseEnd; verse++) {
    if (!previews.has(verse) || !previews.get(verse)) {
      throw new Error(`창세기 1장 ${verse}절 preview를 추출하지 못했습니다.`);
    }
  }

  return previews;
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function buildPlannedEntry(verse, preview) {
  const versePadded = pad3(verse);
  const audioId = `${CONFIG.bookId}.${CONFIG.chapterPadded}.${versePadded}.${CONFIG.type}`;
  const webFilePath = `/audio/v1/${CONFIG.language}/${CONFIG.bookId}/${CONFIG.chapterPadded}/${versePadded}/${CONFIG.fileName}`;
  const localFilePath = path.join(
    ROOT,
    'audio',
    'v1',
    CONFIG.language,
    CONFIG.bookId,
    CONFIG.chapterPadded,
    versePadded,
    CONFIG.fileName,
  );
  const hasMp3 = fs.existsSync(localFilePath);

  return {
    id: audioId,
    verse,
    preview,
    webFilePath,
    localFilePath: path.relative(ROOT, localFilePath),
    plannedStatus: hasMp3 ? 'published' : 'draft',
    hasMp3,
  };
}

function buildManifestAudio(entry, existingAudio) {
  return {
    id: entry.id,
    book: CONFIG.book,
    bookId: CONFIG.bookId,
    language: CONFIG.language,
    chapter: CONFIG.chapter,
    verse: entry.verse,
    type: CONFIG.type,
    typeKr: CONFIG.typeKr,
    voicePreset: CONFIG.voicePreset,
    filePath: entry.webFilePath,
    duration: existingAudio && typeof existingAudio.duration === 'number' ? existingAudio.duration : 0,
    fileSize: existingAudio && typeof existingAudio.fileSize === 'number' ? existingAudio.fileSize : 0,
    status: entry.plannedStatus,
    preview: entry.preview,
  };
}

function syncManifest(manifest, plannedEntries, lastUpdated) {
  const nextManifest = {
    ...manifest,
    lastUpdated,
    audios: {
      ...(manifest.audios || {}),
    },
  };

  for (const entry of plannedEntries) {
    nextManifest.audios[entry.id] = buildManifestAudio(entry, nextManifest.audios[entry.id]);
  }

  nextManifest.totalAudios = Object.keys(nextManifest.audios).length;

  return nextManifest;
}

function formatVerseList(items) {
  if (items.length === 0) return '(없음)';
  return items.map((item) => `${item.verse}절`).join(', ');
}

function printExistingAudioIds(existingAudioIds) {
  console.log('Existing manifest audio IDs:');

  if (existingAudioIds.length === 0) {
    console.log('- (없음)');
    return;
  }

  for (const id of existingAudioIds) {
    console.log(`- ${id}`);
  }
}

function printReport({
  mode,
  previews,
  existingAudioCount,
  existingAudioIds,
  expectedTotalAudios,
  expectedLastUpdated,
  published,
  draft,
  missingMp3,
  plannedEntries,
}) {
  console.log(`GOMNA Genesis 001 audio manifest ${mode}`);
  console.log('========================================');
  console.log(mode === 'dry-run' ? 'Mode: dry-run (no files will be modified)' : 'Mode: write (audio/audio-manifest.json will be updated)');
  console.log(`Preview source: ${path.relative(ROOT, READER_HTML_PATH)} oldTestamentData`);
  console.log(`Preview extracted: ${previews.size}/31`);
  console.log(`Existing manifest audio count: ${existingAudioCount}`);
  console.log(`Expected totalAudios after write: ${expectedTotalAudios}`);
  console.log(`Expected lastUpdated after write: ${expectedLastUpdated}`);
  console.log('');
  printExistingAudioIds(existingAudioIds);
  console.log('');
  console.log(`Published planned verses: ${formatVerseList(published)}`);
  console.log(`Draft planned verses: ${formatVerseList(draft)}`);
  console.log('');
  console.log('Missing MP3 files:');

  if (missingMp3.length === 0) {
    console.log('- (없음)');
  } else {
    for (const entry of missingMp3) {
      console.log(`- ${entry.verse}절: ${entry.localFilePath}`);
    }
  }

  console.log('');
  console.log('Planned entries:');

  for (const entry of plannedEntries) {
    console.log(
      [
        `- ${entry.verse}절`,
        entry.id,
        entry.plannedStatus,
        entry.webFilePath,
        `preview="${entry.preview}"`,
      ].join(' | '),
    );
  }
}

function writeManifest(nextManifest) {
  const serialized = `${JSON.stringify(nextManifest, null, 2)}\n`;

  fs.writeFileSync(MANIFEST_PATH, serialized, 'utf8');
  JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1 || (args[0] !== '--dry-run' && args[0] !== '--write')) {
    usage();
    process.exitCode = 1;
    return;
  }

  const mode = args[0] === '--write' ? 'write' : 'dry-run';
  const previews = readGenesisChapterOnePreviews();
  const manifest = readManifest();
  const existingAudioIds = Object.keys(manifest.audios || {});
  const existingAudioCount = Object.keys(manifest.audios || {}).length;
  const plannedEntries = [];

  for (let verse = CONFIG.verseStart; verse <= CONFIG.verseEnd; verse++) {
    plannedEntries.push(buildPlannedEntry(verse, previews.get(verse)));
  }

  const published = plannedEntries.filter((entry) => entry.plannedStatus === 'published');
  const draft = plannedEntries.filter((entry) => entry.plannedStatus === 'draft');
  const missingMp3 = plannedEntries.filter((entry) => !entry.hasMp3);
  const existingGenesisBibleIds = new Set(
    plannedEntries
      .filter((entry) => manifest.audios && manifest.audios[entry.id])
      .map((entry) => entry.id),
  );
  const expectedTotalAudios = existingAudioCount + plannedEntries.length - existingGenesisBibleIds.size;
  const expectedLastUpdated = todayLocalDate();

  printReport({
    mode,
    previews,
    existingAudioCount,
    existingAudioIds,
    expectedTotalAudios,
    expectedLastUpdated,
    published,
    draft,
    missingMp3,
    plannedEntries,
  });

  console.log('');

  if (mode === 'dry-run') {
    console.log('DRY RUN COMPLETE: audio/audio-manifest.json was not modified.');
    return;
  }

  const nextManifest = syncManifest(manifest, plannedEntries, expectedLastUpdated);
  writeManifest(nextManifest);
  console.log('WRITE COMPLETE: audio/audio-manifest.json was updated and JSON.parse verification passed.');
  console.log(`Final manifest audio count: ${Object.keys(nextManifest.audios || {}).length}`);
}

main();
