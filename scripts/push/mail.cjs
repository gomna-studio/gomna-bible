'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createMailApi(opts) {
  const ROOT = opts.root;
  const DAILY = opts.daily;
  const json = opts.json;
  const readBody = opts.readBody;
  const env = opts.env || {};
  const STORE_PATH = path.join(ROOT, '.cache', 'gomna-mail-store.json');

  function readStore() {
    try {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (e) {
      return { subscribers: {}, sends: {} };
    }
  }
  function writeStore(store) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  }
  function emailHash(email) {
    return crypto.createHash('sha256').update(String(email || '')).digest('hex').slice(0, 32);
  }
  function unsubSecret() {
    return String(env.MAIL_UNSUB_SECRET || env.PUSH_CRON_SECRET || env.PUSH_DEV_SECRET || 'gomna-local-mail');
  }
  function unsubToken(email) {
    return crypto.createHmac('sha256', unsubSecret()).update(String(email || '')).digest('hex').slice(0, 32);
  }
  function findByToken(store, token) {
    const keys = Object.keys(store.subscribers || {});
    for (let i = 0; i < keys.length; i++) {
      const row = store.subscribers[keys[i]];
      if (row && unsubToken(row.email) === token) return row;
    }
    return null;
  }
  function normalizeEmail(raw) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e || e.length > 254) return '';
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(e)) return '';
    return e;
  }
  function nativeLocale(raw) {
    const s = String(raw || 'ko').toLowerCase();
    if (s === 'ko' || s === 'en' || s === 'ja' || s === 'zh') return s;
    return 'ko';
  }
  function appOrigin(req) {
    const forced = String(env.MAIL_APP_ORIGIN || '').replace(/\/$/, '');
    if (forced) return forced;
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:8000').split(',')[0].trim();
    return proto + '://' + host;
  }
  function viewUrl(origin, verse) {
    const u = new URL(origin + '/');
    u.searchParams.set('source', 'home-today');
    u.searchParams.set('date', verse.date);
    u.searchParams.set('book', verse.book);
    u.searchParams.set('chapter', String(verse.chapter));
    u.searchParams.set('start', String(verse.startVerse));
    u.searchParams.set('end', String(verse.endVerse));
    return u.toString();
  }
  function unsubUrl(origin, email) {
    return origin + '/api/mail/unsubscribe?t=' + encodeURIComponent(unsubToken(email));
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function wrapHtml(inner) {
    return '<!DOCTYPE html><html lang="ko"><body style="margin:0;padding:24px;background:#FCFAF6;color:#152033;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Noto Sans KR\',sans-serif;">'
      + '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;">'
      + inner
      + '</div></body></html>';
  }
  function brandBlock() {
    return '<p style="margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em;">은혜의말씀</p>'
      + '<p style="margin:4px 0 0;font-size:13px;color:#8a929c;font-style:italic;">Words of Grace</p>';
  }
  function testMail() {
    const html = wrapHtml(
      brandBlock()
      + '<p style="margin:22px 0 0;font-size:16px;line-height:1.6;">오늘의 말씀 이메일 연결이 완료되었습니다.</p>'
    );
    return {
      subject: '은혜의말씀 이메일 테스트',
      text: '오늘의 말씀 이메일 연결이 완료되었습니다.',
      html: html
    };
  }
  function todayMail(origin, email, locale, date) {
    const verse = DAILY.resolveVerse({ date: date, locale: locale });
    const href = viewUrl(origin, verse);
    const unsub = unsubUrl(origin, email);
    const refLine = verse.refText + ' · ' + verse.bibleVersion;
    const html = wrapHtml(
      brandBlock()
      + '<p style="margin:22px 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;color:#5b6573;">오늘의 말씀</p>'
      + '<p style="margin:0 0 12px;font-size:15px;font-weight:650;">' + escapeHtml(refLine) + '</p>'
      + '<p style="margin:0 0 24px;font-size:16px;line-height:1.65;">' + escapeHtml(verse.body) + '</p>'
      + '<p style="margin:0;"><a href="' + escapeHtml(href) + '" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#1A2332;color:#ffffff;text-decoration:none;font-weight:700;">은혜의말씀에서 보기</a></p>'
      + '<p style="margin:28px 0 8px;font-size:12px;line-height:1.5;color:#8a929c;">이 이메일은 오늘의 말씀 수신 신청에 따라 발송되었습니다.</p>'
      + '<p style="margin:0;"><a href="' + escapeHtml(unsub) + '" style="font-size:12px;color:#8a929c;">수신 해지</a></p>'
    );
    const text = ['은혜의말씀', 'Words of Grace', '', '오늘의 말씀', refLine, '', verse.body, '', href, '', '수신 해지: ' + unsub].join('\n');
    return { subject: '오늘의 말씀 · ' + verse.refText, text: text, html: html, verseId: verse.verseId, verse: verse };
  }
  async function sendViaResend(to, mail) {
    const key = String(env.RESEND_API_KEY || '');
    const from = String(env.MAIL_FROM || '은혜의말씀 <beth.t@example.com>');
    if (!key) return { ok: false, code: 'provider-missing' };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      })
    });
    const body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const msg = String((body && (body.message || body.error)) || res.status);
      return { ok: false, code: 'send-failed', status: res.status, message: msg.slice(0, 180), invalid: res.status === 422 || /invalid/i.test(msg) };
    }
    return { ok: true, id: String(body.id || '') };
  }
  function authorized(req, kind) {
    const cron = String(env.MAIL_CRON_SECRET || env.PUSH_CRON_SECRET || '');
    const dev = String(env.MAIL_DEV_SECRET || env.PUSH_DEV_SECRET || '');
    const header = String(req.headers['x-gomna-mail-cron'] || req.headers['x-gomna-push-cron'] || req.headers['x-gomna-mail-dev'] || req.headers['x-gomna-push-dev'] || '');
    if (kind === 'daily') return !!cron && header === cron;
    if (kind === 'test') return !!dev && header === dev;
    return false;
  }
  function deactivate(store, row, now) {
    row.active = false;
    row.updatedAt = now;
    row.unsubscribedAt = now;
  }
  async function handleSubscribe(req, res) {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!email) return json(res, 400, { ok: false, error: 'invalid-email' });
    if (body.consent !== true && body.consent !== '1' && body.consent !== 1) {
      return json(res, 400, { ok: false, error: 'consent-required' });
    }
    const store = readStore();
    const id = emailHash(email);
    const now = new Date().toISOString();
    const prev = store.subscribers[id] || {};
    const already = !!(prev.email && prev.active);
    store.subscribers[id] = {
      id: id,
      email: email,
      active: true,
      locale: nativeLocale(body.locale || prev.locale),
      timezone: String(body.timezone || prev.timezone || 'Asia/Seoul').slice(0, 64),
      userId: body.userId ? String(body.userId).slice(0, 64) : (prev.userId || null),
      consentedAt: prev.consentedAt || now,
      createdAt: prev.createdAt || now,
      updatedAt: now,
      unsubscribedAt: null
    };
    writeStore(store);
    let mailed = false;
    if (!already) {
      const result = await sendViaResend(email, testMail());
      mailed = !!result.ok;
      if (!result.ok) console.warn('[mail] welcome send failed', id, result.code, result.message || '');
    }
    json(res, 200, { ok: true, active: true, already: already, mailed: mailed });
  }
  async function handleStatus(req, res) {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!email) return json(res, 200, { ok: true, active: false });
    const row = readStore().subscribers[emailHash(email)];
    json(res, 200, { ok: true, active: !!(row && row.active), email: email });
  }
  function unsubscribeRow(store, row) {
    const now = new Date().toISOString();
    deactivate(store, row, now);
    writeStore(store);
  }
  async function handleUnsubscribePost(req, res) {
    const body = await readBody(req);
    const store = readStore();
    let row = null;
    const token = String(body.t || body.token || '');
    const email = normalizeEmail(body.email);
    if (token) row = findByToken(store, token);
    else if (email) row = store.subscribers[emailHash(email)];
    if (!row) return json(res, 200, { ok: true, active: false });
    unsubscribeRow(store, row);
    json(res, 200, { ok: true, active: false });
  }
  function unsubPage(ok) {
    const msg = ok ? '오늘의 말씀 이메일 수신이 해지되었습니다.' : '수신 해지 링크를 확인해 주세요.';
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>은혜의말씀</title></head>'
      + '<body style="margin:0;padding:48px 24px;background:#FCFAF6;color:#152033;font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;text-align:center;">'
      + '<p style="font-size:18px;font-weight:800;">은혜의말씀</p>'
      + '<p style="font-size:15px;line-height:1.6;">' + msg + '</p>'
      + '<p><a href="/" style="color:#152033;">홈으로</a></p></body></html>';
  }
  function handleUnsubscribeGet(req, res, url) {
    const token = String(url.searchParams.get('t') || '');
    const store = readStore();
    const row = token ? findByToken(store, token) : null;
    if (row) unsubscribeRow(store, row);
    const html = unsubPage(!!row);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  }
  async function sendBatch(req, res, mode) {
    if (!authorized(req, mode === 'daily' ? 'daily' : 'test')) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const body = await readBody(req).catch(function () { return {}; });
    const date = String(body.date || DAILY.kstDateKey());
    const origin = String(env.MAIL_APP_ORIGIN || appOrigin(req)).replace(/\/$/, '');
    const store = readStore();
    let targets = Object.keys(store.subscribers).map(function (k) { return store.subscribers[k]; }).filter(function (r) { return r && r.active; });
    if (mode === 'test') {
      const want = normalizeEmail(body.email);
      if (want) targets = targets.filter(function (r) { return r.email === want; });
      else targets = targets.slice(0, 1);
    }
    let sent = 0, skipped = 0, failed = 0, deactivated = 0;
    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      const mail = mode === 'test' && body.welcome === true
        ? Object.assign(testMail(), { verseId: 'welcome' })
        : todayMail(origin, row.email, row.locale, date);
      const key = date + '|' + row.id + '|' + (mail.verseId || 'today');
      if (mode !== 'test' && store.sends[key]) { skipped += 1; continue; }
      const result = await sendViaResend(row.email, mail);
      const log = {
        subscriber: row.id,
        date: date,
        verseId: mail.verseId || '',
        status: result.ok ? 'sent' : 'failed',
        providerId: result.id || '',
        sentAt: new Date().toISOString(),
        error: result.ok ? '' : String(result.code || result.message || '')
      };
      if (result.ok) {
        sent += 1;
        store.sends[key] = log;
      } else {
        failed += 1;
        store.sends[key + '|fail|' + Date.now()] = log;
        console.warn('[mail] send fail', mode, row.id, result.code, result.message || '');
        if (result.invalid) {
          deactivate(store, row, log.sentAt);
          deactivated += 1;
        }
      }
    }
    writeStore(store);
    console.log('[mail] send', mode, { date: date, sent: sent, skipped: skipped, failed: failed, deactivated: deactivated });
    json(res, 200, { ok: true, mode: mode, date: date, sent: sent, skipped: skipped, failed: failed, deactivated: deactivated });
  }
  function match(req, url) {
    return url.pathname.indexOf('/api/mail/') === 0;
  }
  function handle(req, res, url) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-gomna-mail-cron, x-gomna-mail-dev, x-gomna-push-cron, x-gomna-push-dev'
      });
      res.end();
      return Promise.resolve();
    }
    if (req.method === 'GET' && url.pathname === '/api/mail/unsubscribe') {
      handleUnsubscribeGet(req, res, url);
      return Promise.resolve();
    }
    if (req.method === 'GET' && url.pathname === '/api/mail/health') {
      json(res, 200, { ok: true, provider: !!env.RESEND_API_KEY, verse: DAILY.getVerseForDate(DAILY.kstDateKey()).r });
      return Promise.resolve();
    }
    if (req.method !== 'POST') {
      res.writeHead(405); res.end();
      return Promise.resolve();
    }
    if (url.pathname === '/api/mail/subscribe') return handleSubscribe(req, res);
    if (url.pathname === '/api/mail/status') return handleStatus(req, res);
    if (url.pathname === '/api/mail/unsubscribe') return handleUnsubscribePost(req, res);
    if (url.pathname === '/api/mail/send-test') return sendBatch(req, res, 'test');
    if (url.pathname === '/api/mail/send-daily') return sendBatch(req, res, 'daily');
    res.writeHead(404); res.end();
    return Promise.resolve();
  }
  return {
    match: match,
    handle: handle,
    normalizeEmail: normalizeEmail,
    todayMail: todayMail,
    testMail: testMail
  };
}

module.exports = createMailApi;
