export const DEFAULT_FIRST = '07:30';
export const DEFAULT_SECOND = '20:30';
export const WINDOW_MIN = 15;

function pad2(n: number) {
  return (n < 10 ? '0' : '') + String(n);
}

export function parseTime(raw: unknown): { h: number; m: number; hhmm: string } | null {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi, hhmm: pad2(h) + ':' + pad2(mi) };
}

export function normalizeTime(raw: unknown, fallback = DEFAULT_FIRST): string {
  return parseTime(raw)?.hhmm || parseTime(fallback)?.hhmm || DEFAULT_FIRST;
}

export type PushPrefs = {
  enabled: boolean;
  frequency: 1 | 2;
  firstTime: string;
  secondTime: string;
  timezone: string;
  locale: string;
};

export function normalizePrefs(raw: Record<string, unknown> | null | undefined, prev: Record<string, unknown> = {}): PushPrefs {
  const src = raw || {};
  const freq = Number(src.frequency != null ? src.frequency : prev.frequency) === 2 ? 2 : 1;
  const tz = String(src.timezone || prev.timezone || 'UTC').trim().slice(0, 64) || 'UTC';
  const loc = String(src.locale || prev.locale || 'ko').toLowerCase();
  const locale = loc === 'en' || loc === 'ja' || loc === 'zh' || loc === 'ko' ? loc : 'ko';
  return {
    enabled: src.enabled != null ? !!src.enabled : (prev.enabled != null ? !!prev.enabled : false),
    frequency: freq,
    firstTime: normalizeTime(src.firstTime || src.first_send_time, String(prev.firstTime || prev.first_send_time || DEFAULT_FIRST)),
    secondTime: normalizeTime(src.secondTime || src.second_send_time, String(prev.secondTime || prev.second_send_time || DEFAULT_SECOND)),
    timezone: tz,
    locale
  };
}

function zonedParts(date: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const map: Record<string, string> = {};
    fmt.formatToParts(date).forEach((p) => {
      if (p.type !== 'literal') map[p.type] = p.value;
    });
    return {
      y: Number(map.year),
      m: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute)
    };
  } catch {
    if (tz !== 'UTC') return zonedParts(date, 'UTC');
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes()
    };
  }
}

export function localDateKey(tz: string, date = new Date()): string {
  const p = zonedParts(date, tz);
  return p.y + '-' + pad2(p.m) + '-' + pad2(p.day);
}

function timeToMinutes(hhmm: string) {
  const p = parseTime(hhmm);
  return p ? p.h * 60 + p.m : 0;
}

export function dueSlots(prefs: PushPrefs, now = new Date(), windowMin = WINDOW_MIN): Array<'first' | 'second'> {
  const p = zonedParts(now, prefs.timezone);
  const nowMin = p.hour * 60 + p.minute;
  const inWindow = (target: string) => ((nowMin - timeToMinutes(target) + 1440) % 1440) < windowMin;
  const out: Array<'first' | 'second'> = [];
  if (inWindow(prefs.firstTime)) out.push('first');
  if (prefs.frequency === 2 && prefs.secondTime !== prefs.firstTime && inWindow(prefs.secondTime)) out.push('second');
  return out;
}

export function prefsFromRow(row: Record<string, unknown>): PushPrefs {
  return normalizePrefs({
    enabled: row.active,
    frequency: row.frequency,
    firstTime: row.first_send_time,
    secondTime: row.second_send_time,
    timezone: row.timezone,
    locale: row.locale
  });
}
