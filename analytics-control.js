/**
 * 은혜의말씀 내부 사용자·자동화 테스트 애널리틱스 차단
 *
 * 대표님 기기 등록: ?gomna_internal=1
 * 등록 해제:       ?gomna_internal=0
 */
(function () {
  'use strict';

  var GA4_ID = 'G-1K6DBVER5W';
  var STORAGE_KEY = 'gomna:analytics:internal';
  var COOKIE_KEY = 'gomna_analytics_internal';
  var QUERY_KEY = 'gomna_internal';
  var currentPageOverride = null;

  function readStoredFlag() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return true;
    } catch (e) {}

    try {
      return new RegExp('(?:^|;\\s*)' + COOKIE_KEY + '=1(?:;|$)').test(document.cookie || '');
    } catch (e) {
      return false;
    }
  }

  function storeFlag(enabled) {
    currentPageOverride = enabled;
    try {
      if (enabled) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    try {
      document.cookie = COOKIE_KEY + '=' + (enabled ? '1' : '') +
        '; Path=/; Max-Age=' + (enabled ? '31536000' : '0') +
        '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
  }

  function consumeQueryFlag() {
    try {
      var url = new URL(location.href);
      if (!url.searchParams.has(QUERY_KEY)) return;

      var value = url.searchParams.get(QUERY_KEY);
      if (value === '1') storeFlag(true);
      if (value === '0') storeFlag(false);

      url.searchParams.delete(QUERY_KEY);
      history.replaceState(history.state, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function isLocalOrPreviewHost() {
    var host = String(location.hostname || '').toLowerCase();
    if (!host) return true;
    // Only the live canonical host collects production analytics.
    if (host !== 'gomnastudio.com' && host !== 'www.gomnastudio.com') return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (/\.local$/.test(host)) return true;
    if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
    if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;

    var match = host.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
    return !!(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  }

  // Owned QA site links may land on production. Keep that navigation out of
  // both collectors without classifying all ChatGPT referrals as internal or
  // permanently registering this browser as a staff device.
  function previewReferralVisit() {
    if (isLocalOrPreviewHost()) return false;
    var key = 'gomna:analytics:qa-tab-until:v1';
    var now = Date.now();
    var expiry = now + 30 * 60 * 1000;
    var ref;
    try { ref = new URL(document.referrer); } catch (e) {}
    if (ref && ref.origin === 'https://gomna-studio-design-review.leedukkyu.chatgpt.site') {
      try { sessionStorage.setItem(key, String(expiry)); } catch (e) {}
      return true;
    }
    try {
      var marker = sessionStorage.getItem(key);
      if (!marker) return false;
      // A new external entry or idle interval starts a clean visit.
      if (!(Number(marker) > now && Number(marker) <= expiry) ||
          (ref && ref.hostname !== 'gomnastudio.com' && ref.hostname !== 'www.gomnastudio.com')) {
        sessionStorage.removeItem(key);
        return false;
      }
      sessionStorage.setItem(key, String(expiry));
      return true;
    } catch (e) { return false; }
  }

  var fromPreview = previewReferralVisit();

  function isAutomatedBrowser() {
    try {
      if (navigator.webdriver === true) return true;
      return /HeadlessChrome|PhantomJS|Cypress|Playwright|Puppeteer/i.test(navigator.userAgent || '');
    } catch (e) {
      return false;
    }
  }

  function isInternal() {
    if (isLocalOrPreviewHost() || isAutomatedBrowser() || fromPreview) return true;
    if (currentPageOverride !== null) return currentPageOverride;
    return readStoredFlag();
  }

  consumeQueryFlag();

  if (isInternal()) {
    window['ga-disable-' + GA4_ID] = true;
    try {
      document.documentElement.setAttribute('data-gomna-analytics', 'blocked');
    } catch (e) {}
  }

  window.GomnaAnalyticsControl = {
    isInternal: isInternal,
    disableForThisDevice: function () {
      storeFlag(true);
      window['ga-disable-' + GA4_ID] = true;
    },
    enableForThisDevice: function () {
      storeFlag(false);
      window['ga-disable-' + GA4_ID] = isInternal();
    }
  };
})();
