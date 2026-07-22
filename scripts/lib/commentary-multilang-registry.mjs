/**
 * Locale registry and pure path/ID helpers for multilingual commentary automation.
 * Read-only: no filesystem writes, no network, no side effects at import time.
 */

const PUBLIC_R2_BASE_URL =
  'https://pub-1606395d18b84b29b95f841e5fe9e008.r2.dev';

const REJECTED_LOCALES = new Set(['ko', 'ko-KR']);

const LOCALE_REGISTRY = Object.freeze({
  'en-US': Object.freeze({
    locale: 'en-US',
    primaryLanguage: 'en',
    audioIdSuffix: '.en-US',
    narrationRoot: 'tts-scripts/en-US',
    audioRoot: 'audio/v1/en-US',
    cueRoot: 'audio/cues/en-US',
    r2Root: 'commentary/en-US',
    publicR2BaseUrl: PUBLIC_R2_BASE_URL,
    defaultVoicePreset: 'study',
  }),
  'ja-JP': Object.freeze({
    locale: 'ja-JP',
    primaryLanguage: 'ja',
    audioIdSuffix: '.ja-JP',
    narrationRoot: 'tts-scripts/ja-JP',
    audioRoot: 'audio/v1/ja-JP',
    cueRoot: 'audio/cues/ja-JP',
    r2Root: 'commentary/ja-JP',
    publicR2BaseUrl: PUBLIC_R2_BASE_URL,
    defaultVoicePreset: 'study',
  }),
});

export function getLocaleConfig(locale) {
  if (locale == null || String(locale).trim() === '') {
    throw new Error('locale is required');
  }

  const normalized = String(locale).trim();

  if (REJECTED_LOCALES.has(normalized)) {
    throw new Error(`Korean locale is rejected: ${normalized}`);
  }

  const config = LOCALE_REGISTRY[normalized];
  if (!config) {
    throw new Error(
      `Unsupported locale: ${normalized}. Allowed: ${Object.keys(LOCALE_REGISTRY).join(', ')}`,
    );
  }

  return config;
}

export function normalizeLocales(value) {
  if (value == null || String(value).trim() === '') {
    throw new Error('locales is required');
  }

  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('locales is required');
  }

  const seen = new Set();
  const locales = [];

  for (const part of parts) {
    getLocaleConfig(part);
    if (seen.has(part)) {
      throw new Error(`Duplicate locale: ${part}`);
    }
    seen.add(part);
    locales.push(part);
  }

  return locales;
}

export function pad3(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid pad3 input: ${value}`);
  }
  return String(number).padStart(3, '0');
}

function requireNonEmptyString(label, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function buildBaseCommentaryAudioId(bookId, chapter, verse, type) {
  const book = requireNonEmptyString('bookId', bookId);
  const commentaryType = requireNonEmptyString('type', type);
  return `${book}.${pad3(chapter)}.${pad3(verse)}.${commentaryType}`;
}

export function buildLocalizedCommentaryAudioId(baseAudioId, locale) {
  const base = requireNonEmptyString('baseAudioId', baseAudioId);
  const config = getLocaleConfig(locale);

  if (base.endsWith(config.audioIdSuffix)) {
    throw new Error(
      `baseAudioId already includes locale suffix: ${base}`,
    );
  }

  if (/\.(en-US|ja-JP)$/.test(base)) {
    throw new Error(
      `baseAudioId must be locale-free: ${base}`,
    );
  }

  return `${base}${config.audioIdSuffix}`;
}

export function buildNarrationPath(bookId, chapter, verse, type, locale) {
  const config = getLocaleConfig(locale);
  return [
    config.narrationRoot,
    requireNonEmptyString('bookId', bookId),
    pad3(chapter),
    pad3(verse),
    `${requireNonEmptyString('type', type)}.txt`,
  ].join('/');
}

export function buildNarrationMetaPath(bookId, chapter, verse, type, locale) {
  const narrationPath = buildNarrationPath(
    bookId,
    chapter,
    verse,
    type,
    locale,
  );
  return narrationPath.replace(/\.txt$/, '.meta.json');
}

export function buildAudioPath(
  bookId,
  chapter,
  verse,
  type,
  locale,
  voicePreset,
) {
  const config = getLocaleConfig(locale);
  const preset = requireNonEmptyString(
    'voicePreset',
    voicePreset || config.defaultVoicePreset,
  );
  return [
    config.audioRoot,
    requireNonEmptyString('bookId', bookId),
    pad3(chapter),
    pad3(verse),
    `${requireNonEmptyString('type', type)}-${preset}.mp3`,
  ].join('/');
}

export function buildCuePath(bookId, chapter, verse, type, locale) {
  const config = getLocaleConfig(locale);
  return [
    config.cueRoot,
    requireNonEmptyString('bookId', bookId),
    pad3(chapter),
    pad3(verse),
    `${requireNonEmptyString('type', type)}.json`,
  ].join('/');
}

export function buildR2Key(bookId, chapter, verse, type, locale, voicePreset) {
  const config = getLocaleConfig(locale);
  const preset = requireNonEmptyString(
    'voicePreset',
    voicePreset || config.defaultVoicePreset,
  );
  return [
    config.r2Root,
    requireNonEmptyString('bookId', bookId),
    pad3(chapter),
    pad3(verse),
    `${requireNonEmptyString('type', type)}-${preset}.mp3`,
  ].join('/');
}

export function buildPublicAudioUrl(
  bookId,
  chapter,
  verse,
  type,
  locale,
  voicePreset,
) {
  const config = getLocaleConfig(locale);
  const key = buildR2Key(
    bookId,
    chapter,
    verse,
    type,
    locale,
    voicePreset,
  );
  return `${config.publicR2BaseUrl}/${key}`;
}

export const COMMENTARY_MULTILANG_LOCALES = Object.freeze(
  Object.keys(LOCALE_REGISTRY),
);

export const COMMENTARY_MULTILANG_PUBLIC_R2_BASE_URL = PUBLIC_R2_BASE_URL;
