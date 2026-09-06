#!/usr/bin/env node
/**
 * Commentary audio QA for a scoped book/chapter/verse range.
 * Read-only: never calls OpenAI, never writes MP3/cue/manifest/R2.
 *
 * Modes:
 * - legacy: genesis 1–2 deployment sample — cue gaps are warnings
 * - strict: chapter 3+ — missing cue/MP3 fails QA
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { COMMENTARY_TYPES } from './lib/commentary-type-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'audio', 'audio-manifest.json');

const BOOK_NAMES = {
  genesis: '창세기',
  exodus: '출애굽기',
};

const TYPE_LIST = COMMENTARY_TYPES.map((item) => ({
  type: item.type,
  voicePreset: item.voicePreset,
  tableKey: item.tableKey,
}));

function usage() {
  console.error('Usage: node scripts/verify-commentary-audio-qa.mjs --locale ko-KR --book genesis --chapter 1 --from-verse 1 --to-verse 31 [--mode legacy|strict|auto]');
  console.error('Read-only QA. --dry-run is accepted for pipeline compatibility.');
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function parseArgs(argv) {
  const args = {
    locale: 'ko-KR',
    bookId: null,
    chapter: null,
    fromVerse: null,
    toVerse: null,
    mode: 'auto',
    dryRun: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--locale' || arg === '--language') {
      args.locale = argv[++i];
    } else if (arg === '--book') {
      args.bookId = argv[++i];
    } else if (arg === '--chapter') {
      args.chapter = Number(argv[++i]);
    } else if (arg === '--from-verse') {
      args.fromVerse = Number(argv[++i]);
    } else if (arg === '--to-verse') {
      args.toVerse = Number(argv[++i]);
    } else if (arg === '--verse') {
      const verse = Number(argv[++i]);
      args.fromVerse = verse;
      args.toVerse = verse;
    } else if (arg === '--mode') {
      args.mode = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (!args.bookId || !Number.isInteger(args.chapter) || !Number.isInteger(args.fromVerse) || !Number.isInteger(args.toVerse)) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }
  if (args.fromVerse > args.toVerse) {
    throw new Error('--from-verse는 --to-verse보다 클 수 없습니다.');
  }
  if (!['auto', 'legacy', 'strict'].includes(args.mode)) {
    throw new Error('--mode는 auto|legacy|strict 중 하나여야 합니다.');
  }

  return args;
}

function resolveMode(args) {
  if (args.mode !== 'auto') return args.mode;
  if (args.bookId === 'genesis' && args.chapter <= 2) return 'legacy';
  return 'strict';
}

function loadPastorCommentaryData(bookId) {
  const filePath = path.join(ROOT, `gomna_data_${bookId}.js`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`말씀풀이 데이터 파일이 없습니다: gomna_data_${bookId}.js`);
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = { pastorCommentaryData: {} };
  vm.runInNewContext(source, sandbox, { filename: path.basename(filePath) });
  return sandbox.pastorCommentaryData;
}

function loadManifestAudios() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('audio/audio-manifest.json이 없습니다.');
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return manifest.audios || {};
}

function buildAudioId(bookId, chapter, verse, type) {
  return `${bookId}.${pad3(chapter)}.${pad3(verse)}.${type}`;
}

function scriptPath(args, verse, type) {
  return path.join(ROOT, 'tts-scripts', args.locale, args.bookId, pad3(args.chapter), pad3(verse), `${type}.txt`);
}

function mp3Path(args, verse, type, voicePreset) {
  return path.join(
    ROOT,
    'audio',
    'v1',
    args.locale,
    args.bookId,
    pad3(args.chapter),
    pad3(verse),
    `${type}-${voicePreset}.mp3`,
  );
}

function cuePath(args, verse, type) {
  return path.join(ROOT, 'audio', 'cues', args.locale, args.bookId, pad3(args.chapter), pad3(verse), `${type}.json`);
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function checkFfprobeBinary() {
  const result = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    return { ok: false, reason: 'ffprobe_not_found' };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `ffprobe_version_failed:status=${result.status ?? 'null'}`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * Probe MP3 duration. Never throws; always returns a structured result.
 */
function probeMp3Duration(absolutePath) {
  const mp3PathRel = toRelativePath(absolutePath);
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', absolutePath],
    { encoding: 'utf8' },
  );

  if (result.error && result.error.code === 'ENOENT') {
    return {
      ok: false,
      duration: null,
      mp3Path: mp3PathRel,
      reason: 'ffprobe_not_found',
    };
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim().slice(0, 200);
    return {
      ok: false,
      duration: null,
      mp3Path: mp3PathRel,
      reason: `ffprobe_exec_failed:status=${result.status ?? 'null'}${stderr ? `;stderr=${stderr}` : ''}`,
    };
  }

  const value = Number(String(result.stdout || '').trim());
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      duration: null,
      mp3Path: mp3PathRel,
      reason: 'ffprobe_duration_not_numeric',
    };
  }
  if (value <= 0) {
    return {
      ok: false,
      duration: value,
      mp3Path: mp3PathRel,
      reason: 'ffprobe_duration_not_positive',
    };
  }

  return {
    ok: true,
    duration: value,
    mp3Path: mp3PathRel,
    reason: null,
  };
}

function formatProbeIssue({ audioId, mp3Path, reason, mode }) {
  return `ffprobe_duration_unverified:audioId=${audioId};mp3=${mp3Path};reason=${reason};mode=${mode}`;
}

function validateCueDocument(cue, mp3Duration) {
  const errors = [];
  if (!cue || typeof cue !== 'object') {
    return ['cue_not_object'];
  }
  if (!Array.isArray(cue.segments) || cue.segments.length === 0) {
    errors.push('cue_segments_empty');
    return errors;
  }

  let previousStart = -Infinity;
  let maxEnd = 0;
  for (let i = 0; i < cue.segments.length; i++) {
    const seg = cue.segments[i] || {};
    const start = Number(seg.start);
    const end = Number(seg.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push(`cue_non_finite@${i}`);
      continue;
    }
    if (start < 0) errors.push(`cue_start_negative@${i}`);
    if (end <= start) errors.push(`cue_end_lte_start@${i}`);
    if (start < previousStart) errors.push(`cue_not_ascending@${i}`);
    previousStart = start;
    if (end > maxEnd) maxEnd = end;
  }

  const declaredDuration = Number(cue.duration ?? cue.finalMp3Duration ?? cue.measuredDuration);
  if (Number.isFinite(mp3Duration) && maxEnd > mp3Duration + 0.05) {
    errors.push('cue_end_exceeds_mp3_duration');
  }
  if (Number.isFinite(declaredDuration) && Number.isFinite(mp3Duration) && Math.abs(declaredDuration - mp3Duration) > 0.05) {
    errors.push('cue_duration_mismatch_mp3');
  }

  return errors;
}

function inspectTarget(args, mode) {
  const bookName = BOOK_NAMES[args.bookId];
  if (!bookName) {
    throw new Error(`지원하지 않는 bookId입니다: ${args.bookId}`);
  }

  const commentaryData = loadPastorCommentaryData(args.bookId);
  const audios = loadManifestAudios();
  const failures = [];
  const warnings = [];
  const seenAudioIds = new Set();
  let duplicateAudioIds = 0;

  let verseCount = 0;
  let dataOk = 0;
  let scriptOk = 0;
  let mp3Ok = 0;
  let cueOk = 0;
  let manifestOk = 0;
  let publishedOk = 0;
  let durationOk = 0;
  let fileSizeOk = 0;
  let zeroByteMp3 = 0;
  let cueStructureErrors = 0;
  let cueLegacyWarnings = 0;
  let durationVerifiedOk = 0;
  let durationUnverifiedCount = 0;

  const ffprobeBinary = checkFfprobeBinary();
  if (!ffprobeBinary.ok) {
    const message = formatProbeIssue({
      audioId: '*',
      mp3Path: '(n/a)',
      reason: ffprobeBinary.reason,
      mode,
    });
    if (mode === 'strict') {
      failures.push(message);
    } else {
      warnings.push(message);
    }
  }

  const verseReports = [];

  for (let verse = args.fromVerse; verse <= args.toVerse; verse++) {
    verseCount += 1;
    const dataKey = `${bookName}_${args.chapter}_${verse}`;
    const data = commentaryData[dataKey];
    const typeReports = [];

    if (!data) {
      failures.push(`data_missing:${dataKey}`);
    }

    for (const typeConfig of TYPE_LIST) {
      const audioId = buildAudioId(args.bookId, args.chapter, verse, typeConfig.type);
      if (seenAudioIds.has(audioId)) {
        duplicateAudioIds += 1;
        failures.push(`audio_id_duplicate:${audioId}`);
      }
      seenAudioIds.add(audioId);

      const row = {
        audioId,
        type: typeConfig.type,
        dataPresent: false,
        scriptPresent: false,
        mp3Present: false,
        mp3ZeroByte: false,
        cuePresent: false,
        manifestPresent: false,
        published: false,
        durationPositive: false,
        fileSizePositive: false,
        cueErrors: [],
        cueWarnings: [],
      };

      if (data && Array.isArray(data[typeConfig.tableKey]) && data[typeConfig.tableKey].length > 0) {
        row.dataPresent = true;
        dataOk += 1;
      } else if (data) {
        failures.push(`data_table_empty:${dataKey}:${typeConfig.tableKey}`);
      }

      const scriptAbs = scriptPath(args, verse, typeConfig.type);
      if (fs.existsSync(scriptAbs) && fs.statSync(scriptAbs).size > 0) {
        row.scriptPresent = true;
        scriptOk += 1;
      } else {
        failures.push(`script_missing:${audioId}`);
      }

      const mp3Abs = mp3Path(args, verse, typeConfig.type, typeConfig.voicePreset);
      if (fs.existsSync(mp3Abs)) {
        row.mp3Present = true;
        const size = fs.statSync(mp3Abs).size;
        if (size <= 0) {
          row.mp3ZeroByte = true;
          zeroByteMp3 += 1;
          failures.push(`mp3_zero_byte:${audioId}`);
        } else {
          mp3Ok += 1;
        }
      } else {
        failures.push(`mp3_missing:${audioId}`);
      }

      const entry = audios[audioId];
      if (entry) {
        row.manifestPresent = true;
        manifestOk += 1;
        if (entry.status === 'published') {
          row.published = true;
          publishedOk += 1;
        } else {
          failures.push(`manifest_not_published:${audioId}:${entry.status}`);
        }
        if (Number(entry.duration) > 0) {
          row.durationPositive = true;
          durationOk += 1;
        } else {
          failures.push(`manifest_duration_not_positive:${audioId}`);
        }
        if (Number(entry.fileSize) > 0) {
          row.fileSizePositive = true;
          fileSizeOk += 1;
        } else {
          failures.push(`manifest_filesize_not_positive:${audioId}`);
        }
      } else {
        failures.push(`manifest_missing:${audioId}`);
      }

      const cueAbs = cuePath(args, verse, typeConfig.type);
      if (fs.existsSync(cueAbs)) {
        row.cuePresent = true;
        try {
          const cue = JSON.parse(fs.readFileSync(cueAbs, 'utf8'));
          let mp3Duration = null;
          let durationVerified = false;

          if (row.mp3Present && !row.mp3ZeroByte) {
            const probe = probeMp3Duration(mp3Abs);
            row.mp3Probe = {
              ok: probe.ok,
              duration: probe.duration,
              reason: probe.reason,
              mp3Path: probe.mp3Path,
            };
            if (!probe.ok) {
              durationUnverifiedCount += 1;
              const probeMessage = formatProbeIssue({
                audioId,
                mp3Path: probe.mp3Path,
                reason: probe.reason,
                mode,
              });
              if (mode === 'strict') {
                failures.push(probeMessage);
              } else {
                warnings.push(probeMessage);
                cueLegacyWarnings += 1;
              }
              row.cueWarnings = [...(row.cueWarnings || []), probe.reason];
            } else {
              mp3Duration = probe.duration;
              durationVerified = true;
            }
          } else if (mode === 'strict') {
            // Cue exists but MP3 is missing/zero — duration match cannot be proven.
            durationUnverifiedCount += 1;
            const probeMessage = formatProbeIssue({
              audioId,
              mp3Path: toRelativePath(mp3Abs),
              reason: row.mp3ZeroByte ? 'mp3_zero_byte' : 'mp3_missing_for_duration_check',
              mode,
            });
            failures.push(probeMessage);
          } else {
            durationUnverifiedCount += 1;
            warnings.push(formatProbeIssue({
              audioId,
              mp3Path: toRelativePath(mp3Abs),
              reason: row.mp3ZeroByte ? 'mp3_zero_byte' : 'mp3_missing_for_duration_check',
              mode,
            }));
            cueLegacyWarnings += 1;
          }

          const cueErrors = validateCueDocument(cue, mp3Duration);
          if (cueErrors.length) {
            row.cueErrors = cueErrors;
            cueStructureErrors += 1;
            if (mode === 'legacy') {
              cueLegacyWarnings += 1;
              warnings.push(`legacy_cue_structure:${audioId}:${cueErrors.join(',')}`);
              row.cueWarnings = [...(row.cueWarnings || []), ...cueErrors];
            } else {
              failures.push(`cue_structure:${audioId}:${cueErrors.join(',')}`);
            }
          } else if (durationVerified) {
            cueOk += 1;
            durationVerifiedOk += 1;
          } else if (mode === 'legacy') {
            // Structure OK but duration was not verified — do not count as duration-complete cueOk.
            row.cueWarnings = [...(row.cueWarnings || []), 'duration_not_verified'];
          } else {
            // Strict already recorded probe failure above when durationVerified is false.
          }
        } catch (error) {
          cueStructureErrors += 1;
          const message = `cue_json_invalid:${audioId}:${error.message}`;
          if (mode === 'legacy') {
            cueLegacyWarnings += 1;
            warnings.push(message);
          } else {
            failures.push(message);
          }
        }
      } else if (mode === 'legacy') {
        cueLegacyWarnings += 1;
        warnings.push(`legacy_cue_missing:${audioId}`);
        row.cueWarnings = ['cue_missing'];
      } else {
        failures.push(`cue_missing:${audioId}`);
      }

      typeReports.push(row);
    }

    verseReports.push({
      verse,
      dataKey,
      dataPresent: Boolean(data),
      types: typeReports,
    });
  }

  const expectedTopicCount = verseCount * TYPE_LIST.length;
  const hardPass = failures.length === 0 && duplicateAudioIds === 0;
  const pass = hardPass;

  return {
    mode,
    locale: args.locale,
    bookId: args.bookId,
    chapter: args.chapter,
    fromVerse: args.fromVerse,
    toVerse: args.toVerse,
    verseCount,
    topicsPerVerse: TYPE_LIST.length,
    expectedTopicCount,
    counts: {
      dataOk,
      scriptOk,
      mp3Ok,
      cueOk,
      cueDurationVerifiedOk: durationVerifiedOk,
      cueDurationUnverifiedCount: durationUnverifiedCount,
      manifestOk,
      publishedOk,
      durationOk,
      fileSizeOk,
      zeroByteMp3,
      cueStructureErrors,
      cueLegacyWarnings,
      duplicateAudioIds,
    },
    durationVerification: {
      ffprobeAvailable: ffprobeBinary.ok,
      ffprobeReason: ffprobeBinary.reason,
      verifiedCount: durationVerifiedOk,
      unverifiedCount: durationUnverifiedCount,
      note: durationVerifiedOk > 0
        ? 'cueOk counts only cues with successful ffprobe duration verification'
        : 'no cue completed duration verification in this run',
    },
    outOfRangeFileChangesCheck: 'not-performed',
    outOfRangeNote: '범위 밖 변경은 QA가 검사하지 않습니다. 작업 종료 시 git diff --name-only로 확인하세요.',
    costNote: '비용 계산 자료 없음',
    warnings,
    failures,
    pass,
    verses: verseReports,
  };
}

function printHumanSummary(report) {
  const lines = [
    `○ QA mode: ${report.mode}`,
    `○ 대상 언어: ${report.locale}`,
    `○ 대상 책: ${report.bookId}`,
    `○ 대상 장: ${report.chapter}`,
    `○ 대상 절 수: ${report.verseCount}`,
    `○ 절마다 주제 수: ${report.topicsPerVerse}`,
    `○ 데이터: ${report.counts.dataOk}/${report.expectedTopicCount}`,
    `○ 대본: ${report.counts.scriptOk}/${report.expectedTopicCount}`,
    `○ MP3: ${report.counts.mp3Ok}/${report.expectedTopicCount}`,
    `○ cue(duration 검증 완료): ${report.counts.cueOk}/${report.expectedTopicCount}`,
    `○ cue duration 미검증: ${report.counts.cueDurationUnverifiedCount}`,
    `○ manifest: ${report.counts.manifestOk}/${report.expectedTopicCount}`,
    `○ published: ${report.counts.publishedOk}/${report.expectedTopicCount}`,
    `○ duration>0: ${report.counts.durationOk}/${report.expectedTopicCount}`,
    `○ fileSize>0: ${report.counts.fileSizeOk}/${report.expectedTopicCount}`,
    `○ MP3 0바이트: ${report.counts.zeroByteMp3}`,
    `○ cue legacy warning: ${report.counts.cueLegacyWarnings}`,
    `○ cue 구조 오류(집계): ${report.counts.cueStructureErrors}`,
    `○ audio ID 중복: ${report.counts.duplicateAudioIds}`,
    `○ ffprobe: ${report.durationVerification.ffprobeAvailable ? 'available' : `unavailable (${report.durationVerification.ffprobeReason})`}`,
    `○ 범위 밖 변경 검사: ${report.outOfRangeFileChangesCheck}`,
    `○ QA 결과: ${report.pass ? 'PASS' : 'FAIL'}`,
  ];
  console.error(lines.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveMode(args);
  const report = inspectTarget(args, mode);
  printHumanSummary(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
  }
}

main();
