/**
 * 은혜의말씀 GA4 이벤트 (쿠키 동의 + gtag 로드 후에만 전송)
 */
(function () {
  'use strict';

  function hasAnalyticsConsent() {
    try {
      var raw = localStorage.getItem('cookieChoice');
      if (!raw) return false;
      return !!JSON.parse(raw).analytics;
    } catch (e) {
      return false;
    }
  }

  function getTranslationCode() {
    var m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (!m) return 'ko';
    var parts = decodeURIComponent(m[1]).split('/');
    return parts[2] || 'ko';
  }

  function bookSlug(name) {
    if (typeof window.bookNumbers !== 'undefined' && window.bookNumbers && window.bookNumbers[name]) {
      return window.bookNumbers[name];
    }
    return name || '';
  }

  function track(eventName, params) {
    if (window.GomnaGa4) return window.GomnaGa4.track(eventName, params || {});
    if (window.GomnaAnalyticsControl && window.GomnaAnalyticsControl.isInternal()) return;
    if (!hasAnalyticsConsent()) return;
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params || {});
  }

  function verseParams(bookName, chapter, verse, testament) {
    return {
      book: bookSlug(bookName),
      chapter: chapter,
      verse: verse,
      translation: getTranslationCode(),
      testament: testament || ''
    };
  }

  window.GomnaAnalytics = {
    track: track,
    getTranslation: getTranslationCode,
    bookSlug: bookSlug,

    trackSearch: function (searchTerm) {
      track('search', { search_term: String(searchTerm || '').slice(0, 100) });
    },

    trackViewVerse: function (bookName, chapter, verse, testament) {
      if (!bookName || !chapter) return;
      track('view_verse', verseParams(bookName, chapter, verse || 1, testament));
    },

    trackOpenCommentary: function (bookName, chapter, verse, testament) {
      if (!bookName || !chapter || !verse) return;
      track('open_commentary', verseParams(bookName, chapter, verse, testament));
    },

    trackNavigateChapter: function (bookName, chapter, direction, testament) {
      if (!bookName || !chapter) return;
      var p = verseParams(bookName, chapter, 1, testament);
      p.direction = direction || 'select';
      track('navigate_chapter', p);
    },

    trackChangeTranslation: function (fromLang, toLang) {
      track('change_translation', {
        from_translation: fromLang || 'ko',
        to_translation: toLang || 'ko'
      });
    },

    trackAudioPlay: function (bookName, chapter, verse, testament) {
      if (!bookName || !chapter) return;
      track('audio_play', verseParams(bookName, chapter, verse || 1, testament));
    },

    trackShare: function (method, itemId) {
      track('share', {
        method: method || 'unknown',
        content_type: 'verse',
        item_id: itemId || ''
      });
    },

    trackClickPremium: function (source) {
      track('click_premium', { source: source || 'unknown' });
    }
  };

  // Observe successful playback without changing the engine, queues or audio files.
  var lastPlayed = '';
  window.addEventListener('audio:end', function () { lastPlayed = ''; });
  window.addEventListener('audio:start', function (event) {
    var detail = event.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine._state;
    var audio = state && state.currentAudio;
    if (!audio || !detail.entry) return;
    var audioId = detail.audioId;
    var epoch = state.queueEpoch;
    var key = epoch + ':' + audioId;
    function onPlaying() {
      audio.removeEventListener('playing', onPlaying);
      if (state.currentAudio !== audio || state.currentAudioId !== audioId || state.queueEpoch !== epoch) return;
      if (lastPlayed === key) return;
      var entry = detail.entry;
      var params = verseParams(entry.bookId || entry.book, entry.chapter, entry.verse || 1, entry.testament);
      params.audio_type = entry.type || 'unknown';
      if (track('audio_play', params)) lastPlayed = key;
    }
    audio.addEventListener('playing', onPlaying);
  });
})();
