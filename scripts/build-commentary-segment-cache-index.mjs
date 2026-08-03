#!/usr/bin/env node
/**
 * Build / audit permanent commentary TTS segment cache index.
 * Read-only by default. --write writes index only (never deletes segments, never calls OpenAI).
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  COMMENTARY_TYPES,
  splitParagraphs,
  buildGenerationPlan,
} from './lib/commentary-highlight-plan.mjs';
import {
  SEGMENT_CACHE_FORMAT_VERSION,
  SEGMENT_CACHE_PRESET_ID,
  COMMENTARY_TTS_REQUEST_DEFAULTS,
  HIGHLIGHT_SEGMENTS_REL,
  buildCacheKeyForText,
  expandPlanSegments,
  fileSha256,
  validateSegmentFile,
  writeSegmentCacheIndexAtomic,
  loadSegmentCacheIndex,
  lookupSegmentCache,
  withSegmentCacheLock,
  toPosixRel,
  assertSegmentCacheDeletionAllowed,
  guardedRmSync,
} from './lib/commentary-segment-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const BOOK_FILE_MAP = {
  창세기: 'genesis',
};

const BOOK_ID_TO_NAME = Object.fromEntries(
  Object.entries(BOOK_FILE_MAP).map(([name, id]) => [id, name]),
);

const SEGMENT_NAME_RE = /^unit-(\d{2})-para-(\d{2})(?:-part-(\d{2}))?\.mp3$/;

function usage() {
  console.error('Usage:');
  console.error('  node scripts/build-commentary-segment-cache-index.mjs [--locale ko-KR] [--book genesis] [--from-chapter N] [--to-chapter N]');
  console.error('Modes:');
  console.error('  (default) plan-only scan');
  console.error('  --write                 write cache index (atomic)');
  console.error('  --audit                 audit planned segments against existing index (no OpenAI)');
  console.error('  --preflight             next-book style cache hit/miss estimate from scripts');
  console.error('  --self-test-lock        concurrent lock smoke test in temp dir');
  console.error('Never deletes segments. OpenAI is never called.');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: 'genesis',
    fromChapter: 4,
    toChapter: 50,
    write: false,
    audit: false,
    preflight: false,
    selfTestLock: false,
    concurrency: 12,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--locale') args.locale = argv[++i];
    else if (arg === '--book') args.bookId = argv[++i];
    else if (arg === '--from-chapter') args.fromChapter = Number(argv[++i]);
    else if (arg === '--to-chapter') args.toChapter = Number(argv[++i]);
    else if (arg === '--write') args.write = true;
    else if (arg === '--audit') args.audit = true;
    else if (arg === '--preflight') args.preflight = true;
    else if (arg === '--self-test-lock') args.selfTestLock = true;
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (arg === '--confirm-delete-commentary-segment-cache') {
      // recognized only so guarded helpers can see it; this script never deletes.
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }

  const modeCount = [args.write, args.audit, args.preflight, args.selfTestLock].filter(Boolean).length;
  if (modeCount > 1) {
    throw new Error('--write / --audit / --preflight / --self-test-lock 중 하나만 지정하세요.');
  }
  if (!Number.isInteger(args.fromChapter) || !Number.isInteger(args.toChapter) || args.fromChapter > args.toChapter) {
    throw new Error('chapter 범위가 올바르지 않습니다.');
  }
  return args;
}

function loadCommentaryData(bookId) {
  const filePath = path.join(ROOT, `gomna_data_${bookId}.js`);
  if (!fs.existsSync(filePath)) return { ok: false, error: 'data_file_missing' };
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    window: { pastorCommentaryData: {} },
    pastorCommentaryData: {},
    commentaryData: {},
    module: { exports: {} },
    exports: {},
    console,
  };
  sandbox.module.exports = sandbox.exports;
  try {
    vm.runInNewContext(source, sandbox, { filename: filePath });
  } catch (error) {
    return { ok: false, error: `data_eval_failed:${error.message}` };
  }
  const data = Object.keys(sandbox.pastorCommentaryData || {}).length
    ? sandbox.pastorCommentaryData
    : (sandbox.window?.pastorCommentaryData
      || sandbox.module.exports?.default
      || sandbox.module.exports
      || sandbox.exports);
  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return { ok: false, error: 'data_export_invalid' };
  }
  return { ok: true, data };
}

function buildVerseKey(bookName, chapter, verse) {
  return `${bookName}_${chapter}_${verse}`;
}

function listSegmentMp3Files(locale, bookId, fromChapter, toChapter) {
  const files = [];
  const bookRoot = path.join(ROOT, HIGHLIGHT_SEGMENTS_REL, locale, bookId);
  if (!fs.existsSync(bookRoot)) return files;

  for (let chapter = fromChapter; chapter <= toChapter; chapter++) {
    const chapterDir = path.join(bookRoot, String(chapter).padStart(3, '0'));
    if (!fs.existsSync(chapterDir)) continue;
    for (const verseName of fs.readdirSync(chapterDir)) {
      const verseDir = path.join(chapterDir, verseName);
      if (!fs.statSync(verseDir).isDirectory()) continue;
      for (const typeName of fs.readdirSync(verseDir)) {
        const typeDir = path.join(verseDir, typeName);
        if (!fs.statSync(typeDir).isDirectory()) continue;
        for (const name of fs.readdirSync(typeDir)) {
          if (!name.endsWith('.mp3')) continue;
          if (name.startsWith('.')) continue;
          files.push({
            absPath: path.join(typeDir, name),
            relPath: toPosixRel(ROOT, path.join(typeDir, name)),
            locale,
            bookId,
            chapter: Number(chapter),
            verse: Number(verseName),
            type: typeName,
            fileName: name,
          });
        }
      }
    }
  }
  return files;
}

function mapExpectedSegments({ locale, bookId, fromChapter, toChapter, data }) {
  const bookName = BOOK_ID_TO_NAME[bookId];
  const expectedByRel = new Map();
  const blockers = [];
  let plannedSegmentCount = 0;

  for (let chapter = fromChapter; chapter <= toChapter; chapter++) {
    for (const typeConfig of COMMENTARY_TYPES) {
      const chapter3 = String(chapter).padStart(3, '0');
      const verseDirRoot = path.join(ROOT, 'tts-scripts', locale, bookId, chapter3);
      if (!fs.existsSync(verseDirRoot)) continue;

      for (const verseName of fs.readdirSync(verseDirRoot)) {
        const verse = Number(verseName);
        if (!Number.isInteger(verse)) continue;
        const txtPath = path.join(verseDirRoot, verseName, `${typeConfig.type}.txt`);
        if (!fs.existsSync(txtPath) || fs.statSync(txtPath).size <= 0) continue;

        const paragraphs = splitParagraphs(fs.readFileSync(txtPath, 'utf8'));
        const verseKey = buildVerseKey(bookName, chapter, verse);
        const entry = data[verseKey];
        const rows = entry?.[typeConfig.tableKey];
        if (!Array.isArray(rows)) {
          blockers.push({ audioId: `${bookId}.${chapter3}.${String(verse).padStart(3, '0')}.${typeConfig.type}`, reason: 'commentary_rows_missing' });
          continue;
        }

        const plan = buildGenerationPlan({
          typeConfig,
          paragraphs,
          rowCount: rows.length,
          rows,
          bookId,
          chapter,
          verse,
        });
        if (!plan) {
          blockers.push({ audioId: `${bookId}.${chapter3}.${String(verse).padStart(3, '0')}.${typeConfig.type}`, reason: 'paragraph_plan_mismatch' });
          continue;
        }

        const audioId = `${bookId}.${chapter3}.${String(verse).padStart(3, '0')}.${typeConfig.type}`;
        const segments = expandPlanSegments(plan, paragraphs);
        plannedSegmentCount += segments.length;
        for (const segment of segments) {
          const relPath = path.posix.join(
            HIGHLIGHT_SEGMENTS_REL,
            locale,
            bookId,
            chapter3,
            String(verse).padStart(3, '0'),
            typeConfig.type,
            segment.fileName,
          );
          const keyInfo = buildCacheKeyForText(segment.text, { locale });
          expectedByRel.set(relPath, {
            ...segment,
            ...keyInfo,
            audioId,
            locale,
            bookId,
            chapter,
            verse,
            type: typeConfig.type,
            kind: segment.kind,
            relPath,
          });
        }
      }
    }
  }

  return { expectedByRel, plannedSegmentCount, blockers };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => run());
  await Promise.all(runners);
  return results;
}

async function buildIndex(args) {
  const dataResult = loadCommentaryData(args.bookId);
  if (!dataResult.ok) throw new Error(dataResult.error);

  const segmentFiles = listSegmentMp3Files(args.locale, args.bookId, args.fromChapter, args.toChapter);
  const { expectedByRel, plannedSegmentCount, blockers } = mapExpectedSegments({
    locale: args.locale,
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    data: dataResult.data,
  });

  const reportDir = path.join(ROOT, 'reports', 'commentary-segment-cache');
  fs.mkdirSync(reportDir, { recursive: true });
  const usagePath = path.join(reportDir, `${args.bookId}-segment-cache-usage.jsonl`);
  const unmappedPath = path.join(reportDir, `${args.bookId}-segment-cache-unmapped.jsonl`);
  const summaryPath = path.join(reportDir, `${args.bookId}-segment-cache-summary.json`);

  const usageFd = fs.openSync(usagePath, 'w');
  const unmappedFd = fs.openSync(unmappedPath, 'w');

  let zeroByte = 0;
  let ffprobeFail = 0;
  let mappedFiles = 0;
  let unmappedFiles = 0;
  let totalBytes = 0;
  let totalDuration = 0;

  const byKey = new Map();
  const textHashCounts = new Map();
  const audioHashCounts = new Map();

  const validations = await mapPool(segmentFiles, args.concurrency, async (file) => {
    const size = fs.statSync(file.absPath).size;
    if (size <= 0) return { file, ok: false, reason: 'zero_byte', size };
    try {
      const validation = validateSegmentFile(file.absPath);
      if (!validation.ok) return { file, ok: false, reason: validation.reason, size, error: validation.error };
      const audioSha256 = fileSha256(file.absPath);
      return { file, ok: true, size, validation, audioSha256 };
    } catch (error) {
      return { file, ok: false, reason: 'validate_exception', size, error: error.message };
    }
  });

  for (const item of validations) {
    totalBytes += item.size || 0;
    if (!item.ok) {
      if (item.reason === 'zero_byte') zeroByte += 1;
      if (item.reason === 'ffprobe_failed' || item.reason === 'validate_exception') ffprobeFail += 1;
      unmappedFiles += 1;
      fs.writeSync(unmappedFd, `${JSON.stringify({
        path: item.file.relPath,
        reason: item.reason,
        error: item.error || null,
      })}\n`);
      continue;
    }

    const expected = expectedByRel.get(item.file.relPath);
    if (!expected) {
      // filename parse fallback — still unmapped if plan didn't expect it
      const match = SEGMENT_NAME_RE.exec(item.file.fileName);
      unmappedFiles += 1;
      fs.writeSync(unmappedFd, `${JSON.stringify({
        path: item.file.relPath,
        reason: 'unmapped_no_plan',
        parsed: match ? {
          unitIndex: Number(match[1]),
          paragraphIndex: Number(match[2]),
          textIndex: match[3] != null ? Number(match[3]) : null,
        } : null,
      })}\n`);
      continue;
    }

    mappedFiles += 1;
    totalDuration += item.validation.duration;
    textHashCounts.set(expected.normalizedTextHash, (textHashCounts.get(expected.normalizedTextHash) || 0) + 1);
    audioHashCounts.set(item.audioSha256, (audioHashCounts.get(item.audioSha256) || 0) + 1);

    const source = {
      audioId: expected.audioId,
      path: item.file.relPath,
      kind: expected.kind,
      unitIndex: expected.unitIndex,
      textIndex: expected.textIndex,
      paragraphIndex: expected.paragraphIndex,
      normalizedTextHash: expected.normalizedTextHash,
      audioSha256: item.audioSha256,
      duration: item.validation.duration,
      fileSize: item.size,
    };
    fs.writeSync(usageFd, `${JSON.stringify({
      key: expected.key,
      ...source,
      textPreview: expected.signature.text.slice(0, 120),
    })}\n`);

    if (!byKey.has(expected.key)) {
      byKey.set(expected.key, {
        key: expected.key,
        formatVersion: SEGMENT_CACHE_FORMAT_VERSION,
        normalizedTextHash: expected.normalizedTextHash,
        locale: args.locale,
        model: COMMENTARY_TTS_REQUEST_DEFAULTS.model,
        voice: COMMENTARY_TTS_REQUEST_DEFAULTS.voice,
        presetId: SEGMENT_CACHE_PRESET_ID,
        instructionsHash: expected.instructionsHash,
        responseFormat: COMMENTARY_TTS_REQUEST_DEFAULTS.responseFormat,
        sampleRate: item.validation.sampleRate,
        channels: item.validation.channels,
        bitrate: item.validation.bitrate,
        existingSegmentPath: item.file.relPath,
        audioSha256: item.audioSha256,
        fileSize: item.size,
        duration: item.validation.duration,
        sourceCount: 1,
        canonicalAudioId: expected.audioId,
        kind: expected.kind,
        duplicates: [],
      });
    } else {
      const canonical = byKey.get(expected.key);
      canonical.sourceCount += 1;
      canonical.duplicates.push({
        path: item.file.relPath,
        audioId: expected.audioId,
        audioSha256: item.audioSha256,
        fileSize: item.size,
      });
      // Prefer lexicographically smaller path as stable canonical; never delete others.
      if (item.file.relPath < canonical.existingSegmentPath) {
        canonical.duplicates.push({
          path: canonical.existingSegmentPath,
          audioId: canonical.canonicalAudioId,
          audioSha256: canonical.audioSha256,
          fileSize: canonical.fileSize,
        });
        // Remove the just-pushed self-dup of new canonical
        canonical.duplicates = canonical.duplicates.filter((dup) => dup.path !== item.file.relPath);
        canonical.existingSegmentPath = item.file.relPath;
        canonical.audioSha256 = item.audioSha256;
        canonical.fileSize = item.size;
        canonical.duration = item.validation.duration;
        canonical.canonicalAudioId = expected.audioId;
        canonical.sampleRate = item.validation.sampleRate;
        canonical.channels = item.validation.channels;
        canonical.bitrate = item.validation.bitrate;
      }
    }
  }

  fs.closeSync(usageFd);
  fs.closeSync(unmappedFd);

  const entries = [...byKey.values()].map((entry) => {
    const { duplicates, ...rest } = entry;
    return rest;
  });

  const exactTextDuplicateCount = [...textHashCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + (count - 1), 0);
  const exactAudioDuplicateCount = [...audioHashCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + (count - 1), 0);
  const duplicateRequestCount = entries.reduce((sum, entry) => sum + Math.max(0, entry.sourceCount - 1), 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    locale: args.locale,
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    totalSegmentFiles: segmentFiles.length,
    validSegmentFiles: mappedFiles + (segmentFiles.length - mappedFiles - unmappedFiles) < 0
      ? mappedFiles
      : segmentFiles.length - zeroByte - ffprobeFail,
    mappedSegmentFiles: mappedFiles,
    unmappedSegmentFiles: unmappedFiles,
    zeroByteFiles: zeroByte,
    ffprobeFailFiles: ffprobeFail,
    uniqueRequestKeys: entries.length,
    duplicateRequestCount,
    exactTextDuplicateCount,
    exactAudioDuplicateCount,
    reusableSegmentCount: entries.length,
    reusableBytes: entries.reduce((sum, entry) => sum + entry.fileSize, 0),
    totalBytes,
    totalDuration,
    potentialAvoidedCalls: duplicateRequestCount,
    plannedSegmentCount,
    planBlockers: blockers.length,
    openaiCalls: 0,
    writeEnabled: Boolean(args.write),
    cacheIndexPath: toPosixRel(ROOT, path.join(ROOT, 'audio', 'commentary-segment-cache', args.locale)),
    reports: {
      summary: toPosixRel(ROOT, summaryPath),
      usage: toPosixRel(ROOT, usagePath),
      unmapped: toPosixRel(ROOT, unmappedPath),
    },
    blockers: blockers.slice(0, 50),
    cacheKeyFields: [
      'formatVersion',
      'locale',
      'model',
      'voice',
      'presetId',
      'instructionsHash',
      'responseFormat',
      'sampleRate',
      'channels',
      'bitrate',
      'normalizedText',
    ],
  };

  // Fix validSegmentFiles accurately
  summary.validSegmentFiles = segmentFiles.length - zeroByte - ffprobeFail;

  if (args.write) {
    if (entries.length === 0) throw new Error('no_mapped_entries_to_write');
    const writeResult = writeSegmentCacheIndexAtomic(ROOT, args.locale, {
      meta: {
        formatVersion: SEGMENT_CACHE_FORMAT_VERSION,
        locale: args.locale,
        bookId: args.bookId,
        fromChapter: args.fromChapter,
        toChapter: args.toChapter,
        presetId: SEGMENT_CACHE_PRESET_ID,
        model: COMMENTARY_TTS_REQUEST_DEFAULTS.model,
        voice: COMMENTARY_TTS_REQUEST_DEFAULTS.voice,
        instructionsHash: buildCacheKeyForText('probe', { locale: args.locale }).instructionsHash,
        source: 'audio/highlight-segments (immutable paths)',
        notes: 'Canonical paths point at existing highlight-segments files; duplicates are retained on disk.',
      },
      entries,
    });
    summary.indexWrite = {
      uniqueRequestKeys: writeResult.meta.uniqueRequestKeys,
      metaPath: toPosixRel(ROOT, path.join(ROOT, 'audio', 'commentary-segment-cache', args.locale, 'meta.json')),
    };

    const verify = loadSegmentCacheIndex(ROOT, args.locale);
    if (!verify.ok) throw new Error(`post_write_verify_failed:${verify.reason}`);
    if (verify.entryCount !== entries.length) {
      throw new Error(`post_write_count_mismatch:${verify.entryCount}!=${entries.length}`);
    }
    summary.indexVerify = { ok: true, entryCount: verify.entryCount };
  }

  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function auditOrPreflight(args) {
  const dataResult = loadCommentaryData(args.bookId);
  if (!dataResult.ok) throw new Error(dataResult.error);

  const loaded = loadSegmentCacheIndex(ROOT, args.locale);
  const { expectedByRel, plannedSegmentCount, blockers } = mapExpectedSegments({
    locale: args.locale,
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    data: dataResult.data,
  });

  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let introHits = 0;
  let itemHits = 0;
  let closingHits = 0;
  let otherHits = 0;
  let newInputCharacters = 0;
  const missSamples = [];

  for (const expected of expectedByRel.values()) {
    let lookup = loaded.ok
      ? lookupSegmentCache(ROOT, args.locale, expected.key, { index: loaded, skipValidate: true })
      : { hit: false, reason: loaded.reason };

    // Audit validates existence/size for every hit; full ffprobe was already done at index write.
    if (lookup.hit) {
      const absPath = lookup.absPath;
      if (!fs.existsSync(absPath) || fs.statSync(absPath).size <= 0) {
        lookup = { hit: false, reason: 'stale_missing_or_zero', entry: lookup.entry, absPath };
      }
    }

    if (lookup.hit) {
      cacheHitCount += 1;
      if (expected.kind === 'intro') introHits += 1;
      else if (expected.kind === 'item') itemHits += 1;
      else if (expected.kind === 'closing') closingHits += 1;
      else otherHits += 1;
    } else {
      cacheMissCount += 1;
      newInputCharacters += expected.signature.text.length;
      if (missSamples.length < 50) {
        missSamples.push({
          key: expected.key,
          audioId: expected.audioId,
          path: expected.relPath,
          kind: expected.kind,
          reason: lookup.reason,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.audit ? 'audit' : 'preflight',
    locale: args.locale,
    bookId: args.bookId,
    fromChapter: args.fromChapter,
    toChapter: args.toChapter,
    cacheIndexOk: loaded.ok,
    cacheIndexReason: loaded.ok ? null : loaded.reason,
    totalSegments: plannedSegmentCount,
    mappedPlanSegments: expectedByRel.size,
    cacheHitCount,
    cacheMissCount,
    cacheHitRate: plannedSegmentCount ? cacheHitCount / plannedSegmentCount : 0,
    expectedNewTtsCalls: cacheMissCount,
    expectedReusedCalls: cacheHitCount,
    totalNewInputCharacters: newInputCharacters,
    introCacheHits: introHits,
    itemCacheHits: itemHits,
    closingCacheHits: closingHits,
    otherCacheHits: otherHits,
    planBlockers: blockers.length,
    openaiCalls: 0,
    missSamples,
    blockers: blockers.slice(0, 50),
  };

  const reportDir = path.join(ROOT, 'reports', 'commentary-segment-cache');
  fs.mkdirSync(reportDir, { recursive: true });
  const outPath = path.join(reportDir, `${args.bookId}-segment-cache-${args.audit ? 'audit' : 'preflight'}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath: toPosixRel(ROOT, outPath) }, null, 2));
  return report;
}

async function selfTestLock() {
  const tmpRoot = path.join(ROOT, 'reports', 'commentary-segment-cache', `.lock-self-test-${process.pid}`);
  fs.mkdirSync(path.join(tmpRoot, 'audio', 'commentary-segment-cache', 'locks'), { recursive: true });
  const key = 'a'.repeat(64);
  let concurrentOpenAi = 0;
  let maxConcurrent = 0;

  async function worker() {
    const result = await withSegmentCacheLock(tmpRoot, key, async () => {
      concurrentOpenAi += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentOpenAi);
      await new Promise((resolve) => setTimeout(resolve, 150));
      concurrentOpenAi -= 1;
      return 'ok';
    }, { locale: 'ko-KR', timeoutMs: 5000, pollMs: 20 });
    return result;
  }

  const results = await Promise.all([worker(), worker(), worker()]);
  guardedRmSync(tmpRoot, { recursive: true, force: true }, ROOT, ['--confirm-delete-commentary-segment-cache']);

  const report = {
    ok: maxConcurrent === 1 && results.length === 3,
    maxConcurrent,
    results: results.map((entry) => ({ acquired: entry.acquired, reused: entry.reused })),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Ensure this script cannot delete segment trees without explicit confirm (it never should).
  if (process.argv.includes('--delete-segments')) {
    assertSegmentCacheDeletionAllowed(process.argv.slice(2));
  }

  if (args.selfTestLock) {
    await selfTestLock();
    return;
  }
  if (args.audit || args.preflight) {
    await auditOrPreflight(args);
    return;
  }
  await buildIndex(args);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
