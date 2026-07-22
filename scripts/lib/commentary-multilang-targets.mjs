/**
 * Range-based multilingual commentary target planner.
 * Read-only: discovers verse/type/locale targets and inspects local state.
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { COMMENTARY_TYPES } from './commentary-highlight-plan.mjs';
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
  const hasType = type != null && String(type).trim() !== '';
  const hasTypes = types != null && String(types).trim() !== '';

  if (hasType === hasTypes) {
    throw new Error('Exactly one of type or types=all is required');
  }

  if (hasTypes) {
    if (String(types).trim() !== 'all') {
      throw new Error('types must be exactly "all" when provided');
    }
    return COMMENTARY_TYPES.slice();
  }

  const requested = String(type).trim();
  const matched = COMMENTARY_TYPES.find((item) => item.type === requested);
  if (!matched) {
    throw new Error(`Unknown commentary type: ${requested}`);
  }
  return [matched];
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
 * Build ordered multilingual targets for a chapter verse range.
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

  const blockers = [];
  const sourceKeys = [];
  const targets = [];
  const seenAudioIds = new Set();

  for (let verse = fromVerse; verse <= toVerse; verse += 1) {
    const verseKey = buildVerseKey(bookName, chapter, verse);
    const entry = dataResult.data[verseKey];

    if (!entry || typeof entry !== 'object') {
      blockers.push(`Missing commentary source for ${verseKey}`);
      continue;
    }

    for (const typeConfig of typeConfigs) {
      const rows = entry[typeConfig.tableKey];
      if (!Array.isArray(rows) || rows.length === 0) {
        blockers.push(
          `Missing or empty ${typeConfig.tableKey} for ${verseKey}`,
        );
        continue;
      }

      sourceKeys.push({
        verseKey,
        chapter,
        verse,
        type: typeConfig.type,
        cardCount: rows.length,
        tableKey: typeConfig.tableKey,
      });

      const voicePreset = typeConfig.voicePreset || 'study';
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
          cardCount: rows.length,
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

  if (blockers.some((item) => item.startsWith('Missing commentary source'))) {
    throw new Error(blockers.join('\n'));
  }

  if (blockers.some((item) => item.includes('malformed_metadata'))) {
    throw new Error(blockers.join('\n'));
  }

  if (blockers.some((item) => item.startsWith('Missing or empty'))) {
    throw new Error(blockers.join('\n'));
  }

  if (blockers.some((item) => item.startsWith('manifest:'))) {
    throw new Error(blockers.join('\n'));
  }

  return {
    bookId,
    bookName,
    chapter,
    fromVerse,
    toVerse,
    locales,
    types: typeConfigs.map((item) => item.type),
    sourceCount: sourceKeys.length,
    targetCount: targets.length,
    sourceKeys,
    targets,
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

export { BOOK_ID_TO_NAME, COMMENTARY_TYPES, ROOT };
