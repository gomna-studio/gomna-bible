(function() {
  'use strict';

  var LOCAL_AUDIO_BASE_URL = '/audio/v1';
  var configuredAudioBaseUrl = window.GOMNA_AUDIO_BASE_URL || LOCAL_AUDIO_BASE_URL;

  function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function buildAudioUrl(filePath) {
    if (!filePath) return '';
    if (/^https?:\/\//i.test(filePath)) return filePath;

    var normalizedBaseUrl = trimTrailingSlash(configuredAudioBaseUrl);
    var normalizedFilePath = String(filePath);
    var localPrefix = LOCAL_AUDIO_BASE_URL + '/';

    if (normalizedFilePath.indexOf(localPrefix) === 0) {
      return normalizedBaseUrl + '/' + normalizedFilePath.slice(localPrefix.length);
    }

    if (normalizedFilePath.charAt(0) !== '/') {
      return normalizedBaseUrl + '/' + normalizedFilePath;
    }

    return normalizedFilePath;
  }

  window.GOMNA_AUDIO_CONFIG = {
    AUDIO_BASE_PATH: '/audio/v1/ko-KR',
    AUDIO_BASE_URL: trimTrailingSlash(configuredAudioBaseUrl),
    AUDIO_LOCAL_BASE_URL: LOCAL_AUDIO_BASE_URL,
    AUDIO_REMOTE_BASE_URL: '',
    AUDIO_VERSION: 'v1',
    MANIFEST_PATH: '/audio/audio-manifest.json',
    MANIFEST_SHARD_ROOT: '/audio/manifests',
    buildAudioUrl: buildAudioUrl,

    TTS_DEFAULTS: {
      provider: 'openai',
      model: 'gpt-4o-mini-tts',
      voicePreset: 'calm',
      providerVoice: 'marin',
      outputFormat: 'mp3'
    },

    COMMENTARY_MAP: {
      '원어분석': 'original-language',
      '역사적배경': 'history',
      '신학적의미': 'theology',
      '예표론': 'typology',
      '매튜헨리': 'matthew-henry',
      '설교자료': 'sermon',
      '찬송가': 'hymn',
      '상담적용': 'counseling',
      '교차참조': 'cross-reference'
    },

    COMMENTARY_MAP_REVERSE: {
      'original-language': '원어분석',
      'history': '역사적배경',
      'theology': '신학적의미',
      'typology': '예표론',
      'matthew-henry': '매튜헨리',
      'sermon': '설교자료',
      'hymn': '찬송가',
      'counseling': '상담적용',
      'cross-reference': '교차참조'
    },

    VOICE_PRESETS: {
      'calm': {
        name: '차분한 낭독',
        provider: 'openai',
        providerVoice: 'marin',
        use: ['bible', 'matthew-henry', 'cross-reference']
      },
      'warm': {
        name: '따뜻한 묵상',
        provider: 'openai',
        providerVoice: 'marin',
        use: ['history', 'theology', 'counseling']
      },
      'study': {
        name: '또렷한 낭독',
        provider: 'openai',
        providerVoice: 'marin',
        use: ['original-language', 'typology']
      },
      'strong': {
        name: '설교형 전달',
        provider: 'openai',
        providerVoice: 'marin',
        use: ['sermon']
      },
      'soft': {
        name: '조용한 밤낭독',
        provider: 'openai',
        providerVoice: 'marin',
        use: ['hymn']
      }
    },

    PLAYBACK_SPEEDS: [0.8, 1.0, 1.25, 1.5, 2.0],
    DEFAULT_SPEED: 1.0,

    SLEEP_TIMERS: [0, 5, 10, 20, 'chapter-end'],

    AUDIO_STATUS: ['draft', 'generated', 'published', 'error'],

    manifestData: null,
    manifestLoadStatus: 'pending',

    CACHE_POLICY: {
      manifest: 'no-cache',
      mp3: 'public, max-age=31536000, immutable'
    }
  };

  // 한국어 전체 주소록(수십 MB)을 페이지마다 읽지 않는다.
  // 현재 재생하려는 성경책의 작은 주소록만 한 번 불러와 합친다.
  (function setupBookManifestLoader() {
    var config = window.GOMNA_AUDIO_CONFIG;
    var loadedBooks = Object.create(null);
    var bookPromises = Object.create(null);

    config.manifestData = {
      version: 'ko-book-shards-v1',
      lastUpdated: null,
      totalAudios: 0,
      audios: {}
    };
    config.manifestLoadStatus = 'loaded';
    config.manifestBookStatus = Object.create(null);

    function getBookId(audioId) {
      var value = String(audioId || '');
      var dot = value.indexOf('.');
      return dot > 0 ? value.slice(0, dot) : '';
    }

    function mergeBook(data, bookId) {
      var audios = data && data.audios;
      var ids;
      var i;
      if (!audios || typeof audios !== 'object' || Array.isArray(audios)) {
        throw new Error('invalid book manifest: ' + bookId);
      }
      ids = Object.keys(audios);
      for (i = 0; i < ids.length; i += 1) {
        config.manifestData.audios[ids[i]] = audios[ids[i]];
      }
      config.manifestData.totalAudios = Object.keys(config.manifestData.audios).length;
      config.manifestData.lastUpdated = data.generatedAt || config.manifestData.lastUpdated;
      loadedBooks[bookId] = true;
      config.manifestBookStatus[bookId] = 'loaded';
      window.dispatchEvent(new CustomEvent('gomna:manifest_loaded', {
        detail: { bookId: bookId, entryCount: ids.length, totalAudios: config.manifestData.totalAudios }
      }));
      return data;
    }

    config.loadBookManifest = function(bookId) {
      var normalized = String(bookId || '').trim().toLowerCase();
      var url;
      if (!/^[a-z0-9-]+$/.test(normalized)) {
        return Promise.reject(new Error('invalid book id'));
      }
      if (loadedBooks[normalized]) return Promise.resolve(true);
      if (bookPromises[normalized]) return bookPromises[normalized];

      config.manifestBookStatus[normalized] = 'loading';
      url = config.MANIFEST_SHARD_ROOT + '/ko-KR/' + normalized + '.json';
      bookPromises[normalized] = fetch(url, { cache: 'default' })
        .then(function(response) {
          if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 0));
          return response.json();
        })
        .then(function(data) {
          return mergeBook(data, normalized);
        })
        .catch(function(error) {
          config.manifestBookStatus[normalized] = 'error';
          delete bookPromises[normalized];
          throw error;
        });
      return bookPromises[normalized];
    };

    config.ensureAudioId = function(audioId) {
      var existing = config.manifestData.audios[audioId];
      var bookId;
      if (existing) return Promise.resolve(existing);
      bookId = getBookId(audioId);
      if (!bookId) return Promise.reject(new Error('invalid audio id'));
      return config.loadBookManifest(bookId).then(function() {
        return config.manifestData.audios[audioId] || null;
      });
    };

    function prewarmCurrentBook() {
      var params;
      var bookName;
      var bookId;
      try {
        params = new URLSearchParams(window.location.search || '');
        bookName = String(params.get('book') || '').trim();
        if (!bookName && window.currentBook) bookName = String(window.currentBook.name || '').trim();
        if (!bookName || !window.GOMNA_AUDIO_BOOK || typeof window.GOMNA_AUDIO_BOOK.getBookAudioId !== 'function') return;
        bookId = window.GOMNA_AUDIO_BOOK.getBookAudioId(bookName);
        if (!bookId) return;
        config.loadBookManifest(bookId).catch(function(error) {
          console.warn('[GOMNA_AUDIO] book manifest prewarm warning:', error);
        });
      } catch (error) {
        console.warn('[GOMNA_AUDIO] book manifest prewarm warning:', error);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(prewarmCurrentBook, 0); }, { once: true });
    } else {
      setTimeout(prewarmCurrentBook, 0);
    }
  })();

  console.log('[GOMNA_AUDIO] config loaded');
})();
