import { getActiveMemberBallTengConfig, normalizeMemberId } from './member-config.js';

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

const API_USAGE_SQL = `
CREATE TABLE IF NOT EXISTS member_api_usage (
  member_id TEXT NOT NULL,
  usage_day TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, usage_day, endpoint)
)`;

let schemaReady = false;

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(BALL_TENG_SET_SQL),
    env.DB.prepare(RESULT_SQL),
    env.DB.prepare(API_USAGE_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_ball_teng_generated ON member_ball_teng_sets(member_id, generated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_result_created ON member_prediction_results(member_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_api_usage_updated ON member_api_usage(member_id, updated_at)')
  ]);
  schemaReady = true;
}

function safeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function thaiDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(now));
  const read = type => parts.find(part => part.type === type)?.value || '00';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanSetId(value, memberId, configVersion, now) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z0-9_.:-]{1,160}$/.test(raw)) return raw;
  return `${memberId}:${configVersion}:${now}`;
}

async function recordUsage(env, memberId, now, usage) {
  const total = Math.max(0, Math.round(Number(usage?.apiFootballRequests || usage?.apiCalls || 0)));
  if (!total) return;
  const day = thaiDayKey(now);
  await env.DB.prepare(`
    INSERT INTO member_api_usage (member_id, usage_day, endpoint, calls, items, updated_at)
    VALUES (?, ?, 'ball_teng_selector_total', ?, ?, ?)
    ON CONFLICT(member_id, usage_day, endpoint) DO UPDATE SET
      calls = member_api_usage.calls + excluded.calls,
      items = member_api_usage.items + excluded.items,
      updated_at = excluded.updated_at
  `).bind(memberId, day, total, Math.max(0, Math.round(Number(usage?.fixturesAnalyzed || 0))), now).run();
}

export async function handleMemberBallTengIngest(request, env) {
  await ensureSchema(env);
  if (request.method !== 'POST') {
    return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  }

  const engineKey = request.headers.get('X-NOMAD-ENGINE-KEY');
  if (!safeEqual(engineKey, env.API_FOOTBALL_KEY)) {
    return { status: 401, data: { ok: false, error: 'Member selector engine authentication failed' } };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return { status: 400, data: { ok: false, error: 'Invalid JSON body' } };
  }

  const memberId = normalizeMemberId(body.memberId);
  if (!memberId) return { status: 400, data: { ok: false, error: 'Valid member id is required' } };

  const active = await getActiveMemberBallTengConfig(env, memberId);
  const configVersion = Math.round(Number(body.configVersion || 0));
  if (!configVersion || configVersion !== Number(active.version || 0)) {
    return {
      status: 409,
      data: {
        ok: false,
        error: 'Stale member Ball Teng selector result rejected',
        activeVersion: Number(active.version || 0),
        submittedVersion: configVersion
      }
    };
  }

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : { matches: [] };
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const now = Date.now();
  const generatedAt = Number.isFinite(Date.parse(String(body.generatedAt || '')))
    ? Date.parse(String(body.generatedAt))
    : now;
  const setId = cleanSetId(body.setId, memberId, configVersion, generatedAt);

  await env.DB.prepare(`
    INSERT INTO member_ball_teng_sets (member_id, set_id, config_version, payload_json, generated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(member_id, set_id) DO UPDATE SET
      config_version = excluded.config_version,
      payload_json = excluded.payload_json,
      generated_at = excluded.generated_at
  `).bind(memberId, setId, configVersion, JSON.stringify(payload), generatedAt).run();

  const statements = [];
  for (const match of matches.slice(0, 500)) {
    const fixtureId = Math.round(Number(match?.fixture_id || match?.fixtureId || 0));
    if (!fixtureId) continue;
    const resultKey = `BALL_TENG:${setId}:${fixtureId}`;
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO member_prediction_results (
        member_id, result_key, source_type, fixture_id, market, pick, odds,
        outcome, payload_json, created_at, settled_at
      ) VALUES (?, ?, 'BALL_TENG', ?, '1X2', ?, ?, 'PENDING', ?, ?, NULL)
    `).bind(
      memberId,
      resultKey,
      fixtureId,
      String(match?.pick || ''),
      numberOrNull(match?.odds),
      JSON.stringify(match),
      generatedAt
    ));
  }
  for (let index = 0; index < statements.length; index += 80) {
    await env.DB.batch(statements.slice(index, index + 80));
  }

  await recordUsage(env, memberId, now, body.usage || {});

  return {
    status: 200,
    data: {
      ok: true,
      scope: 'MEMBER_ONLY',
      memberId,
      setId,
      configVersion,
      matches: matches.length,
      message: `Member ${memberId} Ball Teng result stored independently. Owner/System set is unchanged.`
    }
  };
}
