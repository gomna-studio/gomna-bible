// 은혜의말씀 Service Worker
// 전략: HTML/앱 코드 자원은 network-first(타임아웃 포함), 이미지/아이콘은 cache-first, 책별 데이터는 cache-first
// 캐시 키 정책:
//   - STATIC: HTML/JS/CSS/매니페스트/기본 아이콘 — 코드 변경 시 버전 bump
//   - DATA  : 책별 commentary (gomna_data_*.js) — 한번 받으면 영구 (immutable)
//   - AUDIO_MANIFEST: /audio/audio-manifest.json — 4초 timeout 없이 전용 영구 캐시

const CACHE_VERSION = '2026-10-09-legacy-audio-card-v85';
const CACHE_PREFIX = 'gomna-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const IMAGE_CACHE = 'gomna-images-v1';
const BIBLE_CACHE = 'gomna-bible-text-v1';
const DATA_CACHE = 'gomna-data-v1';
const AUDIO_MANIFEST_CACHE = 'gomna-audio-manifest-v1';
const NETWORK_FIRST_TIMEOUT_MS = 4000;
const HTML_FALLBACK_TIMEOUT_MS = 1200;

// 로컬 미리보기 주소에서만 적용하는 예외.
// 운영 도메인에서는 아래 값이 false이므로 기존 동작이 그대로 유지된다.
const LOCAL_PREVIEW_HOSTS = ['127.0.0.1', 'localhost', '::1'];
function isLocalPreviewHost(hostname) {
  const host = String(hostname || '');
  if (LOCAL_PREVIEW_HOSTS.indexOf(host) !== -1) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  if (/\.trycloudflare\.com$/i.test(host)) return true;
  return false;
}
const IS_LOCAL_PREVIEW = isLocalPreviewHost(self.location.hostname);

const STATIC_URLS = [
  '/assets/images/home-card-dawn-sea.webp?v=20261005-home-approved-clean-v74',
  '/assets/images/home-card-today-message-calm-20261010.webp?v=20261010-calm-v1',
  '/assets/home/bible-discovery-journey-v5.webp',
  '/js/gomna-guide-colorful.css?v=20261009-image-viewer-all-v27',
  '/js/gomna-guide-home-entry.js?v=20261009-image-viewer-all-v27',
  '/gomna_category_feature.js?v=20261009-image-viewer-all-v28',
  '/js/gomna-auth.js?v=20261008-account-unified-v1',
  '/js/gomna-account-white.css?v=20261008-account-unified-v1',
  '/js/gomna-nav-single-tap.js?v=20261008-resume-v1',
  '/js/gomna-nav-magnifier.js?v=20261008-resume-v1',
  '/js/gomna-bible-stair-picker.js?v=20261008-clean-transition-v1',
  '/js/gomna-meditation.css?v=20261008-border-2px-v1',
  '/',
  '/index.html',
  '/reader.html',
  '/meditation.html',
  '/js/gomna-pwa-recovery.js?v=2026-10-09-legacy-audio-card-v85',
  '/translate_feature.js?v=20260724-first-visit-detect-v2',
  '/js/gomna-ui-i18n.js?v=20260729-resume-i18n-books',
  '/analytics-control.js?v=20260826-internal-exclusion-v1',
  '/analytics.js?v=20261001-analytics-v1',
  '/js/gomna-ga4.js?v=20261001-analytics-v1',
  '/js/gomna-screen-transition.js?v=20261009-hide-leaving-v1',
  '/settings_guide.js',
  '/settings_guide.js?v=20260925-hide-language-settings-v1',
  '/js/gomna-account-white.css?v=20260925-account-white-preview-v5',
  '/js/gomna-home-feed.js?v=20261010-today-message-calm-v88',
  '/js/gomna-home-feed.css?v=20261010-today-message-calm-v88',
  '/gomna_category_feature.js',
  '/gomna_category_feature.js?v=20260927-reader-guide-width-v1',
  '/js/gomna-nav-magnifier.js?v=20261007-tap-v10',
  '/style.css',
  '/css/gomna-audio-player.css?v=20261010-commentary-buttons-v2',
  '/js/audio-config.js?v=1',
  '/js/audio-engine.js?v=20261006-audio-v76',
  '/js/gomna-audio-listen-button.js?v=1',
  '/js/gomna-audio-commentary-buttons.js?v=20260723-verse-bind-v4',
  '/js/gomna-audio-highlight.js?v=1',
  '/js/gomna-audio-ui.js?v=20261006-audio-v76',
  '/js/gomna-bible-listen-controls.js?v=20260926-controls-1',
  '/manifest.json',
  '/favicon.png',
  '/logo-home.png',
  '/assets/home/card-meditation-life-20261005.webp?v=20261005-background-v1',
  '/assets/home/card-people-journey-20261005.webp?v=20261005-home-approved-clean-v74',
  '/js/gomna-home-people-card.css?v=20261006-person-picker-size-v79',
  '/js/gomna-nav-single-tap.js?v=20261007-tap-v10',
  '/js/gomna-coffee-steam.css?v=20261008-startup-v84',
  '/js/gomna-bible-library.css?v=20261007-buttons-down-10mm-v9',
  '/assets/home/meditation-coffee.png?v=20261007-coffee-v1',
  '/js/gomna-bible-library.js?v=20261010-word-view-merge-v1',
  '/js/gomna-bible-library-data.js?v=20261005-home-approved-clean-v74',
  '/assets/home/people/v1/mary.webp',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/app-icon-180.png',
  '/app-icon-512.png',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/globe_3d_256.webp',
  '/assets/globe_3d_128.png'
];

function isCommentaryData(url) {
  return /\/gomna_data_[a-z0-9]+\.js(\?|$)/i.test(url);
}

// 대형 성경 본문 데이터 — 4초 network-first timeout 적용 금지
function isLargeBibleDataScript(url) {
  return /\/(?:old|new)_testament\.js$/i.test(url.pathname);
}

// 대형 audio manifest — 4초 network-first timeout 적용 금지
function isAudioManifestJson(url) {
  return url.pathname === '/audio/audio-manifest.json';
}

async function migrateAudioManifestFromStaticCaches() {
  const manifestCache = await caches.open(AUDIO_MANIFEST_CACHE);
  const names = await caches.keys();

  await Promise.all(names.map(async (name) => {
    if (!name.startsWith(`${CACHE_PREFIX}static-`)) return;
    if (name === STATIC_CACHE) return;

    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      await Promise.all(keys.map(async (req) => {
        try {
          const url = new URL(req.url);
          if (!isAudioManifestJson(url)) return;
          const resp = await cache.match(req);
          if (!resp || !resp.ok) return;
          await manifestCache.put(req, resp.clone());
          await manifestCache.put(new Request(url.origin + url.pathname), resp.clone());
        } catch (eItem) {
          console.warn('[sw] audio manifest migrate item failed', req.url, eItem);
        }
      }));
    } catch (eCache) {
      console.warn('[sw] audio manifest migrate cache failed', name, eCache);
    }
  }));
}

async function findCachedAudioManifest(req) {
  const url = new URL(req.url);
  const dedicated = await caches.open(AUDIO_MANIFEST_CACHE);
  const exact = await dedicated.match(req);
  if (exact) return exact;

  const bare = await dedicated.match(new Request(url.origin + url.pathname));
  if (bare) return bare;

  // Fallback: any existing cache (including older STATIC caches)
  const matchAll = await caches.match(req);
  if (matchAll) return matchAll;

  const keys = await caches.keys();
  for (const name of keys) {
    try {
      const cache = await caches.open(name);
      const cacheKeys = await cache.keys();
      for (const key of cacheKeys) {
        const keyUrl = new URL(key.url);
        if (keyUrl.pathname === '/audio/audio-manifest.json') {
          const hit = await cache.match(key);
          if (hit) return hit;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// audio-manifest.json:
// 1) 전용 캐시 hit → 즉시 반환 + 백그라운드 갱신
// 2) 캐시 miss → 네트워크를 timeout 없이 대기
// 3) 네트워크 성공 → 전용 캐시 저장
// 4) 네트워크 실패 → 다른 캐시 폴백
// 5) 폴백도 없으면 실패
async function audioManifestStaleWhileRevalidate(req) {
  const url = new URL(req.url);
  const cache = await caches.open(AUDIO_MANIFEST_CACHE);
  const cached = (await cache.match(req)) || (await cache.match(new Request(url.origin + url.pathname)));

  const fetching = fetch(req).then(async (resp) => {
    if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
      await cache.put(req, resp.clone());
      await cache.put(new Request(url.origin + url.pathname), resp.clone());
    }
    return resp;
  });

  if (cached) {
    fetching.catch(() => {});
    return cached;
  }

  try {
    const resp = await fetching;
    if (resp && resp.ok) return resp;
    const fallback = await findCachedAudioManifest(req);
    if (fallback) return fallback;
    return resp || Response.error();
  } catch (err) {
    const fallback = await findCachedAudioManifest(req);
    if (fallback) return fallback;
    throw err;
  }
}

// No unconditional skipWaiting: older clients cannot report whether audio is playing.
// Existing clients without this protocol upgrade on natural close/navigation.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async cache => {
    const required = ['/index.html', '/reader.html', '/meditation.html'];
    const queue = [...new Set([...required, ...STATIC_URLS])];
    let next = 0;
    // Keep optional downloads from flooding the first screen's connection.
    async function download() {
      while (next < queue.length) {
        const url = queue[next++];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(new Request(url, { cache: 'no-cache', priority: 'low', signal: controller.signal }));
          if (!response.ok) throw new Error('precache HTTP ' + response.status);
          await cache.put(url, response);
        } catch (err) {
          if (required.includes(url)) throw err; // Keep the active worker if core pages are unavailable.
          console.warn('[sw] optional precache failed', url);
        } finally { clearTimeout(timer); }
      }
    }
    await Promise.all([download(), download(), download()]);
  }));
  // The audio manifest remains in its dedicated cache and refreshes when requested.
});

let updateProbe = null;
async function requestSafeActivation() {
  if (updateProbe) return;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!clients.length) { await self.skipWaiting(); return; }
  if (updateProbe) return;
  const token = CACHE_VERSION + ':' + Date.now();
  const answers = new Map();
  updateProbe = { token, answers, ids: new Set(clients.map(client => client.id)) };
  clients.forEach(client => client.postMessage({ type: 'GOMNA_UPDATE_PROBE', token }));
  await new Promise(resolve => setTimeout(resolve, 1200));
  const current = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const safe = current.every(client => updateProbe.ids.has(client.id) && answers.get(client.id) === true);
  updateProbe = null;
  if (safe) await self.skipWaiting();
}
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'GOMNA_GET_RELEASE' && event.source) {
    event.source.postMessage({ type: 'GOMNA_RELEASE', version: CACHE_VERSION });
  } else if (data.type === 'GOMNA_REQUEST_ACTIVATION') {
    event.waitUntil(requestSafeActivation());
  } else if (data.type === 'GOMNA_UPDATE_REPLY' && updateProbe && event.source &&
      data.token === updateProbe.token && updateProbe.ids.has(event.source.id)) {
    updateProbe.answers.set(event.source.id, data.safe === true);
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    migrateAudioManifestFromStaticCaches()
      .catch(err => console.warn('[sw] audio manifest migrate failed', err))
      .then(async () => {
        const images=await caches.open(IMAGE_CACHE), bible=await caches.open(BIBLE_CACHE);
        for(const name of await caches.keys()) {
          if(!name.startsWith(`${CACHE_PREFIX}static-`))continue;
          const source=await caches.open(name);
          for(const req of await source.keys()) {
            const url=new URL(req.url);
            const dest=isLargeBibleDataScript(url)?bible:/\.(png|webp|jpg|jpeg|svg|ico)$/i.test(url.pathname)?images:null;
            if(dest && !(await dest.match(req))) { const hit=await source.match(req); if(hit && hit.ok)await dest.put(req,hit); }
          }
        }
      })
      .then(() => caches.keys())
      .then(names => {
        return Promise.all(
          names
            .filter(name => name.startsWith(`${CACHE_PREFIX}static-`) && name !== STATIC_CACHE)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// HTML: network-first — 항상 최신 페이지 보장
function isHtmlNav(req) {
  return req.mode === 'navigate'
    || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function htmlFallbackFor(url) {
  const path = url.pathname || '/';
  if (path === '/reader.html' || path.endsWith('/reader.html')) {
    return '/reader.html';
  }
  if (path === '/' || path === '/index.html') {
    return '/index.html';
  }
  // 다른 HTML: 요청 URL 자체 캐시만 사용 (홈으로 오인 폴백 금지)
  return null;
}

function isFreshAppAsset(req, url) {
  if (!isSameOrigin(url)) return false;

  // Locale commentary cards + book manifest shards change as ranges publish;
  // never serve them cache-first or readers keep pre-publish 1:1-1:10 JSON.
  if (
    /^\/data\/commentary-cards\//i.test(url.pathname) ||
    /^\/audio\/manifests\//i.test(url.pathname)
  ) {
    return true;
  }

  // Large audio manifest has its own timeout-free handler.
  if (isAudioManifestJson(url)) return false;

  return req.destination === 'script'
    || req.destination === 'style'
    || req.destination === 'worker'
    || /\.(?:js|css)(?:$|\?)/i.test(url.pathname + url.search)
    || url.pathname === '/manifest.json';
}

async function networkFirst(req, fallbackUrl, timeoutMs = NETWORK_FIRST_TIMEOUT_MS) {
  const cachedPromise = caches.match(req).then(async hit => {
    if (hit && hit.ok) return hit;
    const fallback = fallbackUrl && await caches.match(fallbackUrl);
    return fallback && fallback.ok ? fallback : null;
  }).catch(() => null);
  const networkPromise = fetch(req, { cache: 'no-cache' }).then(resp => {
    if (resp.ok && resp.type === 'basic') {
      const clone = resp.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put(req, clone)).catch(() => {});
    }
    return resp.ok ? resp : cachedPromise.then(hit => hit || resp);
  }).catch(async () => {
    const hit = await cachedPromise;
    return hit || Response.error();
  });
  const cached = await cachedPromise;
  // A timeout can select a valid fallback, but must never turn an in-flight
  // successful cold download into a network error just because no cache exists.
  if (!cached) return networkPromise;
  let timer;
  try {
    return await Promise.race([networkPromise, new Promise(resolve => {
      timer = setTimeout(() => resolve(cached), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function versionedAppAsset(req) {
  const hit = await caches.open(STATIC_CACHE).then(cache => cache.match(req)).catch(() => null);
  return hit && hit.ok ? hit : networkFirst(req);
}

// 로컬 미리보기 전용: HTML 이동 요청은 4초 timeout으로 옛 캐시로 되돌리지 않는다.
// 네트워크 응답을 기다려 디스크의 현재 화면을 보여주고, 네트워크가 실제로 실패할 때만 캐시를 쓴다.
function networkFirstWithoutTimeout(req, fallbackUrl) {
  return fetch(req, { cache: 'no-cache' }).then(resp => {
    if (resp.ok && resp.type === 'basic') {
      const clone = resp.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put(req, clone));
    }
    return resp;
  }).catch(() =>
    caches.match(req).then(hit => {
      if (hit) return hit;
      if (fallbackUrl) {
        return caches.match(fallbackUrl).then(fb => fb || Response.error());
      }
      return Response.error();
    })
  );
}

// 대형 성경 데이터: 캐시가 있으면 즉시 제공 후 백그라운드 갱신, 없으면 네트워크를 timeout 없이 대기
function bibleDataStaleWhileRevalidate(req) {
  return caches.open(BIBLE_CACHE).then(cache =>
    cache.match(req).then(hit => {
      const fetching = fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          cache.put(req, resp.clone());
        }
        return resp;
      });
      if (hit) {
        fetching.catch(() => {});
        return hit;
      }
      return fetching;
    })
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ── 1) 책별 commentary (immutable): 캐시 우선, 없으면 네트워크 후 캐시 ──
  if (isCommentaryData(req.url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(resp => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // ── 1a) 대형 audio manifest: 4초 timeout 금지, 전용 영구 캐시 ──
  // isFreshAppAsset보다 먼저 처리해야 한다.
  if (isAudioManifestJson(url)) {
    event.respondWith(
      audioManifestStaleWhileRevalidate(req).catch(() => Response.error())
    );
    return;
  }

  // ── 1b) 대형 성경 본문 데이터: 4초 timeout 금지 ──
  if (isLargeBibleDataScript(url)) {
    event.respondWith(bibleDataStaleWhileRevalidate(req));
    return;
  }

  // ── 2) HTML 네비게이션: 네트워크 우선, 경로별 폴백 ──
  if (isHtmlNav(req)) {
    event.respondWith(IS_LOCAL_PREVIEW
      ? networkFirstWithoutTimeout(req, htmlFallbackFor(url))
      : networkFirst(req, htmlFallbackFor(url), HTML_FALLBACK_TIMEOUT_MS));
    return;
  }

  // ── 3) 앱 코드/manifest: 네트워크 우선, 실패 시 동일 URL 캐시 폴백 ──
  if (isFreshAppAsset(req, url)) {
    const versionedCode = url.searchParams.has('v') && /\.(?:js|css)$/i.test(url.pathname);
    event.respondWith(IS_LOCAL_PREVIEW ? networkFirstWithoutTimeout(req)
      : versionedCode ? versionedAppAsset(req) : networkFirst(req));
    return;
  }

  // ── 4) 이미지/폰트 등 정적 자원: 캐시 우선 ──
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(/\.(png|webp|jpg|jpeg|svg|ico)$/i.test(url.pathname) ? IMAGE_CACHE : STATIC_CACHE).then(c => c.put(req, clone));
        }
        return resp;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: '오늘의 말씀',
    body: '',
    lang: 'ko',
    tag: 'gomna-today',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { source: 'home-today', url: '/?source=home-today' }
  };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (ePush) {}
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data
    : { source: 'home-today', url: '/?source=home-today' };
  const report = (stage, extra) => fetch(new URL('/api/push/client-state', self.location.origin).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'service-worker', stage, title: payload.title || '', extra: extra || null })
  }).catch(() => {});
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(payload.title || '오늘의 말씀', {
        body: payload.body || '',
        lang: payload.lang || 'ko',
        tag: payload.tag || 'gomna-today',
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/icon-192.png',
        silent: false,
        data: data
      });
      await report('notification-shown');
    } catch (error) {
      await report('notification-show-error', String(error && error.message || error));
      throw error;
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || { source: 'home-today' };
  const dest = data.url || '/?source=home-today';
  event.waitUntil(openTodayWordFromPush(dest, data));
});

function openTodayWordFromPush(dest, data) {
  const abs = new URL(dest, self.location.origin).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (let i = 0; i < list.length; i++) {
      const client = list[i];
      try {
        if (new URL(client.url).origin !== self.location.origin) continue;
      } catch (eOrigin) {
        continue;
      }
      const focus = client.focus ? client.focus() : Promise.resolve();
      return Promise.resolve(focus).then(() => {
        try { client.postMessage({ type: 'gomna-open-today', data: data || {} }); } catch (eMsg) {}
        const path = (() => { try { return new URL(client.url).pathname; } catch (ePath) { return ''; } })();
        if (path === '/' || path === '/index.html') return;
        if (typeof client.navigate === 'function') return client.navigate(abs).catch(() => {});
      });
    }
    return self.clients.openWindow(abs);
  });
}

