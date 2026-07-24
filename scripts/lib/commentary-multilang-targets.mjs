/**
 * Range-based multilingual commentary target planner.
 * Read-only: discovers verse/type/locale targets and inspects local state.
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  COMMENTARY_TYPES,
  assertTypeCardHighlightEligible,
  extractSourceCards,
  getCommentaryType,
  resolveCommentaryTypes,
} from './commentary-type-registry.mjs';
import {
  buildAudioPath,
  buildBaseCommentaryAudioId,
  buildCuePath,
  buildLocalizedCommentaryAudioId,
  buildNarrationMetaPath,
  buildNarrationPath,
  buildPublicAudioUrl,
  buildR2Key,
  getLocaleConfig,
  normalizeLocales,
  pad3,
} from './commentary-multilang-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GOMNA_ROOT || path.resolve(__dirname, '../..');

const BOOK_ID_TO_NAME = Object.freeze({
  genesis: '창세기',
  exodus: '출애굽기',
  leviticus: '레위기',
  numbers: '민수기',
  deuteronomy: '신명기',
  joshua: '여호수아',
  judges: '사사기',
  ruth: '룻기',
  '1samuel': '사무엘상',
  '2samuel': '사무엘하',
  '1kings': '열왕기상',
  '2kings': '열왕기하',
  '1chronicles': '역대상',
  '2chronicles': '역대하',
  ezra: '에스라',
  nehemiah: '느헤미야',
  esther: '에스더',
  job: '욥기',
  psalms: '시편',
  proverbs: '잠언',
  ecclesiastes: '전도서',
  song: '아가',
  isaiah: '이사야',
  jeremiah: '예레미야',
  lamentations: '예레미야애가',
  ezekiel: '에스겔',
  daniel: '다니엘',
  hosea: '호세아',
  joel: '요엘',
  amos: '아모스',
  obadiah: '오바댜',
  jonah: '요나',
  micah: '미가',
  nahum: '나훔',
  habakkuk: '하박국',
  zephaniah: '스바냐',
  haggai: '학개',
  zechariah: '스가랴',
  malachi: '말라기',
  matthew: '마태복음',
  mark: '마가복음',
  luke: '누가복음',
  john: '요한복음',
  acts: '사도행전',
  romans: '로마서',
  '1corinthians': '고린도전서',
  '2corinthians': '고린도후서',
  galatians: '갈라디아서',
  ephesians: '에베소서',
  philippians: '빌립보서',
  colossians: '골로새서',
  '1thessalonians': '데살로니가전서',
  '2thessalonians': '데살로니가후서',
  '1timothy': '디모데전서',
  '2timothy': '디모데후서',
  titus: '디도서',
  philemon: '빌레몬서',
  hebrews: '히브리서',
  james: '야고보서',
  '1peter': '베드로전서',
  '2peter': '베드로후서',
  '1john': '요한일서',
  '2john': '요한이서',
  '3john': '요한삼서',
  jude: '유다서',
  revelation: '요한계시록',
});

const commentaryDataCache = new Map();
let manifestCache = null;

function toAbsolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function buildVerseKey(bookName, chapter, verse) {
  return `${bookName}_${chapter}_${verse}`;
}

function loadCommentaryData(bookId) {
  if (commentaryDataCache.has(bookId)) {
    return commentaryDataCache.get(bookId);
  }

  const filePath = path.join(ROOT, `gomna_data_${bookId}.js`);
  if (!fs.existsSync(filePath)) {
    const result = { ok: false, error: 'data_file_missing', data: null };
    commentaryDataCache.set(bookId, result);
    return result;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    window: { pastorCommentaryData: {} },
    pastorCommentaryData: {},
    commentaryData: {},
    module: { exports: {} },
  };

  try {
    vm.runInNewContext(source, sandbox, { filename: filePath });
    const data = Object.keys(sandbox.pastorCommentaryData).length
      ? sandbox.pastorCommentaryData
      : sandbox.window.pastorCommentaryData;
    const result = { ok: true, error: null, data };
    commentaryDataCache.set(bookId, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      error: `data_load_failed: ${error.message}`,
      data: null,
    };
    commentaryDataCache.set(bookId, result);
    return result;
  }
}

function loadManifestAudios() {
  if (manifestCache) return manifestCache;

  const manifestPath = path.join(ROOT, 'audio/audio-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    manifestCache = { ok: false, error: 'manifest_missing', audios: {} };
    return manifestCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const audios =
      parsed && parsed.audios && typeof parsed.audios === 'object'
        ? parsed.audios
        : {};
    manifestCache = { ok: true, error: null, audios };
    return manifestCache;
  } catch (error) {
    manifestCache = {
      ok: false,
      error: `manifest_parse_failed: ${error.message}`,
      audios: {},
    };
    return manifestCache;
  }
}

function resolveTypeConfigs({ type, types }) {
  return resolveCommentaryTypes({ type, types });
}

function parseMetaApproval(metaAbsolutePath) {
  if (!fs.existsSync(metaAbsolutePath)) {
    return {
      metaExists: false,
      metaApproved: false,
      metaError: null,
    };
  }

  try {
    const raw = fs.readFileSync(metaAbsolutePath, 'utf8');
    const parsed = JSON.parse(raw);
    const approved = parsed && parsed.status === 'approved';
    return {
      metaExists: true,
      metaApproved: !!approved,
      metaError: null,
      metaStatus: parsed && parsed.status != null ? String(parsed.status) : null,
    };
  } catch (error) {
    return {
      metaExists: true,
      metaApproved: false,
      metaError: `malformed_metadata: ${error.message}`,
    };
  }
}

function inspectLocalState(target) {
  const narrationAbs = toAbsolute(target.narrationPath);
  const metaAbs = toAbsolute(target.metaPath);
  const audioAbs = toAbsolute(target.audioPath);
  const cueAbs = toAbsolute(target.cuePath);

  const meta = parseMetaApproval(metaAbs);
  const manifest = loadManifestAudios();
  const entry = manifest.audios[target.audioId] || null;

  return {
    narrationExists: fs.existsSync(narrationAbs),
    metaExists: meta.metaExists,
    metaApproved: meta.metaApproved,
    metaError: meta.metaError,
    metaStatus: meta.metaStatus || null,
    audioExists: fs.existsSync(audioAbs),
    cueExists: fs.existsSync(cueAbs),
    manifestExists: !!entry,
    manifestPublished: !!(entry && entry.status === 'published'),
    manifestError: manifest.ok ? null : manifest.error,
  };
}

/**
 * Parse "chapter:verse" refs used by pipeline v2.
 */
export function parseChapterVerseRef(value, label = 'verseRef') {
  const raw = String(value == null ? '' : value).trim();
  const match = raw.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) {
    throw new Error(`Invalid ${label}: ${value} (expected chapter:verse)`);
  }
  const chapter = Number(match[1]);
  const verse = Number(match[2]);
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`Invalid ${label} chapter: ${value}`);
  }
  if (!Number.isInteger(verse) || verse < 1) {
    throw new Error(`Invalid ${label} verse: ${value}`);
  }
  return { chapter, verse };
}

function compareChapterVerse(a, b) {
  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  return a.verse - b.verse;
}

/**
 * List Korean commentary verse keys for a book from gomna_data_*.js.
 * Sorted by chapter, verse.
 */
export function listKoreanCommentaryVerses(bookId) {
  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    throw new Error('bookId is required');
  }
  const bookName = BOOK_ID_TO_NAME[normalizedBookId];
  if (!bookName) {
    throw new Error(`Unsupported bookId: ${normalizedBookId}`);
  }

  const dataResult = loadCommentaryData(normalizedBookId);
  if (!dataResult.ok) {
    throw new Error(
      `Unable to load commentary data for ${normalizedBookId}: ${dataResult.error}`,
    );
  }

  const prefix = `${bookName}_`;
  const verses = [];
  for (const key of Object.keys(dataResult.data)) {
    if (!key.startsWith(prefix)) continue;
    const match = key.match(/^(.+)_(\d+)_(\d+)$/);
    if (!match || match[1] !== bookName) continue;
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    if (!Number.isInteger(chapter) || !Number.isInteger(verse)) continue;
    verses.push({
      bookId: normalizedBookId,
      bookName,
      chapter,
      verse,
      verseKey: key,
    });
  }

  verses.sort(compareChapterVerse);
  return verses;
}

/**
 * Resolve inclusive verse refs from Korean commentary source data.
 * Missing KO sources in the requested span are excluded with reasons.
 */
export function resolveCommentaryVerseRange(options = {}) {
  const bookId = String(options.bookId || options.book || '').trim();
  if (!bookId) {
    throw new Error('bookId is required');
  }

  const available = listKoreanCommentaryVerses(bookId);
  if (!available.length) {
    throw new Error(`No Korean commentary verses found for ${bookId}`);
  }

  let fromRef;
  let toRef;
  const hasFromTo = options.from != null || options.to != null;
  const hasChapterVerses =
    options.chapter != null ||
    options.fromVerse != null ||
    options.toVerse != null;

  if (hasFromTo) {
    if (options.from == null || options.to == null) {
      throw new Error('Both --from and --to are required when either is set');
    }
    fromRef = parseChapterVerseRef(options.from, 'from');
    toRef = parseChapterVerseRef(options.to, 'to');
  } else if (hasChapterVerses) {
    if (options.chapter == null || options.chapter === '') {
      throw new Error('chapter is required when using fromVerse/toVerse');
    }
    if (options.fromVerse == null || options.toVerse == null) {
      throw new Error('fromVerse and toVerse are required with chapter');
    }
    const chapter = Number(options.chapter);
    const fromVerse = Number(options.fromVerse);
    const toVerse = Number(options.toVerse);
    if (!Number.isInteger(chapter) || chapter < 1) {
      throw new Error(`Invalid chapter: ${options.chapter}`);
    }
    if (!Number.isInteger(fromVerse) || fromVerse < 1) {
      throw new Error(`Invalid fromVerse: ${options.fromVerse}`);
    }
    if (!Number.isInteger(toVerse) || toVerse < 1) {
      throw new Error(`Invalid toVerse: ${options.toVerse}`);
    }
    if (fromVerse > toVerse) {
      throw new Error(
        `Invalid range: fromVerse (${fromVerse}) must be <= toVerse (${toVerse})`,
      );
    }
    fromRef = { chapter, verse: fromVerse };
    toRef = { chapter, verse: toVerse };
  } else {
    fromRef = {
      chapter: available[0].chapter,
      verse: available[0].verse,
    };
    toRef = {
      chapter: available[available.length - 1].chapter,
      verse: available[available.length - 1].verse,
    };
  }

  if (compareChapterVerse(fromRef, toRef) > 0) {
    throw new Error(
      `Invalid range: ${fromRef.chapter}:${fromRef.verse} is after ${toRef.chapter}:${toRef.verse}`,
    );
  }

  const availableSet = new Set(
    available.map((item) => `${item.chapter}:${item.verse}`),
  );
  const selected = available.filter(
    (item) =>
      compareChapterVerse(item, fromRef) >= 0 &&
      compareChapterVerse(item, toRef) <= 0,
  );

  const excluded = [];
  // Report requested numeric holes only for same-chapter simple spans.
  if (fromRef.chapter === toRef.chapter) {
    for (let verse = fromRef.verse; verse <= toRef.verse; verse += 1) {
      const key = `${fromRef.chapter}:${verse}`;
      if (!availableSet.has(key)) {
        excluded.push({
          bookId,
          chapter: fromRef.chapter,
          verse,
          reason: 'missing_korean_commentary_source',
        });
      }
    }
  } else {
    // Cross-chapter: only note selected gaps that callers care about via selected list.
    // Explicit chapter:verse pairs outside KO source are still recorded when they match
    // chapter endpoints that were requested but absent.
    for (const edge of [fromRef, toRef]) {
      const key = `${edge.chapter}:${edge.verse}`;
      if (!availableSet.has(key)) {
        excluded.push({
          bookId,
          chapter: edge.chapter,
          verse: edge.verse,
          reason: 'missing_korean_commentary_source',
        });
      }
    }
  }

  return {
    bookId,
    bookName: BOOK_ID_TO_NAME[bookId],
    from: fromRef,
    to: toRef,
    verseCount: selected.length,
    verses: selected,
    excluded,
  };
}

function buildTargetsForVerseList({
  bookId,
  bookName,
  locales,
  typeConfigs,
  dataResult,
  verseList,
  strictMissingSource = true,
}) {
  const blockers = [];
  const softExclusions = [];
  const sourceKeys = [];
  const targets = [];
  const seenAudioIds = new Set();

  for (const verseRef of verseList) {
    const chapter = verseRef.chapter;
    const verse = verseRef.verse;
    const verseKey = buildVerseKey(bookName, chapter, verse);
    const entry = dataResult.data[verseKey];

    if (!entry || typeof entry !== 'object') {
      const message = `Missing commentary source for ${verseKey}`;
      if (strictMissingSource) {
        blockers.push(message);
      } else {
        softExclusions.push({
          bookId,
          chapter,
          verse,
          verseKey,
          reason: 'missing_korean_commentary_source',
        });
      }
      continue;
    }

    for (const typeConfig of typeConfigs) {
      let cards;
      try {
        cards = extractSourceCards(entry, typeConfig.type);
        assertTypeCardHighlightEligible(typeConfig.type);
      } catch (error) {
        blockers.push(`${verseKey}.${typeConfig.type}: ${error.message}`);
        continue;
      }

      const cardCount = cards.length;
      const cardIdentities = cards.map((card) => card.identity);

      sourceKeys.push({
        verseKey,
        chapter,
        verse,
        type: typeConfig.type,
        cardCount,
        tableKey: typeConfig.tableKey,
        cardIdentities,
      });

      const voicePreset = getCommentaryType(typeConfig.type).voicePreset;
      const baseAudioId = buildBaseCommentaryAudioId(
        bookId,
        chapter,
        verse,
        typeConfig.type,
      );

      for (const locale of locales) {
        const audioId = buildLocalizedCommentaryAudioId(baseAudioId, locale);

        if (seenAudioIds.has(audioId)) {
          throw new Error(`Duplicate target audioId: ${audioId}`);
        }
        seenAudioIds.add(audioId);

        const target = {
          locale,
          bookId,
          chapter,
          verse,
          type: typeConfig.type,
          commentaryType: typeConfig.type,
          cardCount,
          cardIdentities,
          cards,
          baseAudioId,
          audioId,
          voicePreset,
          narrationPath: buildNarrationPath(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
          ),
          metaPath: buildNarrationMetaPath(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
          ),
          audioPath: buildAudioPath(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
            voicePreset,
          ),
          cuePath: buildCuePath(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
          ),
          r2Key: buildR2Key(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
            voicePreset,
          ),
          publicUrl: buildPublicAudioUrl(
            bookId,
            chapter,
            verse,
            typeConfig.type,
            locale,
            voicePreset,
          ),
          chapter3: pad3(chapter),
          verse3: pad3(verse),
          verseKey,
          tableKey: typeConfig.tableKey,
          cardHighlightEligible: true,
        };

        const state = inspectLocalState(target);
        if (state.metaError) {
          blockers.push(`${audioId}: ${state.metaError}`);
        }
        if (state.manifestError) {
          blockers.push(`manifest: ${state.manifestError}`);
        }

        Object.assign(target, state);
        targets.push(target);
      }
    }
  }

  return {
    blockers,
    softExclusions,
    sourceKeys,
    targets,
  };
}

function assertPlanningBlockers(blockers) {
  if (blockers.some((item) => item.startsWith('Missing commentary source'))) {
    throw new Error(blockers.join('\n'));
  }

  if (blockers.some((item) => item.includes('malformed_metadata'))) {
    throw new Error(blockers.join('\n'));
  }

  if (
    blockers.some(
      (item) =>
        item.includes('Missing source table') ||
        item.includes('Empty source table'),
    )
  ) {
    throw new Error(blockers.join('\n'));
  }

  if (blockers.some((item) => item.startsWith('manifest:'))) {
    throw new Error(blockers.join('\n'));
  }
}

/**
 * Build ordered multilingual targets for a chapter verse range.
 * Legacy single-chapter planner (strict missing-source errors).
 */
export function buildCommentaryMultilangTargets(options = {}) {
  const locales = Array.isArray(options.locales)
    ? options.locales.map((item) => getLocaleConfig(item).locale)
    : normalizeLocales(options.locales);

  const bookId = String(options.bookId || '').trim();
  if (!bookId) {
    throw new Error('bookId is required');
  }

  const bookName = BOOK_ID_TO_NAME[bookId];
  if (!bookName) {
    throw new Error(`Unsupported bookId: ${bookId}`);
  }

  if (options.chapter == null || options.chapter === '') {
    throw new Error('chapter is required');
  }

  const chapter = Number(options.chapter);
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`Invalid chapter: ${options.chapter}`);
  }

  if (options.fromVerse == null || options.toVerse == null) {
    throw new Error('fromVerse and toVerse are required');
  }

  const fromVerse = Number(options.fromVerse);
  const toVerse = Number(options.toVerse);

  if (!Number.isInteger(fromVerse) || fromVerse < 1) {
    throw new Error(`Invalid fromVerse: ${options.fromVerse}`);
  }
  if (!Number.isInteger(toVerse) || toVerse < 1) {
    throw new Error(`Invalid toVerse: ${options.toVerse}`);
  }
  if (fromVerse > toVerse) {
    throw new Error(
      `Invalid range: fromVerse (${fromVerse}) must be <= toVerse (${toVerse})`,
    );
  }

  const typeConfigs = resolveTypeConfigs(options);
  const dataResult = loadCommentaryData(bookId);
  if (!dataResult.ok) {
    throw new Error(
      `Unable to load commentary data for ${bookId}: ${dataResult.error}`,
    );
  }

  const verseList = [];
  for (let verse = fromVerse; verse <= toVerse; verse += 1) {
    verseList.push({ chapter, verse });
  }

  const built = buildTargetsForVerseList({
    bookId,
    bookName,
    locales,
    typeConfigs,
    dataResult,
    verseList,
    strictMissingSource: true,
  });

  assertPlanningBlockers(built.blockers);

  return {
    bookId,
    bookName,
    chapter,
    fromVerse,
    toVerse,
    locales,
    types: typeConfigs.map((item) => item.type),
    sourceCount: built.sourceKeys.length,
    targetCount: built.targets.length,
    sourceKeys: built.sourceKeys,
    targets: built.targets,
    blockers: [],
  };
}

/**
 * Multi-chapter / book-wide target planner for pipeline v2.
 * Missing Korean sources are excluded with reasons instead of hard-failing.
 */
export function buildCommentaryMultilangRangeTargets(options = {}) {
  const locales = Array.isArray(options.locales)
    ? options.locales.map((item) => getLocaleConfig(item).locale)
    : normalizeLocales(options.locales);

  const bookId = String(options.bookId || options.book || '').trim();
  if (!bookId) {
    throw new Error('bookId is required');
  }

  const bookName = BOOK_ID_TO_NAME[bookId];
  if (!bookName) {
    throw new Error(`Unsupported bookId: ${bookId}`);
  }

  const range = resolveCommentaryVerseRange({
    bookId,
    from: options.from,
    to: options.to,
    chapter: options.chapter,
    fromVerse: options.fromVerse,
    toVerse: options.toVerse,
  });

  const typeConfigs = resolveTypeConfigs(options);
  const dataResult = loadCommentaryData(bookId);
  if (!dataResult.ok) {
    throw new Error(
      `Unable to load commentary data for ${bookId}: ${dataResult.error}`,
    );
  }

  const built = buildTargetsForVerseList({
    bookId,
    bookName,
    locales,
    typeConfigs,
    dataResult,
    verseList: range.verses,
    strictMissingSource: false,
  });

  // Type-table / metadata / manifest problems still hard-fail.
  const hardBlockers = built.blockers.filter(
    (item) => !item.startsWith('Missing commentary source'),
  );
  assertPlanningBlockers(hardBlockers);

  const excluded = [...range.excluded, ...built.softExclusions];

  return {
    bookId,
    bookName,
    from: range.from,
    to: range.to,
    chapter: range.from.chapter === range.to.chapter ? range.from.chapter : null,
    fromVerse: range.from.verse,
    toVerse: range.to.verse,
    locales,
    types: typeConfigs.map((item) => item.type),
    verseCount: range.verseCount,
    sourceCount: built.sourceKeys.length,
    targetCount: built.targets.length,
    sourceKeys: built.sourceKeys,
    targets: built.targets,
    excluded,
    blockers: [],
  };
}

/**
 * Read-only repository inventory for commentary source keys.
 * Does not write files.
 */
export function inventoryCommentarySource() {
  const uniqueVerseKeys = new Set();
  const uniqueTypedKeys = new Set();
  let typeRecordCount = 0;
  const malformedKeys = [];
  const duplicateKeys = [];
  const seenExact = new Set();
  const booksLoaded = [];
  const booksFailed = [];

  for (const [bookId, bookName] of Object.entries(BOOK_ID_TO_NAME)) {
    const loaded = loadCommentaryData(bookId);
    if (!loaded.ok) {
      booksFailed.push({ bookId, error: loaded.error });
      continue;
    }

    booksLoaded.push(bookId);
    const prefix = `${bookName}_`;

    for (const key of Object.keys(loaded.data)) {
      if (seenExact.has(key)) {
        duplicateKeys.push(key);
      } else {
        seenExact.add(key);
      }

      if (!key.startsWith(prefix)) {
        continue;
      }

      const match = key.match(/^(.+)_(\d+)_(\d+)$/);
      if (!match || match[1] !== bookName) {
        malformedKeys.push(key);
        continue;
      }

      const chapter = Number(match[2]);
      const verse = Number(match[3]);
      if (!Number.isInteger(chapter) || !Number.isInteger(verse)) {
        malformedKeys.push(key);
        continue;
      }

      const verseIdentity = `${bookId}.${pad3(chapter)}.${pad3(verse)}`;
      uniqueVerseKeys.add(verseIdentity);

      const entry = loaded.data[key];
      let hasAnyType = false;

      for (const typeConfig of COMMENTARY_TYPES) {
        const rows = entry && entry[typeConfig.tableKey];
        if (Array.isArray(rows) && rows.length > 0) {
          hasAnyType = true;
          typeRecordCount += 1;
          uniqueTypedKeys.add(`${verseIdentity}.${typeConfig.type}`);
        }
      }

      if (!hasAnyType) {
        // verse key exists but no commentary tables
      }
    }
  }

  return {
    booksLoadedCount: booksLoaded.length,
    booksFailed,
    uniqueVerseKeysWithAnyStructure: uniqueVerseKeys.size,
    uniqueVerseKeysWithAtLeastOneType: new Set(
      [...uniqueTypedKeys].map((key) => key.split('.').slice(0, 3).join('.')),
    ).size,
    totalCommentaryTypeRecords: typeRecordCount,
    duplicateExactKeys: duplicateKeys,
    malformedKeys,
  };
}

/**
 * Load registry-extracted source cards for one verse/type.
 * Used by narration inspection so non-original-language types are validated
 * by card extraction rather than TTS paragraph count.
 */
export function loadCommentarySourceCards(bookId, chapter, verse, type) {
  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    throw new Error('bookId is required');
  }
  const bookName = BOOK_ID_TO_NAME[normalizedBookId];
  if (!bookName) {
    throw new Error(`Unsupported bookId: ${normalizedBookId}`);
  }

  const chapterNumber = Number(chapter);
  const verseNumber = Number(verse);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error(`Invalid chapter: ${chapter}`);
  }
  if (!Number.isInteger(verseNumber) || verseNumber < 1) {
    throw new Error(`Invalid verse: ${verse}`);
  }

  const dataResult = loadCommentaryData(normalizedBookId);
  if (!dataResult.ok) {
    throw new Error(
      `Unable to load commentary data for ${normalizedBookId}: ${dataResult.error}`,
    );
  }

  const verseKey = buildVerseKey(bookName, chapterNumber, verseNumber);
  const entry = dataResult.data[verseKey];
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Missing commentary source for ${verseKey}`);
  }

  const cards = extractSourceCards(entry, type);
  return {
    verseKey,
    tableKey: getCommentaryType(type).tableKey,
    cardCount: cards.length,
    cards,
  };
}

export { BOOK_ID_TO_NAME, COMMENTARY_TYPES, ROOT };
