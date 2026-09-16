/** Reliable one-email-per-local-day scheduler. */
export const MAX_MAIL_CATCHUP_MINUTES = 30;
export const MAX_MAIL_SEND_ATTEMPTS = 3;
export const MAIL_CLAIM_STALE_MS = 5 * 60 * 1000;
export const MAIL_CRON_JOB = 'gomna-mail-send-daily-every-minute';
export const MAIL_VAULT_SECRETS = [
  'gomna_mail_daily_function_url',
  'gomna_mail_cron_secret',
  'gomna_mail_gateway_apikey'
];

const pad2 = (value) => String(value).padStart(2, '0');

export function parseMailTime(raw) {
  const match = String(raw == null ? '' : raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, hhmm: pad2(hour) + ':' + pad2(minute) };
}

export function isValidMailTimezone(raw) {
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
  if (!isValidMailTimezone(timezone)) throw new Error('invalid_timezone');
  const values = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute)
  };
}

export function mailLocalDateKey(timezone, date) {
  const part = zonedParts(date, timezone);
  return part.year + '-' + pad2(part.month) + '-' + pad2(part.day);
}

function shiftDate(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate());
}

function zonedLocalToUtcMs(dateKey, hhmm, timezone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const time = parseMailTime(hhmm);
  if (!time) return null;
  const wanted = Date.UTC(year, month - 1, day, time.hour, time.minute);
  let utc = wanted;
  for (let index = 0; index < 3; index += 1) {
    const shown = zonedParts(new Date(utc), timezone);
    const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    utc = wanted - (shownUtc - utc);
  }
  const check = zonedParts(new Date(utc), timezone);
  return check.year === year && check.month === month && check.day === day
    && check.hour === time.hour && check.minute === time.minute ? utc : null;
}

export function readMailPrefs(row) {
  const timezone = String(row && row.timezone || '').trim();
  const sendTime = parseMailTime(row && row.send_time);
  const reasons = [];
  if (!isValidMailTimezone(timezone)) reasons.push('invalid_timezone');
  if (!sendTime) reasons.push('invalid_send_time');
  return {
    ok: reasons.length === 0,
    reason: reasons[0] || null,
    reasons,
    prefs: { timezone, sendTime: sendTime && sendTime.hhmm }
  };
}

export function evaluateMailDue(prefs, now, catchupMinutes = MAX_MAIL_CATCHUP_MINUTES) {
  if (!isValidMailTimezone(prefs.timezone)) return { ok: false, reason: 'invalid_timezone', due: null };
  if (!parseMailTime(prefs.sendTime)) return { ok: false, reason: 'invalid_send_time', due: null };
  const current = now instanceof Date ? now : new Date(now);
  const today = mailLocalDateKey(prefs.timezone, current);
  for (const offset of [0, -1]) {
    const sendDate = shiftDate(today, offset);
    const scheduled = zonedLocalToUtcMs(sendDate, prefs.sendTime, prefs.timezone);
    if (scheduled == null) continue;
    const delayMinutes = (current.getTime() - scheduled) / 60000;
    if (delayMinutes >= 0 && delayMinutes < catchupMinutes) {
      return { ok: true, reason: null, due: { sendDate, localTime: prefs.sendTime, delayMinutes } };
    }
  }
  return { ok: true, reason: null, due: null };
}

export function classifyMailError(statusCode, error) {
  const status = Number(statusCode) || 0;
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'recipient_or_request_error';
  if (!status && error) return 'network_error';
  return status ? 'unknown' : 'network_error';
}

export function isRetryableMailError(kind) {
  return ['rate_limited', 'server_error', 'network_error'].includes(kind);
}

export function mailClaimDecision(existing, nowMs) {
  if (!existing) return { action: 'insert' };
  if (existing.status === 'sent') return { action: 'skip', reason: 'already_sent' };
  if (Number(existing.attemptCount) >= MAX_MAIL_SEND_ATTEMPTS) return { action: 'skip', reason: 'attempts_exhausted' };
  if (existing.status === 'failed') return { action: 'retry', reason: 'failed' };
  if (existing.status === 'claimed' && nowMs - Number(existing.claimedAt) >= MAIL_CLAIM_STALE_MS) {
    return { action: 'retry', reason: 'stale_claim' };
  }
  if (existing.status === 'claimed') return { action: 'skip', reason: 'in_flight' };
  return { action: 'skip', reason: 'invalid_status' };
}

export function mailStatusWriteAllowed(row, expectedAttempt) {
  if (!row) return { ok: false, reason: 'missing_row' };
  if (row.status !== 'claimed') return { ok: false, reason: 'not_claimed' };
  if (Number(row.attemptCount) !== Number(expectedAttempt)) return { ok: false, reason: 'attempt_mismatch' };
  return { ok: true };
}

export function createMemoryMailStore() {
  const rows = new Map();
  const keyOf = (date, hash) => date + '|' + hash;
  return {
    rows,
    peek(date, hash) { return rows.get(keyOf(date, hash)) || null; },
    claim({ sendDate, emailHash, localTime, now }) {
      const key = keyOf(sendDate, emailHash);
      const existing = rows.get(key) || null;
      const decision = mailClaimDecision(existing, now.getTime());
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
      const allowed = mailStatusWriteAllowed(row, claim.attemptCount);
      if (!allowed.ok) return allowed;
      row.status = 'sent'; row.sentAt = now.getTime();
      return { ok: true };
    },
    markFailed(key, result, claim) {
      const row = rows.get(key);
      const allowed = mailStatusWriteAllowed(row, claim.attemptCount);
      if (!allowed.ok) return allowed;
      row.status = 'failed'; row.errorKind = result.errorKind;
      if (!isRetryableMailError(result.errorKind)) row.attemptCount = MAX_MAIL_SEND_ATTEMPTS;
      return { ok: true };
    }
  };
}

export async function runReliableMailSend(input) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const dryRun = input.dryRun === true;
  const rows = Array.isArray(input.subscriptions) ? input.subscriptions : [];
  const result = {
    dryRun, catchUpMinutes: MAX_MAIL_CATCHUP_MINUTES,
    scanned: rows.length, active: 0, due: 0, notDue: 0, invalidPreferences: 0,
    alreadySent: 0, claimed: 0, attempted: 0, sent: 0, failed: 0, retried: 0,
    exclusions: [], failures: [], dueDetails: [], storageErrors: []
  };
  const active = rows.filter((row) => row && row.active !== false);
  result.active = active.length;
  for (const row of active) {
    const parsed = readMailPrefs(row);
    if (!parsed.ok) {
      result.invalidPreferences += 1;
      result.exclusions.push({ email_hash: row.email_hash, reason: parsed.reason, reasons: parsed.reasons });
      continue;
    }
    let evaluated;
    if (input.force === true) {
      const part = zonedParts(now, parsed.prefs.timezone);
      evaluated = { ok: true, reason: null, due: {
        sendDate: mailLocalDateKey(parsed.prefs.timezone, now),
        localTime: pad2(part.hour) + ':' + pad2(part.minute), delayMinutes: 0
      } };
    } else {
      evaluated = evaluateMailDue(parsed.prefs, now, input.maxCatchup == null ? MAX_MAIL_CATCHUP_MINUTES : input.maxCatchup);
    }
    if (!evaluated.ok) {
      result.invalidPreferences += 1;
      result.exclusions.push({ email_hash: row.email_hash, reason: evaluated.reason });
      continue;
    }
    if (!evaluated.due) { result.notDue += 1; continue; }
    result.due += 1;
    const detail = { email_hash: row.email_hash, ...evaluated.due };
    result.dueDetails.push(detail);
    if (dryRun) {
      let existing;
      try { existing = await input.store.peek(evaluated.due.sendDate, row.email_hash); }
      catch { result.storageErrors.push({ op: 'peek', email_hash: row.email_hash }); continue; }
      const decision = mailClaimDecision(existing, now.getTime());
      detail.disposition = decision.action === 'insert' ? 'will_send' : decision.action === 'retry' ? 'will_retry' : decision.reason;
      if (decision.reason === 'already_sent') result.alreadySent += 1;
      continue;
    }
    let claim;
    try {
      claim = await input.store.claim({ sendDate: evaluated.due.sendDate, emailHash: row.email_hash, localTime: evaluated.due.localTime, now });
    } catch {
      result.storageErrors.push({ op: 'claim', email_hash: row.email_hash });
      continue;
    }
    if (claim.status === 'already') {
      result.alreadySent += 1;
      result.exclusions.push({ email_hash: row.email_hash, reason: claim.reason });
      continue;
    }
    result.claimed += 1;
    if (claim.status === 'retry') result.retried += 1;
    result.attempted += 1;
    let sent;
    try { sent = await input.sendMail(row, evaluated.due); }
    catch (error) { sent = { ok: false, statusCode: 0, errorKind: classifyMailError(0, error) }; }
    const claimRef = { attemptCount: claim.attemptCount };
    if (sent && sent.ok) {
      let saved;
      try { saved = await input.store.markSent(claim.key, now, claimRef, sent); }
      catch { saved = { ok: false }; }
      if (saved && saved.ok) result.sent += 1;
      else result.storageErrors.push({ op: 'markSent', email_hash: row.email_hash });
      continue;
    }
    const statusCode = Number(sent && sent.statusCode) || 0;
    const errorKind = sent && sent.errorKind || classifyMailError(statusCode, sent && sent.error);
    let saved;
    try { saved = await input.store.markFailed(claim.key, { statusCode, errorKind, error: sent && sent.error }, claimRef); }
    catch { saved = { ok: false }; }
    if (saved && saved.ok) {
      result.failed += 1;
      result.failures.push({ email_hash: row.email_hash, errorKind, statusCode, attemptCount: claim.attemptCount });
    } else result.storageErrors.push({ op: 'markFailed', email_hash: row.email_hash });
  }
  const ok = result.storageErrors.length === 0 && (dryRun || result.attempted === 0 || result.sent > 0);
  return { ...result, ok, error: ok ? null : result.storageErrors.length ? 'storage_failed' : 'mail_failed', failureClass: ok ? 'none' : result.storageErrors.length ? 'storage' : 'mail' };
}
