import test from 'node:test';
import assert from 'node:assert/strict';
import { captureLegacyAhQuote, appendLegacyAhQuote, buildLegacyAhCandidate } from './legacy-ah-adapter.mjs';
import { evaluateCandidate } from './engine.mjs';

const now = Date.parse('2026-10-22T12:00:00.000Z');
function mockLegacyMatch(priceAt, odds = 1.9, override = {}) {
  const selectedPrice = { id: 'source1', status: 'PASS', side: 'home',
    line: -0.5, odds, sourceUpdatedAt: priceAt, bookmaker: '1xBet' };
  return { id: 'verified-fixture-id', freshness: { sourceStale: false, oddsAt: priceAt },
    rolling: { available: true, recent: { homePressure: 18, awayPressure: 2 } },
    selectedPrice, priceSources: [{ ...selectedPrice }], ...override };
}
test('maps only matched PASS source into a source-time AH quote', () => {
  const match = mockLegacyMatch(now - 60_000);
  const got = captureLegacyAhQuote(match, now);
  assert.equal(got.ok, true);
  assert.equal(got.quote.market, 'AH');
  assert.equal(got.quote.line, -0.5);
  assert.equal(got.quote.selection, 'HOME');
  assert.equal(got.quote.sourceId, 'source1');
  assert.equal(got.quote.momentum, 0.8);
});
test('two provider timestamp observations can be screened without publishing', () => {
  const old = mockLegacyMatch(now - 360_000, 2.05);
  const fresh = mockLegacyMatch(now - 60_000, 1.9);
  const prior = appendLegacyAhQuote([], old, now - 350_000);
  assert.equal(prior.status, 'ADDED');
  const second = appendLegacyAhQuote(prior.history, fresh, now);
  assert.equal(second.status, 'ADDED');
  const candidate = buildLegacyAhCandidate(second.history, fresh, now);
  assert.equal(candidate.ok, true);
  assert.deepEqual(candidate.candidate.observations.map(o => o.odds), [2.05, 1.9]);
  assert.equal(evaluateCandidate(candidate.candidate, { nowMs: now }).status, 'SHADOW_PICK');
});
test('repeated polling same timestamp never creates fake history', () => {
  const match = mockLegacyMatch(now - 60_000);
  const first = appendLegacyAhQuote([], match, now);
  const repeat = appendLegacyAhQuote(first.history, match, now);
  assert.equal(repeat.status, 'DUPLICATE');
  assert.equal(repeat.history.length, 1);
  assert.equal(buildLegacyAhCandidate(repeat.history, match, now).reason, 'INSUFFICIENT_PRICE_HISTORY');
});
test('rejects stale, missing, unverified, mismatched or incomplete existing data', () => {
  const good = mockLegacyMatch(now - 60_000);
  const bad = [
    mockLegacyMatch(now - 360_000),
    mockLegacyMatch(now - 60_000, 1.9, { freshness: { sourceStale: true } }),
    mockLegacyMatch(now - 60_000, 1.9, { rolling: { available: false } }),
    mockLegacyMatch(now - 60_000, 1.9, { priceSources: [] }),
    mockLegacyMatch(now - 60_000, 1.9, { selectedPrice: { ...good.selectedPrice, odds: null } }),
    mockLegacyMatch(now - 60_000, 1.9, { selectedPrice: { ...good.selectedPrice, side: 'both' } })
  ];
  bad.forEach(match => assert.equal(captureLegacyAhQuote(match, now).ok, false));
});
test('will not mix bookmakers, source IDs, AH lines or future records', () => {
  const old = mockLegacyMatch(now - 400_000, 2.05);
  const fresh = mockLegacyMatch(now - 60_000, 1.9);
  const history = [captureLegacyAhQuote(old, now - 390_000).quote];
  const changed = history.map(x => ({ ...x, bookmaker: 'OtherBook' }));
  assert.equal(buildLegacyAhCandidate(changed, fresh, now).reason, 'CURRENT_PRICE_NOT_IN_HISTORY');
  const mixed = [...history, { ...history[0], line: -0.25 }];
  assert.equal(buildLegacyAhCandidate(mixed, fresh, now).reason, 'CURRENT_PRICE_NOT_IN_HISTORY');
  assert.equal(buildLegacyAhCandidate([...history, { ...history[0], at: now + 200_000 }], fresh, now).reason, 'CURRENT_PRICE_NOT_IN_HISTORY');
});
