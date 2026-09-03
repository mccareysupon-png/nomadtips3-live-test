const clean = (value) => String(value ?? '').trim();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function normalizeSignal(record = {}) {
  const selectedAt = clean(record.selectedAt || record.lockedAt);
  if (!selectedAt) return null;

  const selectedSide = clean(record.selectedSide || record.side || 'HOME').toUpperCase();
  const home = clean(record.home || record.homeTeam || record.home_name);
  const away = clean(record.away || record.awayTeam || record.away_name);
  const selectedTeam = clean(
    record.selectedTeam ||
    record.pick ||
    record.team ||
    (selectedSide === 'AWAY' ? away : home)
  );
  const entryScore = record.entryScore && typeof record.entryScore === 'object'
    ? { home: numberOrNull(record.entryScore.home), away: numberOrNull(record.entryScore.away) }
    : null;

  return {
    selectedAt,
    selectionDate: clean(record.selectionDate),
    fixtureId: clean(record.fixtureId || record.fixture_id || record.id),
    league: clean(record.league),
    home,
    away,
    selectedSide,
    selectedTeam,
    market: clean(record.market || 'AH').toUpperCase(),
    selectedLine: numberOrNull(record.selectedLine ?? record.line ?? record.ahLine),
    odds: numberOrNull(record.odds ?? record.selectedOdds ?? record.price),
    entryMinute: numberOrNull(record.entryMinute ?? record.minute),
    entryScore,
    source: clean(record.source || record.engine || 'NOMAD'),
    raw: record
  };
}

export async function signalKey(signalLike) {
  const signal = signalLike?.raw ? signalLike : normalizeSignal(signalLike);
  if (!signal) return '';
  const canonical = [
    signal.selectedAt,
    signal.fixtureId,
    signal.home,
    signal.away,
    signal.selectedSide,
    signal.selectedTeam,
    signal.market,
    signal.selectedLine ?? '',
    signal.odds ?? ''
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isPaidActiveSubscriber(row) {
  return String(row?.status || '').toUpperCase() === 'ACTIVE' && Number(row?.active) === 1;
}

function fmtLine(value) {
  const n = numberOrNull(value);
  if (n === null) return '—';
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return n > 0 ? `+${text}` : text;
}

export function signalMessage(signalLike) {
  const signal = signalLike?.raw ? signalLike : normalizeSignal(signalLike);
  if (!signal) return '';
  const minute = signal.entryMinute === null ? 'LIVE' : `${Math.round(signal.entryMinute)}′`;
  const score = signal.entryScore && signal.entryScore.home !== null && signal.entryScore.away !== null
    ? `${signal.entryScore.home}-${signal.entryScore.away}`
    : '—';
  const odds = signal.odds === null ? '—' : signal.odds.toFixed(2);
  const line = signal.market === '1X2' ? '' : ` ${fmtLine(signal.selectedLine)}`;
  return [
    'NOMADTIPS3 · LIVE SIGNAL',
    signal.league || null,
    `${signal.home || '—'} vs ${signal.away || '—'}`,
    `PICK: ${signal.selectedTeam || signal.selectedSide || '—'}${line} @ ${odds}`,
    `DETECTED: ${minute} · SCORE ${score}`,
    `LOCKED: ${signal.selectedAt}`
  ].filter(Boolean).join('\n');
}
