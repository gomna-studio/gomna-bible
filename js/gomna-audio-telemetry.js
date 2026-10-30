/** Observe the existing player. Never call play/pause/load or alter its queue. */
(function () {
  'use strict';
  if (window.GomnaAudioTelemetry) return;
  var current = null;
  var latestAttempt = null;
  function allowed() { return !!(window.GomnaGa4 && window.GomnaGa4.allowed()); }
  function send(name, values) {
    try { if (allowed()) return window.GomnaGa4.track(name, values); } catch (e) {}
    return false;
  }
  function props(detail) {
    var e = detail.entry || {};
    return { audio_id: String(detail.audioId || '').slice(0, 160), audio_type: e.type || 'unknown',
      book: e.bookId || e.book || '', chapter: Number(e.chapter) || 0, verse: Number(e.verse) || 0 };
  }
  function valid(s) {
    var e = window.GOMNA_AUDIO_ENGINE, st = e && e._state;
    return current === s && st && st.currentAudio === s.audio && st.currentAudioId === s.id && st.queueEpoch === s.epoch;
  }
  function sample(s) {
    var now = performance.now(), pos = Number(s.audio.currentTime) || 0;
    if (allowed() && s.running && !s.audio.seeking && !s.audio.muted && s.audio.volume !== 0) {
      // A seek is not listening; cap media progression by elapsed wall time and rate.
      var delta = (pos - s.pos) / (Number(s.audio.playbackRate) || 1);
      var elapsed = Math.max(0, (now - s.clock) / 1000);
      if (delta > 0 && delta <= elapsed + 0.75) s.pending += Math.min(delta, elapsed);
    } else if (!allowed()) s.pending = 0;
    s.pos = pos; s.clock = now;
  }
  function flush(s, reason) {
    sample(s);
    var seconds = Math.round(s.pending * 1000) / 1000;
    if (seconds > 0) send('audio_listen', Object.assign({}, s.props, { listen_seconds: seconds, reason: reason }));
    s.pending = 0;
  }
  function dispose(reason) {
    if (!current) return;
    var s = current; flush(s, reason);
    clearTimeout(s.timer);
    s.handlers.forEach(function (h) { s.audio.removeEventListener(h[0], h[1], true); });
    current = null;
  }
  function start(event) {
    var d = event.detail || {}, engine = window.GOMNA_AUDIO_ENGINE, st = engine && engine._state;
    if (!st || !st.currentAudio || !d.entry) return;
    if (current && current.audio === st.currentAudio && current.id === d.audioId && current.epoch === st.queueEpoch) return;
    dispose('track_change');
    var s = current = { audio: st.currentAudio, id: d.audioId, epoch: st.queueEpoch,
      props: props(d), requested: latestAttempt && latestAttempt.id === d.audioId ? latestAttempt.at : performance.now(), clock: performance.now(), pos: Number(st.currentAudio.currentTime) || 0,
      pending: 0, running: false, started: false, handlers: [] };
    send('audio_request', s.props);
    // Capture before the engine reuses the element or removes track listeners.
    function on(name, fn) { s.handlers.push([name, fn]); s.audio.addEventListener(name, fn, true); }
    function playing() {
      if (!valid(s)) return;
      sample(s); s.running = true;
      if (!s.started && allowed()) {
        s.started = true; clearTimeout(s.timer);
        send('audio_play', Object.assign({}, s.props, { startup_ms: Math.round(performance.now() - s.requested) }));
      }
    }
    on('playing', playing);
    on('timeupdate', function () {
      if (!valid(s)) return;
      sample(s);
      if (s.pending >= 15) flush(s, 'progress');
    });
    ['pause','waiting','seeking','ended','error'].forEach(function (name) {
      on(name, function () {
        if (current !== s) return;
        flush(s, name); s.running = false;
        if (name === 'waiting') send('audio_buffering', s.props);
        if (name === 'error') send('audio_media_error', Object.assign({}, s.props, { error_code: (s.audio.error && s.audio.error.code) || 0 }));
      });
    });
    on('seeked', function () { s.pos = Number(s.audio.currentTime) || 0; s.clock = performance.now(); s.running = !s.audio.paused; });
    s.timer = setTimeout(function () {
      if (valid(s) && !s.started && !s.audio.paused) send('audio_start_pending', Object.assign({}, s.props, { wait_ms: 10000 }));
    }, 10000);
    // Continuous playback crosses verses without another native playing event.
    if (d.continuous && !s.audio.paused && !s.audio.seeking && s.audio.readyState >= 3) playing();
  }
  window.GomnaAudioTelemetry = { version: '20261030-v3' };
  window.addEventListener('audio:attempt', function (event) {
    var d = event.detail || {};
    latestAttempt = { id: d.audioId, at: performance.now() };
    send('audio_attempt', Object.assign({}, props(d), { from_queue: !!d.fromQueue, source: String(d.source || 'direct').slice(0, 80) }));
  });
  window.addEventListener('audio:blocked', function (event) {
    var d = event.detail || {};
    send('audio_blocked', Object.assign({}, props(d), { reason: String(d.reason || 'unknown').slice(0, 80) }));
    latestAttempt = null;
  });
  window.addEventListener('audio:start', start);
  window.addEventListener('audio:end', function () { dispose('end'); });
  window.addEventListener('audio:resume-request', function (event) {
    if (current && !current.started && current.id === (event.detail || {}).audioId) current.requested = performance.now();
  });
  window.addEventListener('audio:error', function (event) {
    var d = event.detail || {};
    send('audio_failure', Object.assign({}, props(d), { reason: String(d.reason || 'unknown').slice(0, 80) }));
    if (current && (!d.audioId || d.audioId === current.id)) {
      if (d.needsUserGesture) { clearTimeout(current.timer); current.running = false; current.pending = 0; }
      else dispose('failure');
    }
  });
  window.addEventListener('pagehide', function () { if (current) flush(current, 'pagehide'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && current) flush(current, 'background'); });
})();
