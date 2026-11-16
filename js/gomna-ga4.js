/** Shared GA4 collection. No tag, journey storage or event before analytics consent. */
(function () {
  'use strict';
  if (window.GomnaGa4) return;
  var ID = 'G-1K6DBVER5W';
  var ANALYTICS_VERSION = '20261116-v2';
  var JOURNEY_KEY = 'gomna:analytics:entry:v1';
  var configured = false;
  var entered = false;
  var journey = null;
  var landingPath = location.pathname;
  var landingReferrer = document.referrer;

  var LAST_APP_DAY = 'gomna:analytics:last-visible-app-kst-day:v1';
  var disabledAfterRevocation = false;
  var explicitConsent = null;
  var collecting = false;
  var notifyingReady = false;
  var screens = {
    home:'홈', reader:'성경 본문', find:'찾기', archive:'보관함', search:'검색',
    'bible-old':'구약', 'bible-new':'신약', book:'성경 책', chapter:'장 선택',
    account:'내 계정', guide:'성경 길잡이', meditation:'묵상',
    today_detail:'오늘의 말씀', meditation_detail:'묵상 상세', story_detail:'성경 이야기',
    image_viewer:'이미지 보기', bible_picker:'성경 선택'
  };
  var currentScreen = initialScreen();
  var screenRegistered = false;
  var screenOptions = { pageView:true, screen_group:'reader' };
  var reportedScreen = null;
  var reportedScreenEvent = null;
  var reportedLocation = location.href;
  var currentPageContext = null;

  function pickerFrame() {
    try {
      return /\/reader\.html$/.test(location.pathname) &&
        new URLSearchParams(location.search).get('source') === 'home-bible-picker' && window.self !== window.top;
    } catch (error) { return true; }
  }

  function initialScreen() {
    if (/^\/(?:index\.html)?$/.test(location.pathname)) return 'home';
    if (/\/meditation\.html$/.test(location.pathname)) return 'meditation';
    if (!/\/reader\.html$/.test(location.pathname)) return null;
    var q = new URLSearchParams(location.search);
    if (q.get('homeGuide') === '1' || q.get('guideDetail') === '1') return 'guide';
    if (q.get('book')) return parseInt(q.get('chapter'), 10) >= 1 ? 'reader' : 'chapter';
    if (q.has('easy')) return 'find';
    if (q.has('favorites')) return 'archive';
    if (q.get('q') || q.get('focus') === 'search') return 'search';
    return 'reader';
  }

  function analyticsConsent() {
    if (typeof explicitConsent === 'boolean') return explicitConsent;
    try { return JSON.parse(localStorage.getItem('cookieChoice') || 'null').analytics === true; }
    catch (error) { return false; }
  }

  function allowed() {
    return !!(!pickerFrame() && window.GomnaAnalyticsControl && !window.GomnaAnalyticsControl.isInternal() && analyticsConsent());
  }

  function pauseCollection() {
    collecting = false;
    reportedScreenEvent = null;
    // Do not replay a journey made while collection was disabled.
    reportedScreen = null;
    if (configured) {
      window['ga-disable-' + ID] = true;
      disabledAfterRevocation = true;
    }
  }

  function forgetVisit() {
    pauseCollection();
    try { localStorage.removeItem(LAST_APP_DAY); } catch (error) {}
  }

  // A browser-local day, not a visitor ID. Excludes marketing, company, and
  // search landing pages unless the visitor actually opens the app itself.
  function visibleAppVisit(how) {
    if (document.visibilityState !== 'visible' || !allowed() || !configured ||
        !/^\/(?:index\.html|reader\.html|meditation\.html)?$/.test(location.pathname)) return;
    function record() {
      if (document.visibilityState !== 'visible' || !allowed()) return;
      var day = Math.floor((Date.now() + 9 * 3600000) / 86400000);
      var previous;
      try {
        var raw = localStorage.getItem(LAST_APP_DAY);
        previous = raw && /^\d+$/.test(raw) ? Number(raw) : null;
        if (previous === day) return;
        localStorage.setItem(LAST_APP_DAY, String(day));
      } catch (error) { return; }
      // No historical inference: the first observation only establishes a baseline.
      if (previous > 0 && previous < day) {
        send('app_return_visit', { return_mode: how, return_metric_version: 1 });
      }
    }
    // Multiple foreground windows may open at the same time. Where provided,
    // a same-origin lock serializes the shared day marker across those windows.
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      try { navigator.locks.request(LAST_APP_DAY, record).catch(record); return; }
      catch (error) {}
    }
    record();
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

  var phStarted = false;
  function startPostHog() {
    if (phStarted || !allowed()) return;
    phStarted = true;
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],u.toString=function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e},u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='capture identify register register_once reset opt_in_capturing opt_out_capturing'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init('phc_A2jrYTmvvhXuobAgHXfKmiApwrnV8oS4ySqwmgJGXvuG', {
      api_host: 'https://us.i.posthog.com', defaults: '2026-05-30',
      person_profiles: 'identified_only', persistence: 'localStorage+cookie',
      // Initial and virtual views use the same explicit PostHog event path.
      capture_pageview: false,
      before_send: function (event) {
        if (!allowed()) return null;
        event.properties = Object.assign({}, event.properties, entryContext(), {
          traffic_environment: 'production', analytics_version: ANALYTICS_VERSION
        });
        return event;
      }
    });
  }

  function send(name, params) {
    if (!allowed() || !configured) return false;
    var values = entryContext();
    if (currentPageContext) Object.assign(values, currentPageContext);
    if (currentScreen) values.screen_name = currentScreen;
    Object.keys(params || {}).forEach(function (key) { values[key] = params[key]; });
    values.traffic_environment = 'production';
    values.analytics_version = ANALYTICS_VERSION;
    // Audio 'source' describes a playback queue, not the acquisition source.
    // Preserve existing PostHog reports while keeping GA traffic attribution clean.
    var gaValues = values;
    if ((name === 'audio_attempt' || name === 'audio_user_start') && 'source' in values) {
      gaValues = Object.assign({}, values, { audio_source: values.source });
      delete gaValues.source;
    }
    window.gtag('event', name, gaValues);
    if (window.posthog && window.posthog.capture) {
      var phValues = currentPageContext ? Object.assign({}, values, {
        $current_url:currentPageContext.page_location, $title:currentPageContext.page_title
      }) : values;
      window.posthog.capture(name, phValues);
    }
    return true;
  }

  function pageValues(virtual) {
    var values = entryContext();
    values.traffic_environment = 'production';
    values.analytics_version = ANALYTICS_VERSION;
    values.page_location = virtual ? location.origin + location.pathname + '?screen=' + encodeURIComponent(currentScreen) : location.href;
    values.page_title = virtual ? '은혜의말씀 · ' + screens[currentScreen] : document.title;
    if (currentScreen) values.screen_name = currentScreen;
    if (virtual) values.page_referrer = reportedLocation;
    return values;
  }

  function posthogPageView(values) {
    if (!window.posthog || !window.posthog.capture || !allowed()) return;
    window.posthog.capture('$pageview', Object.assign({}, values, {
      $current_url:values.page_location, $pathname:location.pathname, $title:values.page_title,
      $referrer:values.page_referrer || landingReferrer
    }));
  }

  function rememberPage(values, update) {
    currentPageContext = {
      page_location:values.page_location, page_title:values.page_title,
      page_referrer:values.page_referrer || landingReferrer, screen_name:currentScreen
    };
    if (update) window.gtag('config', ID, Object.assign({ update:true, send_page_view:false }, currentPageContext));
    // Reset these on every document load too: persisted super-properties from
    // a Reader virtual page must not follow the visitor back onto the home URL.
    if (window.posthog && window.posthog.register) window.posthog.register({
      $current_url:values.page_location, $title:values.page_title, screen_name:currentScreen
    });
  }

  function flushScreen() {
    if (notifyingReady || !screenRegistered || !currentScreen || !configured || !allowed() || document.visibilityState !== 'visible') return false;
    var changed = reportedScreen !== currentScreen;
    if (changed || !currentPageContext || currentPageContext.screen_name !== currentScreen) {
      var values = pageValues(screenOptions.pageView !== false);
      // Update subsequent automatic engagement and custom events as well as
      // this view. This config update explicitly cannot send another pageview.
      rememberPage(values, true);
      if (reportedScreen !== null && changed && screenOptions.pageView !== false) {
        window.gtag('event', 'page_view', values);
        posthogPageView(values);
      }
      reportedLocation = values.page_location;
    }
    reportedScreen = currentScreen;
    if (reportedScreenEvent === currentScreen) return false;
    reportedScreenEvent = currentScreen;
    return send('app_screen_view', { screen:currentScreen, screen_name:currentScreen, screen_group:screenOptions.screen_group });
  }

  function screenView(screen, options) {
    if (pickerFrame() || !Object.prototype.hasOwnProperty.call(screens, screen)) return false;
    options = options || {};
    var firstRegistration = !screenRegistered;
    currentScreen = screen;
    screenOptions = {
      pageView:options.pageView !== false,
      screen_group:options.screen_group === 'home' ? 'home' : 'reader'
    };
    screenRegistered = true;
    // The config already owns the first view, even if the DOM settles later.
    if (firstRegistration && options.initial === true && configured) reportedScreen = currentScreen;
    return start();
  }

  function consentChanged(analytics) {
    explicitConsent = typeof analytics === 'boolean' ? analytics : null;
    return start();
  }

  function notifyReady() {
    if (notifyingReady || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    // Legacy analytics listeners can call start() before later UI listeners
    // register the visible screen. Flush only after every listener has run.
    notifyingReady = true;
    try { window.dispatchEvent(new CustomEvent('gomna:analytics-ready')); }
    finally { notifyingReady = false; }
  }

  function start() {
    // CSS-hidden same-origin iframes can report visibilityState=visible. They
    // prepare the picker; the parent records its actual visible UI instead.
    if (pickerFrame()) return false;
    if (!allowed()) {
      if (!analyticsConsent()) forgetVisit();
      else pauseCollection();
      return false;
    }
    if (disabledAfterRevocation) {
      window['ga-disable-' + ID] = false;
      disabledAfterRevocation = false;
    }
    if (!configured) {
      configured = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      // The config owns the initial page_view; do not also send a manual page_view.
      window.gtag('config', ID, pageValues(false));
      reportedScreen = currentScreen;
      if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + ID + '"]')) {
        var script = document.createElement('script');
        script.id = 'gomna-ga4-script';
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
        document.head.appendChild(script);
      }
    }
    startPostHog();
    if (!entered) {
      entered = true;
      rememberPage(pageValues(false), false);
      posthogPageView(pageValues(false));
      send('entry_page_view');
      visibleAppVisit('open');
      if (/\/reader\.html$/.test(location.pathname)) {
        var q = new URLSearchParams(location.search);
        var source = q.get('source') || '';
        send('reader_enter', { reader_source: /^[a-z0-9_-]{1,80}$/i.test(source) ? source : '' });
      }
    }
    if (!collecting) {
      collecting = true;
      // Set the guard before notifying UI bridges, which can call screenView.
      notifyReady();
    }
    flushScreen();
    return true;
  }

  window.GomnaGa4 = { start: start, track: function (name, params) { return start() && send(name, params); }, allowed: allowed,
    screenView:screenView, consentChanged:consentChanged };

  function init() {
    if (pickerFrame()) return;
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

  function onForeground() {
    if (document.visibilityState !== 'visible') return;
    // A panel may have settled while backgrounded. Ask the UI for its actual
    // visible screen before flushing any remembered screen state.
    if (configured && collecting && allowed()) notifyReady();
    if (start()) visibleAppVisit('resume');
  }
  document.addEventListener('visibilitychange', onForeground);
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) onForeground();
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== null && event.key !== 'cookieChoice' && event.key !== 'gomna:analytics:internal') return;
    if (event.key === null || event.key === 'cookieChoice') explicitConsent = null;
    start();
  });
  window.addEventListener('gomna:analytics-consent-changed', function () { consentChanged(); });

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var button = target.closest('[data-gomna-cookie]');
    if (button) {
      var choice = {};
      try { choice = JSON.parse(localStorage.getItem('cookieChoice') || '{}') || {}; } catch (error) {}
      if (typeof choice !== 'object' || Array.isArray(choice)) choice = {};
      choice.analytics = button.getAttribute('data-gomna-cookie') === 'accept';
      choice.timestamp = new Date().toISOString();
      try { localStorage.setItem('cookieChoice', JSON.stringify(choice)); } catch (error) {}
      var banner = document.getElementById('gomna-cookie-banner');
      if (banner) banner.remove();
      consentChanged(choice.analytics);
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
