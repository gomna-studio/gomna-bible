// 은혜의말씀 Service Worker
// 전략: HTML/앱 코드 자원은 network-first(타임아웃 포함), 이미지/아이콘은 cache-first, 책별 데이터는 cache-first
// 캐시 키 정책:
//   - STATIC: HTML/JS/CSS/매니페스트/기본 아이콘 — 코드 변경 시 버전 bump
//   - DATA  : 책별 commentary (gomna_data_*.js) — 한번 받으면 영구 (immutable)

const CACHE_VERSION = '2026-08-02-reader-entry-data-loading-v1';
const CACHE_PREFIX = 'gomna-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const DATA_CACHE   = 'gomna-data-v1';
const NETWORK_FIRST_TIMEOUT_MS = 4000;

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
  '/css/gomna-audio-player.css?v=20260603-01',
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

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // addAll은 1개라도 실패하면 전체 실패 — 개별 add로 부분 실패를 허용
      return Promise.all(STATIC_URLS.map(url =>
        cache.add(url).catch(err => {
          console.warn('[sw] failed to cache', url, err);
        })
      ));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      const valid = new Set([STATIC_CACHE, DATA_CACHE]);
      return Promise.all(
        names
          .filter(name => name.startsWith(CACHE_PREFIX) && !valid.has(name))
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 책별 commentary 데이터: cache-first, 영구 보관 (immutable URL)
function isCommentaryData(url) {
  return /\/gomna_data_[a-z0-9]+\.js(\?|$)/i.test(url);
}

// 대형 성경 본문 데이터 — 4초 network-first timeout 적용 금지
function isLargeBibleDataScript(url) {
  return /\/(?:old|new)_testament\.js$/i.test(url.pathname);
}

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

  return req.destination === 'script'
    || req.destination === 'style'
    || req.destination === 'worker'
    || /\.(?:js|css)(?:$|\?)/i.test(url.pathname + url.search)
    || url.pathname === '/manifest.json'
    || url.pathname === '/audio/audio-manifest.json';
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

  // ── 1b) 대형 성경 본문 데이터: 4초 timeout 금지 ──
  if (isLargeBibleDataScript(url)) {
    event.respondWith(bibleDataStaleWhileRevalidate(req));
    return;
  }

  // ── 2) HTML 네비게이션: 네트워크 우선, 경로별 폴백 ──
  if (isHtmlNav(req)) {
    event.respondWith(networkFirst(req, htmlFallbackFor(url)));
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
