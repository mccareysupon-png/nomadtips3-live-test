import {
  getActiveMemberBallTengConfig,
  getActiveMemberConditionConfig
} from './member-config.js';

const LIVE_STATE_SQL = `
CREATE TABLE IF NOT EXISTS member_live_state (
  member_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  selected_team TEXT NOT NULL,
  opponent TEXT NOT NULL,
  minute INTEGER NOT NULL,
  selected_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  momentum REAL,
  streak INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0,
  config_version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, state_key)
)`;

const LIVE_SIGNAL_SQL = `
CREATE TABLE IF NOT EXISTS member_live_signals (
  member_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  selected_team TEXT NOT NULL,
  opponent TEXT NOT NULL,
  minute INTEGER NOT NULL,
  momentum REAL,
  selected_odds REAL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, signal_key)
)`;

const BALL_TENG_SET_SQL = `
CREATE TABLE IF NOT EXISTS member_ball_teng_sets (
  member_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  config_version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, set_id)
)`;

const RESULT_SQL = `
CREATE TABLE IF NOT EXISTS member_prediction_results (
  member_id TEXT NOT NULL,
  result_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  fixture_id INTEGER,
  market TEXT NOT NULL DEFAULT '1X2',
  pick TEXT,
  odds REAL,
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  PRIMARY KEY (member_id, result_key)
)`;

const NOTIFICATION_LOG_SQL = `
CREATE TABLE IF NOT EXISTS member_notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
)`;

let schemaReady = false;

function memberIdFromUrl(url) {
  const raw = String(url.searchParams.get('member') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(raw)) return null;
  return raw.padStart(4, '0');
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(LIVE_STATE_SQL),
    env.DB.prepare(LIVE_SIGNAL_SQL),
    env.DB.prepare(BALL_TENG_SET_SQL),
    env.DB.prepare(RESULT_SQL),
    env.DB.prepare(NOTIFICATION_LOG_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_live_state_updated ON member_live_state(member_id, updated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_live_signal_created ON member_live_signals(member_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_ball_teng_generated ON member_ball_teng_sets(member_id, generated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_result_created ON member_prediction_results(member_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_notification_created ON member_notification_log(member_id, created_at)')
  ]);
  schemaReady = true;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

async function liveStatus(env, memberId) {
  await ensureSchema(env);
  const config = await getActiveMemberConditionConfig(env, memberId);
  const [states, signals] = await Promise.all([
    env.DB.prepare(`
      SELECT state_key, fixture_id, selected_side, selected_team, opponent, minute,
             selected_score, opponent_score, momentum, streak, triggered,
             config_version, payload_json, updated_at
      FROM member_live_state
      WHERE member_id = ? AND updated_at >= ?
      ORDER BY triggered DESC, momentum DESC, updated_at DESC
      LIMIT 100
    `).bind(memberId, Date.now() - 6 * 60 * 60_000).all(),
    env.DB.prepare(`
      SELECT signal_key, fixture_id, selected_side, selected_team, opponent, minute,
             momentum, selected_odds, payload_json, created_at
      FROM member_live_signals
      WHERE member_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(memberId).all()
  ]);
  return {
    memberId,
    scope: 'MEMBER_ONLY',
    config,
    active: (states.results || []).map(row => ({ ...row, payload: parseJson(row.payload_json) })),
    signals: (signals.results || []).map(row => ({ ...row, payload: parseJson(row.payload_json) })),
    counts: {
      active: (states.results || []).length,
      triggered: (states.results || []).filter(row => Number(row.triggered) === 1).length,
      signals: (signals.results || []).length
    },
    engine: {
      isolatedStorage: true,
      independentEvaluatorRequired: true,
      status: 'READY_FOR_MEMBER_EVALUATOR'
    }
  };
}

async function ballTengResults(env, memberId) {
  await ensureSchema(env);
  const config = await getActiveMemberBallTengConfig(env, memberId);
  const row = await env.DB.prepare(`
    SELECT set_id, config_version, payload_json, generated_at
    FROM member_ball_teng_sets
    WHERE member_id = ?
    ORDER BY generated_at DESC
    LIMIT 1
  `).bind(memberId).first();
  return {
    memberId,
    scope: 'MEMBER_ONLY',
    config,
    setId: row?.set_id || null,
    generatedAt: row?.generated_at ? new Date(Number(row.generated_at)).toISOString() : null,
    payload: row?.payload_json ? parseJson(row.payload_json, null) : null,
    engine: {
      isolatedStorage: true,
      independentSelectorRequired: true,
      status: row ? 'HAS_MEMBER_SET' : 'WAITING_FOR_MEMBER_SELECTOR'
    }
  };
}

async function stats(env, memberId) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`
    SELECT result_key, source_type, fixture_id, market, pick, odds, outcome,
           payload_json, created_at, settled_at
    FROM member_prediction_results
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT 500
  `).bind(memberId).all();
  const records = (rows.results || []).map(row => ({ ...row, payload: parseJson(row.payload_json) }));
  const settled = records.filter(row => !['PENDING', 'WAITING', ''].includes(String(row.outcome || '').toUpperCase()));
  const correct = settled.filter(row => ['CORRECT', 'WIN', 'HALF-WIN'].includes(String(row.outcome || '').toUpperCase())).length;
  const incorrect = settled.filter(row => ['INCORRECT', 'LOSS', 'HALF-LOSS'].includes(String(row.outcome || '').toUpperCase())).length;
  const decisions = correct + incorrect;
  return {
    memberId,
    scope: 'MEMBER_ONLY',
    summary: {
      total: records.length,
      settled: settled.length,
      correct,
      incorrect,
      pending: records.length - settled.length,
      accuracy: decisions ? (correct / decisions) * 100 : null
    },
    records
  };
}

async function notifications(env, memberId) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`
    SELECT id, event_key, channel, status, payload_json, created_at, sent_at
    FROM member_notification_log
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(memberId).all();
  return {
    memberId,
    scope: 'MEMBER_ONLY',
    notifications: (rows.results || []).map(row => ({ ...row, payload: parseJson(row.payload_json) }))
  };
}

export async function handleMemberData(request, env, url) {
  if (request.method !== 'GET') return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  const memberId = memberIdFromUrl(url);
  if (!memberId) return { status: 400, data: { ok: false, error: 'Valid member id is required' } };

  if (url.pathname === '/member-live-status') {
    return { status: 200, data: { ok: true, ...(await liveStatus(env, memberId)) } };
  }
  if (url.pathname === '/member-ball-teng-results') {
    return { status: 200, data: { ok: true, ...(await ballTengResults(env, memberId)) } };
  }
  if (url.pathname === '/member-stats') {
    return { status: 200, data: { ok: true, ...(await stats(env, memberId)) } };
  }
  if (url.pathname === '/member-notifications') {
    return { status: 200, data: { ok: true, ...(await notifications(env, memberId)) } };
  }
  return { status: 404, data: { ok: false, error: 'Member data endpoint not found' } };
}
