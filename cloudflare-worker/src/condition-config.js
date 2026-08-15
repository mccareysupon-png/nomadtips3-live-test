const CONFIG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS condition_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

// Legacy guard remains the safe fallback for stored configs created before owner-controlled limits.
export const DAILY_TEN_SYSTEM = Object.freeze({
  enabled: true,
  limit: 10,
  resetTimezone: 'Asia/Bangkok',
  resetHour: 12
});

export const DEFAULT_CONDITION_CONFIG = Object.freeze({
  side: 'HOME',
  minuteMin: 60,
  minuteMax: 80,
  market: 'WIN',
  oddsMin: 1.70,
  oddsMax: null,
  ahMin: 0.25,
  ahMax: null,
  momentumMin: 60,
  attackEvidenceEnabled: true,
  attackEvidenceDetailedConfigured: false,
  attackEvidenceDangerousAttacksEnabled: true,
  attackEvidenceDangerousAttacksMin: 1,
  attackEvidenceShotsEnabled: true,
  attackEvidenceShotsMin: 1,
  attackEvidenceShotsOnTargetEnabled: true,
  attackEvidenceShotsOnTargetMin: 1,
  attackEvidenceCornersEnabled: true,
  attackEvidenceCornersMin: 1,
  attackEvidenceRequirement: '1',
  goalGapLimited: false,
  maxGoalGap: 1,
  confirmationRounds: 2,
  signalLimitEnabled: false,
  maxSignalsPerDay: 3,
  dailySignalLimitConfigured: false
});

let schemaReady = false;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function bounded(value, fallback, min, max, step = null) {
  const parsed = numberOrNull(value);
  let result = parsed === null ? fallback : Math.max(min, Math.min(max, parsed));
  if (step) result = Math.round(result / step) * step;
  return Number(result.toFixed(4));
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function evidenceRequirement(value) {
  const normalized = String(value ?? '1').toUpperCase();
  return ['1', '2', '3', 'ALL'].includes(normalized) ? normalized : '1';
}

export function normalizeConditionConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const rawSide = String(source.side || DEFAULT_CONDITION_CONFIG.side).toUpperCase();
  const side = ['HOME', 'AWAY', 'BOTH'].includes(rawSide) ? rawSide : 'HOME';
  const market = String(source.market || DEFAULT_CONDITION_CONFIG.market).toUpperCase() === 'WIN'
    ? 'WIN'
    : 'AH';

  const minuteMin = Math.round(bounded(source.minuteMin, 60, 1, 119));
  const minuteMax = Math.round(bounded(source.minuteMax, 80, minuteMin, 120));
  const oddsMin = bounded(source.oddsMin, 1.70, 1.01, 100);
  const rawOddsMax = numberOrNull(source.oddsMax);
  const oddsMax = rawOddsMax === null ? null : bounded(rawOddsMax, oddsMin, oddsMin, 100);
  const ahMin = bounded(source.ahMin, 0.25, -5, 5, 0.25);
  const rawAhMax = numberOrNull(source.ahMax);
  const ahMax = rawAhMax === null ? null : bounded(rawAhMax, ahMin, ahMin, 5, 0.25);
  const momentumMin = Math.round(bounded(source.momentumMin, 60, 1, 99));
  const attackEvidenceEnabled = booleanValue(source.attackEvidenceEnabled, true);
  const attackEvidenceDetailedConfigured = booleanValue(source.attackEvidenceDetailedConfigured, false);
  const attackEvidenceDangerousAttacksEnabled = booleanValue(source.attackEvidenceDangerousAttacksEnabled, true);
  const attackEvidenceDangerousAttacksMin = Math.round(bounded(source.attackEvidenceDangerousAttacksMin, 1, 1, 999));
  const attackEvidenceShotsEnabled = booleanValue(source.attackEvidenceShotsEnabled, true);
  const attackEvidenceShotsMin = Math.round(bounded(source.attackEvidenceShotsMin, 1, 1, 999));
  const attackEvidenceShotsOnTargetEnabled = booleanValue(source.attackEvidenceShotsOnTargetEnabled, true);
  const attackEvidenceShotsOnTargetMin = Math.round(bounded(source.attackEvidenceShotsOnTargetMin, 1, 1, 999));
  const attackEvidenceCornersEnabled = booleanValue(source.attackEvidenceCornersEnabled, true);
  const attackEvidenceCornersMin = Math.round(bounded(source.attackEvidenceCornersMin, 1, 1, 999));
  const attackEvidenceRequirement = evidenceRequirement(source.attackEvidenceRequirement);
  const goalGapLimited = booleanValue(source.goalGapLimited, false);
  const maxGoalGap = Math.round(bounded(source.maxGoalGap, 1, 0, 20));
  const confirmationRounds = Math.round(bounded(source.confirmationRounds, 2, 1, 10));
  const signalLimitEnabled = booleanValue(source.signalLimitEnabled, false);
  const maxSignalsPerDay = Math.round(bounded(source.maxSignalsPerDay, 3, 1, 100));
  const dailySignalLimitConfigured = booleanValue(source.dailySignalLimitConfigured, false);

  return {
    side,
    minuteMin,
    minuteMax,
    market,
    oddsMin,
    oddsMax,
    ahMin,
    ahMax,
    momentumMin,
    attackEvidenceEnabled,
    attackEvidenceDetailedConfigured,
    attackEvidenceDangerousAttacksEnabled,
    attackEvidenceDangerousAttacksMin,
    attackEvidenceShotsEnabled,
    attackEvidenceShotsMin,
    attackEvidenceShotsOnTargetEnabled,
    attackEvidenceShotsOnTargetMin,
    attackEvidenceCornersEnabled,
    attackEvidenceCornersMin,
    attackEvidenceRequirement,
    goalGapLimited,
    maxGoalGap,
    confirmationRounds,
    signalLimitEnabled,
    maxSignalsPerDay,
    dailySignalLimitConfigured
  };
}

function applyDailyTenSystem(config) {
  if (!DAILY_TEN_SYSTEM.enabled) return { ...config };
  const ownerConfigured = Boolean(config.dailySignalLimitConfigured);
  const signalLimitEnabled = ownerConfigured ? Boolean(config.signalLimitEnabled) : true;
  const limit = ownerConfigured
    ? Math.max(1, Math.min(100, Number(config.maxSignalsPerDay || DAILY_TEN_SYSTEM.limit)))
    : DAILY_TEN_SYSTEM.limit;
  return {
    ...config,
    signalLimitEnabled,
    maxSignalsPerDay: limit,
    dailyTenSystem: true,
    dailyTenLimit: limit,
    dailyTenResetTimezone: DAILY_TEN_SYSTEM.resetTimezone,
    dailyTenResetHour: DAILY_TEN_SYSTEM.resetHour
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(CONFIG_TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT id FROM condition_config WHERE id = 1').first();
  if (!row) {
    const now = Date.now();
    const json = JSON.stringify(DEFAULT_CONDITION_CONFIG);
    await env.DB.prepare(`
      INSERT INTO condition_config (id, draft_json, active_json, updated_at, activated_at)
      VALUES (1, ?, ?, ?, ?)
    `).bind(json, json, now, now).run();
  }
  schemaReady = true;
}

function parseStored(value, fallback) {
  try { return normalizeConditionConfig(JSON.parse(value || '')); } catch { return normalizeConditionConfig(fallback); }
}

export async function getConditionConfigState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM condition_config WHERE id = 1').first();
  const active = parseStored(row?.active_json, DEFAULT_CONDITION_CONFIG);
  const draft = parseStored(row?.draft_json, active);
  return {
    defaults: normalizeConditionConfig(DEFAULT_CONDITION_CONFIG),
    draft,
    active,
    effectiveActive: applyDailyTenSystem(active),
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0)
  };
}

export async function getActiveConditionConfig(env) {
  const state = await getConditionConfigState(env);
  return { ...applyDailyTenSystem(state.active), version: state.version };
}

async function saveDraft(env, config) {
  const normalized = normalizeConditionConfig(config);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE condition_config SET draft_json = ?, updated_at = ? WHERE id = 1
  `).bind(JSON.stringify(normalized), now).run();
  return normalized;
}

async function runConfig(env, config) {
  const normalized = normalizeConditionConfig(config);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE condition_config
      SET draft_json = ?, active_json = ?, updated_at = ?, activated_at = ?
      WHERE id = 1
    `).bind(JSON.stringify(normalized), JSON.stringify(normalized), now, now),
    env.DB.prepare('DELETE FROM auto_momentum_state'),
    env.DB.prepare('DELETE FROM auto_momentum_state_side'),
    env.DB.prepare('DELETE FROM auto_scan_status')
  ]);
  return normalized;
}

export async function handleConditionConfig(request, env) {
  await ensureSchema(env);

  if (request.method === 'GET') {
    return { status: 200, data: { ok: true, ...(await getConditionConfigState(env)) } };
  }

  if (request.method !== 'POST') {
    return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return { status: 400, data: { ok: false, error: 'Invalid JSON body' } };
  }

  const action = String(body.action || 'save').toLowerCase();
  if (!['save', 'run'].includes(action)) {
    return { status: 400, data: { ok: false, error: 'Action must be save or run' } };
  }

  const config = action === 'run'
    ? await runConfig(env, body.config)
    : await saveDraft(env, body.config);
  const state = await getConditionConfigState(env);

  return {
    status: 200,
    data: {
      ok: true,
      action,
      message: action === 'run' ? 'Condition engine updated' : 'Draft saved',
      config,
      ...state
    }
  };
}
