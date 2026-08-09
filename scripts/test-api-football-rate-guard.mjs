import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  getSharedApiGuardStatus,
  sharedApiFetch
} from '../cloudflare-worker/src/shared-api-football.js';

class Statement {
  constructor(db, sql, bindings = []) { this.db = db; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new Statement(this.db, this.sql, bindings); }
  async run() { return { success: true, meta: this.db.prepare(this.sql).run(...this.bindings) }; }
  async first() { return this.db.prepare(this.sql).get(...this.bindings) ?? null; }
}

class Database {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Statement(this.db, sql); }
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

class MemoryCache {
  constructor() { this.values = new Map(); }
  key(request) { return typeof request === 'string' ? request : request.url; }
  async match(request) {
    const response = this.values.get(this.key(request));
    return response ? response.clone() : undefined;
  }
  async put(request, response) { this.values.set(this.key(request), response.clone()); }
  delete(url) { this.values.delete(url); }
}

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const cache = new MemoryCache();
let upstreamCalls = 0;

globalThis.caches = { default: cache };
globalThis.fetch = async () => {
  upstreamCalls += 1;
  if (upstreamCalls === 1) {
    return Response.json(
      { response: [{ ok: true }] },
      { headers: { 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '9' } }
    );
  }
  return Response.json(
    { errors: { rateLimit: 'Too many requests. You have exceeded the limit of requests per minute.' } },
    { status: 429, headers: { 'Retry-After': '120', 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '0' } }
  );
};

try {
  const env = { DB: new Database(), API_FOOTBALL_KEY: 'test-key' };
  const first = await sharedApiFetch('/status', env, 1);
  assert.equal(first.stale, false);
  assert.equal(upstreamCalls, 1);

  let status = await getSharedApiGuardStatus(env);
  assert.equal(status.rateLimitLimit, 10);
  assert.equal(status.rateLimitRemaining, 9);
  assert.equal(status.derateLevel, 0);

  await env.DB.prepare(`UPDATE api_rate_guard SET last_started_at = 0 WHERE guard_key = ?`)
    .bind('api-football').run();
  cache.delete('https://v3.football.api-sports.io/status');

  const limited = await sharedApiFetch('/status', env, 1);
  assert.equal(limited.stale, true);
  assert.equal(upstreamCalls, 2);
  status = await getSharedApiGuardStatus(env);
  assert.equal(status.consecutive429, 1);
  assert.ok(status.derateLevel >= 1);
  assert.equal(status.rateLimitRemaining, 0);

  const protectedRead = await sharedApiFetch('/status', env, 1);
  assert.equal(protectedRead.stale, true);
  assert.equal(upstreamCalls, 2, 'cooldown must prevent another upstream request');

  // Simulate provider cooldown expiry so the next 429 becomes strike two.
  await env.DB.prepare(`
    UPDATE api_rate_guard
    SET cooldown_until = 0, circuit_open_until = 0, last_started_at = 0
    WHERE guard_key = ?
  `).bind('api-football').run();
  cache.delete('https://v3.football.api-sports.io/status');
  const limitedAgain = await sharedApiFetch('/status', env, 1);
  assert.equal(limitedAgain.stale, true);
  assert.equal(upstreamCalls, 3);

  status = await getSharedApiGuardStatus(env);
  assert.equal(status.consecutive429, 2);
  assert.equal(status.circuitOpen, true);
  assert.ok(status.derateLevel >= 2);
  assert.ok(Number(status.effectiveGapMs) >= 18_000);

  const guard = await env.DB.prepare('SELECT * FROM api_rate_guard WHERE guard_key = ?')
    .bind('api-football').first();
  assert.ok(Number(guard.cooldown_until) >= Date.now() + 115_000);
  assert.ok(Number(guard.circuit_open_until) >= Date.now() + 115_000);
  console.log('PASS: V2 tracks provider quota, derates after 429, opens circuit on repeat, and serves stale data without re-knocking upstream');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
}
