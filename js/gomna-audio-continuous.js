(function () {
  'use strict';
  var engine = window.GOMNA_AUDIO_ENGINE;
  // iOS: do not put runtime MP3 decoding/PCM packing before the first sound.
  // Keep the existing, tap-authorized native player and next-verse prefetch.
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return;
  var Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!engine || !Decoder || !window.fetch || !window.URL || !URL.createObjectURL) return;
  var state = engine._state, pending = null, ready = null, active = null, startup = null;
  var originalPlay = engine.playAudioById, originalPrepare = engine._prepareNextInQueue;
  var originalEpoch = engine._bumpQueueEpoch, originalGetState = engine.getState;
  var originalRetry = engine.retryRecoveringAudio;
  var originalSeek = engine.seekAudio;
  var originalPause = engine.pauseAudio;
  var originalResume = engine.resumeAudio;
  var MAX_VERSES = 8, MAX_BYTES = 16 * 1024 * 1024, SAMPLE_RATE = 24000;

  function revoke(item) { if (item && item.url) URL.revokeObjectURL(item.url); }
  function cancel() {
    if (pending) { pending.cancelled = true; pending.controller.abort(); }
    pending = null; revoke(ready); ready = null; active = null; startup = null;
  }
  engine._bumpQueueEpoch = function () { cancel(); return originalEpoch.apply(engine, arguments); };

  function pack(buffers, ids, firstIndex, epoch) {
    var frames = 0, cues = [];
    buffers.forEach(function (buffer, n) {
      cues.push({ id: ids[n], index: firstIndex + n, start: frames / SAMPLE_RATE, duration: buffer.length / SAMPLE_RATE });
      frames += buffer.length;
    });
    if (frames * 4 > MAX_BYTES) throw new Error('continuous PCM size limit');
    var bytes = new ArrayBuffer(44 + frames * 4), view = new DataView(bytes);
    function word(offset, text) { for (var n = 0; n < text.length; n++) view.setUint8(offset + n, text.charCodeAt(n)); }
    word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 4, true);
    view.setUint16(32, 4, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, frames * 4, true);
    var offset = 44;
    buffers.forEach(function (buffer) {
      var left = buffer.getChannelData(0), right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
      for (var i = 0; i < buffer.length; i++) {
        for (var channel = 0; channel < 2; channel++) {
          var value = Math.max(-1, Math.min(1, (channel ? right : left)[i]));
          view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2;
        }
      }
    });
    return { url: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })), cues: cues, epoch: epoch, endIndex: firstIndex + cues.length - 1 };
  }

  function prepare(firstIndex) {
    if (!state.queueActive || firstIndex >= state.queueAudioIds.length || pending || ready) return;
    var ids = state.queueAudioIds.slice(firstIndex, firstIndex + (startup ? 3 : MAX_VERSES));
    if (ids.length < 2) return;
    var config = window.GOMNA_AUDIO_CONFIG;
    var entries = ids.map(function (id) { return engine._getManifestEntry(id); });
    if (entries.some(function (entry) { return !entry || entry.type !== 'bible' || entry.status !== 'published' || !engine._isEntryAvailableForCurrentVoice(entry); })) return;
    var job = { epoch: state.queueEpoch, controller: new AbortController(), cancelled: false };
    var timeout = setTimeout(function () { job.controller.abort(); }, 30000);
    pending = job;
    var decoder = new Decoder(2, 1, SAMPLE_RATE), buffers = [], size = 0;
    function valid() { return !job.cancelled && state.queueEpoch === job.epoch && state.queueActive; }
    (async function () {
      for (var i = 0; i < entries.length; i++) {
        if (!valid()) return;
        var entry = entries[i], src = typeof config.buildAudioUrl === 'function' ? config.buildAudioUrl(entry.filePath) : entry.filePath;
        // Reuse the next-verse download already in flight instead of fetching it twice.
        if (state.nextPrefetchId === ids[i] && state.nextPrefetchPromise) {
          await state.nextPrefetchPromise;
          if (!valid()) return;
          if (state.nextPrefetchId === ids[i] && state.nextPrefetchReady && state.nextPrefetchObjectUrl) src = state.nextPrefetchObjectUrl;
        }
        var response = await fetch(src, { cache: 'force-cache', signal: job.controller.signal });
        if (!response.ok) throw new Error('continuous audio HTTP ' + response.status);
        var data = await response.arrayBuffer();
        if (!valid()) return;
        var buffer = await decoder.decodeAudioData(data);
        size += buffer.length * 4;
        if (size > MAX_BYTES) break;
        buffers.push(buffer);
      }
      if (!valid() || buffers.length < 2) return;
      var item = pack(buffers, ids.slice(0, buffers.length), firstIndex, job.epoch);
      if (!valid()) { revoke(item); return; }
      ready = item;
      engine._emit('audio:continuous_ready', { firstAudioId: ids[0], count: buffers.length });
    })().catch(function (error) {
      if (valid()) console.warn('[GOMNA_AUDIO] continuous preparation; using verse fallback:', error.message);
    }).finally(function () {
      clearTimeout(timeout); if (pending === job) pending = null;
      if (!startup || startup.epoch !== job.epoch || !valid()) return;
      if (ready) {
        if (!state.isPaused) launchStartup();
      } else {
        var waiting = startup; startup = null;
        engine._emit('audio:continuous_fallback', { reason: 'preparation_failed' });
        waiting.options = Object.assign({}, waiting.options, { forceRestart: true });
        if (!state.isPaused) originalPlay.call(engine, waiting.id, waiting.options);
        else { waiting.failed = true; startup = waiting; state.isLoading = false; state.isPlaying = false; }
      }
    });
  }

  function launchStartup() {
    var waiting = startup;
    if (!waiting || !ready || !waiting.authorized || waiting.epoch !== state.queueEpoch) return;
    startup = null;
    playContinuous(waiting.id, waiting.options, ready, 0);
  }

  function prepareStartup(id, options) {
    var epoch = state.queueEpoch;
    startup = { id: id, options: options, epoch: epoch, authorized: false };
    var prepared = state.preparedAudio;
    var audio = state.currentAudio || (state.preparedAudioId === id ? prepared : null) || new Audio();
    if (audio === prepared) {
      state.preparedAudio = null; state.preparedAudioId = null; state.preparedAudioUrl = null;
    } else engine._clearPreparedAudio();
    state.currentAudio = audio; engine._clearTrackListeners(audio);
    state.currentAudioId = id; state.isLoading = true; state.isPlaying = true; state.isPaused = false;
    // Authorize the same media element within the tap, without speaking a verse early.
    var silence = new Float32Array(2400);
    var prime = pack([{ length: 2400, numberOfChannels: 1, getChannelData: function () { return silence; } }], [id], state.queueIndex, epoch);
    if (state.currentObjectUrl) engine._revokeObjectUrl(state.currentObjectUrl);
    state.currentObjectUrl = prime.url; audio.src = prime.url; audio.preload = 'auto';
    try {
      var permission = audio.play();
      if (permission && permission.then) permission.then(function () {
        if (!startup || startup.epoch !== epoch) return;
        startup.authorized = true; audio.pause();
        if (ready && !state.isPaused) launchStartup();
      }).catch(function () {
        if (!startup || startup.epoch !== epoch) return;
        startup.authorized = true;
        if (ready && !state.isPaused) launchStartup();
      });
      else startup.authorized = true;
    } catch (error) { startup.authorized = true; }
    prepare(state.queueIndex);
    engine._emit('audio:continuous_preparing', { audioId: id });
    return true;
  }

  engine._prepareNextInQueue = function () {
    if (active) { prepare(active.endIndex + 1); return; }
    originalPrepare.apply(engine, arguments);
    prepare(state.queueIndex + 1);
  };

  function playContinuous(id, options, item, cueIndex) {
    var audio = state.currentAudio, cue = item.cues[cueIndex];
    if (!audio) return false;
    ready = null; active = item; item.cueIndex = cueIndex;
    audio.pause(); engine._clearTrackListeners(audio); engine._clearStallWatch(); engine._clearRecoveryRetry(); engine._clearNextPrefetch();
    var previous = state.currentObjectUrl;
    state.currentObjectUrl = item.url; if (previous && previous !== item.url) engine._revokeObjectUrl(previous);
    state.currentAudioId = id; state.isLoading = true; state.isPlaying = true; state.isPaused = false; state.isRecovering = false;
    state.queueIndex = cue.index; audio.src = item.url; audio.preload = 'auto';
    var epoch = state.queueEpoch, seek = cue.start + Math.max(0, Math.min(cue.duration - 0.01, Number(options.startTime) || 0));
    function valid() { return active === item && state.queueEpoch === epoch && state.currentAudio === audio && !state.playbackCancelled; }
    function completed(c) {
      if (state.queueCompletedAudioIds.indexOf(c.id) >= 0) return;
      state.queueCompletedAudioIds.push(c.id);
      engine._emit('audio:verse_complete', { audioId: c.id, queueIndex: c.index, queueEpoch: epoch, continuous: true });
    }
    function sync() {
      if (!valid()) return;
      while (item.cueIndex < item.cues.length - 1 && audio.currentTime >= item.cues[item.cueIndex + 1].start) {
        if (!valid()) return;
        completed(item.cues[item.cueIndex]); item.cueIndex++;
        var current = item.cues[item.cueIndex]; state.currentAudioId = current.id; state.queueIndex = current.index;
        engine._emit('audio:start', { audioId: current.id, entry: engine._getManifestEntry(current.id), continuous: true });
      }
    }
    engine._addTrackListener(audio, 'loadedmetadata', function () { if (!valid()) return; audio.currentTime = seek; engine._applyCurrentSpeed(audio); }, { once: true });
    engine._addTrackListener(audio, 'playing', function () { if (!valid()) return; state.isLoading = false; engine._applyCurrentSpeed(audio); prepare(item.endIndex + 1); });
    engine._addTrackListener(audio, 'timeupdate', sync);
    engine._addTrackListener(audio, 'ended', function () {
      if (!valid()) return;
      sync(); completed(item.cues[item.cueIndex]); active = null;
      state.isLoading = false; state.isPlaying = false; state.isPaused = false;
      var lastId = state.currentAudioId, all = state.queueAudioIds.slice(), done = state.queueCompletedAudioIds.slice(), source = state.queueSource;
      if (engine._playNextInQueue(epoch)) return;
      state.currentAudioId = null;
      engine._emit('audio:end', { audioId: lastId, entry: engine._getManifestEntry(lastId), reason: 'queue_completed', queueSource: source, queueAudioIds: all, completedAudioIds: done });
    });
    function fallback(error) {
      if (!valid()) return;
      // Pausing during startup rejects play() with AbortError; it is not a media failure.
      if ((state.isPaused || item.pauseRequested) && error && error.name === 'AbortError') return;
      sync(); var current = item.cues[item.cueIndex], time = Math.max(0, audio.currentTime - current.start);
      active = null; console.warn('[GOMNA_AUDIO] continuous playback; restoring verse:', error);
      originalPlay.call(engine, current.id, { fromQueue: true, forceRestart: true, startTime: time });
    }
    engine._addTrackListener(audio, 'error', function () { fallback('media error'); });
    engine._emit('audio:start', { audioId: id, entry: engine._getManifestEntry(id), continuous: true });
    if (!valid() || state.isPaused) return true;
    var promise;
    try { promise = audio.play(); } catch (error) { fallback(error); return true; }
    if (promise && promise.catch) promise.catch(fallback);
    return true;
  }

  engine.playAudioById = function (id, options) {
    options = options || {};
    if (active && state.currentAudioId === id && !options.forceRestart) return originalPlay.apply(engine, arguments);
    if (!options.fromQueue) cancel();
    if (startup && startup.epoch === state.queueEpoch) return true;
    if (options.fromQueue && ready && ready.epoch === state.queueEpoch) {
      var index = ready.cues.findIndex(function (cue) { return cue.id === id; });
      if (index >= 0) return playContinuous(id, options, ready, index);
      if (state.queueIndex > ready.endIndex) { revoke(ready); ready = null; }
    }
    if (active) active = null;
    if (options.fromQueue && !options._retryCount && !options._stallRecovery && !state.queueCompletedAudioIds.length) {
      var upcoming = state.queueAudioIds.slice(state.queueIndex, state.queueIndex + 3);
      if (upcoming.length >= 2 && upcoming.every(function (nextId) {
        var entry = engine._getManifestEntry(nextId);
        return entry && entry.type === 'bible' && entry.status === 'published' && engine._isEntryAvailableForCurrentVoice(entry);
      })) return prepareStartup(id, options);
    }
    return originalPlay.apply(engine, arguments);
  };
  engine.getState = function () {
    var result = originalGetState.apply(engine, arguments);
    if (active && state.currentAudio) {
      var cue = active.cues[active.cueIndex];
      result.currentTime = Math.max(0, state.currentAudio.currentTime - cue.start); result.duration = cue.duration;
    }
    return result;
  };
  engine.seekAudio = function (delta) {
    if (!active || !state.currentAudio) return originalSeek.apply(engine, arguments);
    delta = Number(delta); if (!isFinite(delta)) return;
    var cue = active.cues[active.cueIndex];
    var time = Math.max(0, Math.min(cue.duration - 0.01, state.currentAudio.currentTime - cue.start + delta));
    state.currentAudio.currentTime = cue.start + time;
    engine._emit('audio:seek', { audioId: cue.id, currentTime: time, duration: cue.duration });
  };
  engine.pauseAudio = function () {
    if (active) active.pauseRequested = true;
    return originalPause.apply(engine, arguments);
  };
  engine.resumeAudio = function () {
    if (startup) {
      state.isPaused = false; state.isPlaying = true;
      if (startup.failed) { var waiting = startup; startup = null; originalPlay.call(engine, waiting.id, waiting.options); }
      else if (ready) launchStartup();
      return;
    }
    return originalResume.apply(engine, arguments);
  };
  engine.retryRecoveringAudio = function () {
    if (active) return false;
    return originalRetry.apply(engine, arguments);
  };
})();
