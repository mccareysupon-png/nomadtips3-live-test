/**
 * Read-only bridge for the existing nomad-live-engine AH /feed match shape.
 * Existing /feed exposes one price snapshot per cycle, NOT price history.
 * This module NEVER fetches, persists, posts, signals, or modifies production.
 */
const finite = n => typeof n === 'number' && Number.isFinite(n);
const same = (a, b) => a === b;
const reject = reason => ({ ok: false, reason });
const twoHoursMs = 2 * 60 * 60 * 1000;

/**
 * Capture a single source-timestamped price observation from existing
 * publicPriceSourceSnapshot() fields, only when its PASS record corroborates
 * selectedPrice and the rolling stats are complete.
 */
export function captureLegacyAhQuote(match, observedAtMs, maxPriceAgeMs = 300_000) {
  if (!finite(observedAtMs) || observedAtMs <= 0 ||
      !finite(maxPriceAgeMs) || maxPriceAgeMs <= 0 ||
      match?.id == null || match?.freshness?.sourceStale !== false) return reject('MISSING_MATCH_OR_FRESHNESS');
  if (match?.rolling?.available !== true) return reject('NO_ROLLING_STATS');
  const recent = match.rolling.recent;
  const h = recent?.homePressure, a = recent?.awayPressure;
  if (!finite(h) || !finite(a) || h < 0 || a < 0 || h + a <= 0) return reject('INVALID_PRESSURE');
  const selected = match.selectedPrice;
  const side = String(selected?.side || '').toUpperCase();
  if (selected?.status !== 'PASS' || !['HOME', 'AWAY'].includes(side) ||
      !String(selected?.id || '') || !String(selected?.bookmaker || '').trim()) return reject('NO_VERIFIED_AH_SELECTION');
  const peers = Array.isArray(match.priceSources) ? match.priceSources : [];
  const peer = peers.find(x => x?.id === selected.id && x.status === 'PASS' && x.side === selected.side);
  if (!peer || !same(peer.line, selected.line) ||
      !same(peer.odds, selected.odds) ||
      !same(peer.sourceUpdatedAt, selected.sourceUpdatedAt) ||
      !same(peer.bookmaker, selected.bookmaker)) return reject('PRICE_SOURCE_MISMATCH');
  const line = selected.line, odds = selected.odds, at = selected.sourceUpdatedAt;
  if (!finite(line) || !finite(odds) || odds <= 1 || odds > 1000 ||
      !finite(at) || at <= 0 || at > observedAtMs ||
      observedAtMs - at > maxPriceAgeMs ||
      (match.freshness.oddsAt != null && match.freshness.oddsAt !== at)) return reject('INVALID_OR_STALE_PRICE');
  const momentum = (side === 'HOME' ? h - a : a - h) / (h + a);
  return { ok: true, quote: {
    matchId: String(match.id), market: 'AH', selection: side, line, odds, at,
    sourceId: selected.id, bookmaker: selected.bookmaker,
    sourceVerified: true, momentum
  } };
}

/** Append an immutable price change only; no duplicate re-poll inflation. */
export function appendLegacyAhQuote(history = [], match, observedAtMs) {
  const current = Array.isArray(history) ? history : [];
  const read = captureLegacyAhQuote(match, observedAtMs);
  if (!read.ok) return { ...read, history: [...current] };
  const q = read.quote;
  const exact = current.find(x =>
    x?.matchId === q.matchId && x.market === q.market &&
    x.selection === q.selection && x.line === q.line &&
    x.sourceId === q.sourceId && x.bookmaker === q.bookmaker && x.at === q.at
  );
  if (exact) return {
    ok: true,
    status: exact.odds === q.odds ? 'DUPLICATE' : 'CONFLICT',
    history: [...current]
  };
  return { ok: true, status: 'ADDED', history: [...current, q] };
}

/**
 * Create a model-ready AH candidate only from TWO distinct, independently
 * timestamped observations of the same selection, source and fixed AH line.
 * Callers must persist observations separately; no price is synthesized.
 */
export function buildLegacyAhCandidate(history, match, observedAtMs) {
  const read = captureLegacyAhQuote(match, observedAtMs);
  if (!read.ok) return read;
  if (!Array.isArray(history)) return reject('NO_PRICE_HISTORY');
  const q = read.quote;
  const relevant = history.filter(x =>
    x?.matchId === q.matchId && x.market === q.market &&
    x.selection === q.selection && x.line === q.line &&
    x.sourceId === q.sourceId && x.bookmaker === q.bookmaker &&
    x.sourceVerified === true && finite(x.at) && finite(x.odds) &&
    x.odds > 1 && x.odds <= 1000 &&
    x.at <= observedAtMs && x.at >= observedAtMs - twoHoursMs
  ).sort((a, b) => a.at - b.at);
  const byAt = new Map();
  for (const x of relevant) {
    if (byAt.has(x.at) && byAt.get(x.at).odds !== x.odds) return reject('CONFLICTING_HISTORY');
    byAt.set(x.at, x);
  }
  const rows = [...byAt.values()];
  const latest = rows.at(-1);
  if (!latest || latest.at !== q.at || latest.odds !== q.odds) return reject('CURRENT_PRICE_NOT_IN_HISTORY');
  if (rows.length < 2 || latest.at - rows[0].at < 60_000) return reject('INSUFFICIENT_PRICE_HISTORY');
  const observations = rows.map(({ at, odds, selection, line }) => ({ at, odds, selection, line }));
  return { ok: true, candidate: {
    matchId: q.matchId, market: 'AH', selection: q.selection, line: q.line,
    sourceVerified: true, momentum: q.momentum, observations
  }, source: { id: q.sourceId, bookmaker: q.bookmaker, lastUpdatedAt: q.at } };
}
