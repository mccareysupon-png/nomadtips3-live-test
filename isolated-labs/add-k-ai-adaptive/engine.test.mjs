import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITION_ID, MARKET_TYPES, evaluateCandidate, createShadowSignal, mergeLedger, summarizeLedger } from './engine.mjs';
const now = Date.parse('2026-10-22T12:00:00Z');
const candidate = (market = 'AH') => ({ matchId: `fixture-${market}`, market,
  selection: (market === 'OU' || market === 'CORNERS') ? 'OVER' : market === '1X2' ? 'HOME' : 'HOME',
  line: market === '1X2' ? undefined : market === 'OU' ? 2.5 : market === 'CORNERS' ? 9.5 : -0.5,
  sourceVerified: true, momentum: 0.8,
  observations: [{ at: now - 7 * 60_000, odds: 2.05, line: market === '1X2' ? undefined : market === 'OU' ? 2.5 : market === 'CORNERS' ? 9.5 : -0.5, selection: (market === 'OU' || market === 'CORNERS') ? 'OVER' : 'HOME' },
                 { at: now - 60_000, odds: 1.9, line: market === '1X2' ? undefined : market === 'OU' ? 2.5 : market === 'CORNERS' ? 9.5 : -0.5, selection: (market === 'OU' || market === 'CORNERS') ? 'OVER' : 'HOME' }] });

test('supports all four normalized market types without publishing', () => {
  assert.deepEqual(MARKET_TYPES, ['AH', 'OU', '1X2', 'CORNERS']);
  for (const market of MARKET_TYPES) {
    const c = candidate(market), evaluation = evaluateCandidate(c, { nowMs: now });
    assert.equal(evaluation.status, 'SHADOW_PICK');
    const signal = createShadowSignal(c, evaluation, now);
    assert.equal(signal?.shadowOnly, true);
    assert.deepEqual(signal?.conditionIds, [CONDITION_ID]);
  }
});
test('fail closed for missing/unverified/stale or malformed data', () => {
  assert.equal(evaluateCandidate({ ...candidate(), sourceVerified: false }, { nowMs: now }).reason, 'UNVERIFIED_SOURCE');
  assert.equal(evaluateCandidate({ ...candidate(), observations: [] }, { nowMs: now }).reason, 'NO_PRICE_HISTORY');
  assert.equal(evaluateCandidate({ ...candidate(), momentum: null }, { nowMs: now }).reason, 'MISSING_MOMENTUM');
  assert.equal(evaluateCandidate(candidate(), { nowMs: now + 12 * 60_000 }).reason, 'STALE_PRICE');
  const changed = candidate(); changed.observations[1].line = 0;
  assert.equal(evaluateCandidate(changed, { nowMs: now }).reason, 'CHANGED_MARKET_LINE');
});
test('duplicate signal of the same pick contributes once to total and AI', () => {
  const c = candidate(), ai = createShadowSignal(c, evaluateCandidate(c, { nowMs: now }), now);
  const original = { ...ai, id: 'old', conditionIds: ['LEGACY'], odds: 1.8, settlement: { result: 'WIN', profit: 0.8 }, shadowOnly: false };
  const over = createShadowSignal(candidate('OU'), evaluateCandidate(candidate('OU'), { nowMs: now }), now);
  const settledOver = { ...over, settlement: { result: 'LOSS', profit: -1 } };
  const records = mergeLedger([original], [ai, settledOver, settledOver]);
  assert.equal(records.length, 2);
  const ah = records.find(x => x.market === 'AH');
  assert.equal(ah.odds, 1.8);
  assert.equal(ah.settlement.result, 'WIN');
  assert.deepEqual(ah.conditionIds, ['LEGACY', CONDITION_ID]);
  const totals = summarizeLedger(records);
  assert.equal(totals.total.totalSignals, 2);
  assert.equal(totals.aiAdaptive.totalSignals, 2);
  assert.equal(totals.total.wins, 1);
  assert.equal(totals.total.losses, 1);
  assert.ok(Math.abs(totals.total.roi - (-10)) < 1e-9);
});

test('keeps separate locked signals at different timestamps and preserves old rows', () => {
  const c = candidate();
  const ai = createShadowSignal(c, evaluateCandidate(c, { nowMs: now }), now);
  const later = { ...ai, lockedAt: now + 300_000, id: 'later-event' };
  const legacy = { matchId: 'old-fixture', lockedAt: now - 60_000, selection: 'HOME',
    settlement: { result: 'WIN', profit: 0.6 } }; // old schema lacks market + id
  const joined = mergeLedger([legacy, ai], [later]);
  assert.equal(joined.length, 3);
  assert.equal(summarizeLedger(joined).total.totalSignals, 3);
  assert.equal(summarizeLedger(joined).aiAdaptive.totalSignals, 2);
});
