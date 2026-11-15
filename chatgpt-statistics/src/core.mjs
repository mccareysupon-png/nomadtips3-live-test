// Normalization of REAL BALL46 ledger rows, with no historical reaggregation.
export const ALL = '__ALL__';
const london = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23'
});
function timestamp(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
    const n = Number(value); return n > 1e12 ? n : n > 1e9 ? n * 1000 : NaN;
  }
  return Date.parse(String(value));
}
export function sportDay(value) {
  const ms = timestamp(value);
  if (!Number.isFinite(ms)) throw new Error('INVALID_CREATED_AT');
  const parts = london.formatToParts(new Date(ms)).filter(x => x.type !== 'literal');
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const utc = Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day));
  const day = Number(p.hour) < 6 ? utc - 86400000 : utc;
  return new Date(day).toISOString().slice(0, 10);
}
export function normalize(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('ROW_NOT_OBJECT');
  // Fixture ID is not a unique pick ID: one match may produce many signals.
  const id = String(row.id ?? row.signalId ?? '').trim();
  if (!id || id.length > 160) throw new Error('MISSING_STABLE_SIGNAL_ID');
  const day = sportDay(row.createdAt ?? row.created_at);
  const market = String(row.market ?? row.marketType ?? 'OTHER').trim().toUpperCase();
  if (!market || market === ALL || market.length > 70) throw new Error('INVALID_MARKET');
  const candidate = String(row.result ?? row.settlement ?? row.outcome ?? '').trim().toUpperCase();
  const status = String(row.status ?? '').trim().toUpperCase();
  const state = ['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID'].includes(candidate)
    ? (candidate === 'VOID' ? 'PUSH' : candidate)
    : (candidate === 'PENDING' || status === 'PENDING' ? 'PENDING' : null);
  if (!state) throw new Error('UNKNOWN_SETTLEMENT');
  const rawOdds = row.odds;
  const oddsNum = rawOdds === null || rawOdds === undefined || rawOdds === '' ? NaN : Number(rawOdds);
  const odds = Number.isFinite(oddsNum) && oddsNum > 1 ? oddsNum : null;
  // No guessed P/L: a real upstream profitUnits field is mandatory for P/L coverage.
  const rawProfit = row.profitUnits;
  const p = rawProfit === null || rawProfit === undefined || rawProfit === '' ? NaN : Number(rawProfit);
  const profit = state !== 'PENDING' && Number.isFinite(p) ? p : null;
  const fingerprint = JSON.stringify([id, day, market, state, odds, profit]);
  return { id, day, market, state, odds, profit, fingerprint, raw_json: JSON.stringify(row) };
}
