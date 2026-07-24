// 은혜의말씀 Service Worker
// 전략: HTML/앱 코드 자원은 network-first, 이미지/아이콘은 cache-first, 책별 데이터는 cache-first
// 캐시 키 정책:
//   - STATIC: HTML/JS/CSS/매니페스트/기본 아이콘 — 코드 변경 시 버전 bump
//   - DATA  : 책별 commentary (gomna_data_*.js) — 한번 받으면 영구 (immutable)

const CACHE_VERSION = '2026-07-24-commentary-cards-v1';
const CACHE_PREFIX = 'gomna-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const DATA_CACHE   = 'gomna-data-v1';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/translate_feature.js?v=20260723-scroll-ko-parity-v7',
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
  '/js/gomna-audio-ui.js?v=2',
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

// HTML: network-first — 항상 최신 페이지 보장
function isHtmlNav(req) {
  return req.mode === 'navigate'
    || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
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
  return fetch(req).then(resp => {
    if (resp.ok && resp.type === 'basic') {
      const clone = resp.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put(req, clone));
    }
    return resp;
  }).catch(() =>
    caches.match(req).then(hit => {
      if (hit) return hit;
      if (fallbackUrl) return caches.match(fallbackUrl);
      return Response.error();
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

  // ── 2) HTML 네비게이션: 네트워크 우선, 실패 시 캐시 폴백 ──
  if (isHtmlNav(req)) {
    event.respondWith(networkFirst(req, '/index.html'));
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
