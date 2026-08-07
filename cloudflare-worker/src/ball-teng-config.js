const CONFIG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ball_teng_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

export const DEFAULT_BALL_TENG_CONFIG = Object.freeze({
  enabled: true,
  cutoffHourLocal: 8,
  minimumLeadMinutes: 45,
  minimumConfidence: 58,
  maximumConfidence: 85,
  confidenceStrengthScale: 15,
  minimumMainOdds: 1.70,
  overallSample: 6,
  venueSample: 5,
  historyFetch: 20,
  minimumSample: 3,
  minimumStrengthScore: 0.55,
  minimumOverallPpgEdge: 0.25,
  minimumVenuePpgEdge: 0.35,
  maximumFixturesToAnalyze: 240,
  maximumSelections: 0,
  overallPpgWeight: 0.34,
  venuePpgWeight: 0.36,
  goalDifferenceWeight: 0.18,
  useStandingsContext: true,
  standingsStrengthWeight: 0.32,
  standingsAdjustmentCap: 0.32,
  standingsDirectRankMix: 0.55,
  standingsRankedCommonMix: 0.45
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
  return Number(result.toFixed(6));
}

function integer(value, fallback, min, max) {
  return Math.round(bounded(value, fallback, min, max));
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function normalizeBallTengConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const minimumConfidence = integer(source.minimumConfidence, 58, 1, 99);
  const maximumConfidence = integer(source.maximumConfidence, 85, minimumConfidence, 99);
  const overallSample = integer(source.overallSample, 6, 1, 20);
  const venueSample = integer(source.venueSample, 5, 1, 20);
  const minimumSample = integer(source.minimumSample, 3, 1, Math.min(overallSample, venueSample));

  return {
    enabled: booleanValue(source.enabled, true),
    cutoffHourLocal: integer(source.cutoffHourLocal, 8, 0, 23),
    minimumLeadMinutes: integer(source.minimumLeadMinutes, 45, 0, 720),
    minimumConfidence,
    maximumConfidence,
    confidenceStrengthScale: bounded(source.confidenceStrengthScale, 15, 1, 50, 0.1),
    minimumMainOdds: bounded(source.minimumMainOdds, 1.70, 1.01, 100, 0.01),
    overallSample,
    venueSample,
    historyFetch: integer(source.historyFetch, 20, Math.max(overallSample, venueSample), 100),
    minimumSample,
    minimumStrengthScore: bounded(source.minimumStrengthScore, 0.55, 0, 5, 0.01),
    minimumOverallPpgEdge: bounded(source.minimumOverallPpgEdge, 0.25, 0, 3, 0.01),
    minimumVenuePpgEdge: bounded(source.minimumVenuePpgEdge, 0.35, 0, 3, 0.01),
    maximumFixturesToAnalyze: integer(source.maximumFixturesToAnalyze, 240, 0, 2000),
    maximumSelections: integer(source.maximumSelections, 0, 0, 500),
    overallPpgWeight: bounded(source.overallPpgWeight, 0.34, 0, 1, 0.01),
    venuePpgWeight: bounded(source.venuePpgWeight, 0.36, 0, 1, 0.01),
    goalDifferenceWeight: bounded(source.goalDifferenceWeight, 0.18, 0, 1, 0.01),
    useStandingsContext: booleanValue(source.useStandingsContext, true),
    standingsStrengthWeight: bounded(source.standingsStrengthWeight, 0.32, 0, 1, 0.01),
    standingsAdjustmentCap: bounded(source.standingsAdjustmentCap, 0.32, 0, 1, 0.01),
    standingsDirectRankMix: bounded(source.standingsDirectRankMix, 0.55, 0, 1, 0.01),
    standingsRankedCommonMix: bounded(source.standingsRankedCommonMix, 0.45, 0, 1, 0.01)
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(CONFIG_TABLE_SQL).run();
  const row = await env.DB.prepare('SELECT id FROM ball_teng_config WHERE id = 1').first();
  if (!row) {
    const now = Date.now();
    const json = JSON.stringify(normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG));
    await env.DB.prepare(`
      INSERT INTO ball_teng_config (id, draft_json, active_json, updated_at, activated_at)
      VALUES (1, ?, ?, ?, ?)
    `).bind(json, json, now, now).run();
  }
  schemaReady = true;
}

function parseStored(value, fallback) {
  try {
    return normalizeBallTengConfig(JSON.parse(value || ''));
  } catch {
    return normalizeBallTengConfig(fallback);
  }
}

export async function getBallTengConfigState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM ball_teng_config WHERE id = 1').first();
  const active = parseStored(row?.active_json, DEFAULT_BALL_TENG_CONFIG);
  const draft = parseStored(row?.draft_json, active);
  return {
    defaults: normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG),
    draft,
    active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0),
    policy: {
      legacyUnrankedCommonOpponentWeight: 0,
      rankedAbcOnly: true,
      note: 'The old unranked common-opponent term is retired. Ranked A-B-C uses league standings when available.'
    }
  };
}

async function saveDraft(env, config) {
  const normalized = normalizeBallTengConfig(config);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE ball_teng_config SET draft_json = ?, updated_at = ? WHERE id = 1
  `).bind(JSON.stringify(normalized), now).run();
  return normalized;
}

async function runConfig(env, config) {
  const normalized = normalizeBallTengConfig(config);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE ball_teng_config
    SET draft_json = ?, active_json = ?, updated_at = ?, activated_at = ?
    WHERE id = 1
  `).bind(JSON.stringify(normalized), JSON.stringify(normalized), now, now).run();
  return normalized;
}

export async function handleBallTengConfig(request, env) {
  await ensureSchema(env);

  if (request.method === 'GET') {
    return { status: 200, data: { ok: true, ...(await getBallTengConfigState(env)) } };
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
  const state = await getBallTengConfigState(env);

  return {
    status: 200,
    data: {
      ok: true,
      action,
      message: action === 'run'
        ? 'Ball-teng configuration activated; the automatic selector will consume this version on its next scheduler check.'
        : 'Ball-teng draft saved; the active selector is unchanged.',
      config,
      ...state
    }
  };
}
