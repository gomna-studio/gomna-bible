/** Consent-gated observations; never controls playback or stores visitor identities. */
(function () {
  'use strict';
  if (window.GomnaUsageDiagnostics) return;
  window.GomnaUsageDiagnostics = true;
  var pending = null, current = null, cleanups = [];
  var screen = screenName(), visibleSince = null, screenSeconds = 0;
  function allowed() { return !!(window.GomnaGa4 && window.GomnaGa4.allowed()); }
  function now() { return performance.now(); }
  function screenName() {
    var path = location.pathname;
    // Do not transmit query strings, user-entered searches, or arbitrary hashes.
    if (/\/bible-images\//.test(path)) return 'guide_images';
    if (/reader\.html$/.test(path)) return 'bible_reader';
    if (/meditation\.html$/.test(path)) return 'meditation';
    if (/^#bible-library\/people\//.test(location.hash)) return 'bible_person';
    if (/^#bible-library\/stories\//.test(location.hash)) return 'bible_story';
    if (path === '/' || /\/index\.html$/.test(path)) return 'home';
    return 'other';
  }
  function send(name, values) {
    if (!allowed()) return false;
    return window.GomnaGa4.track(name, Object.assign({screen_name: screen, transport_type:'beacon'}, values));
  }
  function screenTick() {
    var t = now();
    if (!allowed()) { visibleSince = null; screenSeconds = 0; return; }
    if (visibleSince !== null) screenSeconds += Math.max(0, t - visibleSince) / 1000;
    visibleSince = document.visibilityState === 'hidden' ? null : t;
  }
  function screenFlush(reason) {
    screenTick();
    if (screenSeconds > 0) send('screen_observed', {visible_seconds:Math.round(screenSeconds * 1000) / 1000, observation_reason:reason});
    screenSeconds = 0;
  }
  function tick() {
    if (!current) return;
    var a = current.audio, t = now(), pos = a.currentTime;
    var wall = Math.max(0, (t - current.at) / 1000);
    var delta = pos - current.pos;
    // Media progress proves playback. Never count pauses, stalls, or seeking jumps.
    if (allowed() && !a.seeking && delta > 0 && delta <= wall * Math.max(0.25, a.playbackRate || 1) + 0.35) {
      current.seconds += Math.min(wall, delta / Math.max(0.25, a.playbackRate || 1));
    }
    if (!allowed()) current.seconds = 0;
    current.pos = pos; current.at = t;
  }
  function flush(reason) {
    tick();
    if (!current) return;
    if (current.seconds > 0) send('audio_listen_time', {listen_seconds:Math.round(current.seconds * 1000)/1000, audio_type:current.type, observation_reason:reason});
    current.seconds = 0;
  }
  function unbind() { cleanups.forEach(function (f) { f(); }); cleanups = []; }
  function observe(a, name, fn) { a.addEventListener(name, fn); cleanups.push(function () { a.removeEventListener(name, fn); }); }
  window.addEventListener('audio:request', function (e) {
    flush('next_request'); unbind(); current = null;
    pending = allowed() ? {id:e.detail.audioId, at:now(), automatic:!!e.detail.automatic, started:false, failed:false, slow:false} : null;
    if (pending) send('audio_request', {request_kind:pending.automatic ? 'automatic' : 'user'});
  });
  window.addEventListener('audio:start', function (e) {
    flush('track_change'); unbind();
    var state = window.GOMNA_AUDIO_ENGINE && window.GOMNA_AUDIO_ENGINE._state;
    var a = state && state.currentAudio;
    if (!a) return;
    current = {audio:a, at:now(), pos:a.currentTime, seconds:0, type:e.detail.entry && e.detail.entry.type || 'unknown'};
    function playing() {
      if (pending && pending.id === e.detail.audioId && !pending.started && !pending.failed) {
        pending.started = true;
        send('audio_started', {startup_seconds:Math.round((now()-pending.at))/1000, request_kind:pending.automatic?'automatic':'user'});
      }
      tick();
    }
    observe(a,'playing',playing);
    observe(a,'timeupdate',tick);
    observe(a,'seeking',function () { flush('seek'); });
    observe(a,'seeked',function () { if(current){current.pos=a.currentTime;current.at=now();} });
    ['pause','waiting','ended'].forEach(function (n) { observe(a,n,function () { flush(n); }); });
    if (!a.paused && a.readyState >= 3) playing();
  });
  function failure(e) {
    if (e.detail && (e.detail.stale || e.detail.ignored)) return;
    if (pending && e.detail.audioId && pending.id !== e.detail.audioId) return;
    flush('error');
    if (pending && pending.failed) return;
    if (pending) pending.failed = true;
    var reason = e.detail && e.detail.reason;
    var safe = ['config_not_found','manifest_not_loaded','manifest_loading','not_found','not_published','voice_unavailable','play_error','play_rejected','resume_rejected'];
    send('audio_failure', {failure_reason:safe.indexOf(reason)>=0 ? reason:'other'});
  }
  window.addEventListener('audio:error', failure);
  window.addEventListener('audio:diagnostic-failure', failure);
  window.addEventListener('audio:end', function () { flush('stop'); unbind(); current=null; pending=null; });
  window.addEventListener('audio:pause', function () { flush('pause'); pending=null; });
  window.addEventListener('hashchange', function () { screenFlush('screen_change'); screen=screenName(); });
  document.addEventListener('visibilitychange', function () {
    screenFlush(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
    flush('visibility_change');
  });
  window.addEventListener('pagehide', function () { screenFlush('pagehide'); visibleSince=null; flush('pagehide'); });
  window.addEventListener('pageshow', function () { screenTick(); });
  setInterval(function () {
    screenTick(); tick();
    if (pending && !pending.started && !pending.failed && !pending.slow && now()-pending.at >= 3000) {
      pending.slow=true;
      send('audio_start_slow', {request_kind:pending.automatic?'automatic':'user'});
    }
  },1000);
  setInterval(function () { screenFlush('heartbeat'); flush('heartbeat'); },30000);
})();
