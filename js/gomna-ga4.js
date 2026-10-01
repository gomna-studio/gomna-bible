/** Shared GA4 collection. No tag, journey storage or event before analytics consent. */
(function () {
  'use strict';
  if (window.GomnaGa4) return;
  var ID = 'G-1K6DBVER5W';
  var JOURNEY_KEY = 'gomna:analytics:entry:v1';
  var configured = false;
  var entered = false;
  var journey = null;
  var landingPath = location.pathname;
  var landingReferrer = document.referrer;

  function allowed() {
    // Missing exclusion control fails closed.
    if (!window.GomnaAnalyticsControl || window.GomnaAnalyticsControl.isInternal()) return false;
    try { return JSON.parse(localStorage.getItem('cookieChoice') || 'null').analytics === true; }
    catch (error) { return false; }
  }

  function entryContext() {
    var now = Date.now();
    var ref = null;
    try { ref = new URL(landingReferrer); } catch (error) {}
    if (!journey) {
      try { journey = JSON.parse(sessionStorage.getItem(JOURNEY_KEY) || 'null'); } catch (error) {}
      if (!journey || typeof journey.entry_page !== 'string' || !Number.isFinite(journey.updated) || now - journey.updated > 30 * 60 * 1000 ||
          (ref && ref.origin !== location.origin)) {
        var host = ref && ref.origin !== location.origin ? ref.hostname.toLowerCase() : '';
        var search = /(^|\.)google\.[a-z.]+$|(^|\.)naver\.com$|(^|\.)bing\.com$|(^|\.)daum\.net$|(^|\.)duckduckgo\.com$/.test(host);
        // This is a referrer hint, not a replacement for GA4 campaign attribution.
        journey = { entry_page: landingPath, entry_channel: host ? (search ? 'search_referral' : 'referral') : 'direct', entry_source: host || 'direct' };
      }
    }
    journey.updated = now;
    try { sessionStorage.setItem(JOURNEY_KEY, JSON.stringify(journey)); } catch (error) {}
    return { entry_page: journey.entry_page, entry_channel: journey.entry_channel, entry_source: journey.entry_source };
  }

  function send(name, params) {
    if (!allowed() || !configured) return false;
    var values = entryContext();
    Object.keys(params || {}).forEach(function (key) { values[key] = params[key]; });
    window.gtag('event', name, values);
    return true;
  }

  function start() {
    if (!allowed()) return false;
    if (!configured) {
      configured = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      // The config owns the initial page_view; do not also send a manual page_view.
      window.gtag('config', ID, entryContext());
      if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + ID + '"]')) {
        var script = document.createElement('script');
        script.id = 'gomna-ga4-script';
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
        document.head.appendChild(script);
      }
    }
    if (!entered) {
      entered = true;
      send('entry_page_view');
      if (/\/reader\.html$/.test(location.pathname)) {
        var q = new URLSearchParams(location.search);
        var source = q.get('source') || '';
        send('reader_enter', { reader_source: /^[a-z0-9_-]{1,80}$/i.test(source) ? source : '' });
      }
    }
    return true;
  }

  window.GomnaGa4 = { start: start, track: function (name, params) { return start() && send(name, params); }, allowed: allowed };

  function init() {
    var existingBanner = document.getElementById('home-cookie-banner') || document.getElementById('cookie-banner') || document.getElementById('topic-cookie-banner');
    // Existing app/topic banners remain in charge of their consent controls.
    if (!existingBanner && window.GomnaAnalyticsControl && !window.GomnaAnalyticsControl.isInternal()) {
      var choice = null;
      try { choice = JSON.parse(localStorage.getItem('cookieChoice') || 'null'); } catch (error) {}
      if (!choice || typeof choice.analytics !== 'boolean') {
        var banner = document.createElement('div');
        banner.id = 'gomna-cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', '분석 쿠키 동의 안내');
        banner.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;margin:auto;padding:16px;background:#fff;color:#17243a;border:1px solid #c8d0dc;border-radius:14px;box-shadow:0 4px 24px #0002;z-index:10000;font:14px/1.6 sans-serif';
        banner.innerHTML = '<p style="margin:0 0 10px">서비스 개선을 위한 방문 통계 수집에 동의하시겠습니까? 거부해도 이용 제한은 없습니다.</p><div style="display:flex;justify-content:flex-end;gap:10px"><button type="button" data-gomna-cookie="reject" style="min-height:44px;padding:8px 18px">거부</button><button type="button" data-gomna-cookie="accept" style="min-height:44px;padding:8px 18px">동의</button></div>';
        document.body.appendChild(banner);
      }
    }
    start();
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var button = target.closest('[data-gomna-cookie]');
    if (button) {
      var choice = {};
      try { choice = JSON.parse(localStorage.getItem('cookieChoice') || '{}') || {}; } catch (error) {}
      choice.analytics = button.getAttribute('data-gomna-cookie') === 'accept';
      choice.timestamp = new Date().toISOString();
      try { localStorage.setItem('cookieChoice', JSON.stringify(choice)); } catch (error) {}
      var banner = document.getElementById('gomna-cookie-banner');
      if (banner) banner.remove();
      start();
      return;
    }
    var link = target.closest('a[href]');
    if (!link || event.defaultPrevented || !allowed()) return;
    try {
      var url = new URL(link.href, location.href);
      if (url.origin === location.origin && /\/reader\.html$/.test(url.pathname)) {
        window.GomnaGa4.track('reader_click', { from_page: location.pathname, transport_type: 'beacon' });
      }
    } catch (error) {}
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
