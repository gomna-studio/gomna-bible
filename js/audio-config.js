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

  // Reading routes still prepare audio before a tap (important on iOS Safari).
  // Find, Archive and the home picker do not need the large audio manifest.
  // They request it only when an actual passage or audio action needs it.
  // generation은 늦게 도착한 이전 manifest가 갱신본을 덮지 않게 한다.
  var manifestGeneration = 0;
  var manifestRequested = false;
  var manifestRequest = null;

  function applyManifestDocument(data, generation) {
    if (generation !== manifestGeneration || !data || !data.audios) return;
    window.GOMNA_AUDIO_CONFIG.manifestData = data;
    window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'loaded';

    console.log('[GOMNA_AUDIO] manifest preloaded:', data.totalAudios, 'items');

    window.dispatchEvent(new CustomEvent('gomna:manifest_loaded', {
      detail: {
        totalAudios: data.totalAudios
      }
    }));
  }

  function requestManifest(generation) {
    if (!window.GOMNA_AUDIO_CONFIG.manifestData) {
      window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'loading';
    }

    manifestRequest = fetch(window.GOMNA_AUDIO_CONFIG.MANIFEST_PATH, { cache: 'no-cache' })
      .then(function(res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function(data) {
        if (!data || !data.audios) throw new Error('Invalid audio manifest');
        applyManifestDocument(data, generation);
        return data;
      })
      .catch(function(err) {
        if (generation !== manifestGeneration) return;
        if (!window.GOMNA_AUDIO_CONFIG.manifestData) {
          window.GOMNA_AUDIO_CONFIG.manifestLoadStatus = 'error';
        }
        console.error('[GOMNA_AUDIO] manifest preload failed:', err);
        return null;
      })
      .finally(function() {
        if (generation === manifestGeneration) manifestRequest = null;
      });
    return manifestRequest;
  }

  function ensureManifest() {
    if (window.GOMNA_AUDIO_CONFIG.manifestData) {
      return Promise.resolve(window.GOMNA_AUDIO_CONFIG.manifestData);
    }
    if (manifestRequest) return manifestRequest;
    manifestRequested = true;
    manifestGeneration += 1;
    return requestManifest(manifestGeneration);
  }
  window.GOMNA_AUDIO_CONFIG.ensureManifest = ensureManifest;

  var homePicker = false;
  function isLocalPanelEntry() {
    try {
      var p = new URLSearchParams(window.location.search);
      homePicker = p.get('source') === 'home-bible-picker';
      if (homePicker) return true;
      return !p.get('book') && p.get('homeGuide') !== '1' && p.get('guideDetail') !== '1' &&
        (p.has('easy') || p.has('favorites'));
    } catch (e) { return false; }
  }
  function prepareActivePassage() {
    if (homePicker) return;
    var view = document.getElementById('verseView');
    if (view && view.classList.contains('active') && view.querySelector('.verse-item')) ensureManifest();
  }
  window.addEventListener('gomna:verse_list_rendered', prepareActivePassage);
  // Also covers a direct engine caller outside the Reader's normal wait helper.
  window.addEventListener('audio:attempt', ensureManifest);
  if (!isLocalPanelEntry()) ensureManifest();
  else prepareActivePassage(); // The passage event may precede this deferred script.

  if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      var data = event && event.data;
      if (!data || data.type !== 'GOMNA_AUDIO_MANIFEST_UPDATED') return;
      if (!manifestRequested) return;
      manifestGeneration += 1;
      requestManifest(manifestGeneration);
    });
  }

  console.log('[GOMNA_AUDIO] config loaded');
})();
