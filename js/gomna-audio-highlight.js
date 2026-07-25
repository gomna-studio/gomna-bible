(function() {
  'use strict';

  var lastUserScrollTime = 0;
  var ACTIVE_CLASS = 'gomna-commentary-card-active';

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

  function canAutoCenterBibleCard() {
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var timeSinceScroll = Date.now() - lastUserScrollTime;

    if (!state || !state.currentAudioId || !state.isPlaying) return false;
    if (timeSinceScroll <= 1500) return false;

    return true;
  }

  function centerBibleVerseCard(verseItem) {
    if (!verseItem) return;

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

  window.addEventListener('audio:start', function(e) {
    if (e.detail && e.detail.audioId) {
      highlightAudio(e.detail.audioId);
    }
  });

  window.addEventListener('audio:end', function() {
    removeAllHighlights();
  });

  window.addEventListener('audio:error', function() {
    removeAllHighlights();
  });

  window.GOMNA_AUDIO_HIGHLIGHT = {
    highlightAudio: highlightAudio,
    removeAllHighlights: removeAllHighlights
  };

  console.log('[GOMNA_AUDIO_HIGHLIGHT] loaded');
})();
