import assert from 'node:assert/strict';
import {
  dailySignalAnalytics,
  normalizeCandidateHistory,
  normalizeSignalAnalytics,
  summarizeSignalAnalytics,
  writeLatestState
} from '../cloudflare-worker/src/v2-storage.js';

const now = Date.parse('2026-08-12T02:00:00Z');
const base = {
  signal_id: 'VPS-7-HOME-1',
  signal_key: '7:HOME',
  fixture_id: '7',
  selection: 'HOME',
  selected_team: 'Alpha',
  opponent: 'Beta',
  market: 'AH',
  minute: 60,
  score: { home: 1, away: 1 },
  target_odds: 1.8,
  ah_line: 0.75,
  stake_units: 1,
  created_at: '2026-08-12T01:00:00Z'
};
const signals = [
  { ...base, signal_id: 'win', outcome: 'WIN', settlement: 'FULL WIN', profit_units: 0.8 },
  { ...base, signal_id: 'loss', outcome: 'LOSS', settlement: 'FULL LOSS', profit_units: -1 },
  { ...base, signal_id: 'push', outcome: 'PUSH', settlement: 'PUSH', profit_units: 0 },
  { ...base, signal_id: 'pending', outcome: 'PENDING', settlement: 'PENDING', profit_units: 0 },
];

const summary = summarizeSignalAnalytics(signals);
assert.deepEqual(
  { total: summary.total, win: summary.win, loss: summary.loss, push: summary.push, pending: summary.pending },
  { total: 4, win: 1, loss: 1, push: 1, pending: 1 }
);
assert.equal(summary.netUnits, -0.2);
assert.equal(summary.roiPercent, -6.67);
assert.equal(summary.accuracyPercent, 50);

const daily = dailySignalAnalytics(signals, 7, now);
assert.equal(daily.length, 7);
assert.equal(daily.at(-1).signals, 4);
assert.equal(daily.at(-1).cumulativeUnits, -0.2);

const candidate = normalizeCandidateHistory({
  candidate_key: '7:HOME', fixture_id: 7, side: 'HOME', selected_team: 'Alpha',
  opponent: 'Beta', minute: 61, score: '1-1', momentum: 72, streak: 2,
  state: 'CONFIRMING', triggered: false
}, now);
assert.equal(candidate.candidateKey, '7:HOME');
assert.equal(candidate.momentum, 72);
assert.equal(normalizeSignalAnalytics(signals[0]).outcome, 'WIN');

class Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
}
class MemoryDb {
  constructor() { this.batches = []; }
  prepare(sql) { return new Statement(sql); }
  async batch(statements) { this.batches.push(statements); return statements.map(() => ({ success: true })); }
}

const db = new MemoryDb();
await writeLatestState({ DB: db }, {
  collector_id: 'test',
  state_hash: 'a'.repeat(64),
  payload: {
    schema: 'nomadtips3.live.v2.fixture-snapshot',
    generated_at: new Date(now).toISOString(),
    engine: {
      active_candidates: [{ ...candidate.payload, candidate_key: '7:HOME' }],
      recent_signals: [signals[0]]
    }
  }
});
const statements = db.batches.flat();
assert.ok(statements.some(statement => /INSERT INTO v2_latest_state/.test(statement.sql)));
assert.ok(statements.some(statement => /INSERT INTO v2_candidate_history/.test(statement.sql)));
assert.ok(statements.some(statement => /INSERT INTO v2_signal_analytics/.test(statement.sql)));
assert.ok(statements.some(statement => /DELETE FROM v2_candidate_history/.test(statement.sql)));

console.log('V2 analytics, history, and ingestion tests passed.');
