import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const EXPECTED_SOURCE_HASH =
  'cb0095efc06a658672f795d0857454e7369e0579ffdc4e4daa4a7ae4a409b110';

const KOREAN_SOURCE_REL =
  'tts-scripts/ko-KR/genesis/001/001/original-language.txt';

const TTS = {
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  responseFormat: 'mp3',
  endpoint: 'https://api.openai.com/v1/audio/speech',
};

const LOCALE_CONFIG = {
  'en-US': {
    narrationRel: 'tts-scripts/en-US/genesis/001/001/original-language.txt',
    metadataRel: 'tts-scripts/en-US/genesis/001/001/original-language.meta.json',
    outputRel: 'audio/v1/en-US/genesis/001/001/original-language-study.mp3',
    requiredTerms: [
      'bereshit',
      'Elohim',
      'bara',
      'hashamayim',
      "ha'aretz",
    ],
    instructions:
      "Read this Bible commentary in calm, warm, clear American English, at a measured study pace, with natural pauses between sentences. Pronounce Hebrew transliterations (bereshit, Elohim, bara, hashamayim, ha'aretz) carefully and clearly.",
  },
  'ja-JP': {
    narrationRel: 'tts-scripts/ja-JP/genesis/001/001/original-language.txt',
    metadataRel: 'tts-scripts/ja-JP/genesis/001/001/original-language.meta.json',
    outputRel: 'audio/v1/ja-JP/genesis/001/001/original-language-study.mp3',
    requiredTerms: [
      'ベレシート',
      'エロヒム',
      'バーラー',
      'ハシャマイム',
      'ハアレツ',
    ],
    instructions:
      '落ち着いた温かく明瞭な日本語で、聖書解説を学びのペースでゆっくり読んでください。文の間に自然な間を置いてください。カタカナのヘブライ語（ベレシート、エロヒム、バーラー、ハシャマイム、ハアレツ）は丁寧にはっきり発音してください。',
  },
};

function usage() {
  console.error(
    'Usage: node scripts/generate-commentary-multilang-pilot.mjs --locale en-US|ja-JP',
  );
}

function parseArgs(argv) {
  if (argv.length === 0) {
    usage();
    throw new Error('Missing --locale');
  }

  let locale = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--locale') {
      if (locale !== null) {
        throw new Error('Duplicate --locale is not allowed');
      }
      const value = argv[++i];
      if (!value) {
        throw new Error('Missing value for --locale');
      }
      locale = value;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown or disallowed argument: ${arg}`);
    }
  }

  if (!locale) {
    usage();
    throw new Error('Missing --locale');
  }

  if (locale === 'ko' || locale === 'ko-KR') {
    throw new Error('Korean locale is rejected by this pilot script');
  }

  if (!LOCALE_CONFIG[locale]) {
    throw new Error(`Unsupported locale: ${locale}. Allowed: en-US, ja-JP`);
  }

  return { locale };
}

function toAbsoluteInsideRoot(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }

  return absolutePath;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, 'utf8');

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
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
    throw new Error('OPENAI_API_KEY is missing');
  }

  return apiKey;
}

function sha256File(absolutePath) {
  const bytes = fs.readFileSync(absolutePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertNoSymlinkRedirect(absolutePath) {
  let current = absolutePath;

  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;

    if (fs.existsSync(parent)) {
      const parentStat = fs.lstatSync(parent);
      if (parentStat.isSymbolicLink()) {
        throw new Error(`Symbolic-link parent directory rejected: ${parent}`);
      }
    }

    current = parent;
  }
}

function assertSafeOutputPath(locale, outputAbs) {
  const config = LOCALE_CONFIG[locale];
  const expectedAbs = toAbsoluteInsideRoot(config.outputRel);

  if (outputAbs !== expectedAbs) {
    throw new Error(`Output path mismatch for ${locale}`);
  }

  const audioV1Root = toAbsoluteInsideRoot('audio/v1');
  const relativeToAudioV1 = path.relative(audioV1Root, outputAbs);

  if (
    relativeToAudioV1.startsWith('..') ||
    path.isAbsolute(relativeToAudioV1)
  ) {
    throw new Error('Output path must remain inside audio/v1/');
  }

  const posixRel = relativeToAudioV1.split(path.sep).join('/');
  if (posixRel.includes('/ko/') || posixRel.includes('/ko-KR/')) {
    throw new Error('Korean locale path segment rejected in output path');
  }

  for (const segment of relativeToAudioV1.split(path.sep)) {
    if (segment === 'ko' || segment === 'ko-KR') {
      throw new Error(`Korean path segment rejected: ${segment}`);
    }
  }

  assertNoSymlinkRedirect(path.dirname(outputAbs));

  if (fs.existsSync(outputAbs)) {
    throw new Error(`Output already exists (no overwrite): ${config.outputRel}`);
  }
}

function validateMetadata(locale, metadataAbs, koreanSourceAbs) {
  const raw = fs.readFileSync(metadataAbs, 'utf8');
  const data = JSON.parse(raw);

  if (data.status !== 'approved') {
    throw new Error(`Metadata status must be approved for ${locale}`);
  }
  if (data.sourceHashAlgorithm !== 'sha256') {
    throw new Error(`sourceHashAlgorithm must be sha256 for ${locale}`);
  }
  if (data.sourceLocale !== 'ko-KR') {
    throw new Error(`sourceLocale must be ko-KR for ${locale}`);
  }
  if (data.targetLocale !== locale) {
    throw new Error(`targetLocale must be ${locale}`);
  }
  if (data.sourcePath !== KOREAN_SOURCE_REL) {
    throw new Error(`Unexpected sourcePath for ${locale}`);
  }
  if (typeof data.reviewedAt !== 'string' || !data.reviewedAt.trim()) {
    throw new Error(`reviewedAt must be a non-empty string for ${locale}`);
  }
  if (typeof data.approvedAt !== 'string' || !data.approvedAt.trim()) {
    throw new Error(`approvedAt must be a non-empty string for ${locale}`);
  }
  if (data.reviewedAt !== data.approvedAt) {
    throw new Error(`reviewedAt and approvedAt must match for ${locale}`);
  }

  const actualHash = sha256File(koreanSourceAbs);
  if (actualHash !== data.sourceHash) {
    throw new Error(
      `Stale translation metadata for ${locale}: metadata=${data.sourceHash}, actual=${actualHash}`,
    );
  }
  if (actualHash !== EXPECTED_SOURCE_HASH) {
    throw new Error(
      `Unexpected Korean source hash: ${actualHash} (expected ${EXPECTED_SOURCE_HASH})`,
    );
  }
  if (data.sourceHash !== EXPECTED_SOURCE_HASH) {
    throw new Error(
      `Metadata sourceHash does not match expected pilot hash for ${locale}`,
    );
  }

  return data;
}

function readNarrationText(locale, narrationAbs) {
  if (!fs.existsSync(narrationAbs)) {
    throw new Error(`Narration file missing for ${locale}`);
  }

  const bytes = fs.readFileSync(narrationAbs);
  let text;
  try {
    text = bytes.toString('utf8');
  } catch (error) {
    throw new Error(`Narration is not valid UTF-8 for ${locale}`);
  }

  // Validate UTF-8 by round-trip through Buffer.from with invalid rejection
  const reencoded = Buffer.from(text, 'utf8');
  if (!reencoded.equals(bytes)) {
    // Still accept if BOM or equivalent decode succeeds; require decodable UTF-8
  }

  // Explicit UTF-8 validity check
  const decoder = new TextDecoder('utf-8', { fatal: true });
  decoder.decode(bytes);

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Narration is empty for ${locale}`);
  }

  const requiredTerms = LOCALE_CONFIG[locale].requiredTerms;
  for (const term of requiredTerms) {
    if (!text.includes(term)) {
      throw new Error(`Required term missing in ${locale} narration: ${term}`);
    }
  }

  // Use complete file content as TTS input; do not edit or normalize.
  return text;
}

async function callOpenAiTtsOnce({ apiKey, locale, text, instructions }) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is unavailable. Use Node.js 18 or newer.');
  }

  console.log(`○ OpenAI TTS call: ${locale}, 1 of 1`);

  const response = await fetch(TTS.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS.model,
      voice: TTS.voice,
      instructions,
      input: text,
      response_format: TTS.responseFormat,
    }),
  });

  if (!response.ok) {
    let summary = '';
    try {
      const body = await response.text();
      summary = String(body || '').slice(0, 300).replace(/sk-[A-Za-z0-9._-]+/g, '[redacted]');
    } catch {
      summary = '(unable to read error body)';
    }
    console.error(`○ OpenAI TTS failed: HTTP ${response.status}`);
    console.error(`○ Error summary: ${summary}`);
    throw new Error(`OpenAI TTS failed with HTTP ${response.status}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) {
    throw new Error('OpenAI TTS returned an empty body');
  }

  return audio;
}

function writeMp3Exclusive(outputAbs, audioBytes) {
  fs.mkdirSync(path.dirname(outputAbs), { recursive: true });
  const fd = fs.openSync(outputAbs, 'wx');
  try {
    fs.writeFileSync(fd, audioBytes);
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const { locale } = parseArgs(process.argv.slice(2));
  const config = LOCALE_CONFIG[locale];

  const koreanSourceAbs = toAbsoluteInsideRoot(KOREAN_SOURCE_REL);
  const narrationAbs = toAbsoluteInsideRoot(config.narrationRel);
  const metadataAbs = toAbsoluteInsideRoot(config.metadataRel);
  const outputAbs = toAbsoluteInsideRoot(config.outputRel);

  // Hard-coded scope: genesis/001/001/original-language, preset study
  // (enforced by fixed locale paths above; no CLI override exists)

  assertSafeOutputPath(locale, outputAbs);
  validateMetadata(locale, metadataAbs, koreanSourceAbs);
  const narrationText = readNarrationText(locale, narrationAbs);
  const apiKey = getOpenAiApiKey();

  const audioBytes = await callOpenAiTtsOnce({
    apiKey,
    locale,
    text: narrationText,
    instructions: config.instructions,
  });

  writeMp3Exclusive(outputAbs, audioBytes);

  const size = fs.statSync(outputAbs).size;
  console.log(`○ Wrote MP3: ${config.outputRel}`);
  console.log(`○ Byte size: ${size}`);
}

main().catch((error) => {
  console.error(`○ STOP: ${error.message}`);
  process.exit(1);
});
