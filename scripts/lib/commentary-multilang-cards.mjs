/**
 * Stage localized commentary card JSON candidates under /tmp only.
 * Never writes into repository data/commentary-cards.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCommentaryType } from './commentary-type-registry.mjs';
import { getLocaleConfig } from './commentary-multilang-registry.mjs';
import {
  assertStagingPath,
  evaluateTranslationResultQa,
} from './commentary-multilang-translation-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRepoRoot(options = {}) {
  return options.repoRoot || process.env.GOMNA_ROOT || path.resolve(__dirname, '../..');
}

function bookDisplayName(bookId) {
  const map = {
    genesis: '창세기',
  };
  return map[bookId] || bookId;
}

function localizedReference(bookId, chapter, verse, locale) {
  if (locale === 'ja-JP') {
    const names = { genesis: '創世記' };
    return `${names[bookId] || bookId} ${chapter}:${verse}`;
  }
  const names = { genesis: 'Genesis' };
  return `${names[bookId] || bookId} ${chapter}:${verse}`;
}

function resolveTranslatedCards(result) {
  if (Array.isArray(result?.translatedCards)) return result.translatedCards;
  if (Array.isArray(result?.cards)) return result.cards;
  return [];
}

export function buildCardRowsFromTranslatedCards(translatedCards) {
  return (translatedCards || []).map((card, index) => {
    const fields = { ...(card.fields || {}) };
    return {
      ...fields,
      __itemIndex: Number(card.itemIndex ?? index),
      __identity: card.identity || null,
    };
  }).map((row) => {
    const clone = { ...row };
    delete clone.__itemIndex;
    delete clone.__identity;
    return clone;
  });
}

export function buildStagedVerseEntry({
  job,
  result,
  locale,
  verseText = '',
}) {
  getLocaleConfig(locale);
  const type = job.type;
  const tableKey = job.tableKey || getCommentaryType(type).tableKey;
  const cards = resolveTranslatedCards(result);
  const rows = buildCardRowsFromTranslatedCards(cards);
  const verseKey =
    job.verseKey ||
    `${bookDisplayName(job.bookId)}_${job.chapter}_${job.verse}`;

  return {
    verseKey,
    entry: {
      reference: localizedReference(job.bookId, job.chapter, job.verse, locale),
      sourceReference: `${bookDisplayName(job.bookId)} ${job.chapter}:${job.verse}`,
      verseText: verseText || '',
      [tableKey]: rows,
    },
  };
}

export function buildStagedCardsDocument({
  locale,
  bookId,
  scope,
  verseEntries,
  note,
}) {
  getLocaleConfig(locale);
  const verses = {};
  for (const item of verseEntries) {
    verses[item.verseKey] = item.entry;
  }
  return {
    schemaVersion: 1,
    locale,
    bookId,
    sourceStore: 'pastorCommentaryData',
    scope: scope || `${bookId}-staged`,
    note:
      note ||
      'Staged commentary card candidate only. Not an approved repository write.',
    fieldPolicy: {
      nonMatthewHenry:
        'Same Korean field keys as pastorCommentaryData; values localized.',
      matthewHenry: {
        'en-US': ['English Original', 'English Explanation', 'Key Insight'],
        'ja-JP': ['英語原文', '日本語訳', '核心的洞察'],
      },
    },
    verses,
  };
}

/**
 * Merge translated card rows into per-locale staged documents and write under /tmp.
 */
export function stageCardsFromTranslationResults(jobs, results, options = {}) {
  const stagingRoot = assertStagingPath(
    options.stagingRoot || path.join('/tmp', 'gomna-commentary-v2-staging'),
    'stagingRoot',
  );
  const repoRoot = getRepoRoot(options);
  const resultById = new Map(
    (results || []).map((item) => {
      const value = item?.value || item;
      return [value.targetId, value];
    }),
  );

  const byLocale = new Map();
  const lockedConflicts = [];
  const skippedApproved = [];
  const staged = [];
  const failed = [];

  for (const job of jobs) {
    const result = resultById.get(job.targetId);
    if (!result) {
      failed.push({ targetId: job.targetId, reason: 'missing_result' });
      continue;
    }

    const qa = evaluateTranslationResultQa(job, result, options);
    if (!qa.ok) {
      failed.push({
        targetId: job.targetId,
        reason: 'translation_qa_failed',
        details: qa.reasons,
      });
      continue;
    }

    // Detect repo approved card presence for same verse/type/locale.
    const repoCardsPath = path.join(
      repoRoot,
      'data',
      'commentary-cards',
      job.locale,
      `${job.bookId}.json`,
    );
    if (fs.existsSync(repoCardsPath)) {
      try {
        const doc = JSON.parse(fs.readFileSync(repoCardsPath, 'utf8'));
        const verseKey =
          job.verseKey ||
          `${bookDisplayName(job.bookId)}_${job.chapter}_${job.verse}`;
        const existing = doc.verses?.[verseKey]?.[job.tableKey];
        if (Array.isArray(existing) && existing.length) {
          // Existing published cards for 1:1-1:10 must not be overwritten in repo.
          // Staging still writes /tmp candidates, but marks locked if overlapping approved scope.
          const scope = String(doc.scope || '');
          if (scope && job.chapter === 1 && job.verse >= 1 && job.verse <= 10) {
            lockedConflicts.push({
              targetId: job.targetId,
              status: 'locked-conflict',
              reason: 'existing_approved_range_cards',
              repoCardsPath: path.relative(repoRoot, repoCardsPath),
            });
            // Do not include in staged merge for overlapping approved verses.
            continue;
          }
        }
      } catch {
        // ignore parse issues; staging still proceeds for /tmp only
      }
    }

    if (!byLocale.has(job.locale)) {
      byLocale.set(job.locale, {
        bookId: job.bookId,
        verseMap: new Map(),
      });
    }
    const bucket = byLocale.get(job.locale);
    const built = buildStagedVerseEntry({
      job,
      result,
      locale: job.locale,
    });
    const previous = bucket.verseMap.get(built.verseKey) || {
      verseKey: built.verseKey,
      entry: {
        reference: built.entry.reference,
        sourceReference: built.entry.sourceReference,
        verseText: built.entry.verseText,
      },
    };
    const tableKey = job.tableKey || getCommentaryType(job.type).tableKey;
    previous.entry[tableKey] = built.entry[tableKey];
    bucket.verseMap.set(built.verseKey, previous);
    staged.push(job.targetId);
  }

  const written = [];
  for (const [locale, bucket] of byLocale.entries()) {
    const verseEntries = [...bucket.verseMap.values()];
    const document = buildStagedCardsDocument({
      locale,
      bookId: bucket.bookId,
      scope: options.scope || `${bucket.bookId}-staged-candidate`,
      verseEntries,
    });
    const outPath = path.join(
      stagingRoot,
      'data',
      'commentary-cards',
      locale,
      `${bucket.bookId}.json`,
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    written.push({ locale, path: outPath, verseCount: verseEntries.length });
  }

  return {
    stagingRoot,
    written,
    stagedCount: staged.length,
    stagedTargetIds: staged,
    lockedConflicts,
    skippedApproved,
    failed,
    repoWrites: 0,
  };
}
