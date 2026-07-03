import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const OLD_TESTAMENT_JS_PATH = path.join(ROOT, 'old_testament.js');
const REPORTS_DIR = path.join(ROOT, 'reports');

const BOOKS = {
  genesis: {
    book: '창세기',
    testamentVariable: 'oldTestamentData',
  },
};

const AUDIO_TYPE = {
  type: 'bible',
  fileNamePrefix: 'bible',
};

const AUDIO_STORAGE = {
  localBaseDirectory: path.join(ROOT, 'audio', 'v1'),
  publicBaseUrl: process.env.GOMNA_AUDIO_BASE_URL || '/audio/v1',
  remoteBaseUrl: process.env.GOMNA_AUDIO_REMOTE_BASE_URL || 'https://audio.gomnastudio.com/audio/v1',
};

const TTS_DEFAULTS = {
  provider: 'openai',
  model: 'gpt-4o-mini-tts',
  outputFormat: 'mp3',
};

const VOICE_PRESET_TTS = {
  calm: {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    providerVoice: 'marin',
  },
  warm: {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    providerVoice: 'marin',
  },
  study: {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    providerVoice: 'marin',
  },
  strong: {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    providerVoice: 'marin',
  },
  soft: {
    provider: 'openai',
    model: 'gpt-4o-mini-tts',
    providerVoice: 'marin',
  },
};

function usage() {
  console.error('Usage: node scripts/generate-bible-audio-batch.mjs --book genesis --chapter 1 --from-verse 1 --to-verse 2 --language ko-KR --voice calm --dry-run');
  console.error('   or: node scripts/generate-bible-audio-batch.mjs --book genesis --chapter 1 --from-verse 1 --to-verse 2 --language ko-KR --voice calm --write');
  console.error('Optional: --from-verse 1 --to-verse 2');
  console.error('Optional planning/write flag: --overwrite');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    fromVerse: null,
    toVerse: null,
    language: null,
    voicePreset: null,
    overwrite: false,
    dryRun: false,
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--language') {
      args.language = argv[++i];
    } else if (arg === '--voice') {
      args.voicePreset = argv[++i];
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--write') {
      args.write = true;
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (args.dryRun && args.write) {
    throw new Error('--dry-run과 --write는 동시에 사용할 수 없습니다.');
  }

  if (!args.dryRun && !args.write) {
    usage();
    throw new Error('--dry-run 또는 --write 중 하나를 반드시 명시해야 합니다.');
  }

  if (!args.bookId || !args.chapter || !args.language || !args.voicePreset) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!BOOKS[args.bookId]) {
    throw new Error(`지원하지 않는 book id입니다: ${args.bookId}`);
  }

  if (!Number.isInteger(args.chapter) || args.chapter < 1) {
    throw new Error(`유효하지 않은 chapter 값입니다: ${args.chapter}`);
  }

  if (args.fromVerse !== null && (!Number.isInteger(args.fromVerse) || args.fromVerse < 1)) {
    throw new Error(`유효하지 않은 from-verse 값입니다: ${args.fromVerse}`);
  }

  if (args.toVerse !== null && (!Number.isInteger(args.toVerse) || args.toVerse < 1)) {
    throw new Error(`유효하지 않은 to-verse 값입니다: ${args.toVerse}`);
  }

  if (args.fromVerse !== null && args.toVerse !== null && args.fromVerse > args.toVerse) {
    throw new Error('--from-verse 값은 --to-verse 값보다 클 수 없습니다.');
  }

  return args;
}

function assertSafeWriteScope(args) {
  if (!args.write) return;

  const isGenesisChapter2 =
    args.bookId === 'genesis' &&
    args.chapter === 2 &&
    args.fromVerse === 1 &&
    args.toVerse === 25;

  const isGenesisChapter3 =
    args.bookId === 'genesis' &&
    args.chapter === 3 &&
    args.fromVerse === 1 &&
    args.toVerse === 24;

  if (!isGenesisChapter2 && !isGenesisChapter3) {
    throw new Error('--write는 현재 안전 점검을 위해 창세기 2장 1절~25절 또는 창세기 3장 1절~24절 범위에서만 허용됩니다.');
  }
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function joinUrl(baseUrl, relativePath) {
  return `${trimTrailingSlash(baseUrl)}/${String(relativePath).replace(/^\/+/, '')}`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, 'utf8');

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (!value || value.startsWith('#')) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getOpenAiApiKey() {
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, '.env.local'));

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 없습니다. 환경변수 또는 Git에 올라가지 않는 .env/.env.local 파일에 설정한 뒤 다시 실행하세요.');
  }

  return process.env.OPENAI_API_KEY;
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

function readChapterVerses({ bookId, chapter, language, fromVerse, toVerse }) {
  const bookConfig = BOOKS[bookId];
  const oldTestamentJs = fs.readFileSync(OLD_TESTAMENT_JS_PATH, 'utf8');
  const testamentData = extractJsonObject(oldTestamentJs, bookConfig.testamentVariable);
  const bookData = testamentData.books.find((book) => book.name === bookConfig.book);

  if (!bookData) {
    throw new Error(`${bookConfig.book} 데이터를 찾지 못했습니다.`);
  }

  const chapterData = bookData.chapters.find((item) => item.chapter === chapter);

  if (!chapterData) {
    throw new Error(`${bookConfig.book} ${chapter}장을 찾지 못했습니다.`);
  }

  return chapterData.verses
    .filter((verse) => fromVerse === null || verse.verse >= fromVerse)
    .filter((verse) => toVerse === null || verse.verse <= toVerse)
    .map((verse) => {
      const text = String(verse.text || '').trim();

      if (!text) {
        throw new Error(`${bookConfig.book} ${chapter}장 ${verse.verse}절 본문이 비어 있습니다.`);
      }

      return {
        language,
        book: bookConfig.book,
        bookId,
        chapter,
        verse: verse.verse,
        text,
      };
    });
}

function buildPlannedAudio(verse, voicePreset, overwrite) {
  const chapter3 = pad3(verse.chapter);
  const verse3 = pad3(verse.verse);
  const audioId = `${verse.bookId}.${chapter3}.${verse3}.${AUDIO_TYPE.type}`;
  const fileName = `${AUDIO_TYPE.fileNamePrefix}-${voicePreset}.mp3`;
  const storageRelativePath = path.posix.join(verse.language, verse.bookId, chapter3, verse3, fileName);
  const filePath = joinUrl(AUDIO_STORAGE.publicBaseUrl, storageRelativePath);
  const remoteFilePath = joinUrl(AUDIO_STORAGE.remoteBaseUrl, storageRelativePath);
  const ttsConfig = {
    ...TTS_DEFAULTS,
    ...(VOICE_PRESET_TTS[voicePreset] || {}),
  };
  const localFilePath = path.join(
    AUDIO_STORAGE.localBaseDirectory,
    verse.language,
    verse.bookId,
    chapter3,
    verse3,
    fileName,
  );
  const tmpLocalFilePath = `${localFilePath}.tmp`;
  const exists = fs.existsSync(localFilePath);
  const action = exists && !overwrite ? 'skip-existing' : 'generate-planned';

  return {
    id: audioId,
    language: verse.language,
    book: verse.book,
    bookId: verse.bookId,
    chapter: verse.chapter,
    verse: verse.verse,
    voicePreset,
    ttsProvider: ttsConfig.provider,
    ttsModel: ttsConfig.model,
    providerVoice: ttsConfig.providerVoice || voicePreset,
    outputFormat: TTS_DEFAULTS.outputFormat,
    text: verse.text,
    storageRelativePath,
    filePath,
    remoteFilePath,
    localFilePath: path.relative(ROOT, localFilePath),
    tmpLocalFilePath: path.relative(ROOT, tmpLocalFilePath),
    absoluteLocalFilePath: localFilePath,
    absoluteTmpLocalFilePath: tmpLocalFilePath,
    exists,
    action,
    wouldCallTts: action === 'generate-planned',
    wouldWriteFile: false,
  };
}

function toReportAudio(item, overrides = {}) {
  const {
    absoluteLocalFilePath,
    absoluteTmpLocalFilePath,
    ...publicItem
  } = item;

  return {
    ...publicItem,
    ...overrides,
  };
}

function writeGenerationReport({ args, plannedAudios, results, startedAt, finishedAt }) {
  const reportPath = path.join(REPORTS_DIR, `audio-generation-${args.language}.json`);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const summary = results.reduce((acc, item) => {
    acc[item.result] = (acc[item.result] || 0) + 1;
    return acc;
  }, {});

  const report = {
    version: 1,
    mode: args.write ? 'write' : 'dry-run',
    startedAt,
    finishedAt,
    source: path.relative(ROOT, OLD_TESTAMENT_JS_PATH),
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    language: args.language,
    voicePreset: args.voicePreset,
    overwrite: args.overwrite,
    ttsDefaults: TTS_DEFAULTS,
    voicePresetTts: VOICE_PRESET_TTS[args.voicePreset] || null,
    targetCount: plannedAudios.length,
    summary,
    audios: results,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return path.relative(ROOT, reportPath);
}

async function callOpenAiTts({ apiKey, item }) {
  if (typeof fetch !== 'function') {
    throw new Error('이 Node.js 환경에는 fetch가 없습니다. Node.js 18 이상에서 실행하세요.');
  }

  if (item.ttsProvider !== 'openai') {
    throw new Error(`지원하지 않는 TTS provider입니다: ${item.ttsProvider}`);
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: item.ttsModel,
      voice: item.providerVoice,
      input: item.text,
      response_format: item.outputFormat,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS 실패 (${item.id}): HTTP ${response.status} ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateAudioFile({ apiKey, item }) {
  fs.mkdirSync(path.dirname(item.absoluteLocalFilePath), { recursive: true });

  try {
    if (fs.existsSync(item.absoluteTmpLocalFilePath)) {
      fs.unlinkSync(item.absoluteTmpLocalFilePath);
    }

    const audio = await callOpenAiTts({ apiKey, item });

    fs.writeFileSync(item.absoluteTmpLocalFilePath, audio);

    const tmpSize = fs.statSync(item.absoluteTmpLocalFilePath).size;
    if (tmpSize <= 0) {
      throw new Error(`OpenAI TTS가 빈 MP3를 반환했습니다: ${item.id}`);
    }

    fs.renameSync(item.absoluteTmpLocalFilePath, item.absoluteLocalFilePath);

    const fileSize = fs.statSync(item.absoluteLocalFilePath).size;

    return toReportAudio(item, {
      result: 'generated',
      fileSize,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (fs.existsSync(item.absoluteTmpLocalFilePath)) {
      fs.unlinkSync(item.absoluteTmpLocalFilePath);
    }

    return toReportAudio(item, {
      result: 'failed',
      errorMessage: error.message,
    });
  }
}

async function writeAudios({ args, plannedAudios }) {
  const apiKey = getOpenAiApiKey();
  const startedAt = new Date().toISOString();
  const results = [];

  for (const item of plannedAudios) {
    if (item.action === 'skip-existing') {
      results.push(toReportAudio(item, {
        result: 'skipped-existing',
      }));
      continue;
    }

    results.push(await generateAudioFile({ apiKey, item }));
  }

  const finishedAt = new Date().toISOString();
  const reportPath = writeGenerationReport({ args, plannedAudios, results, startedAt, finishedAt });
  const generatedCount = results.filter((item) => item.result === 'generated').length;
  const failedCount = results.filter((item) => item.result === 'failed').length;
  const skippedExistingCount = results.filter((item) => item.result === 'skipped-existing').length;

  console.log(JSON.stringify({
    mode: 'write',
    source: path.relative(ROOT, OLD_TESTAMENT_JS_PATH),
    fileModified: generatedCount > 0 || failedCount > 0 || skippedExistingCount > 0,
    mp3Generated: generatedCount > 0,
    ttsApiCalled: generatedCount + failedCount > 0,
    reportPath,
    generatedCount,
    failedCount,
    skippedExistingCount,
    results,
  }, null, 2));

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeWriteScope(args);

  const verses = readChapterVerses(args);
  const plannedAudios = verses.map((verse) => buildPlannedAudio(verse, args.voicePreset, args.overwrite));
  const skipped = plannedAudios.filter((item) => item.action === 'skip-existing');
  const plannedForGeneration = plannedAudios.filter((item) => item.action === 'generate-planned');

  if (args.write) {
    await writeAudios({ args, plannedAudios });
    return;
  }

  console.log(JSON.stringify({
    mode: 'dry-run',
    fileModified: false,
    mp3Generated: false,
    ttsApiCalled: false,
    source: path.relative(ROOT, OLD_TESTAMENT_JS_PATH),
    book: BOOKS[args.bookId].book,
    bookId: args.bookId,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    language: args.language,
    voicePreset: args.voicePreset,
    ttsDefaults: TTS_DEFAULTS,
    voicePresetTts: VOICE_PRESET_TTS[args.voicePreset] || null,
    audioStorage: {
      localBaseDirectory: path.relative(ROOT, AUDIO_STORAGE.localBaseDirectory),
      publicBaseUrl: AUDIO_STORAGE.publicBaseUrl,
      remoteBaseUrl: AUDIO_STORAGE.remoteBaseUrl,
    },
    overwrite: args.overwrite,
    skipExisting: !args.overwrite,
    targetCount: plannedAudios.length,
    plannedGenerationCount: plannedForGeneration.length,
    skippedExistingCount: skipped.length,
    tmpFilePolicy: 'write to .tmp first, then rename to .mp3 only after a successful TTS response in a future --write implementation',
    failureReportPath: `reports/audio-generation-${args.language}.json`,
    plannedAudios: plannedAudios.map((item) => toReportAudio(item)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
