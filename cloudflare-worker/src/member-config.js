import {
  DEFAULT_CONDITION_CONFIG,
  getConditionConfigState,
  normalizeConditionConfig
} from './condition-config.js';
import {
  DEFAULT_BALL_TENG_CONFIG,
  getBallTengConfigState,
  normalizeBallTengConfig
} from './ball-teng-config.js';

const PROFILE_SQL = `
CREATE TABLE IF NOT EXISTS member_profiles (
  member_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const LIVE_CONFIG_SQL = `
CREATE TABLE IF NOT EXISTS member_live_config (
  member_id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

const BALL_TENG_CONFIG_SQL = `
CREATE TABLE IF NOT EXISTS member_ball_teng_config (
  member_id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

const NOTIFICATION_SQL = `
CREATE TABLE IF NOT EXISTS member_notification_settings (
  member_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'LINE',
  recipient_ref TEXT,
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

function memberIdFromUrl(url) {
  const raw = String(url.searchParams.get('member') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(raw)) return null;
  return raw.padStart(4, '0');
}

function parseStored(value, normalizer, fallback) {
  try { return normalizer(JSON.parse(value || '')); }
  catch { return normalizer(fallback); }
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(PROFILE_SQL),
    env.DB.prepare(LIVE_CONFIG_SQL),
    env.DB.prepare(BALL_TENG_CONFIG_SQL),
    env.DB.prepare(NOTIFICATION_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_profiles_status ON member_profiles(status)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_live_activated ON member_live_config(activated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_ball_teng_activated ON member_ball_teng_config(activated_at)')
  ]);
  schemaReady = true;
}

async function ensureMember(env, memberId) {
  await ensureSchema(env);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO member_profiles (member_id, role, status, created_at, updated_at)
    VALUES (?, 'MEMBER', 'ACTIVE', ?, ?)
  `).bind(memberId, now, now).run();

  const liveRow = await env.DB.prepare('SELECT member_id FROM member_live_config WHERE member_id = ?')
    .bind(memberId).first();
  if (!liveRow) {
    let seed = normalizeConditionConfig(DEFAULT_CONDITION_CONFIG);
    try {
      const system = await getConditionConfigState(env);
      seed = normalizeConditionConfig(system.active || seed);
    } catch {}
    const json = JSON.stringify(seed);
    await env.DB.prepare(`
      INSERT INTO member_live_config (member_id, draft_json, active_json, updated_at, activated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(memberId, json, json, now, now).run();
  }

  const ballRow = await env.DB.prepare('SELECT member_id FROM member_ball_teng_config WHERE member_id = ?')
    .bind(memberId).first();
  if (!ballRow) {
    let seed = normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG);
    try {
      const system = await getBallTengConfigState(env);
      seed = normalizeBallTengConfig(system.active || seed);
    } catch {}
    const json = JSON.stringify(seed);
    await env.DB.prepare(`
      INSERT INTO member_ball_teng_config (member_id, draft_json, active_json, updated_at, activated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(memberId, json, json, now, now).run();
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO member_notification_settings (member_id, enabled, channel, recipient_ref, updated_at)
    VALUES (?, 1, 'LINE', NULL, ?)
  `).bind(memberId, now).run();
}

async function profileState(env, memberId) {
  await ensureMember(env, memberId);
  const [profile, notification] = await Promise.all([
    env.DB.prepare('SELECT * FROM member_profiles WHERE member_id = ?').bind(memberId).first(),
    env.DB.prepare('SELECT * FROM member_notification_settings WHERE member_id = ?').bind(memberId).first()
  ]);
  return {
    memberId,
    role: profile?.role || 'MEMBER',
    status: profile?.status || 'ACTIVE',
    notification: {
      enabled: Boolean(Number(notification?.enabled ?? 1)),
      channel: notification?.channel || 'LINE',
      recipientConfigured: Boolean(notification?.recipient_ref)
    }
  };
}

async function liveState(env, memberId) {
  await ensureMember(env, memberId);
  const row = await env.DB.prepare('SELECT * FROM member_live_config WHERE member_id = ?').bind(memberId).first();
  const active = parseStored(row?.active_json, normalizeConditionConfig, DEFAULT_CONDITION_CONFIG);
  const draft = parseStored(row?.draft_json, normalizeConditionConfig, active);
  return {
    memberId,
    defaults: normalizeConditionConfig(DEFAULT_CONDITION_CONFIG),
    draft,
    active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0)
  };
}

async function ballTengState(env, memberId) {
  await ensureMember(env, memberId);
  const row = await env.DB.prepare('SELECT * FROM member_ball_teng_config WHERE member_id = ?').bind(memberId).first();
  const active = parseStored(row?.active_json, normalizeBallTengConfig, DEFAULT_BALL_TENG_CONFIG);
  const draft = parseStored(row?.draft_json, normalizeBallTengConfig, active);
  return {
    memberId,
    defaults: normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG),
    draft,
    active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0)
  };
}

async function writeConfig(env, memberId, kind, action, config) {
  const now = Date.now();
  const isLive = kind === 'live';
  const table = isLive ? 'member_live_config' : 'member_ball_teng_config';
  const normalized = isLive ? normalizeConditionConfig(config) : normalizeBallTengConfig(config);
  if (action === 'save') {
    await env.DB.prepare(`UPDATE ${table} SET draft_json = ?, updated_at = ? WHERE member_id = ?`)
      .bind(JSON.stringify(normalized), now, memberId).run();
  } else {
    await env.DB.prepare(`
      UPDATE ${table}
      SET draft_json = ?, active_json = ?, updated_at = ?, activated_at = ?
      WHERE member_id = ?
    `).bind(JSON.stringify(normalized), JSON.stringify(normalized), now, now, memberId).run();
  }
  return normalized;
}

export async function getActiveMemberConditionConfig(env, memberId) {
  const state = await liveState(env, memberId);
  return { ...state.active, version: state.version, memberId };
}

export async function getActiveMemberBallTengConfig(env, memberId) {
  const state = await ballTengState(env, memberId);
  return { ...state.active, version: state.version, memberId };
}

export async function handleMemberConfig(request, env, url) {
  const memberId = memberIdFromUrl(url);
  if (!memberId) return { status: 400, data: { ok: false, error: 'Valid member id is required' } };
  await ensureMember(env, memberId);

  if (url.pathname === '/member-profile') {
    if (request.method !== 'GET') return { status: 405, data: { ok: false, error: 'Method not allowed' } };
    return { status: 200, data: { ok: true, ...(await profileState(env, memberId)) } };
  }

  const kind = url.pathname === '/member-live-config'
    ? 'live'
    : url.pathname === '/member-ball-teng-config'
      ? 'ball-teng'
      : null;
  if (!kind) return { status: 404, data: { ok: false, error: 'Member config endpoint not found' } };

  if (request.method === 'GET') {
    const state = kind === 'live' ? await liveState(env, memberId) : await ballTengState(env, memberId);
    return { status: 200, data: { ok: true, scope: 'MEMBER_ONLY', ...state } };
  }
  if (request.method !== 'POST') return { status: 405, data: { ok: false, error: 'Method not allowed' } };

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return { status: 400, data: { ok: false, error: 'Invalid JSON body' } };
  const action = String(body.action || 'save').toLowerCase();
  if (!['save', 'run'].includes(action)) return { status: 400, data: { ok: false, error: 'Action must be save or run' } };

  const config = await writeConfig(env, memberId, kind, action, body.config);
  const state = kind === 'live' ? await liveState(env, memberId) : await ballTengState(env, memberId);
  return {
    status: 200,
    data: {
      ok: true,
      scope: 'MEMBER_ONLY',
      action,
      config,
      message: action === 'run'
        ? `Member ${memberId} configuration activated independently. System/owner configuration is unchanged.`
        : `Member ${memberId} draft saved independently. Active member configuration is unchanged.`,
      ...state
    }
  };
}
