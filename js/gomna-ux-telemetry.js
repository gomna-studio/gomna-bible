/** Semantic UX measurements. No storage, SDK loading or identifiers of its own. */
(function () {
  'use strict';
  if (window.GomnaUxTelemetry) return;
  var actions = /^(home_read|home_listen|resume_read|resume_listen|home_more|person_read|person_listen|story_read|story_listen|topic_read|topic_listen)$/;
  var placements = /^(today_card|resume_card|home_navigation|detail_top|detail_bottom|topic_verse)$/;
  var exposures = /^(today_card|resume_card|meditation_card|people_card|topic_content)$/;
  var seen = Object.create(null);
  var observed = new WeakSet();
  var visible = new Map();
  var handled = new WeakSet();
  var observer = null;
  function allowed() {
    try {
      return /^(www\.)?gomnastudio\.com$/.test(window.location.hostname) &&
        !!(window.GomnaGa4 && window.GomnaGa4.allowed());
    } catch (error) { return false; }
  }
  function send(name, values) {
    if (!allowed()) return false;
    try { return window.GomnaGa4.track(name, Object.assign({ ux_version: '20261030-preview-v1', transport_type: 'beacon' }, values)) === true; }
    catch (error) { return false; }
  }
  function action(detail) {
    if (!detail || !actions.test(detail.action || '') || !placements.test(detail.placement || '')) return false;
    return send('ux_action', { ux_action: detail.action, ux_placement: detail.placement });
  }
  function flush() {
    if (!allowed() || document.visibilityState === 'hidden') return;
    visible.forEach(function (name, element) {
      if (element.isConnected === false || element.hidden || element.getAttribute('aria-hidden') === 'true' || seen[name]) return;
      if (send('ux_content_view', { ux_placement: name })) seen[name] = true;
    });
  }
  function scan() {
    if (!observer) return;
    document.querySelectorAll('[data-gomna-exposure]').forEach(function (element) {
      var name = element.getAttribute('data-gomna-exposure');
      if (!exposures.test(name || '') || observed.has(element)) return;
      observed.add(element);
      observer.observe(element);
    });
  }
  document.addEventListener('click', function (event) {
    // A later task sees consent choices applied by the existing banner handlers.
    setTimeout(flush, 0);
    var element = event.target && event.target.closest ? event.target.closest('[data-gomna-action]') : null;
    if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true' || handled.has(event)) return;
    handled.add(event);
    action({ action: element.getAttribute('data-gomna-action'), placement: element.getAttribute('data-gomna-placement') });
  }, true);
  window.addEventListener('gomna:home-action', function (event) { action(event.detail); });
  window.addEventListener('storage', function (event) { if (event.key === 'cookieChoice') flush(); });
  window.addEventListener('gomna:analytics-consent-changed', flush);
  document.addEventListener('visibilitychange', flush);
  function init() {
    if (window.IntersectionObserver) {
      observer = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) visible.set(entry.target, entry.target.getAttribute('data-gomna-exposure'));
          else visible.delete(entry.target);
        });
        flush();
      }, { threshold: [0, 0.25] });
      scan();
      if (window.MutationObserver) new window.MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    }
  }
  window.GomnaUxTelemetry = { trackAction: action, refresh: function () { scan(); flush(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
