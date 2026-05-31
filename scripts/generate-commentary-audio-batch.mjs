import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const AUDIO_STORAGE = {
  localBaseDirectory: path.join(ROOT, 'audio', 'v1'),
  publicBaseUrl: '/audio/v1',
};

const TTS_DEFAULTS = {
  provider: 'openai',
  model: 'gpt-4o-mini-tts',
  providerVoice: 'marin',
  outputFormat: 'mp3',
};

const TARGET = {
  bookId: 'genesis',
  book: '창세기',
  chapter: 1,
  verse: 1,
};

const COMMENTARY_TYPES = [
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

function usage() {
  console.error('Usage: node scripts/generate-commentary-audio-batch.mjs --book genesis --chapter 1 --verse 1 --language ko-KR --scripts-dir tts-scripts/ko-KR/genesis/001/001 --dry-run');
  console.error('   or: node scripts/generate-commentary-audio-batch.mjs --book genesis --chapter 1 --verse 1 --language ko-KR --scripts-dir tts-scripts/ko-KR/genesis/001/001 --type original-language --write');
  console.error('Default mode is --dry-run. Optional: --type <type>, --overwrite');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    verse: null,
    language: null,
    scriptsDir: null,
    type: null,
    overwrite: false,
    dryRun: true,
    write: false,
  };
  let dryRunExplicit = false;
  let writeExplicit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--verse') {
      args.verse = Number(argv[++i]);
    } else if (arg === '--language') {
      args.language = argv[++i];
    } else if (arg === '--scripts-dir') {
      args.scriptsDir = argv[++i];
    } else if (arg === '--type') {
      args.type = argv[++i];
    } else if (arg === '--overwrite') {
      args.overwrite = true;
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
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (dryRunExplicit && writeExplicit) {
    throw new Error('--dry-run과 --write는 동시에 사용할 수 없습니다.');
  }

  if (!args.bookId || !args.chapter || !args.verse || !args.language) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  if (!args.scriptsDir) {
    args.scriptsDir = path.join(
      'tts-scripts',
      args.language,
      args.bookId,
      pad3(args.chapter),
      pad3(args.verse),
    );
  }

  if (args.type && !COMMENTARY_TYPES.some((item) => item.type === args.type)) {
    throw new Error(`허용되지 않은 type입니다: ${args.type}`);
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function resolveInsideRoot(inputPath) {
  const absolutePath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(ROOT, inputPath);
  const relative = path.relative(ROOT, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`프로젝트 밖 경로는 사용할 수 없습니다: ${inputPath}`);
  }

  return absolutePath;
}

function assertTargetScope(args) {
  if (
    args.bookId !== TARGET.bookId ||
    args.chapter !== TARGET.chapter ||
    args.verse !== TARGET.verse ||
    args.language !== 'ko-KR'
  ) {
    throw new Error('이 스크립트는 현재 ko-KR 창세기 1장 1절 말씀풀이 9개에만 사용할 수 있습니다.');
  }
}

function assertSafeWriteScope(args) {
  if (!args.write) return;

  assertTargetScope(args);

  if (args.type && !COMMENTARY_TYPES.some((item) => item.type === args.type)) {
    throw new Error(`--write 허용 범위 밖 type입니다: ${args.type}`);
  }
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 없습니다. --write를 실행할 수 없습니다.');
  }

  return apiKey;
}

function readScriptText(scriptPath) {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`대본 파일을 찾을 수 없습니다: ${toRelativePath(scriptPath)}`);
  }

  const text = fs.readFileSync(scriptPath, 'utf8').trim();
  if (!text) {
    throw new Error(`대본 파일이 비어 있습니다: ${toRelativePath(scriptPath)}`);
  }

  return text;
}

function buildPlanItem({ args, scriptsDir, item }) {
  const chapter3 = pad3(args.chapter);
  const verse3 = pad3(args.verse);
  const scriptPath = path.join(scriptsDir, `${item.type}.txt`);
  const text = readScriptText(scriptPath);
  const outputFileName = `${item.type}-${item.voicePreset}.${TTS_DEFAULTS.outputFormat}`;
  const outputPath = path.join(
    AUDIO_STORAGE.localBaseDirectory,
    args.language,
    args.bookId,
    chapter3,
    verse3,
    outputFileName,
  );
  const tmpOutputPath = `${outputPath}.tmp`;
  const exists = fs.existsSync(outputPath);
  const action = exists && !args.overwrite ? 'skip-existing' : 'generate-planned';

  return {
    type: item.type,
    scriptPath: toRelativePath(scriptPath),
    audioId: `${args.bookId}.${chapter3}.${verse3}.${item.type}`,
    voicePreset: item.voicePreset,
    provider: TTS_DEFAULTS.provider,
    model: TTS_DEFAULTS.model,
    providerVoice: TTS_DEFAULTS.providerVoice,
    outputPath: toRelativePath(outputPath),
    tmpOutputPath: toRelativePath(tmpOutputPath),
    characterCount: text.length,
    exists,
    action,
    status: 'dry-run',
    text,
    absoluteOutputPath: outputPath,
    absoluteTmpOutputPath: tmpOutputPath,
  };
}

function toPublicItem(item, overrides = {}) {
  const {
    text,
    absoluteOutputPath,
    absoluteTmpOutputPath,
    ...publicItem
  } = item;

  return {
    ...publicItem,
    ...overrides,
  };
}

async function callOpenAiTts({ apiKey, item }) {
  if (typeof fetch !== 'function') {
    throw new Error('이 Node.js 환경에는 fetch가 없습니다. Node.js 18 이상에서 실행하세요.');
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: item.model,
      voice: item.providerVoice,
      input: item.text,
      response_format: TTS_DEFAULTS.outputFormat,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS 실패 (${item.audioId}): HTTP ${response.status} ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateAudioFile({ apiKey, item }) {
  if (item.action === 'skip-existing') {
    return toPublicItem(item, {
      status: 'skipped-existing',
      ttsApiCalled: false,
      mp3Generated: false,
    });
  }

  fs.mkdirSync(path.dirname(item.absoluteOutputPath), { recursive: true });

  try {
    if (fs.existsSync(item.absoluteTmpOutputPath)) {
      fs.unlinkSync(item.absoluteTmpOutputPath);
    }

    const audio = await callOpenAiTts({ apiKey, item });
    fs.writeFileSync(item.absoluteTmpOutputPath, audio);

    const tmpSize = fs.statSync(item.absoluteTmpOutputPath).size;
    if (tmpSize <= 0) {
      throw new Error(`OpenAI TTS가 빈 MP3를 반환했습니다: ${item.audioId}`);
    }

    fs.renameSync(item.absoluteTmpOutputPath, item.absoluteOutputPath);

    return toPublicItem(item, {
      status: 'generated',
      fileSize: fs.statSync(item.absoluteOutputPath).size,
      generatedAt: new Date().toISOString(),
      ttsApiCalled: true,
      mp3Generated: true,
    });
  } catch (error) {
    if (fs.existsSync(item.absoluteTmpOutputPath)) {
      fs.unlinkSync(item.absoluteTmpOutputPath);
    }

    return toPublicItem(item, {
      status: 'failed',
      errorMessage: error.message,
      ttsApiCalled: true,
      mp3Generated: false,
    });
  }
}

async function writeAudios(plan) {
  const apiKey = getOpenAiApiKey();
  const results = [];

  for (const item of plan) {
    results.push(await generateAudioFile({ apiKey, item }));
  }

  const generatedCount = results.filter((item) => item.status === 'generated').length;
  const failedCount = results.filter((item) => item.status === 'failed').length;
  const skippedExistingCount = results.filter((item) => item.status === 'skipped-existing').length;

  console.log(JSON.stringify({
    mode: 'write',
    fileModified: generatedCount > 0,
    ttsApiCalled: results.some((item) => item.ttsApiCalled),
    mp3Generated: generatedCount > 0,
    reportModified: false,
    manifestModified: false,
    generatedCount,
    failedCount,
    skippedExistingCount,
    audios: results,
  }, null, 2));

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTargetScope(args);
  assertSafeWriteScope(args);

  const scriptsDir = resolveInsideRoot(args.scriptsDir);
  const targetTypes = args.type
    ? COMMENTARY_TYPES.filter((item) => item.type === args.type)
    : COMMENTARY_TYPES;
  const plan = targetTypes.map((item) => buildPlanItem({ args, scriptsDir, item }));

  if (args.write) {
    await writeAudios(plan);
    return;
  }

  console.log(JSON.stringify({
    mode: 'dry-run',
    fileModified: false,
    ttsApiCalled: false,
    mp3Generated: false,
    reportModified: false,
    manifestModified: false,
    book: TARGET.book,
    bookId: args.bookId,
    chapter: args.chapter,
    verse: args.verse,
    language: args.language,
    scriptsDir: toRelativePath(scriptsDir),
    provider: TTS_DEFAULTS.provider,
    model: TTS_DEFAULTS.model,
    providerVoice: TTS_DEFAULTS.providerVoice,
    outputFormat: TTS_DEFAULTS.outputFormat,
    overwrite: args.overwrite,
    type: args.type,
    targetCount: plan.length,
    audios: plan.map((item) => toPublicItem(item)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
