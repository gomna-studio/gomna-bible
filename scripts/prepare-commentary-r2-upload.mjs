import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '..');

const TARGET = {
  bookId: 'genesis',
  chapter: 1,
  verse: 1,
  language: 'ko-KR',
};

const R2 = {
  bucket: 'gomna-bible-audio-prod',
  keyBase: 'commentary/ko/gae/genesis/001/001',
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

function usage() {
  console.error('Usage: node scripts/prepare-commentary-r2-upload.mjs --book genesis --chapter 1 --verse 1 --language ko-KR --dry-run');
  console.error('   or: node scripts/prepare-commentary-r2-upload.mjs --book genesis --chapter 1 --verse 1 --language ko-KR --upload');
  console.error('Default mode: --dry-run. Optional: --overwrite to replace existing R2 objects.');
}

function parseArgs(argv) {
  const args = {
    bookId: null,
    chapter: null,
    verse: null,
    language: null,
    overwrite: false,
    dryRun: true,
    upload: false,
  };
  let dryRunExplicit = false;
  let uploadExplicit = false;

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
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--dry-run') {
      dryRunExplicit = true;
      args.dryRun = true;
    } else if (arg === '--upload') {
      uploadExplicit = true;
      args.upload = true;
      args.dryRun = false;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
  }

  if (dryRunExplicit && uploadExplicit) {
    throw new Error('--dry-run과 --upload는 동시에 사용할 수 없습니다.');
  }

  if (!args.bookId || !args.chapter || !args.verse || !args.language) {
    usage();
    throw new Error('필수 옵션이 누락되었습니다.');
  }

  return args;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function toRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function assertTargetScope(args) {
  if (
    args.bookId !== TARGET.bookId ||
    args.chapter !== TARGET.chapter ||
    args.verse !== TARGET.verse ||
    args.language !== TARGET.language
  ) {
    throw new Error('이 스크립트는 현재 ko-KR 창세기 1장 1절 말씀풀이 9개 업로드 준비에만 사용할 수 있습니다.');
  }
}

function buildPlanItem({ args, fileName }) {
  const chapter3 = pad3(args.chapter);
  const verse3 = pad3(args.verse);
  const localPath = path.join(
    ROOT,
    'audio',
    'v1',
    args.language,
    args.bookId,
    chapter3,
    verse3,
    fileName,
  );
  const exists = fs.existsSync(localPath);
  const fileSize = exists ? fs.statSync(localPath).size : 0;
  const objectKey = `${R2.keyBase}/${fileName}`;

  return {
    fileName,
    localPath: toRelativePath(localPath),
    absoluteLocalPath: localPath,
    objectKey,
    objectPath: `${R2.bucket}/${objectKey}`,
    publicUrl: `${R2.publicBaseUrl}/${objectKey}`,
    contentType: R2.contentType,
    exists,
    fileSize,
    valid: exists && fileSize > 0,
    action: exists && fileSize > 0 ? 'upload-planned' : 'missing-or-empty',
  };
}

function toPublicItem(item, overrides = {}) {
  const {
    absoluteLocalPath,
    ...publicItem
  } = item;

  return {
    ...publicItem,
    ...overrides,
  };
}

async function getPublicUrlStatus(publicUrl) {
  const response = await fetch(publicUrl, { method: 'HEAD' });

  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    contentLength: response.headers.get('content-length') || '',
  };
}

function runWranglerPut(item) {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'wrangler',
      'r2',
      'object',
      'put',
      item.objectPath,
      '--file',
      item.absoluteLocalPath,
      '--content-type',
      R2.contentType,
      '--remote',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

  if (result.status !== 0) {
    throw new Error(output || 'wrangler r2 object put failed');
  }

  if (/Resource location:\s*local/i.test(output)) {
    throw new Error('wrangler가 local R2에 저장했습니다. --remote 업로드가 적용되지 않았습니다.');
  }

  if (!/Resource location:\s*remote/i.test(output)) {
    throw new Error('wrangler 출력에서 remote 업로드 확인에 실패했습니다.');
  }

  return output;
}

async function uploadItems({ args, plannedUploads }) {
  const results = [];

  for (const item of plannedUploads) {
    if (!item.valid) {
      results.push(toPublicItem(item, {
        action: 'missing-or-empty',
        uploaded: false,
        skipped: false,
      }));
      continue;
    }

    let beforeStatus;
    try {
      beforeStatus = await getPublicUrlStatus(item.publicUrl);
    } catch (error) {
      beforeStatus = {
        status: 0,
        errorMessage: error.message,
      };
    }

    if (beforeStatus.status === 200 && !args.overwrite) {
      results.push(toPublicItem(item, {
        action: 'skipped-existing-r2-object',
        uploaded: false,
        skipped: true,
        beforeStatus,
      }));
      continue;
    }

    let output;
    let afterStatus;

    try {
      output = runWranglerPut(item);
      afterStatus = await getPublicUrlStatus(item.publicUrl);
    } catch (error) {
      results.push(toPublicItem(item, {
        action: 'upload-failed',
        uploaded: false,
        skipped: false,
        beforeStatus,
        errorMessage: error.message,
      }));
      continue;
    }

    const contentTypeOk = afterStatus.contentType.includes('audio/mpeg');
    const statusOk = afterStatus.status === 200;

    if (!statusOk || !contentTypeOk) {
      results.push(toPublicItem(item, {
        action: 'upload-verify-failed',
        uploaded: false,
        skipped: false,
        beforeStatus,
        afterStatus,
        wranglerOutput: output,
        errorMessage: !statusOk
          ? `업로드 후 public URL이 200이 아닙니다: ${afterStatus.status}`
          : `Content-Type이 audio/mpeg가 아닙니다: ${afterStatus.contentType}`,
      }));
      continue;
    }

    results.push(toPublicItem(item, {
      action: 'uploaded',
      uploaded: true,
      skipped: false,
      beforeStatus,
      afterStatus,
      wranglerOutput: output,
    }));
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTargetScope(args);

  const plannedUploads = FILE_NAMES.map((fileName) => buildPlanItem({ args, fileName }));
  const validCount = plannedUploads.filter((item) => item.valid).length;
  const missingOrEmpty = plannedUploads.filter((item) => !item.valid);

  if (args.upload) {
    const results = await uploadItems({ args, plannedUploads });
    const uploadedCount = results.filter((item) => item.uploaded).length;
    const skippedCount = results.filter((item) => item.skipped).length;
    const failedCount = results.filter((item) => !item.uploaded && !item.skipped).length;

    console.log(JSON.stringify({
      mode: 'upload',
      uploadPerformed: uploadedCount > 0,
      fileModified: false,
      r2Bucket: R2.bucket,
      contentType: R2.contentType,
      overwrite: args.overwrite,
      targetCount: results.length,
      uploadedCount,
      skippedCount,
      failedCount,
      results,
    }, null, 2));

    if (failedCount > 0 || uploadedCount !== plannedUploads.filter((item) => item.valid).length - skippedCount) {
      process.exitCode = 1;
    }

    return;
  }

  console.log(JSON.stringify({
    mode: 'dry-run',
    uploadPerformed: false,
    fileModified: false,
    r2Bucket: R2.bucket,
    contentType: R2.contentType,
    overwrite: args.overwrite,
    bookId: args.bookId,
    chapter: args.chapter,
    verse: args.verse,
    language: args.language,
    targetCount: plannedUploads.length,
    validCount,
    missingOrEmptyCount: missingOrEmpty.length,
    plannedUploads: plannedUploads.map((item) => toPublicItem(item)),
  }, null, 2));

  if (missingOrEmpty.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
