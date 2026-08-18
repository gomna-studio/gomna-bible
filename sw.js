// 은혜의말씀 Service Worker
// 전략: HTML/앱 코드 자원은 network-first(타임아웃 포함), 이미지/아이콘은 cache-first, 책별 데이터는 cache-first
// 캐시 키 정책:
//   - STATIC: HTML/JS/CSS/매니페스트/기본 아이콘 — 코드 변경 시 버전 bump
//   - DATA  : 책별 commentary (gomna_data_*.js) — 한번 받으면 영구 (immutable)
//   - AUDIO_MANIFEST: /audio/audio-manifest.json — 4초 timeout 없이 전용 영구 캐시

const CACHE_VERSION = '2026-08-18-installed-app-auto-update-v1';
const CACHE_PREFIX = 'gomna-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const DATA_CACHE = 'gomna-data-v1';
const AUDIO_MANIFEST_CACHE = 'gomna-audio-manifest-v1';
const NETWORK_FIRST_TIMEOUT_MS = 4000;

// 로컬 미리보기 주소에서만 적용하는 예외.
// 운영 도메인에서는 아래 값이 false이므로 기존 동작이 그대로 유지된다.
const LOCAL_PREVIEW_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const IS_LOCAL_PREVIEW = LOCAL_PREVIEW_HOSTS.indexOf(self.location.hostname) !== -1;

const STATIC_URLS = [
  '/',
  '/index.html',
  '/reader.html',
  '/translate_feature.js?v=20260724-first-visit-detect-v2',
  '/js/gomna-ui-i18n.js?v=20260729-resume-i18n-books',
  '/analytics.js',
  '/settings_guide.js',
  '/gomna_category_feature.js',
  '/style.css',
  '/css/gomna-audio-player.css?v=20260803-expanded-progress-prod-v1',
  '/js/audio-config.js?v=1',
  '/js/audio-engine.js?v=3',
  '/js/gomna-audio-listen-button.js?v=1',
  '/js/gomna-audio-commentary-buttons.js?v=20260723-verse-bind-v4',
  '/js/gomna-audio-highlight.js?v=1',
  '/js/gomna-audio-ui.js?v=20260727-listen-supported-books-v1',
  '/manifest.json',
  '/favicon.png',
  '/logo-home.png',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
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

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache =>
        Promise.all(STATIC_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[sw] failed to cache', url, err);
          })
        ))
      ),
      caches.open(AUDIO_MANIFEST_CACHE).then(cache =>
        cache.add('/audio/audio-manifest.json').catch(err => {
          console.warn('[sw] failed to prefetch audio manifest', err);
        })
      )
    ])
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    migrateAudioManifestFromStaticCaches()
      .catch(err => console.warn('[sw] audio manifest migrate failed', err))
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

function networkFirst(req, fallbackUrl) {
  const networkPromise = fetch(req).then(resp => {
    if (resp.ok && resp.type === 'basic') {
      const clone = resp.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put(req, clone));
    }
    return resp;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('network-first-timeout')), NETWORK_FIRST_TIMEOUT_MS);
  });

  return Promise.race([networkPromise, timeoutPromise]).catch(() =>
    caches.match(req).then(hit => {
      if (hit) return hit;
      if (fallbackUrl) {
        return caches.match(fallbackUrl).then(fb => fb || Response.error());
      }
      return Response.error();
    })
  );
}

// 로컬 미리보기 전용: HTML 이동 요청은 4초 timeout으로 옛 캐시로 되돌리지 않는다.
// 네트워크 응답을 기다려 디스크의 현재 화면을 보여주고, 네트워크가 실제로 실패할 때만 캐시를 쓴다.
function networkFirstWithoutTimeout(req, fallbackUrl) {
  return fetch(req).then(resp => {
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
  return caches.open(STATIC_CACHE).then(cache =>
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
    event.respondWith(networkFirstWithoutTimeout(req, htmlFallbackFor(url)));
    return;
  }

  // ── 3) 앱 코드/manifest: 네트워크 우선, 실패 시 동일 URL 캐시 폴백 ──
  if (isFreshAppAsset(req, url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // ── 4) 이미지/폰트 등 정적 자원: 캐시 우선 ──
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, clone));
        }
        return resp;
      });
    })
  );
});
