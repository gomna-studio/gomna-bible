/**
 * Shared multilingual glossaries for commentary QA and repair.
 * Deterministic lookups only — never invents unverified hymn titles.
 */

/** Approved testament labels used in published JA commentary cards. */
export const TESTAMENT_GLOSSARY = Object.freeze({
  ko: Object.freeze({
    구약: '구약',
    신약: '신약',
  }),
  'en-US': Object.freeze({
    구약: 'Old Testament',
    신약: 'New Testament',
    'Old Testament': 'Old Testament',
    'New Testament': 'New Testament',
  }),
  'ja-JP': Object.freeze({
    구약: '旧約',
    신약: '新約',
    旧約: '旧約',
    新約: '新約',
  }),
});

/**
 * Verified Korean hymn title → English title.
 * Sources: traditional hymnal English originals + attested bilingual titles.
 * Unlisted titles must remain REVIEW_REQUIRED (do not invent).
 */
export const HYMN_TITLE_EN_BY_KO = Object.freeze({
  '기쁘다 구주 오셨네': 'Joy to the World',
  '찬양하라 복되신 구세주 예수': 'Praise Him! Praise Him!',
  '강물같이 흐르는 기쁨': "I've Got Peace Like a River",
  // Japanese-origin worship song 花も (Hana Mo); EN output uses Latin romanization only.
  꽃들도: 'Flowers (original title: Hana mo)',
});

/**
 * Optional number→title hints from already-approved EN commentary cards.
 * Used only as a secondary lookup when Korean title mapping is absent.
 */
export function buildApprovedHymnTitleIndex(enCardsDocument) {
  const byNumber = new Map();
  const verses = enCardsDocument?.verses || {};
  for (const entry of Object.values(verses)) {
    const rows = entry?.표7_찬송가 || [];
    for (const row of rows) {
      const num = String(row?.새찬송가 || '')
        .replace(/장/g, '')
        .trim();
      const title = String(row?.제목 || '').trim();
      if (!num || !title) continue;
      if (!byNumber.has(num)) byNumber.set(num, new Set());
      byNumber.get(num).add(title);
    }
  }
  return byNumber;
}

export function resolveTestamentLabel(value, locale) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const table = TESTAMENT_GLOSSARY[locale] || {};
  if (Object.prototype.hasOwnProperty.call(table, raw)) {
    return { ok: true, value: table[raw], source: 'glossary' };
  }
  // Mixed forms like 新약 / 旧약: recover via Hangul stem when present.
  if (locale === 'ja-JP') {
    if (/신약|新약|新約/.test(raw)) {
      return { ok: true, value: '新約', source: 'glossary-normalized' };
    }
    if (/구약|旧약|旧約/.test(raw)) {
      return { ok: true, value: '旧約', source: 'glossary-normalized' };
    }
  }
  return { ok: false, reason: 'unmapped', value: raw };
}

/**
 * Repair JA results using shared glossary only (no verse-specific literals).
 * Fixes mixed testament labels such as 新약 → 新約.
 */
export function repairJapaneseTestamentLabels(result) {
  if (!result || result.locale !== 'ja-JP') {
    return { changed: false, result };
  }
  let changed = false;
  const cards = (result.translatedCards || result.cards || []).map((card) => {
    const fields = { ...(card.fields || {}) };
    if (Object.prototype.hasOwnProperty.call(fields, '구분')) {
      const resolved = resolveTestamentLabel(fields['구분'], 'ja-JP');
      if (resolved.ok && resolved.value !== fields['구분']) {
        fields['구분'] = resolved.value;
        changed = true;
      }
    }
    return { ...card, fields };
  });

  let narrationText = result.narrationText || null;
  if (typeof narrationText === 'string') {
    const repairedNarration = narrationText
      .replace(/新약/g, '新約')
      .replace(/旧약/g, '旧約');
    if (repairedNarration !== narrationText) {
      narrationText = repairedNarration;
      changed = true;
    }
  }

  if (!changed) return { changed: false, result };
  return {
    changed: true,
    result: {
      ...result,
      translatedCards: cards,
      ...(narrationText != null ? { narrationText } : {}),
    },
  };
}

export function resolveHymnEnglishTitle({
  koreanTitle,
  hymnNumber = null,
  approvedNumberIndex = null,
} = {}) {
  const ko = String(koreanTitle || '').trim();
  if (ko && Object.prototype.hasOwnProperty.call(HYMN_TITLE_EN_BY_KO, ko)) {
    return {
      ok: true,
      title: HYMN_TITLE_EN_BY_KO[ko],
      source: 'korean-title-glossary',
    };
  }

  const num = String(hymnNumber || '')
    .replace(/장/g, '')
    .trim();
  if (num && approvedNumberIndex?.has(num)) {
    const titles = [...approvedNumberIndex.get(num)];
    if (titles.length === 1) {
      return {
        ok: true,
        title: titles[0],
        source: 'approved-en-card-number',
      };
    }
    return {
      ok: false,
      reason: 'ambiguous_approved_number',
      candidates: titles,
    };
  }

  return {
    ok: false,
    reason: ko ? 'unverified_korean_title' : 'missing_korean_title',
  };
}
