(function() {
  'use strict';

  var TOAST_DURATION_MS = 3000;
  var activeToastTimer = null;
  var expandedPlayerNode = null;

  function showToast(message, duration) {
    if (typeof message !== 'string' || !message) return;

    duration = duration || TOAST_DURATION_MS;

    var oldToasts = document.querySelectorAll('.gomna-audio-toast');
    for (var i = 0; i < oldToasts.length; i++) {
      if (oldToasts[i].parentNode) {
        oldToasts[i].parentNode.removeChild(oldToasts[i]);
      }
    }

    if (activeToastTimer) {
      clearTimeout(activeToastTimer);
      activeToastTimer = null;
    }

    var toast = document.createElement('div');
    toast.className = 'gomna-audio-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;

    document.body.appendChild(toast);

    activeToastTimer = setTimeout(function() {
      toast.classList.add('fade-out');

      setTimeout(function() {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);

      activeToastTimer = null;
    }, duration);
  }

  window.GOMNA_AUDIO_TOAST = showToast;

  function showElement(el) {
    if (!el) return;

    el.hidden = false;

    requestAnimationFrame(function() {
      el.classList.add('gomna-audio-visible');
    });
  }

  function hideElement(el) {
    if (!el) return;

    el.classList.remove('gomna-audio-visible');

    setTimeout(function() {
      if (!el.classList.contains('gomna-audio-visible')) {
        el.hidden = true;
      }
    }, 300);
  }

  function getMiniPlayer() {
    return document.getElementById('gomna-audio-mini-player');
  }

  function getExpandedPlayer() {
    expandedPlayerNode = document.getElementById('gomna-audio-expanded-player') || expandedPlayerNode;
    return expandedPlayerNode;
  }

  function getVerseRangeBox() {
    return document.getElementById('verseRangeBoxBtn') ||
      document.querySelector('#verseView .verse-range-box');
  }

  var EXPANDED_PLAYER_INLINE_STYLE_PROPS = [
    'position',
    'top',
    'bottom',
    'left',
    'right',
    'transform',
    'width',
    'max-width',
    'margin-top',
    'margin-bottom',
    'max-height',
    'height',
    'overflow',
    'overflow-y',
    'opacity',
    'pointer-events'
  ];

  function applyExpandedPlayerInlineStyles(player) {
    if (!player) return;

    player.style.setProperty('position', 'relative', 'important');
    player.style.setProperty('top', 'auto', 'important');
    player.style.setProperty('bottom', 'auto', 'important');
    player.style.setProperty('left', 'auto', 'important');
    player.style.setProperty('right', 'auto', 'important');
    player.style.setProperty('transform', 'none', 'important');
    player.style.setProperty('width', '100%', 'important');
    player.style.setProperty('max-width', '100%', 'important');
    player.style.setProperty('margin-top', '8px', 'important');
    player.style.setProperty('margin-bottom', '16px', 'important');
    player.style.setProperty('max-height', 'none', 'important');
    player.style.setProperty('height', 'auto', 'important');
    player.style.setProperty('overflow', 'visible', 'important');
    player.style.setProperty('overflow-y', 'visible', 'important');
    player.style.setProperty('opacity', '1', 'important');
    player.style.setProperty('pointer-events', 'auto', 'important');
    player.classList.add('gomna-audio-inline');
  }

  function clearExpandedPlayerInlineStyles(player) {
    if (!player) return;

    for (var i = 0; i < EXPANDED_PLAYER_INLINE_STYLE_PROPS.length; i++) {
      player.style.removeProperty(EXPANDED_PLAYER_INLINE_STYLE_PROPS[i]);
    }

    player.classList.remove('gomna-audio-inline');
  }

  function hideVerseListForExpandedPlayer() {
    var verseList = document.getElementById('verseList');

    if (!verseList) return;

    if (!verseList.dataset.gomnaAudioPrevDisplay) {
      verseList.dataset.gomnaAudioPrevDisplay = verseList.style.display || '';
      verseList.dataset.gomnaAudioPrevHeight = verseList.style.height || '';
      verseList.dataset.gomnaAudioPrevMinHeight = verseList.style.minHeight || '';
      verseList.dataset.gomnaAudioPrevOverflow = verseList.style.overflow || '';
    }

    verseList.style.display = 'none';
    verseList.style.setProperty('height', '0', 'important');
    verseList.style.setProperty('min-height', '0', 'important');
    verseList.style.setProperty('overflow', 'hidden', 'important');
    document.body.classList.add('gomna-audio-expanded-open');
  }

  function restoreVerseListAfterExpandedPlayer() {
    var verseList = document.getElementById('verseList');

    document.body.classList.remove('gomna-audio-expanded-open');

    if (!verseList) return;

    verseList.style.display = verseList.dataset.gomnaAudioPrevDisplay || '';
    verseList.style.height = verseList.dataset.gomnaAudioPrevHeight || '';
    verseList.style.minHeight = verseList.dataset.gomnaAudioPrevMinHeight || '';
    verseList.style.overflow = verseList.dataset.gomnaAudioPrevOverflow || '';

    delete verseList.dataset.gomnaAudioPrevDisplay;
    delete verseList.dataset.gomnaAudioPrevHeight;
    delete verseList.dataset.gomnaAudioPrevMinHeight;
    delete verseList.dataset.gomnaAudioPrevOverflow;

    verseList.style.removeProperty('display');
    verseList.style.removeProperty('height');
    verseList.style.removeProperty('min-height');
    verseList.style.removeProperty('overflow');
  }

  function positionExpandedPlayerInline() {
    var rangeBox = getVerseRangeBox();
    var player = getExpandedPlayer();

    if (rangeBox && player) {
      rangeBox.insertAdjacentElement('afterend', player);

      if (!rangeBox.dataset.gomnaAudioPrevMarginBottom) {
        rangeBox.dataset.gomnaAudioPrevMarginBottom = rangeBox.style.marginBottom || '';
      }
      rangeBox.style.setProperty('margin-bottom', '0', 'important');

      applyExpandedPlayerInlineStyles(player);
      return;
    }

    if (!rangeBox) {
      console.warn('[GOMNA_AUDIO] verse range box not found; keeping existing expanded player position');
    }
    if (!player) {
      console.warn('[GOMNA_AUDIO] expanded player not found');
    }
  }

  function teardownExpandedPlayerLayout() {
    var rangeBox = getVerseRangeBox();
    var player = getExpandedPlayer();

    restoreVerseListAfterExpandedPlayer();

    if (rangeBox && rangeBox.dataset.gomnaAudioPrevMarginBottom !== undefined) {
      rangeBox.style.marginBottom = rangeBox.dataset.gomnaAudioPrevMarginBottom;
      delete rangeBox.dataset.gomnaAudioPrevMarginBottom;
    }

    clearExpandedPlayerInlineStyles(player);
  }

  function showMiniPlayer() {
    showElement(getMiniPlayer());
    document.body.classList.add('gomna-audio-body-padding');
  }

  function hideMiniPlayer() {
    hideElement(getMiniPlayer());
    hideExpandedPlayer();
    document.body.classList.remove('gomna-audio-body-padding');
  }

  function showExpandedPlayer() {
    positionExpandedPlayerInline();
    hideVerseListForExpandedPlayer();
    showElement(getExpandedPlayer());

    requestAnimationFrame(function() {
      positionExpandedPlayerInline();
    });
  }

  function hideExpandedPlayer() {
    teardownExpandedPlayerLayout();
    hideElement(getExpandedPlayer());
  }

  function setPlayPauseIcon(isPlaying) {
    var playIcons = document.querySelectorAll('[data-audio-play-icon]');
    var pauseIcons = document.querySelectorAll('[data-audio-pause-icon]');

    for (var i = 0; i < playIcons.length; i++) {
      playIcons[i].hidden = isPlaying;
    }

    for (var j = 0; j < pauseIcons.length; j++) {
      pauseIcons[j].hidden = !isPlaying;
    }
  }

  function updateCurrentText(entry, audioId) {
    var title = '';
    var preview = '';

    if (entry) {
      title = entry.book + ' ' + entry.chapter + '장 ' + entry.verse + '절 · ' + entry.typeKr;
      preview = entry.preview || '';
    } else if (audioId) {
      title = audioId;
    }

    var titleEls = document.querySelectorAll('[data-audio-current-title], [data-audio-current-title-expanded]');
    var previewEls = document.querySelectorAll('[data-audio-current-preview], [data-audio-current-preview-expanded]');

    for (var i = 0; i < titleEls.length; i++) {
      titleEls[i].textContent = title;
    }

    for (var j = 0; j < previewEls.length; j++) {
      previewEls[j].textContent = preview;
    }
  }

  function formatSpeed(speed) {
    return Number(speed).toFixed(2).replace(/0$/, '');
  }

  function updateSpeedText(speed) {
    var speedButtons = document.querySelectorAll('[data-audio-action="speed"]');

    for (var i = 0; i < speedButtons.length; i++) {
      speedButtons[i].textContent = formatSpeed(speed) + 'x';
    }
  }

  function setActiveWithinGroup(btn, selector) {
    if (!btn || !btn.parentNode) return;

    var groupButtons = btn.parentNode.querySelectorAll(selector);

    for (var i = 0; i < groupButtons.length; i++) {
      groupButtons[i].removeAttribute('data-active');
      groupButtons[i].classList.remove('gomna-audio-active');
    }

    btn.setAttribute('data-active', 'true');
    btn.classList.add('gomna-audio-active');
  }

  function getNextSpeed(currentSpeed) {
    var config = window.GOMNA_AUDIO_CONFIG;
    var speeds = config && config.PLAYBACK_SPEEDS ? config.PLAYBACK_SPEEDS : [0.8, 1.0, 1.25, 1.5, 2.0];

    var index = speeds.indexOf(currentSpeed);
    if (index === -1) index = 1;

    return speeds[(index + 1) % speeds.length];
  }

  document.addEventListener('click', function(e) {
    if (!window.GOMNA_AUDIO_ENGINE) return;

    var engine = window.GOMNA_AUDIO_ENGINE;
    var target = e.target;

    if (!target || !target.closest) return;

    var actionEl = target.closest('[data-audio-action]');
    var speedEl = target.closest('[data-audio-speed]');
    var voiceEl = target.closest('[data-audio-voice]');
    var timerEl = target.closest('[data-audio-timer]');

    if (speedEl) {
      var speed = parseFloat(speedEl.getAttribute('data-audio-speed'));

      if (!isNaN(speed)) {
        engine.changeSpeed(speed);
        updateSpeedText(speed);
        setActiveWithinGroup(speedEl, '[data-audio-speed]');
      }

      return;
    }

    if (voiceEl) {
      var voice = voiceEl.getAttribute('data-audio-voice');

      if (voice) {
        engine.changeVoice(voice);
        setActiveWithinGroup(voiceEl, '[data-audio-voice]');
      }

      return;
    }

    if (timerEl) {
      var timerValue = timerEl.getAttribute('data-audio-timer');
      var minutes = timerValue === 'chapter-end' ? 'chapter-end' : parseFloat(timerValue);

      engine.setSleepTimer(minutes);
      setActiveWithinGroup(timerEl, '[data-audio-timer]');

      return;
    }

    if (!actionEl) return;

    var action = actionEl.getAttribute('data-audio-action');
    var audioId = actionEl.getAttribute('data-audio-id');
    var state = engine.getState ? engine.getState() : engine._state;

    switch (action) {
      case 'play':
        if (audioId) {
          engine.playAudioById(audioId);
        }
        break;

      case 'toggle':
        if (state && state.isPlaying) {
          engine.pauseAudio();
        } else if (state && state.isPaused) {
          engine.resumeAudio();
        } else if (state && state.currentAudioId) {
          engine.playAudioById(state.currentAudioId);
        } else {
          showToast('먼저 듣기 버튼을 선택해주세요.');
        }
        break;

      case 'seek':
        var seconds = parseInt(actionEl.getAttribute('data-seek-seconds'), 10);
        if (!isNaN(seconds)) {
          engine.seekAudio(seconds);
        }
        break;

      case 'speed':
        var currentState = engine.getState ? engine.getState() : engine._state;
        var nextSpeed = getNextSpeed(currentState.currentSpeed || 1.0);
        engine.changeSpeed(nextSpeed);
        updateSpeedText(nextSpeed);
        break;

      case 'expand':
        showExpandedPlayer();
        break;

      case 'collapse':
        hideExpandedPlayer();
        break;

      case 'stop':
        engine.stopAudio();
        break;

      default:
        break;
    }
  });

  window.addEventListener('audio:start', function(e) {
    var detail = e.detail || {};

    showMiniPlayer();
    setPlayPauseIcon(true);
    updateCurrentText(detail.entry, detail.audioId);
  });

  window.addEventListener('audio:pause', function() {
    setPlayPauseIcon(false);
  });

  window.addEventListener('audio:resume', function() {
    setPlayPauseIcon(true);
  });

  window.addEventListener('audio:end', function() {
    setPlayPauseIcon(false);
    hideMiniPlayer();
  });

  window.addEventListener('audio:error', function(e) {
    var detail = e.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : (engine && engine._state);
    var hasActiveDifferentAudio =
      state &&
      state.isPlaying &&
      state.currentAudioId &&
      detail.audioId &&
      detail.audioId !== state.currentAudioId;

    if (detail.ignored || detail.stale || hasActiveDifferentAudio) {
      return;
    }

    setPlayPauseIcon(false);

    if (!state || !state.isPlaying || state.currentAudioId === detail.audioId) {
      hideMiniPlayer();
    }

    if (detail.reason === 'not_found' || detail.reason === 'manifest_not_loaded' || detail.reason === 'config_not_found') {
      showToast('오디오 준비 중입니다.');
    }
  });

  window.addEventListener('audio:speed_change', function(e) {
    if (e.detail && e.detail.speed) {
      updateSpeedText(e.detail.speed);
    }
  });

  window.addEventListener('audio:voice_change', function(e) {
    if (e.detail && e.detail.preset && e.detail.preset.name) {
      showToast(e.detail.preset.name + ' 선택됨');
    }
  });

  window.addEventListener('audio:timer_set', function(e) {
    if (!e.detail) return;

    if (e.detail.minutes === 'chapter-end') {
      showToast('장 끝까지 재생됩니다.');
    } else if (!e.detail.minutes || e.detail.minutes <= 0) {
      showToast('타이머가 해제되었습니다.');
    } else {
      showToast(e.detail.minutes + '분 타이머가 설정되었습니다.');
    }
  });

  console.log('[GOMNA_AUDIO_UI] loaded');
})();
