/** Consent-aware analytics for lightweight search entry pages. */
(function () {
  'use strict';

  var GA4_ID = 'G-1K6DBVER5W';
  var POSTHOG_KEY = 'phc_A2jrYTmvvhXuobAgHXfKmiApwrnV8oS4ySqwmgJGXvuG';
  var banner = document.getElementById('topic-cookie-banner');

  function isInternal() {
    return !!(window.GomnaAnalyticsControl && window.GomnaAnalyticsControl.isInternal());
  }

  function readChoice() {
    try {
      var raw = localStorage.getItem('cookieChoice');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function saveChoice(analytics) {
    var choice = readChoice() || {};
    choice.analytics = analytics;
    choice.timestamp = new Date().toISOString();
    try { localStorage.setItem('cookieChoice', JSON.stringify(choice)); } catch (error) {}
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  function topicSlug() {
    return (document.body && document.body.getAttribute('data-topic-slug')) || 'unknown';
  }

  function loadGa4() {
    if (window.__gomnaEntryGa4Loaded || isInternal()) return;
    window.__gomnaEntryGa4Loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
    window.gtag('event', 'view_topic_page', { topic_slug: topicSlug() });
  }

  function loadPostHog() {
    if (window.__gomnaEntryPostHogLoaded || isInternal()) return;
    window.__gomnaEntryPostHogLoaded = true;
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],u.toString=function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e},u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='capture identify register register_once reset opt_in_capturing opt_out_capturing'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    window.posthog.init(POSTHOG_KEY, {
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      person_profiles: 'identified_only'
    });
    window.posthog.capture('view_topic_page', { topic_slug: topicSlug() });
  }

  function startAnalytics() {
    if (isInternal()) return;
    var choice = readChoice();
    if (!choice || choice.analytics !== true) return;
    loadGa4();
    loadPostHog();
  }

  if (isInternal()) {
    hideBanner();
    return;
  }

  var choice = readChoice();
  if (!choice || typeof choice.analytics !== 'boolean') {
    if (banner) banner.hidden = false;
  } else if (choice.analytics === true) {
    startAnalytics();
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-topic-cookie]') : null;
    if (!button) return;
    var action = button.getAttribute('data-topic-cookie');
    saveChoice(action === 'accept');
    hideBanner();
    if (action === 'accept') startAnalytics();
  });
})();
