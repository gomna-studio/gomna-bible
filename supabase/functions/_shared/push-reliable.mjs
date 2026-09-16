/** Reliable production scheduler. This module has no test-target dependency. */
export const MAX_CATCHUP_MINUTES = 30;
export const MAX_SEND_ATTEMPTS = 3;
export const CLAIM_STALE_MS = 5 * 60 * 1000;
export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 12];
export const PRODUCTION_CRON_JOB = 'gomna-push-send-daily-every-minute';
export const PRODUCTION_VAULT_SECRETS = [
  'gomna_push_daily_function_url',
  'gomna_push_cron_secret',
  'gomna_push_gateway_apikey'
];

const SLOT_RE = /^(?:first|second|manual|interval-([01][0-9]|2[0-3])[0-5][0-9])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');

export function parseTime(raw) {
  const match = String(raw == null ? '' : raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m, hhmm: pad2(h) + ':' + pad2(m) };
}

export function isValidTimeZone(raw) {
  const timezone = String(raw || '').trim();
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date, timezone) {
  if (!isValidTimeZone(timezone)) throw new Error('invalid_timezone');
  const values = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return {
    y: Number(values.year), month: Number(values.month), day: Number(values.day),
    h: Number(values.hour), m: Number(values.minute), s: Number(values.second || 0)
  };
}

export function localDateKey(timezone, date) {
  const p = zonedParts(date, timezone);
  return p.y + '-' + pad2(p.month) + '-' + pad2(p.day);
}

function shiftDate(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12));
  return shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate());
}

function zonedLocalToUtcMs(dateKey, hhmm, timezone) {
  const [y, month, day] = dateKey.split('-').map(Number);
  const time = parseTime(hhmm);
  if (!time) return null;
  const wanted = Date.UTC(y, month - 1, day, time.h, time.m);
  let utc = wanted;
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(utc), timezone);
    const shown = Date.UTC(p.y, p.month - 1, p.day, p.h, p.m);
    utc = wanted - (shown - utc);
  }
  const check = zonedParts(new Date(utc), timezone);
  return check.y === y && check.month === month && check.day === day && check.h === time.h && check.m === time.m
    ? utc : null;
}

function nativeLocale(raw) {
  const locale = String(raw || 'ko').toLowerCase();
  return ['ko', 'en', 'ja', 'zh'].includes(locale) ? locale : 'ko';
}

export function readPrefs(row) {
  const reasons = [];
  const timezone = String(row && row.timezone || '').trim();
  if (!isValidTimeZone(timezone)) reasons.push('invalid_timezone');
  const scheduleMode = String(row && row.schedule_mode || 'fixed') === 'interval' ? 'interval' : 'fixed';
  const frequency = Number(row && row.frequency) === 2 ? 2 : 1;
  const first = parseTime(row && row.first_send_time);
  const second = parseTime(row && row.second_send_time);
  const start = parseTime(row && row.interval_start_time);
  const end = parseTime(row && row.interval_end_time);
  const intervalHours = Number(row && row.interval_hours);
  if (!first) reasons.push('invalid_first_send_time');
  if (frequency === 2 && !second) reasons.push('invalid_second_send_time');
  if (scheduleMode === 'interval') {
    if (!INTERVAL_HOURS.includes(intervalHours)) reasons.push('invalid_interval_hours');
    if (!start) reasons.push('invalid_interval_start_time');
    if (!end) reasons.push('invalid_interval_end_time');
    if (start && end && start.h * 60 + start.m >= end.h * 60 + end.m) reasons.push('invalid_interval_range');
  }
  return {
    ok: reasons.length === 0,
    reason: reasons[0] || null,
    reasons,
    prefs: {
      scheduleMode, frequency, timezone, intervalHours,
      firstTime: first && first.hhmm,
      secondTime: second && second.hhmm,
      intervalStartTime: start && start.hhmm,
      intervalEndTime: end && end.hhmm,
      locale: nativeLocale(row && row.locale)
    }
  };
}

function slotDefinitions(prefs) {
  if (prefs.scheduleMode !== 'interval') {
    const out = [{ slot: 'first', hhmm: prefs.firstTime }];
    if (prefs.frequency === 2 && prefs.secondTime !== prefs.firstTime) out.push({ slot: 'second', hhmm: prefs.secondTime });
    return out;
  }
  const start = parseTime(prefs.intervalStartTime);
  const end = parseTime(prefs.intervalEndTime);
  if (!start || !end) return [];
  const from = start.h * 60 + start.m;
  const to = end.h * 60 + end.m;
  const out = [];
  for (let minute = from; minute <= to; minute += prefs.intervalHours * 60) {
    const hh = pad2(Math.floor(minute / 60));
    const mm = pad2(minute % 60);
    out.push({ slot: 'interval-' + hh + mm, hhmm: hh + ':' + mm });
  }
  return out;
}

export function evaluateDueSlots(prefs, now, catchupMinutes = MAX_CATCHUP_MINUTES) {
  if (!isValidTimeZone(prefs.timezone)) return { ok: false, reason: 'invalid_timezone', slots: [] };
  const nowMs = now.getTime();
  const today = localDateKey(prefs.timezone, now);
  const slots = [];
  for (const dayOffset of [0, -1]) {
    const sendDate = shiftDate(today, dayOffset);
    for (const def of slotDefinitions(prefs)) {
      const scheduled = zonedLocalToUtcMs(sendDate, def.hhmm, prefs.timezone);
      if (scheduled == null) continue;
      const delayMinutes = (nowMs - scheduled) / 60000;
      if (delayMinutes >= 0 && delayMinutes < catchupMinutes) {
        slots.push({ slot: def.slot, sendDate, localTime: def.hhmm, delayMinutes });
      }
    }
  }
  return { ok: true, reason: null, slots };
}

export function classifySendError(statusCode, error) {
  const status = Number(statusCode) || 0;
  if (status === 404 || status === 410) return 'gone';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  if (!status && error) return 'network_error';
  return status ? 'unknown' : 'network_error';
}

export function isRetryableError(kind) {
  return ['rate_limited', 'server_error', 'network_error'].includes(kind);
}

export function applyClaimDecision(existing, nowMs) {
  if (!existing) return { action: 'insert' };
  if (existing.status === 'sent') return { action: 'skip', reason: 'already_sent' };
  if (Number(existing.attemptCount) >= MAX_SEND_ATTEMPTS) return { action: 'skip', reason: 'attempts_exhausted' };
  if (existing.status === 'failed') return { action: 'retry', reason: 'failed' };
  if (existing.status === 'claimed' && nowMs - Number(existing.claimedAt) >= CLAIM_STALE_MS) return { action: 'retry', reason: 'stale_claim' };
  if (existing.status === 'claimed') return { action: 'skip', reason: 'in_flight' };
  return { action: 'skip', reason: 'invalid_status' };
}

export function applyStatusWrite(row, expectedAttempt) {
  if (!row) return { ok: false, reason: 'missing_row' };
  if (row.status !== 'claimed') return { ok: false, reason: 'not_claimed' };
  if (Number(row.attemptCount) !== Number(expectedAttempt)) return { ok: false, reason: 'attempt_mismatch' };
  return { ok: true };
}

export function createMemorySendStore() {
  const rows = new Map();
  const keyOf = (date, hash, slot) => date + '|' + hash + '|' + slot;
  return {
    rows,
    peek(date, hash, slot) { return rows.get(keyOf(date, hash, slot)) || null; },
    claim({ sendDate, endpointHash, slot, localTime, now }) {
      const key = keyOf(sendDate, endpointHash, slot);
      const existing = rows.get(key) || null;
      const decision = applyClaimDecision(existing, now.getTime());
      if (decision.action === 'skip') return { status: 'already', reason: decision.reason, attemptCount: existing ? existing.attemptCount : 0 };
      if (decision.action === 'insert') {
        rows.set(key, { status: 'claimed', attemptCount: 1, claimedAt: now.getTime(), localTime });
        return { status: 'new', key, attemptCount: 1 };
      }
      existing.status = 'claimed';
      existing.attemptCount += 1;
      existing.claimedAt = now.getTime();
      return { status: 'retry', key, attemptCount: existing.attemptCount };
    },
    markSent(key, now, claim) {
      const row = rows.get(key);
      const allowed = applyStatusWrite(row, claim.attemptCount);
      if (!allowed.ok) return allowed;
      row.status = 'sent'; row.sentAt = now.getTime();
      return { ok: true };
    },
    markFailed(key, result, claim) {
      const row = rows.get(key);
      const allowed = applyStatusWrite(row, claim.attemptCount);
      if (!allowed.ok) return allowed;
      row.status = 'failed'; row.errorKind = result.errorKind;
      if (!isRetryableError(result.errorKind)) row.attemptCount = MAX_SEND_ATTEMPTS;
      return { ok: true };
    }
  };
}

export function buildProductionPayload(productionBuild, opts) {
  const slot = String(opts && opts.slot || '');
  const date = String(opts && opts.date || '');
  if (!SLOT_RE.test(slot)) return { ok: false, reason: 'invalid_slot', payload: null };
  if (!DATE_RE.test(date)) return { ok: false, reason: 'invalid_date', payload: null };
  const base = productionBuild({ date, locale: opts.locale, slot: slot === 'second' ? 'second' : 'first' });
  return {
    ok: true,
    payload: {
      ...base,
      tag: 'gomna-today-' + date + '-' + slot,
      data: { ...(base && base.data), date, slot }
    }
  };
}

function finish(result) {
  if (result.storageErrors.length) return { ...result, ok: false, error: 'storage_failed', failureClass: 'storage' };
  if (!result.dryRun && result.attempted > 0 && result.sent === 0) return { ...result, ok: false, error: 'push_failed', failureClass: 'push' };
  return { ...result, ok: true, error: null, failureClass: 'none' };
}

export async function runProductionSend(input) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const dryRun = input.dryRun === true;
  const rows = Array.isArray(input.subscriptions) ? input.subscriptions : [];
  const counts = { scanned: rows.length, active: 0, due: 0, notDue: 0, invalidPreferences: 0, alreadySent: 0, claimed: 0, attempted: 0, sent: 0, failed: 0, deactivated: 0, retried: 0 };
  const exclusions = [], failures = [], dueDetails = [], storageErrors = [];
  const active = rows.filter((row) => row && row.active !== false);
  counts.active = active.length;

  for (const row of active) {
    const parsed = readPrefs(row);
    if (!parsed.ok) {
      counts.invalidPreferences += 1;
      exclusions.push({ endpoint_hash: row.endpoint_hash, reason: parsed.reason, reasons: parsed.reasons });
      continue;
    }
    const current = zonedParts(now, parsed.prefs.timezone);
    const evaluated = input.force === true
      ? { ok: true, reason: null, slots: [{
        slot: 'manual',
        sendDate: localDateKey(parsed.prefs.timezone, now),
        localTime: pad2(current.h) + ':' + pad2(current.m),
        delayMinutes: 0
      }] }
      : evaluateDueSlots(parsed.prefs, now, input.maxCatchup == null ? MAX_CATCHUP_MINUTES : input.maxCatchup);
    if (!evaluated.ok) {
      counts.invalidPreferences += 1;
      exclusions.push({ endpoint_hash: row.endpoint_hash, reason: evaluated.reason });
      continue;
    }
    if (!evaluated.slots.length) {
      counts.notDue += 1;
      continue;
    }
    for (const slotInfo of evaluated.slots) {
      counts.due += 1;
      const detail = { endpoint_hash: row.endpoint_hash, ...slotInfo, locale: parsed.prefs.locale };
      if (dryRun) {
        let existing;
        try { existing = await input.store.peek(slotInfo.sendDate, row.endpoint_hash, slotInfo.slot); }
        catch {
          storageErrors.push({ op: 'peek', endpoint_hash: row.endpoint_hash, slot: slotInfo.slot });
          continue;
        }
        const decision = applyClaimDecision(existing, now.getTime());
        detail.disposition = decision.action === 'insert' ? 'will_send' : decision.action === 'retry' ? 'will_retry' : decision.reason;
        dueDetails.push(detail);
        if (decision.reason === 'already_sent') counts.alreadySent += 1;
        continue;
      }
      dueDetails.push(detail);
      let claim;
      try {
        claim = await input.store.claim({ sendDate: slotInfo.sendDate, endpointHash: row.endpoint_hash, slot: slotInfo.slot, localTime: slotInfo.localTime, now });
      } catch {
        storageErrors.push({ op: 'claim', endpoint_hash: row.endpoint_hash, slot: slotInfo.slot });
        continue;
      }
      if (claim.status === 'already') {
        counts.alreadySent += 1;
        exclusions.push({ endpoint_hash: row.endpoint_hash, slot: slotInfo.slot, reason: claim.reason });
        continue;
      }
      counts.claimed += 1;
      if (claim.status === 'retry') counts.retried += 1;
      counts.attempted += 1;
      let built;
      try {
        built = buildProductionPayload(input.buildPayload, {
          date: input.payloadDate || slotInfo.sendDate,
          locale: parsed.prefs.locale,
          slot: slotInfo.slot
        });
      } catch {
        built = { ok: false, reason: 'payload_builder_threw', payload: null };
      }
      if (!built.ok) {
        storageErrors.push({ op: 'buildPayload', endpoint_hash: row.endpoint_hash, slot: slotInfo.slot, reason: built.reason });
        continue;
      }
      let sendResult;
      try { sendResult = await input.sendPush(row, built.payload); }
      catch (error) { sendResult = { ok: false, statusCode: 0, errorKind: classifySendError(0, error) }; }
      const claimRef = { attemptCount: claim.attemptCount };
      if (sendResult && sendResult.ok) {
        let saved;
        try { saved = await input.store.markSent(claim.key, now, claimRef); }
        catch { saved = { ok: false, reason: 'storage_threw' }; }
        if (!saved || !saved.ok) storageErrors.push({ op: 'markSent', endpoint_hash: row.endpoint_hash, slot: slotInfo.slot });
        else counts.sent += 1;
        continue;
      }
      const statusCode = Number(sendResult && sendResult.statusCode) || 0;
      const errorKind = sendResult && sendResult.errorKind || classifySendError(statusCode, sendResult && sendResult.error);
      let saved;
      try { saved = await input.store.markFailed(claim.key, { statusCode, errorKind }, claimRef); }
      catch { saved = { ok: false, reason: 'storage_threw' }; }
      if (!saved || !saved.ok) storageErrors.push({ op: 'markFailed', endpoint_hash: row.endpoint_hash, slot: slotInfo.slot });
      else {
        counts.failed += 1;
        failures.push({ endpoint_hash: row.endpoint_hash, slot: slotInfo.slot, errorKind, httpStatus: statusCode, attemptCount: claim.attemptCount });
      }
      if ((statusCode === 404 || statusCode === 410 || errorKind === 'gone') && saved && saved.ok) {
        const deactivated = await input.deactivate(row.endpoint_hash).catch(() => ({ ok: false }));
        if (deactivated && deactivated.ok) counts.deactivated += 1;
        else storageErrors.push({ op: 'deactivate', endpoint_hash: row.endpoint_hash });
      }
    }
  }
  return finish({ dryRun, catchUpMinutes: MAX_CATCHUP_MINUTES, ...counts, exclusions, failures, dueDetails, storageErrors });
}
