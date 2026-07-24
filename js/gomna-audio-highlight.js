(function() {
  'use strict';

  var lastUserScrollTime = 0;

  window.addEventListener('scroll', function() {
    lastUserScrollTime = Date.now();
  }, { passive: true });

  function removeAllHighlights() {
    var elements = document.querySelectorAll('.gomna-audio-reading');

    for (var i = 0; i < elements.length; i++) {
      elements[i].classList.remove('gomna-audio-reading');
    }
  }

  function isCommentaryTarget(target) {
    return !!(
      target &&
      target.closest &&
      target.closest('#commentaryPopup, #commentaryScrollArea, #commentaryContent')
    );
  }

  function highlightAudio(audioId) {
    if (!audioId) return;

    removeAllHighlights();

    var target = document.querySelector('[data-audio-target="' + audioId + '"]');

    if (!target) {
      console.warn('[GOMNA_AUDIO_HIGHLIGHT] target not found:', audioId);
      return;
    }

    target.classList.add('gomna-audio-reading');

    /*
     * Commentary card rows are centered by gomna-card-highlight-test.js
     * (shared shouldAutoCenterActiveCommentaryCard). Do not scrollIntoView
     * the page/document from this helper for commentary targets.
     */
    if (isCommentaryTarget(target)) {
      return;
    }

    var timeSinceScroll = Date.now() - lastUserScrollTime;
    var canCenter =
      typeof window.shouldAutoCenterActiveCommentaryCard === 'function'
        ? window.shouldAutoCenterActiveCommentaryCard()
        : timeSinceScroll > 1500;

    if (canCenter && timeSinceScroll > 1500) {
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
