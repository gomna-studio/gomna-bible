/* 은혜의말씀 로컬 미리보기 + Web Push API.
 * 정적 파일 + /api/push/* 만 담당한다. production 배포용이 아니다.
 * VAPID private key는 .env.local에서만 읽는다.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '../..');
const STORE_PATH = path.join(ROOT, '.cache', 'gomna-push-store.json');
const ENV_PATH = path.join(ROOT, '.env.local');
const DAILY = require(path.join(ROOT, 'js/gomna-daily-verses.js'));
const PREFS = require(path.join(ROOT, 'js/gomna-push-prefs.js'));
const webpush = require('web-push');
const createMailApi = require('./mail.cjs');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  String(fs.readFileSync(file, 'utf8')).split(/\r?\n/).forEach(function (line) {
    const s = line.trim();
    if (!s || s.charAt(0) === '#') return;
    const i = s.indexOf('=');
    if (i < 1) return;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  });
  return out;
}

const ENV = Object.assign({}, loadEnv(ENV_PATH), process.env);
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

const vapidPublic = ENV.VAPID_PUBLIC_KEY || '';
const vapidPrivate = ENV.VAPID_PRIVATE_KEY || '';
const vapidSubject = ENV.VAPID_SUBJECT || 'https://gomnastudio.com';
if (!vapidPublic || !vapidPrivate) {
  console.error('[push] VAPID keys missing in .env.local');
  process.exit(1);
}
webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json'
};

function blocked(rel) {
  const n = rel.replace(/\\/g, '/').toLowerCase();
  if (n.startsWith('.git/') || n === '.git') return true;
  if (n.startsWith('.env') || n.includes('/.env')) return true;
  if (n.startsWith('.cache/')) return true;
  if (n.includes('node_modules/')) return true;
  if (n.includes('credentials')) return true;
  return false;
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (e) {
    return { subscriptions: {}, sends: {} };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || '')).digest('hex').slice(0, 32);
}

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let n = 0;
    req.on('data', function (c) {
      n += c.length;
      if (n > 200000) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function nativeLocale(raw) {
  const s = String(raw || 'ko').toLowerCase();
  if (s === 'ko' || s === 'en' || s === 'ja' || s === 'zh') return s;
  return 'ko';
}

function keysFromSub(sub) {
  const keys = (sub && sub.keys) || {};
  return {
    endpoint: String((sub && sub.endpoint) || ''),
    p256dh: String(keys.p256dh || sub.p256dh || ''),
    auth: String(keys.auth || sub.auth || '')
  };
}

async function handleSubscribe(req, res) {
  const body = await readBody(req);
  const keys = keysFromSub(body.subscription || body);
  if (!keys.endpoint || !keys.p256dh || !keys.auth) {
    json(res, 400, { ok: false, error: 'invalid-subscription' });
    return;
  }
  const store = readStore();
  const now = new Date().toISOString();
  const hash = endpointHash(keys.endpoint);
  const prev = store.subscriptions[hash] || {};
  const ua = String(req.headers['user-agent'] || '').slice(0, 180);
  const prefs = PREFS.normalizePrefs(Object.assign({}, body, {
    enabled: true,
    timezone: body.timezone || prev.timezone || PREFS.deviceTimezone()
  }), prev);
  store.subscriptions[hash] = {
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    locale: prefs.locale,
    timezone: prefs.timezone,
    frequency: prefs.frequency,
    firstTime: prefs.firstTime,
    secondTime: prefs.secondTime,
    userId: body.userId ? String(body.userId).slice(0, 64) : (prev.userId || null),
    ua: ua,
    createdAt: prev.createdAt || now,
    updatedAt: now,
    active: true
  };
  writeStore(store);
  const host = (function () { try { return new URL(keys.endpoint).host; } catch (e) { return 'unknown'; } })();
  console.log('[push] subscription saved', hash, prefs.locale, prefs.timezone, prefs.frequency, prefs.firstTime, host);
  json(res, 200, { ok: true, id: hash, active: true, preferences: PREFS.normalizePrefs(store.subscriptions[hash], { enabled: true }) });
  const apple = /web\.push\.apple\.com/i.test(keys.endpoint) || /iPhone|iPad|iPod/i.test(ua);
  if (body.sendProbe || apple) {
    sendOne(store.subscriptions[hash], probePayload()).then(function (r) {
      console.log('[push] probe after subscribe', hash, r);
    }).catch(function (err) {
      console.warn('[push] probe after subscribe failed', hash, err && err.message);
    });
  }
}

async function handleUnsubscribe(req, res) {
  const body = await readBody(req);
  const keys = keysFromSub(body.subscription || body);
  const endpoint = keys.endpoint || String(body.endpoint || '');
  if (!endpoint) {
    json(res, 400, { ok: false, error: 'invalid-subscription' });
    return;
  }
  const store = readStore();
  const hash = endpointHash(endpoint);
  if (store.subscriptions[hash]) {
    store.subscriptions[hash].active = false;
    store.subscriptions[hash].updatedAt = new Date().toISOString();
    writeStore(store);
  }
  console.log('[push] subscription inactive', hash);
  json(res, 200, { ok: true, active: false });
}

function sendKey(date, hash, slot) {
  return date + '|' + hash + '|' + slot;
}

function probePayload() {
  return {
    title: '은혜의말씀 테스트',
    body: '푸시 알림 연결 확인',
    lang: 'ko',
    tag: 'gomna-push-probe',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { source: 'home-today', probe: true, url: '/?source=home-today' }
  };
}

function pushObject(row) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
}

async function sendOne(row, payload) {
  try {
    await webpush.sendNotification(pushObject(row), JSON.stringify(payload), { TTL: 60 * 60 * 12 });
    return { ok: true };
  } catch (err) {
    const status = err && (err.statusCode || err.status);
    const message = err && (err.body || err.message);
    if (message) console.warn('[push] provider', status || 0, String(message).slice(0, 180));
    return { ok: false, status: status || 0, expired: status === 404 || status === 410, message: String(message || '').slice(0, 180) };
  }
}

async function handleStatus(req, res) {
  const body = await readBody(req);
  const keys = keysFromSub(body.subscription || body);
  const endpoint = keys.endpoint || String(body.endpoint || '');
  if (!endpoint) {
    json(res, 400, { ok: false, error: 'invalid-subscription' });
    return;
  }
  const store = readStore();
  const hash = endpointHash(endpoint);
  const row = store.subscriptions[hash];
  if (!row) {
    json(res, 200, { ok: true, found: false, active: false, preferences: PREFS.defaults() });
    return;
  }
  json(res, 200, {
    ok: true,
    found: true,
    id: hash,
    active: !!row.active,
    preferences: PREFS.normalizePrefs(row, { enabled: !!row.active })
  });
}

async function handleSend(req, res, mode) {
  const body = await readBody(req).catch(function () { return {}; });
  const now = body.now ? new Date(body.now) : new Date();
  const force = body.force === true || mode === 'test';
  const verseDate = String(body.date || DAILY.kstDateKey(now));
  const store = readStore();
  const rows = Object.keys(store.subscriptions).map(function (k) { return store.subscriptions[k]; });
  let targets = rows.filter(function (r) { return r && r.active; });
  if (mode === 'test') {
    const want = keysFromSub(body.subscription || body).endpoint || body.endpoint;
    if (want) targets = targets.filter(function (r) { return r.endpoint === want; });
    else targets = targets.slice(0, 1);
  }
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deactivated = 0;
  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const prefs = PREFS.normalizePrefs(row, { enabled: true });
    const slots = force
      ? (prefs.frequency === 2 ? ['first', 'second'] : ['first'])
      : PREFS.dueSlots(prefs, now);
    if (!slots.length) continue;
    const localDate = PREFS.localDateKey(prefs.timezone, now);
    const hash = endpointHash(row.endpoint);
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      const payload = (mode === 'test' && body.useTodayWord !== true)
        ? probePayload()
        : DAILY.buildPayload({ date: verseDate, locale: prefs.locale || 'ko', slot: slot });
      const key = sendKey(localDate, hash, slot);
      if (mode !== 'test' && store.sends[key]) {
        skipped += 1;
        continue;
      }
      const result = await sendOne(row, payload);
      if (!result.ok) {
        console.warn('[push] send fail', mode, result.status, hash, slot);
      }
      if (result.ok) {
        sent += 1;
        store.sends[key] = { at: new Date().toISOString(), mode: mode, slot: slot };
      } else {
        failed += 1;
        if (result.expired) {
          row.active = false;
          row.updatedAt = new Date().toISOString();
          deactivated += 1;
        }
      }
    }
  }
  writeStore(store);
  console.log('[push] send', mode, { date: verseDate, sent: sent, skipped: skipped, failed: failed, deactivated: deactivated });
  json(res, 200, { ok: true, mode: mode, date: verseDate, sent: sent, skipped: skipped, failed: failed, deactivated: deactivated });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  rel = rel.replace(/^\/+/, '');
  if (blocked(rel) || rel.includes('..')) {
    res.writeHead(404); res.end(); return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end(); return;
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || rel === 'sw.js' || rel === 'manifest.json') {
      headers['Cache-Control'] = 'no-store';
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

const mailApi = createMailApi({
  root: ROOT,
  daily: DAILY,
  json: json,
  readBody: readBody,
  env: ENV
});

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (mailApi.match(req, url)) {
    Promise.resolve(mailApi.handle(req, res, url)).catch(function (err) {
      console.warn('[mail] handler error', err && err.message);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server' });
    });
    return;
  }
  if (req.method === 'OPTIONS' && url.pathname.indexOf('/api/push/') === 0) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-gomna-push-dev, x-gomna-push-cron'
    });
    res.end();
    return;
  }
  const go = function (fn) {
    Promise.resolve(fn(req, res)).catch(function (err) {
      console.warn('[push] handler error', err && err.message);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server' });
    });
  };
  if (req.method === 'POST' && url.pathname === '/api/push/subscribe') return go(handleSubscribe);
  if (req.method === 'POST' && url.pathname === '/api/push/unsubscribe') return go(handleUnsubscribe);
  if (req.method === 'POST' && url.pathname === '/api/push/status') return go(handleStatus);
  if (req.method === 'POST' && url.pathname === '/api/push/send-test') return go(function (a, b) { return handleSend(a, b, 'test'); });
  if (req.method === 'POST' && url.pathname === '/api/push/send-daily') return go(function (a, b) { return handleSend(a, b, 'daily'); });
  if (req.method === 'POST' && url.pathname === '/api/push/client-state') {
    return go(async function (a, b) {
      const body = await readBody(a).catch(function () { return {}; });
      console.log('[push] client-state', JSON.stringify({
        state: body.state,
        permission: body.permission,
        standalone: body.standalone,
        displayStandalone: body.displayStandalone,
        hasPush: body.hasPush,
        hasController: body.hasController,
        subscribed: body.subscribed,
        js: body.js,
        extra: body.extra,
        href: body.href,
        ua: String(body.ua || a.headers['user-agent'] || '').slice(0, 120)
      }));
      json(b, 200, { ok: true });
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/push/health') {
    return json(res, 200, { ok: true, vapid: !!vapidPublic, verse: DAILY.getVerseForDate(DAILY.kstDateKey()).r });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
  res.writeHead(405); res.end();
});

server.listen(PORT, HOST, function () {
  console.log('[push] local server http://127.0.0.1:' + PORT + '/');
  console.log('[push] today', DAILY.kstDateKey(), DAILY.getVerseForDate(DAILY.kstDateKey()).r);
});
