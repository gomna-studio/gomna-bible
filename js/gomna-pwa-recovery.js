/* Installed-app viewport recovery and cooperative service-worker updates. */
(function () {
  'use strict';
  var script = document.currentScript;
  var pageVersion = script && script.getAttribute('data-release');
  var registration = null, pendingVersion = null, reloading = false;
  var resumeToken = 0, lastSignature = '', lastBlur = 0, probe = null;
  var correctedTab = null, tabTop = '', tabBottom = '';
  function installedIOS() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && (navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  }
  function editing() {
    var el = document.activeElement;
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }
  function busy() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState && engine.getState();
    if (state && (state.isPlaying || state.isLoading || state.isPaused || state.queueActive || state.isRecovering)) return true;
    var media = document.querySelectorAll('audio,video');
    for (var i = 0; i < media.length; i++) if (!media[i].paused && !media[i].ended) return true;
    return editing();
  }
  function naturalViewport() {
    var vv = window.visualViewport;
    var height = vv && vv.height > 0 ? vv.height : window.innerHeight;
    return { height: height, bottom: height + (vv ? vv.offsetTop || 0 : 0), corrected: false };
  }
  function viewport() {
    var result = naturalViewport(), vv = window.visualViewport;
    if (!installedIOS() || editing() || Date.now() - lastBlur < 1000 ||
        (vv && Math.abs((vv.scale || 1) - 1) > 0.02)) return result;
    if (!probe && document.body) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;contain:strict;';
      document.body.appendChild(probe);
    }
    var cssHeight = probe ? probe.getBoundingClientRect().height : 0;
    var layout = window.innerHeight;
    // Two independent layout readings must agree. Never stretch a real keyboard or pinch viewport.
    if (layout > 0 && cssHeight > 0 && Math.abs(cssHeight - layout) <= 3 &&
        (Math.abs(result.height - layout) > 80 || (vv && Math.abs(vv.offsetTop || 0) > 3))) {
      return { height: layout, bottom: layout, corrected: true };
    }
    return result;
  }
  window.GOMNA_PWA_VIEWPORT = { read: viewport };
  function restoreTab() {
    if (!correctedTab) return;
    correctedTab.style.top = tabTop;
    correctedTab.style.bottom = tabBottom;
    correctedTab = null;
  }
  function measure() {
    if (!installedIOS() || document.visibilityState === 'hidden') return;
    var box = viewport();
    var vv = window.visualViewport;
    var protectedViewport = editing() || Date.now() - lastBlur < 1000 || (vv && Math.abs((vv.scale || 1) - 1) > 0.02);
    if (protectedViewport) { restoreTab(); return; }
    // Meditation uses native fixed positioning, so verify the actual bottom edge too.
    var tab = document.body && document.body.getAttribute('data-gomna-page') === 'meditation' && document.getElementById('gomnaHomeTabbar');
    if (tab) {
      var rect = tab.getBoundingClientRect();
      if (rect.height > 0 && (correctedTab || Math.abs(rect.bottom - box.bottom) > 8)) {
        if (!correctedTab) { correctedTab = tab; tabTop = tab.style.top; tabBottom = tab.style.bottom; }
        tab.style.top = Math.max(0, box.bottom - rect.height) + 'px';
        tab.style.bottom = 'auto';
      }
    }
    var signature = Math.round(box.height) + ':' + Math.round(box.bottom) + ':' + window.innerWidth;
    if (signature !== lastSignature) {
      lastSignature = signature;
      window.dispatchEvent(new CustomEvent('gomna:viewport-restored', { detail: box }));
    }
  }
  function recover() {
    var token = ++resumeToken;
    [0, 120, 420, 1000, 1800, 3000].forEach(function (delay) {
      window.setTimeout(function () { if (token === resumeToken) measure(); }, delay);
    });
  }
  function maybeReload() {
    if (!pendingVersion || reloading || busy() || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    // Lock against the incoming worker's version, never against this old document's version.
    var key = 'gomna-applied-release:' + pendingVersion;
    try { if (sessionStorage.getItem(key) === '1') return; sessionStorage.setItem(key, '1'); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.set('appRelease', pendingVersion);
    reloading = true;
    location.replace(url.href);
  }
  function checkWorker() {
    if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'GOMNA_GET_RELEASE' });
    if (registration && registration.waiting) registration.waiting.postMessage({ type: 'GOMNA_REQUEST_ACTIVATION' });
  }
  if ('serviceWorker' in navigator && pageVersion) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'GOMNA_UPDATE_PROBE' && event.source) {
        event.source.postMessage({ type: 'GOMNA_UPDATE_REPLY', token: data.token, safe: !busy() });
      } else if (data.type === 'GOMNA_RELEASE' && event.source === navigator.serviceWorker.controller &&
          typeof data.version === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(data.version)) {
        pendingVersion = data.version !== pageVersion ? data.version : null;
        maybeReload();
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', checkWorker);
    function registerWorker() {
    navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(pageVersion), { scope: '/', updateViaCache: 'none' })
      .then(function (reg) {
        registration = reg;
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (worker) worker.addEventListener('statechange', function () { if (worker.state === 'installed') checkWorker(); });
        });
        checkWorker();
        reg.update().catch(function () {});
      }).catch(function () {});
    }
    if (navigator.serviceWorker.controller) registerWorker();
    else if (document.readyState === 'complete') window.setTimeout(registerWorker, 1200);
    else window.addEventListener('load', function () {
      if (window.requestIdleCallback) window.requestIdleCallback(registerWorker, { timeout: 4000 });
      else window.setTimeout(registerWorker, 1200);
    }, { once: true });
    ['audio:end', 'audio:error'].forEach(function (name) {
      window.addEventListener(name, function () { window.setTimeout(function () { checkWorker(); maybeReload(); }, 0); });
    });
    window.setInterval(function () { if (document.visibilityState !== 'hidden') { checkWorker(); maybeReload(); } }, 15000);
  }
  function returned() {
    recover();
    if ('serviceWorker' in navigator) {
      checkWorker();
      if (registration) registration.update().catch(function () {});
    }
    maybeReload();
  }
  window.addEventListener('pageshow', returned);
  window.addEventListener('focus', returned);
  window.addEventListener('orientationchange', function () { restoreTab(); recover(); });
  window.addEventListener('resize', recover);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', recover);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') returned(); });
  document.addEventListener('focusout', function () { lastBlur = Date.now(); recover(); });
  document.addEventListener('focusin', restoreTab);
  recover();
}());
