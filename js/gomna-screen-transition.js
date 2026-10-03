(function () {
  'use strict';

  var root = document.documentElement;
  var leavingClass = 'gomna-route-leaving';
  var fallbackTimer = 0;

  function installStyle() {
    if (document.getElementById('gomna-route-transition-css')) return;
    var style = document.createElement('style');
    style.id = 'gomna-route-transition-css';
    style.textContent =
      'html.gomna-route-leaving,html.gomna-route-leaving body{' +
        'background:#FCFAF6!important;' +
      '}' +
      'html.gomna-route-leaving::after{' +
        'content:"";position:fixed;inset:0;z-index:2147483646;' +
        'background:#FCFAF6;pointer-events:auto;' +
      '}';
    (document.head || root).appendChild(style);
  }

  function reset() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    root.classList.remove(leavingClass);
  }

  function begin() {
    installStyle();
    root.classList.add(leavingClass);

    /* If a guarded control fails before navigation, never strand the page. */
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(function () {
      if (!document.hidden) reset();
    }, 5000);
  }

  function isDocumentNavigation(anchor) {
    if (!anchor || !anchor.href) return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;
    try {
      var next = new URL(anchor.href, location.href);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return false;
      if (next.origin !== location.origin) return false;
      return next.pathname !== location.pathname ||
        next.search !== location.search ||
        (!next.hash && next.href !== location.href);
    } catch (e) {
      return false;
    }
  }

  function isKnownNavigationControl(control) {
    if (!control || !control.matches) return false;
    if (control.matches(
      '[data-ghd-read],[data-ghd-listen],[data-ghd-commentary],[data-ghd-walk],' +
      '#homeContinueMain,#homeContinueRead,#homeContinueListen,' +
      '[data-home-recent-index],[data-stair-verse],' +
      '.reader-home,.reader-close'
    )) return true;

    var inline = control.getAttribute('onclick') || '';
    return /(?:location\.(?:href|assign|replace)|goHome\s*\(|openDailyVerse\s*\(|openContinue|openReadResume\s*\(|openBibleTab\s*\(|openEasy\s*\(|submitSearch\s*\(|openScriptureHighlightEntry\s*\(|returnTo(?:SearchResults|TodayWordCard|HomeLifeCard|HomePersonCard)\s*\()/i.test(inline);
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
      begin();
      return;
    }
    var control = target.closest('button,[role="button"]');
    if (isKnownNavigationControl(control)) begin();
  }, true);

  window.addEventListener('beforeunload', begin);
  window.addEventListener('pageshow', reset);
})();
