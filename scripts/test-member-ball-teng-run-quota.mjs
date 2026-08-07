import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { provisionMember, getActiveMemberBallTengConfig } from '../cloudflare-worker/src/member-config.js';
import { handleMemberBallTengRun } from '../cloudflare-worker/src/member-ball-teng-run.js';

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

function postRequest(config) {
  return new Request('https://member-test.local/member-ball-teng-run?member=0001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config })
  });
}

function url() {
  return new URL('https://member-test.local/member-ball-teng-run?member=0001');
}

async function completeMemberSet(env, configVersion, sequence) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS member_ball_teng_sets (
      member_id TEXT NOT NULL,
      set_id TEXT NOT NULL,
      config_version INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      PRIMARY KEY (member_id, set_id)
    )
  `).run();
  await env.DB.prepare(`
    INSERT INTO member_ball_teng_sets (member_id, set_id, config_version, payload_json, generated_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind('0001', `test-${sequence}`, Number(configVersion), JSON.stringify({ matches: [] }), Date.now() + sequence).run();
}

const env = { DB: new D1Database() };
await provisionMember(env, '0001', { status: 'ACTIVE' });
const active = await getActiveMemberBallTengConfig(env, '0001');
const config = { ...active, minimumConfidence: 67, maximumSelections: 2 };

const first = await handleMemberBallTengRun(postRequest(config), env, url());
assert.equal(first.status, 200);
assert.equal(first.data.quota.limit, 3);
assert.equal(first.data.quota.used, 1);
assert.equal(first.data.quota.remaining, 2);
assert.equal(first.data.quota.pending, true);
console.log('PASS: first Member Ball Teng manual run consumes 1 of 3 daily runs');

const duplicateWhilePending = await handleMemberBallTengRun(postRequest(config), env, url());
assert.equal(duplicateWhilePending.status, 409);
assert.equal(duplicateWhilePending.data.quota.used, 1);
console.log('PASS: repeated click while a member selection is pending does not consume another run');

await completeMemberSet(env, first.data.version, 1);
const second = await handleMemberBallTengRun(postRequest({ ...config, minimumConfidence: 68 }), env, url());
assert.equal(second.status, 200);
assert.equal(second.data.quota.used, 2);
assert.equal(second.data.quota.remaining, 1);
await completeMemberSet(env, second.data.version, 2);
console.log('PASS: second completed Member run consumes the second daily slot');

const third = await handleMemberBallTengRun(postRequest({ ...config, minimumConfidence: 69 }), env, url());
assert.equal(third.status, 200);
assert.equal(third.data.quota.used, 3);
assert.equal(third.data.quota.remaining, 0);
await completeMemberSet(env, third.data.version, 3);
console.log('PASS: third completed Member run consumes the final daily slot');

const activeBeforeRejected = await getActiveMemberBallTengConfig(env, '0001');
const fourth = await handleMemberBallTengRun(postRequest({ ...config, minimumConfidence: 70 }), env, url());
assert.equal(fourth.status, 429);
assert.equal(fourth.data.quota.used, 3);
assert.equal(fourth.data.quota.remaining, 0);
const activeAfterRejected = await getActiveMemberBallTengConfig(env, '0001');
assert.equal(activeAfterRejected.version, activeBeforeRejected.version);
assert.equal(activeAfterRejected.minimumConfidence, activeBeforeRejected.minimumConfidence);
console.log('PASS: fourth manual run is rejected before changing Member active config');

const getRequest = new Request(url().toString(), { method: 'GET' });
const quota = await handleMemberBallTengRun(getRequest, env, url());
assert.equal(quota.status, 200);
assert.equal(quota.data.quota.limit, 3);
assert.equal(quota.data.quota.used, 3);
assert.equal(quota.data.quota.remaining, 0);
assert.ok(quota.data.quota.resetAt);
console.log('PASS: Member dashboard can read daily 3-run quota state');

const other = await env.DB.prepare('SELECT COUNT(*) AS total FROM member_ball_teng_run_quota WHERE member_id = ?').bind('0002').first();
assert.equal(Number(other.total || 0), 0);
console.log('PASS: run quota is scoped to Member #0001 only');

console.log('\nMember Ball Teng three-run daily quota test PASSED.');
