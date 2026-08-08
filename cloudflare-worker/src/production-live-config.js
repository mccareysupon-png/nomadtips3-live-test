const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS production_live_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

export const DEFAULT_PRODUCTION_LIVE_CONFIG = Object.freeze({
  engineEnabled: true,
  refreshSeconds: 60,
  fixturesMax: 100,
  minuteMin: 0,
  minuteMax: 120,
  minimumTotalGoals: 0,
  goalGapLimited: false,
  maxGoalGap: 20,
  countryFilter: '',
  leagueFilter: '',
  teamFilter: '',
  sortMode: 'MINUTE_DESC'
});

let schemaReady = false;

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function text(value, max = 80) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeProductionLiveConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const minuteMin = Math.round(number(source.minuteMin, 0, 0, 119));
  const minuteMax = Math.round(number(source.minuteMax, 120, minuteMin + 1, 120));
  const sortMode = ['MINUTE_DESC', 'MINUTE_ASC', 'LEAGUE'].includes(String(source.sortMode || '').toUpperCase())
    ? String(source.sortMode).toUpperCase()
    : 'MINUTE_DESC';
  return {
    engineEnabled: bool(source.engineEnabled, true),
    refreshSeconds: Math.round(number(source.refreshSeconds, 60, 15, 300)),
    fixturesMax: Math.round(number(source.fixturesMax, 100, 1, 500)),
    minuteMin,
    minuteMax,
    minimumTotalGoals: Math.round(number(source.minimumTotalGoals, 0, 0, 30)),
    goalGapLimited: bool(source.goalGapLimited, false),
    maxGoalGap: Math.round(number(source.maxGoalGap, 20, 0, 30)),
    countryFilter: text(source.countryFilter),
    leagueFilter: text(source.leagueFilter),
    teamFilter: text(source.teamFilter),
    sortMode
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT id FROM production_live_config WHERE id = 1').first();
  if (!row) {
    const now = Date.now();
    const json = JSON.stringify(DEFAULT_PRODUCTION_LIVE_CONFIG);
    await env.DB.prepare(`
      INSERT INTO production_live_config (id, draft_json, active_json, updated_at, activated_at)
      VALUES (1, ?, ?, ?, ?)
    `).bind(json, json, now, now).run();
  }
  schemaReady = true;
}

function parse(value, fallback) {
  try { return normalizeProductionLiveConfig(JSON.parse(value || '')); }
  catch { return normalizeProductionLiveConfig(fallback); }
}

export async function getProductionLiveConfigState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM production_live_config WHERE id = 1').first();
  const active = parse(row?.active_json, DEFAULT_PRODUCTION_LIVE_CONFIG);
  const draft = parse(row?.draft_json, active);
  return {
    defaults: normalizeProductionLiveConfig(DEFAULT_PRODUCTION_LIVE_CONFIG),
    draft,
    active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0),
    scope: 'CAR_1_PRODUCTION_ONLY'
  };
}

export async function getActiveProductionLiveConfig(env) {
  return (await getProductionLiveConfigState(env)).active;
}

function ownerAuthorized(request, env) {
  const expected = String(env.OWNER_CONTROL_KEY || env.API_FOOTBALL_KEY || '');
  const supplied = String(request.headers.get('X-NOMAD-OWNER-KEY') || '');
  return Boolean(expected && supplied && supplied === expected);
}

export async function handleProductionLiveConfig(request, env) {
  if (!env.OWNER_CONTROL_KEY && !env.API_FOOTBALL_KEY) {
    return { status: 503, data: { ok: false, error: 'Owner control secret is not configured' } };
  }
  if (!ownerAuthorized(request, env)) {
    return { status: 401, data: { ok: false, error: 'Owner authorization required' } };
  }
  await ensureSchema(env);
  if (request.method === 'GET') {
    return { status: 200, data: { ok: true, ...(await getProductionLiveConfigState(env)) } };
  }
  if (request.method !== 'POST') {
    return { status: 405, data: { ok: false, error: 'Method not allowed' } };
  }
  const body = await request.json().catch(() => null);
  const action = String(body?.action || '').toLowerCase();
  if (!body || !['save', 'activate'].includes(action)) {
    return { status: 400, data: { ok: false, error: 'Action must be save or activate' } };
  }
  const config = normalizeProductionLiveConfig(body.config);
  const now = Date.now();
  if (action === 'activate') {
    await env.DB.prepare(`
      UPDATE production_live_config
      SET draft_json = ?, active_json = ?, updated_at = ?, activated_at = ? WHERE id = 1
    `).bind(JSON.stringify(config), JSON.stringify(config), now, now).run();
  } else {
    await env.DB.prepare(`
      UPDATE production_live_config SET draft_json = ?, updated_at = ? WHERE id = 1
    `).bind(JSON.stringify(config), now).run();
  }
  return {
    status: 200,
    data: {
      ok: true,
      action,
      message: action === 'activate' ? 'Car 1 production live configuration activated' : 'Car 1 draft saved',
      ...(await getProductionLiveConfigState(env))
    }
  };
}

function includes(value, query) {
  return !query || String(value || '').toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export function applyProductionLiveConfig(results, config) {
  if (!config.engineEnabled) return [];
  const filtered = (Array.isArray(results) ? results : []).filter(match => {
    const minute = Number(match?.minute);
    const homeScore = Number(match?.homeScore);
    const awayScore = Number(match?.awayScore);
    if (!Number.isFinite(minute) || minute < config.minuteMin || minute > config.minuteMax) return false;
    if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
      if (homeScore + awayScore < config.minimumTotalGoals) return false;
      if (config.goalGapLimited && Math.abs(homeScore - awayScore) > config.maxGoalGap) return false;
    }
    if (!includes(match?.country, config.countryFilter)) return false;
    if (!includes(match?.league, config.leagueFilter)) return false;
    if (config.teamFilter && !includes(`${match?.home || ''} ${match?.away || ''}`, config.teamFilter)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    if (config.sortMode === 'MINUTE_ASC') return Number(a.minute || 0) - Number(b.minute || 0);
    if (config.sortMode === 'LEAGUE') return String(a.league || '').localeCompare(String(b.league || ''));
    return Number(b.minute || 0) - Number(a.minute || 0);
  });
  return filtered.slice(0, config.fixturesMax);
}
