(function() {
  'use strict';

  var lastUserScrollTime = 0;
  var ACTIVE_CLASS = 'gomna-commentary-card-active';
  var autoCenterToken = 0;
  var autoCenterRafId = 0;

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

  function resolveVerseNumber(verseItem) {
    var raw;
    var n;
    var target;
    var audioId;
    var match;

    if (!verseItem) return null;

    raw = verseItem.getAttribute('data-verse') || verseItem.getAttribute('data-verse-number');
    n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;

    target = verseItem.querySelector('[data-audio-target]');
    audioId = target && target.getAttribute('data-audio-target');
    if (!audioId && verseItem.getAttribute) {
      audioId = verseItem.getAttribute('data-audio-target');
    }
    if (audioId) {
      match = audioId.match(/^[^.]+\.\d{3}\.(\d{3})(?:o\d+)?\.bible$/);
      if (match) {
        n = parseInt(match[1], 10);
        if (!isNaN(n) && n > 0) return n;
      }
    }

    return null;
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

    token = autoCenterToken;

    /* Wait one frame so the active highlight class is painted first. */
    autoCenterRafId = requestAnimationFrame(function() {
      var verseNumber;

      autoCenterRafId = 0;
      if (token !== autoCenterToken) return;
      if (!isAudioActivelyPlaying()) return;

      if (
        document.documentElement.classList.contains('plain-verse-gesture-active') &&
        typeof window.__gomnaPlainVerseGestureScrollToVerse === 'function'
      ) {
        /* Gesture mode: never fall back to document scrollIntoView.
           Manual finger pan / hold → keep highlight only. */
        if (isPlainVerseManualScrollHoldActive()) return;
        verseNumber = resolveVerseNumber(verseItem);
        if (verseNumber != null) {
          window.__gomnaPlainVerseGestureScrollToVerse(verseNumber, {
            centerRatio: 0.5,
            reason: 'audio-highlight'
          });
        }
        return;
      }

      if (
        window.GOMNA_CARD_HIGHLIGHT &&
        typeof window.GOMNA_CARD_HIGHLIGHT.centerActiveCard === 'function'
      ) {
        window.GOMNA_CARD_HIGHLIGHT.centerActiveCard(verseItem);
        return;
      }

      verseItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    });
  }

  function highlightAudio(audioId) {
    var target;
    var verseItem;
    var activeClass;

    if (!audioId) return;

    removeAllHighlights();

    target = document.querySelector('[data-audio-target="' + audioId + '"]');

    if (!target) {
      console.warn('[GOMNA_AUDIO_HIGHLIGHT] target not found:', audioId);
      return;
    }

    /*
     * Commentary card rows are centered by gomna-card-highlight-test.js
     * (shared shouldAutoCenterActiveCommentaryCard). Do not scrollIntoView
     * the page/document from this helper for commentary targets.
     */
    if (isCommentaryTarget(target)) {
      target.classList.add('gomna-audio-reading');
      return;
    }

    verseItem = getVerseCardForTarget(target);
    activeClass = getActiveClass();

    if (verseItem) {
      /* Drop any leftover commentary row highlight; class is shared. */
      if (
        window.GOMNA_CARD_HIGHLIGHT &&
        typeof window.GOMNA_CARD_HIGHLIGHT.clearHighlight === 'function'
      ) {
        window.GOMNA_CARD_HIGHLIGHT.clearHighlight();
      }
      /* Reuse commentary active class + color on the verse card. */
      verseItem.classList.add(activeClass);
      if (canAutoCenterBibleCard()) {
        centerBibleVerseCard(verseItem);
      }
      return;
    }

    target.classList.add('gomna-audio-reading');

    if (canAutoCenterBibleCard()) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  function onPlaybackFullyStopped() {
    cancelBibleAutoCenter();
    removeAllHighlights();
  }

  function onPlaybackPaused() {
    /* Pause keeps optional visual state, but never auto-centers again. */
    cancelBibleAutoCenter();
  }

  window.addEventListener('audio:start', function(e) {
    if (e.detail && e.detail.audioId) {
      highlightAudio(e.detail.audioId);
    }
  });

  /* stopAudio() emits audio:end — cancel pending centers and clear play highlight. */
  window.addEventListener('audio:end', onPlaybackFullyStopped);

  window.addEventListener('audio:error', onPlaybackFullyStopped);

  window.addEventListener('audio:pause', onPlaybackPaused);

  window.GOMNA_AUDIO_HIGHLIGHT = {
    highlightAudio: highlightAudio,
    removeAllHighlights: removeAllHighlights,
    cancelBibleAutoCenter: cancelBibleAutoCenter
  };

  console.log('[GOMNA_AUDIO_HIGHLIGHT] loaded');
})();
