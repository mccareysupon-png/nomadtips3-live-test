import { DEFAULT_CONDITION_CONFIG, normalizeConditionConfig } from './condition-config.js';

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS production_live_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT id FROM production_live_config WHERE id = 1').first();
  if (!row) {
    const now = Date.now();
    const json = JSON.stringify(DEFAULT_CONDITION_CONFIG);
    await env.DB.prepare(`INSERT INTO production_live_config
      (id, draft_json, active_json, updated_at, activated_at) VALUES (1, ?, ?, ?, ?)`)
      .bind(json, json, now, now).run();
  }
  schemaReady = true;
}

function parse(value, fallback) {
  try { return normalizeConditionConfig(JSON.parse(value || '')); }
  catch { return normalizeConditionConfig(fallback); }
}

export async function getProductionLiveConfigState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM production_live_config WHERE id = 1').first();
  const active = parse(row?.active_json, DEFAULT_CONDITION_CONFIG);
  const draft = parse(row?.draft_json, active);
  return {
    defaults: normalizeConditionConfig(DEFAULT_CONDITION_CONFIG), draft, active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0), scope: 'CAR_1_PRODUCTION_ONLY'
  };
}

export async function getActiveProductionLiveConfig(env) {
  return { ...(await getProductionLiveConfigState(env)).active };
}

function authorized(request, env) {
  const expected = String(env.OWNER_CONTROL_KEY || env.API_FOOTBALL_KEY || '');
  const supplied = String(request.headers.get('X-NOMAD-OWNER-KEY') || '');
  return Boolean(expected && supplied && supplied === expected);
}

export async function handleProductionLiveConfig(request, env) {
  if (!authorized(request, env)) return { status: 401, data: { ok: false, error: 'Owner authorization required' } };
  await ensureSchema(env);
  if (request.method === 'GET') return { status: 200, data: { ok: true, ...(await getProductionLiveConfigState(env)) } };
  if (request.method !== 'POST') return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  const body = await request.json().catch(() => null);
  const action = String(body?.action || '').toLowerCase();
  if (!body || !['save', 'run'].includes(action)) return { status: 400, data: { ok: false, error: 'Action must be save or run' } };
  const config = normalizeConditionConfig(body.config);
  const now = Date.now();
  if (action === 'run') {
    await env.DB.prepare(`UPDATE production_live_config SET draft_json = ?, active_json = ?, updated_at = ?, activated_at = ? WHERE id = 1`)
      .bind(JSON.stringify(config), JSON.stringify(config), now, now).run();
  } else {
    await env.DB.prepare(`UPDATE production_live_config SET draft_json = ?, updated_at = ? WHERE id = 1`)
      .bind(JSON.stringify(config), now).run();
  }
  return { status: 200, data: { ok: true, action, ...(await getProductionLiveConfigState(env)) } };
}
