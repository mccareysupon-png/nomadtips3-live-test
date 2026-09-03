import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPaidActiveSubscriber,
  normalizeSignal,
  signalKey,
  signalMessage
} from '../src/signal-bridge-core.mjs';

const locked = {
  selectedAt: '2026-09-03T09:00:00.000Z',
  selectionDate: '2026-09-03',
  fixtureId: '1576138',
  league: 'Test League',
  home: 'Home FC',
  away: 'Away FC',
  selectedSide: 'HOME',
  selectedTeam: 'Home FC',
  market: 'AH',
  selectedLine: -0.25,
  odds: 1.88,
  entryMinute: 67,
  entryScore: { home: 1, away: 0 }
};

test('accepts only locked/selected records', () => {
  assert.equal(normalizeSignal({ home: 'A', away: 'B' }), null);
  assert.equal(normalizeSignal(locked)?.selectedAt, locked.selectedAt);
});

test('uses a stable 64-char duplicate key', async () => {
  const first = await signalKey(locked);
  const second = await signalKey({ ...locked });
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test('real Signal delivery requires BOTH ACTIVE status and active=1', () => {
  assert.equal(isPaidActiveSubscriber({ status: 'ACTIVE', active: 1 }), true);
  assert.equal(isPaidActiveSubscriber({ status: 'ACTIVE', active: 0 }), false);
  assert.equal(isPaidActiveSubscriber({ status: 'PENDING_PAYMENT', active: 1 }), false);
  assert.equal(isPaidActiveSubscriber({ status: 'PENDING_PAYMENT', active: 0 }), false);
});

test('formats locked NOMAD data for Telegram', () => {
  const text = signalMessage(locked);
  assert.match(text, /NOMADTIPS3 · LIVE SIGNAL/);
  assert.match(text, /Home FC vs Away FC/);
  assert.match(text, /Home FC -0.25 @ 1.88/);
  assert.match(text, /67′ · SCORE 1-0/);
});
