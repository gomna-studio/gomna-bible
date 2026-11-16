/** Consent-aware analytics for lightweight search entry pages. */
(function () {
  'use strict';

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
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function saveChoice(analytics) {
    var choice = readChoice() || {};
    choice.analytics = analytics;
    choice.timestamp = new Date().toISOString();
    try { localStorage.setItem('cookieChoice', JSON.stringify(choice)); } catch (error) {}
    if (window.GomnaGa4 && typeof window.GomnaGa4.consentChanged === 'function') {
      window.GomnaGa4.consentChanged(analytics);
    }
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  function topicSlug() {
    return (document.body && document.body.getAttribute('data-topic-slug')) || 'unknown';
  }

  function loadGa4() {
    if (window.__gomnaEntryGa4Loaded || isInternal()) return;
    if (!window.GomnaGa4 || !window.GomnaGa4.start()) return;
    // start() can synchronously notify the ready listener above this call.
    if (window.__gomnaEntryGa4Loaded) return;
    window.__gomnaEntryGa4Loaded = true;
    window.GomnaGa4.track('view_topic_page', { topic_slug: topicSlug() });
  }

  function startAnalytics() {
    if (isInternal()) return;
    if (!window.GomnaGa4 || !window.GomnaGa4.allowed()) return;
    loadGa4();

  }

  window.addEventListener('gomna:analytics-ready', startAnalytics);

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
