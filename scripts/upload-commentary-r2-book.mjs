#!/usr/bin/env node
/**
 * Book-range commentary MP3 uploader for Cloudflare R2.
 * Reuses the verified Wrangler put contract from prepare-commentary-r2-upload.mjs.
 *
 * Default: dry-run. Never deletes/copies/overwrites. No OpenAI. No manifest edits.
 * Resume mode: protect known-remote keys, just-in-time remote check, await PUT, auth fallback.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

// 4.107.0 put can leave public-visible objects that authenticated get cannot read.
// Resume uses 4.118.0 (put+get verified against this bucket).
const WRANGLER_PACKAGE = 'wrangler@4.118.0';
const R2 = {
  bucket: 'gomna-bible-audio-prod',
  publicBaseUrl: 'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev',
  contentType: 'audio/mpeg',
};

const FILE_NAMES = [
  'original-language-study.mp3',
  'history-warm.mp3',
  'theology-warm.mp3',
  'typology-study.mp3',
  'matthew-henry-calm.mp3',
  'sermon-strong.mp3',
  'hymn-soft.mp3',
  'counseling-warm.mp3',
  'cross-reference-calm.mp3',
];

const GENESIS_VERSE_COUNTS = {
  1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 22, 7: 24, 8: 22, 9: 29, 10: 32,
  11: 32, 12: 20, 13: 18, 14: 24, 15: 21, 16: 16, 17: 27, 18: 33, 19: 38, 20: 18,
  21: 34, 22: 24, 23: 20, 24: 67, 25: 34, 26: 35, 27: 46, 28: 22, 29: 35, 30: 43,
  31: 55, 32: 32, 33: 20, 34: 31, 35: 29, 36: 43, 37: 36, 38: 30, 39: 23, 40: 23,
  41: 57, 42: 38, 43: 34, 44: 34, 45: 28, 46: 34, 47: 31, 48: 22, 49: 33, 50: 26,
};

const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 12;
const MAX_RESUME_CONCURRENCY = 6;
const MAX_RETRIES = 5;
const PUBLIC_VERIFY_ATTEMPTS = 4;

function usage() {
  console.error('Usage:');
  console.error('  node scripts/upload-commentary-r2-book.mjs --book genesis --from-chapter 4 --to-chapter 50 [--dry-run]');
  console.error('  node scripts/upload-commentary-r2-book.mjs --book genesis --from-chapter 4 --to-chapter 50 --resume --write --confirm-upload-count N --concurrency 4');
  console.error('Options: --resume --protect-keys-file PATH --keys-file PATH --auth-exists-check --verify-only --retry-failed --sample-sha');
}

function parseArgs(argv) {
  const args = {
    bookId: 'genesis',
    fromChapter: null,
    toChapter: null,
    verse: null,
    dryRun: true,
    write: false,
    confirmUploadCount: null,
    concurrency: DEFAULT_CONCURRENCY,
    authExistsCheck: false,
    verifyOnly: false,
    retryFailed: false,
    sampleSha: false,
    resume: false,
    protectKeysFile: null,
    keysFile: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--book') args.bookId = argv[++i];
    else if (arg === '--from-chapter') args.fromChapter = Number(argv[++i]);
    else if (arg === '--to-chapter') args.toChapter = Number(argv[++i]);
    else if (arg === '--verse') args.verse = Number(argv[++i]);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') {
      args.write = true;
      args.dryRun = false;
    } else if (arg === '--confirm-upload-count') args.confirmUploadCount = Number(argv[++i]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (arg === '--auth-exists-check') args.authExistsCheck = true;
    else if (arg === '--verify-only') args.verifyOnly = true;
    else if (arg === '--retry-failed') args.retryFailed = true;
    else if (arg === '--sample-sha') args.sampleSha = true;
    else if (arg === '--resume') args.resume = true;
    else if (arg === '--protect-keys-file') args.protectKeysFile = argv[++i];
    else if (arg === '--keys-file') args.keysFile = argv[++i];
    else if (arg === '--overwrite') {
      throw new Error('--overwrite는 이 업로더에서 금지됩니다.');
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }

  if (args.bookId !== 'genesis') throw new Error('현재 genesis만 지원합니다.');
  if (!Number.isInteger(args.fromChapter) || !Number.isInteger(args.toChapter)) {
    throw new Error('--from-chapter/--to-chapter가 필요합니다.');
  }
  if (args.fromChapter < 4 || args.toChapter > 50 || args.fromChapter > args.toChapter) {
    throw new Error('업로드 범위는 창세기 4~50장만 허용됩니다.');
  }
  if (args.verse != null && (!Number.isInteger(args.verse) || args.verse < 1)) {
    throw new Error('--verse가 올바르지 않습니다.');
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency가 올바르지 않습니다.');
  }
  const maxConc = args.resume ? MAX_RESUME_CONCURRENCY : MAX_CONCURRENCY;
  if (args.concurrency > maxConc) {
    throw new Error(`--concurrency 최대값은 ${maxConc}입니다${args.resume ? ' (--resume)' : ''}.`);
  }
  if (args.write && (args.confirmUploadCount == null || !Number.isFinite(args.confirmUploadCount))) {
    throw new Error('--write에는 --confirm-upload-count N이 필요합니다.');
  }
  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function reportPaths(fromChapter, toChapter, resume) {
  const tag = `${pad3(fromChapter)}-${pad3(toChapter)}`;
  const dir = path.join(ROOT, 'reports', 'commentary-r2-upload');
  if (resume) {
    return {
      dir,
      checkpoint: path.join(dir, `genesis-${tag}-resume-checkpoint.jsonl`),
      failed: path.join(dir, `genesis-${tag}-resume-failed.jsonl`),
      conflicts: path.join(dir, `genesis-${tag}-resume-conflicts.jsonl`),
      summary: path.join(dir, `genesis-${tag}-resume-summary.json`),
      dryRun: path.join(dir, `genesis-${tag}-resume-dry-run.json`),
      legacyCheckpoint: path.join(dir, `genesis-${tag}-checkpoint.jsonl`),
    };
  }
  return {
    dir,
    checkpoint: path.join(dir, `genesis-${tag}-checkpoint.jsonl`),
    failed: path.join(dir, `genesis-${tag}-failed.jsonl`),
    conflicts: path.join(dir, `genesis-${tag}-conflicts.jsonl`),
    summary: path.join(dir, `genesis-${tag}-summary.json`),
    dryRun: path.join(dir, `genesis-${tag}-dry-run.json`),
    legacyCheckpoint: null,
  };
}

function buildAllowlist(args) {
  const items = [];
  for (let chapter = args.fromChapter; chapter <= args.toChapter; chapter++) {
    const maxVerse = GENESIS_VERSE_COUNTS[chapter];
    if (!maxVerse) throw new Error(`unknown chapter ${chapter}`);
    for (let verse = 1; verse <= maxVerse; verse++) {
      if (args.verse != null && verse !== args.verse) continue;
      for (const fileName of FILE_NAMES) {
        const chapter3 = pad3(chapter);
        const verse3 = pad3(verse);
        const absoluteLocalPath = path.join(
          ROOT, 'audio', 'v1', 'ko-KR', args.bookId, chapter3, verse3, fileName,
        );
        const objectKey = `commentary/ko/gae/${args.bookId}/${chapter3}/${verse3}/${fileName}`;
        const exists = fs.existsSync(absoluteLocalPath);
        const fileSize = exists ? fs.statSync(absoluteLocalPath).size : 0;
        items.push({
          bookId: args.bookId,
          chapter,
          verse,
          fileName,
          absoluteLocalPath,
          localRelativePath: path.relative(ROOT, absoluteLocalPath).split(path.sep).join('/'),
          objectKey,
          objectPath: `${R2.bucket}/${objectKey}`,
          publicUrl: `${R2.publicBaseUrl}/${objectKey}`,
          fileSize,
          valid: exists && fileSize > 0,
        });
      }
    }
  }
  return items;
}

function loadObjectKeySetFromJsonl(filePath, { requireVerified = false } = {}) {
  const set = new Set();
  if (!filePath || !fs.existsSync(filePath)) return set;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (!entry?.objectKey) continue;
    if (requireVerified && entry.status !== 'verified') continue;
    set.add(entry.objectKey);
  }
  return set;
}

function loadCheckpointMap(checkpointPath) {
  const map = new Map();
  if (!fs.existsSync(checkpointPath)) return map;
  for (const line of fs.readFileSync(checkpointPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry?.objectKey && entry.status === 'verified') {
      map.set(entry.objectKey, entry);
    }
  }
  return map;
}

function loadProtectKeys(args, paths) {
  const protect = new Set();
  if (args.protectKeysFile) {
    const abs = path.isAbsolute(args.protectKeysFile)
      ? args.protectKeysFile
      : path.join(ROOT, args.protectKeysFile);
    const text = fs.readFileSync(abs, 'utf8');
    if (abs.endsWith('.json') && text.trim().startsWith('{')) {
      const obj = JSON.parse(text);
      for (const key of obj.keys || obj.objectKeys || []) protect.add(key);
    } else {
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        if (t.startsWith('{')) {
          const entry = JSON.parse(t);
          if (entry.objectKey) protect.add(entry.objectKey);
        } else {
          protect.add(t);
        }
      }
    }
  } else if (args.resume) {
    // Default protect: legacy checkpoint verified + audit failed-but-remote-verified.
    for (const key of loadObjectKeySetFromJsonl(paths.legacyCheckpoint, { requireVerified: true })) {
      protect.add(key);
    }
    const auditFv = '/tmp/genesis-commentary-r2-recovery-failed-verified.jsonl';
    for (const key of loadObjectKeySetFromJsonl(auditFv)) protect.add(key);
  }
  return protect;
}

function loadKeysFile(keysFile) {
  if (!keysFile) return null;
  const abs = path.isAbsolute(keysFile) ? keysFile : path.join(ROOT, keysFile);
  const set = new Set();
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('{')) {
      const entry = JSON.parse(t);
      if (entry.objectKey) set.add(entry.objectKey);
    } else {
      set.add(t);
    }
  }
  return set;
}

function appendJsonl(filePath, entry) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  const fd = fs.openSync(filePath, 'a');
  try {
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function runCurl(args) {
  return new Promise((resolve) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: 1, stdout: '', stderr: error.message }));
  });
}

function parseCurlHeaders(out) {
  const statusMatch = out.match(/HTTP\/[\d.]+\s+(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const cl = out.match(/Content-Length:\s*(\d+)/i);
  const ct = out.match(/Content-Type:\s*([^\r\n]+)/i);
  const cr = out.match(/Content-Range:\s*bytes\s+\d+-\d+\/(\d+)/i);
  const remoteSize = cr ? Number(cr[1]) : (cl ? Number(cl[1]) : null);
  return {
    status,
    contentType: ct ? ct[1].trim() : '',
    remoteSize: Number.isFinite(remoteSize) ? remoteSize : null,
  };
}

async function probePublic(publicUrl, timeoutSec = 12) {
  const head = await runCurl([
    '-sI', '-L', '--max-time', String(timeoutSec),
    '-A', 'gomna-commentary-r2-upload/1.0',
    '-H', 'Cache-Control: no-cache',
    publicUrl,
  ]);
  const headParsed = parseCurlHeaders(`${head.stdout}\n${head.stderr}`);
  if (headParsed.status) {
    return { ...headParsed, via: 'curl-HEAD' };
  }

  const range = await runCurl([
    '-sI', '-L', '--max-time', String(timeoutSec),
    '-A', 'gomna-commentary-r2-upload/1.0',
    '-H', 'Cache-Control: no-cache',
    '-H', 'Range: bytes=0-0',
    publicUrl,
  ]);
  const rangeParsed = parseCurlHeaders(`${range.stdout}\n${range.stderr}`);
  return {
    ...rangeParsed,
    via: 'curl-Range',
    errorMessage: rangeParsed.status ? undefined : 'curl_failed',
  };
}

function runNpxWrangler(args) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['--yes', WRANGLER_PACKAGE, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: 1, stdout: '', stderr: error.message }));
  });
}

async function wranglerGetToFile(objectPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const result = await runNpxWrangler([
    'r2', 'object', 'get', objectPath, '--file', destPath, '--remote',
  ]);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.code !== 0) {
    if (/does not exist/i.test(output) || /The specified key does not exist/i.test(output)) {
      return { exists: false, output };
    }
    const err = new Error(output || 'wrangler r2 object get failed');
    err.authError = /auth|login|unauthorized|forbidden|oauth/i.test(output);
    err.retryable = /429|5\d\d|ECONN|ETIMEDOUT|network|fetch failed|throttle/i.test(output);
    throw err;
  }
  if (!fs.existsSync(destPath) || fs.statSync(destPath).size <= 0) {
    throw new Error(`wrangler get produced empty file: ${destPath}`);
  }
  return { exists: true, output, size: fs.statSync(destPath).size };
}

function isTransientRemoteError(error) {
  const msg = error?.message || String(error || '');
  return /Failed to fetch|ECONN|ETIMEDOUT|network|fetch failed|throttle|429|5\d\d|socket/i.test(msg)
    && !/unauthorized|login|oauth|forbidden|ECOMPROMISED/i.test(msg);
}

async function authRemoteSize(item) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const tmp = path.join('/tmp', `gomna-r2-exist-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mp3`);
    try {
      const got = await wranglerGetToFile(item.objectPath, tmp);
      if (!got.exists) return { action: 'upload', remoteStatus: 'missing-auth', remoteSize: null };
      if (got.size === item.fileSize) {
        return { action: 'remote-skip', remoteStatus: 'size-match-auth', remoteSize: got.size, contentType: R2.contentType };
      }
      return { action: 'conflict', remoteStatus: 'size-mismatch-auth', remoteSize: got.size };
    } catch (error) {
      lastError = error;
      if (error.authError) throw error;
      if (!isTransientRemoteError(error) || attempt === MAX_RETRIES) throw error;
      await sleep(Math.min(30000, 500 * (2 ** (attempt - 1))));
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }
  throw lastError || new Error('authRemoteSize failed');
}

async function runWranglerPut(item) {
  const result = await runNpxWrangler([
    'r2',
    'object',
    'put',
    item.objectPath,
    '--file',
    item.absoluteLocalPath,
    '--content-type',
    R2.contentType,
    '--remote',
  ]);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.code !== 0) {
    const err = new Error(output || 'wrangler r2 object put failed');
    err.output = output;
    err.retryable = /429|5\d\d|ECONN|ETIMEDOUT|network|fetch failed|throttle/i.test(output);
    err.authError = /auth|login|unauthorized|forbidden|oauth|ECOMPROMISED/i.test(output);
    throw err;
  }
  if (/Resource location:\s*local/i.test(output)) {
    throw new Error('wrangler가 local R2에 저장했습니다. --remote 업로드가 적용되지 않았습니다.');
  }
  if (!/Resource location:\s*remote/i.test(output)) {
    throw new Error('wrangler 출력에서 remote 업로드 확인에 실패했습니다.');
  }
  return output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileSha256(absPath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(absPath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Public URL alone never decides missing. 404/403 → authenticated GET.
 */
async function classifyRemote(item, { checkpointMap, protectSet, authExistsCheck }) {
  if (protectSet?.has(item.objectKey)) {
    return {
      action: 'protect-skip',
      remoteStatus: 'protect-list',
      remoteSize: item.fileSize,
    };
  }

  const cp = checkpointMap.get(item.objectKey);
  if (cp && cp.localSize === item.fileSize) {
    return {
      action: 'checkpoint-skip',
      remoteStatus: 'checkpoint-verified',
      remoteSize: cp.remoteSize ?? item.fileSize,
    };
  }

  const pub = await probePublic(item.publicUrl);

  if (pub.status === 200 || pub.status === 206) {
    if (pub.remoteSize != null && pub.remoteSize === item.fileSize) {
      return {
        action: 'remote-skip',
        remoteStatus: pub.status,
        remoteSize: pub.remoteSize,
        contentType: pub.contentType,
      };
    }
    if (pub.remoteSize != null && pub.remoteSize !== item.fileSize) {
      return {
        action: 'conflict',
        remoteStatus: pub.status,
        remoteSize: pub.remoteSize,
        contentType: pub.contentType,
      };
    }
    // Size unknown on public — auth size check.
    return authRemoteSize(item);
  }

  if (pub.status === 404 || pub.status === 403) {
    // Never treat public 404/403 as definitive absence without auth GET.
    if (pub.status === 403 && !authExistsCheck && !protectSet) {
      // Legacy non-resume path may still flag forbidden for large inventory.
      return { action: 'forbidden', remoteStatus: 403, publicProbe: pub };
    }
    try {
      return await authRemoteSize(item);
    } catch (error) {
      if (error.authError) {
        return { action: 'unresolved', remoteStatus: 'auth-error', detail: error.message.slice(0, 300) };
      }
      return { action: 'unresolved', remoteStatus: 'auth-get-error', detail: error.message.slice(0, 300) };
    }
  }

  if (pub.status === 0) {
    return { action: 'unresolved', remoteStatus: 0, detail: 'public probe failed' };
  }

  return {
    action: 'unresolved',
    remoteStatus: pub.status,
    publicProbe: pub,
    detail: 'unexpected public status',
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => run()));
  return results;
}

async function verifyAfterPut(item, { requireSha = false } = {}) {
  for (let attempt = 1; attempt <= PUBLIC_VERIFY_ATTEMPTS; attempt++) {
    const pub = await probePublic(item.publicUrl);
    const contentTypeOk = (pub.contentType || '').includes('audio/mpeg');
    const statusOk = pub.status === 200 || pub.status === 206;
    const sizeOk = pub.remoteSize != null && pub.remoteSize === item.fileSize;
    if (statusOk && contentTypeOk && sizeOk) {
      return {
        ok: true,
        verifiedVia: 'public',
        remoteSize: pub.remoteSize,
        contentType: pub.contentType,
      };
    }
    if (pub.status === 404 || pub.status === 403 || !statusOk) {
      await sleep(Math.min(8000, 400 * (2 ** (attempt - 1))));
      continue;
    }
    // 200 but bad size/type — auth decide
    break;
  }

  const tmp = path.join('/tmp', `gomna-r2-verify-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mp3`);
  try {
    const got = await wranglerGetToFile(item.objectPath, tmp);
    if (!got.exists) {
      throw new Error('post-upload auth verify: object missing');
    }
    if (got.size !== item.fileSize) {
      throw new Error(`post-upload auth verify size mismatch remote=${got.size} local=${item.fileSize}`);
    }
    if (requireSha) {
      const localSha = fileSha256(item.absoluteLocalPath);
      const remoteSha = fileSha256(tmp);
      if (localSha !== remoteSha) {
        throw new Error(`post-upload auth verify sha mismatch`);
      }
      return {
        ok: true,
        verifiedVia: 'wrangler-get-sha',
        remoteSize: got.size,
        contentType: R2.contentType,
        sha256: localSha,
      };
    }
    return {
      ok: true,
      verifiedVia: 'wrangler-get',
      remoteSize: got.size,
      contentType: R2.contentType,
    };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

const inFlightKeys = new Set();

async function processOne(item, paths, {
  concurrencyLabel,
  protectSet,
  checkpointMap,
  requireSha = false,
  stopController,
}) {
  if (stopController.stopped) {
    return { objectKey: item.objectKey, action: 'aborted', uploaded: false };
  }

  if (protectSet.has(item.objectKey)) {
    return {
      objectKey: item.objectKey,
      action: 'protect-skip',
      uploaded: false,
      status: 'skipped-protected',
    };
  }

  const cp = checkpointMap.get(item.objectKey);
  if (cp && cp.localSize === item.fileSize) {
    return {
      objectKey: item.objectKey,
      action: 'checkpoint-skip',
      uploaded: false,
      status: 'skipped-checkpoint',
    };
  }

  if (inFlightKeys.has(item.objectKey)) {
    const fail = {
      objectKey: item.objectKey,
      status: 'failed',
      localSize: item.fileSize,
      errorMessage: 'duplicate concurrent put blocked',
      at: new Date().toISOString(),
    };
    appendJsonl(paths.failed, fail);
    return { ...fail, action: 'failed', uploaded: false };
  }

  // Pre-PUT remote classification (never PUT on size-match / protect).
  let cls;
  try {
    cls = await classifyRemote(item, {
      checkpointMap,
      protectSet,
      authExistsCheck: true,
    });
  } catch (error) {
    if (error.authError) stopController.stop('auth-error', error.message);
    const fail = {
      objectKey: item.objectKey,
      status: 'failed',
      localSize: item.fileSize,
      errorMessage: error.message || 'classify failed',
      at: new Date().toISOString(),
    };
    appendJsonl(paths.failed, fail);
    return { ...fail, action: 'failed', uploaded: false };
  }

  if (cls.action === 'protect-skip' || cls.action === 'checkpoint-skip') {
    return { objectKey: item.objectKey, action: cls.action, uploaded: false, status: cls.action };
  }

  if (cls.action === 'remote-skip') {
    const entry = {
      objectKey: item.objectKey,
      status: 'verified',
      localSize: item.fileSize,
      remoteSize: cls.remoteSize ?? item.fileSize,
      contentType: cls.contentType || R2.contentType,
      verifiedVia: 'pre-put-remote-skip',
      concurrency: concurrencyLabel,
      at: new Date().toISOString(),
    };
    appendJsonl(paths.checkpoint, entry);
    checkpointMap.set(item.objectKey, entry);
    return { ...entry, action: 'remote-skip', uploaded: false };
  }

  if (cls.action === 'conflict') {
    appendJsonl(paths.conflicts, {
      objectKey: item.objectKey,
      localSize: item.fileSize,
      remoteSize: cls.remoteSize,
      at: new Date().toISOString(),
    });
    stopController.stop('conflict', item.objectKey);
    return { objectKey: item.objectKey, action: 'conflict', uploaded: false, remoteSize: cls.remoteSize };
  }

  if (cls.action === 'unresolved' || cls.action === 'forbidden' || cls.action === 'blocker') {
    stopController.stop('unresolved', `${item.objectKey}:${cls.detail || cls.action}`);
    const fail = {
      objectKey: item.objectKey,
      status: 'failed',
      localSize: item.fileSize,
      errorMessage: `unresolved:${cls.detail || cls.action}`,
      at: new Date().toISOString(),
    };
    appendJsonl(paths.failed, fail);
    return { ...fail, action: 'unresolved', uploaded: false };
  }

  if (cls.action !== 'upload') {
    stopController.stop('unresolved', `${item.objectKey}:unexpected:${cls.action}`);
    return { objectKey: item.objectKey, action: 'unresolved', uploaded: false };
  }

  // PUT only after confirmed remote missing.
  inFlightKeys.add(item.objectKey);
  let lastError = null;
  let retries = 0;
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (stopController.stopped) {
        return { objectKey: item.objectKey, action: 'aborted', uploaded: false };
      }
      try {
        const putResult = await runWranglerPut(item);
        const verified = await verifyAfterPut(item, { requireSha });
        const entry = {
          objectKey: item.objectKey,
          status: 'verified',
          localSize: item.fileSize,
          remoteSize: verified.remoteSize,
          contentType: verified.contentType,
          verifiedVia: verified.verifiedVia,
          concurrency: concurrencyLabel,
          at: new Date().toISOString(),
          wranglerOk: true,
          sha256: verified.sha256,
          putOutputHead: String(putResult).slice(0, 160),
        };
        appendJsonl(paths.checkpoint, entry);
        checkpointMap.set(item.objectKey, entry);
        return {
          ...entry,
          action: 'uploaded',
          uploaded: true,
          retries: attempt - 1,
        };
      } catch (error) {
        lastError = error;
        if (error.authError) {
          stopController.stop('auth-error', error.message);
          break;
        }
        const retryable = error.retryable
          || /429|5\d\d|ECONN|ETIMEDOUT|network|fetch failed|throttle/i.test(error.message || '');
        if (!retryable || attempt === MAX_RETRIES) break;
        retries += 1;
        await sleep(Math.min(30000, 500 * (2 ** (attempt - 1))));
      }
    }
  } finally {
    inFlightKeys.delete(item.objectKey);
  }

  const fail = {
    objectKey: item.objectKey,
    status: 'failed',
    localSize: item.fileSize,
    errorMessage: lastError?.message || 'unknown',
    retries,
    at: new Date().toISOString(),
  };
  appendJsonl(paths.failed, fail);
  return { ...fail, action: 'failed', uploaded: false };
}

async function planResumeDryRun(items, args, paths, protectSet) {
  const resumeCp = loadCheckpointMap(paths.checkpoint);
  let protectSkip = 0;
  let resumeCheckpointSkip = 0;
  let candidates = 0;
  const keySet = new Set();
  let duplicateKey = 0;

  for (const item of items) {
    if (keySet.has(item.objectKey)) duplicateKey += 1;
    keySet.add(item.objectKey);
    if (!item.valid) continue;
    if (protectSet.has(item.objectKey)) {
      protectSkip += 1;
      continue;
    }
    const cp = resumeCp.get(item.objectKey);
    if (cp && cp.localSize === item.fileSize) {
      resumeCheckpointSkip += 1;
      continue;
    }
    candidates += 1;
  }

  const zero = items.filter((item) => !item.valid);
  return {
    generatedAt: new Date().toISOString(),
    mode: 'resume-dry-run',
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    targetCount: items.length,
    validCount: items.filter((i) => i.valid).length,
    zeroByteCount: zero.length,
    localBytes: items.reduce((sum, i) => sum + (i.valid ? i.fileSize : 0), 0),
    protectSkip,
    protectUnique: protectSet.size,
    resumeCheckpointSkip,
    candidatesJustInTime: candidates,
    plannedNote: 'Remaining keys are classified immediately before PUT (no full pre-inventory).',
    overwrite: 0,
    duplicateKey,
    conflictCount: 0,
    outOfScopeChecks: {
      genesis1to3: items.filter((i) => i.chapter <= 3).length,
      cue: 0,
      segment: 0,
      cache: 0,
      bibleCalm: items.filter((i) => i.fileName.includes('bible-calm')).length,
    },
    firstKey: items[0]?.objectKey || null,
    lastKey: items[items.length - 1]?.objectKey || null,
    wranglerPackage: WRANGLER_PACKAGE,
    contentType: R2.contentType,
  };
}

async function planAllLegacy(items, args, paths) {
  const checkpointMap = loadCheckpointMap(paths.checkpoint);
  const zero = items.filter((item) => !item.valid);
  const blockers = [];
  let checkpointSkip = 0;
  let remoteSkip = 0;
  let upload = 0;
  let conflict = 0;
  let forbidden = 0;
  let blockerCount = 0;
  const classifications = [];

  const sample = items.filter((item) => item.valid).slice(0, 3);
  let publicForbidden = false;
  let publicUnusable = false;
  const sampleStatuses = [];
  for (const item of sample) {
    const pub = await probePublic(item.publicUrl);
    sampleStatuses.push(pub.status);
    if (pub.status === 403) publicForbidden = true;
    if (pub.status === 403 || pub.status === 0) publicUnusable = true;
  }

  if (publicUnusable && !args.authExistsCheck && items.length > 50) {
    for (const item of items) {
      if (!item.valid) continue;
      const cp = checkpointMap.get(item.objectKey);
      if (cp && cp.localSize === item.fileSize) {
        checkpointSkip += 1;
        classifications.push({ objectKey: item.objectKey, action: 'checkpoint-skip' });
        continue;
      }
      forbidden += 1;
      classifications.push({
        objectKey: item.objectKey,
        action: 'forbidden',
        remoteStatus: publicForbidden ? 403 : 'public-unusable',
      });
    }
    blockers.push(
      `public URL HEAD/GET가 사용 불가(sampleStatuses=${sampleStatuses.join(',')})라 전체 원격 inventory를 안전히 수행할 수 없습니다.`,
    );
  } else {
    const concurrency = args.authExistsCheck ? Math.min(args.concurrency, 3) : args.concurrency;
    const results = await mapPool(items.filter((i) => i.valid), concurrency, async (item) => {
      const cls = await classifyRemote(item, {
        checkpointMap,
        protectSet: new Set(),
        authExistsCheck: args.authExistsCheck,
      });
      return { item, cls };
    });
    for (const { item, cls } of results) {
      classifications.push({ objectKey: item.objectKey, ...cls, fileSize: item.fileSize });
      if (cls.action === 'checkpoint-skip' || cls.action === 'protect-skip') checkpointSkip += 1;
      else if (cls.action === 'remote-skip') remoteSkip += 1;
      else if (cls.action === 'upload') upload += 1;
      else if (cls.action === 'conflict') {
        conflict += 1;
        appendJsonl(paths.conflicts, {
          objectKey: item.objectKey,
          localSize: item.fileSize,
          remoteSize: cls.remoteSize,
          at: new Date().toISOString(),
        });
      } else if (cls.action === 'forbidden') forbidden += 1;
      else {
        blockerCount += 1;
        blockers.push(`${item.objectKey}:${cls.detail || cls.action}`);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: args.write ? 'write-plan' : 'dry-run',
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    verse: args.verse,
    targetCount: items.length,
    validCount: items.filter((i) => i.valid).length,
    zeroByteCount: zero.length,
    localBytes: items.reduce((sum, i) => sum + (i.valid ? i.fileSize : 0), 0),
    checkpointSkip,
    remoteSizeMatchSkip: remoteSkip,
    plannedUploadCount: upload,
    conflictCount: conflict,
    forbiddenCount: forbidden,
    blockerCount: blockers.length + blockerCount,
    blockers: [...new Set(blockers)].slice(0, 50),
    outOfScopeChecks: {
      genesis1to3: items.filter((i) => i.chapter <= 3).length,
      cue: 0,
      segment: 0,
      cache: 0,
      bibleCalm: items.filter((i) => i.fileName.includes('bible-calm')).length,
    },
    publicForbidden,
    wranglerPackage: WRANGLER_PACKAGE,
    contentType: R2.contentType,
    firstKey: items[0]?.objectKey || null,
    lastKey: items[items.length - 1]?.objectKey || null,
    classifications: args.authExistsCheck || items.length <= 50
      ? classifications
      : classifications.slice(0, 20),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = reportPaths(args.fromChapter, args.toChapter, args.resume);
  fs.mkdirSync(paths.dir, { recursive: true });

  let items = buildAllowlist(args);
  const protectSet = loadProtectKeys(args, paths);

  if (args.keysFile) {
    const wanted = loadKeysFile(args.keysFile);
    items = items.filter((item) => wanted.has(item.objectKey));
  }

  if (args.retryFailed && fs.existsSync(paths.failed)) {
    const failedKeys = new Set(
      fs.readFileSync(paths.failed, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).objectKey),
    );
    items = items.filter((item) => failedKeys.has(item.objectKey));
    fs.renameSync(paths.failed, `${paths.failed}.prev-${Date.now()}`);
  }

  // Dry-run / verify-only
  if (!args.write || args.verifyOnly) {
    const plan = args.resume
      ? await planResumeDryRun(items, args, paths, protectSet)
      : await planAllLegacy(items, args, paths);
    fs.writeFileSync(paths.dryRun, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(JSON.stringify({ ...plan, reportPath: path.relative(ROOT, paths.dryRun) }, null, 2));
    if (plan.zeroByteCount > 0 || plan.validCount !== plan.targetCount) process.exitCode = 1;
    if (!args.resume && plan.blockerCount > 0) process.exitCode = 1;
    return;
  }

  const zeroByteCount = items.filter((i) => !i.valid).length;
  if (zeroByteCount > 0 || items.some((i) => !i.valid)) {
    throw new Error('로컬 allowlist가 완전하지 않아 write를 중단합니다.');
  }

  // Resume write: just-in-time classify; confirm = candidates after protect/resume-cp/keys filter.
  if (args.resume) {
    const checkpointMap = loadCheckpointMap(paths.checkpoint);
    const candidates = items.filter((item) => {
      if (protectSet.has(item.objectKey)) return false;
      const cp = checkpointMap.get(item.objectKey);
      if (cp && cp.localSize === item.fileSize) return false;
      return true;
    });

    // Protect keys must never appear in candidate PUT set.
    const protectedInBatch = items.filter((i) => protectSet.has(i.objectKey)).length;
    console.error(
      `○ resume write start items=${items.length} protectInBatch=${protectedInBatch} `
      + `candidates=${candidates.length} protectSet=${protectSet.size} concurrency=${args.concurrency}`,
    );

    if (candidates.length !== args.confirmUploadCount) {
      throw new Error(
        `resume candidate count ${candidates.length} != confirm ${args.confirmUploadCount}`,
      );
    }

    // Ensure none of the candidates are in protect set.
    for (const item of candidates) {
      if (protectSet.has(item.objectKey)) {
        throw new Error(`protect key leaked into candidates: ${item.objectKey}`);
      }
    }

    const stopController = {
      stopped: false,
      reason: null,
      detail: null,
      stop(reason, detail) {
        this.stopped = true;
        this.reason = reason;
        this.detail = detail;
        console.error(`○ STOP new work reason=${reason} detail=${detail}`);
      },
    };

    let completed = 0;
    const uploadResults = await mapPool(candidates, args.concurrency, async (item, idx) => {
      const requireSha = args.sampleSha && idx === 0;
      const result = await processOne(item, paths, {
        concurrencyLabel: args.concurrency,
        protectSet,
        checkpointMap,
        requireSha,
        stopController,
      });
      completed += 1;
      if (completed % 25 === 0 || completed === candidates.length || result.uploaded) {
        console.error(
          `○ progress ${completed}/${candidates.length} last=${result.action} key=${item.objectKey}`,
        );
      }
      return result;
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: 'resume-write',
      concurrency: args.concurrency,
      protectSetSize: protectSet.size,
      candidateCount: candidates.length,
      uploadedCount: uploadResults.filter((r) => r.uploaded).length,
      remoteSkipCount: uploadResults.filter((r) => r.action === 'remote-skip').length,
      checkpointSkipCount: uploadResults.filter((r) => r.action === 'checkpoint-skip').length,
      protectSkipCount: uploadResults.filter((r) => r.action === 'protect-skip').length,
      failedCount: uploadResults.filter((r) => r.action === 'failed').length,
      conflictCount: uploadResults.filter((r) => r.action === 'conflict').length,
      unresolvedCount: uploadResults.filter((r) => r.action === 'unresolved').length,
      abortedCount: uploadResults.filter((r) => r.action === 'aborted').length,
      retriesTotal: uploadResults.reduce((s, r) => s + (r.retries || 0), 0),
      stopReason: stopController.reason,
      stopDetail: stopController.detail,
      retriesMaxPerFile: MAX_RETRIES,
    };
    fs.writeFileSync(paths.summary, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify({
      ...summary,
      failedSample: uploadResults.filter((r) => r.action === 'failed').slice(0, 10),
      summaryPath: path.relative(ROOT, paths.summary),
    }, null, 2));

    if (
      summary.failedCount > 0
      || summary.conflictCount > 0
      || summary.unresolvedCount > 0
      || stopController.stopped
    ) {
      process.exitCode = 1;
    }
    return;
  }

  // Legacy non-resume write path (still awaits PUT).
  const checkpointMap = loadCheckpointMap(paths.checkpoint);
  console.error(`○ write gate classify start targets=${items.length} concurrency=${args.concurrency}`);
  const gateResults = await mapPool(
    items.filter((i) => i.valid),
    Math.min(args.concurrency, 12),
    async (item) => {
      const cls = await classifyRemote(item, {
        checkpointMap,
        protectSet: new Set(),
        authExistsCheck: args.authExistsCheck,
      });
      return { item, cls };
    },
  );
  const toUpload = [];
  let remoteSkip = 0;
  let checkpointSkip = 0;
  let conflictCount = 0;
  for (const { item, cls } of gateResults) {
    if (cls.action === 'upload') toUpload.push(item);
    else if (cls.action === 'remote-skip') remoteSkip += 1;
    else if (cls.action === 'checkpoint-skip' || cls.action === 'protect-skip') checkpointSkip += 1;
    else if (cls.action === 'conflict') {
      conflictCount += 1;
      appendJsonl(paths.conflicts, {
        objectKey: item.objectKey,
        localSize: item.fileSize,
        remoteSize: cls.remoteSize,
        at: new Date().toISOString(),
      });
    } else if (cls.action === 'forbidden' || cls.action === 'blocker' || cls.action === 'unresolved') {
      throw new Error(`unsafe remote class during write: ${item.objectKey} ${cls.action}`);
    }
  }
  console.error(
    `○ write gate done upload=${toUpload.length} checkpointSkip=${checkpointSkip} remoteSkip=${remoteSkip} conflict=${conflictCount}`,
  );
  if (conflictCount > 0) {
    throw new Error(`conflict ${conflictCount}건 — --overwrite 없이 write 중단`);
  }
  if (toUpload.length !== args.confirmUploadCount) {
    throw new Error(
      `write gate upload count ${toUpload.length} != confirm ${args.confirmUploadCount}`,
    );
  }

  const stopController = {
    stopped: false,
    reason: null,
    detail: null,
    stop(reason, detail) {
      this.stopped = true;
      this.reason = reason;
      this.detail = detail;
    },
  };

  const uploadResults = await mapPool(toUpload, args.concurrency, async (item) => (
    processOne(item, paths, {
      concurrencyLabel: args.concurrency,
      protectSet: new Set(),
      checkpointMap,
      requireSha: false,
      stopController,
    })
  ));

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: 'write',
    concurrency: args.concurrency,
    plannedUploadCount: toUpload.length,
    uploadedCount: uploadResults.filter((r) => r.uploaded).length,
    failedCount: uploadResults.filter((r) => r.action === 'failed').length,
    checkpointSkip,
    remoteSizeMatchSkip: remoteSkip,
    retriesMaxPerFile: MAX_RETRIES,
  };
  fs.writeFileSync(paths.summary, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({
    ...summary,
    failedSample: uploadResults.filter((r) => r.action === 'failed').slice(0, 10),
    summaryPath: path.relative(ROOT, paths.summary),
  }, null, 2));

  if (summary.failedCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
