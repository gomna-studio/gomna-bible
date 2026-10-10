/* Preserve an external search's actual history entry across SEO Bible pages.
   App search state is intentionally independent of this document-navigation context. */
(function () {
  'use strict';
  var STORAGE_PREFIX = 'gomna_seo_return:';
  var STATE_KEY = '__gomnaSeoReturn';
  var MAX_AGE = 30 * 60 * 1000;
  var params = new URLSearchParams(location.search);
  var ownPath = location.pathname + location.search;
  var reader = /\/reader\.html$/.test(location.pathname);
  var seoPage = biblePath(location.pathname);
  var referrer = asUrl(document.referrer);
  var seoReferrer = referrer && referrer.origin === location.origin && biblePath(referrer.pathname);
  var source = params.get('source');
  var isReaderEntry = reader && (source === 'seo-bible' || (source === 'search-related' && !!seoReferrer));
  var entry = null;

  function asUrl(value) {
    try { return value ? new URL(value, location.href) : null; } catch (e) { return null; }
  }

  function biblePath(value) {
    return /^\/bible\/[a-z0-9]+\/(?:[1-9][0-9]*\/)?$/.test(value || '') ? value : '';
  }

  function isSearchReferrer(url) {
    if (!url || !/^https?:$/.test(url.protocol)) return false;
    return /^(?:www\.)?google\.(?:com|[a-z]{2,3}|(?:co|com)\.[a-z]{2})$/.test(url.hostname) ||
      /^(?:www\.)?bing\.com$/.test(url.hostname) ||
      /^(?:www\.)?duckduckgo\.com$/.test(url.hostname) ||
      /^(?:search|m\.search)\.naver\.com$/.test(url.hostname) ||
      /^search\.daum\.net$/.test(url.hostname);
  }

  function googleSearchUrl(url) {
    return url && /^https?:$/.test(url.protocol) &&
      /^(?:www\.)?google\.(?:com|[a-z]{2,3}|(?:co|com)\.[a-z]{2})$/.test(url.hostname) &&
      url.pathname === '/search' && !!(url.searchParams.get('q') || '').trim();
  }

  function searchReturnFromReferrer() {
    if (!isSearchReferrer(referrer) || !/google\./.test(referrer.hostname)) return null;
    if (googleSearchUrl(referrer)) return { href: referrer.href, fallback: false };
    // Google commonly opens the result in a new tab and sends only its origin.
    // The original query is unavailable then; search the actual SEO page title.
    var heading = document.querySelector('h1');
    var query = heading ? String(heading.textContent || '').trim() : '';
    if (!query) return null;
    var url = new URL('/search', referrer.origin);
    url.searchParams.set('q', query);
    return { href: url.href, fallback: true };
  }

  function load(id) {
    try {
      if (!/^[a-z0-9-]{8,90}$/.test(id || '')) return null;
      var data = JSON.parse(sessionStorage.getItem(STORAGE_PREFIX + id));
      if (!data || data.id !== id || !(biblePath(data.returnPath) || data.returnPath === '/') ||
          !data.timestamp || Date.now() - data.timestamp > MAX_AGE) return null;
      return data;
    } catch (e) { return null; }
  }

  function save(data) {
    try { sessionStorage.setItem(STORAGE_PREFIX + data.id, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  function mark(data) {
    try {
      var state = Object.assign({}, history.state || {});
      state[STATE_KEY] = { id: data.id, path: ownPath, depth: data.depth };
      history.replaceState(state, '', location.href);
      return true;
    } catch (e) { return false; }
  }

  function restoreEntry() {
    var marker = history.state && history.state[STATE_KEY];
    if (!marker || marker.path !== ownPath) return null;
    var saved = load(marker.id);
    if (!saved || marker.depth !== saved.depth) return null;
    return saved;
  }

  function incomingEntry() {
    var saved = load(params.get('seoReturn'));
    if (!saved || !referrer || referrer.origin !== location.origin ||
        referrer.pathname + referrer.search !== saved.fromPath) return null;
    var next = Object.assign({}, saved);
    next.depth = saved.depth > 0 && history.length >= saved.depth + 2 ? saved.depth + 1 : 0;
    // Use a fresh entry token so back/forward entries retain their own depth.
    next.id = newId();
    next.timestamp = Date.now();
    return next;
  }

  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  if (seoPage || isReaderEntry) {
    entry = restoreEntry() || incomingEntry();
    if (!entry) {
      var returnUrl = asUrl(params.get('returnPath'));
      var fallback = returnUrl && returnUrl.origin === location.origin && biblePath(returnUrl.pathname);
      var searchReturn = seoPage ? searchReturnFromReferrer() : null;
      entry = {
        id: newId(),
        returnPath: seoPage || fallback || seoReferrer || '/',
        depth: seoPage && isSearchReferrer(referrer) && history.length > 1 ? 1 : 0,
        searchReferrer: seoPage && isSearchReferrer(referrer) ? referrer.href : '',
        searchHref: searchReturn ? searchReturn.href : '',
        searchFallback: searchReturn ? searchReturn.fallback : false,
        timestamp: Date.now()
      };
    }
    if (seoPage) entry.returnPath = seoPage;
    entry.fromPath = ownPath;
    if (!save(entry) || !mark(entry)) {
      entry.depth = 0;
      save(entry);
    }
  }

  function canReturnToSearch() {
    return !!(entry && entry.depth > 0 && history.length > entry.depth);
  }

  function returnToOrigin() {
    if (!isReaderEntry || !entry) return false;
    if (canReturnToSearch()) history.go(-entry.depth);
    else if (googleSearchUrl(asUrl(entry.searchHref))) location.href = entry.searchHref;
    else location.href = entry.returnPath;
    return false;
  }

  function prepareLinks() {
    if (!seoPage || !entry) return;
    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = asUrl(link.getAttribute('href'));
      if (!href || href.origin !== location.origin) return;
      var destinationIsReader = /\/reader\.html$/.test(href.pathname) && href.searchParams.get('source') === 'seo-bible';
      if (!destinationIsReader && !biblePath(href.pathname)) return;
      if (destinationIsReader) href.searchParams.set('returnPath', seoPage);
      href.searchParams.set('seoReturn', entry.id);
      link.setAttribute('href', href.pathname + href.search + href.hash);
    });
  }

  // bfcache restores the existing history entry; do not create another hop.
  window.addEventListener('pageshow', function () {
    entry = restoreEntry() || entry;
    prepareLinks();
  });
  prepareLinks();

  window.GomnaSeoReturn = {
    isReaderEntry: isReaderEntry,
    label: function () {
      if (canReturnToSearch()) return '검색 결과로 돌아가기';
      if (entry && googleSearchUrl(asUrl(entry.searchHref))) {
        return entry.searchFallback ? '구글 검색으로 돌아가기' : '검색 결과로 돌아가기';
      }
      return entry && entry.returnPath === '/' ? '홈으로 돌아가기' : '성경 본문으로 돌아가기';
    },
    returnToOrigin: returnToOrigin
  };
})();
