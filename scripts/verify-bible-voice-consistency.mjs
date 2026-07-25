#!/usr/bin/env node
/**
 * Read-only Bible voice consistency QA.
 *
 * Scans local bible-*.mp3 files, compares acoustic features against the
 * book-level baseline, and ranks voice-consistency outliers.
 *
 * Never modifies MP3s, manifest, R2, or TTS settings.
 * Never makes network requests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');
const REPORT_DIR = path.join(ROOT, 'reports', 'bible-voice-consistency');

const ANALYZER_VERSION = '1.0.0';

/** Minimum voiced F0 frames required for a high-confidence score. */
const MIN_VOICED_F0_FRAMES = 10;

/** Pitch frames below this Hz contribute to lowPitchRatioBelow150Hz. */
const LOW_PITCH_THRESHOLD_HZ = 150;

/** Duration buckets for reference-candidate recommendation (seconds). */
const DURATION_BUCKETS = {
  short: { maxExclusive: 4.5 },
  mid: { minInclusive: 4.5, maxExclusive: 9.0 },
  long: { minInclusive: 9.0 },
};

/** Scoring weights for voice-consistency outlier detection. */
const SCORE_WEIGHTS = {
  lowPitchZ: 1.0,
  lowPitchRatio: 6.0,
  wideIqr: 1.0,
};

const KNOWN_SUSPECT_IDS = Object.freeze(['matthew.001.006.bible']);

const DEFAULTS = Object.freeze({
  language: 'ko-KR',
  voice: 'calm',
  scoreThreshold: 3,
  top: 40,
  workers: 8,
  writeReport: false,
  dryRun: false,
});

function usage() {
  console.error(`Usage:
  node scripts/verify-bible-voice-consistency.mjs --book matthew [options]

Options:
  --book <bookId>              Required. Example: matthew
  --language <locale>          Default: ${DEFAULTS.language}
  --voice <preset>             Default: ${DEFAULTS.voice}
  --score-threshold <number>   Default: ${DEFAULTS.scoreThreshold}
  --top <number>               Default: ${DEFAULTS.top}
  --workers <number>           Default: ${DEFAULTS.workers}
  --write-report               Write JSON report under reports/bible-voice-consistency/
  --dry-run                    Collect targets and print plan only; no analysis
`);
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    language: DEFAULTS.language,
    voice: DEFAULTS.voice,
    scoreThreshold: DEFAULTS.scoreThreshold,
    top: DEFAULTS.top,
    workers: DEFAULTS.workers,
    writeReport: DEFAULTS.writeReport,
    dryRun: DEFAULTS.dryRun,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--book') {
      args.bookId = next;
      i += 1;
    } else if (arg === '--language') {
      args.language = next;
      i += 1;
    } else if (arg === '--voice') {
      args.voice = next;
      i += 1;
    } else if (arg === '--score-threshold') {
      args.scoreThreshold = Number(next);
      i += 1;
    } else if (arg === '--top') {
      args.top = Number(next);
      i += 1;
    } else if (arg === '--workers') {
      args.workers = Number(next);
      i += 1;
    } else if (arg === '--write-report') {
      args.writeReport = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId) {
    usage();
    throw new Error('--book 이 필요합니다.');
  }
  if (!Number.isFinite(args.scoreThreshold) || args.scoreThreshold < 0) {
    throw new Error('--score-threshold 는 0 이상의 숫자여야 합니다.');
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error('--top 은 1 이상의 정수여야 합니다.');
  }
  if (!Number.isInteger(args.workers) || args.workers < 1) {
    throw new Error('--workers 는 1 이상의 정수여야 합니다.');
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function buildAudioId(bookId, chapter, verse) {
  return `${bookId}.${pad3(chapter)}.${pad3(verse)}.bible`;
}

function buildLocalPath(args, chapter, verse) {
  return path.join(
    ROOT,
    'audio',
    'v1',
    args.language,
    args.bookId,
    pad3(chapter),
    pad3(verse),
    `bible-${args.voice}.mp3`,
  );
}

function collectTargets(args) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest를 찾을 수 없습니다: ${MANIFEST_PATH}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const audios = manifest.audios || {};
  const byId = new Map();
  const duplicateIds = [];

  for (const [id, entry] of Object.entries(audios)) {
    if (!entry || entry.bookId !== args.bookId) continue;
    if (entry.type && entry.type !== 'bible') continue;
    if (entry.language && entry.language !== args.language) continue;

    if (byId.has(id)) {
      duplicateIds.push(id);
      continue;
    }

    const chapter = Number(entry.chapter);
    const verse = Number(entry.verse);
    const localPath = buildLocalPath(args, chapter, verse);
    let exists = false;
    let size = null;
    let zeroByte = false;

    if (fs.existsSync(localPath)) {
      exists = true;
      size = fs.statSync(localPath).size;
      zeroByte = size === 0;
    }

    byId.set(id, {
      id,
      bookId: args.bookId,
      chapter,
      verse,
      language: args.language,
      voice: args.voice,
      localPath,
      relativePath: path.relative(ROOT, localPath),
      exists,
      size,
      zeroByte,
      missing: !exists,
      manifestFilePath: entry.filePath || null,
    });
  }

  // Also pick up any local files not present in the unique manifest set.
  const localRoot = path.join(ROOT, 'audio', 'v1', args.language, args.bookId);
  if (fs.existsSync(localRoot)) {
    const chapterDirs = fs.readdirSync(localRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const chapterName of chapterDirs) {
      const chapter = Number(chapterName);
      if (!Number.isInteger(chapter)) continue;
      const chapterPath = path.join(localRoot, chapterName);
      const verseDirs = fs.readdirSync(chapterPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const verseName of verseDirs) {
        const verse = Number(verseName);
        if (!Number.isInteger(verse)) continue;
        const localPath = buildLocalPath(args, chapter, verse);
        const id = buildAudioId(args.bookId, chapter, verse);
        if (byId.has(id)) continue;
        if (!fs.existsSync(localPath)) continue;

        const size = fs.statSync(localPath).size;
        byId.set(id, {
          id,
          bookId: args.bookId,
          chapter,
          verse,
          language: args.language,
          voice: args.voice,
          localPath,
          relativePath: path.relative(ROOT, localPath),
          exists: true,
          size,
          zeroByte: size === 0,
          missing: false,
          manifestFilePath: null,
          localOnly: true,
        });
      }
    }
  }

  const targets = [...byId.values()].sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  return {
    targets,
    duplicateIds,
    totalUniqueTargetCount: targets.length,
    localFileCount: targets.filter((t) => t.exists).length,
    zeroByteCount: targets.filter((t) => t.zeroByte).length,
    missingCount: targets.filter((t) => t.missing).length,
  };
}

const PYTHON_ANALYZER = `
import json, os, sys, subprocess
import numpy as np
from concurrent.futures import ThreadPoolExecutor

SR = 16000
WIN = int(0.040 * SR)
HOP = int(0.010 * SR)
LOW_PITCH_HZ = float(os.environ.get("VOICE_QA_LOW_PITCH_HZ", "150"))
MIN_VOICED = int(os.environ.get("VOICE_QA_MIN_VOICED", "10"))
WORKERS = int(os.environ.get("VOICE_QA_WORKERS", "8"))

def load_pcm(path):
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg_decode_failed")
    return np.frombuffer(proc.stdout, dtype=np.float32)

def analyze_one(item):
    path = item["localPath"]
    out = {
        "id": item["id"],
        "chapter": item["chapter"],
        "verse": item["verse"],
        "localPath": path,
        "relativePath": item.get("relativePath"),
        "size": item.get("size"),
    }
    try:
        x = load_pcm(path)
    except Exception as exc:
        out.update({"ok": False, "error": str(exc), "confidence": "failed"})
        return out

    n = len(x)
    duration = n / SR
    out["duration"] = round(duration, 3)

    if n < WIN * 2:
        out.update({
            "ok": False,
            "error": "too_short",
            "confidence": "low",
            "voicedFrameCount": 0,
            "voicedFrameRatio": 0.0,
        })
        return out

    frames = np.stack([x[i:i + WIN] for i in range(0, n - WIN, HOP)])
    rms = np.sqrt((frames ** 2).mean(axis=1))
    thr = max(float(rms.max()) * 0.15, 1e-4)
    voiced = rms > thr
    voiced_count = int(voiced.sum())
    voiced_ratio = float(voiced.mean()) if len(voiced) else 0.0

    lo = int(SR / 400)
    hi = int(SR / 60)
    f0s = []
    for frame in frames[voiced]:
        frame = frame - frame.mean()
        ac = np.correlate(frame, frame, mode="full")[len(frame) - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        if len(seg) == 0:
            continue
        k = int(np.argmax(seg)) + lo
        if ac[k] / ac[0] < 0.3:
            continue
        f0s.append(SR / k)

    f0 = np.asarray(f0s, dtype=np.float64)
    window = np.hanning(WIN)
    spec = np.abs(np.fft.rfft(frames * window, axis=1))
    freqs = np.fft.rfftfreq(WIN, 1 / SR)
    centroid = (spec * freqs).sum(axis=1) / np.maximum(spec.sum(axis=1), 1e-9)
    centroid_voiced = centroid[voiced] if voiced_count else np.array([])

    out.update({
        "voicedFrameCount": voiced_count,
        "voicedFrameRatio": round(voiced_ratio, 3),
        "spectralCentroidMeanHz": round(float(centroid_voiced.mean()), 1) if len(centroid_voiced) else None,
    })

    if len(f0) <= MIN_VOICED:
        out.update({
            "ok": False,
            "error": "insufficient_voiced_f0_frames",
            "confidence": "low",
            "f0FrameCount": int(len(f0)),
            "f0MedianHz": None,
            "f0MeanHz": None,
            "f0IqrHz": None,
            "lowPitchRatioBelow150Hz": None,
        })
        return out

    p25, p75 = np.percentile(f0, [25, 75])
    out.update({
        "ok": True,
        "confidence": "high",
        "f0FrameCount": int(len(f0)),
        "f0MedianHz": round(float(np.median(f0)), 1),
        "f0MeanHz": round(float(f0.mean()), 1),
        "f0IqrHz": round(float(p75 - p25), 1),
        "lowPitchRatioBelow150Hz": round(float((f0 < LOW_PITCH_HZ).mean()), 3),
    })
    return out

def main():
    payload = json.load(sys.stdin)
    items = payload["items"]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        rows = list(pool.map(analyze_one, items))
    json.dump({"rows": rows}, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
`;

function runAcousticAnalysis(targets, workers) {
  const analyzable = targets.filter((t) => t.exists && !t.zeroByte);
  if (analyzable.length === 0) {
    return { rows: [], errors: [{ error: 'no_analyzable_files' }] };
  }

  const payload = {
    items: analyzable.map((t) => ({
      id: t.id,
      chapter: t.chapter,
      verse: t.verse,
      localPath: t.localPath,
      relativePath: t.relativePath,
      size: t.size,
    })),
  };

  const result = spawnSync('python3', ['-c', PYTHON_ANALYZER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      VOICE_QA_WORKERS: String(workers),
      VOICE_QA_MIN_VOICED: String(MIN_VOICED_F0_FRAMES),
      VOICE_QA_LOW_PITCH_HZ: String(LOW_PITCH_THRESHOLD_HZ),
    },
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').slice(0, 2000);
    throw new Error(`음향 분석 실패 (python exit ${result.status}): ${detail}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`음향 분석 JSON 파싱 실패: ${error.message}`);
  }

  return { rows: parsed.rows || [], errors: [] };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function mad(values, center) {
  if (!values.length || center == null) return null;
  const deviations = values.map((v) => Math.abs(v - center));
  return median(deviations);
}

function buildBookBaseline(okRows) {
  const f0Medians = okRows.map((r) => r.f0MedianHz);
  const f0Iqrs = okRows.map((r) => r.f0IqrHz);
  const lowRatios = okRows.map((r) => r.lowPitchRatioBelow150Hz);
  const centroids = okRows
    .map((r) => r.spectralCentroidMeanHz)
    .filter((v) => Number.isFinite(v));
  const durations = okRows.map((r) => r.duration);

  const f0MedianBook = median(f0Medians);
  const madRaw = mad(f0Medians, f0MedianBook);
  const madScaled = madRaw == null ? null : madRaw * 1.4826;
  const iqrMedian = median(f0Iqrs);
  const lowRatioMedian = median(lowRatios);

  return {
    sampleCount: okRows.length,
    f0MedianHz: round1(f0MedianBook),
    f0MedianMadHz: round2(madScaled),
    f0IqrMedianHz: round1(iqrMedian),
    f0IqrP25Hz: round1(percentile(f0Iqrs, 25)),
    f0IqrP75Hz: round1(percentile(f0Iqrs, 75)),
    lowPitchRatioMedian: round3(lowRatioMedian),
    spectralCentroidMedianHz: round1(median(centroids)),
    duration: {
      min: round2(Math.min(...durations)),
      median: round2(median(durations)),
      max: round2(Math.max(...durations)),
    },
    constants: {
      minVoicedF0Frames: MIN_VOICED_F0_FRAMES,
      lowPitchThresholdHz: LOW_PITCH_THRESHOLD_HZ,
      scoreWeights: SCORE_WEIGHTS,
    },
  };
}

function computeOutlierScore(row, baseline) {
  const mad = Math.max(baseline.f0MedianMadHz || 0, 1e-6);
  const baseIqr = Math.max(baseline.f0IqrMedianHz || 0, 1e-6);
  const zLowPitch = (baseline.f0MedianHz - row.f0MedianHz) / mad;
  const lowPitchComponent = Math.max(zLowPitch, 0) * SCORE_WEIGHTS.lowPitchZ;
  const lowRatioComponent = row.lowPitchRatioBelow150Hz * SCORE_WEIGHTS.lowPitchRatio;
  const iqrComponent = (Math.max(row.f0IqrHz - baseline.f0IqrMedianHz, 0) / baseIqr)
    * SCORE_WEIGHTS.wideIqr;

  const score = lowPitchComponent + lowRatioComponent + iqrComponent;

  return {
    score: round3(score),
    zLowPitch: round2(zLowPitch),
    components: {
      lowPitchZ: round3(lowPitchComponent),
      lowPitchRatio: round3(lowRatioComponent),
      wideIqr: round3(iqrComponent),
    },
  };
}

function durationBucket(duration) {
  if (duration < DURATION_BUCKETS.short.maxExclusive) return 'short';
  if (duration < DURATION_BUCKETS.mid.maxExclusive) return 'mid';
  return 'long';
}

function isEligibleReferenceCandidate(row, baseline, tier) {
  const mad = Math.max(baseline.f0MedianMadHz || 0, 1e-6);
  const lowCap = Math.max((baseline.lowPitchRatioMedian || 0) * tier.lowRatioFactor, tier.lowRatioFloor);
  const iqrCap = (baseline.f0IqrMedianHz || Infinity) * tier.iqrFactor;

  return (
    row.confidence === 'high'
    && row.duration >= 1.5
    && row.voicedFrameRatio >= 0.5
    && Math.abs(row.f0MedianHz - baseline.f0MedianHz) <= tier.f0MadFactor * mad
    && row.lowPitchRatioBelow150Hz <= lowCap
    && row.f0IqrHz <= iqrCap
    && row.score <= tier.maxScore
  );
}

function recommendReferenceCandidates(scoredRows, baseline) {
  // Progressive tiers: prefer stricter matches, then relax only to fill each bucket.
  const tiers = [
    { f0MadFactor: 0.6, lowRatioFactor: 0.6, lowRatioFloor: 0.02, iqrFactor: 1.0, maxScore: 1.0 },
    { f0MadFactor: 1.0, lowRatioFactor: 0.8, lowRatioFloor: 0.03, iqrFactor: 1.25, maxScore: 1.5 },
    { f0MadFactor: 1.5, lowRatioFactor: 1.0, lowRatioFloor: 0.04, iqrFactor: 1.5, maxScore: 2.0 },
  ];

  const picked = [];
  const pickedIds = new Set();
  const usedChapters = new Set();

  function sortCandidates(rows) {
    return [...rows].sort((a, b) => {
      const da = Math.abs(a.f0MedianHz - baseline.f0MedianHz);
      const db = Math.abs(b.f0MedianHz - baseline.f0MedianHz);
      if (da !== db) return da - db;
      if (a.score !== b.score) return a.score - b.score;
      if (a.f0IqrHz !== b.f0IqrHz) return a.f0IqrHz - b.f0IqrHz;
      if (a.lowPitchRatioBelow150Hz !== b.lowPitchRatioBelow150Hz) {
        return a.lowPitchRatioBelow150Hz - b.lowPitchRatioBelow150Hz;
      }
      return a.chapter - b.chapter || a.verse - b.verse;
    });
  }

  function takeFromPool(bucketPool, need, preferNewChapter) {
    const taken = [];
    for (const row of bucketPool) {
      if (taken.length >= need) break;
      if (pickedIds.has(row.id)) continue;
      if (preferNewChapter && usedChapters.has(row.chapter)) continue;
      taken.push(row);
      pickedIds.add(row.id);
      usedChapters.add(row.chapter);
    }
    return taken;
  }

  for (const bucket of ['short', 'mid', 'long']) {
    let bucketPicked = [];

    for (const tier of tiers) {
      if (bucketPicked.length >= 6) break;
      const pool = sortCandidates(
        scoredRows.filter((r) => (
          durationBucket(r.duration) === bucket
          && isEligibleReferenceCandidate(r, baseline, tier)
        )),
      );

      const remaining = 6 - bucketPicked.length;
      const withNewChapter = takeFromPool(pool, remaining, true);
      bucketPicked = bucketPicked.concat(withNewChapter);

      if (bucketPicked.length < 6) {
        const stillNeeded = 6 - bucketPicked.length;
        const allowReuse = takeFromPool(pool, stillNeeded, false);
        bucketPicked = bucketPicked.concat(allowReuse);
      }
    }

    for (const row of bucketPicked.slice(0, 6)) {
      picked.push({ ...row, durationBucket: bucket, autoRecommendedOnly: true });
    }
  }

  return picked.slice(0, 18);
}

function round1(v) {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}
function round2(v) {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}
function round3(v) {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000;
}

function formatPct(ratio) {
  if (ratio == null) return '-';
  return `${(ratio * 100).toFixed(1)}%`;
}

function printSummary(summary) {
  console.log('');
  console.log(`○ 책\n${summary.bookId}`);
  console.log(`○ 고유 검사 대상\n${summary.totalUniqueTargetCount}`);
  console.log(`○ 로컬 파일 존재\n${summary.localFileCount}`);
  console.log(`○ 분석 성공\n${summary.analyzedCount}`);
  console.log(`○ 분석 실패\n${summary.failedCount}`);
  console.log(`○ 0바이트 파일\n${summary.zeroByteCount}`);
  console.log(`○ 누락 파일\n${summary.missingCount}`);
  console.log(`○ score 기준\n${summary.scoreThreshold}`);
  console.log(`○ 의심 구절 수\n${summary.suspiciousCount}`);
  console.log(`○ 마태복음 1:6 순위\n${summary.knownSuspectRank ?? 'N/A'}`);
  console.log(`○ 마태복음 1:6 점수\n${summary.knownSuspectScore ?? 'N/A'}`);
  console.log(`○ 보고서 경로\n${summary.reportPath || '(미저장)'}`);
  console.log('');
  console.log('상위 의심 구절 15개');
  console.log(
    [
      '순위'.padStart(4),
      'ID'.padEnd(26),
      '길이'.padStart(6),
      'f0중앙'.padStart(7),
      '저음비율'.padStart(8),
      'f0IQR'.padStart(7),
      'score'.padStart(7),
    ].join('  '),
  );

  for (const row of summary.top15) {
    console.log(
      [
        String(row.rank).padStart(4),
        row.id.padEnd(26),
        row.duration.toFixed(2).padStart(6),
        String(row.f0MedianHz).padStart(7),
        formatPct(row.lowPitchRatioBelow150Hz).padStart(8),
        String(row.f0IqrHz).padStart(7),
        String(row.score).padStart(7),
      ].join('  '),
    );
  }
  console.log('');
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const fileName = `${buildTimestamp()}-${report.bookId}-voice-consistency.json`;
  const reportPath = path.join(REPORT_DIR, fileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

function assertTooling() {
  for (const bin of ['ffmpeg', 'ffprobe', 'python3']) {
    const check = spawnSync(bin, bin === 'python3' ? ['--version'] : ['-version'], {
      encoding: 'utf8',
    });
    // ffmpeg/ffprobe print version to stderr and may use exit 0.
    if (check.error) {
      throw new Error(`${bin} 을(를) 찾을 수 없습니다.`);
    }
  }

  const pyCheck = spawnSync(
    'python3',
    ['-c', 'import numpy; import scipy; print("ok")'],
    { encoding: 'utf8' },
  );
  if (pyCheck.status !== 0) {
    throw new Error(`python3 numpy/scipy 사용 불가: ${(pyCheck.stderr || '').slice(0, 400)}`);
  }
}

function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));

  assertTooling();

  const collection = collectTargets(args);
  if (args.dryRun) {
    console.log('');
    console.log('○ dry-run');
    console.log(`책: ${args.bookId}`);
    console.log(`고유 검사 대상: ${collection.totalUniqueTargetCount}`);
    console.log(`로컬 파일 존재: ${collection.localFileCount}`);
    console.log(`0바이트 파일: ${collection.zeroByteCount}`);
    console.log(`누락 파일: ${collection.missingCount}`);
    console.log(`중복 ID: ${collection.duplicateIds.length}`);
    console.log(`workers: ${args.workers}`);
    console.log(`score-threshold: ${args.scoreThreshold}`);
    console.log('분석은 실행하지 않았습니다.');
    console.log('');
    return;
  }

  const analysisStarted = Date.now();
  const { rows, errors } = runAcousticAnalysis(collection.targets, args.workers);
  const analysisElapsedMs = Date.now() - analysisStarted;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const enriched = [];
  const failed = [];

  for (const target of collection.targets) {
    if (target.missing) {
      failed.push({
        id: target.id,
        error: 'missing_local_file',
        confidence: 'failed',
        relativePath: target.relativePath,
      });
      continue;
    }
    if (target.zeroByte) {
      failed.push({
        id: target.id,
        error: 'zero_byte_file',
        confidence: 'failed',
        relativePath: target.relativePath,
      });
      continue;
    }

    const row = byId.get(target.id);
    if (!row) {
      failed.push({
        id: target.id,
        error: 'analysis_row_missing',
        confidence: 'failed',
        relativePath: target.relativePath,
      });
      continue;
    }

    if (!row.ok) {
      failed.push({
        id: target.id,
        error: row.error || 'analysis_failed',
        confidence: row.confidence || 'failed',
        duration: row.duration ?? null,
        voicedFrameCount: row.voicedFrameCount ?? null,
        relativePath: target.relativePath,
      });
      continue;
    }

    enriched.push({
      id: target.id,
      chapter: target.chapter,
      verse: target.verse,
      relativePath: target.relativePath,
      localPath: target.localPath,
      size: target.size,
      duration: row.duration,
      voicedFrameCount: row.voicedFrameCount,
      voicedFrameRatio: row.voicedFrameRatio,
      f0FrameCount: row.f0FrameCount,
      f0MedianHz: row.f0MedianHz,
      f0MeanHz: row.f0MeanHz,
      f0IqrHz: row.f0IqrHz,
      lowPitchRatioBelow150Hz: row.lowPitchRatioBelow150Hz,
      spectralCentroidMeanHz: row.spectralCentroidMeanHz,
      confidence: row.confidence,
    });
  }

  const baseline = buildBookBaseline(enriched);
  const scored = enriched.map((row) => {
    const scoredParts = computeOutlierScore(row, baseline);
    return {
      ...row,
      ...scoredParts,
      label: 'voice consistency outlier candidate',
      labelKo: '기준 목소리와의 일관성 의심 후보',
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  scored.forEach((row, index) => {
    row.rank = index + 1;
  });

  const suspicious = scored.filter((row) => row.score >= args.scoreThreshold);
  const topN = scored.slice(0, args.top);
  const top15 = scored.slice(0, 15).map((row) => ({
    rank: row.rank,
    id: row.id,
    duration: row.duration,
    f0MedianHz: row.f0MedianHz,
    lowPitchRatioBelow150Hz: row.lowPitchRatioBelow150Hz,
    f0IqrHz: row.f0IqrHz,
    score: row.score,
  }));

  const referenceCandidates = recommendReferenceCandidates(scored, baseline)
    .map((row) => ({
      id: row.id,
      chapter: row.chapter,
      verse: row.verse,
      duration: row.duration,
      durationBucket: row.durationBucket,
      f0MedianHz: row.f0MedianHz,
      f0IqrHz: row.f0IqrHz,
      lowPitchRatioBelow150Hz: row.lowPitchRatioBelow150Hz,
      voicedFrameRatio: row.voicedFrameRatio,
      score: row.score,
      relativePath: row.relativePath,
      autoRecommendedOnly: true,
      approvedByHuman: false,
      note: '자동 추천일 뿐이며, 대표 청취 승인 전까지 기준 파일로 사용하지 말 것',
    }));

  const knownSuspectResult = KNOWN_SUSPECT_IDS.map((id) => {
    const row = scored.find((r) => r.id === id) || failed.find((r) => r.id === id) || null;
    if (!row) {
      return { id, found: false };
    }
    if (!row.score && row.score !== 0) {
      return {
        id,
        found: true,
        analyzed: false,
        error: row.error || null,
        confidence: row.confidence || null,
      };
    }
    return {
      id,
      found: true,
      analyzed: true,
      rank: row.rank,
      score: row.score,
      duration: row.duration,
      f0MedianHz: row.f0MedianHz,
      f0MeanHz: row.f0MeanHz,
      f0IqrHz: row.f0IqrHz,
      lowPitchRatioBelow150Hz: row.lowPitchRatioBelow150Hz,
      spectralCentroidMeanHz: row.spectralCentroidMeanHz,
      voicedFrameRatio: row.voicedFrameRatio,
      zLowPitch: row.zLowPitch,
      components: row.components,
      relativePath: row.relativePath,
      labelKo: '기준 목소리와의 일관성 의심 기준 파일',
    };
  });

  const knownMatthew16 = knownSuspectResult.find((r) => r.id === 'matthew.001.006.bible');

  const report = {
    generatedAt: new Date().toISOString(),
    bookId: args.bookId,
    language: args.language,
    voice: args.voice,
    analyzerVersion: ANALYZER_VERSION,
    host: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
    },
    inputOptions: {
      book: args.bookId,
      language: args.language,
      voice: args.voice,
      scoreThreshold: args.scoreThreshold,
      top: args.top,
      workers: args.workers,
      writeReport: args.writeReport,
      dryRun: args.dryRun,
    },
    totalUniqueTargetCount: collection.totalUniqueTargetCount,
    localFileCount: collection.localFileCount,
    analyzedCount: enriched.length,
    failedCount: failed.length,
    missingCount: collection.missingCount,
    zeroByteCount: collection.zeroByteCount,
    duplicateIdCount: collection.duplicateIds.length,
    duplicateIds: collection.duplicateIds,
    bookBaseline: baseline,
    scoreThreshold: args.scoreThreshold,
    suspiciousCount: suspicious.length,
    suspiciousEntries: suspicious.slice(0, args.top).map((row) => ({
      rank: row.rank,
      id: row.id,
      chapter: row.chapter,
      verse: row.verse,
      duration: row.duration,
      f0MedianHz: row.f0MedianHz,
      f0MeanHz: row.f0MeanHz,
      f0IqrHz: row.f0IqrHz,
      lowPitchRatioBelow150Hz: row.lowPitchRatioBelow150Hz,
      spectralCentroidMeanHz: row.spectralCentroidMeanHz,
      voicedFrameRatio: row.voicedFrameRatio,
      score: row.score,
      zLowPitch: row.zLowPitch,
      components: row.components,
      relativePath: row.relativePath,
      label: row.label,
      labelKo: row.labelKo,
    })),
    referenceCandidateEntries: referenceCandidates,
    knownSuspectResult,
    analysisElapsedMs,
    totalElapsedMs: Date.now() - startedAt,
    errors: [
      ...errors,
      ...failed.map((f) => ({ id: f.id, error: f.error, confidence: f.confidence })),
    ],
  };

  let reportPath = null;
  if (args.writeReport) {
    reportPath = writeReport(report);
  }

  printSummary({
    bookId: args.bookId,
    totalUniqueTargetCount: collection.totalUniqueTargetCount,
    localFileCount: collection.localFileCount,
    analyzedCount: enriched.length,
    failedCount: failed.length,
    zeroByteCount: collection.zeroByteCount,
    missingCount: collection.missingCount,
    scoreThreshold: args.scoreThreshold,
    suspiciousCount: suspicious.length,
    knownSuspectRank: knownMatthew16?.rank ?? null,
    knownSuspectScore: knownMatthew16?.score ?? null,
    reportPath,
    top15,
  });

  console.log(`○ 검사 소요 시간\n${((Date.now() - startedAt) / 1000).toFixed(1)}s (분석 ${ (analysisElapsedMs / 1000).toFixed(1)}s)`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
