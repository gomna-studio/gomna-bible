/**
 * Isolated today-word push scheduler for the reliable-test function.
 * Do not import this from production push-send-daily.
 *
 * MAX_CATCHUP_MINUTES = 30
 * Why: GitHub Actions can skip or delay scheduled jobs for hours, and the
 * production 15-minute window then drops that day's send forever. This test
 * clock is 1-minute Supabase Cron, so typical jitter is seconds. The tightest
 * repeating interval is 1 hour, so catch-up must stay under 60 minutes or the
 * next slot could collide. 30 minutes is half that interval: enough to cover a
 * short Cron/pg_net outage or deploy, not enough for a 06:58 morning Word to
 * arrive hours later.
 *
 * PG_NET_TIMEOUT_MS = 240000 (4 minutes)
 * Why: the trial may send to 32 devices sequentially, each with a web-push
 * HTTP round-trip plus claim writes. 15 seconds is below 32 × 0.5s already.
 * 4 minutes leaves ~7.5s per device. CLAIM_STALE_MS is 5 minutes so a still-
 * running invoke is not stolen by the next cron.
 */

export const MAX_CATCHUP_MINUTES = 30;
export const MAX_CATCHUP_REASON =
  'Catch-up is 30 minutes: 1-minute Supabase Cron only needs a short outage buffer, the tightest interval is 1 hour so catch-up must stay under 60 minutes, and a 06:58 notification must not arrive hours later.';
export const MAX_SEND_ATTEMPTS = 3;
export const CLAIM_STALE_MS = 5 * 60 * 1000;
export const PG_NET_TIMEOUT_MS = 240000;
export const MAX_TEST_TARGETS = 32;
export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 12];
export const DEFAULT_FIRST = '07:30';
export const DEFAULT_SECOND = '20:30';
export const DEFAULT_INTERVAL_START = '07:00';
export const DEFAULT_INTERVAL_END = '22:00';
export const DEFAULT_INTERVAL_HOURS = 1;
export const CRON_JOB_NAME = 'gomna-push-send-reliable-test-every-minute';
export const REQUIRED_VAULT_SECRETS = [
  'gomna_push_reliable_test_function_url',
  'gomna_push_reliable_test_cron_secret',
  'gomna_push_reliable_test_gateway_apikey'
];
export const TEST_ONLY_TABLES = [
  'gomna_push_reliable_test_targets',
  'gomna_push_reliable_test_sends'
];
export const PRODUCTION_OBJECTS_FORBIDDEN_IN_TEARDOWN = [
  'gomna_push_subscriptions',
  'gomna_push_sends',
  'push-send-daily',
  'push-subscribe',
  'push-status',
  'daily-today-word-push'
];

function pad2(n) {
  return (n < 10 ? '0' : '') + String(n);
}

export function parseTime(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi, hhmm: pad2(h) + ':' + pad2(mi) };
}

export function timeToMinutes(hhmm) {
  const p = parseTime(hhmm);
  return p ? p.h * 60 + p.m : null;
}

export function isValidTimeZone(tz) {
  const name = String(tz || '').trim();
  if (!name || name.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function nativeLocale(raw) {
  const s = String(raw || 'ko').toLowerCase();
  if (s === 'en' || s === 'ja' || s === 'zh' || s === 'ko') return s;
  return 'ko';
}

export function zonedParts(date, tz) {
  if (!isValidTimeZone(tz)) {
    throw new Error('invalid_timezone');
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const map = {};
  fmt.formatToParts(date).forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });
  return {
    y: Number(map.year),
    m: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second || 0)
  };
}

export function localDateKey(tz, date) {
  const p = zonedParts(date, tz);
  return p.y + '-' + pad2(p.m) + '-' + pad2(p.day);
}

export function shiftCalendarDate(dateKey, dayOffset) {
  const parts = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + dayOffset, 12, 0, 0));
  return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}

export function zonedLocalToUtcMs(y, month, d, h, min, tz) {
  if (!isValidTimeZone(tz)) return null;
  const wanted = Date.UTC(y, month - 1, d, h, min, 0);
  let utc = wanted;
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(utc), tz);
    const shown = Date.UTC(parts.y, parts.m - 1, parts.day, parts.hour, parts.minute, 0);
    const offset = shown - utc;
    const next = wanted - offset;
    if (next === utc) break;
    utc = next;
  }
  const check = zonedParts(new Date(utc), tz);
  if (check.y === y && check.m === month && check.day === d && check.hour === h && check.minute === min) {
    return utc;
  }
  return null;
}

function present(raw) {
  return raw != null && String(raw).trim() !== '';
}

export function readPrefs(row) {
  const src = row || {};
  const reasons = [];
  const tz = String(src.timezone || '').trim();
  if (!isValidTimeZone(tz)) reasons.push('invalid_timezone');

  const scheduleMode = String(src.schedule_mode || src.scheduleMode || 'fixed') === 'interval' ? 'interval' : 'fixed';
  const freq = Number(src.frequency) === 2 ? 2 : 1;
  const rawFirst = src.first_send_time != null ? src.first_send_time : src.firstTime;
  const rawSecond = src.second_send_time != null ? src.second_send_time : src.secondTime;
  const rawHours = src.interval_hours != null ? src.interval_hours : src.intervalHours;
  const rawStart = src.interval_start_time != null ? src.interval_start_time : src.intervalStartTime;
  const rawEnd = src.interval_end_time != null ? src.interval_end_time : src.intervalEndTime;

  let firstTime = DEFAULT_FIRST;
  if (present(rawFirst)) {
    const parsed = parseTime(rawFirst);
    if (!parsed) {
      reasons.push('invalid_first_send_time');
      firstTime = String(rawFirst).trim();
    } else firstTime = parsed.hhmm;
  }

  let secondTime = DEFAULT_SECOND;
  if (present(rawSecond)) {
    const parsed = parseTime(rawSecond);
    if (!parsed) {
      reasons.push('invalid_second_send_time');
      secondTime = String(rawSecond).trim();
    } else secondTime = parsed.hhmm;
  }

  let intervalHours = DEFAULT_INTERVAL_HOURS;
  if (present(rawHours)) {
    const n = Number(rawHours);
    if (!INTERVAL_HOURS.includes(n)) {
      reasons.push('invalid_interval_hours');
      intervalHours = n;
    } else intervalHours = n;
  }

  let intervalStartTime = DEFAULT_INTERVAL_START;
  if (present(rawStart)) {
    const parsed = parseTime(rawStart);
    if (!parsed) reasons.push('invalid_interval_start_time');
    else intervalStartTime = parsed.hhmm;
  }

  let intervalEndTime = DEFAULT_INTERVAL_END;
  if (present(rawEnd)) {
    const parsed = parseTime(rawEnd);
    if (!parsed) reasons.push('invalid_interval_end_time');
    else intervalEndTime = parsed.hhmm;
  }

  const startMin = timeToMinutes(intervalStartTime);
  const endMin = timeToMinutes(intervalEndTime);
  if (
    scheduleMode === 'interval' &&
    startMin != null &&
    endMin != null &&
    !reasons.includes('invalid_interval_start_time') &&
    !reasons.includes('invalid_interval_end_time') &&
    startMin >= endMin
  ) {
    reasons.push('invalid_interval_range');
  }

  const prefs = {
    enabled: src.active != null ? !!src.active : true,
    scheduleMode,
    frequency: freq,
    firstTime,
    secondTime,
    intervalHours,
    intervalStartTime,
    intervalEndTime,
    timezone: tz,
    locale: nativeLocale(src.locale)
  };
  if (reasons.length) return { ok: false, reason: reasons[0], reasons, prefs };
  return { ok: true, reason: null, reasons: [], prefs };
}

export function prefsFromRow(row) {
  return readPrefs(row).prefs;
}

export function listSlotDefs(prefs) {
  if (prefs.scheduleMode === 'interval') {
    const startMin = timeToMinutes(prefs.intervalStartTime);
    const endMin = timeToMinutes(prefs.intervalEndTime);
    const step = prefs.intervalHours * 60;
    const out = [];
    if (startMin == null || endMin == null || !step) return out;
    for (let t = startMin; t <= endMin; t += step) {
      const hhmm = pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
      out.push({ slot: 'interval-' + pad2(Math.floor(t / 60)) + pad2(t % 60), hhmm });
    }
    return out;
  }
  const first = parseTime(prefs.firstTime);
  if (!first) return [];
  const out = [{ slot: 'first', hhmm: first.hhmm }];
  if (prefs.frequency === 2) {
    const second = parseTime(prefs.secondTime);
    if (second && second.hhmm !== first.hhmm) out.push({ slot: 'second', hhmm: second.hhmm });
  }
  return out;
}

export function evaluateDueSlots(prefs, now, maxCatchup = MAX_CATCHUP_MINUTES) {
  const tz = String(prefs.timezone || '').trim();
  if (!isValidTimeZone(tz)) {
    return { ok: false, reason: 'invalid_timezone', slots: [] };
  }
  if (prefs.scheduleMode === 'interval') {
    const startMin = timeToMinutes(prefs.intervalStartTime);
    const endMin = timeToMinutes(prefs.intervalEndTime);
    if (startMin == null || endMin == null || startMin >= endMin) {
      return { ok: false, reason: 'invalid_interval_range', slots: [] };
    }
  }
  const slotDefs = listSlotDefs(prefs);
  const nowMs = now.getTime();
  const todayKey = localDateKey(tz, now);
  const due = [];
  for (const dayOffset of [0, -1]) {
    const sendDate = shiftCalendarDate(todayKey, dayOffset);
    const [y, month, d] = sendDate.split('-').map(Number);
    for (const def of slotDefs) {
      const t = parseTime(def.hhmm);
      if (!t) continue;
      const slotMs = zonedLocalToUtcMs(y, month, d, t.h, t.m, tz);
      if (slotMs == null) continue;
      const delayMinutes = (nowMs - slotMs) / 60000;
      if (delayMinutes >= 0 && delayMinutes < maxCatchup) {
        due.push({
          slot: def.slot,
          sendDate,
          localTime: def.hhmm,
          delayMinutes
        });
      }
    }
  }
  return { ok: true, reason: null, slots: due };
}

export function classifySendError(statusCode, err) {
  const status = Number(statusCode) || 0;
  if (status === 404 || status === 410) return 'gone';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  if (err && !status) return 'network_error';
  if (!status) return 'network_error';
  return 'unknown';
}

export function isRetryableError(kind) {
  return kind === 'server_error' || kind === 'rate_limited' || kind === 'network_error';
}

export function emptyCounts() {
  return {
    scanned: 0,
    active: 0,
    testTargets: 0,
    due: 0,
    notDue: 0,
    invalidPreferences: 0,
    alreadySent: 0,
    claimed: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    deactivated: 0,
    retried: 0
  };
}

export function catchUpInfo() {
  return { maxMinutes: MAX_CATCHUP_MINUTES, reason: MAX_CATCHUP_REASON };
}

export function publicFailureLog(row) {
  return {
    endpoint_hash: row.endpoint_hash,
    slot: row.slot,
    localDate: row.localDate,
    localTime: row.localTime,
    httpStatus: row.httpStatus || 0,
    errorKind: row.errorKind,
    attemptCount: row.attemptCount
  };
}

export function applyClaimDecision(existing, nowMs) {
  if (!existing) return { action: 'insert' };
  if (existing.status === 'sent') return { action: 'skip', reason: 'already_sent' };
  if (Number(existing.attemptCount) >= MAX_SEND_ATTEMPTS) return { action: 'skip', reason: 'attempts_exhausted' };
  if (existing.status === 'failed') return { action: 'retry', reason: 'failed' };
  if (existing.status === 'claimed' && nowMs - Number(existing.claimedAt) >= CLAIM_STALE_MS) {
    return { action: 'retry', reason: 'stale_claim' };
  }
  if (existing.status === 'claimed') return { action: 'skip', reason: 'in_flight' };
  return { action: 'skip', reason: 'already_sent' };
}

export function classifyDryRunSlot(existing, nowMs) {
  if (!existing) return 'will_send';
  const decision = applyClaimDecision(existing, nowMs);
  if (decision.action === 'retry') return 'will_retry';
  if (decision.reason === 'in_flight') return 'in_flight';
  if (decision.reason === 'attempts_exhausted') return 'attempts_exhausted';
  if (decision.reason === 'already_sent') return 'already_sent';
  return decision.reason || 'will_send';
}

export function applyStatusWrite(row, expectedAttempt) {
  if (!row) return { ok: false, reason: 'missing_row' };
  if (row.status !== 'claimed') return { ok: false, reason: 'not_claimed' };
  if (Number(row.attemptCount) !== Number(expectedAttempt)) return { ok: false, reason: 'attempt_mismatch' };
  return { ok: true };
}

export function restStatusWriteFilter(attemptCount) {
  return 'status=eq.claimed&attempt_count=eq.' + Number(attemptCount);
}

export function authorizeReliableTestRequest(input) {
  const expectedSecret = String((input && input.expectedSecret) || '');
  const testSecret = String((input && input.testSecret) || '');
  const apikey = String((input && input.apikey) || '');
  const expectedApikey = String((input && input.expectedApikey) || '');
  if (!expectedSecret || !testSecret || testSecret !== expectedSecret) return false;
  if (!apikey) return false;
  if (expectedApikey && apikey !== expectedApikey) return false;
  return true;
}

export function decideRegisterTarget(subscription) {
  if (!subscription || !subscription.endpoint_hash) {
    return { ok: false, error: 'subscription-missing', failureClass: 'function' };
  }
  return { ok: true, error: null, failureClass: 'none' };
}

export function assertVaultSecretsForCron(secretsByName) {
  const missing = REQUIRED_VAULT_SECRETS.filter((name) => {
    const value = secretsByName && secretsByName[name];
    return value == null || String(value).trim() === '';
  });
  if (missing.length) {
    throw new Error('gomna_push_reliable_test cron install failed: missing vault secrets: ' + missing.join(', '));
  }
}

export function inspectTeardownSql(sql) {
  const text = String(sql || '').replace(/--[^\n]*/g, '');
  const drops = Array.from(text.matchAll(/drop\s+table\s+if\s+exists\s+(?:public\.)?([a-z0-9_]+)/gi)).map((m) => m[1]);
  const unschedules = Array.from(text.matchAll(/jobname\s*=\s*'([^']+)'/g)).map((m) => m[1]);
  const forbidden = PRODUCTION_OBJECTS_FORBIDDEN_IN_TEARDOWN.filter((name) => text.includes(name));
  const extraDrops = drops.filter((name) => TEST_ONLY_TABLES.indexOf(name) === -1);
  const missingDrops = TEST_ONLY_TABLES.filter((name) => drops.indexOf(name) === -1);
  const extraJobs = unschedules.filter((name) => name !== CRON_JOB_NAME);
  return {
    ok: forbidden.length === 0 && extraDrops.length === 0 && missingDrops.length === 0 && extraJobs.length === 0 && unschedules.length > 0,
    drops,
    unschedules,
    forbidden,
    extraDrops,
    missingDrops,
    extraJobs
  };
}

export function responseStatusFor(result) {
  if (result && result.ok) return 200;
  if (result && result.failureClass === 'push') return 422;
  if (result && (result.failureClass === 'storage' || result.failureClass === 'function')) return 500;
  return 400;
}

export function registerStatusFor(result) {
  if (result && result.ok) return 200;
  if (result && result.error === 'subscription-missing') return 404;
  if (result && result.error === 'invalid-target') return 400;
  return 500;
}

export function createConditionalSendStore() {
  const rows = new Map();
  const keyOf = (sendDate, endpointHash, slot) => sendDate + '|' + endpointHash + '|' + slot;

  return {
    rows,
    peek(sendDate, endpointHash, slot) {
      return rows.get(keyOf(sendDate, endpointHash, slot)) || null;
    },
    claim({ sendDate, endpointHash, slot, localTime, now }) {
      const key = keyOf(sendDate, endpointHash, slot);
      const existing = rows.get(key) || null;
      const nowMs = now.getTime();
      const decision = applyClaimDecision(existing, nowMs);
      if (decision.action === 'skip') {
        return { status: 'already', reason: decision.reason, key, attemptCount: existing ? existing.attemptCount : 0 };
      }
      if (decision.action === 'insert') {
        rows.set(key, {
          sendDate,
          endpointHash,
          slot,
          status: 'claimed',
          attemptCount: 1,
          localTime,
          claimedAt: nowMs,
          lastErrorKind: null,
          lastHttpStatus: null
        });
        return { status: 'new', key, attemptCount: 1 };
      }
      const nextAttempt = existing.attemptCount + 1;
      existing.status = 'claimed';
      existing.attemptCount = nextAttempt;
      existing.claimedAt = nowMs;
      existing.localTime = localTime;
      return { status: 'retry', key, attemptCount: nextAttempt, reason: decision.reason };
    },
    markSent(key, now, claim) {
      const row = rows.get(key);
      const decision = applyStatusWrite(row, claim && claim.attemptCount);
      if (!decision.ok) return { ok: false, reason: decision.reason };
      row.status = 'sent';
      row.sentAt = now.getTime();
      return { ok: true };
    },
    markFailed(key, result, claim) {
      const row = rows.get(key);
      const decision = applyStatusWrite(row, claim && claim.attemptCount);
      if (!decision.ok) return { ok: false, reason: decision.reason };
      row.status = 'failed';
      row.lastErrorKind = result.errorKind;
      row.lastHttpStatus = result.statusCode || 0;
      if (!isRetryableError(result.errorKind)) row.attemptCount = MAX_SEND_ATTEMPTS;
      return { ok: true };
    }
  };
}

export function createMemorySendStore() {
  return createConditionalSendStore();
}

const INTERVAL_SLOT_RE = /^interval-([01][0-9]|2[0-3])[0-5][0-9]$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeSendSlot(raw) {
  const slot = String(raw == null ? '' : raw).trim();
  if (slot === 'first' || slot === 'second') return { ok: true, slot };
  if (INTERVAL_SLOT_RE.test(slot)) return { ok: true, slot };
  return { ok: false, reason: 'invalid_slot', slot: null };
}

export function sanitizeDateKey(raw) {
  const date = String(raw == null ? '' : raw).trim();
  if (DATE_KEY_RE.test(date)) return { ok: true, date };
  return { ok: false, reason: 'invalid_date', date: null };
}

export function reliableTestTag(date, slot) {
  return 'gomna-reliable-test-' + date + '-' + slot;
}

export function buildReliableTestPayload(productionBuild, opts) {
  const slotCheck = sanitizeSendSlot(opts && opts.slot);
  if (!slotCheck.ok) return { ok: false, reason: 'invalid_slot', payload: null };
  const dateCheck = sanitizeDateKey(opts && opts.date);
  if (!dateCheck.ok) return { ok: false, reason: 'invalid_date', payload: null };
  const titleSlot = slotCheck.slot === 'second' ? 'second' : 'first';
  const base = typeof productionBuild === 'function'
    ? productionBuild({ date: dateCheck.date, locale: opts && opts.locale, slot: titleSlot })
    : {};
  const data = Object.assign({}, base && base.data, {
    date: dateCheck.date,
    slot: slotCheck.slot
  });
  return {
    ok: true,
    reason: null,
    payload: Object.assign({}, base, {
      tag: reliableTestTag(dateCheck.date, slotCheck.slot),
      data
    })
  };
}

export function dummyPayload(opts) {
  return {
    title: 'reliable-test',
    body: String(opts.slot || ''),
    lang: opts.locale || 'ko',
    tag: 'gomna-reliable-test-' + opts.date + '-' + opts.slot,
    verseId: opts.date + '|' + opts.slot,
    data: { source: 'home-today', date: opts.date, slot: opts.slot, locale: opts.locale }
  };
}

function finish(result) {
  const storageFailed = result.storageErrors && result.storageErrors.length > 0;
  const allPushesFailed = result.attempted > 0 && result.sent === 0 && result.dryRun !== true;
  if (result.error && result.failureClass && result.failureClass !== 'none') {
    return { ...result, ok: false };
  }
  if (storageFailed) {
    const first = result.storageErrors[0];
    const error = first.op === 'markSent'
      ? 'persist_sent_failed'
      : first.op === 'markFailed'
        ? 'persist_failed_failed'
        : first.op === 'deactivate' ? 'deactivate_failed' : 'persist_failed';
    return { ...result, ok: false, error, failureClass: 'storage' };
  }
  if (allPushesFailed) {
    return { ...result, ok: false, error: 'push_failed', failureClass: 'push' };
  }
  return { ...result, ok: true, error: null, failureClass: 'none' };
}

export async function runReliableSend(input) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const dryRun = input.dryRun === true;
  const targets = Array.isArray(input.targets) ? input.targets : [];
  const subscriptions = Array.isArray(input.subscriptions) ? input.subscriptions : [];
  const store = input.store;
  const sendPush = input.sendPush || (async () => ({ ok: true, statusCode: 201 }));
  const buildPayload = input.buildPayload || dummyPayload;
  const stampPayload = input.buildReliableTestPayload || buildReliableTestPayload;
  const deactivate = input.deactivate || (async () => ({ ok: true }));
  const counts = emptyCounts();
  const exclusions = [];
  const failures = [];
  const dueDetails = [];
  const storageErrors = [];

  const enabledTargets = targets.filter((t) => t && t.enabled !== false && t.endpoint_hash);
  counts.testTargets = enabledTargets.length;
  if (enabledTargets.length > MAX_TEST_TARGETS) {
    return finish({
      error: 'too_many_test_targets',
      failureClass: 'function',
      dryRun,
      catchUp: catchUpInfo(),
      ...counts,
      exclusions,
      failures,
      dueDetails,
      storageErrors
    });
  }

  const targetSet = new Set(enabledTargets.map((t) => t.endpoint_hash));
  const matched = subscriptions.filter((s) => s && targetSet.has(s.endpoint_hash));
  counts.scanned = matched.length;
  const matchedHashes = new Set(matched.map((s) => s.endpoint_hash));
  for (const target of enabledTargets) {
    if (!matchedHashes.has(target.endpoint_hash)) {
      exclusions.push({ endpoint_hash: target.endpoint_hash, reason: 'subscription_missing', disposition: 'subscription_missing' });
    }
  }

  const active = matched.filter((s) => s.active !== false);
  counts.active = active.length;
  for (const row of matched) {
    if (row.active === false) {
      exclusions.push({ endpoint_hash: row.endpoint_hash, reason: 'inactive', disposition: 'inactive' });
    }
  }

  if (!enabledTargets.length) {
    return finish({ dryRun, catchUp: catchUpInfo(), ...counts, exclusions, failures, dueDetails, storageErrors });
  }

  for (const row of active) {
    const parsed = readPrefs(row);
    if (!parsed.ok) {
      counts.invalidPreferences += 1;
      exclusions.push({
        endpoint_hash: row.endpoint_hash,
        reason: parsed.reason,
        reasons: parsed.reasons,
        disposition: 'invalid_preferences',
        timezone: parsed.prefs.timezone
      });
      continue;
    }
    const evaluated = evaluateDueSlots(parsed.prefs, now, input.maxCatchup != null ? input.maxCatchup : MAX_CATCHUP_MINUTES);
    if (!evaluated.ok) {
      counts.invalidPreferences += 1;
      exclusions.push({
        endpoint_hash: row.endpoint_hash,
        reason: evaluated.reason,
        disposition: 'invalid_preferences',
        timezone: parsed.prefs.timezone
      });
      continue;
    }
    if (!evaluated.slots.length) {
      counts.notDue += 1;
      exclusions.push({ endpoint_hash: row.endpoint_hash, reason: 'not_due', disposition: 'not_due' });
      continue;
    }

    for (const slotInfo of evaluated.slots) {
      const slotCheck = sanitizeSendSlot(slotInfo.slot);
      if (!slotCheck.ok) {
        exclusions.push({
          endpoint_hash: row.endpoint_hash,
          slot: String(slotInfo.slot || ''),
          sendDate: slotInfo.sendDate,
          reason: 'invalid_slot',
          disposition: 'invalid_slot'
        });
        continue;
      }
      counts.due += 1;
      const detail = {
        endpoint_hash: row.endpoint_hash,
        slot: slotInfo.slot,
        sendDate: slotInfo.sendDate,
        localTime: slotInfo.localTime,
        delayMinutes: slotInfo.delayMinutes,
        locale: parsed.prefs.locale
      };

      if (dryRun) {
        const existing = store && store.peek ? await store.peek(slotInfo.sendDate, row.endpoint_hash, slotInfo.slot) : null;
        const disposition = classifyDryRunSlot(existing, now.getTime());
        detail.disposition = disposition;
        dueDetails.push(detail);
        if (disposition === 'already_sent') counts.alreadySent += 1;
        continue;
      }

      dueDetails.push(detail);
      const claim = await store.claim({
        sendDate: slotInfo.sendDate,
        endpointHash: row.endpoint_hash,
        slot: slotInfo.slot,
        localTime: slotInfo.localTime,
        now
      });
      if (claim.status === 'already') {
        counts.alreadySent += 1;
        exclusions.push({
          endpoint_hash: row.endpoint_hash,
          slot: slotInfo.slot,
          sendDate: slotInfo.sendDate,
          reason: claim.reason || 'already_sent',
          disposition: claim.reason || 'already_sent'
        });
        continue;
      }
      counts.claimed += 1;
      if (claim.status === 'retry') counts.retried += 1;
      counts.attempted += 1;

      const built = stampPayload(buildPayload, {
        date: slotInfo.sendDate,
        locale: parsed.prefs.locale,
        slot: slotCheck.slot
      });
      if (!built.ok || !built.payload) {
        storageErrors.push({
          op: 'buildPayload',
          reason: built.reason || 'invalid_slot',
          endpoint_hash: row.endpoint_hash,
          slot: slotCheck.slot,
          sendDate: slotInfo.sendDate
        });
        continue;
      }
      const payload = built.payload;
      let result;
      try {
        result = await sendPush(row, payload);
      } catch (err) {
        result = { ok: false, statusCode: 0, errorKind: classifySendError(0, err) };
      }
      const claimRef = { attemptCount: claim.attemptCount };
      if (result && result.ok) {
        const persist = await store.markSent(claim.key, now, claimRef);
        if (!persist || persist.ok !== true) {
          storageErrors.push({
            op: 'markSent',
            reason: persist && persist.reason ? persist.reason : 'persist_failed',
            endpoint_hash: row.endpoint_hash,
            slot: slotInfo.slot,
            sendDate: slotInfo.sendDate,
            attemptCount: claim.attemptCount
          });
          continue;
        }
        counts.sent += 1;
        continue;
      }
      const errorKind = result && result.errorKind ? result.errorKind : classifySendError(result && result.statusCode, result && result.error);
      const statusCode = result && result.statusCode ? result.statusCode : 0;
      const persistFail = await store.markFailed(claim.key, { errorKind, statusCode }, claimRef);
      if (!persistFail || persistFail.ok !== true) {
        storageErrors.push({
          op: 'markFailed',
          reason: persistFail && persistFail.reason ? persistFail.reason : 'persist_failed',
          endpoint_hash: row.endpoint_hash,
          slot: slotInfo.slot,
          sendDate: slotInfo.sendDate,
          attemptCount: claim.attemptCount,
          errorKind,
          httpStatus: statusCode
        });
        continue;
      }
      counts.failed += 1;
      failures.push(publicFailureLog({
        endpoint_hash: row.endpoint_hash,
        slot: slotInfo.slot,
        localDate: slotInfo.sendDate,
        localTime: slotInfo.localTime,
        httpStatus: statusCode,
        errorKind,
        attemptCount: claim.attemptCount
      }));
      if (statusCode === 404 || statusCode === 410 || errorKind === 'gone') {
        let deactivatedOk;
        try {
          deactivatedOk = await deactivate(row.endpoint_hash);
        } catch {
          deactivatedOk = { ok: false, reason: 'deactivate_threw' };
        }
        if (!deactivatedOk || deactivatedOk.ok !== true) {
          storageErrors.push({
            op: 'deactivate',
            reason: deactivatedOk && deactivatedOk.reason ? deactivatedOk.reason : 'persist_failed',
            endpoint_hash: row.endpoint_hash,
            slot: slotInfo.slot,
            sendDate: slotInfo.sendDate
          });
        } else {
          counts.deactivated += 1;
        }
      }
    }
  }

  return finish({ dryRun, catchUp: catchUpInfo(), ...counts, exclusions, failures, dueDetails, storageErrors });
}
