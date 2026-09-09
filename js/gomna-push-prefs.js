/*! 은혜의말씀 — 푸시 알림 시간/횟수 공통 설정.
 * iPhone / Android / MacBook이 같은 pushPreferences 객체를 쓴다.
 */
(function (root) {
  'use strict';
  var DEFAULT_FIRST = '07:30';
  var DEFAULT_SECOND = '20:30';
  var WINDOW_MIN = 15;
  var PRESETS = ['06:00', '07:30', '09:00'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function nativeLocale(raw) {
    var s = String(raw || 'ko').toLowerCase();
    if (s === 'ko' || s === 'en' || s === 'ja' || s === 'zh') return s;
    if (s.indexOf('zh') === 0) return 'zh';
    if (s.indexOf('ja') === 0) return 'ja';
    if (s.indexOf('en') === 0) return 'en';
    return 'ko';
  }

  function parseTime(raw) {
    var m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = Number(m[1]);
    var mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return { h: h, m: mi, hhmm: pad2(h) + ':' + pad2(mi) };
  }

  function normalizeTime(raw, fallback) {
    var p = parseTime(raw);
    if (p) return p.hhmm;
    var fb = parseTime(fallback);
    return fb ? fb.hhmm : DEFAULT_FIRST;
  }

  function deviceTimezone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && String(tz).length < 64) return String(tz);
    } catch (e) {}
    return 'UTC';
  }

  function defaults(extra) {
    extra = extra || {};
    return {
      enabled: false,
      frequency: 1,
      firstTime: DEFAULT_FIRST,
      secondTime: DEFAULT_SECOND,
      timezone: extra.timezone || deviceTimezone(),
      locale: nativeLocale(extra.locale)
    };
  }

  function normalizePrefs(raw, prev) {
    raw = raw || {};
    prev = prev || {};
    var freq = Number(raw.frequency != null ? raw.frequency : prev.frequency);
    if (freq !== 2) freq = 1;
    var tz = String(raw.timezone || prev.timezone || '').trim().slice(0, 64);
    if (!tz) tz = deviceTimezone();
    return {
      enabled: raw.enabled != null ? !!raw.enabled : (prev.enabled != null ? !!prev.enabled : false),
      frequency: freq,
      firstTime: normalizeTime(raw.firstTime || raw.first_send_time, prev.firstTime || prev.first_send_time || DEFAULT_FIRST),
      secondTime: normalizeTime(raw.secondTime || raw.second_send_time, prev.secondTime || prev.second_send_time || DEFAULT_SECOND),
      timezone: tz,
      locale: nativeLocale(raw.locale || prev.locale)
    };
  }

  function zonedParts(date, tz) {
    date = date || new Date();
    try {
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
      var map = {};
      fmt.formatToParts(date).forEach(function (p) {
        if (p.type !== 'literal') map[p.type] = p.value;
      });
      return {
        y: Number(map.year),
        m: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute)
      };
    } catch (e) {
      if (tz && tz !== 'UTC') return zonedParts(date, 'UTC');
      var d = date instanceof Date ? date : new Date();
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
    }
  }

  function localDateKey(tz, date) {
    var p = zonedParts(date, tz);
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.day);
  }

  function localMinutes(tz, date) {
    var p = zonedParts(date, tz);
    return p.hour * 60 + p.minute;
  }

  function timeToMinutes(hhmm) {
    var p = parseTime(hhmm);
    return p ? p.h * 60 + p.m : 0;
  }

  function inWindow(nowMin, targetMin, windowMin) {
    var diff = (nowMin - targetMin + 1440) % 1440;
    return diff < windowMin;
  }

  function dueSlots(prefs, now, windowMin) {
    windowMin = windowMin == null ? WINDOW_MIN : windowMin;
    prefs = normalizePrefs(prefs);
    var nowMin = localMinutes(prefs.timezone, now || new Date());
    var out = [];
    if (inWindow(nowMin, timeToMinutes(prefs.firstTime), windowMin)) out.push('first');
    if (prefs.frequency === 2 && prefs.secondTime !== prefs.firstTime && inWindow(nowMin, timeToMinutes(prefs.secondTime), windowMin)) out.push('second');
    return out;
  }

  function formatClock(hhmm, locale) {
    var p = parseTime(hhmm) || parseTime(DEFAULT_FIRST);
    var d = new Date(2020, 0, 1, p.h, p.m);
    var loc = nativeLocale(locale);
    var tag = loc === 'en' ? 'en-US' : loc === 'ja' ? 'ja-JP' : loc === 'zh' ? 'zh-CN' : 'ko-KR';
    try {
      return d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return p.hhmm;
    }
  }

  function isPreset(hhmm) {
    return PRESETS.indexOf(normalizeTime(hhmm, DEFAULT_FIRST)) !== -1;
  }

  var SECOND_TITLES = {
    ko: '오늘의 말씀을 다시 묵상해보세요',
    en: 'Meditate on today’s Word again',
    ja: '今日のみことばをもう一度黙想してみましょう',
    zh: '再默想一次今日的话语'
  };

  var api = {
    DEFAULT_FIRST: DEFAULT_FIRST,
    DEFAULT_SECOND: DEFAULT_SECOND,
    WINDOW_MIN: WINDOW_MIN,
    PRESETS: PRESETS,
    SECOND_TITLES: SECOND_TITLES,
    nativeLocale: nativeLocale,
    parseTime: parseTime,
    normalizeTime: normalizeTime,
    deviceTimezone: deviceTimezone,
    defaults: defaults,
    normalizePrefs: normalizePrefs,
    zonedParts: zonedParts,
    localDateKey: localDateKey,
    localMinutes: localMinutes,
    dueSlots: dueSlots,
    formatClock: formatClock,
    isPreset: isPreset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GomnaPushPrefs = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
