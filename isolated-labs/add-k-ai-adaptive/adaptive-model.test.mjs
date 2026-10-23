import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures, trainShadowModel, predictShadow } from './adaptive-model.mjs';
import { createShadowSignal, CONDITION_ID } from './engine.mjs';

const origin = Date.parse('2026-01-01T00:00:00Z');
const day = 24 * 60 * 60 * 1000;
function example(i, market = 'AH') {
  const lock = origin + i * day;
  const won = i % 2 === 0;
  const line = market === '1X2' ? undefined : market === 'OU' ? 2.5 : market === 'CORNERS' ? 9.5 : -0.5;
  const selection = market === '1X2' ? 'HOME' : 'OVER';
  const candidate = { matchId: 'fixture-' + i, market, selection, line, sourceVerified: true,
    momentum: won ? 0.95 : -0.95,
    observations: [
      { at: lock - 420_000, odds: won ? 2.12 : 1.84, selection, line },
      { at: lock - 60_000, odds: won ? 1.85 : 2.15, selection, line }
    ] };
  return { candidate, lockedAt: lock, settledAt: lock + 90 * 60_000, result: won ? 'WIN' : 'LOSS' };
}
test('training requires chronological holdout with no future outcomes', () => {
  const rows = Array.from({ length: 76 }, (_, i) => example(i));
  const trained = trainShadowModel(rows, 'AH', { asOfMs: origin + 80 * day });
  assert.equal(trained.ready, true);
  assert.ok(trained.modelBrier < trained.baselineBrier);
  assert.ok(trained.validationCount >= 8);
  const incomplete = trainShadowModel(rows.slice(0, 7), 'AH', { asOfMs: origin + 80 * day });
  assert.equal(incomplete.reason, 'INSUFFICIENT_SETTLED_HISTORY');
  const future = rows.map(r => ({ ...r, settledAt: origin + 200 * day }));
  assert.equal(trainShadowModel(future, 'AH', { asOfMs: origin + 80 * day }).ready, false);
});
test('inference rejects other markets, stale feed, and unvalidated model', () => {
  const rows = Array.from({ length: 76 }, (_, i) => example(i));
  const model = trainShadowModel(rows, 'AH', { asOfMs: origin + 80 * day });
  const live = example(82).candidate;
  const picked = predictShadow(model, live, origin + 82 * day, 0.6);
  assert.equal(picked.status, 'SHADOW_PICK');
  assert.equal(picked.calibratedProbability, false);
  assert.equal(predictShadow(model, example(82, 'OU').candidate, origin + 82 * day).reason, 'NO_VALIDATED_MODEL');
  assert.equal(predictShadow(model, live, origin + 82 * day + 9 * 60_000).reason, 'BAD_OR_STALE_DATA');
  assert.equal(predictShadow({ ...model, ready: false }, live, origin + 82 * day).reason, 'NO_VALIDATED_MODEL');
});
test('duplicate training rows do not increase sample count', () => {
  const rows = Array.from({ length: 76 }, (_, i) => example(i));
  const t = trainShadowModel([...rows, ...rows], 'AH', { asOfMs: origin + 80 * day });
  assert.equal(t.sampleCount, 76);
});
test('invalid and future price observations are rejected without guessing values', () => {
  const { candidate, lockedAt } = example(5);
  assert.ok(extractFeatures(candidate, lockedAt));
  assert.equal(extractFeatures({ ...candidate, sourceVerified: false }, lockedAt), null);
  assert.equal(extractFeatures({ ...candidate, observations: [{ ...candidate.observations[0], at: lockedAt + 100 }, candidate.observations[1]] }, lockedAt), null);
  assert.equal(extractFeatures({ ...candidate, observations: candidate.observations.map(o => ({ ...o, line: 4.5 })) }, lockedAt), null);
});

test('validated model shadow pick carries price and version into distinct locked records', () => {
  const history = Array.from({ length: 76 }, (_, i) => example(i));
  const model = trainShadowModel(history, 'AH', { asOfMs: origin + 80 * day });
  const c = example(82).candidate, lockTime = origin + 82 * day;
  const evaluation = predictShadow(model, c, lockTime, 0.6);
  assert.equal(evaluation.status, 'SHADOW_PICK');
  const signal = createShadowSignal(c, evaluation, lockTime);
  assert.equal(signal.odds, 1.85);
  assert.equal(signal.modelVersion, 'logistic-shadow-v1');
  assert.equal(signal.conditionIds[0], CONDITION_ID);
  assert.equal(signal.shadowOnly, true);
  assert.ok(signal.id.includes(String(lockTime)));
  assert.equal(createShadowSignal(c, evaluation, lockTime + 60_000).id !== signal.id, true);
});
