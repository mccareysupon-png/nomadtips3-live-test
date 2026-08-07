import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberConfig, provisionMember } from '../cloudflare-worker/src/member-config.js';
import { runMemberLiveBackgroundScans } from '../cloudflare-worker/src/member-live-evaluator.js';

class D1Statement {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }
  bind(...bindings) {
    return new D1Statement(this.db, this.sql, bindings);
  }
  async run() {
    const stmt = this.db.prepare(this.sql);
    const result = stmt.run(...this.bindings);
    return { success: true, meta: result };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.bindings) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.bindings) };
  }
}

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }
  prepare(sql) {
    return new D1Statement(this.db, sql);
  }
  async batch(statements) {
    const results = [];
    this.db.exec('BEGIN');
    try {
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function configRequest(path, body) {
  return new Request(`https://member-test.local${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function stats(home, away) {
  const rows = values => [
    { type: 'Attacks', value: values.attacks },
    { type: 'Dangerous Attacks', value: values.dangerous },
    { type: 'Total Shots', value: values.shots },
    { type: 'Shots on Goal', value: values.onTarget },
    { type: 'Corner Kicks', value: values.corners },
    { type: 'Ball Possession', value: `${values.possession}%` },
    { type: 'Red Cards', value: 0 }
  ];
  return [
    { team: { name: 'Alpha' }, statistics: rows(home) },
    { team: { name: 'Beta' }, statistics: rows(away) }
  ];
}

let scanNumber = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const path = new URL(String(url)).pathname + new URL(String(url)).search;
  if (path === '/fixtures?live=all') {
    return Response.json({
      response: [{
        fixture: {
          id: 123,
          date: '2026-08-07T12:00:00Z',
          status: { short: '2H', elapsed: scanNumber === 0 ? 65 : 66 }
        },
        league: { name: 'Test League', country: 'Testland' },
        teams: { home: { name: 'Alpha' }, away: { name: 'Beta' } },
        goals: { home: 0, away: 0 }
      }]
    });
  }
  if (path === '/fixtures?ids=123') {
    const baseline = scanNumber === 0;
    return Response.json({
      response: [{
        fixture: { id: 123 },
        statistics: baseline
          ? stats(
              { attacks: 50, dangerous: 20, shots: 5, onTarget: 2, corners: 2, possession: 50 },
              { attacks: 50, dangerous: 20, shots: 5, onTarget: 2, corners: 2, possession: 50 }
            )
          : stats(
              { attacks: 70, dangerous: 28, shots: 9, onTarget: 5, corners: 4, possession: 52 },
              { attacks: 52, dangerous: 21, shots: 6, onTarget: 2, corners: 2, possession: 48 }
            )
      }]
    });
  }
  if (path === '/odds/live') {
    const response = Response.json({
      response: [{
        fixture: { id: 123 },
        odds: [
          { name: 'Match Winner', values: [{ value: 'Alpha', odd: '1.80' }, { value: 'Beta', odd: '2.20' }] },
          { name: 'Asian Handicap', values: [{ value: 'Alpha', handicap: '+0.5', odd: '1.90' }, { value: 'Beta', handicap: '-0.5', odd: '1.90' }] }
        ]
      }]
    });
    scanNumber += 1;
    return response;
  }
  throw new Error(`Unexpected API request: ${path}`);
};

try {
  const env = { DB: new D1Database(), API_FOOTBALL_KEY: 'test-key' };
  await provisionMember(env, '0001', { status: 'ACTIVE' });

  const url = new URL('https://member-test.local/member-live-config?member=0001');
  const request = configRequest('/member-live-config?member=0001', {
    action: 'run',
    config: {
      side: 'HOME',
      minuteMin: 60,
      minuteMax: 80,
      market: 'WIN',
      oddsMin: 1.5,
      oddsMax: null,
      ahMin: 0.25,
      ahMax: null,
      momentumMin: 60,
      goalGapLimited: false,
      maxGoalGap: 1,
      confirmationRounds: 1,
      signalLimitEnabled: false,
      maxSignalsPerDay: 3
    }
  });
  const activated = await handleMemberConfig(request, env, url);
  assert.equal(activated.status, 200);
  assert.equal(activated.data.active.momentumMin, 60);

  const first = await runMemberLiveBackgroundScans(env);
  assert.equal(first.members, 1);
  assert.equal(first.results[0].usage.totalRequests, 3);
  let state = await env.DB.prepare('SELECT * FROM member_live_state WHERE member_id = ? AND state_key = ?')
    .bind('0001', '123:HOME').first();
  assert.ok(state);
  assert.equal(state.momentum, null);
  assert.equal(Number(state.triggered), 0);
  const baselinePayload = JSON.parse(state.payload_json);
  assert.equal(Number(baselinePayload.stats?.attacks?.home), 50);
  assert.equal(Number(baselinePayload.stats?.dangerous_attacks?.home), 20);
  assert.equal(scanNumber, 1);
  console.log('PASS: first independent member scan stores its own baseline state');

  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await runMemberLiveBackgroundScans(env);
  assert.equal(second.results[0].usage.totalRequests, 3);
  state = await env.DB.prepare('SELECT * FROM member_live_state WHERE member_id = ? AND state_key = ?')
    .bind('0001', '123:HOME').first();
  console.log(`DEBUG: second scan momentum=${state?.momentum} streak=${state?.streak} triggered=${state?.triggered}`);
  assert.ok(Number(state.momentum) >= 60);
  assert.equal(Number(state.triggered), 1);
  const signal = await env.DB.prepare('SELECT * FROM member_live_signals WHERE member_id = ? AND signal_key = ?')
    .bind('0001', '123:HOME').first();
  assert.ok(signal);
  assert.equal(signal.selected_team, 'Alpha');
  console.log('PASS: Member #0001 rules independently create Member #0001 momentum and signal');

  const usageRows = await env.DB.prepare('SELECT endpoint, calls FROM member_api_usage WHERE member_id = ? ORDER BY endpoint')
    .bind('0001').all();
  const totalCalls = usageRows.results.reduce((sum, row) => sum + Number(row.calls || 0), 0);
  assert.equal(totalCalls, 6);
  assert.deepEqual(
    Object.fromEntries(usageRows.results.map(row => [row.endpoint, Number(row.calls)])),
    { fixture_stats_batch: 2, live_fixtures: 2, live_odds: 2 }
  );
  console.log('PASS: TEST mode counts uncached API requests per member (3 requests per scan here)');

  const ownerLikeRows = await env.DB.prepare('SELECT COUNT(*) AS total FROM auto_momentum_state_side').first().catch(() => ({ total: 0 }));
  assert.equal(Number(ownerLikeRows?.total || 0), 0);
  const member2 = await env.DB.prepare('SELECT COUNT(*) AS total FROM member_live_state WHERE member_id = ?').bind('0002').first();
  assert.equal(Number(member2?.total || 0), 0);
  console.log('PASS: member evaluator writes no Owner state and no other member namespace');

  console.log('\nMember live background evaluator test PASSED.');
} finally {
  globalThis.fetch = originalFetch;
}
