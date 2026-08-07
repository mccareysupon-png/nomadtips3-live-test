import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { getConditionConfigState } from '../cloudflare-worker/src/condition-config.js';
import { getBallTengConfigState } from '../cloudflare-worker/src/ball-teng-config.js';
import { handleMemberConfig } from '../cloudflare-worker/src/member-config.js';

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
    const stmt = this.db.prepare(this.sql);
    return stmt.get(...this.bindings) ?? null;
  }
  async all() {
    const stmt = this.db.prepare(this.sql);
    return { results: stmt.all(...this.bindings) };
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

function request(path, method = 'GET', body = null) {
  return new Request(`https://member-test.local${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function memberCall(env, path, method = 'GET', body = null) {
  const req = request(path, method, body);
  return handleMemberConfig(req, env, new URL(req.url));
}

const env = { DB: new D1Database() };

const ownerLiveBefore = await getConditionConfigState(env);
const ownerBallBefore = await getBallTengConfigState(env);

const profile = await memberCall(env, '/member-profile?member=0001');
assert.equal(profile.status, 200);
assert.equal(profile.data.memberId, '0001');
assert.equal(profile.data.status, 'ACTIVE');
console.log('PASS: TEST Member #0001 bootstraps as an isolated profile');

const liveInitial = await memberCall(env, '/member-live-config?member=0001');
assert.equal(liveInitial.status, 200);
assert.equal(liveInitial.data.scope, 'MEMBER_ONLY');
const liveChanged = {
  ...liveInitial.data.active,
  minuteMin: 57,
  minuteMax: 79,
  oddsMin: 1.83,
  momentumMin: 73
};

const liveSaved = await memberCall(env, '/member-live-config?member=0001', 'POST', {
  action: 'save',
  config: liveChanged
});
assert.equal(liveSaved.status, 200);
assert.equal(liveSaved.data.draft.momentumMin, 73);
assert.equal(liveSaved.data.active.momentumMin, liveInitial.data.active.momentumMin);
console.log('PASS: Member live Save Draft changes only the member draft');

const liveActivated = await memberCall(env, '/member-live-config?member=0001', 'POST', {
  action: 'run',
  config: liveChanged
});
assert.equal(liveActivated.status, 200);
assert.equal(liveActivated.data.active.momentumMin, 73);
assert.equal(liveActivated.data.active.oddsMin, 1.83);
const liveReloaded = await memberCall(env, '/member-live-config?member=0001');
assert.equal(liveReloaded.data.active.momentumMin, 73);
assert.equal(liveReloaded.data.draft.momentumMin, 73);
console.log('PASS: Member live Activate persists after reload');

const ownerLiveAfter = await getConditionConfigState(env);
assert.deepEqual(ownerLiveAfter.active, ownerLiveBefore.active);
assert.deepEqual(ownerLiveAfter.draft, ownerLiveBefore.draft);
assert.equal(ownerLiveAfter.version, ownerLiveBefore.version);
console.log('PASS: Owner live condition config is unchanged by Member #0001 Save/Activate');

const ballInitial = await memberCall(env, '/member-ball-teng-config?member=0001');
assert.equal(ballInitial.status, 200);
assert.equal(ballInitial.data.scope, 'MEMBER_ONLY');
const ballChanged = {
  ...ballInitial.data.active,
  minimumMainOdds: 1.91,
  minimumConfidence: 67,
  maximumConfidence: 88,
  maximumSelections: 5
};

const ballSaved = await memberCall(env, '/member-ball-teng-config?member=0001', 'POST', {
  action: 'save',
  config: ballChanged
});
assert.equal(ballSaved.status, 200);
assert.equal(ballSaved.data.draft.minimumConfidence, 67);
assert.equal(ballSaved.data.active.minimumConfidence, ballInitial.data.active.minimumConfidence);
console.log('PASS: Member Ball Teng Save Draft changes only the member draft');

const ballActivated = await memberCall(env, '/member-ball-teng-config?member=0001', 'POST', {
  action: 'run',
  config: ballChanged
});
assert.equal(ballActivated.status, 200);
assert.equal(ballActivated.data.active.minimumConfidence, 67);
assert.equal(ballActivated.data.active.minimumMainOdds, 1.91);
const ballReloaded = await memberCall(env, '/member-ball-teng-config?member=0001');
assert.equal(ballReloaded.data.active.minimumConfidence, 67);
assert.equal(ballReloaded.data.draft.minimumConfidence, 67);
console.log('PASS: Member Ball Teng Activate persists after reload');

const ownerBallAfter = await getBallTengConfigState(env);
assert.deepEqual(ownerBallAfter.active, ownerBallBefore.active);
assert.deepEqual(ownerBallAfter.draft, ownerBallBefore.draft);
assert.equal(ownerBallAfter.version, ownerBallBefore.version);
console.log('PASS: Owner Ball Teng config is unchanged by Member #0001 Save/Activate');

const unprovisioned = await memberCall(env, '/member-profile?member=0002');
assert.equal(unprovisioned.status, 404);
assert.match(unprovisioned.data.error, /not provisioned/i);
console.log('PASS: arbitrary Member #0002 is not auto-created by URL');

console.log('\nMember #0001 dynamic config isolation test PASSED.');
