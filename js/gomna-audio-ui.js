(function() {
  'use strict';

  var TOAST_DURATION_MS = 3000;
  var activeToastTimer = null;
  var expandedPlayerNode = null;
  var lastRenderedAudioContextKey = '';
  var BIBLE_RESUME_STORAGE_KEY = 'gomna_audio_bible_resume_v1';
  var CHAPTER_AUTO_STORAGE_KEY = 'gomna_audio_chapter_auto_v1';
  var BIBLE_RESUME_SAVE_INTERVAL_MS = 4000;
  var bibleResumeTimeupdateAudio = null;
  var lastBibleResumeSaveAt = 0;
  var miniProgressAudio = null;
  var activeExpandedSettingsPanel = null;
  var lastHeroCaptionKey = '';
  var lastHeroCaptionText = '';
  var lastHeroCaptionReadCount = -1;
  var heroCaptionSpanNodes = [];
  var heroCaptionTransitionTimer = null;

  function showToast(message, duration, options) {
    if (typeof message !== 'string' || !message) return;

    options = options || {};
    // 절 본문 밖 듣기 안내만 4초 — 다른 토스트는 기본 3초 유지
    duration = duration || (options.variant === 'listen-hint' ? 4000 : TOAST_DURATION_MS);

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
    if (options.variant) {
      toast.classList.add('gomna-audio-toast--' + options.variant);
    }
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

  function isVerseViewScreenActive() {
    if (typeof window.isReaderVerseViewActive === 'function') {
      try { return !!window.isReaderVerseViewActive(); } catch (e) {}
    }
    var vv = document.getElementById('verseView');
    return !!(vv && vv.classList.contains('active'));
  }

  function allowVerseScreenAudioPlayback() {
    return isVerseViewScreenActive();
  }

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
    'min-height',
    'margin-top',
    'margin-left',
    'margin-right',
    'margin-bottom',
    'max-height',
    'height',
    'overflow',
    'overflow-x',
    'overflow-y',
    'visibility',
    'z-index',
    'opacity',
    'pointer-events'
  ];

  function applyExpandedPlayerInlineStyles(player) {
    if (!player) return;

    player.style.setProperty('position', 'fixed', 'important');
    player.style.setProperty('top', '50%', 'important');
    player.style.setProperty('bottom', 'auto', 'important');
    player.style.setProperty('left', '50%', 'important');
    player.style.setProperty('right', 'auto', 'important');
    player.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
    player.style.setProperty(
      'width',
      'min(var(--gomna-commentary-card-width, 430px), calc(100vw - 18px))',
      'important'
    );
    player.style.setProperty('max-width', 'var(--gomna-commentary-card-width, 430px)', 'important');
    player.style.setProperty(
      'min-height',
      'auto',
      'important'
    );
    player.style.setProperty('margin-top', '0', 'important');
    player.style.setProperty('margin-left', 'auto', 'important');
    player.style.setProperty('margin-right', 'auto', 'important');
    player.style.setProperty('margin-bottom', '0', 'important');
    player.style.setProperty(
      'max-height',
      'var(--gomna-expanded-card-max-height, calc(100dvh - 32px))',
      'important'
    );
    player.style.setProperty('height', 'auto', 'important');
    player.style.setProperty('overflow', 'auto', 'important');
    player.style.setProperty('overflow-x', 'hidden', 'important');
    player.style.setProperty('overflow-y', 'auto', 'important');
    player.style.setProperty('visibility', 'visible', 'important');
    player.style.setProperty('z-index', '10100', 'important');
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

  function isCommentaryPopupOpen() {
    var pop = document.getElementById('commentaryPopup');
    if (document.body.classList.contains('gomna-commentary-popup-open')) return true;
    return !!(pop && pop.classList.contains('show'));
  }

  function shouldUseFixedExpandedOverlay() {
    var mini = getMiniPlayer();
    if (isCommentaryPopupOpen()) return true;
    if (mini && !mini.hidden && mini.classList.contains('gomna-audio-visible')) return true;
    return false;
  }

  function mountExpandedPlayerOverlay(player) {
    if (!player) return;
    /* Body-level fixed overlay — never trap under #commentaryPopup / #verseView. */
    if (player.parentElement !== document.body) {
      document.body.appendChild(player);
    }
    applyExpandedPlayerInlineStyles(player);
  }

  function positionExpandedPlayerInline() {
    var rangeBox = getVerseRangeBox();
    var player = getExpandedPlayer();

    if (!player) {
      console.warn('[GOMNA_AUDIO] expanded player not found');
      return;
    }

    if (shouldUseFixedExpandedOverlay()) {
      mountExpandedPlayerOverlay(player);
      return;
    }

    if (rangeBox) {
      rangeBox.insertAdjacentElement('afterend', player);

      if (!rangeBox.dataset.gomnaAudioPrevMarginBottom) {
        rangeBox.dataset.gomnaAudioPrevMarginBottom = rangeBox.style.marginBottom || '';
      }
      rangeBox.style.setProperty('margin-bottom', '0', 'important');

      applyExpandedPlayerInlineStyles(player);
      return;
    }

    mountExpandedPlayerOverlay(player);
    console.warn('[GOMNA_AUDIO] verse range box not found; using body overlay for expanded player');
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
    document.body.classList.add('gomna-audio-visible');
    document.body.classList.add('gomna-audio-body-padding');
    bindExpandCollapseButtons();
  }

  function hideMiniPlayer() {
    hideElement(getMiniPlayer());
    hideExpandedPlayer();
    document.body.classList.remove('gomna-audio-visible');
    document.body.classList.remove('gomna-audio-body-padding');
  }

  function setCommentaryAudioExpanded(expanded) {
    if (expanded) showExpandedPlayer();
    else hideExpandedPlayer();
  }

  function showExpandedPlayer() {
    var player = getExpandedPlayer();
    if (!player) return;

    positionExpandedPlayerInline();
    if (!shouldUseFixedExpandedOverlay()) {
      hideVerseListForExpandedPlayer();
    } else {
      document.body.classList.add('gomna-audio-expanded-open');
    }

    /* Show immediately — do not wait a frame (iOS can miss the delayed class). */
    player.hidden = false;
    player.classList.add('gomna-audio-visible');
    applyExpandedPlayerInlineStyles(player);

    ensureExpandedProgress();
    bindMiniProgressAudio();
    updateMiniProgressFromState();
    updateExpandedSettingsSummary();
    updateChapterAutoToggle();
    startHeroCaptionSync();
    bindExpandCollapseButtons();

    requestAnimationFrame(function() {
      positionExpandedPlayerInline();
      player.hidden = false;
      player.classList.add('gomna-audio-visible');
      applyExpandedPlayerInlineStyles(player);
      updateMiniProgressFromState();
      updateExpandedSettingsSummary();
      updateChapterAutoToggle();
      updateHeroCaptionFromState();
    });
  }

  function bindExpandCollapseButtons() {
    var expandBtn = document.querySelector(
      '#gomna-audio-mini-player .gomna-audio-btn-expand[data-audio-action="expand"]'
    );
    var collapseBtns;
    var i;

    if (expandBtn && expandBtn.getAttribute('data-gomna-expand-bound') !== '1') {
      expandBtn.setAttribute('data-gomna-expand-bound', '1');
      expandBtn.setAttribute('type', 'button');
      expandBtn.addEventListener('click', function(event) {
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        setCommentaryAudioExpanded(true);
      });
    }

    collapseBtns = document.querySelectorAll(
      '#gomna-audio-expanded-player [data-audio-action="collapse"]'
    );
    for (i = 0; i < collapseBtns.length; i++) {
      if (collapseBtns[i].getAttribute('data-gomna-collapse-bound') === '1') continue;
      collapseBtns[i].setAttribute('data-gomna-collapse-bound', '1');
      collapseBtns[i].setAttribute('type', 'button');
      collapseBtns[i].addEventListener('click', function(event) {
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        setCommentaryAudioExpanded(false);
      });
    }
  }

  function isExpandedPlayerVisible() {
    var player = getExpandedPlayer();

    return !!(player && !player.hidden && player.classList.contains('gomna-audio-visible'));
  }

  function getHeroCaptionElement() {
    return document.querySelector('[data-audio-hero-caption]');
  }

  function getHeroCaptionDefaultText() {
    return window.GOMNA_AUDIO_CAPTION && window.GOMNA_AUDIO_CAPTION.DEFAULT_TEXT
      ? window.GOMNA_AUDIO_CAPTION.DEFAULT_TEXT
      : '말씀을 듣고 계십니다';
  }

  function clearHeroCaptionSpans(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    heroCaptionSpanNodes = [];
  }

  function renderHeroCaptionWords(el, words, fullText) {
    var i;
    var span;

    clearHeroCaptionSpans(el);

    if (!words || !words.length) {
      el.textContent = fullText;
      return false;
    }

    for (i = 0; i < words.length; i++) {
      if (i > 0) {
        el.appendChild(document.createTextNode(' '));
      }
      span = document.createElement('span');
      span.className = 'gomna-audio-hero-caption-word';
      span.setAttribute('data-word-index', String(i));
      span.textContent = words[i];
      el.appendChild(span);
      heroCaptionSpanNodes.push(span);
    }

    return true;
  }

  function updateHeroCaptionReadState(readCount) {
    var i;
    var currentIndex;

    if (readCount === lastHeroCaptionReadCount) {
      return;
    }

    currentIndex = readCount > 0 ? readCount - 1 : -1;

    for (i = 0; i < heroCaptionSpanNodes.length; i++) {
      heroCaptionSpanNodes[i].classList.toggle('is-read', i < readCount);
      heroCaptionSpanNodes[i].classList.toggle('is-current', i === currentIndex);
    }

    lastHeroCaptionReadCount = readCount;
  }

  function applyHeroWordCaption(result) {
    var el = getHeroCaptionElement();
    var renderKey;
    var fullText;

    if (!el || !result) return;

    fullText = String(result.fullText || result.text || '').trim();
    if (!fullText) {
      fullText = getHeroCaptionDefaultText();
    }

    renderKey = (result.segmentKey || 'segment') + ':' + fullText;

    if (renderKey !== lastHeroCaptionKey) {
      if (heroCaptionTransitionTimer) {
        clearTimeout(heroCaptionTransitionTimer);
      }

      el.classList.add('is-changing');
      heroCaptionTransitionTimer = setTimeout(function() {
        renderHeroCaptionWords(el, result.words, fullText);
        lastHeroCaptionReadCount = -1;
        updateHeroCaptionReadState(result.readCount || 0);
        el.classList.remove('is-changing');
        heroCaptionTransitionTimer = null;
      }, 150);
    } else {
      updateHeroCaptionReadState(result.readCount || 0);
    }

    lastHeroCaptionKey = renderKey;
    lastHeroCaptionText = fullText;
  }

  function applyHeroCaptionText(text, segmentKey) {
    applyHeroWordCaption({
      text: text,
      fullText: text,
      words: null,
      readCount: 0,
      segmentKey: segmentKey,
      hasWordCues: false
    });
  }

  function updateHeroCaptionFromState(options) {
    var captionApi = window.GOMNA_AUDIO_CAPTION;
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var result;
    var text;
    var previewEl;
    var segmentKey;

    options = options || {};

    if (!isExpandedPlayerVisible()) {
      return;
    }

    if (options.useLastOnEnd) {
      applyHeroCaptionText(
        lastHeroCaptionText || getHeroCaptionDefaultText(),
        'ended'
      );
      return;
    }

    if (!state || !state.currentAudioId) {
      applyHeroCaptionText(getHeroCaptionDefaultText(), 'idle');
      return;
    }

    if (!captionApi || typeof captionApi.getCaptionForState !== 'function') {
      previewEl = document.querySelector(
        '[data-audio-current-preview-expanded], [data-audio-current-preview]'
      );
      text = previewEl && previewEl.textContent ? previewEl.textContent.trim() : '';
      applyHeroCaptionText(text || getHeroCaptionDefaultText(), 'fallback');
      return;
    }

    if (state.isPlaying || state.isPaused) {
      if (captionApi.getWordCaptionForState) {
        result = captionApi.getWordCaptionForState(state, { allowWhenPaused: true });
        applyHeroWordCaption(result);
      } else if (captionApi.getCaptionForState) {
        result = captionApi.getCaptionForState(state, { allowWhenPaused: true });
        applyHeroCaptionText(result.text, result.segmentKey);
      }
      return;
    }

    if (typeof captionApi.getFirstCaptionText === 'function') {
      text = captionApi.getFirstCaptionText(state.currentAudioId);
      segmentKey = 'preview:' + state.currentAudioId;
    } else {
      text = getHeroCaptionDefaultText();
      segmentKey = 'idle';
    }

    applyHeroCaptionText(text, segmentKey);
  }

  function stopHeroCaptionSync() {
    return;
  }

  function startHeroCaptionSync() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var captionApi = window.GOMNA_AUDIO_CAPTION;
    var audioId = state && state.currentAudioId;

    if (audioId && captionApi && typeof captionApi.ensureLoaded === 'function') {
      captionApi.ensureLoaded(audioId).then(function() {
        updateHeroCaptionFromState();
      }).catch(function() {
        updateHeroCaptionFromState();
      });
      return;
    }

    updateHeroCaptionFromState();
  }

  function hideExpandedPlayer() {
    closeExpandedSettingsPanels();
    stopHeroCaptionSync();
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

  function formatAudioTime(seconds) {
    var value = Math.max(0, Math.floor(Number(seconds) || 0));
    var minutes = Math.floor(value / 60);
    var secs = value % 60;

    return String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function ensureMiniProgress() {
    var mini = getMiniPlayer();
    var info;
    var progress;
    var track;
    var fill;
    var thumb;
    var times;

    if (!mini) return null;

    progress = mini.querySelector('[data-audio-mini-progress]');
    if (progress) {
      bindProgressTrackSeek(progress.querySelector('.gomna-audio-mini-progress-track'));
      return progress;
    }

    info = mini.querySelector('.gomna-audio-mini-info');
    if (!info) return null;

    progress = document.createElement('div');
    progress.className = 'gomna-audio-mini-progress';
    progress.setAttribute('data-audio-mini-progress', 'true');
    progress.setAttribute('aria-hidden', 'true');

    track = document.createElement('div');
    track.className = 'gomna-audio-mini-progress-track';

    fill = document.createElement('div');
    fill.className = 'gomna-audio-mini-progress-fill';
    fill.setAttribute('data-audio-mini-progress-fill', 'true');
    fill.setAttribute('data-audio-progress-fill', 'true');

    thumb = document.createElement('span');
    thumb.className = 'gomna-audio-mini-progress-thumb';
    thumb.setAttribute('data-audio-mini-progress-thumb', 'true');
    thumb.setAttribute('data-audio-progress-thumb', 'true');

    times = document.createElement('div');
    times.className = 'gomna-audio-mini-times';
    times.innerHTML = '<span data-audio-current-time>00:00</span><span data-audio-duration>00:00</span>';

    track.appendChild(fill);
    track.appendChild(thumb);
    progress.appendChild(track);
    progress.appendChild(times);
    info.appendChild(progress);
    bindProgressTrackSeek(track);

    return progress;
  }

  function ensureExpandedProgress() {
    var player = getExpandedPlayer();
    var controls;
    var hero;
    var progress;
    var track;
    var fill;
    var thumb;
    var times;

    if (!player) return null;

    progress = player.querySelector('[data-audio-expanded-progress]');
    if (progress) {
      track = progress.querySelector('.gomna-audio-expanded-progress-track');
      if (track) {
        bindProgressTrackSeek(track);
      }
      return progress;
    }

    hero = player.querySelector('.gomna-audio-expanded-hero');
    controls = player.querySelector('.gomna-audio-expanded-controls');
    if (!controls) return null;

    progress = document.createElement('div');
    progress.className = 'gomna-audio-expanded-progress';
    progress.setAttribute('data-audio-expanded-progress', 'true');
    progress.setAttribute('aria-hidden', 'true');

    track = document.createElement('div');
    track.className = 'gomna-audio-expanded-progress-track';

    fill = document.createElement('div');
    fill.className = 'gomna-audio-expanded-progress-fill';
    fill.setAttribute('data-audio-progress-fill', 'true');
    fill.setAttribute('data-audio-expanded-progress-fill', 'true');

    thumb = document.createElement('span');
    thumb.className = 'gomna-audio-expanded-progress-thumb';
    thumb.setAttribute('data-audio-progress-thumb', 'true');
    thumb.setAttribute('data-audio-expanded-progress-thumb', 'true');

    times = document.createElement('div');
    times.className = 'gomna-audio-expanded-times';
    times.innerHTML = '<span data-audio-current-time>00:00</span><span data-audio-duration>00:00</span>';

    track.appendChild(fill);
    track.appendChild(thumb);
    progress.appendChild(track);
    progress.appendChild(times);

    if (hero && hero.parentNode === player) {
      hero.insertAdjacentElement('afterend', progress);
    } else {
      player.insertBefore(progress, controls);
    }

    bindProgressTrackSeek(track);

    return progress;
  }

  function seekAudioToRatio(ratio) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var engineState = engine && engine._state ? engine._state : null;
    var state = engine && engine.getState ? engine.getState() : null;
    var audio;
    var duration;
    var currentTime;
    var targetTime;
    var deltaSeconds;

    if (!engineState || !engineState.currentAudio) return;

    audio = engineState.currentAudio;
    duration = Number(state && state.duration) || Number(audio.duration) || 0;
    if (duration <= 0) return;

    currentTime = Number(audio.currentTime) || 0;
    targetTime = Math.min(duration, Math.max(0, duration * ratio));
    deltaSeconds = targetTime - currentTime;

    if (engine && typeof engine.seekAudio === 'function') {
      engine.seekAudio(deltaSeconds);
    } else {
      audio.currentTime = targetTime;
    }

    if (engine && typeof engine._emit === 'function' && typeof engine.seekAudio !== 'function') {
      engine._emit('audio:seek', {
        audioId: engineState.currentAudioId,
        currentTime: targetTime
      });
    }

    updateMiniProgressFromState();
  }

  function getPointerClientX(event) {
    if (event.changedTouches && event.changedTouches.length) {
      return event.changedTouches[0].clientX;
    }

    if (event.touches && event.touches.length) {
      return event.touches[0].clientX;
    }

    return event.clientX;
  }

  function seekAudioFromProgressEvent(event) {
    var track = event.currentTarget;
    var rect;
    var ratio;

    if (!track) return;

    rect = track.getBoundingClientRect();
    if (!rect.width) return;

    ratio = (getPointerClientX(event) - rect.left) / rect.width;
    seekAudioToRatio(Math.min(1, Math.max(0, ratio)));
  }

  function setCommentarySeekUiActive(active) {
    var api = window.GOMNA_COMMENTARY_AUTO_CENTER;
    if (api && typeof api.setSeekUiActive === 'function') {
      try { api.setSeekUiActive(!!active); } catch (eSeekUi) { /* ignore */ }
    }
  }

  function handleProgressPointerDown(event) {
    var track = event.currentTarget;

    if (!track) return;

    track.setAttribute('data-audio-progress-seeking', 'true');
    setCommentarySeekUiActive(true);
    if (track.setPointerCapture && event.pointerId != null) {
      track.setPointerCapture(event.pointerId);
    }

    seekAudioFromProgressEvent(event);
    event.preventDefault();
  }

  function handleProgressPointerMove(event) {
    var track = event.currentTarget;

    if (!track || track.getAttribute('data-audio-progress-seeking') !== 'true') {
      return;
    }

    seekAudioFromProgressEvent(event);
    event.preventDefault();
  }

  function handleProgressPointerEnd(event) {
    var track = event.currentTarget;

    if (!track) return;

    if (track.getAttribute('data-audio-progress-seeking') === 'true') {
      seekAudioFromProgressEvent(event);
    }
    track.removeAttribute('data-audio-progress-seeking');
    setCommentarySeekUiActive(false);
    if (track.releasePointerCapture && event.pointerId != null) {
      try {
        track.releasePointerCapture(event.pointerId);
      } catch (e) {
        // The pointer may already be released by the browser.
      }
    }
  }

  function bindProgressTrackSeek(track) {
    if (!track || track.getAttribute('data-audio-progress-seek-bound') === 'true') {
      return;
    }

    track.setAttribute('data-audio-progress-seek-bound', 'true');
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', '재생 위치');
    track.addEventListener('pointerdown', handleProgressPointerDown);
    track.addEventListener('pointermove', handleProgressPointerMove);
    track.addEventListener('pointerup', handleProgressPointerEnd);
    track.addEventListener('pointercancel', handleProgressPointerEnd);
    track.addEventListener('click', seekAudioFromProgressEvent);
    track.addEventListener('touchstart', function(event) {
      seekAudioFromProgressEvent(event);
      event.preventDefault();
    }, { passive: false });
  }

  function updateMiniProgressFromState(state) {
    ensureMiniProgress();
    ensureExpandedProgress();
    var fills;
    var thumbs;
    var currentEls;
    var durationEls;
    var currentTime;
    var duration;
    var percent;

    state = state || (window.GOMNA_AUDIO_ENGINE && window.GOMNA_AUDIO_ENGINE.getState
      ? window.GOMNA_AUDIO_ENGINE.getState()
      : null);

    currentTime = state ? Number(state.currentTime) || 0 : 0;
    duration = state ? Number(state.duration) || 0 : 0;
    percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

    fills = document.querySelectorAll(
      '[data-audio-progress-fill], [data-audio-mini-progress-fill], [data-audio-expanded-progress-fill]'
    );
    thumbs = document.querySelectorAll(
      '[data-audio-progress-thumb], [data-audio-mini-progress-thumb], [data-audio-expanded-progress-thumb]'
    );
    currentEls = document.querySelectorAll('[data-audio-current-time]');
    durationEls = document.querySelectorAll('[data-audio-duration]');

    for (var k = 0; k < fills.length; k++) {
      fills[k].style.width = percent + '%';
    }

    for (var l = 0; l < thumbs.length; l++) {
      thumbs[l].style.left = percent + '%';
    }

    for (var i = 0; i < currentEls.length; i++) {
      currentEls[i].textContent = formatAudioTime(currentTime);
    }

    for (var j = 0; j < durationEls.length; j++) {
      durationEls[j].textContent = duration > 0 ? formatAudioTime(duration) : '00:00';
    }

    if (isExpandedPlayerVisible()) {
      updateHeroCaptionFromState();
    }
  }

  function unbindMiniProgressAudio() {
    if (!miniProgressAudio) return;

    miniProgressAudio.removeEventListener('timeupdate', handleMiniProgressTimeupdate);
    miniProgressAudio.removeEventListener('loadedmetadata', handleMiniProgressTimeupdate);
    miniProgressAudio.removeEventListener('durationchange', handleMiniProgressTimeupdate);
    miniProgressAudio = null;
  }

  function handleMiniProgressTimeupdate() {
    updateMiniProgressFromState();
  }

  function bindMiniProgressAudio() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var audio = engine && engine._state && engine._state.currentAudio;

    if (miniProgressAudio === audio) {
      updateMiniProgressFromState();
      return;
    }

    unbindMiniProgressAudio();

    if (!audio) {
      updateMiniProgressFromState();
      return;
    }

    miniProgressAudio = audio;
    miniProgressAudio.addEventListener('timeupdate', handleMiniProgressTimeupdate);
    miniProgressAudio.addEventListener('loadedmetadata', handleMiniProgressTimeupdate);
    miniProgressAudio.addEventListener('durationchange', handleMiniProgressTimeupdate);
    updateMiniProgressFromState();
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

    updateExpandedSettingsSummary();
  }

  function getVoiceDisplayName(voiceKey) {
    var config = window.GOMNA_AUDIO_CONFIG;
    var preset = config && config.VOICE_PRESETS && config.VOICE_PRESETS[voiceKey];

    return preset && preset.name ? preset.name : '차분한 낭독';
  }

  function getActiveOptionButtonText(selector) {
    var activeButton = document.querySelector('#gomna-audio-expanded-player ' + selector + '[data-active="true"], #gomna-audio-expanded-player ' + selector + '.gomna-audio-active');

    return activeButton ? activeButton.textContent.trim() : '';
  }

  function updateExpandedSettingsSummary(state) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var speedEl = document.querySelector('[data-audio-summary-speed]');
    var voiceEl = document.querySelector('[data-audio-summary-voice]');
    var timerEl = document.querySelector('[data-audio-summary-timer]');

    state = state || (engine && engine.getState ? engine.getState() : null);

    if (speedEl) {
      speedEl.textContent = formatSpeed(state && state.currentSpeed ? state.currentSpeed : 1) + 'x';
    }

    if (voiceEl) {
      voiceEl.textContent = getVoiceDisplayName(state && state.currentVoice ? state.currentVoice : 'calm');
    }

    if (timerEl) {
      timerEl.textContent = getActiveOptionButtonText('[data-audio-timer]') || '끄기';
    }
  }

  function closeExpandedSettingsPanels() {
    var panels = document.querySelectorAll('#gomna-audio-expanded-player [data-audio-option-panel]');
    var cells = document.querySelectorAll('#gomna-audio-expanded-player [data-audio-settings-open]');
    var i;

    for (i = 0; i < panels.length; i++) {
      panels[i].hidden = true;
    }

    for (i = 0; i < cells.length; i++) {
      cells[i].setAttribute('aria-expanded', 'false');
    }

    activeExpandedSettingsPanel = null;
  }

  function openExpandedSettingsPanel(panelName) {
    var panel = document.querySelector('#gomna-audio-expanded-player [data-audio-option-panel="' + panelName + '"]');
    var cell = document.querySelector('#gomna-audio-expanded-player [data-audio-settings-open="' + panelName + '"]');

    closeExpandedSettingsPanels();

    if (!panel) return;

    panel.hidden = false;
    activeExpandedSettingsPanel = panelName;

    if (cell) {
      cell.setAttribute('aria-expanded', 'true');
    }
  }

  function toggleExpandedSettingsPanel(panelName) {
    if (activeExpandedSettingsPanel === panelName) {
      closeExpandedSettingsPanels();
      return;
    }

    openExpandedSettingsPanel(panelName);
  }

  function readChapterAutoPref() {
    try {
      return window.localStorage.getItem(CHAPTER_AUTO_STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeChapterAutoPref(enabled) {
    try {
      window.localStorage.setItem(CHAPTER_AUTO_STORAGE_KEY, enabled ? '1' : '0');
    } catch (e) {
      console.warn('[GOMNA_AUDIO] chapter auto preference write warning:', e);
    }
  }

  function isChapterAutoActive(state) {
    state = state || (window.GOMNA_AUDIO_ENGINE && window.GOMNA_AUDIO_ENGINE.getState
      ? window.GOMNA_AUDIO_ENGINE.getState()
      : null);

    return !!(state && isBibleToEndQueueSource(state.queueSource)) || readChapterAutoPref();
  }

  function updateChapterAutoToggle(state) {
    var toggle = document.querySelector('[data-audio-action="toggle-chapter-auto"]');
    var isOn;

    if (!toggle) return;

    isOn = isChapterAutoActive(state);
    toggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
    toggle.classList.toggle('is-on', isOn);
  }

  function toggleChapterAutoPlayback(state) {
    var currentlyOn = isChapterAutoActive(state);

    if (currentlyOn) {
      writeChapterAutoPref(false);
      updateChapterAutoToggle(state);
      return;
    }

    writeChapterAutoPref(true);
    updateChapterAutoToggle(state);

    if (state && state.currentAudioId && /\.bible$/.test(state.currentAudioId)) {
      playVerseToChapterEnd(state.currentAudioId);
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
    updateExpandedSettingsSummary();
  }

  function getNextSpeed(currentSpeed) {
    var config = window.GOMNA_AUDIO_CONFIG;
    var speeds = config && config.PLAYBACK_SPEEDS ? config.PLAYBACK_SPEEDS : [0.8, 1.0, 1.25, 1.5, 2.0];

    var index = speeds.indexOf(currentSpeed);
    if (index === -1) index = 1;

    return speeds[(index + 1) % speeds.length];
  }

  function getCurrentBookAudioId() {
    var currentBookValue = window.currentBook;
    var firstVerseAudioButton;
    var firstAudioId;
    var match;

    if (!currentBookValue || currentBookValue.name !== '창세기') {
      firstVerseAudioButton = document.querySelector('#verseList [data-audio-id$=".bible"]');
      firstAudioId = firstVerseAudioButton && firstVerseAudioButton.getAttribute('data-audio-id');
      match = firstAudioId && firstAudioId.match(/^([^.]+)\.\d{3}\.\d{3}\.bible$/);

      return match ? match[1] : null;
    }

    return 'genesis';
  }

  function getCurrentChapterNumber() {
    var chapter = Number(window.currentChapter);

    if (chapter > 0) {
      return chapter;
    }

    var firstVerseAudioButton = document.querySelector('#verseList [data-audio-id$=".bible"]');
    var firstAudioId = firstVerseAudioButton && firstVerseAudioButton.getAttribute('data-audio-id');
    var match = firstAudioId && firstAudioId.match(/^[^.]+\.(\d{3})\.\d{3}(?:o\d+)?\.bible$/);

    return match ? parseInt(match[1], 10) : 0;
  }

  function parseAudioIdParts(audioId) {
    var match = audioId && audioId.match(/^([^.]+)\.(\d{3})\.(\d{3})(?:o(\d+))?\.bible$/);

    if (!match) {
      return null;
    }

    var occurrence = match[4] ? parseInt(match[4], 10) : 1;
    if (!occurrence || occurrence < 1) {
      return null;
    }

    return {
      bookId: match[1],
      chapter: parseInt(match[2], 10),
      verse: parseInt(match[3], 10),
      occurrence: occurrence
    };
  }

  function pad3(value) {
    return String(value).padStart(3, '0');
  }

  function formatVerseSegment(verse, occurrence) {
    var base = pad3(verse);
    var occ = parseInt(occurrence, 10);
    return !isNaN(occ) && occ > 1 ? base + 'o' + occ : base;
  }

  function buildBibleAudioId(bookId, chapter, verse, occurrence) {
    return bookId + '.' + pad3(chapter) + '.' + formatVerseSegment(verse, occurrence) + '.bible';
  }

  function collectRenderedBibleAudioIds(options) {
    options = options || {};
    var items = document.querySelectorAll('#verseList .verse-item[data-verse]');
    var ids = [];
    var startVerse = options.startVerse;
    var endVerse = options.endVerse;
    var startFromAudioId = options.startFromAudioId || null;
    var started = !startFromAudioId;
    var i;
    var item;
    var verse;
    var occurrence;
    var id;

    for (i = 0; i < items.length; i++) {
      item = items[i];
      if (options.skipHidden && item.style.display === 'none') continue;

      verse = parseInt(item.getAttribute('data-verse'), 10);
      if (isNaN(verse)) continue;

      occurrence = parseInt(item.getAttribute('data-audio-occurrence') || '1', 10) || 1;
      if (!options.bookId || !options.chapter) continue;

      id = buildBibleAudioId(options.bookId, options.chapter, verse, occurrence);

      if (!started) {
        if (id === startFromAudioId) {
          started = true;
        } else {
          continue;
        }
      }

      if (startVerse != null && verse < startVerse) continue;
      if (endVerse != null && verse > endVerse) continue;

      ids.push(id);
    }

    return ids;
  }

  function dispatchBibleResumeSessionChanged() {
    window.dispatchEvent(new CustomEvent('gomna:bible_resume_session_changed'));
  }

  function isBibleToEndQueueSource(source) {
    return typeof source === 'string' && source.indexOf('bible-to-end:') === 0;
  }

  function getManifestEntry(audioId) {
    var config = window.GOMNA_AUDIO_CONFIG;
    return config && config.manifestData && config.manifestData.audios
      ? config.manifestData.audios[audioId]
      : null;
  }

  function isAudioManifestLoaded() {
    var config = window.GOMNA_AUDIO_CONFIG;
    return !!(config && config.manifestLoadStatus === 'loaded' && config.manifestData);
  }

  function readStoredBibleResumeSession() {
    var raw;

    try {
      raw = window.localStorage.getItem(BIBLE_RESUME_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[GOMNA_AUDIO] bible resume read warning:', e);
      return null;
    }
  }

  function writeBibleResumeSession(session) {
    try {
      window.localStorage.setItem(BIBLE_RESUME_STORAGE_KEY, JSON.stringify(session));
      dispatchBibleResumeSessionChanged();
      return true;
    } catch (e) {
      console.warn('[GOMNA_AUDIO] bible resume write warning:', e);
      return false;
    }
  }

  function removeBibleResumeSession() {
    try {
      window.localStorage.removeItem(BIBLE_RESUME_STORAGE_KEY);
    } catch (e) {
      console.warn('[GOMNA_AUDIO] bible resume remove warning:', e);
    }

    dispatchBibleResumeSessionChanged();
  }

  function isValidBibleResumeSession(session) {
    var entry;

    if (!session || session.version !== 1) return false;
    if (session.source !== 'bible' || session.mode !== 'verse-to-end') return false;
    if (!session.currentAudioId || !/\.bible$/.test(session.currentAudioId)) return false;
    if (!isBibleToEndQueueSource(session.queueSource)) return false;
    if (!session.queueAudioIds || !session.queueAudioIds.length) return false;
    if (session.queueIndex < 0 || session.queueIndex >= session.queueAudioIds.length) return false;
    if (session.queueAudioIds[session.queueIndex] !== session.currentAudioId) return false;

    entry = getManifestEntry(session.currentAudioId);
    if (!entry || entry.status !== 'published' || entry.type !== 'bible') return false;

    return true;
  }

  function getValidBibleResumeSession(removeInvalid) {
    var session = readStoredBibleResumeSession();

    if (!session) return null;
    if (!isAudioManifestLoaded()) return null;

    if (!isValidBibleResumeSession(session)) {
      if (removeInvalid) {
        removeBibleResumeSession();
      }

      return null;
    }

    return session;
  }

  function getBibleResumeSessionForAudioId(audioId) {
    var session = getValidBibleResumeSession(false);

    if (!session || session.currentAudioId !== audioId) {
      return null;
    }

    return session;
  }

  function isBibleToEndState(state) {
    var entry;

    if (!state || !state.currentAudioId || !/\.bible$/.test(state.currentAudioId)) return false;
    if (!state.queueActive || !isBibleToEndQueueSource(state.queueSource)) return false;
    if (!state.queueAudioIds || !state.queueAudioIds.length) return false;

    entry = getManifestEntry(state.currentAudioId);
    return !!(entry && entry.status === 'published' && entry.type === 'bible');
  }

  function buildBibleResumeSession(state) {
    var entry;

    if (!isBibleToEndState(state)) return null;

    entry = getManifestEntry(state.currentAudioId);
    if (!entry) return null;

    return {
      version: 1,
      source: 'bible',
      mode: 'verse-to-end',
      bookId: entry.bookId,
      bookName: entry.book,
      chapter: entry.chapter,
      currentAudioId: state.currentAudioId,
      currentTime: state.currentTime || 0,
      queueAudioIds: state.queueAudioIds.slice(),
      queueIndex: state.queueIndex,
      queueLength: state.queueLength,
      queueSource: state.queueSource,
      voicePreset: state.currentVoice || 'calm',
      playbackSpeed: state.currentSpeed || 1,
      savedAt: new Date().toISOString()
    };
  }

  function saveBibleResumeSession() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var session = buildBibleResumeSession(state);

    if (!session) return false;

    return writeBibleResumeSession(session);
  }

  function bindBibleResumeTimeupdate() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var audio = engine && engine._state ? engine._state.currentAudio : null;

    if (bibleResumeTimeupdateAudio === audio) return;

    if (bibleResumeTimeupdateAudio) {
      bibleResumeTimeupdateAudio.removeEventListener('timeupdate', handleBibleResumeTimeupdate);
    }

    bibleResumeTimeupdateAudio = audio;

    if (bibleResumeTimeupdateAudio) {
      bibleResumeTimeupdateAudio.addEventListener('timeupdate', handleBibleResumeTimeupdate);
    }
  }

  function handleBibleResumeTimeupdate() {
    var now = Date.now();

    if (now - lastBibleResumeSaveAt < BIBLE_RESUME_SAVE_INTERVAL_MS) {
      return;
    }

    lastBibleResumeSaveAt = now;
    saveBibleResumeSession();
  }

  function restoreBibleResumeSessionForAudioId(audioId) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var session = getBibleResumeSessionForAudioId(audioId);
    var startIndex;
    var startTime;
    var restored;

    if (!engine || !engine.playAudioQueue || !session) return false;
    if (state && state.currentAudioId) return false;

    startIndex = parseInt(session.queueIndex, 10);
    startTime = Number(session.currentTime) || 0;

    if (session.voicePreset && engine.changeVoice) {
      engine.changeVoice(session.voicePreset);
    }

    if (session.playbackSpeed && engine.changeSpeed) {
      engine.changeSpeed(session.playbackSpeed);
    }

    restored = engine.playAudioQueue(session.queueAudioIds, {
      source: session.queueSource,
      startIndex: isNaN(startIndex) ? 0 : startIndex,
      startTime: startTime
    });

    if (restored) {
      saveBibleResumeSession();
    }

    return !!restored;
  }

  function clearBibleResumeSessionIfQueueCompleted(detail) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var session;

    if (state && (state.currentAudioId || state.queueActive)) return;
    if (!detail || !detail.entry || detail.entry.type !== 'bible') return;

    session = getValidBibleResumeSession(false);
    if (session && session.currentAudioId === detail.audioId) {
      removeBibleResumeSession();
    }
  }

  function validateStoredBibleResumeSession() {
    getValidBibleResumeSession(true);
    dispatchBibleResumeSessionChanged();
  }

  window.GOMNA_AUDIO_BIBLE_RESUME = {
    key: BIBLE_RESUME_STORAGE_KEY,
    getSession: function() {
      return getValidBibleResumeSession(false);
    },
    getSessionForAudioId: getBibleResumeSessionForAudioId,
    save: saveBibleResumeSession,
    clear: removeBibleResumeSession
  };

  function getChapterContextKey(detail) {
    var bookName = detail && detail.bookName;
    var chapter = detail && detail.chapter;

    if (!bookName && window.currentBook) {
      bookName = window.currentBook.name;
    }

    if (chapter == null) {
      chapter = Number(window.currentChapter);
    }

    if (!bookName || !chapter) {
      return '';
    }

    return bookName + ':' + chapter;
  }

  function isAudioIdInCurrentChapter(audioId, detail) {
    var parts = parseAudioIdParts(audioId);
    var bookId = getCurrentBookAudioId();
    var chapter = detail && detail.chapter != null ? Number(detail.chapter) : getCurrentChapterNumber();

    if (!parts || !bookId || !chapter) {
      return false;
    }

    return parts.bookId === bookId && parts.chapter === chapter;
  }

  function resetAudioUiForChapterChange(detail) {
    var contextKey = getChapterContextKey(detail);
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (contextKey && contextKey === lastRenderedAudioContextKey) {
      return;
    }

    lastRenderedAudioContextKey = contextKey;

    if (state && state.currentAudioId && !isAudioIdInCurrentChapter(state.currentAudioId, detail)) {
      if (engine && engine.stopAudio) {
        engine.stopAudio();
      }
    }

    hideMiniPlayer();
    updateCurrentText(null, null);
    setPlayPauseIcon(false);
    updateRangeAudioButtons(engine && engine.getState ? engine.getState() : state);
  }

  function getCurrentVerseCountValue() {
    var count = Number(window.currentVerseCount) || 0;

    if (count > 0) return count;

    return document.querySelectorAll('#verseList .verse-item[data-verse]').length;
  }

  function getVisibleVerseRange() {
    var selectedStart = Number(window.opt4RangeStart);
    var selectedEnd = Number(window.opt4RangeEnd);

    if (
      !isNaN(selectedStart) &&
      !isNaN(selectedEnd) &&
      selectedStart > 0 &&
      selectedEnd >= selectedStart
    ) {
      return {
        start: selectedStart,
        end: selectedEnd
      };
    }

    var items = document.querySelectorAll('#verseList .verse-item[data-verse]');
    var start = null;
    var end = null;

    for (var i = 0; i < items.length; i++) {
      if (items[i].style.display === 'none') continue;

      var verse = parseInt(items[i].getAttribute('data-verse'), 10);
      if (isNaN(verse)) continue;

      if (start === null || verse < start) start = verse;
      if (end === null || verse > end) end = verse;
    }

    if (start === null || end === null) return null;

    return {
      start: start,
      end: end
    };
  }

  function getCurrentAudioVerse() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var parts = state && state.currentAudioId ? parseAudioIdParts(state.currentAudioId) : null;
    var bookId = getCurrentBookAudioId();
    var chapter = getCurrentChapterNumber();

    if (!parts || !bookId || !chapter) {
      return null;
    }

    if (parts.bookId !== bookId || parts.chapter !== chapter) {
      return null;
    }

    return parts.verse;
  }

  function playVisibleVerseRange(toChapterEnd) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var audioIds;
    var bookId;
    var chapter;
    var range;
    var startFromAudioId;

    if (!allowVerseScreenAudioPlayback()) return;
    if (!engine || (!engine.playAudioQueue && !engine.playAudioRange)) return;

    if (state && state.queueActive) {
      if (state.isPlaying) {
        engine.pauseAudio();
      } else if (state.isPaused) {
        engine.resumeAudio();
      }
      return;
    }

    bookId = getCurrentBookAudioId();
    chapter = getCurrentChapterNumber();
    range = getVisibleVerseRange();

    if (!bookId || !chapter || !range) {
      showToast('오디오 준비 중입니다.');
      return;
    }

    if (toChapterEnd) {
      range.start = getCurrentAudioVerse() || range.start;
      range.end = getCurrentVerseCountValue() || range.end;
      startFromAudioId = state && state.currentAudioId ? state.currentAudioId : null;
    }

    audioIds = collectRenderedBibleAudioIds({
      bookId: bookId,
      chapter: chapter,
      startVerse: range.start,
      endVerse: range.end,
      startFromAudioId: startFromAudioId,
      skipHidden: !toChapterEnd
    });

    if (audioIds.length && engine.playAudioQueue) {
      engine.playAudioQueue(audioIds, {
        source: 'bible-range:' + bookId + '.' + pad3(chapter) + '.' + pad3(range.start) + '-' + pad3(range.end)
      });
      return;
    }

    if (engine.playAudioRange) {
      engine.playAudioRange(bookId, chapter, range.start, range.end);
    }
  }

  function playVerseToChapterEnd(audioId) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var parts = parseAudioIdParts(audioId);
    var endVerse = getCurrentVerseCountValue();
    var audioIds = [];
    var queueSource;
    var verse;

    if (!allowVerseScreenAudioPlayback()) return;

    if (!engine || !engine.playAudioQueue || !parts || !endVerse || parts.verse > endVerse) {
      showToast('오디오 준비 중입니다.');
      return;
    }

    if (
      state &&
      state.queueActive &&
      state.currentAudioId === audioId &&
      state.queueSource &&
      state.queueSource.indexOf('bible-to-end:') === 0
    ) {
      if (state.isPlaying) {
        engine.pauseAudio();
      } else if (state.isPaused) {
        engine.resumeAudio();
      }
      return;
    }

    if ((!state || !state.currentAudioId) && restoreBibleResumeSessionForAudioId(audioId)) {
      return;
    }

    audioIds = collectRenderedBibleAudioIds({
      bookId: parts.bookId,
      chapter: parts.chapter,
      startFromAudioId: audioId
    });

    if (!audioIds.length) {
      for (verse = parts.verse; verse <= endVerse; verse++) {
        audioIds.push(buildBibleAudioId(parts.bookId, parts.chapter, verse, 1));
      }
    }

    if (!audioIds.length) {
      showToast('오디오 준비 중입니다.');
      return;
    }

    queueSource = 'bible-to-end:' + parts.bookId + '.' + pad3(parts.chapter) + '.from-' + formatVerseSegment(parts.verse, parts.occurrence);
    engine.playAudioQueue(audioIds, { source: queueSource });
  }

  function updateRangeAudioButtons(state) {
    var buttons = document.querySelectorAll('[data-audio-action="play-range"]');
    var label = '선택 범위 듣기';

    if (state && state.queueActive) {
      label = state.isPlaying ? '범위 일시정지' : '범위 이어듣기';
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].textContent = label;
      buttons[i].classList.toggle('gomna-audio-active', !!(state && state.queueActive));
    }
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
    var settingsOpenEl = target.closest('[data-audio-settings-open]');

    if (settingsOpenEl) {
      toggleExpandedSettingsPanel(settingsOpenEl.getAttribute('data-audio-settings-open'));
      return;
    }

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
        if (engine.changeVoice(voice)) {
          setActiveWithinGroup(voiceEl, '[data-audio-voice]');
        }
      }

      return;
    }

    if (timerEl) {
      var timerValue = timerEl.getAttribute('data-audio-timer');
      var minutes = timerValue === 'chapter-end' ? 'chapter-end' : parseFloat(timerValue);

      engine.setSleepTimer(minutes);
      setActiveWithinGroup(timerEl, '[data-audio-timer]');

      if (timerValue === 'chapter-end') {
        playVisibleVerseRange(true);
      }

      return;
    }

    if (!actionEl) return;

    var action = actionEl.getAttribute('data-audio-action');
    var audioId = actionEl.getAttribute('data-audio-id');
    var state = engine.getState ? engine.getState() : engine._state;

    switch (action) {
      case 'play':
        if (!allowVerseScreenAudioPlayback()) break;
        if (audioId) {
          if (state && state.currentAudioId && state.currentAudioId !== audioId && engine.stopAudio) {
            engine.stopAudio();
          }

          engine.playAudioById(audioId, { startTime: 0 });
        }
        break;

      case 'play-verse-to-end':
        if (!allowVerseScreenAudioPlayback()) break;
        if (audioId) {
          playVerseToChapterEnd(audioId);
        }
        break;

      case 'play-range':
        if (!allowVerseScreenAudioPlayback()) break;
        playVisibleVerseRange(false);
        break;

      case 'toggle':
        if (!allowVerseScreenAudioPlayback()) {
          if (engine.stopAudio) engine.stopAudio();
          break;
        }
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
        /*
         * Mini player expand must work during commentary playback too.
         * Verse-view gate alone blocked the sheet when the gate flickered false.
         */
        if (!allowVerseScreenAudioPlayback()) {
          if (!(state && (state.isPlaying || state.isPaused || state.currentAudioId))) break;
        }
        setCommentaryAudioExpanded(true);
        break;

      case 'collapse':
        setCommentaryAudioExpanded(false);
        break;

      case 'toggle-chapter-auto':
        if (!allowVerseScreenAudioPlayback()) break;
        toggleChapterAutoPlayback(state);
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
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    // 절 본문 화면이 아니면 재생을 즉시 취소하고 플레이어를 열지 않는다
    if (!allowVerseScreenAudioPlayback()) {
      if (engine && engine.stopAudio) engine.stopAudio();
      return;
    }

    showMiniPlayer();
    setPlayPauseIcon(true);
    updateCurrentText(detail.entry, detail.audioId);
    bindMiniProgressAudio();
    updateRangeAudioButtons(state);
    bindBibleResumeTimeupdate();
    saveBibleResumeSession();
    updateExpandedSettingsSummary(state);
    updateChapterAutoToggle(state);
    if (isExpandedPlayerVisible()) {
      startHeroCaptionSync();
    }
  });

  window.addEventListener('audio:pause', function() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    setPlayPauseIcon(false);
    updateMiniProgressFromState(state);
    updateRangeAudioButtons(state);
    saveBibleResumeSession();
    stopHeroCaptionSync();
    updateHeroCaptionFromState();
  });

  window.addEventListener('audio:resume', function() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    setPlayPauseIcon(true);
    bindMiniProgressAudio();
    updateRangeAudioButtons(state);
    if (isExpandedPlayerVisible()) {
      startHeroCaptionSync();
    }
  });

  window.addEventListener('audio:end', function(e) {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    setPlayPauseIcon(false);
    unbindMiniProgressAudio();
    updateMiniProgressFromState(state);
    hideMiniPlayer();
    updateRangeAudioButtons(state);
    clearBibleResumeSessionIfQueueCompleted(e.detail || {});
    stopHeroCaptionSync();
    updateHeroCaptionFromState({ useLastOnEnd: true });
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
    unbindMiniProgressAudio();
    updateMiniProgressFromState(state);
    updateRangeAudioButtons(state);

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
    } else {
      updateExpandedSettingsSummary();
    }
  });

  window.addEventListener('audio:seek', function() {
    updateMiniProgressFromState();
    updateHeroCaptionFromState();
  });

  window.addEventListener('audio:voice_change', function(e) {
    updateExpandedSettingsSummary();

    if (e.detail && e.detail.preset && e.detail.preset.name) {
      showToast(e.detail.preset.name + ' 선택됨');
    }
  });

  window.addEventListener('audio:timer_set', function(e) {
    updateExpandedSettingsSummary();

    if (!e.detail) return;

    if (e.detail.minutes === 'chapter-end') {
      showToast('장 끝까지 재생됩니다.');
    } else if (!e.detail.minutes || e.detail.minutes <= 0) {
      showToast('타이머가 해제되었습니다.');
    } else {
      showToast(e.detail.minutes + '분 타이머가 설정되었습니다.');
    }
  });

  window.addEventListener('gomna:verse_list_rendered', function(e) {
    resetAudioUiForChapterChange(e.detail || null);
    validateStoredBibleResumeSession();
  });

  window.addEventListener('gomna:manifest_loaded', validateStoredBibleResumeSession);

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      saveBibleResumeSession();
    }
  });

  window.addEventListener('pagehide', saveBibleResumeSession);
  window.addEventListener('beforeunload', saveBibleResumeSession);
  window.addEventListener('storage', function(e) {
    if (e.key === BIBLE_RESUME_STORAGE_KEY) {
      dispatchBibleResumeSessionChanged();
    }
  });

  if (window.GOMNA_AUDIO_CONFIG && window.GOMNA_AUDIO_CONFIG.manifestLoadStatus === 'loaded') {
    setTimeout(validateStoredBibleResumeSession, 0);
  }

  bindExpandCollapseButtons();

  console.log('[GOMNA_AUDIO_UI] loaded');

  window.setCommentaryAudioExpanded = setCommentaryAudioExpanded;
  window.GOMNA_AUDIO_UI = {
    updateHeroCaptionFromState: updateHeroCaptionFromState,
    setCommentaryAudioExpanded: setCommentaryAudioExpanded,
    showExpandedPlayer: showExpandedPlayer,
    hideExpandedPlayer: hideExpandedPlayer,
    bindExpandCollapseButtons: bindExpandCollapseButtons
  };
})();
