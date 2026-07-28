(function() {
  'use strict';

  function showOrLog(message) {
    if (typeof window.GOMNA_AUDIO_TOAST === 'function') {
      window.GOMNA_AUDIO_TOAST(message);
    } else {
      console.warn('[GOMNA_AUDIO]', message);
    }
  }

  window.GOMNA_AUDIO_ENGINE = {
    _state: {
      currentAudio: null,
      currentAudioId: null,
      nextAudio: null,
      nextAudioId: null,
      isPlaying: false,
      isPaused: false,
      playbackCancelled: false,
      currentSpeed: 1.0,
      currentVoice: 'calm',
      queueAudioIds: [],
      queueIndex: -1,
      queueActive: false,
      queueSource: null,
      queueSoftFailStreak: 0,
      queueEpoch: 0,
      restoreStartTime: 0,
      timerId: null
    },

    _MAX_QUEUE_SOFT_FAIL_STREAK: 12,

    _bumpQueueEpoch: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;
      state.queueEpoch = (state.queueEpoch || 0) + 1;
      return state.queueEpoch;
    },

    _resetQueueSoftFailStreak: function() {
      window.GOMNA_AUDIO_ENGINE._state.queueSoftFailStreak = 0;
    },

    _noteQueueSoftFailSkip: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;
      state.queueSoftFailStreak = (state.queueSoftFailStreak || 0) + 1;
      return state.queueSoftFailStreak;
    },

    _abortQueueSoftFailLimit: function(audioId, entry) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      console.warn('[GOMNA_AUDIO] queue soft-fail streak limit — stopping queue safely');
      state.playbackCancelled = true;
      engine._bumpQueueEpoch();
      engine._clearQueue();
      engine._cleanupCurrentAudio();
      state.currentAudioId = null;
      state.isPlaying = false;
      state.isPaused = false;
      state.restoreStartTime = 0;
      engine._emit('audio:end', {
        audioId: audioId || null,
        entry: entry || null,
        reason: 'soft_fail_limit'
      });
    },

    /** Reset soft-fail / cancel flags when starting a fresh chapter queue. */
    prepareFreshQueuePlayback: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      engine._bumpQueueEpoch();
      engine._resetQueueSoftFailStreak();
      state.playbackCancelled = false;
      state.isPaused = false;
      state.restoreStartTime = 0;
    },

    _emit: function(eventName, detail) {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: detail || {}
      }));
    },

    _cleanupCurrentAudio: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;

      if (state.currentAudio) {
        try {
          state.currentAudio.pause();
          state.currentAudio.src = '';
          state.currentAudio.load();
        } catch (e) {
          console.warn('[GOMNA_AUDIO] cleanup warning:', e);
        }

        state.currentAudio = null;
      }
    },

    _cleanupNextAudio: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;

      if (state.nextAudio) {
        try {
          state.nextAudio.pause();
          state.nextAudio.src = '';
          state.nextAudio.load();
        } catch (e) {
          console.warn('[GOMNA_AUDIO] next cleanup warning:', e);
        }

        state.nextAudio = null;
      }

      state.nextAudioId = null;
    },

    _clearQueue: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      engine._cleanupNextAudio();

      state.queueAudioIds = [];
      state.queueIndex = -1;
      state.queueActive = false;
      state.queueSource = null;
      state.queueSoftFailStreak = 0;
    },

    _isSameQueue: function(audioIds, source) {
      var state = window.GOMNA_AUDIO_ENGINE._state;

      if (!state.queueActive || state.queueSource !== source) return false;
      if (!audioIds || audioIds.length !== state.queueAudioIds.length) return false;

      for (var i = 0; i < audioIds.length; i++) {
        if (audioIds[i] !== state.queueAudioIds[i]) return false;
      }

      return true;
    },

    _getManifestEntry: function(audioId) {
      var config = window.GOMNA_AUDIO_CONFIG;
      return config && config.manifestData && config.manifestData.audios
        ? config.manifestData.audios[audioId]
        : null;
    },

    _COMMENTARY_TYPES: {
      'original-language': true,
      'history': true,
      'theology': true,
      'typology': true,
      'matthew-henry': true,
      'sermon': true,
      'hymn': true,
      'counseling': true,
      'cross-reference': true
    },

    _isCommentaryEntry: function(entry) {
      return !!(entry && window.GOMNA_AUDIO_ENGINE._COMMENTARY_TYPES[entry.type]);
    },

    _isEntryAvailableForCurrentVoice: function(entry) {
      var state = window.GOMNA_AUDIO_ENGINE._state;
      var engine = window.GOMNA_AUDIO_ENGINE;

      if (!entry) return false;

      if (engine._isCommentaryEntry(entry)) {
        return entry.status === 'published' && !!(entry.filePath && String(entry.filePath).trim());
      }

      if (entry.type === 'bible') {
        return entry.voicePreset === state.currentVoice;
      }

      return entry.voicePreset === state.currentVoice;
    },

    _findNextPlayableIndex: function(fromIndex) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var i = fromIndex;

      while (i < state.queueAudioIds.length) {
        var entry = engine._getManifestEntry(state.queueAudioIds[i]);

        if (entry && entry.status === 'published' && engine._isEntryAvailableForCurrentVoice(entry)) {
          return i;
        }

        i += 1;
      }

      return -1;
    },

    // 현재 절이 재생되는 동안 다음 절 MP3를 미리 로딩해 둔다.
    // 재생은 하지 않고 preload만 하므로 절이 겹치거나 crossfade 되지 않는다.
    _prepareNextInQueue: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var config = window.GOMNA_AUDIO_CONFIG;

      if (!state.queueActive || state.queueAudioIds.length === 0 || !config) {
        return;
      }

      var nextIndex = engine._findNextPlayableIndex(state.queueIndex + 1);

      if (nextIndex === -1) {
        engine._cleanupNextAudio();
        return;
      }

      var nextId = state.queueAudioIds[nextIndex];

      if (state.nextAudioId === nextId && state.nextAudio) {
        return;
      }

      engine._cleanupNextAudio();

      var entry = engine._getManifestEntry(nextId);

      if (!entry) {
        return;
      }

      var audioSrc = typeof config.buildAudioUrl === 'function'
        ? config.buildAudioUrl(entry.filePath)
        : entry.filePath;

      try {
        var audio = new Audio();
        audio.preload = 'auto';
        audio.src = audioSrc;
        audio.load();

        state.nextAudio = audio;
        state.nextAudioId = nextId;
      } catch (e) {
        console.warn('[GOMNA_AUDIO] preload warning:', e);
        engine._cleanupNextAudio();
      }
    },

    _playNextInQueue: function(expectedEpoch) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (!state.queueActive || state.queueAudioIds.length === 0) {
        return false;
      }

      if (
        typeof expectedEpoch === 'number' &&
        state.queueEpoch !== expectedEpoch
      ) {
        return false;
      }

      state.queueIndex += 1;

      while (state.queueIndex < state.queueAudioIds.length) {
        if (engine.playAudioById(state.queueAudioIds[state.queueIndex], {
          fromQueue: true,
          queueEpoch: state.queueEpoch
        })) {
          return true;
        }

        state.queueIndex += 1;
      }

      engine._clearQueue();
      return false;
    },

    playAudioById: function(audioId, options) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var config = window.GOMNA_AUDIO_CONFIG;
      var startTime;
      options = options || {};
      startTime = Number(options.startTime) || 0;

      console.log('[GOMNA_AUDIO] play:', audioId);

      if (state.currentAudio && state.currentAudioId === audioId && !options.forceRestart) {
        if (state.isPlaying) {
          engine.pauseAudio();
          return true;
        }

        if (state.isPaused) {
          engine.resumeAudio();
          return true;
        }
      }

      if (!options.fromQueue) {
        engine._clearQueue();
        state.playbackCancelled = false;
      }

      if (!config) {
        console.warn('[GOMNA_AUDIO] config not found');
        engine._emit('audio:error', {
          audioId: audioId,
          reason: 'config_not_found'
        });
        showOrLog('오디오 설정을 불러오지 못했습니다.');
        return false;
      }

      if (config.manifestLoadStatus === 'pending' || config.manifestLoadStatus === 'loading') {
        showOrLog('오디오 데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.');
        return false;
      }

      if (config.manifestLoadStatus === 'error' || !config.manifestData) {
        showOrLog('오디오 데이터 로딩 실패. 페이지를 새로고침해주세요.');
        engine._emit('audio:error', {
          audioId: audioId,
          reason: 'manifest_not_loaded'
        });
        return false;
      }

      var entry = engine._getManifestEntry(audioId);

      if (!entry) {
        console.warn('[GOMNA_AUDIO] audioId not in manifest:', audioId);
        engine._emit('audio:error', {
          audioId: audioId,
          reason: 'not_found'
        });
        showOrLog('오디오 준비 중입니다.');
        return false;
      }

      if (entry.status !== 'published') {
        console.log('[GOMNA_AUDIO] not published:', audioId, entry.status);
        showOrLog('오디오 준비 중입니다.');
        return false;
      }

      if (!engine._isEntryAvailableForCurrentVoice(entry)) {
        console.log('[GOMNA_AUDIO] voice not available:', audioId, state.currentVoice);
        showOrLog('해당 목소리는 준비 중입니다.');
        return false;
      }

      engine._cleanupCurrentAudio();

      var audio = null;

      // 큐 진행 중이고 이 절이 미리 preload 되어 있으면 재사용해 즉시 재생한다.
      if (options.fromQueue && state.nextAudio && state.nextAudioId === audioId) {
        audio = state.nextAudio;
        state.nextAudio = null;
        state.nextAudioId = null;
      }

      if (!audio) {
        var audioSrc = typeof config.buildAudioUrl === 'function'
          ? config.buildAudioUrl(entry.filePath)
          : entry.filePath;
        audio = new Audio(audioSrc);
      }

      audio.playbackRate = state.currentSpeed;
      state.restoreStartTime = startTime > 0 ? startTime : 0;

      if (startTime > 0) {
        var applyStartTime = function() {
          try {
            var duration = audio.duration || 0;
            var nextTime = startTime;

            if (duration > 0 && nextTime >= duration) {
              nextTime = Math.max(0, duration - 0.25);
            }

            audio.currentTime = nextTime;
          } catch (e) {
            console.warn('[GOMNA_AUDIO] restore seek warning:', e);
          }
        };

        audio.addEventListener('loadedmetadata', applyStartTime, { once: true });
        applyStartTime();
      }

      /*
       * Capture session id for this Audio element. Stale ended/error/play
       * callbacks from a replaced element must not advance the new queue —
       * that was skipping to verse 2–3 and emitting false queue_completed.
       */
      var playEpoch = state.queueEpoch;

      audio.addEventListener('ended', function() {
        if (state.queueEpoch !== playEpoch) return;
        if (audio !== state.currentAudio || audioId !== state.currentAudioId) return;

        state.isPlaying = false;
        state.isPaused = false;
        state.restoreStartTime = 0;

        if (state.playbackCancelled) {
          return;
        }

        if (engine._playNextInQueue(playEpoch)) {
          return;
        }

        if (state.queueEpoch !== playEpoch) return;

        state.currentAudio = null;
        state.currentAudioId = null;

        engine._emit('audio:end', {
          audioId: audioId,
          entry: entry,
          reason: 'queue_completed'
        });
      });

      audio.addEventListener('error', function(e) {
        var mediaError = audio.error;
        var errorDetail = {
          audioId: audioId,
          code: mediaError ? mediaError.code : null,
          message: mediaError ? mediaError.message : '',
          currentSrc: audio.currentSrc || '',
          src: audio.src || ''
        };

        if (state.queueEpoch !== playEpoch) return;
        if (audio !== state.currentAudio || audioId !== state.currentAudioId) {
          return;
        }

        if (state.playbackCancelled || state.isPaused) {
          return;
        }

        console.error('[GOMNA_AUDIO] audio error:', e, errorDetail);

        state.isPlaying = false;
        state.isPaused = false;
        state.restoreStartTime = 0;

        /* Queue playback: skip the broken verse instead of killing the chapter. */
        if (options.fromQueue && state.queueActive) {
          if (engine._noteQueueSoftFailSkip() >= engine._MAX_QUEUE_SOFT_FAIL_STREAK) {
            engine._abortQueueSoftFailLimit(audioId, entry);
            return;
          }
          if (engine._playNextInQueue(playEpoch)) {
            return;
          }
          if (state.queueEpoch !== playEpoch) return;
          state.currentAudio = null;
          state.currentAudioId = null;
          engine._emit('audio:end', {
            audioId: audioId,
            entry: entry,
            reason: 'queue_completed'
          });
          return;
        }

        engine._emit('audio:error', {
          audioId: audioId,
          reason: 'play_error',
          entry: entry,
          error: errorDetail
        });
        showOrLog('오디오 재생 오류가 발생했습니다.');
      });

      // iOS Safari 대응:
      // manifest는 이미 audio-config.js에서 미리 로드되어 있어야 하며,
      // audio.play()는 사용자 클릭 흐름 안에서 바로 호출되어야 한다.
      var playPromise = audio.play();

      state.currentAudio = audio;
      state.currentAudioId = audioId;
      state.isPlaying = true;
      state.isPaused = false;

      try {
        window.__gomnaAudioPlayStabilizeUntil = Date.now() + 450;
      } catch (stabilizeErr) { /* ignore */ }

      audio.addEventListener('playing', function onPlayingResetSoftFail() {
        if (state.queueEpoch !== playEpoch) return;
        if (audio !== state.currentAudio || audioId !== state.currentAudioId) return;
        engine._resetQueueSoftFailStreak();
      }, { once: true });

      engine._emit('audio:start', {
        audioId: audioId,
        entry: entry
      });

      // 현재 절이 재생되는 동안 다음 절 MP3를 미리 로딩해 전환 지연을 없앤다.
      if (options.fromQueue && state.queueActive) {
        engine._prepareNextInQueue();
      }

      if (playPromise !== undefined) {
        playPromise.then(function() {
          if (state.queueEpoch !== playEpoch) return;
          if (audio === state.currentAudio && audioId === state.currentAudioId) {
            engine._resetQueueSoftFailStreak();
          }
        }).catch(function(err) {
          var retryCount;
          var errName;
          var maxRetry = 2;

          if (state.queueEpoch !== playEpoch) return;
          if (audio !== state.currentAudio || audioId !== state.currentAudioId) {
            return;
          }

          if (state.playbackCancelled) {
            return;
          }

          if (state.isPaused && err && err.name === 'AbortError') {
            return;
          }

          errName = err && err.name ? String(err.name) : '';
          retryCount = parseInt(options._retryCount, 10);
          if (isNaN(retryCount) || retryCount < 0) retryCount = 0;

          console.warn('[GOMNA_AUDIO] play rejected:', audioId, errName || err);

          state.isPlaying = false;
          state.restoreStartTime = 0;

          /* Queue: soft-fail — retry, then skip verse. Never wipe the chapter queue. */
          if (options.fromQueue && state.queueActive && !state.playbackCancelled && !state.isPaused) {
            if (retryCount < maxRetry) {
              window.setTimeout(function() {
                if (state.queueEpoch !== playEpoch) return;
                if (state.playbackCancelled || state.isPaused || !state.queueActive) return;
                if (state.currentAudioId && state.currentAudioId !== audioId) return;
                if (
                  !state.queueAudioIds ||
                  state.queueAudioIds[state.queueIndex] !== audioId
                ) {
                  return;
                }
                engine.playAudioById(audioId, {
                  fromQueue: true,
                  startTime: 0,
                  _retryCount: retryCount + 1,
                  queueEpoch: playEpoch
                });
              }, 180 + retryCount * 120);
              return;
            }

            if (state.queueEpoch !== playEpoch) return;

            if (engine._noteQueueSoftFailSkip() >= engine._MAX_QUEUE_SOFT_FAIL_STREAK) {
              engine._abortQueueSoftFailLimit(audioId, entry);
              return;
            }

            if (engine._playNextInQueue(playEpoch)) {
              return;
            }

            if (state.queueEpoch !== playEpoch) return;

            state.currentAudio = null;
            state.currentAudioId = null;
            engine._emit('audio:end', {
              audioId: audioId,
              entry: entry,
              reason: 'queue_completed'
            });
            return;
          }

          state.isPaused = false;
          engine._clearQueue();

          engine._emit('audio:error', {
            audioId: audioId,
            reason: 'play_rejected',
            entry: entry,
            errorName: errName
          });

          showOrLog('재생을 시작할 수 없습니다.');
        });
      }

      return true;
    },

    playAudioQueue: function(audioIds, options) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var startIndex;
      var startTime;
      options = options || {};
      startIndex = parseInt(options.startIndex, 10);
      startTime = Number(options.startTime) || 0;

      if (!audioIds || !audioIds.length) {
        showOrLog('오디오 준비 중입니다.');
        return false;
      }

      if (isNaN(startIndex) || startIndex < 0) {
        startIndex = 0;
      }

      if (startIndex >= audioIds.length) {
        startIndex = audioIds.length - 1;
      }

      /*
       * Same-queue tap normally toggles pause/resume. forceRestart (verse jump /
       * continuous replace) must rebuild and play from the requested index.
       */
      if (
        !options.forceRestart &&
        engine._isSameQueue(audioIds, options.source || null) &&
        state.currentAudio
      ) {
        if (state.isPlaying) {
          engine.pauseAudio();
          return true;
        }

        if (state.isPaused) {
          engine.resumeAudio();
          return true;
        }
      }

      /* Invalidate stale soft-fail retries from a previous chapter/queue. */
      engine.prepareFreshQueuePlayback();
      engine._clearQueue();
      state.playbackCancelled = false;

      /* Drop current element without stopAudio/user_stop or audio:pause. */
      engine._cleanupCurrentAudio();
      state.currentAudioId = null;
      state.isPlaying = false;
      state.isPaused = false;
      state.restoreStartTime = 0;
      engine._resetQueueSoftFailStreak();

      state.queueAudioIds = audioIds.slice();
      state.queueIndex = startIndex;
      state.queueActive = true;
      state.queueSource = options.source || null;

      if (!engine.playAudioById(state.queueAudioIds[state.queueIndex], {
        fromQueue: true,
        startTime: startTime,
        forceRestart: !!options.forceRestart
      })) {
        return engine._playNextInQueue();
      }

      return true;
    },

    playAudioSequence: function(audioIds, options) {
      return window.GOMNA_AUDIO_ENGINE.playAudioQueue(audioIds, options || {});
    },

    playAudioRange: function(bookId, chapter, startVerse, endVerse) {
      var audioIds = [];
      var chapter3 = String(chapter).padStart(3, '0');
      var start = Number(startVerse);
      var end = Number(endVerse);
      var items;
      var i;
      var verse;
      var occurrence;
      var verseSegment;

      if (!bookId || !chapter || isNaN(start) || isNaN(end) || start > end) {
        showOrLog('오디오 준비 중입니다.');
        return false;
      }

      items = document.querySelectorAll('#verseList .verse-item[data-verse]');
      if (items && items.length) {
        for (i = 0; i < items.length; i++) {
          verse = parseInt(items[i].getAttribute('data-verse'), 10);
          if (isNaN(verse) || verse < start || verse > end) continue;
          occurrence = parseInt(items[i].getAttribute('data-audio-occurrence') || '1', 10) || 1;
          verseSegment = String(verse).padStart(3, '0') + (occurrence > 1 ? 'o' + occurrence : '');
          audioIds.push(bookId + '.' + chapter3 + '.' + verseSegment + '.bible');
        }
      }

      if (!audioIds.length) {
        for (verse = start; verse <= end; verse++) {
          audioIds.push(bookId + '.' + chapter3 + '.' + String(verse).padStart(3, '0') + '.bible');
        }
      }

      return window.GOMNA_AUDIO_ENGINE.playAudioQueue(audioIds);
    },

    pauseAudio: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (state.currentAudio && state.isPlaying) {
        state.currentAudio.pause();
        state.isPlaying = false;
        state.isPaused = true;

        engine._emit('audio:pause', {
          audioId: state.currentAudioId
        });
      }
    },

    resumeAudio: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (state.currentAudio && state.isPaused) {
        var playPromise = state.currentAudio.play();

        if (playPromise !== undefined) {
          playPromise.then(function() {
            state.isPlaying = true;
            state.isPaused = false;

            engine._emit('audio:resume', {
              audioId: state.currentAudioId
            });
          }).catch(function(err) {
            console.error('[GOMNA_AUDIO] resume rejected:', err);

            engine._emit('audio:error', {
              audioId: state.currentAudioId,
              reason: 'resume_rejected'
            });

            showOrLog('재생을 다시 시작할 수 없습니다.');
          });
        } else {
          state.isPlaying = true;
          state.isPaused = false;

          engine._emit('audio:resume', {
            audioId: state.currentAudioId
          });
        }
      }
    },

    stopAudio: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var audioId = state.currentAudioId;
      var hadPlayback = !!(state.currentAudio || state.queueActive);

      /* Explicit user/system stop — do not soft-retry or continue chapters. */
      state.playbackCancelled = true;
      engine._bumpQueueEpoch();
      engine._clearQueue();
      engine._cleanupCurrentAudio();

      state.currentAudioId = null;
      state.isPlaying = false;
      state.isPaused = false;
      state.restoreStartTime = 0;

      if (hadPlayback) {
        engine._emit('audio:end', {
          audioId: audioId,
          reason: 'user_stop'
        });
      }
    },

    seekAudio: function(deltaSeconds) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (!state.currentAudio) {
        console.warn('[GOMNA_AUDIO] seek: no current audio');
        return;
      }

      var delta = Number(deltaSeconds);
      if (isNaN(delta)) {
        console.warn('[GOMNA_AUDIO] invalid seek delta:', deltaSeconds);
        return;
      }

      var duration = state.currentAudio.duration || 0;
      var currentTime = state.currentAudio.currentTime || 0;
      var newTime = currentTime + delta;

      if (newTime < 0) newTime = 0;
      if (duration > 0 && newTime > duration) newTime = duration;

      state.currentAudio.currentTime = newTime;

      engine._emit('audio:seek', {
        audioId: state.currentAudioId,
        currentTime: newTime,
        deltaSeconds: delta
      });
    },

    changeSpeed: function(rate) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var config = window.GOMNA_AUDIO_CONFIG;

      var nextRate = Number(rate);

      if (isNaN(nextRate)) {
        console.warn('[GOMNA_AUDIO] invalid speed:', rate);
        return;
      }

      if (config && config.PLAYBACK_SPEEDS && config.PLAYBACK_SPEEDS.indexOf(nextRate) === -1) {
        console.warn('[GOMNA_AUDIO] speed not allowed:', nextRate);
        return;
      }

      state.currentSpeed = nextRate;

      if (state.currentAudio) {
        state.currentAudio.playbackRate = nextRate;
      }

      engine._emit('audio:speed_change', {
        speed: nextRate
      });
    },

    changeVoice: function(voicePresetId) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;
      var config = window.GOMNA_AUDIO_CONFIG;

      if (!voicePresetId) {
        console.warn('[GOMNA_AUDIO] missing voice preset');
        return;
      }

      if (!config || !config.VOICE_PRESETS || !config.VOICE_PRESETS[voicePresetId]) {
        console.warn('[GOMNA_AUDIO] invalid voice preset:', voicePresetId);
        return false;
      }

      if (voicePresetId !== 'calm') {
        showOrLog('해당 목소리는 준비 중입니다.');
        return false;
      }

      state.currentVoice = voicePresetId;

      // 현재 manifest는 audioId당 filePath 1개 구조다.
      // 따라서 이번 단계에서는 실제 오디오 파일 교체를 하지 않고,
      // 목소리 프리셋 선택 상태만 저장한다.
      // 향후 manifest에 variants 구조가 추가되면 여기에서 실제 파일 교체를 구현한다.

      engine._emit('audio:voice_change', {
        voice: voicePresetId,
        preset: config.VOICE_PRESETS[voicePresetId]
      });

      return true;
    },

    setSleepTimer: function(minutes) {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }

      if (minutes === 'chapter-end') {
        engine._emit('audio:timer_set', {
          minutes: 'chapter-end'
        });
        return;
      }

      var value = Number(minutes);

      if (!value || value <= 0 || isNaN(value)) {
        engine._emit('audio:timer_set', {
          minutes: 0
        });
        return;
      }

      state.timerId = setTimeout(function() {
        engine.stopAudio();

        showOrLog(value + '분 타이머가 종료되어 재생이 정지되었습니다.');

        state.timerId = null;

        engine._emit('audio:timer_end', {
          minutes: value
        });
      }, value * 60 * 1000);

      engine._emit('audio:timer_set', {
        minutes: value
      });
    },

    getState: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;

      var currentTime = 0;
      var duration = 0;

      if (state.currentAudio) {
        currentTime = state.currentAudio.currentTime || state.restoreStartTime || 0;
        duration = state.currentAudio.duration || 0;

        if (isNaN(duration)) duration = 0;
      }

      return {
        currentAudioId: state.currentAudioId,
        isPlaying: state.isPlaying,
        isPaused: state.isPaused,
        currentSpeed: state.currentSpeed,
        currentVoice: state.currentVoice,
        queueActive: state.queueActive,
        queueSource: state.queueSource,
        queueIndex: state.queueIndex,
        queueLength: state.queueAudioIds.length,
        queueAudioIds: state.queueAudioIds.slice(),
        currentTime: currentTime,
        duration: duration,
        hasTimer: !!state.timerId
      };
    }
  };

  console.log('[GOMNA_AUDIO_ENGINE] engine loaded (9-B all functions implemented)');
})();
