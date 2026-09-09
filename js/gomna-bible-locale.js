/*!
 * Native Reader Bible overlays keyed by canonical locale.
 * ko = KRV (old_testament.js / new_testament.js)
 * en = WEBP, ja = Kougo, zh = CUV
 * Canonical key: Protestant book number 1–66 + chapter + verse.
 * Cache is per locale/version — never reuse another language's chapter.
 */
(function (global) {
  'use strict';

  var VER = '20260909-locale-canon-v1';
  var FILES = {
    en: { url: 'js/bible/webp.json?v=' + VER, version: 'WEBP', source: 'World English Bible, Protestant Edition' },
    ja: { url: 'js/bible/kougo.json?v=' + VER, version: 'Kougo', source: 'Japanese Kougo-yaku 1954/1955' },
    zh: { url: 'js/bible/cuv.json?v=' + VER, version: 'CUV', source: 'Chinese Union Version, Simplified' }
  };
  var cache = {};
  var inflight = {};

  function localeOf(lang) {
    var canon = null;
    if (global.GomnaUII18n && typeof global.GomnaUII18n.canonicalizeNativeLocale === 'function') {
      canon = global.GomnaUII18n.canonicalizeNativeLocale(lang);
    } else if (global.GomnaUII18n && typeof global.GomnaUII18n.canonicalizeLocale === 'function') {
      canon = global.GomnaUII18n.canonicalizeLocale(lang);
    }
    if (canon === 'en' || canon === 'ja' || canon === 'zh' || canon === 'ko') return canon;
    if (lang === 'en' || lang === 'ja' || lang === 'zh' || lang === 'ko') return lang;
    return 'ko';
  }

  function specFor(lang) {
    return FILES[localeOf(lang)] || null;
  }

  function isReady(lang) {
    var code = localeOf(lang);
    if (code === 'ko') return true;
    return !!(cache[code] && cache[code].books);
  }

  function ensure(lang) {
    var code = localeOf(lang);
    if (!code || code === 'ko') return Promise.resolve(null);
    if (cache[code]) return Promise.resolve(cache[code]);
    if (inflight[code]) return inflight[code];
    var spec = specFor(code);
    if (!spec) return Promise.resolve(null);
    inflight[code] = fetch(spec.url, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('bible locale HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        cache[code] = {
          version: (data && data.v) || spec.version,
          source: (data && data.source) || spec.source,
          books: (data && data.books) || {}
        };
        return cache[code];
      })
      .catch(function (err) {
        try { console.error('[GomnaBibleLocale] load failed', code, err); } catch (e) {}
        throw err;
      })
      .then(function (pack) {
        inflight[code] = null;
        return pack;
      }, function (err) {
        inflight[code] = null;
        throw err;
      });
    return inflight[code];
  }

  function chapterMap(lang, bookNr, chapter) {
    var pack = cache[localeOf(lang)];
    if (!pack || !pack.books) return null;
    var book = pack.books[bookNr] || pack.books[String(bookNr)];
    if (!book) return null;
    return book[chapter] || book[String(chapter)] || null;
  }

  function getVerse(lang, bookNr, chapter, verse) {
    var ch = chapterMap(lang, bookNr, chapter);
    if (!ch) return '';
    var t = ch[verse];
    if (t == null) t = ch[String(verse)];
    return t == null ? '' : String(t);
  }

  function getVersionLabel(lang) {
    var code = localeOf(lang) || 'ko';
    if (global.GomnaUII18n && typeof global.GomnaUII18n.getLocaleConfig === 'function') {
      var cfg = global.GomnaUII18n.getLocaleConfig(code);
      if (cfg && cfg.bibleVersion) return cfg.bibleVersion;
    }
    if (code === 'en') return 'WEBP';
    if (code === 'ja') return 'Kougo';
    if (code === 'zh') return 'CUV';
    return 'KRV';
  }

  function chapterCacheKey(lang, bookNr, chapter) {
    return getVersionLabel(lang) + ':' + String(bookNr) + ':' + String(chapter);
  }

  global.GomnaBibleLocale = {
    ensure: ensure,
    isReady: isReady,
    getChapter: chapterMap,
    getVerse: getVerse,
    getVersionLabel: getVersionLabel,
    specFor: specFor,
    chapterCacheKey: chapterCacheKey
  };
})(typeof window !== 'undefined' ? window : this);
