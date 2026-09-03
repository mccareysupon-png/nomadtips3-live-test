import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleMember, normalizeSignal, signalKey, signalMessage } from '../src/signal-bridge-core.mjs';

const sample = {
  selectedAt: '2026-09-03T09:00:00.000Z',
  fixtureId: '1576138',
  home: 'Home FC',
  away: 'Away FC',
  selectedTeam: 'Home FC',
  selectedLine: -0.25,
  odds: 1.88,
  entryMinute: 67,
  entryScore: { home: 1, away: 0 },
  source: 'NOMAD'
};

test('normalizes a locked NOMAD signal', () => {
  const signal = normalizeSignal(sample);
  assert.equal(signal.selectedAt, sample.selectedAt);
  assert.equal(signal.fixtureId, '1576138');
  assert.equal(signal.selectedTeam, 'Home FC');
  assert.equal(signal.selectedLine, -0.25);
  assert.equal(signal.odds, 1.88);
});

test('rejects records that are not locked/selected', () => {
  assert.equal(normalizeSignal({ home: 'A', away: 'B' }), null);
});

test('builds a stable duplicate key', async () => {
  const a = await signalKey(sample);
  const b = await signalKey({ ...sample });
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('only ACTIVE members are eligible for real delivery', () => {
  assert.equal(isEligibleMember({ status: 'ACTIVE' }), true);
  assert.equal(isEligibleMember({ status: 'PENDING_PAYMENT' }), false);
  assert.equal(isEligibleMember({ status: 'PAST_DUE' }), false);
  assert.equal(isEligibleMember({ status: 'CANCELED' }), false);
});

test('formats the Telegram signal message from locked data', () => {
  const message = signalMessage(sample);
  assert.match(message, /NOMADTIPS3 · LIVE SIGNAL/);
  assert.match(message, /Home FC vs Away FC/);
  assert.match(message, /Home FC -0.25 @ 1.88/);
  assert.match(message, /67′ · SCORE 1-0/);
});
