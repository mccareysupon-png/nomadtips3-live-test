import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { getBallTengConfigState } from '../cloudflare-worker/src/ball-teng-config.js';
import {
  getActiveMemberBallTengConfig,
  handleMemberConfig,
  provisionMember
} from '../cloudflare-worker/src/member-config.js';
import { handleMemberBallTengIngest } from '../cloudflare-worker/src/member-ball-teng-ingest.js';
import { handleMemberData } from '../cloudflare-worker/src/member-data.js';

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
    const result = this.db.prepare(this.sql).run(...this.bindings);
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

function configRequest(body) {
  return new Request('https://member-test.local/member-ball-teng-config?member=0001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function ingestRequest(key, body) {
  return new Request('https://member-test.local/member-ball-teng-ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NOMAD-ENGINE-KEY': key
    },
    body: JSON.stringify(body)
  });
}

const env = {
  DB: new D1Database(),
  API_FOOTBALL_KEY: 'member-engine-test-key'
};

await provisionMember(env, '0001', { status: 'ACTIVE' });
const ownerBefore = await getBallTengConfigState(env);
const initial = await getActiveMemberBallTengConfig(env, '0001');

const changed = {
  ...initial,
  minimumMainOdds: 1.93,
  minimumConfidence: 66,
  maximumSelections: 2
};
const configReq = configRequest({ action: 'run', config: changed });
const activated = await handleMemberConfig(configReq, env, new URL(configReq.url));
assert.equal(activated.status, 200);
const active = await getActiveMemberBallTengConfig(env, '0001');
assert.equal(active.minimumMainOdds, 1.93);
assert.equal(active.minimumConfidence, 66);
assert.equal(active.maximumSelections, 2);
console.log('PASS: Member #0001 Ball Teng config activates independently before selector ingest');

const payload = {
  system: 'NOMAD MEMBER BALL TENG / ISOLATED TEST',
  environment: 'MEMBER_TEST_ONLY',
  memberSelection: {
    memberId: '0001',
    configVersion: active.version,
    windowKey: '2026-08-08T08:00:00+07:00',
    independentFromOwner: true
  },
  matches: [
    {
      fixture_id: 900001,
      home: 'Member Alpha',
      away: 'Member Beta',
      pick: 'Member Alpha Win',
      odds: 1.95,
      confidence: 68,
      markets: {
        btts: { pick: 'No', odds: 1.80 },
        doubleChance: { pick: '1X', odds: 1.20 },
        asianHandicap: { pick: 'Member Alpha -0.5', odds: 1.90 }
      }
    }
  ]
};

const denied = await handleMemberBallTengIngest(ingestRequest('wrong-key', {
  memberId: '0001', configVersion: active.version, setId: 'denied', payload
}), env);
assert.equal(denied.status, 401);
console.log('PASS: Member selector ingest rejects callers without the engine key');

const stale = await handleMemberBallTengIngest(ingestRequest(env.API_FOOTBALL_KEY, {
  memberId: '0001', configVersion: Math.max(1, active.version - 1), setId: 'stale', payload
}), env);
assert.equal(stale.status, 409);
console.log('PASS: stale selector results cannot overwrite a newer Member Active config');

const stored = await handleMemberBallTengIngest(ingestRequest(env.API_FOOTBALL_KEY, {
  memberId: '0001',
  configVersion: active.version,
  setId: `0001:${active.version}:test-window`,
  generatedAt: '2026-08-07T09:00:00Z',
  payload,
  usage: { apiFootballRequests: 17, fixturesAnalyzed: 12 }
}), env);
assert.equal(stored.status, 200);
assert.equal(stored.data.memberId, '0001');
assert.equal(stored.data.matches, 1);

const setRow = await env.DB.prepare('SELECT * FROM member_ball_teng_sets WHERE member_id = ?')
  .bind('0001').first();
assert.ok(setRow);
assert.equal(Number(setRow.config_version), Number(active.version));
assert.match(setRow.payload_json, /Member Alpha Win/);

const resultRow = await env.DB.prepare('SELECT * FROM member_prediction_results WHERE member_id = ?')
  .bind('0001').first();
assert.ok(resultRow);
assert.equal(resultRow.source_type, 'BALL_TENG');
assert.equal(Number(resultRow.fixture_id), 900001);

const usage = await env.DB.prepare(`
  SELECT calls, items FROM member_api_usage
  WHERE member_id = ? AND endpoint = 'ball_teng_selector_total'
`).bind('0001').first();
assert.equal(Number(usage.calls), 17);
assert.equal(Number(usage.items), 12);
console.log('PASS: selector set, member prediction rows and API usage are stored under Member #0001 only');

const dataReq = new Request('https://member-test.local/member-ball-teng-results?member=0001');
const view = await handleMemberData(dataReq, env, new URL(dataReq.url));
assert.equal(view.status, 200);
assert.equal(view.data.configVersion, Number(active.version));
assert.equal(view.data.current, true);
assert.equal(view.data.engine.status, 'MEMBER_SELECTOR_ACTIVE');
assert.equal(view.data.payload.matches.length, 1);
console.log('PASS: Member Ball Teng page data reports the copied selector as current and active');

const ownerAfter = await getBallTengConfigState(env);
assert.deepEqual(ownerAfter.active, ownerBefore.active);
assert.deepEqual(ownerAfter.draft, ownerBefore.draft);
assert.equal(ownerAfter.version, ownerBefore.version);
const ownerSelectionTables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='selected_live_matches'").all();
assert.equal(ownerSelectionTables.results.length, 0);
console.log('PASS: Member Ball Teng ingest does not change Owner Ball Teng config or Owner selection namespace');

const member2 = await env.DB.prepare('SELECT COUNT(*) AS total FROM member_ball_teng_sets WHERE member_id = ?')
  .bind('0002').first();
assert.equal(Number(member2.total), 0);
console.log('PASS: Member #0002 remains untouched');

console.log('\nMember Ball Teng isolated selector ingest test PASSED.');
