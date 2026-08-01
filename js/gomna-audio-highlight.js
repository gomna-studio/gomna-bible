(function() {
  'use strict';

  var lastUserScrollTime = 0;
  var ACTIVE_CLASS = 'gomna-commentary-card-active';
  var autoCenterToken = 0;
  var autoCenterRafId = 0;
  var autoCenterTimeoutId = 0;
  var pendingHighlightAudioId = null;
  var pendingHighlightTimer = 0;

  window.addEventListener('scroll', function() {
    lastUserScrollTime = Date.now();
  }, { passive: true });

  function getActiveClass() {
    if (
      window.GOMNA_CARD_HIGHLIGHT &&
      typeof window.GOMNA_CARD_HIGHLIGHT.ACTIVE_CLASS === 'string' &&
      window.GOMNA_CARD_HIGHLIGHT.ACTIVE_CLASS
    ) {
      return window.GOMNA_CARD_HIGHLIGHT.ACTIVE_CLASS;
    }
    return ACTIVE_CLASS;
  }

  function removeAllHighlights() {
    var activeClass = getActiveClass();
    var readingElements = document.querySelectorAll('.gomna-audio-reading');
    var verseCards = document.querySelectorAll('#verseList .verse-item.' + activeClass);
    var i;

    for (i = 0; i < readingElements.length; i++) {
      readingElements[i].classList.remove('gomna-audio-reading');
    }

    for (i = 0; i < verseCards.length; i++) {
      verseCards[i].classList.remove(activeClass);
    }
  }

  function cancelBibleAutoCenter() {
    autoCenterToken += 1;
    if (autoCenterRafId) {
      cancelAnimationFrame(autoCenterRafId);
      autoCenterRafId = 0;
    }
    if (autoCenterTimeoutId) {
      clearTimeout(autoCenterTimeoutId);
      autoCenterTimeoutId = 0;
    }
    /* Visual-only cancel — never touches audio queue / playback. */
    if (typeof window.__gomnaPlainVerseGestureCancelAudioPan === 'function') {
      try {
        window.__gomnaPlainVerseGestureCancelAudioPan();
      } catch (eCancelPan) { /* ignore */ }
    }
  }

  function isAudioActivelyPlaying() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    return !!(
      state &&
      state.isPlaying &&
      !state.isPaused &&
      state.currentAudioId
    );
  }

  function isCommentaryTarget(target) {
    return !!(
      target &&
      target.closest &&
      target.closest('#commentaryPopup, #commentaryScrollArea, #commentaryContent')
    );
  }

  function getVerseCardForTarget(target) {
    if (!target || !target.closest) return null;
    return target.closest('#verseList .verse-item');
  }

  function isPlainVerseManualScrollHoldActive() {
    if (
      typeof window.__gomnaPlainVerseGestureIsUserInteracting === 'function' &&
      window.__gomnaPlainVerseGestureIsUserInteracting()
    ) {
      return true;
    }
    var until = window.__gomnaPlainVerseManualScrollUntil;
    return typeof until === 'number' && until > Date.now();
  }

  function canAutoCenterBibleCard() {
    var timeSinceScroll = Date.now() - lastUserScrollTime;

    if (!isAudioActivelyPlaying()) return false;
    if (timeSinceScroll <= 1500) return false;
    if (isPlainVerseManualScrollHoldActive()) return false;

    return true;
  }

  function parseBibleAudioIdParts(audioId) {
    var match;
    if (!audioId) return null;
    match = String(audioId).match(/^([^.]+)\.(\d{3})\.(\d{3})(?:o(\d+))?\.bible$/);
    if (!match) return null;
    return {
      bookId: match[1],
      chapter: parseInt(match[2], 10),
      verse: parseInt(match[3], 10),
      occurrence: match[4] ? parseInt(match[4], 10) : 1
    };
  }

  function resolveVerseNumber(verseItem) {
    var raw;
    var n;
    var target;
    var audioId;
    var parts;

    if (!verseItem) return null;

    raw = verseItem.getAttribute('data-verse') || verseItem.getAttribute('data-verse-number');
    n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;

    target = verseItem.querySelector('[data-audio-target]');
    audioId = target && target.getAttribute('data-audio-target');
    if (!audioId && verseItem.getAttribute) {
      audioId = verseItem.getAttribute('data-audio-target');
    }
    parts = parseBibleAudioIdParts(audioId);
    return parts ? parts.verse : null;
  }

  function findBibleVerseCardForAudioId(audioId) {
    var target;
    var parts;
    var selector;
    var item;

    if (!audioId) return null;

    target = document.querySelector('[data-audio-target="' + audioId + '"]');
    if (target) {
      item = getVerseCardForTarget(target);
      if (item) return item;
    }

    parts = parseBibleAudioIdParts(audioId);
    if (!parts || !parts.verse) return null;

    if (parts.occurrence > 1) {
      selector =
        '#verseList .verse-item[data-verse="' +
        parts.verse +
        '"][data-audio-occurrence="' +
        parts.occurrence +
        '"]';
      item = document.querySelector(selector);
      if (item) return item;
    }

    return document.querySelector('#verseList .verse-item[data-verse="' + parts.verse + '"]');
  }

  function clearPendingHighlightRetry() {
    pendingHighlightAudioId = null;
    if (pendingHighlightTimer) {
      clearTimeout(pendingHighlightTimer);
      pendingHighlightTimer = 0;
    }
  }

  function scheduleHighlightRetry(audioId) {
    pendingHighlightAudioId = audioId;
    if (pendingHighlightTimer) return;
    pendingHighlightTimer = window.setTimeout(function() {
      var id = pendingHighlightAudioId;
      pendingHighlightTimer = 0;
      pendingHighlightAudioId = null;
      if (!id) return;
      highlightAudio(id);
    }, 40);
  }

  function centerBibleVerseCard(verseItem) {
    var token;

    if (!verseItem) return;
    /* Stop/pause must never leave a pending center move. */
    if (!isAudioActivelyPlaying()) return;

    if (autoCenterRafId) {
      cancelAnimationFrame(autoCenterRafId);
      autoCenterRafId = 0;
    }
    if (autoCenterTimeoutId) {
      clearTimeout(autoCenterTimeoutId);
      autoCenterTimeoutId = 0;
    }
    token = ++autoCenterToken;

    /*
     * Defer centering until after iOS audio.play() has settled.
     * Immediate transform measurement on audio:start was aborting queue play().
     * Mac + mobile both use centerActiveCard (gesture only as scroll-target adapter).
     */
    autoCenterRafId = requestAnimationFrame(function() {
      autoCenterRafId = 0;
      if (token !== autoCenterToken) return;

      autoCenterTimeoutId = window.setTimeout(function() {
        autoCenterTimeoutId = 0;

        if (token !== autoCenterToken) return;
        if (!isAudioActivelyPlaying()) return;
        if (isPlainVerseManualScrollHoldActive()) return;

        if (
          window.GOMNA_CARD_HIGHLIGHT &&
          typeof window.GOMNA_CARD_HIGHLIGHT.centerActiveCard === 'function'
        ) {
          try {
            window.GOMNA_CARD_HIGHLIGHT.centerActiveCard(verseItem);
          } catch (eCenter) {
            console.warn('[GOMNA_AUDIO_HIGHLIGHT] centerActiveCard failed:', eCenter);
          }
          return;
        }

        try {
          verseItem.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        } catch (eScroll) {
          console.warn('[GOMNA_AUDIO_HIGHLIGHT] scrollIntoView failed:', eScroll);
        }
      }, 320);
    });
  }

  function highlightAudio(audioId) {
    var target;
    var verseItem;
    var activeClass;

    if (!audioId) return;

    removeAllHighlights();

    target = document.querySelector('[data-audio-target="' + audioId + '"]');
    verseItem = target ? getVerseCardForTarget(target) : findBibleVerseCardForAudioId(audioId);

    if (!target && !verseItem) {
      console.warn('[GOMNA_AUDIO_HIGHLIGHT] target not found:', audioId);
      scheduleHighlightRetry(audioId);
      return;
    }

    clearPendingHighlightRetry();

    /*
     * Commentary card rows are centered by gomna-card-highlight-test.js
     * (shared shouldAutoCenterActiveCommentaryCard). Do not scrollIntoView
     * the page/document from this helper for commentary targets.
     */
    if (target && isCommentaryTarget(target)) {
      target.classList.add('gomna-audio-reading');
      return;
    }

    activeClass = getActiveClass();

    if (verseItem) {
      /* Drop any leftover commentary row highlight; class is shared. */
      if (
        window.GOMNA_CARD_HIGHLIGHT &&
        typeof window.GOMNA_CARD_HIGHLIGHT.clearHighlight === 'function'
      ) {
        try {
          window.GOMNA_CARD_HIGHLIGHT.clearHighlight();
        } catch (eClear) { /* ignore — never block audio highlight */ }
      }
      /* Reuse commentary active class + color on the verse card. */
      verseItem.classList.add(activeClass);
      if (canAutoCenterBibleCard()) {
        centerBibleVerseCard(verseItem);
      }
      return;
    }

    if (target) {
      target.classList.add('gomna-audio-reading');

      if (canAutoCenterBibleCard()) {
        try {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        } catch (eTargetScroll) {
          console.warn('[GOMNA_AUDIO_HIGHLIGHT] target scroll failed:', eTargetScroll);
        }
      }
    }
  }

  function shouldPreserveHighlightOnAudioEnd(detail) {
    var engine;
    var state;
    var reason = detail && detail.reason ? String(detail.reason) : '';

    if (
      window.__gomnaBibleContinuousChapterPlayback ||
      window.__gomnaBibleContinuousChapterAdvancing ||
      window.__gomnaBibleContinuousChapterJumping
    ) {
      return true;
    }

    if (reason === 'queue_completed') {
      engine = window.GOMNA_AUDIO_ENGINE;
      state = engine && engine.getState ? engine.getState() : null;
      if (state && state.isPlaying && state.currentAudioId) {
        return true;
      }
    }

    return false;
  }

  function onPlaybackFullyStopped(e) {
    var detail = e && e.detail ? e.detail : {};
    var engine;
    var state;

    if (shouldPreserveHighlightOnAudioEnd(detail)) {
      engine = window.GOMNA_AUDIO_ENGINE;
      state = engine && engine.getState ? engine.getState() : null;
      if (state && state.currentAudioId && (state.isPlaying || state.queueActive)) {
        highlightAudio(state.currentAudioId);
        return;
      }
      return;
    }

    clearPendingHighlightRetry();
    cancelBibleAutoCenter();
    removeAllHighlights();
  }

  function onPlaybackPaused() {
    /* Pause keeps optional visual state, but never auto-centers again. */
    cancelBibleAutoCenter();
  }

  function reapplyCurrentBibleHighlight() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    if (!state || !state.currentAudioId) return;
    if (!state.isPlaying && !state.queueActive) return;
    if (!/\.bible$/.test(String(state.currentAudioId))) return;
    highlightAudio(state.currentAudioId);
  }

  window.addEventListener('audio:start', function(e) {
    if (!e.detail || !e.detail.audioId) return;
    try {
      highlightAudio(e.detail.audioId);
    } catch (err) {
      /* Highlight/scroll must never interrupt the audio queue. */
      console.warn('[GOMNA_AUDIO_HIGHLIGHT] audio:start highlight failed:', err);
    }
  });

  /* stopAudio() emits audio:end — cancel pending centers and clear play highlight.
   * Natural queue_completed during continuous next-chapter must NOT wipe the new verse. */
  window.addEventListener('audio:end', onPlaybackFullyStopped);

  window.addEventListener('audio:error', onPlaybackFullyStopped);

  window.addEventListener('audio:pause', onPlaybackPaused);

  window.addEventListener('gomna:verse_list_rendered', function() {
    window.requestAnimationFrame(function() {
      reapplyCurrentBibleHighlight();
    });
  });

  window.GOMNA_AUDIO_HIGHLIGHT = {
    highlightAudio: highlightAudio,
    removeAllHighlights: removeAllHighlights,
    cancelBibleAutoCenter: cancelBibleAutoCenter,
    reapplyCurrentBibleHighlight: reapplyCurrentBibleHighlight
  };

  console.log('[GOMNA_AUDIO_HIGHLIGHT] loaded');
})();
