import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize, sportDay } from '../src/core.mjs';

// Technical invariants only. These checks are NOT evidence of real BALL46 parity.
test('London 06:00 cutoff respects British summer time', () => {
  assert.equal(sportDay('2026-11-15T05:59:00Z'), '2026-11-14');
  assert.equal(sportDay('2026-11-15T06:00:00Z'), '2026-11-15');
  assert.equal(sportDay('2026-07-01T04:59:00Z'), '2026-06-30');
  assert.equal(sportDay('2026-07-01T05:00:00Z'), '2026-07-01');
});
test('stable signal IDs distinguish multiple picks on a single fixture', () => {
  const base = { fixtureId: 'fixture', createdAt:'2026-11-15T08:00:00Z', market:'AH', result:'WIN' };
  assert.notEqual(normalize({ ...base, id:'signal-1' }).id, normalize({ ...base, id:'signal-2' }).id);
  assert.equal(normalize({ ...base, id:'signal-1' }).profit, null);
});
test('a corrected settlement changes its fingerprint', () => {
  const base = { id:'signal-1', createdAt:'2026-11-15T08:00:00Z', market:'AH', status:'PENDING', odds:1.89 };
  const original = normalize(base);
  const corrected = normalize({ ...base, result:'HALF_WIN', profitUnits:0.445 });
  assert.notEqual(original.fingerprint, corrected.fingerprint);
  assert.equal(corrected.profit, 0.445);
});
test('fixture-only identity is rejected rather than silently deduplicated', () => {
  assert.throws(() => normalize({ fixtureId:'fixture', createdAt:'2026-11-15T08:00:00Z', result:'WIN' }), /MISSING_STABLE_SIGNAL_ID/);
});
