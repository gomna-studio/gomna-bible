/**
 * Structured cross-reference helpers for multilingual commentary cards.
 * Display strings stay for UI; navigation uses bookId/chapter/verse*.
 */

import {
  parseBibleReference,
  parseBibleReferenceList,
} from './gomna-bible-ref.mjs';

export const STRUCTURED_REF_FIELDS = Object.freeze([
  'bookId',
  'chapter',
  'verseStart',
  'verseEnd',
]);

export function isStructuredBibleRef(ref) {
  if (!ref || typeof ref !== 'object') return false;
  const chapter = Number(ref.chapter);
  const verseStart = Number(ref.verseStart);
  const verseEnd = Number(ref.verseEnd == null ? ref.verseStart : ref.verseEnd);
  return (
    typeof ref.bookId === 'string' &&
    ref.bookId.trim() !== '' &&
    Number.isInteger(chapter) &&
    chapter >= 1 &&
    Number.isInteger(verseStart) &&
    verseStart >= 1 &&
    Number.isInteger(verseEnd) &&
    verseEnd >= verseStart
  );
}

export function toStructuredBibleRef(parsed, displayFallback = '') {
  if (!parsed || !parsed.ok) return null;
  const verseStart = parsed.verseStart;
  const verseEnd =
    parsed.verseEnd == null || parsed.verseEnd === ''
      ? verseStart
      : parsed.verseEnd;
  return {
    displayReference: String(parsed.display || displayFallback || '').trim(),
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verseStart,
    verseEnd,
  };
}

export function parseDisplayToStructuredRefs(displayText) {
  const list = parseBibleReferenceList(displayText);
  const refs = [];
  for (const item of list) {
    const structured = toStructuredBibleRef(item, item && item.display);
    if (!structured) {
      return {
        ok: false,
        refs: [],
        reason: (item && item.reason) || 'bad_format',
        display: (item && item.display) || String(displayText || ''),
        bookToken: item && item.bookToken,
      };
    }
    refs.push(structured);
  }
  if (!refs.length) {
    return {
      ok: false,
      refs: [],
      reason: 'empty',
      display: String(displayText || ''),
    };
  }
  return { ok: true, refs };
}

/**
 * Attach structured fields without changing Korean display keys/values.
 * - Single ref → flat displayReference/bookId/chapter/verseStart/verseEnd
 * - Multi ref → relatedReferences[] (+ flat fields from the first ref)
 */
export function enrichCrossRefRow(row, displayField) {
  if (!row || typeof row !== 'object') {
    return { ok: false, reason: 'bad_row' };
  }
  const display = String(row[displayField] == null ? '' : row[displayField]).trim();
  if (!display) {
    return { ok: false, reason: 'empty_display', row };
  }
  const parsed = parseDisplayToStructuredRefs(display);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, display, bookToken: parsed.bookToken, row };
  }

  const next = { ...row };
  const first = parsed.refs[0];
  next.displayReference = first.displayReference;
  next.bookId = first.bookId;
  next.chapter = first.chapter;
  next.verseStart = first.verseStart;
  next.verseEnd = first.verseEnd;
  if (parsed.refs.length > 1) {
    next.relatedReferences = parsed.refs;
  } else {
    delete next.relatedReferences;
  }
  return { ok: true, row: next, refCount: parsed.refs.length };
}

/**
 * New multilang cross-ref rows MUST carry structured ids.
 * Legacy rows without structure are allowed only when requireStructured=false.
 */
export function validateStructuredCrossRefRow(row, options = {}) {
  const requireStructured = options.requireStructured !== false;
  const displayField = options.displayField || null;
  if (!row || typeof row !== 'object') {
    return { ok: false, code: 'bad_row', message: 'row missing' };
  }

  if (Array.isArray(row.relatedReferences) && row.relatedReferences.length) {
    for (let i = 0; i < row.relatedReferences.length; i += 1) {
      const ref = row.relatedReferences[i];
      if (!isStructuredBibleRef(ref)) {
        return {
          ok: false,
          code: 'missing_structured_cross_ref',
          message: `relatedReferences[${i}] missing bookId/chapter/verseStart/verseEnd`,
        };
      }
    }
    return { ok: true, mode: 'relatedReferences', count: row.relatedReferences.length };
  }

  if (isStructuredBibleRef(row)) {
    return { ok: true, mode: 'flat', count: 1 };
  }

  if (!requireStructured) {
    if (displayField && String(row[displayField] || '').trim()) {
      return { ok: true, mode: 'legacy_display', count: 0 };
    }
    return { ok: true, mode: 'empty', count: 0 };
  }

  return {
    ok: false,
    code: 'missing_structured_cross_ref',
    message: 'multilang cross-ref requires bookId/chapter/verseStart/verseEnd',
    displayField,
    display: displayField ? row[displayField] : undefined,
  };
}

export function extractStructuredRefsFromRow(row, displayField) {
  if (Array.isArray(row?.relatedReferences) && row.relatedReferences.length) {
    return {
      mode: 'structured',
      refs: row.relatedReferences.filter(isStructuredBibleRef),
      usedParser: false,
    };
  }
  if (isStructuredBibleRef(row)) {
    return {
      mode: 'structured',
      refs: [
        {
          displayReference:
            row.displayReference ||
            (displayField ? row[displayField] : '') ||
            '',
          bookId: row.bookId,
          chapter: Number(row.chapter),
          verseStart: Number(row.verseStart),
          verseEnd: Number(row.verseEnd == null ? row.verseStart : row.verseEnd),
        },
      ],
      usedParser: false,
    };
  }
  const display = displayField ? String(row?.[displayField] || '').trim() : '';
  if (!display) return { mode: 'empty', refs: [], usedParser: false };
  const parsed = parseDisplayToStructuredRefs(display);
  return {
    mode: 'legacy_parse',
    refs: parsed.ok ? parsed.refs : [],
    usedParser: true,
    parseOk: parsed.ok,
    reason: parsed.reason,
  };
}

export function enrichLocaleGenesisCrossRefs(cardDoc) {
  if (!cardDoc || typeof cardDoc !== 'object') {
    return { ok: false, reason: 'bad_doc' };
  }
  const verses = cardDoc.verses || {};
  let rowCount = 0;
  let refCount = 0;
  let failed = [];
  const nextVerses = {};

  for (const [verseKey, verse] of Object.entries(verses)) {
    const nextVerse = { ...verse };
    for (const [tableKey, displayField] of [
      ['표3_신학적의미', '관련구절'],
      ['표9_교차참조', '구절'],
    ]) {
      const rows = Array.isArray(verse[tableKey]) ? verse[tableKey] : [];
      const enrichedRows = [];
      for (const row of rows) {
        rowCount += 1;
        const enriched = enrichCrossRefRow(row, displayField);
        if (!enriched.ok) {
          failed.push({
            verseKey,
            tableKey,
            display: row?.[displayField],
            reason: enriched.reason,
            bookToken: enriched.bookToken,
          });
          enrichedRows.push(row);
          continue;
        }
        refCount += enriched.refCount;
        enrichedRows.push(enriched.row);
      }
      nextVerse[tableKey] = enrichedRows;
    }
    nextVerses[verseKey] = nextVerse;
  }

  return {
    ok: failed.length === 0,
    failed,
    rowCount,
    refCount,
    doc: {
      ...cardDoc,
      verses: nextVerses,
    },
  };
}

export function validateLocaleGenesisStructuredCrossRefs(cardDoc, options = {}) {
  const requireStructured = options.requireStructured !== false;
  const verses = cardDoc?.verses || {};
  const failures = [];
  let checked = 0;
  for (const [verseKey, verse] of Object.entries(verses)) {
    for (const [tableKey, displayField] of [
      ['표3_신학적의미', '관련구절'],
      ['표9_교차참조', '구절'],
    ]) {
      for (const row of verse?.[tableKey] || []) {
        checked += 1;
        const result = validateStructuredCrossRefRow(row, {
          requireStructured,
          displayField,
        });
        if (!result.ok) {
          failures.push({
            verseKey,
            tableKey,
            display: row?.[displayField],
            code: result.code,
            message: result.message,
          });
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures };
}

// Re-export parse single for tests that patch/spy parser usage.
export { parseBibleReference, parseBibleReferenceList };
