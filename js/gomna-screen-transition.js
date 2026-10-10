(function () {
  'use strict';

  var root = document.documentElement;
  var leavingClass = 'gomna-route-leaving';
  var fallbackTimer = 0;
  var clickTimer = 0;

  function installStyle() {
    if (document.getElementById('gomna-route-transition-css')) return;
    var style = document.createElement('style');
    style.id = 'gomna-route-transition-css';
    style.textContent =
      'html.gomna-route-leaving,html.gomna-route-leaving body{' +
        'pointer-events:none;' +
      '}' +
      'html.gomna-route-leaving::after{' +
        'content:"";position:fixed;inset:0;z-index:2147483646;' +
        'background:transparent;pointer-events:auto;cursor:progress;' +
      '}';
    (document.head || root).appendChild(style);
  }

  function reset() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = 0;
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    root.classList.remove(leavingClass);
  }

  function begin(destination) {
    if (destination && !isDocumentDestination(destination)) return false;
    installStyle();
    root.classList.add(leavingClass);

    /* Keep the current screen intact while the next document loads. */
    /* A cancelled or failed request must leave this page usable again. */
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(reset, 5000);
    return true;
  }

  function isDocumentDestination(destination) {
    try {
      var next = new URL(destination, location.href);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return false;
      if (next.origin !== location.origin) return false;
      return next.pathname !== location.pathname ||
        next.search !== location.search ||
        (!next.hash && next.href !== location.href);
    } catch (e) {
      return false;
    }
  }

  function isDocumentNavigation(anchor) {
    if (!anchor || !anchor.href) return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;
    return isDocumentDestination(anchor.href);
  }

  installStyle();

  window.GOMNA_SCREEN_TRANSITION = Object.freeze({
    begin: begin,
    reset: reset
  });

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var anchor = target.closest('a[href]');
    if (isDocumentNavigation(anchor)) {
      /* Give all click handlers time to cancel a link or open an in-page panel. */
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(function () {
        clickTimer = 0;
        if (!event.defaultPrevented) begin(anchor.href);
      }, 0);
    }
  });

  /* Clear locks before saving a back/forward snapshot and after restoring it. */
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', reset);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) reset();
  });
})();
