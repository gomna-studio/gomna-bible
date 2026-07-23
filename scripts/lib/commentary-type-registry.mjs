/**
 * Authoritative commentary-type registry for multilingual automation.
 * Single source of truth for type IDs, presets, labels, and card extraction.
 * Import-side-effect free.
 */

export const COMMENTARY_MULTILANG_SUPPORTED_LOCALES = Object.freeze([
  'en-US',
  'ja-JP',
]);

export const COMMENTARY_VOICE_PRESETS = Object.freeze([
  'study',
  'warm',
  'calm',
  'strong',
  'soft',
]);

const SUPPORTED_LOCALE_SET = new Set(COMMENTARY_MULTILANG_SUPPORTED_LOCALES);
const VOICE_PRESET_SET = new Set(COMMENTARY_VOICE_PRESETS);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    freezeDeep(nested);
  }
  return Object.freeze(value);
}

function requireNonEmptyString(label, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function identityFromFields(row, fields) {
  const parts = fields
    .map((field) => firstNonEmpty(row?.[field]))
    .filter(Boolean);
  return parts.length ? parts.join('|') : '';
}

/**
 * Authoritative nine-type list in UI order.
 */
const TYPE_DEFINITIONS = [
  {
    type: 'original-language',
    labels: {
      ko: '원어분석',
      en: 'Original Language Analysis',
      ja: '原語分析',
    },
    tableKey: '표1_원어분석',
    manifestType: 'original-language',
    fileSlug: 'original-language',
    cueSlug: 'original-language',
    voicePreset: 'study',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['원어'],
    narrationStructurePolicy: Object.freeze({
      kind: 'intro_card_lines_closing',
      requireExactThreeParagraphs: true,
      retainHebrewTerms: true,
      closingRequiredWhenPresentInSource: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        "The key original words in this verse are 'bereshit' and 'bara'.",
      'ja-JP': 'この節の重要な原語は「ベレシート」と「バーラー」です。',
    }),
  },
  {
    type: 'history',
    labels: {
      ko: '역사적배경',
      en: 'Historical Background',
      ja: '歴史的背景',
    },
    tableKey: '표2_역사적배경',
    manifestType: 'history',
    fileSlug: 'history',
    cueSlug: 'history',
    voicePreset: 'warm',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['항목'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This explores the historical background of the passage.',
      'ja-JP': 'この箇所が記された時代背景を見つめます。',
    }),
  },
  {
    type: 'theology',
    labels: {
      ko: '신학적의미',
      en: 'Theological Significance',
      ja: '神学的意義',
    },
    tableKey: '표3_신학적의미',
    manifestType: 'theology',
    fileSlug: 'theology',
    cueSlug: 'theology',
    voicePreset: 'warm',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['교리'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This explores the theological meaning of the passage.',
      'ja-JP': 'この御言葉の神学的意義を見つめます。',
    }),
  },
  {
    type: 'typology',
    labels: {
      ko: '예표론',
      en: 'Typology',
      ja: '予表',
    },
    tableKey: '표4_예표론',
    manifestType: 'typology',
    fileSlug: 'typology',
    cueSlug: 'typology',
    voicePreset: 'study',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['구분'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This explores how the passage connects to redemptive history.',
      'ja-JP': 'この本文が救済史とどう結びつくかを見つめます。',
    }),
  },
  {
    type: 'matthew-henry',
    labels: {
      ko: '매튜헨리',
      en: 'Matthew Henry',
      ja: 'マシュー・ヘンリー',
    },
    tableKey: '표5_매튜헨리',
    manifestType: 'matthew-henry',
    fileSlug: 'matthew-henry',
    cueSlug: 'matthew-henry',
    voicePreset: 'calm',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 3,
    identityFields: ['영어원문', '핵심통찰'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: false,
      multiParagraphCards: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: false,
      allowMultiParagraphItems: true,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        "This presents Matthew Henry's classic reading of the verse.",
      'ja-JP': 'この節に対するマシュー・ヘンリーの古典的解釈を見つめます。',
    }),
  },
  {
    type: 'sermon',
    labels: {
      ko: '설교자료',
      en: 'Sermon Materials',
      ja: '説教資料',
    },
    tableKey: '표6_설교자료',
    manifestType: 'sermon',
    fileSlug: 'sermon',
    cueSlug: 'sermon',
    voicePreset: 'strong',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['대지'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: false,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: false,
      allowMultiParagraphItems: false,
      requireContiguousItemIndexes: true,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This highlights what to emphasize when preaching the passage.',
      'ja-JP': 'この本文を説教するとき強調すべき内容を見つめます。',
    }),
  },
  {
    type: 'hymn',
    labels: {
      ko: '찬송가',
      en: 'Hymn',
      ja: '賛美歌',
    },
    tableKey: '표7_찬송가',
    manifestType: 'hymn',
    fileSlug: 'hymn',
    cueSlug: 'hymn',
    voicePreset: 'soft',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['제목', '새찬송가', '통일찬송가'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: true,
      allowBridgeParagraph: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: true,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This suggests a hymn for meditating on the passage.',
      'ja-JP': 'この御言葉とともに黙想できる賛美歌を見つめます。',
    }),
  },
  {
    type: 'counseling',
    labels: {
      ko: '상담적용',
      en: 'Counseling Application',
      ja: 'カウンセリング適用',
    },
    tableKey: '표8_상담적용',
    manifestType: 'counseling',
    fileSlug: 'counseling',
    cueSlug: 'counseling',
    voicePreset: 'warm',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['상황'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: true,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: true,
      allowMultiParagraphItems: false,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This applies the passage to the heart and daily life.',
      'ja-JP': 'この御言葉が今の心と生活にどう適用されるかを見つめます。',
    }),
  },
  {
    type: 'cross-reference',
    labels: {
      ko: '교차참조',
      en: 'Cross-References',
      ja: '引照',
    },
    tableKey: '표9_교차참조',
    manifestType: 'cross-reference',
    fileSlug: 'cross-reference',
    cueSlug: 'cross-reference',
    voicePreset: 'calm',
    supportedLocales: COMMENTARY_MULTILANG_SUPPORTED_LOCALES,
    paragraphsPerItem: 1,
    identityFields: ['구절'],
    narrationStructurePolicy: Object.freeze({
      kind: 'mirror_korean_source',
      requireExactThreeParagraphs: false,
      retainHebrewTerms: false,
      closingRequiredWhenPresentInSource: false,
    }),
    cueSegmentPolicy: Object.freeze({
      allowBridge: false,
      requireClosing: false,
      allowMultiParagraphItems: false,
      requireContiguousItemIndexes: true,
    }),
    uploadEligible: true,
    manifestEligible: true,
    cardHighlightEligible: true,
    previews: Object.freeze({
      'en-US':
        'This gathers other Scriptures connected to the verse.',
      'ja-JP': 'この節と結びつく他の御言葉を見つめます。',
    }),
  },
].map((definition) => freezeDeep(definition));

const TYPE_BY_ID = new Map(
  TYPE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

/**
 * Compatibility shape consumed by Korean highlight/cue planners.
 */
export const COMMENTARY_TYPES = Object.freeze(
  TYPE_DEFINITIONS.map((definition) =>
    Object.freeze({
      type: definition.type,
      voicePreset: definition.voicePreset,
      tableKey: definition.tableKey,
      ...(definition.paragraphsPerItem > 1
        ? { paragraphsPerItem: definition.paragraphsPerItem }
        : {}),
    }),
  ),
);

export function listCommentaryTypes() {
  return TYPE_DEFINITIONS.slice();
}

export function getCommentaryType(type) {
  const normalized = requireNonEmptyString('type', type);
  const definition = TYPE_BY_ID.get(normalized);
  if (!definition) {
    throw new Error(
      `Unknown commentary type: ${normalized}. Allowed: ${TYPE_DEFINITIONS.map((item) => item.type).join(', ')}`,
    );
  }
  return definition;
}

export function isRegisteredCommentaryType(type) {
  return TYPE_BY_ID.has(String(type || '').trim());
}

export function getCommentaryVoicePreset(type) {
  return getCommentaryType(type).voicePreset;
}

export function assertVoicePresetForType(type, voicePreset) {
  const definition = getCommentaryType(type);
  const preset = requireNonEmptyString('voicePreset', voicePreset);
  if (!VOICE_PRESET_SET.has(preset)) {
    throw new Error(
      `Unsupported voicePreset: ${preset}. Allowed: ${COMMENTARY_VOICE_PRESETS.join(', ')}`,
    );
  }
  if (preset !== definition.voicePreset) {
    throw new Error(
      `voicePreset=${preset} does not match type ${definition.type} (expected ${definition.voicePreset})`,
    );
  }
  return preset;
}

export function buildCommentaryMp3FileName(type, voicePreset) {
  const definition = getCommentaryType(type);
  const preset = assertVoicePresetForType(
    definition.type,
    voicePreset || definition.voicePreset,
  );
  return `${definition.fileSlug}-${preset}.mp3`;
}

export function buildCommentaryCueFileName(type) {
  const definition = getCommentaryType(type);
  return `${definition.cueSlug}.json`;
}

export function getCommentaryTypeKr(type) {
  return getCommentaryType(type).labels.ko;
}

export function getCommentaryManifestPreview(locale, type) {
  const definition = getCommentaryType(type);
  const normalizedLocale = requireNonEmptyString('locale', locale);
  if (!SUPPORTED_LOCALE_SET.has(normalizedLocale)) {
    throw new Error(
      `Unsupported locale for commentary preview: ${normalizedLocale}`,
    );
  }
  const preview = definition.previews?.[normalizedLocale];
  if (typeof preview !== 'string' || !preview.trim()) {
    throw new Error(
      `Missing manifest preview for ${normalizedLocale}/${definition.type}`,
    );
  }
  return preview;
}

export function getNarrationStructurePolicy(type) {
  return getCommentaryType(type).narrationStructurePolicy;
}

export function getCueSegmentPolicy(type) {
  return getCommentaryType(type).cueSegmentPolicy;
}

/**
 * Extract highlightable spoken cards from a verse commentary entry.
 * One source table row = one card. Nested links are never expanded.
 */
export function extractSourceCards(verseEntry, type) {
  const definition = getCommentaryType(type);
  if (!verseEntry || typeof verseEntry !== 'object') {
    throw new Error('verseEntry must be an object');
  }

  const rows = verseEntry[definition.tableKey];
  if (!Array.isArray(rows)) {
    throw new Error(
      `Missing source table ${definition.tableKey} for type ${definition.type}`,
    );
  }
  if (!rows.length) {
    throw new Error(
      `Empty source table ${definition.tableKey} for type ${definition.type}`,
    );
  }

  const cards = rows.map((row, itemIndex) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(
        `Invalid source row at ${definition.type}[${itemIndex}]`,
      );
    }

    const fields = { ...row };
    let identity = identityFromFields(fields, definition.identityFields);
    if (!identity) {
      identity = `${definition.type}:${itemIndex}`;
    }

    return Object.freeze({
      itemIndex,
      identity,
      fields: Object.freeze(fields),
      type: definition.type,
      tableKey: definition.tableKey,
    });
  });

  // Stable contiguous indexes: 0..n-1 with no gaps.
  for (let index = 0; index < cards.length; index += 1) {
    if (cards[index].itemIndex !== index) {
      throw new Error(
        `Non-contiguous card itemIndex at ${definition.type}: expected ${index}`,
      );
    }
  }

  return Object.freeze(cards);
}

export function extractSourceCardCount(verseEntry, type) {
  return extractSourceCards(verseEntry, type).length;
}

/**
 * Resolve --type / --types / --types all into registry-ordered unique types.
 */
export function resolveCommentaryTypes(options = {}) {
  const hasType = options.type != null && String(options.type).trim() !== '';
  const hasTypes = options.types != null && String(options.types).trim() !== '';

  if (hasType === hasTypes) {
    throw new Error('Exactly one of --type or --types is required');
  }

  if (hasType) {
    return [getCommentaryType(options.type)];
  }

  const raw = String(options.types).trim();
  if (!raw) {
    throw new Error('--types must not be empty');
  }

  if (raw === 'all') {
    return listCommentaryTypes();
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('--types must not be empty');
  }

  const seen = new Set();
  for (const part of parts) {
    getCommentaryType(part);
    if (seen.has(part)) {
      throw new Error(`Duplicate commentary type: ${part}`);
    }
    seen.add(part);
  }

  // Normalize to authoritative registry order.
  return listCommentaryTypes().filter((definition) => seen.has(definition.type));
}

/**
 * Canonical allowed-target string used by write guards.
 * Single-type form remains: genesis:1:1-3:original-language:en-US,ja-JP
 * Multi-type form uses registry order: genesis:1:1-3:history,theology:en-US,ja-JP
 */
export function buildAllowedTargetString({
  book,
  chapter,
  fromVerse,
  toVerse,
  type,
  types,
  locales,
  typeList,
} = {}) {
  const bookId = requireNonEmptyString('book', book);
  const chapterNumber = Number(chapter);
  const from = Number(fromVerse);
  const to = Number(toVerse);

  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error(`Invalid chapter: ${chapter}`);
  }
  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`Invalid fromVerse: ${fromVerse}`);
  }
  if (!Number.isInteger(to) || to < 1) {
    throw new Error(`Invalid toVerse: ${toVerse}`);
  }
  if (from > to) {
    throw new Error(`Invalid verse range: ${from}-${to}`);
  }

  let resolvedTypes;
  if (Array.isArray(typeList) && typeList.length) {
    resolvedTypes = typeList.map((item) =>
      typeof item === 'string' ? getCommentaryType(item) : getCommentaryType(item.type),
    );
    // Keep provided order only when already registry-sorted unique subset;
    // otherwise re-order.
    const ids = resolvedTypes.map((item) => item.type);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new Error('Duplicate commentary type in allowed-target type list');
    }
    resolvedTypes = listCommentaryTypes().filter((item) => unique.has(item.type));
  } else {
    resolvedTypes = resolveCommentaryTypes({ type, types });
  }

  let localeList;
  if (Array.isArray(locales)) {
    localeList = locales.map((locale) => requireNonEmptyString('locale', locale));
  } else {
    localeList = String(locales || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (!localeList.length) {
    throw new Error('locales is required');
  }

  const seenLocales = new Set();
  for (const locale of localeList) {
    if (!SUPPORTED_LOCALE_SET.has(locale)) {
      throw new Error(`Unsupported locale in allowed-target: ${locale}`);
    }
    if (seenLocales.has(locale)) {
      throw new Error(`Duplicate locale in allowed-target: ${locale}`);
    }
    seenLocales.add(locale);
  }

  return [
    bookId,
    String(chapterNumber),
    `${from}-${to}`,
    resolvedTypes.map((item) => item.type).join(','),
    localeList.join(','),
  ].join(':');
}

export function assertTypeUploadEligible(type) {
  const definition = getCommentaryType(type);
  if (!definition.uploadEligible) {
    throw new Error(`Type is not upload-eligible: ${definition.type}`);
  }
  return definition;
}

export function assertTypeManifestEligible(type) {
  const definition = getCommentaryType(type);
  if (!definition.manifestEligible) {
    throw new Error(`Type is not manifest-eligible: ${definition.type}`);
  }
  return definition;
}

export function assertTypeCardHighlightEligible(type) {
  const definition = getCommentaryType(type);
  if (!definition.cardHighlightEligible) {
    throw new Error(`Type is not card-highlight-eligible: ${definition.type}`);
  }
  return definition;
}
