const clean = value => String(value ?? '').trim();
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normalizeSignal(record = {}) {
  const selectedAt = clean(record.selectedAt || record.lockedAt || record.createdAt);
  if (!selectedAt) return null;

  const entryScore = record.entryScore && typeof record.entryScore === 'object'
    ? {
        home: finite(record.entryScore.home),
        away: finite(record.entryScore.away)
      }
    : null;

  return {
    selectedAt,
    fixtureId: clean(record.fixtureId || record.fixture_id || record.id),
    home: clean(record.home || record.homeTeam || record.home_name),
    away: clean(record.away || record.awayTeam || record.away_name),
    selectedTeam: clean(record.selectedTeam || record.selectedSide || record.pick || record.team),
    selectedLine: finite(record.selectedLine ?? record.line ?? record.ahLine),
    odds: finite(record.odds ?? record.selectedOdds ?? record.price),
    entryMinute: finite(record.entryMinute ?? record.minute),
    entryScore,
    source: clean(record.source || record.engine || 'NOMAD'),
    raw: record
  };
}

export async function signalKey(signal) {
  const normalized = signal?.raw ? signal : normalizeSignal(signal);
  if (!normalized) return '';
  const canonical = [
    normalized.selectedAt,
    normalized.fixtureId,
    normalized.home,
    normalized.away,
    normalized.selectedTeam,
    normalized.selectedLine ?? '',
    normalized.odds ?? ''
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isEligibleMember(member) {
  return String(member?.status || '').toUpperCase() === 'ACTIVE';
}

function fmtLine(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const text = Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return number > 0 ? `+${text}` : text;
}

export function signalMessage(signal) {
  const normalized = signal?.raw ? signal : normalizeSignal(signal);
  if (!normalized) return '';
  const minute = normalized.entryMinute === null ? 'LIVE' : `${Math.round(normalized.entryMinute)}′`;
  const score = normalized.entryScore && normalized.entryScore.home !== null && normalized.entryScore.away !== null
    ? `${normalized.entryScore.home}-${normalized.entryScore.away}`
    : '—';
  const odds = normalized.odds === null ? '—' : normalized.odds.toFixed(2);
  return [
    'NOMADTIPS3 · LIVE SIGNAL',
    `${normalized.home || '—'} vs ${normalized.away || '—'}`,
    `PICK: ${normalized.selectedTeam || '—'} ${fmtLine(normalized.selectedLine)} @ ${odds}`,
    `DETECTED: ${minute} · SCORE ${score}`,
    `LOCKED: ${normalized.selectedAt}`
  ].join('\n');
}
