const DAY_MS = 86400000;
export const ZONE = 'Europe/London';
export const CUTOFF_HOUR = 6;
export const FRESH_MS = 90000;
export const FORMULA = 'createdAt-half-full-v1';

const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});
const labels = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const settledFields = {
  WIN: 'win', LOSS: 'loss', PUSH: 'push', HALF_WIN: 'halfWin', HALF_LOSS: 'halfLoss',
};

function localHourStamp(time) {
  const fields = Object.fromEntries(dateParts.formatToParts(new Date(time)).map(({ type, value }) => [type, value]));
  return Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour);
}

function cutoff(calendarDay) {
  const utc = calendarDay + CUTOFF_HOUR * 3600000;
  return utc - (localHourStamp(utc) - utc);
}

export function dayWindow(now) {
  const local = localHourStamp(now);
  const today = Math.floor((local - CUTOFF_HOUR * 3600000) / DAY_MS) * DAY_MS;
  return {
    start: cutoff(today), previousStart: cutoff(today - DAY_MS), end: cutoff(today + DAY_MS),
    today: labels.format(new Date(today)).toUpperCase(),
    yesterday: labels.format(new Date(today - DAY_MS)).toUpperCase(),
  };
}

function timestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? n : n > 1e9 ? n * 1000 : null;
  }
  const result = Date.parse(String(value));
  return Number.isFinite(result) ? result : null;
}

function bucket() {
  return { win: 0, loss: 0, push: 0, pending: 0, oddsSum: 0, oddsCount: 0 };
}

// Preserve the original card's grouping and use confirmed decimal entry odds.
function addCardRow(group, row, isToday) {
  const result = String(row.result ?? row.settlement ?? row.outcome ?? '').trim().toUpperCase();
  let field;
  if (result === 'WIN' || result === 'HALF_WIN') field = 'win';
  else if (result === 'LOSS' || result === 'HALF_LOSS') field = 'loss';
  else if (result === 'PUSH' || result === 'VOID') field = 'push';
  else if (isToday && String(row.status || '').toUpperCase() === 'PENDING') field = 'pending';
  else return;
  group[field]++;
  const odds = Number(row.odds);
  if (Number.isFinite(odds) && odds > 1) {
    group.oddsSum += odds;
    group.oddsCount++;
  }
}

function statsIdentity(page) {
  const market = Object.entries(page.byMarket || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    page.ledgerTotal, page.total, page.pending, page.unresolved, page.win, page.loss,
    page.push, page.halfWin, page.halfLoss, page.version, page.settlementRevision,
    page.statisticsLedgerVersion, page.statisticsContentRevision ?? null, market,
  ]);
}

// Match the existing Statistics verification before publishing any summary.
export async function verifyAndSummarize(readPage, now = Date.now) {
  const window = dayWindow(now());
  const today = bucket();
  const yesterday = bucket();
  const seen = new Set();
  const cursors = new Set();
  const counts = { win: 0, loss: 0, push: 0, halfWin: 0, halfLoss: 0, pending: 0, unresolved: 0 };
  let cursor = null;
  let first;
  let signature;
  let settled = 0;

  do {
    const page = await readPage(cursor);
    if (page?.ok !== true || !Array.isArray(page.rows) ||
        !Number.isSafeInteger(page.ledgerTotal) || !Number.isSafeInteger(page.total) ||
        page.ledgerTotal < page.total || page.total < 0) throw new Error('Invalid Statistics page');
    const identity = statsIdentity(page);
    if (!first) {
      first = { ...page, rows: undefined };
      signature = identity;
    } else if (signature !== identity) {
      throw new Error('Statistics revision changed during pagination');
    }

    for (const row of page.rows) {
      if (!row?.id || seen.has(String(row.id))) throw new Error('Missing or duplicate Statistics row ID');
      seen.add(String(row.id));
      if (seen.size > first.ledgerTotal) throw new Error('Statistics row count exceeds the ledger total');

      const status = String(row.status || '').toUpperCase();
      const result = String(row.result || row.settlement || row.outcome || '').trim().toUpperCase();
      if (Object.hasOwn(settledFields, result) && (!status || status === 'SETTLED')) {
        counts[settledFields[result]]++;
        settled++;
      }
      if (row.status === 'PENDING') counts.pending++;
      if (row.status === 'UNRESOLVED') counts.unresolved++;

      const created = timestamp(row.createdAt) ?? timestamp(row.created_at);
      if (created !== null && created >= window.previousStart && created < window.end) {
        const isToday = created >= window.start;
        addCardRow(isToday ? today : yesterday, row, isToday);
      }
    }

    cursor = page.nextCursor;
    if ((page.hasMore === true && !cursor) ||
        (cursor && (typeof cursor !== 'string' || !page.rows.length || cursors.has(cursor) || seen.size >= first.ledgerTotal))) {
      throw new Error('Invalid Statistics continuation');
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);

  if (seen.size !== first.ledgerTotal || settled !== first.total ||
      Object.entries(counts).some(([field, count]) => first[field] !== count)) {
    throw new Error('Statistics totals disagree with the ledger');
  }
  const verifiedAt = now();
  if (verifiedAt >= window.end) throw new Error('London day changed during verification');

  return {
    schema: 1, formula: FORMULA, tz: ZONE, cutoff: CUTOFF_HOUR,
    window, today, yesterday, verifiedAt, verifiedRows: seen.size,
  };
}

export function summaryIsUsable(summary, now) {
  return summary?.schema === 1 && summary.formula === FORMULA &&
    summary.window?.start <= now && now < summary.window.end &&
    Number.isFinite(summary.verifiedAt) && summary.verifiedAt <= now + 60000 &&
    now - summary.verifiedAt < DAY_MS;
}

export function valuesFor(summary, now = Date.now()) {
  const active = summaryIsUsable(summary, now);
  const window = active ? summary.window : dayWindow(now);
  const fresh = active && now - summary.verifiedAt <= FRESH_MS;
  const state = fresh ? 'current' : active ? 'saved' : 'waiting';
  const status = fresh ? 'Live Summary' : active ? 'Saved Summary' : 'Awaiting update';
  const fields = { 'label:today': status + ' · ' + window.today };
  if (active) fields['label:today'] += ' · ' + clock.format(new Date(summary.verifiedAt));
  fields['label:yesterday'] = (fresh ? 'Final Summary' : status) + ' · ' + window.yesterday;
  const tones = {};

  for (const day of ['today', 'yesterday']) {
    const b = active ? summary[day] : null;
    const decided = b ? b.win + b.loss : 0;
    const rate = decided ? (b.win / decided * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—';
    const rounded = Number.parseFloat(rate);
    tones[day] = rounded > 50 ? 'positive' : rounded < 50 ? 'negative' : 'neutral';
    fields['rate:' + day] = rate;
    fields['avg-odds:' + day] = b?.oddsCount ? (b.oddsSum / b.oddsCount).toFixed(2) : '—';
    fields['total:' + day] = b ? String(b.win + b.loss + b.push + b.pending) : '—';
    for (const field of ['win', 'loss', 'push', 'pending']) {
      fields['stat:' + day + '-' + field] = b ? String(b[field]) : '—';
    }
  }

  return { fields, tones, state, expiresAt: active ? window.end : 0, verifiedAt: active ? summary.verifiedAt : 0 };
}
