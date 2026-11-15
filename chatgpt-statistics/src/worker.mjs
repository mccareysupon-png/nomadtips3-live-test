import { normalize, ALL } from './core.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' }
});
function secretMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  let mismatch = input.length ^ expected.length;
  const n = Math.max(input.length, expected.length);
  for (let i = 0; i < n; i++) mismatch |= (input.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return mismatch === 0;
}
export default {
  async fetch(request, env) {
    if (!env.DB) return json({ ok: false, error: 'STAGING_D1_NOT_BOUND' }, 503);
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/health')
        return json({ ok: true, project: 'BALL46 Chat Statistics', environment: 'staging', sourceMode: 'EVENT_INGEST_ONLY' });
      if (request.method === 'GET' && url.pathname === '/summary') {
        const market = (url.searchParams.get('market') || ALL).toUpperCase();
        const day = url.searchParams.get('day') || ALL;
        if (market.length > 70 || (day !== ALL && !/^\d{4}-\d{2}-\d{2}$/.test(day))) return json({ ok: false }, 400);
        const row = await env.DB.prepare('SELECT * FROM stat_buckets WHERE day = ? AND market = ?').bind(day, market).first();
        return json({ ok: true, bucket: row || null, source: 'staging-only', profitComplete: !!row && row.profit_missing === 0 });
      }
      if (request.method === 'GET' && url.pathname === '/daily') {
        const market = (url.searchParams.get('market') || ALL).toUpperCase();
        const days = Math.min(365, Math.max(1, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
        if (market.length > 70) return json({ ok: false }, 400);
        const rows = await env.DB.prepare('SELECT * FROM stat_buckets WHERE day <> ? AND market = ? ORDER BY day DESC LIMIT ?').bind(ALL, market, days).all();
        return json({ ok: true, rows: rows.results || [], source: 'staging-only' });
      }
      if (request.method === 'POST' && url.pathname === '/admin/ingest') {
        const auth = request.headers.get('authorization') || '';
        if (!secretMatches(auth, `Bearer ${env.STAGING_WRITE_TOKEN || ''}`)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
        const len = Number(request.headers.get('content-length') || 0);
        if (len > 256000) return json({ ok: false, error: 'BATCH_TOO_LARGE' }, 413);
        const body = await request.json();
        if (!body || body.source !== 'BALL46_PRODUCTION_READ_ONLY' || !Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 100)
          return json({ ok: false, error: 'INVALID_BATCH' }, 400);
        const seen = new Set(), normalized = [];
        for (const row of body.rows) {
          const n = normalize(row);
          if (seen.has(n.id)) throw new Error('DUPLICATE_ID_WITHIN_BATCH');
          seen.add(n.id); normalized.push(n);
        }
        const stmt = env.DB.prepare(`INSERT INTO stat_rows (id,day,market,state,odds,profit,fingerprint,raw_json,observed_at)
          VALUES (?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(id) DO UPDATE SET day=excluded.day, market=excluded.market,
          state=excluded.state, odds=excluded.odds, profit=excluded.profit,
          fingerprint=excluded.fingerprint, raw_json=excluded.raw_json, observed_at=datetime('now')
          WHERE stat_rows.fingerprint <> excluded.fingerprint`);
        const results = await env.DB.batch(normalized.map(n => stmt.bind(n.id,n.day,n.market,n.state,n.odds,n.profit,n.fingerprint,n.raw_json)));
        const changed = results.reduce((total, r) => total + (r.meta?.changes ?? 0), 0);
        return json({ ok: true, received: normalized.length, changed, unchanged: normalized.length - changed, source: 'staging-only' });
      }
      return json({ ok: false, error: 'NOT_FOUND' }, 404);
    } catch (e) {
      const msg = String(e?.message || e);
      return json({ ok: false, error: ['INVALID_CREATED_AT','MISSING_STABLE_SIGNAL_ID','INVALID_MARKET','ROW_NOT_OBJECT','UNKNOWN_SETTLEMENT','DUPLICATE_ID_WITHIN_BATCH'].includes(msg) ? msg : 'INTERNAL_ERROR' }, 400);
    }
  }
};
