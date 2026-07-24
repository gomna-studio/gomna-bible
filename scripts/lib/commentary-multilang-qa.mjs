/**
 * Read-only QA classification for commentary multilang pipeline v2.
 * Phase-1 evaluates structural inventory only — not EN/JA translation quality.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCommentaryType } from './commentary-type-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRoot() {
  return process.env.GOMNA_ROOT || path.resolve(__dirname, '../..');
}

function toAbsolute(relativePath) {
  return path.join(getRoot(), relativePath);
}

export const QA_GRADES = Object.freeze({
  PASS: 'PASS',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  FAIL: 'FAIL',
});

export const TRANSLATION_QA_STATUS = Object.freeze({
  NOT_RUN: 'not-run',
});

/**
 * Inventory-level status for one target based on local artifacts only.
 */
export function classifyTargetInventoryStatus(target) {
  if (!target || typeof target !== 'object') {
    throw new Error('target is required');
  }

  if (target.metaError) {
    return {
      status: 'failed',
      structuralGrade: QA_GRADES.FAIL,
      reasons: [target.metaError],
    };
  }

  const hasNarration = !!target.narrationExists;
  const hasMeta = !!target.metaExists;
  const approved = !!target.metaApproved;
  const hasAudio = !!target.audioExists;
  const hasCue = !!target.cueExists;
  const hasManifest = !!target.manifestExists;

  if (!hasNarration && !hasMeta && !hasAudio && !hasCue && !hasManifest) {
    return {
      status: 'missing',
      structuralGrade: QA_GRADES.PASS,
      reasons: ['no_localized_artifacts'],
      note: 'Structural PASS means Korean source/target shape is usable; translation QA was not run.',
    };
  }

  if (hasMeta && !approved) {
    return {
      status: 'translated',
      structuralGrade: QA_GRADES.REVIEW_REQUIRED,
      reasons: [`meta_status=${target.metaStatus || 'unknown'}`],
    };
  }

  if (approved && hasNarration && hasAudio && hasCue && hasManifest) {
    return {
      status: 'skipped-existing',
      structuralGrade: QA_GRADES.PASS,
      reasons: ['complete_local_and_manifest'],
      resumeComplete: true,
    };
  }

  if (approved && hasNarration && hasAudio && hasCue && !hasManifest) {
    return {
      status: 'cue-ready',
      structuralGrade: QA_GRADES.REVIEW_REQUIRED,
      reasons: ['missing_manifest_entry'],
    };
  }

  if (approved && hasNarration && hasAudio && !hasCue) {
    return {
      status: 'audio-ready',
      structuralGrade: QA_GRADES.REVIEW_REQUIRED,
      reasons: ['missing_cue'],
    };
  }

  if (approved && hasNarration && !hasAudio) {
    return {
      status: 'approved',
      structuralGrade: QA_GRADES.PASS,
      reasons: ['approved_narration_awaiting_audio'],
    };
  }

  if (hasNarration && !hasMeta) {
    return {
      status: 'review-required',
      structuralGrade: QA_GRADES.REVIEW_REQUIRED,
      reasons: ['narration_without_metadata'],
    };
  }

  if (hasMeta && !hasNarration) {
    return {
      status: 'failed',
      structuralGrade: QA_GRADES.FAIL,
      reasons: ['metadata_without_narration'],
    };
  }

  return {
    status: 'review-required',
    structuralGrade: QA_GRADES.REVIEW_REQUIRED,
    reasons: ['partial_artifacts'],
  };
}

function readJsonIfExists(relativePath) {
  const absolute = toAbsolute(relativePath);
  if (!fs.existsSync(absolute)) {
    return { exists: false, data: null, error: null };
  }
  try {
    return {
      exists: true,
      data: JSON.parse(fs.readFileSync(absolute, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Structural QA for planning targets. Translation quality is explicitly not-run.
 */
export function evaluateTargetQa(target) {
  const inventory = classifyTargetInventoryStatus(target);
  const checks = [];
  const failReasons = [...(inventory.reasons || [])];
  const reviewReasons = [];

  try {
    getCommentaryType(target.type || target.commentaryType);
    checks.push({ name: 'registered_type', ok: true });
  } catch (error) {
    checks.push({ name: 'registered_type', ok: false, detail: error.message });
    failReasons.push(error.message);
  }

  if (!Number.isInteger(Number(target.cardCount)) || Number(target.cardCount) < 1) {
    checks.push({ name: 'card_count', ok: false, detail: 'cardCount < 1' });
    failReasons.push('invalid_card_count');
  } else {
    checks.push({ name: 'card_count', ok: true });
  }

  if (Array.isArray(target.cardIdentities)) {
    const unique = new Set(target.cardIdentities);
    if (unique.size !== target.cardIdentities.length) {
      checks.push({ name: 'card_identity_unique', ok: false });
      failReasons.push('duplicate_card_identity');
    } else {
      checks.push({ name: 'card_identity_unique', ok: true });
    }
  }

  if (!target.audioId || !String(target.audioId).includes('.')) {
    failReasons.push('invalid_audio_id');
    checks.push({ name: 'audio_id', ok: false });
  } else {
    checks.push({ name: 'audio_id', ok: true });
  }

  if (target.metaExists) {
    const meta = readJsonIfExists(target.metaPath);
    if (meta.error) {
      checks.push({ name: 'meta_json', ok: false, detail: meta.error });
      failReasons.push(`meta_json: ${meta.error}`);
    } else {
      checks.push({ name: 'meta_json', ok: true });
      const required = [
        'sourceHash',
        'status',
        'targetLocale',
        'bookId',
        'chapter',
        'verse',
        'type',
      ];
      for (const field of required) {
        if (
          meta.data == null ||
          meta.data[field] == null ||
          meta.data[field] === ''
        ) {
          failReasons.push(`meta_missing_${field}`);
          checks.push({ name: `meta_${field}`, ok: false });
        } else {
          checks.push({ name: `meta_${field}`, ok: true });
        }
      }
      if (
        meta.data &&
        Number(meta.data.cardCount) > 0 &&
        Number(meta.data.cardCount) !== Number(target.cardCount)
      ) {
        reviewReasons.push(
          `meta_cardCount=${meta.data.cardCount} source_cardCount=${target.cardCount}`,
        );
      }
    }
  }

  if (target.cueExists) {
    const cue = readJsonIfExists(target.cuePath);
    if (cue.error) {
      checks.push({ name: 'cue_json', ok: false, detail: cue.error });
      failReasons.push(`cue_json: ${cue.error}`);
    } else {
      checks.push({ name: 'cue_json', ok: true });
      const segments = Array.isArray(cue.data?.segments) ? cue.data.segments : [];
      const itemSegments = segments.filter((segment) => segment.type === 'item');
      if (itemSegments.length !== Number(target.cardCount)) {
        reviewReasons.push(
          `cue_item_segments=${itemSegments.length} cardCount=${target.cardCount}`,
        );
      }
    }
  }

  let structuralGrade = inventory.structuralGrade;
  if (
    failReasons.some(
      (reason) =>
        reason.includes('meta_json') ||
        reason.includes('invalid_card') ||
        reason.includes('duplicate_card') ||
        reason.includes('metadata_without') ||
        reason.includes('registered_type') ||
        reason.includes('invalid_audio_id') ||
        reason.startsWith('meta_missing_'),
    )
  ) {
    structuralGrade = QA_GRADES.FAIL;
  } else if (reviewReasons.length) {
    structuralGrade = QA_GRADES.REVIEW_REQUIRED;
  }

  const status =
    structuralGrade === QA_GRADES.FAIL
      ? 'failed'
      : structuralGrade === QA_GRADES.REVIEW_REQUIRED
        ? 'review-required'
        : inventory.status === 'missing'
          ? 'structural-qa-passed'
          : inventory.status;

  return {
    targetKey: [
      target.bookId,
      target.chapter,
      target.verse,
      target.type || target.commentaryType,
      target.locale,
    ].join('.'),
    audioId: target.audioId,
    inventoryStatus: inventory.status,
    resumeComplete: !!inventory.resumeComplete,
    // Back-compat alias used by older tests/callers.
    grade: structuralGrade,
    structuralGrade,
    translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
    translationGrade: null,
    status,
    reasons: [...new Set([...failReasons, ...reviewReasons])],
    checks,
    note:
      structuralGrade === QA_GRADES.PASS
        ? 'structuralQaPass only — translation QA not-run in phase-1'
        : null,
  };
}

export function summarizeQaResults(results) {
  const summary = {
    total: results.length,
    structuralQaPassCount: 0,
    structuralQaReviewCount: 0,
    structuralQaFailCount: 0,
    translationQaPassCount: 0,
    translationQaStatus: TRANSLATION_QA_STATUS.NOT_RUN,
    PASS: 0,
    REVIEW_REQUIRED: 0,
    FAIL: 0,
    byStatus: {},
  };

  for (const result of results) {
    const grade = result.structuralGrade || result.grade;
    if (grade === QA_GRADES.PASS) {
      summary.structuralQaPassCount += 1;
      summary.PASS += 1;
    } else if (grade === QA_GRADES.REVIEW_REQUIRED) {
      summary.structuralQaReviewCount += 1;
      summary.REVIEW_REQUIRED += 1;
    } else if (grade === QA_GRADES.FAIL) {
      summary.structuralQaFailCount += 1;
      summary.FAIL += 1;
    }
    const status = result.status || 'unknown';
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
  }

  return summary;
}
