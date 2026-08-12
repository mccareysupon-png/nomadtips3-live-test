const LATEST_ID = 1;
const CONFIG_ID = 1;

export const DEFAULT_V2_OWNER_CONFIG = Object.freeze({
  enabled: true,
  statuses: ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'],
  side: 'BOTH',
  minute_min: 50,
  minute_max: 89,
  market: 'AH',
  odds_min: 1.20,
  odds_max: null,
  ah_min: 0.75,
  ah_max: null,
  momentum_min: 10,
  attack_evidence_enabled: false,
  confirmation_rounds: 1,
  goal_gap_enabled: false,
  max_goal_gap: 99,
  score_states: ['ANY'],
  statistics_enabled: true,
  live_odds_enabled: true,
  statistics_ttl_seconds: 60,
  live_odds_ttl_seconds: 15,
  signal_limit_enabled: false,
  signal_limit: null,
  signal_limit_policy: 'UNLIMITED'
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function bounded(value, fallback, minimum, maximum) {
  const parsed = numberOrNull(value);
  return Math.max(minimum, Math.min(maximum, parsed === null ? fallback : parsed));
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

export function normalizeV2OwnerConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const side = String(source.side || DEFAULT_V2_OWNER_CONFIG.side).toUpperCase();
  const minuteMin = Math.round(bounded(source.minute_min ?? source.minuteMin, 50, 1, 119));
  const minuteMax = Math.round(bounded(source.minute_max ?? source.minuteMax, 89, minuteMin, 120));
  const oddsMin = bounded(source.odds_min ?? source.oddsMin, 1.20, 1.01, 100);
  const oddsMaxValue = numberOrNull(source.odds_max ?? source.oddsMax);
  const ahMin = bounded(source.ah_min ?? source.ahMin, 0.75, -5, 5);
  const ahMaxValue = numberOrNull(source.ah_max ?? source.ahMax);
  const statuses = Array.isArray(source.statuses)
    ? source.statuses.map(value => String(value).toUpperCase()).filter(Boolean)
    : DEFAULT_V2_OWNER_CONFIG.statuses;
  const scoreStates = Array.isArray(source.score_states)
    ? source.score_states.map(value => String(value).toUpperCase()).filter(Boolean)
    : ['ANY'];
  return {
    enabled: bool(source.enabled, true),
    statuses: statuses.length ? statuses : [...DEFAULT_V2_OWNER_CONFIG.statuses],
    side: ['HOME', 'AWAY', 'BOTH'].includes(side) ? side : 'BOTH',
    minute_min: minuteMin,
    minute_max: minuteMax,
    market: String(source.market || 'AH').toUpperCase() === 'WIN' ? 'WIN' : 'AH',
    odds_min: oddsMin,
    odds_max: oddsMaxValue === null ? null : Math.max(oddsMin, Math.min(100, oddsMaxValue)),
    ah_min: Math.round(ahMin * 4) / 4,
    ah_max: ahMaxValue === null ? null : Math.max(ahMin, Math.min(5, Math.round(ahMaxValue * 4) / 4)),
    momentum_min: Math.round(bounded(source.momentum_min ?? source.momentumMin, 10, 1, 99)),
    attack_evidence_enabled: bool(source.attack_evidence_enabled ?? source.attackEvidenceEnabled, false),
    confirmation_rounds: Math.round(bounded(source.confirmation_rounds ?? source.confirmationRounds, 1, 1, 10)),
    goal_gap_enabled: bool(source.goal_gap_enabled ?? source.goalGapLimited, false),
    max_goal_gap: Math.round(bounded(source.max_goal_gap ?? source.maxGoalGap, 99, 0, 99)),
    score_states: scoreStates.length ? scoreStates : ['ANY'],
    statistics_enabled: true,
    live_odds_enabled: true,
    statistics_ttl_seconds: Math.round(bounded(source.statistics_ttl_seconds, 60, 30, 600)),
    live_odds_ttl_seconds: Math.round(bounded(source.live_odds_ttl_seconds, 15, 5, 60)),
    signal_limit_enabled: false,
    signal_limit: null,
    signal_limit_policy: 'UNLIMITED'
  };
}

function json(value) {
  return JSON.stringify(value ?? null);
}

export async function ensureV2Schema(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_latest_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_name TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        ingested_at INTEGER NOT NULL,
        collector_id TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        live_count INTEGER NOT NULL DEFAULT 0,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        statistics_fixture_count INTEGER NOT NULL DEFAULT 0,
        live_odds_fixture_count INTEGER NOT NULL DEFAULT 0,
        request_count_process INTEGER NOT NULL DEFAULT 0,
        rate_limit_remaining INTEGER,
        rate_limit_limit INTEGER,
        payload_json TEXT NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_owner_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL DEFAULT 'owner'
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_signal_history (
        signal_id TEXT PRIMARY KEY,
        fixture_id INTEGER NOT NULL,
        selected_side TEXT,
        selected_team TEXT,
        opponent TEXT,
        minute INTEGER,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_auth_nonce (
        nonce TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_auth_nonce_expiry ON v2_auth_nonce(expires_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_signal_created ON v2_signal_history(created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_signal_fixture ON v2_signal_history(fixture_id, created_at DESC)`),
    env.DB.prepare(`
      INSERT OR IGNORE INTO v2_owner_config (
        id, version, config_json, updated_at, updated_by
      ) VALUES (?, 1, ?, ?, 'migration')
    `).bind(CONFIG_ID, json(DEFAULT_V2_OWNER_CONFIG), now)
  ]);
}

export async function writeLatestState(env, envelope) {
  const now = Date.now();
  const payload = envelope?.payload || {};
  const rate = payload?.rate_limit || {};
  await env.DB.prepare(`
    INSERT INTO v2_latest_state (
      id, schema_name, generated_at, ingested_at, collector_id, state_hash,
      live_count, candidate_count, statistics_fixture_count,
      live_odds_fixture_count, request_count_process,
      rate_limit_remaining, rate_limit_limit, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      schema_name = excluded.schema_name,
      generated_at = excluded.generated_at,
      ingested_at = excluded.ingested_at,
      collector_id = excluded.collector_id,
      state_hash = excluded.state_hash,
      live_count = excluded.live_count,
      candidate_count = excluded.candidate_count,
      statistics_fixture_count = excluded.statistics_fixture_count,
      live_odds_fixture_count = excluded.live_odds_fixture_count,
      request_count_process = excluded.request_count_process,
      rate_limit_remaining = excluded.rate_limit_remaining,
      rate_limit_limit = excluded.rate_limit_limit,
      payload_json = excluded.payload_json
  `).bind(
    LATEST_ID,
    String(payload.schema || 'nomadtips3.live.v2.fixture-snapshot'),
    String(payload.generated_at || new Date(now).toISOString()),
    now,
    String(envelope.collector_id || 'unknown'),
    String(envelope.state_hash || ''),
    Number(payload.live_count || 0),
    Number(payload.preliminary_candidate_count || 0),
    Number(payload.statistics_fixture_count || 0),
    Number(payload.live_odds_fixture_count || 0),
    Number(payload.request_count_process || 0),
    Number.isFinite(Number(rate.minute_remaining)) ? Number(rate.minute_remaining) : null,
    Number.isFinite(Number(rate.minute_limit)) ? Number(rate.minute_limit) : null,
    json(payload)
  ).run();
}

export async function readLatestState(env) {
  const row = await env.DB.prepare(`SELECT * FROM v2_latest_state WHERE id = ? LIMIT 1`).bind(LATEST_ID).first();
  if (!row) return null;
  let payload = null;
  try { payload = JSON.parse(row.payload_json || 'null'); } catch {}
  return {
    schemaName: row.schema_name,
    generatedAt: row.generated_at,
    ingestedAt: Number(row.ingested_at || 0),
    collectorId: row.collector_id,
    stateHash: row.state_hash,
    liveCount: Number(row.live_count || 0),
    candidateCount: Number(row.candidate_count || 0),
    statisticsFixtureCount: Number(row.statistics_fixture_count || 0),
    liveOddsFixtureCount: Number(row.live_odds_fixture_count || 0),
    requestCountProcess: Number(row.request_count_process || 0),
    rateLimitRemaining: row.rate_limit_remaining === null ? null : Number(row.rate_limit_remaining),
    rateLimitLimit: row.rate_limit_limit === null ? null : Number(row.rate_limit_limit),
    payload
  };
}

export async function readOwnerConfig(env) {
  const row = await env.DB.prepare(`
    SELECT version, config_json, updated_at, updated_by
    FROM v2_owner_config WHERE id = ? LIMIT 1
  `).bind(CONFIG_ID).first();
  if (!row) return null;
  let config = {};
  try { config = normalizeV2OwnerConfig(JSON.parse(row.config_json || '{}')); } catch {
    config = normalizeV2OwnerConfig(DEFAULT_V2_OWNER_CONFIG);
  }
  return {
    version: Number(row.version || 1),
    config,
    updatedAt: Number(row.updated_at || 0),
    updatedBy: row.updated_by || 'owner'
  };
}

export async function writeOwnerConfig(env, config, expectedVersion = null, updatedBy = 'owner') {
  const current = await readOwnerConfig(env);
  if (expectedVersion !== null && current && Number(expectedVersion) !== current.version) {
    return { ok: false, conflict: true, current };
  }
  const normalized = normalizeV2OwnerConfig(config);
  const nextVersion = current ? current.version + 1 : 1;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO v2_owner_config (id, version, config_json, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).bind(CONFIG_ID, nextVersion, json(normalized), now, String(updatedBy || 'owner')).run();
  return {
    ok: true,
    conflict: false,
    version: nextVersion,
    config: normalized,
    updatedAt: now,
    updatedBy: String(updatedBy || 'owner')
  };
}
