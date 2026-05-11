// 은혜의말씀 Service Worker
// 전략: 정적 자원은 cache-first (오프라인 + 즉시 로드), HTML은 network-first (최신성)
// 캐시 키 정책:
//   - STATIC: HTML/JS/CSS/매니페스트/기본 아이콘 — 코드 변경 시 버전 bump
//   - DATA  : 책별 commentary (gomna_data_*.js) — 한번 받으면 영구 (immutable)

const STATIC_CACHE = 'gomna-static-v57';
const DATA_CACHE   = 'gomna-data-v1';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/reader.html',
  '/translate_feature.js',
  '/settings_guide.js',
  '/gomna_category_feature.js',
  '/style.css',
  '/manifest.json',
  '/favicon.png',
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
        names.filter(name => !valid.has(name)).map(name => caches.delete(name))
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

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  // ── 1) 책별 commentary (immutable): 캐시 우선, 없으면 네트워크 후 캐시 ──
  if (isCommentaryData(url)) {
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
    event.respondWith(
      fetch(req).then(resp => {
        // 성공한 응답을 백그라운드로 캐시 갱신
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }

  // ── 3) 정적 자원 (JS/CSS/이미지/폰트 등): 캐시 우선 ──
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
