const CONFIG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ball_teng_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  active_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL
)`;

const RUN_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ball_teng_add_k_run (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  requested_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  outcome TEXT,
  selection_count INTEGER,
  message TEXT
)`;

const RUN_STALE_MS = 30 * 60 * 1000;
const RUNNING_STATUSES = new Set(['QUEUED', 'ANALYZING']);

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
  standingsRankedCommonMix: 0.45,
  presetKey: null,
  addKTheKingOfSoccer: false,
  requireStandingsContext: false,
  minimumLeagueTeamCount: 0
});

export const ADD_K_THE_KING_OF_SOCCER_CONFIG = Object.freeze({
  ...DEFAULT_BALL_TENG_CONFIG,
  enabled: true,
  cutoffHourLocal: 8,
  minimumLeadMinutes: 45,
  minimumConfidence: 62,
  maximumConfidence: 85,
  confidenceStrengthScale: 15,
  minimumMainOdds: 1.70,
  overallSample: 6,
  venueSample: 5,
  historyFetch: 20,
  minimumSample: 5,
  minimumStrengthScore: 0.62,
  minimumOverallPpgEdge: 0.30,
  minimumVenuePpgEdge: 0.40,
  maximumFixturesToAnalyze: 240,
  maximumSelections: 0,
  overallPpgWeight: 0.34,
  venuePpgWeight: 0.36,
  goalDifferenceWeight: 0.18,
  useStandingsContext: true,
  standingsStrengthWeight: 0.32,
  standingsAdjustmentCap: 0.32,
  standingsDirectRankMix: 0.55,
  standingsRankedCommonMix: 0.45,
  presetKey: 'ADD_K_THE_KING_OF_SOCCER_V1',
  addKTheKingOfSoccer: true,
  requireStandingsContext: true,
  minimumLeagueTeamCount: 8
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

function presetKeyValue(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, 80);
  return clean || null;
}

function safeText(value, fallback = null, max = 160) {
  if (value === null || value === undefined) return fallback;
  const clean = String(value).trim().slice(0, max);
  return clean || fallback;
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
    standingsRankedCommonMix: bounded(source.standingsRankedCommonMix, 0.45, 0, 1, 0.01),
    presetKey: presetKeyValue(source.presetKey),
    addKTheKingOfSoccer: booleanValue(source.addKTheKingOfSoccer, false),
    requireStandingsContext: booleanValue(source.requireStandingsContext, false),
    minimumLeagueTeamCount: integer(source.minimumLeagueTeamCount, 0, 0, 100)
  };
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(CONFIG_TABLE_SQL).run();
  await env.DB.prepare(RUN_TABLE_SQL).run();

  const row = await env.DB.prepare('SELECT id FROM ball_teng_config WHERE id = 1').first();
  if (!row) {
    const now = Date.now();
    const json = JSON.stringify(normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG));
    await env.DB.prepare(`
      INSERT INTO ball_teng_config (id, draft_json, active_json, updated_at, activated_at)
      VALUES (1, ?, ?, ?, ?)
    `).bind(json, json, now, now).run();
  }

  const runRow = await env.DB.prepare('SELECT id FROM ball_teng_add_k_run WHERE id = 1').first();
  if (!runRow) {
    await env.DB.prepare(`
      INSERT INTO ball_teng_add_k_run
        (id, version, status, requested_at, started_at, completed_at, outcome, selection_count, message)
      VALUES (1, 0, 'READY', NULL, NULL, NULL, NULL, NULL, NULL)
    `).run();
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

function isoFromMs(value) {
  const number = Number(value || 0);
  return number > 0 ? new Date(number).toISOString() : null;
}

async function getAddKRunState(env) {
  const row = await env.DB.prepare('SELECT * FROM ball_teng_add_k_run WHERE id = 1').first();
  const rawStatus = String(row?.status || 'READY').toUpperCase();
  const ageBase = Number(row?.started_at || row?.requested_at || 0);
  const stale = RUNNING_STATUSES.has(rawStatus) && ageBase > 0 && Date.now() - ageBase > RUN_STALE_MS;
  const status = stale ? 'STALE' : rawStatus;
  return {
    version: Number(row?.version || 0),
    status,
    inProgress: RUNNING_STATUSES.has(rawStatus) && !stale,
    requestedAt: isoFromMs(row?.requested_at),
    startedAt: isoFromMs(row?.started_at),
    completedAt: isoFromMs(row?.completed_at),
    outcome: row?.outcome || null,
    selectionCount: row?.selection_count === null || row?.selection_count === undefined ? null : Number(row.selection_count),
    message: row?.message || null,
    staleAfterMinutes: RUN_STALE_MS / 60000
  };
}

async function writeAddKRunState(env, values) {
  await env.DB.prepare(`
    UPDATE ball_teng_add_k_run
    SET version = ?, status = ?, requested_at = ?, started_at = ?, completed_at = ?, outcome = ?, selection_count = ?, message = ?
    WHERE id = 1
  `).bind(
    Number(values.version || 0),
    String(values.status || 'READY').toUpperCase(),
    values.requestedAt ?? null,
    values.startedAt ?? null,
    values.completedAt ?? null,
    values.outcome ?? null,
    values.selectionCount ?? null,
    values.message ?? null
  ).run();
}

export async function getBallTengConfigState(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM ball_teng_config WHERE id = 1').first();
  const active = parseStored(row?.active_json, DEFAULT_BALL_TENG_CONFIG);
  const draft = parseStored(row?.draft_json, active);
  return {
    defaults: normalizeBallTengConfig(DEFAULT_BALL_TENG_CONFIG),
    presets: {
      addKTheKingOfSoccer: normalizeBallTengConfig(ADD_K_THE_KING_OF_SOCCER_CONFIG)
    },
    draft,
    active,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
    activatedAt: row?.activated_at ? new Date(Number(row.activated_at)).toISOString() : null,
    version: Number(row?.activated_at || 0),
    activePreset: active.presetKey || null,
    addKRun: await getAddKRunState(env),
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

async function runFixedPreset(env, config) {
  const runState = await getAddKRunState(env);
  if (runState.inProgress) {
    const error = new Error(`Add K run ${runState.version} is still ${runState.status}`);
    error.code = 'ADD_K_RUN_IN_PROGRESS';
    error.runState = runState;
    throw error;
  }

  const normalized = normalizeBallTengConfig(config);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE ball_teng_config
    SET active_json = ?, updated_at = ?, activated_at = ?
    WHERE id = 1
  `).bind(JSON.stringify(normalized), now, now).run();
  await writeAddKRunState(env, {
    version: now,
    status: 'QUEUED',
    requestedAt: now,
    message: 'Waiting for the Ball Teng scheduler to start this Add K run.'
  });
  return normalized;
}

async function updateRunProgress(env, body, status) {
  const current = await getAddKRunState(env);
  const version = Number(body.version || 0);
  if (!version || version !== Number(current.version)) {
    return { status: 409, data: { ok: false, error: 'Run version does not match the active Add K run.', addKRun: current } };
  }

  const now = Date.now();
  if (status === 'ANALYZING') {
    await writeAddKRunState(env, {
      version,
      status,
      requestedAt: Date.parse(current.requestedAt || '') || now,
      startedAt: now,
      message: safeText(body.message, 'The selector is analyzing the Add K run.')
    });
  } else {
    const outcome = safeText(body.outcome, status === 'FAILED' ? 'FAILED' : 'COMPLETE', 40);
    const count = Math.max(0, Math.min(500, Math.round(Number(body.selectionCount || 0))));
    await writeAddKRunState(env, {
      version,
      status,
      requestedAt: Date.parse(current.requestedAt || '') || now,
      startedAt: Date.parse(current.startedAt || '') || now,
      completedAt: now,
      outcome,
      selectionCount: count,
      message: safeText(body.message, status === 'FAILED' ? 'Add K run failed.' : 'Add K run completed.')
    });
  }
  return { status: 200, data: { ok: true, action: `mark-add-k-${status.toLowerCase()}`, addKRun: await getAddKRunState(env) } };
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
  const allowed = ['save', 'run', 'run-add-k', 'mark-add-k-analyzing', 'mark-add-k-complete', 'mark-add-k-failed'];
  if (!allowed.includes(action)) {
    return { status: 400, data: { ok: false, error: `Action must be one of: ${allowed.join(', ')}` } };
  }

  if (action === 'mark-add-k-analyzing') return updateRunProgress(env, body, 'ANALYZING');
  if (action === 'mark-add-k-complete') return updateRunProgress(env, body, 'COMPLETE');
  if (action === 'mark-add-k-failed') return updateRunProgress(env, body, 'FAILED');

  let config;
  try {
    if (action === 'run-add-k') {
      config = await runFixedPreset(env, ADD_K_THE_KING_OF_SOCCER_CONFIG);
    } else if (action === 'run') {
      config = await runConfig(env, body.config);
    } else {
      config = await saveDraft(env, body.config);
    }
  } catch (error) {
    if (error?.code === 'ADD_K_RUN_IN_PROGRESS') {
      return { status: 409, data: { ok: false, error: error.message, addKRun: error.runState } };
    }
    throw error;
  }

  const state = await getBallTengConfigState(env);
  return {
    status: 200,
    data: {
      ok: true,
      action,
      message: action === 'run-add-k'
        ? 'Add K The King of Soccer queued as one locked run. A second run is blocked until this run completes or becomes stale.'
        : action === 'run'
          ? 'Ball-teng configuration activated; the automatic selector will consume this version on its next scheduler check.'
          : 'Ball-teng draft saved; the active selector is unchanged.',
      config,
      ...state
    }
  };
}
