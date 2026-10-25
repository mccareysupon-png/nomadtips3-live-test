/**
 * ADD K AI ADAPTIVE: opt-in, offline supervised model experiment.
 * Shadow-only; no network, deploy, live signals, or automatic training.
 * All features are available at the historical decision timestamp.
 */
import { MARKET_TYPES } from './engine.mjs';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const clip = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sigmoid = z => 1 / (1 + Math.exp(-clip(z, -35, 35)));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Reject incomplete/stale prices and observations recorded after the decision. */
export function extractFeatures(candidate, atMs, maxAgeMs = 300_000) {
  if (!finite(atMs) || atMs <= 0 || !finite(maxAgeMs) || maxAgeMs <= 0 ||
      !MARKET_TYPES.includes(candidate?.market) || !candidate?.matchId ||
      !String(candidate?.selection || '').trim() || candidate?.sourceVerified !== true ||
      !finite(candidate?.momentum) || Math.abs(candidate.momentum) > 1 ||
      (candidate.market !== '1X2' && !finite(candidate?.line))) return null;
  const obs = candidate.observations;
  if (!Array.isArray(obs) || obs.length < 2 ||
      obs.some(o => !finite(o?.at) || o.at <= 0 || !finite(o.odds) || o.odds <= 1 || o.odds > 1000 ||
        o.selection !== candidate.selection || o.line !== candidate.line) ||
      obs.some((o, i) => i > 0 && o.at <= obs[i - 1].at)) return null;
  const first = obs[0], last = obs[obs.length - 1];
  if (first.at > atMs || last.at > atMs || atMs - last.at > maxAgeMs ||
      last.at - first.at < 60_000) return null;
  const prices = obs.map(o => o.odds);
  const drift = clip((first.odds - last.odds) / first.odds / 0.1, -1, 1);
  const volatility = clip((Math.max(...prices) - Math.min(...prices)) / first.odds / 0.2, 0, 1);
  const span = clip((last.at - first.at) / 7_200_000, 0, 1);
  const price = clip((last.odds - 1) / 5, 0, 1);
  return [1, candidate.momentum, drift, volatility, span, price];
}

function trainWeights(rows, { epochs = 280, learningRate = 0.17, l2 = 0.025 } = {}) {
  const w = Array(6).fill(0);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = Array(w.length).fill(0);
    for (const row of rows) {
      const error = sigmoid(dot(w, row.x)) - row.y;
      row.x.forEach((v, i) => { grad[i] += error * v; });
    }
    w.forEach((value, i) => {
      const reg = i === 0 ? 0 : l2 * value;
      w[i] -= learningRate * (grad[i] / rows.length + reg);
    });
  }
  return w;
}

/**
 * Records: {candidate, lockedAt, settledAt, result: 'WIN'|'LOSS', canonicalSignalId?}.
 * Only full WIN/LOSS. PUSH, void, partial, pending and malformed results are excluded.
 * Evaluation set must begin strictly AFTER all train-set outcomes were available.
 */
export function trainShadowModel(records, market, {
  asOfMs = Date.now(), minTraining = 40, minValidation = 8
} = {}) {
  const fail = (reason, extra = {}) => ({ ready: false, reason, market, ...extra });
  if (!MARKET_TYPES.includes(market) || !finite(asOfMs) || asOfMs <= 0 ||
      !Number.isInteger(minTraining) || minTraining < 10 ||
      !Number.isInteger(minValidation) || minValidation < 4) return fail('INVALID_SETTINGS');
  if (!Array.isArray(records)) return fail('INVALID_RECORDS');
  const seen = new Set();
  const eligible = [];
  for (const r of records) {
    if (r?.candidate?.market !== market || (r.result !== 'WIN' && r.result !== 'LOSS') ||
        !finite(r.lockedAt) || !finite(r.settledAt) ||
        r.lockedAt >= r.settledAt || r.settledAt > asOfMs) continue;
    const x = extractFeatures(r.candidate, r.lockedAt);
    if (!x) continue;
    const key = r.canonicalSignalId != null
      ? String(r.canonicalSignalId)
      : JSON.stringify([r.candidate.matchId, market, r.candidate.selection, r.candidate.line ?? null, r.lockedAt]);
    if (seen.has(key)) continue;
    seen.add(key);
    eligible.push({ x, y: r.result === 'WIN' ? 1 : 0, lockedAt: r.lockedAt, settledAt: r.settledAt });
  }
  eligible.sort((a, b) => a.settledAt - b.settledAt || a.lockedAt - b.lockedAt);
  if (eligible.length < minTraining + minValidation) return fail('INSUFFICIENT_SETTLED_HISTORY', { sampleCount: eligible.length });
  const trainingEndIndex = Math.max(minTraining, Math.floor(eligible.length * 0.75));
  const train = eligible.slice(0, trainingEndIndex);
  const lastTrainSettlement = train.at(-1).settledAt;
  const validate = eligible.slice(trainingEndIndex).filter(row => row.lockedAt > lastTrainSettlement);
  if (validate.length < minValidation) return fail('NO_LEAKAGE_SAFE_HOLDOUT', { trainCount: train.length, validationCount: validate.length });
  const wins = train.reduce((n, row) => n + row.y, 0);
  if (wins === 0 || wins === train.length) return fail('SINGLE_CLASS_TRAINING');
  const weights = trainWeights(train);
  const baseRate = wins / train.length;
  const modelBrier = validate.reduce((n, row) => n + (sigmoid(dot(weights, row.x)) - row.y) ** 2, 0) / validate.length;
  const baselineBrier = validate.reduce((n, row) => n + (baseRate - row.y) ** 2, 0) / validate.length;
  // Does not claim predictive quality unless it improves chronological baseline.
  const ready = modelBrier + 0.001 < baselineBrier;
  return { ready, reason: ready ? 'CHRONOLOGICAL_VALIDATION_PASSED' : 'NO_VALIDATED_IMPROVEMENT',
    market, asOfMs, weights: ready ? weights : null, sampleCount: eligible.length,
    trainCount: train.length, validationCount: validate.length,
    modelBrier, baselineBrier, modelVersion: 'logistic-shadow-v1' };
}

/** No signal is possible without a validated, same-market model. */
export function predictShadow(model, candidate, atMs, minScore = 0.68) {
  const fail = reason => ({ status: 'NO_PICK', reason });
  if (!model?.ready || model.market !== candidate?.market || !Array.isArray(model.weights) ||
      model.weights.length !== 6 || !model.weights.every(finite) ||
      !finite(model.asOfMs) || model.asOfMs > atMs ||
      !finite(minScore) || minScore < 0 || minScore > 1) return fail('NO_VALIDATED_MODEL');
  const x = extractFeatures(candidate, atMs);
  if (!x) return fail('BAD_OR_STALE_DATA');
  const score = sigmoid(dot(model.weights, x));
  return { status: score >= minScore ? 'SHADOW_PICK' : 'NO_PICK',
    reason: score >= minScore ? 'SCREEN_PASSED' : 'BELOW_THRESHOLD',
    score, modelVersion: model.modelVersion, market: candidate.market,
    evidence: { lastOdds: candidate.observations.at(-1).odds,
      firstAt: candidate.observations[0].at, lastAt: candidate.observations.at(-1).at,
      momentum: candidate.momentum, modelAsOfMs: model.asOfMs },
    // This score must NOT be presented as calibrated betting probability.
    calibratedProbability: false };
}
