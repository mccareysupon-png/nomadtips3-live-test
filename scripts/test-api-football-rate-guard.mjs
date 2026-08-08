import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sharedApiFetch } from '../cloudflare-worker/src/shared-api-football.js';

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
  if (upstreamCalls === 1) return Response.json({ response: [{ ok: true }] });
  return Response.json(
    { errors: { rateLimit: 'Too many requests. You have exceeded the limit of requests per minute.' } },
    { status: 429, headers: { 'Retry-After': '120' } }
  );
};

try {
  const env = { DB: new Database(), API_FOOTBALL_KEY: 'test-key' };
  const first = await sharedApiFetch('/status', env, 1);
  assert.equal(first.stale, false);
  assert.equal(upstreamCalls, 1);

  cache.delete('https://v3.football.api-sports.io/status');
  const limited = await sharedApiFetch('/status', env, 1);
  assert.equal(limited.stale, true);
  assert.equal(upstreamCalls, 2);

  const protectedRead = await sharedApiFetch('/status', env, 1);
  assert.equal(protectedRead.stale, true);
  assert.equal(upstreamCalls, 2, 'cooldown must prevent another upstream request');

  const guard = await env.DB.prepare('SELECT * FROM api_rate_guard WHERE guard_key = ?')
    .bind('api-football').first();
  assert.ok(Number(guard.cooldown_until) >= Date.now() + 115_000);
  assert.equal(Number(guard.consecutive_429), 1);
  console.log('PASS: 429 starts a shared cooldown and serves stale data without re-knocking upstream');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
}
