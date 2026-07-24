/**
 * Book-level multilingual commentary manifest shard loader.
 * Loads /audio/manifests/{locale}/{bookId}.json for en-US / ja-JP only.
 * Merges into the in-memory single-manifest cache without touching disk.
 */
(function() {
  'use strict';

  var SHARD_LOCALES = { 'en-US': true, 'ja-JP': true };
  var FORBIDDEN_LOCALES = { ko: true, 'ko-KR': true };

  function getConfig() {
    return window.GOMNA_AUDIO_CONFIG || null;
  }

  function ensureShardState(config) {
    if (!config._manifestShardState) {
      config._manifestShardState = {
        // key -> { status: 'loaded'|'error'|'loading', promise, result }
        cache: Object.create(null),
        conflicts: [],
        lastError: null
      };
    }
    return config._manifestShardState;
  }

  function buildShardCacheKey(locale, bookId) {
    return String(locale || '') + '::' + String(bookId || '');
  }

  function buildBookManifestShardPath(locale, bookId) {
    var normalizedLocale = String(locale || '').trim();
    var book = String(bookId || '').trim().toLowerCase();

    if (FORBIDDEN_LOCALES[normalizedLocale]) {
      throw new Error('Korean locale does not use commentary manifest shards');
    }
    if (!SHARD_LOCALES[normalizedLocale]) {
      throw new Error('Unsupported shard locale: ' + normalizedLocale);
    }
    if (!book || book.indexOf('/') >= 0 || book.indexOf('\\') >= 0 || book.indexOf('..') >= 0) {
      throw new Error('Invalid bookId for manifest shard: ' + bookId);
    }

    return '/audio/manifests/' + normalizedLocale + '/' + book + '.json';
  }

  function entriesDeepEqual(left, right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (e) {
      return false;
    }
  }

  /**
   * Merge shard audios into the base in-memory manifest.
   * Same ID + identical content => unchanged.
   * Same ID + different content => conflict (do not overwrite).
   */
  function mergeManifestShard(shardDocument, options) {
    var config = (options && options.config) || getConfig();
    var state = config ? ensureShardState(config) : null;
    var base = config && config.manifestData;
    var shardAudios = shardDocument && shardDocument.audios;
    var merged = 0;
    var unchanged = 0;
    var conflicts = [];
    var skipped = 0;
    var id;
    var incoming;
    var existing;

    if (!base || !base.audios || typeof base.audios !== 'object') {
      return {
        ok: false,
        reason: 'base_manifest_missing',
        merged: 0,
        unchanged: 0,
        conflicts: [],
        skipped: 0
      };
    }

    if (!shardAudios || typeof shardAudios !== 'object') {
      return {
        ok: false,
        reason: 'shard_audios_missing',
        merged: 0,
        unchanged: 0,
        conflicts: [],
        skipped: 0
      };
    }

    for (id in shardAudios) {
      if (!Object.prototype.hasOwnProperty.call(shardAudios, id)) continue;
      incoming = shardAudios[id];
      if (!incoming || typeof incoming !== 'object') {
        skipped += 1;
        continue;
      }

      existing = base.audios[id];
      if (!existing) {
        base.audios[id] = incoming;
        merged += 1;
        continue;
      }

      if (entriesDeepEqual(existing, incoming)) {
        unchanged += 1;
        continue;
      }

      conflicts.push({
        id: id,
        reason: 'existing_entry_differs',
        existingFilePath: existing.filePath || null,
        incomingFilePath: incoming.filePath || null
      });
    }

    if (typeof base.totalAudios === 'number') {
      base.totalAudios = Object.keys(base.audios).length;
    }

    if (state && conflicts.length) {
      state.conflicts = state.conflicts.concat(conflicts);
    }

    return {
      ok: conflicts.length === 0,
      reason: conflicts.length ? 'conflicts_present' : 'merged',
      merged: merged,
      unchanged: unchanged,
      conflicts: conflicts,
      skipped: skipped
    };
  }

  function parseAudioIdLocaleBook(audioId) {
    var parts;
    var locale = null;
    var bookId;
    var raw = String(audioId || '');

    if (/\.en-US$/.test(raw)) {
      locale = 'en-US';
      raw = raw.replace(/\.en-US$/, '');
    } else if (/\.ja-JP$/.test(raw)) {
      locale = 'ja-JP';
      raw = raw.replace(/\.ja-JP$/, '');
    } else {
      return null;
    }

    parts = raw.split('.');
    bookId = parts[0];
    if (!bookId) return null;
    return { locale: locale, bookId: bookId, audioId: audioId };
  }

  function fetchShardDocument(url, fetchImpl) {
    return fetchImpl(url, { cache: 'no-cache' }).then(function(res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        err.url = url;
        throw err;
      }
      return res.json();
    }).then(function(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('shard_root_invalid');
      }
      if (!data.audios || typeof data.audios !== 'object' || Array.isArray(data.audios)) {
        throw new Error('shard_audios_invalid');
      }
      return data;
    });
  }

  /**
   * Ensure one EN/JA book shard is loaded and merged.
   * KO / missing base manifest => no-op success (zero shard fetch).
   * Failures fall back to existing base manifest (do not throw to callers).
   */
  function ensureBookManifestShard(locale, bookId, options) {
    var opts = options || {};
    var config = opts.config || getConfig();
    var fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    var state;
    var key;
    var cached;
    var url;
    var promise;

    if (!config) {
      return Promise.resolve({
        ok: false,
        skipped: true,
        reason: 'config_missing',
        fetched: false
      });
    }

    state = ensureShardState(config);

    if (!locale || locale === 'ko' || locale === 'ko-KR' || FORBIDDEN_LOCALES[locale]) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: 'korean_or_unsupported_locale',
        fetched: false,
        locale: locale || null,
        bookId: bookId || null
      });
    }

    if (!SHARD_LOCALES[locale]) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: 'locale_not_sharded',
        fetched: false,
        locale: locale,
        bookId: bookId || null
      });
    }

    if (!bookId) {
      return Promise.resolve({
        ok: false,
        skipped: true,
        reason: 'bookId_missing',
        fetched: false
      });
    }

    if (!config.manifestData || !config.manifestData.audios) {
      // Base not ready — do not block the app; caller can retry later.
      return Promise.resolve({
        ok: false,
        skipped: true,
        reason: 'base_manifest_not_ready',
        fetched: false,
        locale: locale,
        bookId: bookId
      });
    }

    key = buildShardCacheKey(locale, bookId);
    cached = state.cache[key];
    if (cached && cached.promise) {
      return cached.promise;
    }
    if (cached && cached.status === 'loaded' && !opts.forceReload) {
      return Promise.resolve(cached.result);
    }
    if (cached && cached.status === 'error' && !opts.forceReload) {
      return Promise.resolve(cached.result);
    }

    if (typeof fetchImpl !== 'function') {
      return Promise.resolve({
        ok: false,
        skipped: true,
        reason: 'fetch_unavailable',
        fetched: false,
        locale: locale,
        bookId: bookId
      });
    }

    try {
      url = buildBookManifestShardPath(locale, bookId);
      var assetVersion = '';
      try {
        assetVersion = String(window.GOMNA_ASSET_VERSION || '').trim();
      } catch (eVer) { /* ignore */ }
      if (assetVersion) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(assetVersion);
      }
    } catch (pathError) {
      return Promise.resolve({
        ok: false,
        skipped: true,
        reason: pathError.message,
        fetched: false,
        locale: locale,
        bookId: bookId
      });
    }

    promise = fetchShardDocument(url, fetchImpl)
      .then(function(document) {
        var merge = mergeManifestShard(document, { config: config });
        var result = {
          ok: true,
          skipped: false,
          fetched: true,
          locale: locale,
          bookId: bookId,
          url: url,
          entryCount: Object.keys(document.audios || {}).length,
          merge: merge,
          fallback: false
        };
        state.cache[key] = { status: 'loaded', promise: null, result: result, document: document };
        state.lastError = null;

        try {
          window.dispatchEvent(
            new CustomEvent('gomna:manifest_shard_loaded', {
              detail: {
                locale: locale,
                bookId: bookId,
                entryCount: result.entryCount,
                merged: merge.merged,
                unchanged: merge.unchanged,
                conflicts: merge.conflicts.length
              }
            })
          );
        } catch (dispatchError) {
          // ignore environments without CustomEvent
        }

        return result;
      })
      .catch(function(error) {
        var result = {
          ok: false,
          skipped: false,
          fetched: true,
          fallback: true,
          locale: locale,
          bookId: bookId,
          url: url,
          reason:
            error && error.status === 404
              ? 'shard_404'
              : error && /JSON|invalid|Unexpected/i.test(String(error.message || error))
                ? 'shard_corrupt'
                : 'shard_network_error',
          errorMessage: error && error.message ? String(error.message) : String(error)
        };
        state.cache[key] = { status: 'error', promise: null, result: result };
        state.lastError = result;

        try {
          window.dispatchEvent(
            new CustomEvent('gomna:manifest_shard_fallback', {
              detail: {
                locale: locale,
                bookId: bookId,
                reason: result.reason
              }
            })
          );
        } catch (dispatchError2) {
          // ignore
        }

        // Never reject — app continues with base manifest only.
        return result;
      });

    state.cache[key] = { status: 'loading', promise: promise, result: null };
    return promise;
  }

  function ensureCommentaryManifestShardForAudioId(audioId, options) {
    var parsed = parseAudioIdLocaleBook(audioId);
    if (!parsed) {
      return Promise.resolve({
        ok: true,
        skipped: true,
        reason: 'not_multilang_commentary_id',
        fetched: false,
        audioId: audioId || null
      });
    }
    return ensureBookManifestShard(parsed.locale, parsed.bookId, options);
  }

  function getManifestEntry(audioId) {
    var config = getConfig();
    if (!config || !config.manifestData || !config.manifestData.audios) return null;
    return config.manifestData.audios[audioId] || null;
  }

  function attachApi() {
    var config = getConfig();
    if (!config) return;

    config.MANIFEST_SHARD_ROOT = '/audio/manifests';
    config.buildBookManifestShardPath = buildBookManifestShardPath;
    config.mergeManifestShard = mergeManifestShard;
    config.ensureBookManifestShard = ensureBookManifestShard;
    config.ensureCommentaryManifestShardForAudioId =
      ensureCommentaryManifestShardForAudioId;
    config.getManifestEntry = getManifestEntry;
    config.parseAudioIdLocaleBook = parseAudioIdLocaleBook;
  }

  attachApi();

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('gomna:manifest_loaded', function() {
      attachApi();
    });
  }

  // Re-attach when config object is replaced (tests).
  window.GOMNA_AUDIO_MANIFEST_SHARDS = {
    buildBookManifestShardPath: buildBookManifestShardPath,
    mergeManifestShard: mergeManifestShard,
    ensureBookManifestShard: ensureBookManifestShard,
    ensureCommentaryManifestShardForAudioId: ensureCommentaryManifestShardForAudioId,
    parseAudioIdLocaleBook: parseAudioIdLocaleBook,
    getManifestEntry: getManifestEntry,
    attachApi: attachApi,
    SHARD_LOCALES: SHARD_LOCALES
  };
})();
