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
        name: '또박또박 공부',
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

  // iOS Safari 대응:
  // 사용자 클릭 전에 manifest를 미리 로드해서,
  // 나중에 audio.play()가 클릭 핸들러 안에서 바로 실행될 수 있게 준비한다.
  (function preloadManifest() {
    window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'loading';

    fetch(window.GOMNA_AUDIO_CONFIG.MANIFEST_PATH, { cache: 'no-cache' })
      .then(function(res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function(data) {
        window.GOMNA_AUDIO_CONFIG.manifestData = data;
        window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'loaded';

        console.log('[GOMNA_AUDIO] manifest preloaded:', data.totalAudios, 'items');

        window.dispatchEvent(new CustomEvent('gomna:manifest_loaded', {
          detail: {
            totalAudios: data.totalAudios
          }
        }));
      })
      .catch(function(err) {
        window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'error';
        console.error('[GOMNA_AUDIO] manifest preload failed:', err);
      });
  })();

  console.log('[GOMNA_AUDIO] config loaded');
})();
