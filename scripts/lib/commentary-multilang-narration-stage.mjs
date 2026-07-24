/**
 * Stage TXT + draft meta narration candidates under /tmp only.
 * Blocks overwrite of repository approved narration/meta pairs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildDraftNarrationMetadata,
  buildNarrationStructureSignature,
  formatMetadataJson,
  parseNarrationStructure,
  sha256Text,
  validateTranslatedNarration,
  joinNarrationStructure,
} from './commentary-multilang-translation.mjs';
import {
  assertStagingPath,
  evaluateTranslationResultQa,
} from './commentary-multilang-translation-io.mjs';
import {
  buildNarrationMetaPath,
  buildNarrationPath,
} from './commentary-multilang-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRepoRoot(options = {}) {
  return options.repoRoot || process.env.GOMNA_ROOT || path.resolve(__dirname, '../..');
}

function resolveNarrationText(result) {
  if (typeof result?.narrationText === 'string' && result.narrationText.trim()) {
    return result.narrationText.endsWith('\n')
      ? result.narrationText
      : `${result.narrationText}\n`;
  }
  if (Array.isArray(result?.translatedNarrationParagraphs)) {
    const paragraphs = result.translatedNarrationParagraphs;
    return `${paragraphs.map((lines) => lines.join('\n')).join('\n\n')}\n`;
  }
  if (Array.isArray(result?.paragraphs)) {
    const paragraphs = result.paragraphs;
    return `${paragraphs.map((lines) => lines.join('\n')).join('\n\n')}\n`;
  }
  return '';
}

/**
 * Inspect repository narration/meta lock state for a target.
 */
export function inspectApprovedNarrationLock(job, options = {}) {
  const repoRoot = getRepoRoot(options);
  const narrationRel = buildNarrationPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );
  const metaRel = buildNarrationMetaPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );
  const narrationAbs = path.join(repoRoot, narrationRel);
  const metaAbs = path.join(repoRoot, metaRel);

  const metaExists = fs.existsSync(metaAbs);
  const narrationExists = fs.existsSync(narrationAbs);
  if (!metaExists && !narrationExists) {
    return {
      status: 'unlocked',
      narrationPath: narrationRel,
      metaPath: metaRel,
    };
  }

  let meta = null;
  if (metaExists) {
    try {
      meta = JSON.parse(fs.readFileSync(metaAbs, 'utf8'));
    } catch (error) {
      return {
        status: 'locked-conflict',
        reason: `malformed_metadata:${error.message}`,
        narrationPath: narrationRel,
        metaPath: metaRel,
      };
    }
  }

  if (meta?.status === 'approved') {
    if (meta.sourceHash && meta.sourceHash === job.sourceHash) {
      return {
        status: 'locked-skip',
        reason: 'approved_matching_sourceHash',
        narrationPath: narrationRel,
        metaPath: metaRel,
        meta,
      };
    }
    return {
      status: 'locked-conflict',
      reason: meta?.sourceHash
        ? `approved_sourceHash_mismatch stored=${meta.sourceHash} current=${job.sourceHash}`
        : 'approved_without_matching_sourceHash',
      narrationPath: narrationRel,
      metaPath: metaRel,
      meta,
    };
  }

  if (metaExists || narrationExists) {
    return {
      status: 'locked-conflict',
      reason: `existing_non_approved_repo_artifacts status=${meta?.status || 'missing-meta'}`,
      narrationPath: narrationRel,
      metaPath: metaRel,
      meta,
    };
  }

  return {
    status: 'unlocked',
    narrationPath: narrationRel,
    metaPath: metaRel,
  };
}

export function buildStagedNarrationArtifacts(job, result, options = {}) {
  const qa = evaluateTranslationResultQa(job, result, options);
  if (!qa.ok) {
    return {
      ok: false,
      targetId: job.targetId,
      reasons: qa.reasons,
    };
  }

  const narrationText = resolveNarrationText(result);
  const sourceParagraphs = parseNarrationStructure(job.sourceNarrationText);
  const translatedParagraphs = parseNarrationStructure(narrationText);
  const sourceSignature = buildNarrationStructureSignature(sourceParagraphs);
  const narrationSignature = buildNarrationStructureSignature(
    translatedParagraphs,
  );
  const structureMatches =
    JSON.stringify(sourceSignature.lineCounts) ===
    JSON.stringify(narrationSignature.lineCounts);
  const softOriginalLanguage =
    job.type === 'original-language' && sourceParagraphs.length !== 3;

  const validation = validateTranslatedNarration({
    sourceText: job.sourceNarrationText,
    translatedText: narrationText,
    targetLocale: job.locale,
    type: job.type,
    cardCount: job.cardCount,
  });
  if (!validation.ok && !(softOriginalLanguage && structureMatches)) {
    return {
      ok: false,
      targetId: job.targetId,
      reasons: validation.errors,
    };
  }
  if (!structureMatches) {
    return {
      ok: false,
      targetId: job.targetId,
      reasons: [
        `Structure mismatch: source=${JSON.stringify(sourceSignature.lineCounts)} translated=${JSON.stringify(narrationSignature.lineCounts)}`,
      ],
    };
  }

  const finalNarrationText =
    validation.ok && validation.narrationText
      ? validation.narrationText
      : joinNarrationStructure(translatedParagraphs);
  const finalParagraphCount = validation.ok
    ? validation.paragraphCount
    : narrationSignature.paragraphCount;
  const finalNarrationSignature = validation.ok
    ? validation.narrationSignature
    : narrationSignature;

  const metadata = buildDraftNarrationMetadata({
    sourcePath: job.sourcePath,
    sourceHash: job.sourceHash,
    targetLocale: job.locale,
    bookId: job.bookId,
    chapter: job.chapter,
    verse: job.verse,
    type: job.type,
    paragraphCount: finalParagraphCount,
    cardCount: job.cardCount,
    cardIdentities: job.cardIdentities,
    narrationHash: sha256Text(finalNarrationText),
    model: result.model || 'offline-staging',
    translatedAt: result.translatedAt || new Date().toISOString(),
    sourceSignature,
    narrationSignature: finalNarrationSignature,
    structureValidated: true,
  });

  // Hard guarantee: staged metadata never leaves draft/approved write path.
  metadata.status = 'draft';
  delete metadata.approvedAt;
  delete metadata.reviewedAt;

  const narrationRel = buildNarrationPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );
  const metaRel = buildNarrationMetaPath(
    job.bookId,
    job.chapter,
    job.verse,
    job.type,
    job.locale,
  );

  return {
    ok: true,
    targetId: job.targetId,
    narrationRelativePath: narrationRel,
    metaRelativePath: metaRel,
    narrationText: finalNarrationText,
    metadata,
    metadataJson: formatMetadataJson(metadata),
  };
}

/**
 * Write staged narration candidates under stagingRoot.
 * Repository approved artifacts are never overwritten.
 */
export function stageNarrationFromTranslationResults(jobs, results, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-staging'),
    'stagingRoot',
  );
  const resultById = new Map(
    (results || []).map((item) => {
      const value = item?.value || item;
      return [value.targetId, value];
    }),
  );

  const written = [];
  const lockedSkip = [];
  const lockedConflict = [];
  const failed = [];

  for (const job of jobs) {
    const lock = inspectApprovedNarrationLock(job, options);
    if (lock.status === 'locked-skip') {
      lockedSkip.push({ targetId: job.targetId, ...lock });
      continue;
    }
    if (lock.status === 'locked-conflict') {
      lockedConflict.push({ targetId: job.targetId, ...lock });
      continue;
    }

    const result = resultById.get(job.targetId);
    if (!result) {
      failed.push({ targetId: job.targetId, reason: 'missing_result' });
      continue;
    }

    const artifacts = buildStagedNarrationArtifacts(job, result, options);
    if (!artifacts.ok) {
      failed.push({
        targetId: job.targetId,
        reason: 'artifact_build_failed',
        details: artifacts.reasons,
      });
      continue;
    }

    const narrationAbs = path.join(stagingRoot, artifacts.narrationRelativePath);
    const metaAbs = path.join(stagingRoot, artifacts.metaRelativePath);
    fs.mkdirSync(path.dirname(narrationAbs), { recursive: true });
    fs.mkdirSync(path.dirname(metaAbs), { recursive: true });
    fs.writeFileSync(narrationAbs, artifacts.narrationText, 'utf8');
    fs.writeFileSync(metaAbs, artifacts.metadataJson, 'utf8');

    written.push({
      targetId: job.targetId,
      narrationPath: narrationAbs,
      metaPath: metaAbs,
      status: artifacts.metadata.status,
    });
  }

  return {
    stagingRoot,
    written,
    writtenCount: written.length,
    lockedSkip,
    lockedConflict,
    failed,
    repoWrites: 0,
    approvedWrites: 0,
  };
}

export function buildAutoApproveCandidateReport({
  structuralResults = [],
  translationResults = [],
  lockedSkip = [],
  lockedConflict = [],
} = {}) {
  const translationPass = translationResults.filter(
    (item) => item.translationGrade === 'PASS' || item.ok === true,
  );
  const lockedIds = new Set([
    ...lockedSkip.map((item) => item.targetId),
    ...lockedConflict.map((item) => item.targetId),
  ]);

  const candidates = translationPass.filter(
    (item) => !lockedIds.has(item.targetId),
  );

  return {
    structuralQaPassCount: structuralResults.filter(
      (item) => (item.structuralGrade || item.grade) === 'PASS',
    ).length,
    translationQaPassCount: translationPass.length,
    translationQaStatus:
      translationResults.length === 0 ? 'not-run' : 'run',
    autoApproveCandidateCount: candidates.length,
    autoApproveCandidates: candidates.map((item) => item.targetId),
    reviewRequiredCount: lockedConflict.length,
    lockedSkipCount: lockedSkip.length,
    lockedConflictCount: lockedConflict.length,
    writesDisabled: true,
    note:
      'Staging candidates only. Approved repository artifacts are never overwritten; approval writes remain blocked.',
  };
}
