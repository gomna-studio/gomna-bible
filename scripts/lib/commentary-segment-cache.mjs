/**
 * Permanent commentary TTS segment cache.
 * Cache keys hash the complete OpenAI speech request signature (not text alone).
 * Segment files under audio/highlight-segments are durable assets — never delete
 * without --confirm-delete-commentary-segment-cache.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEGMENT_CACHE_ROOT_DEFAULT = path.resolve(__dirname, '..', '..');

export const SEGMENT_CACHE_FORMAT_VERSION = 1;
export const SEGMENT_CACHE_PRESET_ID = 'commentary-highlight-default';

/** Actual OpenAI speech request defaults used by build-commentary-highlight-cues.mjs */
export const COMMENTARY_TTS_REQUEST_DEFAULTS = Object.freeze({
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  responseFormat: 'mp3',
  sampleRate: 24000,
  channels: 1,
  bitrate: 128000,
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
});

export const HIGHLIGHT_SEGMENTS_REL = path.join('audio', 'highlight-segments');
export const SEGMENT_CACHE_REL = path.join('audio', 'commentary-segment-cache');

const STALE_LOCK_MS = 30 * 60 * 1000;
const HARD_STALE_LOCK_MS = 2 * 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeTtsText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .trim();
}

export function hashInstructions(instructions) {
  return sha256Hex(normalizeTtsText(instructions));
}

export function buildTtsRequestSignature({
  locale = 'ko-KR',
  text,
  model = COMMENTARY_TTS_REQUEST_DEFAULTS.model,
  voice = COMMENTARY_TTS_REQUEST_DEFAULTS.voice,
  presetId = SEGMENT_CACHE_PRESET_ID,
  instructions = COMMENTARY_TTS_REQUEST_DEFAULTS.instructions,
  responseFormat = COMMENTARY_TTS_REQUEST_DEFAULTS.responseFormat,
  speed = null,
  sampleRate = COMMENTARY_TTS_REQUEST_DEFAULTS.sampleRate,
  channels = COMMENTARY_TTS_REQUEST_DEFAULTS.channels,
  bitrate = COMMENTARY_TTS_REQUEST_DEFAULTS.bitrate,
  contextHash = null,
  formatVersion = SEGMENT_CACHE_FORMAT_VERSION,
} = {}) {
  const normalizedText = normalizeTtsText(text);
  const signature = {
    formatVersion,
    locale,
    model,
    voice,
    presetId,
    instructionsHash: hashInstructions(instructions),
    responseFormat,
    text: normalizedText,
  };
  if (speed != null) signature.speed = speed;
  if (sampleRate != null) signature.sampleRate = sampleRate;
  if (channels != null) signature.channels = channels;
  if (bitrate != null) signature.bitrate = bitrate;
  if (contextHash) signature.contextHash = contextHash;
  return signature;
}

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function cacheKeyFromSignature(signature) {
  return sha256Hex(stableJson(signature));
}

export function buildCacheKeyForText(text, options = {}) {
  const signature = buildTtsRequestSignature({ ...options, text });
  return {
    signature,
    key: cacheKeyFromSignature(signature),
    normalizedTextHash: sha256Hex(signature.text),
    instructionsHash: signature.instructionsHash,
  };
}

export function segmentCacheDir(root, locale = 'ko-KR') {
  return path.join(root, SEGMENT_CACHE_REL, locale);
}

export function segmentCacheMetaPath(root, locale = 'ko-KR') {
  return path.join(segmentCacheDir(root, locale), 'meta.json');
}

export function segmentCacheIndexDir(root, locale = 'ko-KR') {
  return path.join(segmentCacheDir(root, locale), 'index');
}

export function segmentCacheLockDir(root) {
  return path.join(root, SEGMENT_CACHE_REL, 'locks');
}

export function shardNameForKey(key) {
  return `${String(key).slice(0, 2)}.jsonl`;
}

export function indexShardPath(root, locale, key) {
  return path.join(segmentCacheIndexDir(root, locale), shardNameForKey(key));
}

export function assertSegmentCacheDeletionAllowed(argv = process.argv.slice(2)) {
  if (!argv.includes('--confirm-delete-commentary-segment-cache')) {
    throw new Error(
      'audio/highlight-segments 및 commentary-segment-cache 삭제는 '
      + '--confirm-delete-commentary-segment-cache 없이는 금지됩니다.',
    );
  }
}

export function isProtectedSegmentPath(absPath, root) {
  const rel = path.relative(root, absPath).replace(/\\/g, '/');
  return rel === HIGHLIGHT_SEGMENTS_REL
    || rel.startsWith(`${HIGHLIGHT_SEGMENTS_REL}/`)
    || rel === SEGMENT_CACHE_REL
    || rel.startsWith(`${SEGMENT_CACHE_REL}/`);
}

export function guardedRmSync(targetPath, options, root = SEGMENT_CACHE_ROOT_DEFAULT, argv = process.argv.slice(2)) {
  if (isProtectedSegmentPath(path.resolve(targetPath), root)) {
    assertSegmentCacheDeletionAllowed(argv);
  }
  return fs.rmSync(targetPath, options);
}

export function fileSha256(absPath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(absPath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let bytes;
    while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function probeAudioMeta(absPath) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,bit_rate,size:stream=sample_rate,channels,codec_name',
    '-of', 'json',
    absPath,
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  const stream = (parsed.streams || [])[0] || {};
  const format = parsed.format || {};
  const duration = Number(format.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe_invalid_duration:${absPath}`);
  }
  return {
    duration,
    bitrate: format.bit_rate != null ? Number(format.bit_rate) : null,
    sampleRate: stream.sample_rate != null ? Number(stream.sample_rate) : null,
    channels: stream.channels != null ? Number(stream.channels) : null,
    codecName: stream.codec_name || null,
    size: format.size != null ? Number(format.size) : fs.statSync(absPath).size,
  };
}

export function validateSegmentFile(absPath) {
  if (!fs.existsSync(absPath)) return { ok: false, reason: 'missing' };
  const size = fs.statSync(absPath).size;
  if (size <= 0) return { ok: false, reason: 'zero_byte', size };
  try {
    const meta = probeAudioMeta(absPath);
    return { ok: true, size, ...meta };
  } catch (error) {
    return { ok: false, reason: 'ffprobe_failed', size, error: error.message };
  }
}

function parseJsonlFile(absPath) {
  if (!fs.existsSync(absPath)) return [];
  const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    entries.push(JSON.parse(line));
  }
  return entries;
}

export function loadSegmentCacheIndex(root, locale = 'ko-KR') {
  const metaPath = segmentCacheMetaPath(root, locale);
  const indexDir = segmentCacheIndexDir(root, locale);
  if (!fs.existsSync(metaPath) || !fs.existsSync(indexDir)) {
    return {
      ok: false,
      reason: 'cache_index_missing',
      meta: null,
      byKey: new Map(),
      entryCount: 0,
    };
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (error) {
    return { ok: false, reason: 'cache_meta_corrupt', error: error.message, byKey: new Map(), entryCount: 0 };
  }

  if (meta.formatVersion !== SEGMENT_CACHE_FORMAT_VERSION) {
    return { ok: false, reason: 'cache_format_mismatch', meta, byKey: new Map(), entryCount: 0 };
  }

  const byKey = new Map();
  const shardFiles = fs.readdirSync(indexDir).filter((name) => name.endsWith('.jsonl')).sort();
  try {
    for (const name of shardFiles) {
      for (const entry of parseJsonlFile(path.join(indexDir, name))) {
        if (!entry?.key) throw new Error(`missing_key_in_${name}`);
        if (byKey.has(entry.key)) {
          return {
            ok: false,
            reason: 'cache_key_duplicate_conflict',
            conflictKey: entry.key,
            byKey,
            entryCount: byKey.size,
            meta,
          };
        }
        byKey.set(entry.key, entry);
      }
    }
  } catch (error) {
    return { ok: false, reason: 'cache_index_corrupt', error: error.message, byKey: new Map(), entryCount: 0, meta };
  }

  if (meta.uniqueRequestKeys != null && meta.uniqueRequestKeys !== byKey.size) {
    return {
      ok: false,
      reason: 'cache_meta_count_mismatch',
      meta,
      byKey,
      entryCount: byKey.size,
    };
  }

  return { ok: true, meta, byKey, entryCount: byKey.size };
}

export function lookupSegmentCache(root, locale, key, options = {}) {
  const loaded = options.index || loadSegmentCacheIndex(root, locale);
  if (!loaded.ok) return { hit: false, reason: loaded.reason, loaded };
  const entry = loaded.byKey.get(key);
  if (!entry) return { hit: false, reason: 'miss', loaded };

  const absPath = path.isAbsolute(entry.existingSegmentPath || entry.cachePath)
    ? (entry.existingSegmentPath || entry.cachePath)
    : path.join(root, entry.existingSegmentPath || entry.cachePath);

  if (options.skipValidate) {
    return { hit: true, entry, absPath, loaded };
  }

  const validation = validateSegmentFile(absPath);
  if (!validation.ok) {
    return { hit: false, reason: `stale_${validation.reason}`, entry, absPath, validation, loaded };
  }

  return {
    hit: true,
    entry,
    absPath,
    duration: validation.duration,
    validation,
    loaded,
  };
}

function pidAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockInfo(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function isLockStale(lockPath) {
  if (!fs.existsSync(lockPath)) return false;
  const age = Date.now() - fs.statSync(lockPath).mtimeMs;
  const info = readLockInfo(lockPath);
  if (age >= HARD_STALE_LOCK_MS) return true;
  if (age >= STALE_LOCK_MS && info && !pidAlive(info.pid)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSegmentCacheLock(root, key, fn, options = {}) {
  const locale = options.locale || 'ko-KR';
  const lockDir = segmentCacheLockDir(root);
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, `${key}.lock`);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const pollMs = options.pollMs ?? 200;
  const started = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, `${JSON.stringify({
        key,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      })}\n`);
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const existing = lookupSegmentCache(root, locale, key, { index: options.index });
      if (existing.hit) {
        return { acquired: false, reused: true, lookup: existing, result: null };
      }

      if (isLockStale(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch {
          // another process may have removed it
        }
      }

      if (Date.now() - started > timeoutMs) {
        throw new Error(`segment_cache_lock_timeout:${key}`);
      }
      await sleep(pollMs);
    }
  }

  try {
    const result = await fn();
    return { acquired: true, reused: false, result };
  } finally {
    try {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {
      // ignore unlock races
    }
  }
}

export function materializeCachedSegment(absCachePath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath)) {
    const destStat = fs.statSync(destPath);
    const srcStat = fs.statSync(absCachePath);
    if (destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) return 'hardlink-existing';
    if (destStat.size > 0) return 'dest-exists';
    fs.unlinkSync(destPath);
  }
  try {
    fs.linkSync(absCachePath, destPath);
    return 'hardlink';
  } catch {
    try {
      fs.symlinkSync(path.resolve(absCachePath), destPath);
      return 'symlink';
    } catch {
      fs.copyFileSync(absCachePath, destPath);
      return 'copy';
    }
  }
}

export function appendSegmentCacheEntryAtomic(root, locale, entry) {
  if (!entry?.key) throw new Error('cache_entry_missing_key');
  const loaded = loadSegmentCacheIndex(root, locale);
  if (loaded.ok && loaded.byKey.has(entry.key)) {
    const existing = loaded.byKey.get(entry.key);
    return { status: 'exists', entry: existing };
  }
  if (!loaded.ok && loaded.reason !== 'cache_index_missing') {
    throw new Error(`cache_index_not_writable:${loaded.reason}`);
  }

  const indexDir = segmentCacheIndexDir(root, locale);
  fs.mkdirSync(indexDir, { recursive: true });
  const shardPath = indexShardPath(root, locale, entry.key);
  const tmpPath = `${shardPath}.${process.pid}.${Date.now()}.tmp`;
  const prior = fs.existsSync(shardPath) ? fs.readFileSync(shardPath) : Buffer.alloc(0);
  const line = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf8');
  fs.writeFileSync(tmpPath, Buffer.concat([prior, line]));
  fs.renameSync(tmpPath, shardPath);

  const metaPath = segmentCacheMetaPath(root, locale);
  const meta = loaded.meta || {
    formatVersion: SEGMENT_CACHE_FORMAT_VERSION,
    locale,
    createdAt: new Date().toISOString(),
    presetId: SEGMENT_CACHE_PRESET_ID,
    model: COMMENTARY_TTS_REQUEST_DEFAULTS.model,
    voice: COMMENTARY_TTS_REQUEST_DEFAULTS.voice,
  };
  meta.updatedAt = new Date().toISOString();
  meta.uniqueRequestKeys = (loaded.entryCount || 0) + 1;
  const metaTmp = `${metaPath}.${process.pid}.tmp`;
  fs.writeFileSync(metaTmp, `${JSON.stringify(meta, null, 2)}\n`);
  fs.renameSync(metaTmp, metaPath);

  return { status: 'appended', entry, meta };
}

export function writeSegmentCacheIndexAtomic(root, locale, { meta, entries }) {
  const cacheDir = segmentCacheDir(root, locale);
  const tmpDir = path.join(cacheDir, `.tmp-write-${process.pid}-${Date.now()}`);
  const finalIndexDir = segmentCacheIndexDir(root, locale);
  const finalMetaPath = segmentCacheMetaPath(root, locale);

  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpIndexDir = path.join(tmpDir, 'index');
  fs.mkdirSync(tmpIndexDir, { recursive: true });

  const byShard = new Map();
  for (const entry of entries) {
    const shard = shardNameForKey(entry.key);
    if (!byShard.has(shard)) byShard.set(shard, []);
    byShard.get(shard).push(entry);
  }

  for (const [shard, shardEntries] of byShard) {
    const body = `${shardEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
    fs.writeFileSync(path.join(tmpIndexDir, shard), body);
  }

  const metaBody = {
    ...meta,
    formatVersion: SEGMENT_CACHE_FORMAT_VERSION,
    locale,
    uniqueRequestKeys: entries.length,
    writtenAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(tmpDir, 'meta.json'), `${JSON.stringify(metaBody, null, 2)}\n`);

  fs.mkdirSync(cacheDir, { recursive: true });
  const backupIndex = `${finalIndexDir}.bak-${Date.now()}`;
  const backupMeta = `${finalMetaPath}.bak-${Date.now()}`;
  if (fs.existsSync(finalIndexDir)) fs.renameSync(finalIndexDir, backupIndex);
  if (fs.existsSync(finalMetaPath)) fs.renameSync(finalMetaPath, backupMeta);

  fs.renameSync(tmpIndexDir, finalIndexDir);
  fs.renameSync(path.join(tmpDir, 'meta.json'), finalMetaPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Keep one backup; remove older backups from this write helper only if rename succeeded.
  return { meta: metaBody, indexDir: finalIndexDir, backups: { backupIndex, backupMeta } };
}

export function plannedSegmentFileName(unitIndex, paragraphIndex, textIndex, multiPart) {
  const unit = String(unitIndex).padStart(2, '0');
  const para = String(paragraphIndex).padStart(2, '0');
  if (multiPart) {
    return `unit-${unit}-para-${para}-part-${String(textIndex).padStart(2, '0')}.mp3`;
  }
  return `unit-${unit}-para-${para}.mp3`;
}

export function expandPlanSegments(plan, paragraphs) {
  const segments = [];
  for (let unitIndex = 0; unitIndex < plan.length; unitIndex++) {
    const unit = plan[unitIndex];
    const ttsTexts = Array.isArray(unit.ttsTexts) && unit.ttsTexts.length
      ? unit.ttsTexts
      : unit.paragraphIndices.map((paragraphIndex) => paragraphs[paragraphIndex]);
    const multiPart = ttsTexts.length > 1;
    for (let textIndex = 0; textIndex < ttsTexts.length; textIndex++) {
      const paragraphIndex = unit.paragraphIndices[textIndex] ?? unit.paragraphIndices[0] ?? 0;
      const fileName = plannedSegmentFileName(unitIndex, paragraphIndex, textIndex, multiPart);
      segments.push({
        unitIndex,
        textIndex,
        paragraphIndex,
        kind: unit.kind,
        itemIndex: unit.itemIndex ?? null,
        fileName,
        text: ttsTexts[textIndex],
      });
    }
  }
  return segments;
}

export function toPosixRel(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}
