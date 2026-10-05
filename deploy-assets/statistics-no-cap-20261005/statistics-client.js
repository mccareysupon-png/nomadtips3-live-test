(() => {
'use strict';
const API = '/api/engine/statistics';
const CACHE_MS = 60000;
const RESULTS = ['WIN', 'LOSS', 'PUSH', 'HALF_WIN', 'HALF_LOSS'];
const FIELDS = {WIN:'win', LOSS:'loss', PUSH:'push', HALF_WIN:'halfWin', HALF_LOSS:'halfLoss'};
let cached = null;
let loadedAt = 0;
let loading = null;

function outcome(row) {
  return String(row?.result || row?.settlement || row?.outcome || '').trim().toUpperCase();
}
function isSettled(row) {
  const status = String(row?.status || '').toUpperCase();
  return (!status || status === 'SETTLED') && RESULTS.includes(outcome(row));
}
function counts(rows) {
  const result = Object.fromEntries(RESULTS.map(key => [key, 0]));
  for (const row of rows) if (isSettled(row)) result[outcome(row)]++;
  return result;
}
function rate(rows) {
  const c = counts(rows);
  const decided = c.WIN + c.LOSS + c.HALF_WIN + c.HALF_LOSS;
  return decided ? (c.WIN + c.HALF_WIN * .5) / decided * 100 : null;
}
function signature(data) {
  return JSON.stringify([data.ledgerTotal, data.total, data.pending, data.unresolved,
    data.win, data.loss, data.push, data.halfWin, data.halfLoss, data.ledgerUpdatedAt]);
}
async function page(params = {}) {
  const query = new URLSearchParams(params);
  query.set('paged', '1');
  query.set('_', String(Date.now()));
  const response = await fetch(`${API}?${query}`, {
    credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true || !Array.isArray(data.rows)) {
    throw new Error('Statistics feed unavailable');
  }
  if (!Number.isSafeInteger(data.total) || data.total < 0 ||
      !Number.isSafeInteger(data.ledgerTotal) || data.ledgerTotal < data.total) {
    throw new Error('Statistics ledger totals missing');
  }
  return data;
}
async function readAll() {
  let first = await page();
  // Compatibility with the old endpoint, until the cursor endpoint is installed.
  if (!('nextCursor' in first) && first.rows.length < first.ledgerTotal) {
    first = await page({limit:String(first.ledgerTotal)});
  }
  const rows = [];
  const ids = new Set();
  const cursors = new Set();
  let current = first;
  while (true) {
    if (signature(current) !== signature(first)) {
      throw new Error('Statistics changed during pagination; refresh required');
    }
    for (const row of current.rows) {
      if (!row?.id || ids.has(String(row.id))) throw new Error('Duplicate or missing statistics ID');
      ids.add(String(row.id));
      rows.push(row);
    }
    const cursor = current.nextCursor;
    if (!cursor) {
      if (current.hasMore === true) throw new Error('Statistics continuation missing');
      break;
    }
    if (!current.rows.length || cursors.has(cursor)) throw new Error('Statistics cursor did not advance');
    cursors.add(cursor);
    current = await page({cursor});
  }
  const settled = rows.filter(isSettled);
  const c = counts(settled);
  if (rows.length !== first.ledgerTotal || settled.length !== first.total) {
    throw new Error(`Incomplete statistics: ${settled.length}/${first.total} settled`);
  }
  for (const [result, field] of Object.entries(FIELDS)) {
    if (c[result] !== first[field]) throw new Error(`Statistics ${field} disagrees with ledger`);
  }
  if (rows.filter(row => row.status === 'PENDING').length !== first.pending ||
      rows.filter(row => row.status === 'UNRESOLVED').length !== first.unresolved) {
    throw new Error('Statistics pending/unresolved disagrees with ledger');
  }
  return Object.freeze({...first, rows:Object.freeze(settled), ledgerRows:Object.freeze(rows),
    returned:rows.length, nextCursor:null, hasMore:false});
}
async function load() {
  if (cached && Date.now() - loadedAt < CACHE_MS) return cached;
  if (loading) return loading;
  loading = readAll().then(data => {
    cached = data;
    loadedAt = Date.now();
    if (typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('ball46:statistics-snapshot', {detail:data}));
    }
    return data;
  });
  try { return await loading; } finally { loading = null; }
}
window.BALL46_STATISTICS_DATA = Object.freeze({load, outcome, isSettled, counts, rate});
})();
