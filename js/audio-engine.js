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
      isPlaying: false,
      isPaused: false,
      currentSpeed: 1.0,
      currentVoice: 'calm',
      queueAudioIds: [],
      queueIndex: -1,
      queueActive: false,
      queueSource: null,
      restoreStartTime: 0,
      timerId: null
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

    _clearQueue: function() {
      var state = window.GOMNA_AUDIO_ENGINE._state;

      state.queueAudioIds = [];
      state.queueIndex = -1;
      state.queueActive = false;
      state.queueSource = null;
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

    _playNextInQueue: function() {
      var engine = window.GOMNA_AUDIO_ENGINE;
      var state = engine._state;

      if (!state.queueActive || state.queueAudioIds.length === 0) {
        return false;
      }

      state.queueIndex += 1;

      while (state.queueIndex < state.queueAudioIds.length) {
        if (engine.playAudioById(state.queueAudioIds[state.queueIndex], { fromQueue: true })) {
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

      if (state.currentAudio && state.currentAudioId === audioId) {
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

      var audioSrc = typeof config.buildAudioUrl === 'function'
        ? config.buildAudioUrl(entry.filePath)
        : entry.filePath;
      var audio = new Audio(audioSrc);
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

      audio.addEventListener('ended', function() {
        state.isPlaying = false;
        state.isPaused = false;
        state.restoreStartTime = 0;

        if (engine._playNextInQueue()) {
          return;
        }

        state.currentAudio = null;
        state.currentAudioId = null;

        engine._emit('audio:end', {
          audioId: audioId,
          entry: entry
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

        if (audio !== state.currentAudio || audioId !== state.currentAudioId) {
          return;
        }

        console.error('[GOMNA_AUDIO] audio error:', e, errorDetail);

        state.isPlaying = false;
        state.isPaused = false;
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

      engine._emit('audio:start', {
        audioId: audioId,
        entry: entry
      });

      if (playPromise !== undefined) {
        playPromise.catch(function(err) {
          if (audio !== state.currentAudio || audioId !== state.currentAudioId) {
            return;
          }

          if (state.isPaused && err && err.name === 'AbortError') {
            return;
          }

          console.error('[GOMNA_AUDIO] play rejected:', err);

          state.isPlaying = false;
          state.isPaused = false;
          state.restoreStartTime = 0;
          engine._clearQueue();

          engine._emit('audio:error', {
            audioId: audioId,
            reason: 'play_rejected',
            entry: entry
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

      if (engine._isSameQueue(audioIds, options.source || null) && state.currentAudio) {
        if (state.isPlaying) {
          engine.pauseAudio();
          return true;
        }

        if (state.isPaused) {
          engine.resumeAudio();
          return true;
        }
      }

      engine._clearQueue();
      state.queueAudioIds = audioIds.slice();
      state.queueIndex = startIndex;
      state.queueActive = true;
      state.queueSource = options.source || null;

      if (!engine.playAudioById(state.queueAudioIds[state.queueIndex], {
        fromQueue: true,
        startTime: startTime
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

      if (!bookId || !chapter || isNaN(start) || isNaN(end) || start > end) {
        showOrLog('오디오 준비 중입니다.');
        return false;
      }

      for (var verse = start; verse <= end; verse++) {
        audioIds.push(bookId + '.' + chapter3 + '.' + String(verse).padStart(3, '0') + '.bible');
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

      if (state.currentAudio) {
        var audioId = state.currentAudioId;

        engine._clearQueue();
        engine._cleanupCurrentAudio();

        state.currentAudioId = null;
        state.isPlaying = false;
        state.isPaused = false;
        state.restoreStartTime = 0;

        engine._emit('audio:end', {
          audioId: audioId
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
