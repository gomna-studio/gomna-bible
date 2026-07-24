/**
 * Canonical commentary card field schemas for published locale cards.
 * Non-Matthew-Henry tables keep Korean source keys (reader.html looks them up).
 * Matthew Henry uses locale-specific display keys.
 */

export const MATTHEW_HENRY_TABLE_KEY = '표5_매튜헨리';

export const MATTHEW_HENRY_FIELDS_BY_LOCALE = Object.freeze({
  'en-US': Object.freeze([
    'English Original',
    'English Explanation',
    'Key Insight',
  ]),
  'ja-JP': Object.freeze(['英語原文', '日本語訳', '核心的洞察']),
  'ko-KR': Object.freeze(['영어원문', '한국어번역', '핵심통찰']),
});

/** Canonical Korean keys for non-MH tables (same as pastorCommentaryData). */
export const NON_MATTHEW_HENRY_FIELDS_BY_TABLE = Object.freeze({
  표1_원어분석: Object.freeze(['원어', '의미_문법', '설교포인트']),
  표2_역사적배경: Object.freeze(['항목', '내용', '목회적활용']),
  표3_신학적의미: Object.freeze(['교리', '설명', '관련구절']),
  표4_예표론: Object.freeze(['구분', '내용', '그리스도연결']),
  표6_설교자료: Object.freeze(['대지', '내용', '예화_적용']),
  표7_찬송가: Object.freeze(['새찬송가', '통일찬송가', '제목', '선정이유']),
  표8_상담적용: Object.freeze(['상황', '성경원리', '실제적용']),
  표9_교차참조: Object.freeze(['구절', '연결점', '구분']),
});

const MH_ALIASES_BY_SLOT = Object.freeze([
  Object.freeze([
    '영어원문',
    'English Original',
    'EnglishOriginal',
    '英語原文',
  ]),
  Object.freeze([
    '한국어번역',
    'English Explanation',
    'KoreanTranslation',
    '日本語訳',
    'Japanese Translation',
  ]),
  Object.freeze([
    '핵심통찰',
    'Key Insight',
    'KeyInsight',
    '核心的洞察',
    '核心洞察',
  ]),
]);

const NON_MH_ALIASES_BY_TABLE = Object.freeze({
  표1_원어분석: Object.freeze([
    Object.freeze(['원어', 'original', 'Original', '原語']),
    Object.freeze(['의미_문법', 'meaning_grammar', 'MeaningGrammar', '意味_文法']),
    Object.freeze(['설교포인트', 'sermon_point', 'SermonPoint', '説教ポイント']),
  ]),
  표2_역사적배경: Object.freeze([
    Object.freeze(['항목', 'Item', 'item', '項目']),
    Object.freeze(['내용', 'Content', 'content', '内容']),
    Object.freeze(['목회적활용', 'PastoralUse', 'pastoral_use', '牧会的活用']),
  ]),
  표3_신학적의미: Object.freeze([
    Object.freeze(['교리', 'Doctrine', 'doctrine', '教理']),
    Object.freeze(['설명', 'Explanation', 'explanation', '説明']),
    Object.freeze([
      '관련구절',
      'RelatedPassage',
      'related_passage',
      '関連句',
      '関連句節',
    ]),
  ]),
  표4_예표론: Object.freeze([
    Object.freeze(['구분', 'Category', 'category', '区分']),
    Object.freeze(['내용', 'Content', 'content', '内容']),
    Object.freeze([
      '그리스도연결',
      'ChristConnection',
      'christ_connection',
      'キリストとのつながり',
      'キリスト接続',
    ]),
  ]),
  표6_설교자료: Object.freeze([
    Object.freeze(['대지', 'Main Point', 'MainPoint', 'main_point', '大地']),
    Object.freeze(['내용', 'Content', 'content', '内容']),
    Object.freeze([
      '예화_적용',
      'Application Example',
      'ApplicationExample',
      'application_example',
      '例話_適用',
    ]),
  ]),
  표7_찬송가: Object.freeze([
    Object.freeze(['새찬송가', 'Hymn', 'hymn', '新賛美歌']),
    Object.freeze(['통일찬송가', 'Unity Hymn', 'UnityHymn', '統一賛美歌']),
    Object.freeze(['제목', 'Title', 'title', 'タイトル']),
    Object.freeze([
      '선정이유',
      'Reason for Selection',
      'ReasonForSelection',
      '選定理由',
    ]),
  ]),
  표8_상담적용: Object.freeze([
    Object.freeze(['상황', 'Situation', 'situation', '状況']),
    Object.freeze([
      '성경원리',
      'BiblicalPrinciple',
      'biblical_principle',
      '聖書原則',
    ]),
    Object.freeze([
      '실제적용',
      'PracticalApplication',
      'practical_application',
      '実際適用',
    ]),
  ]),
  표9_교차참조: Object.freeze([
    Object.freeze(['구절', 'Verse', 'verse', '句']),
    Object.freeze(['연결점', 'Connection', 'connection', '関連点']),
    Object.freeze(['구분', 'Category', 'category', '区分']),
  ]),
});

function pickByAliases(row, aliases) {
  if (!row || typeof row !== 'object') return '';
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value != null && String(value).trim() !== '') {
        return String(value);
      }
    }
  }
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key] == null ? '' : String(row[key]);
    }
  }
  return '';
}

function normalizeByAliasSlots(row, canonicalKeys, aliasSlots) {
  const out = {};
  for (let i = 0; i < canonicalKeys.length; i += 1) {
    out[canonicalKeys[i]] = pickByAliases(row, aliasSlots[i]);
  }
  return out;
}

/**
 * Normalize one card row to the published schema for tableKey + locale.
 * Values are moved; never rewritten.
 */
export function normalizeCommentaryCardRow(tableKey, locale, row) {
  if (!row || typeof row !== 'object') return row;

  if (tableKey === MATTHEW_HENRY_TABLE_KEY) {
    const canonical =
      MATTHEW_HENRY_FIELDS_BY_LOCALE[locale] ||
      MATTHEW_HENRY_FIELDS_BY_LOCALE['ko-KR'];
    return normalizeByAliasSlots(row, canonical, MH_ALIASES_BY_SLOT);
  }

  const canonical = NON_MATTHEW_HENRY_FIELDS_BY_TABLE[tableKey];
  const aliases = NON_MH_ALIASES_BY_TABLE[tableKey];
  if (!canonical || !aliases) return { ...row };
  return normalizeByAliasSlots(row, canonical, aliases);
}

export function normalizeCommentaryTableRows(tableKey, locale, rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => normalizeCommentaryCardRow(tableKey, locale, row));
}

export function getCanonicalFieldsForTable(tableKey, locale) {
  if (tableKey === MATTHEW_HENRY_TABLE_KEY) {
    return (
      MATTHEW_HENRY_FIELDS_BY_LOCALE[locale] ||
      MATTHEW_HENRY_FIELDS_BY_LOCALE['ko-KR']
    );
  }
  return NON_MATTHEW_HENRY_FIELDS_BY_TABLE[tableKey] || null;
}

/**
 * Validate rows against locale schema. Empty required values => fail.
 */
export function validateCommentaryTableRows(tableKey, locale, rows, options = {}) {
  const failures = [];
  const canonical = getCanonicalFieldsForTable(tableKey, locale);
  if (!canonical) {
    return { ok: true, failures };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    if (options.allowMissing) return { ok: true, failures };
    failures.push({ code: 'missing_table', tableKey });
    return { ok: false, failures };
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const keys = Object.keys(row);
    if (keys.length !== canonical.length || keys.some((k, i) => k !== canonical[i])) {
      // Allow same keys in any order if set matches exactly.
      const sameSet =
        keys.length === canonical.length &&
        canonical.every((k) => Object.prototype.hasOwnProperty.call(row, k));
      if (!sameSet) {
        failures.push({
          code: 'field_schema_mismatch',
          tableKey,
          index,
          expected: [...canonical],
          actual: keys,
        });
      }
    }
    for (const field of canonical) {
      if (!String(row[field] ?? '').trim()) {
        failures.push({
          code: 'empty_field',
          tableKey,
          index,
          field,
        });
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
