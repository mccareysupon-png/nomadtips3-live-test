/**
 * ADD K AI ADAPTIVE — isolated V1 screening prototype.
 * Deterministic heuristic, NOT a trained or self-learning AI.
 * The code makes no network calls and cannot publish live selections.
 */
export const CONDITION_ID = 'ADD_K_AI_ADAPTIVE_V1';
export const MARKET_TYPES = Object.freeze(['AH', 'OU', '1X2', 'CORNERS']);
export const MODEL_VERSION = 'heuristic-v1-shadow';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const validTime = value => finite(value) && value > 0;
const normalize = value => String(value ?? '').trim().toUpperCase();

/**
 * The caller must normalize real provider records into this schema.
 * observations must cover the SAME selection, market and line.
 * Accept only independent observations with monotonically increasing times.
 */
export function evaluateCandidate(candidate, { nowMs = Date.now(), maxAgeMs = 300_000, minScore = 0.68 } = {}) {
  const reject = reason => ({ status: 'NO_PICK', reason, modelVersion: MODEL_VERSION });
  if (!candidate || !candidate.matchId || !MARKET_TYPES.includes(candidate.market)) return reject('INVALID_ID_OR_MARKET');
  if (!String(candidate.selection || '').trim()) return reject('NO_SELECTION');
  if (candidate.market !== '1X2' && !finite(candidate.line)) return reject('MISSING_LINE');
  if (!validTime(nowMs) || !finite(maxAgeMs) || maxAgeMs <= 0 || !finite(minScore) || minScore < 0 || minScore > 1) return reject('INVALID_SETTINGS');
  if (candidate.sourceVerified !== true) return reject('UNVERIFIED_SOURCE');
  if (!finite(candidate.momentum) || candidate.momentum < -1 || candidate.momentum > 1) return reject('MISSING_MOMENTUM');
  const observations = candidate.observations;
  if (!Array.isArray(observations) || observations.length < 2) return reject('NO_PRICE_HISTORY');
  if (observations.some(o => !validTime(o?.at) || !finite(o?.odds) || o.odds <= 1 || o.odds > 1000)) return reject('INVALID_PRICE');
  if (observations.some((o, i) => i && o.at <= observations[i - 1].at)) return reject('NON_MONOTONIC_HISTORY');
  if (observations.some(o => o.line !== candidate.line || o.selection !== candidate.selection)) return reject('CHANGED_MARKET_LINE');
  const first = observations[0], last = observations.at(-1);
  if (first.at > nowMs || last.at > nowMs || nowMs - last.at > maxAgeMs) return reject('STALE_PRICE');
  if (last.at - first.at < 60_000) return reject('INSUFFICIENT_TIME_SPAN');

  // Directional market-pressure proxy, NOT a probability or verified edge.
  const oddsMove = clamp((first.odds - last.odds) / first.odds / 0.1, -1, 1);
  const score = clamp(0.5 + 0.3 * candidate.momentum + 0.2 * oddsMove, 0, 1);
  if (score < minScore) return { status: 'NO_PICK', reason: 'BELOW_THRESHOLD', score, modelVersion: MODEL_VERSION };
  return { status: 'SHADOW_PICK', score, reason: 'SCREEN_PASSED', modelVersion: MODEL_VERSION,
    evidence: { momentum: candidate.momentum, oddsMove, firstAt: first.at, lastAt: last.at, lastOdds: last.odds } };
}

export function pickIdentity(record) {
  if (!record?.matchId || !MARKET_TYPES.includes(record.market) || !String(record.selection || '').trim()) return null;
  if (record.market !== '1X2' && !finite(record.line)) return null;
  return JSON.stringify([String(record.matchId), record.market, normalize(record.selection), record.market === '1X2' ? null : record.line]);
}

/** Creates a non-publishing candidate. A separate reviewed publisher is needed for live mode. */
export function createShadowSignal(candidate, evaluation, nowMs = Date.now()) {
  if (evaluation?.status !== 'SHADOW_PICK') return null;
  const key = pickIdentity(candidate);
  if (!key || !validTime(nowMs)) return null;
  return { id: `${CONDITION_ID}:${key}:${nowMs}`, matchId: candidate.matchId, market: candidate.market,
    selection: candidate.selection, line: candidate.market === '1X2' ? null : candidate.line,
    odds: evaluation.evidence.lastOdds, lockedAt: nowMs, conditionIds: [CONDITION_ID],
    modelVersion: evaluation.modelVersion || MODEL_VERSION, evaluation: evaluation.evidence, settlement: null,
    shadowOnly: true };
}

/**
 * Merge records using a stable canonical signal ID, or the exact lock event
 * (fixture + market + selection + line + lock time). Two independent signals
 * for the same pick at DIFFERENT times remain distinct entries in TOTAL.
 * Historical records without market or lock metadata are preserved, never
 * silently dropped or guessed to be duplicates. No persistence occurs here.
 */
export function mergeLedger(existing = [], aiSignals = []) {
  const byKey = new Map();
  let serial = 0;
  for (const record of [...existing, ...aiSignals]) {
    if (!record || typeof record !== 'object') continue;
    const conditions = [
      ...(Array.isArray(record.conditionIds) ? record.conditionIds : []),
      ...(record.conditionId ? [record.conditionId] : [])
    ];
    const selectionKey = pickIdentity(record);
    const key = String(record.canonicalSignalId ?? '').trim()
      ? `CANONICAL:${record.canonicalSignalId}`
      : selectionKey && validTime(record.lockedAt)
        ? `LOCK:${selectionKey}:${record.lockedAt}`
        : record.id != null
          ? `ID:${record.id}`
          : `LEGACY_UNKEYED:${serial++}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...record, conditionIds: [...new Set(conditions)] });
      continue;
    }
    byKey.set(key, { ...current, conditionIds: [...new Set([
      ...(current.conditionIds || []),
      ...conditions
    ])] });
  }
  return [...byKey.values()];
}

export function summarizeLedger(records = []) {
  const unique = mergeLedger(records);
  const stats = items => {
    const settled = items.filter(x => x?.settlement && x.settlement.result !== 'PENDING');
    const wins = settled.filter(x => /WIN/.test(x.settlement.result || '')).length;
    const losses = settled.filter(x => /LOSS/.test(x.settlement.result || '')).length;
    const pushes = settled.filter(x => x.settlement.result === 'PUSH').length;
    const profit = settled.reduce((s, x) => s + (finite(x.settlement.profit) ? x.settlement.profit : 0), 0);
    return { totalSignals: items.length, settled: settled.length, pending: items.length - settled.length,
      wins, losses, pushes, profit, winRate: wins + losses ? 100 * wins / (wins + losses) : null,
      roi: settled.length ? 100 * profit / settled.length : null };
  };
  return { total: stats(unique), aiAdaptive: stats(unique.filter(x => x.conditionIds?.includes(CONDITION_ID))) };
}
