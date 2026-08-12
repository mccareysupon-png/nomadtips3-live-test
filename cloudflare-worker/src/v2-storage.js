const LATEST_ID = 1;\nconst CONFIG_ID = 1;

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
\nfunction json(value) {
  return JSON.stringify(value ?? null);
}

function timestamp(value, fallback = Date.now()) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rounded(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? 0 : Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function outcomeFor(signal) {
  const explicit = String(signal?.outcome || '').toUpperCase();
  if (['WIN', 'LOSS', 'PUSH', 'VOID', 'PENDING'].includes(explicit)) return explicit;
  const settlement = String(signal?.settlement || '').toUpperCase();
  if (settlement.includes('WIN')) return 'WIN';
  if (settlement.includes('LOSS')) return 'LOSS';
  if (settlement === 'PUSH') return 'PUSH';
  if (settlement === 'VOID') return 'VOID';
  return 'PENDING';
}

export function normalizeCandidateHistory(candidate, generatedAt = Date.now()) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const fixtureId = Math.round(numberOrNull(source.fixture_id) || 0);
  const side = String(source.side || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
  const seenAt = timestamp(generatedAt);
  return {
    candidateKey: String(source.candidate_key || `${fixtureId}:${side}`),
    fixtureId,
    selectedSide: side,
    selectedTeam: String(source.selected_team || ''),
    opponent: String(source.opponent || ''),
    market: String(source.market || 'AH').toUpperCase(),
    minute: Math.round(numberOrNull(source.minute) || 0),
    score: String(source.score || ''),
    momentum: numberOrNull(source.momentum),
    streak: Math.max(0, Math.round(numberOrNull(source.streak) || 0)),
    triggered: Boolean(source.triggered),
    state: String(source.state || (source.triggered ? 'TRIGGERED' : 'WARMING')).toUpperCase(),
    seenAt,
    payload: source,
  };
}

export function normalizeSignalAnalytics(signal, fallbackTime = Date.now()) {
  const source = signal && typeof signal === 'object' ? signal : {};
  const createdAt = timestamp(source.created_at, fallbackTime);
  const settledAt = source.settled_at ? timestamp(source.settled_at, fallbackTime) : null;
  const outcome = outcomeFor(source);
  return {
    signalId: String(source.signal_id || ''),
    signalKey: String(source.signal_key || `${source.fixture_id || 0}:${source.selection || 'HOME'}`),
    fixtureId: Math.round(numberOrNull(source.fixture_id) || 0),
    selectedSide: String(source.selection || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME',
    selectedTeam: String(source.selected_team || source.selection || ''),
    opponent: String(source.opponent || ''),
    market: String(source.market || 'AH').toUpperCase(),
    entryMinute: Math.round(numberOrNull(source.minute) || 0),
    entryScore: source.score || null,
    targetOdds: numberOrNull(source.target_odds),
    ahLine: numberOrNull(source.ah_line),
    status: String(source.status || (outcome === 'PENDING' ? 'PENDING' : 'SETTLED')).toUpperCase(),
    outcome,
    result: String(source.result || (outcome === 'PENDING' ? 'PENDING' : 'NEUTRAL')).toUpperCase(),
    settlement: String(source.settlement || 'PENDING').toUpperCase(),
    finalStatus: source.final_status ? String(source.final_status).toUpperCase() : null,
    finalScore: source.final_score || null,
    stakeUnits: rounded(source.stake_units || 1),
    profitUnits: rounded(source.profit_units || 0),
    returnedUnits: rounded(source.returned_units || 0),
    createdAt,
    settledAt,
    payload: source,
  };
}

export function summarizeSignalAnalytics(signals = []) {
  const normalized = signals.map(signal => normalizeSignalAnalytics(signal));
  const summary = {
    total: normalized.length,
    pending: 0,
    win: 0,
    loss: 0,
    push: 0,
    void: 0,
    settled: 0,
    stakeUnits: 0,
    netUnits: 0,
    roiPercent: 0,
    accuracyPercent: 0,
  };
  for (const signal of normalized) {
    const key = signal.outcome.toLowerCase();
    if (Object.hasOwn(summary, key)) summary[key] += 1;
    if (signal.outcome !== 'PENDING') summary.settled += 1;
    if (['WIN', 'LOSS', 'PUSH'].includes(signal.outcome)) {
      summary.stakeUnits += signal.stakeUnits;
      summary.netUnits += signal.profitUnits;
    }
  }
  summary.stakeUnits = rounded(summary.stakeUnits);
  summary.netUnits = rounded(summary.netUnits);
  summary.roiPercent = summary.stakeUnits ? rounded(summary.netUnits / summary.stakeUnits * 100) : 0;
  summary.accuracyPercent = summary.win + summary.loss
    ? rounded(summary.win / (summary.win + summary.loss) * 100)
    : 0;
  return summary;
}

function thaiDateKey(value) {
  return new Date(timestamp(value) + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

export function dailySignalAnalytics(signals = [], days = 30, now = Date.now()) {
  const safeDays = Math.max(1, Math.min(90, Math.round(numberOrNull(days) || 30)));
  const todayStart = Date.parse(`${thaiDateKey(now)}T00:00:00.000Z`);
  const buckets = [];
  const byDate = new Map();
  for (let index = safeDays - 1; index >= 0; index -= 1) {
    const date = new Date(todayStart - index * 86_400_000).toISOString().slice(0, 10);
    const bucket = { date, signals: 0, win: 0, loss: 0, push: 0, pending: 0, void: 0, netUnits: 0, cumulativeUnits: 0 };
    buckets.push(bucket);
    byDate.set(date, bucket);
  }
  for (const raw of signals) {
    const signal = normalizeSignalAnalytics(raw, now);
    const bucket = byDate.get(thaiDateKey(signal.createdAt));
    if (!bucket) continue;
    bucket.signals += 1;
    const key = signal.outcome.toLowerCase();
    if (Object.hasOwn(bucket, key)) bucket[key] += 1;
    bucket.netUnits = rounded(bucket.netUnits + signal.profitUnits);
  }
  let cumulative = 0;
  for (const bucket of buckets) {
    cumulative = rounded(cumulative + bucket.netUnits);
    bucket.cumulativeUnits = cumulative;
  }
  return buckets;
}
\nexport async function ensureV2Schema(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`\n      CREATE TABLE IF NOT EXISTS v2_latest_state (\n        id INTEGER PRIMARY KEY CHECK (id = 1),\n        schema_name TEXT NOT NULL,\n        generated_at TEXT NOT NULL,\n        ingested_at INTEGER NOT NULL,\n        collector_id TEXT NOT NULL,\n        state_hash TEXT NOT NULL,\n        live_count INTEGER NOT NULL DEFAULT 0,\n        candidate_count INTEGER NOT NULL DEFAULT 0,\n        statistics_fixture_count INTEGER NOT NULL DEFAULT 0,\n        live_odds_fixture_count INTEGER NOT NULL DEFAULT 0,\n        request_count_process INTEGER NOT NULL DEFAULT 0,\n        rate_limit_remaining INTEGER,\n        rate_limit_limit INTEGER,\n        payload_json TEXT NOT NULL\n      )\n    `),\n    env.DB.prepare(`\n      CREATE TABLE IF NOT EXISTS v2_owner_config (\n        id INTEGER PRIMARY KEY CHECK (id = 1),\n        version INTEGER NOT NULL DEFAULT 1,\n        config_json TEXT NOT NULL,\n        updated_at INTEGER NOT NULL,\n        updated_by TEXT NOT NULL DEFAULT 'owner'\n      )\n    `),\n    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_signal_history (
        signal_id TEXT PRIMARY KEY,\n        fixture_id INTEGER NOT NULL,\n        selected_side TEXT,\n        selected_team TEXT,\n        opponent TEXT,\n        minute INTEGER,\n        state TEXT NOT NULL,\n        payload_json TEXT NOT NULL,\n        created_at INTEGER NOT NULL,\n        updated_at INTEGER NOT NULL\n      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_candidate_history (
        candidate_key TEXT PRIMARY KEY,
        fixture_id INTEGER NOT NULL,
        selected_side TEXT NOT NULL,
        selected_team TEXT,
        opponent TEXT,
        market TEXT,
        entry_minute INTEGER,
        last_minute INTEGER,
        entry_score TEXT,
        last_score TEXT,
        peak_momentum REAL,
        last_momentum REAL,
        max_streak INTEGER NOT NULL DEFAULT 0,
        triggered INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'WARMING',
        sample_count INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS v2_signal_analytics (
        signal_id TEXT PRIMARY KEY,
        signal_key TEXT NOT NULL,
        fixture_id INTEGER NOT NULL,
        selected_side TEXT NOT NULL,
        selected_team TEXT,
        opponent TEXT,
        market TEXT,
        entry_minute INTEGER,
        entry_score TEXT,
        target_odds REAL,
        ah_line REAL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        outcome TEXT NOT NULL DEFAULT 'PENDING',
        result TEXT NOT NULL DEFAULT 'PENDING',
        settlement TEXT NOT NULL DEFAULT 'PENDING',
        final_status TEXT,
        final_score TEXT,
        stake_units REAL NOT NULL DEFAULT 1,
        profit_units REAL NOT NULL DEFAULT 0,
        returned_units REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
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
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_candidate_last_seen ON v2_candidate_history(last_seen_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_candidate_fixture ON v2_candidate_history(fixture_id, selected_side)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_analytics_created ON v2_signal_analytics(created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_v2_analytics_outcome ON v2_signal_analytics(outcome, created_at DESC)`),
    env.DB.prepare(`
      INSERT OR IGNORE INTO v2_owner_config (
        id, version, config_json, updated_at, updated_by
      ) VALUES (?, 1, ?, ?, 'migration')
    `).bind(CONFIG_ID, json(DEFAULT_V2_OWNER_CONFIG), now)
  ]);
}

function candidateHistoryStatement(env, candidate, generatedAt, now) {
  const row = normalizeCandidateHistory(candidate, generatedAt);
  return env.DB.prepare(`
    INSERT INTO v2_candidate_history (
      candidate_key, fixture_id, selected_side, selected_team, opponent, market,
      entry_minute, last_minute, entry_score, last_score,
      peak_momentum, last_momentum, max_streak, triggered, state,
      sample_count, payload_json, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(candidate_key) DO UPDATE SET
      selected_team = excluded.selected_team,
      opponent = excluded.opponent,
      market = excluded.market,
      last_minute = excluded.last_minute,
      last_score = excluded.last_score,
      peak_momentum = CASE
        WHEN excluded.peak_momentum IS NULL THEN v2_candidate_history.peak_momentum
        WHEN v2_candidate_history.peak_momentum IS NULL THEN excluded.peak_momentum
        ELSE MAX(v2_candidate_history.peak_momentum, excluded.peak_momentum)
      END,
      last_momentum = excluded.last_momentum,
      max_streak = MAX(v2_candidate_history.max_streak, excluded.max_streak),
      triggered = MAX(v2_candidate_history.triggered, excluded.triggered),
      state = excluded.state,
      sample_count = v2_candidate_history.sample_count + 1,
      payload_json = excluded.payload_json,
      last_seen_at = MAX(v2_candidate_history.last_seen_at, excluded.last_seen_at),
      updated_at = excluded.updated_at
  `).bind(
    row.candidateKey,
    row.fixtureId,
    row.selectedSide,
    row.selectedTeam,
    row.opponent,
    row.market,
    row.minute,
    row.minute,
    row.score,
    row.score,
    row.momentum,
    row.momentum,
    row.streak,
    row.triggered ? 1 : 0,
    row.state,
    json(row.payload),
    row.seenAt,
    row.seenAt,
    now,
  );
}

function signalAnalyticsStatement(env, signal, generatedAt, now) {
  const row = normalizeSignalAnalytics(signal, generatedAt);
  if (!row.signalId || !row.fixtureId) return null;
  return env.DB.prepare(`
    INSERT INTO v2_signal_analytics (
      signal_id, signal_key, fixture_id, selected_side, selected_team, opponent,
      market, entry_minute, entry_score, target_odds, ah_line,
      status, outcome, result, settlement, final_status, final_score,
      stake_units, profit_units, returned_units, payload_json,
      created_at, settled_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(signal_id) DO UPDATE SET
      status = excluded.status,
      outcome = excluded.outcome,
      result = excluded.result,
      settlement = excluded.settlement,
      final_status = excluded.final_status,
      final_score = excluded.final_score,
      profit_units = excluded.profit_units,
      returned_units = excluded.returned_units,
      payload_json = excluded.payload_json,
      settled_at = excluded.settled_at,
      updated_at = excluded.updated_at
  `).bind(
    row.signalId,
    row.signalKey,
    row.fixtureId,
    row.selectedSide,
    row.selectedTeam,
    row.opponent,
    row.market,
    row.entryMinute,
    json(row.entryScore),
    row.targetOdds,
    row.ahLine,
    row.status,
    row.outcome,
    row.result,
    row.settlement,
    row.finalStatus,
    json(row.finalScore),
    row.stakeUnits,
    row.profitUnits,
    row.returnedUnits,
    json(row.payload),
    row.createdAt,
    row.settledAt,
    now,
  );
}

async function runStatementBatches(env, statements, batchSize = 75) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await env.DB.batch(statements.slice(index, index + batchSize));
  }
}

export async function writeLatestState(env, envelope) {
  const now = Date.now();\n  const payload = envelope?.payload || {};\n  const rate = payload?.rate_limit || {};\n  const statements = [env.DB.prepare(`
    INSERT INTO v2_latest_state (
      id, schema_name, generated_at, ingested_at, collector_id, state_hash,\n      live_count, candidate_count, statistics_fixture_count,\n      live_odds_fixture_count, request_count_process,\n      rate_limit_remaining, rate_limit_limit, payload_json\n    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ON CONFLICT(id) DO UPDATE SET\n      schema_name = excluded.schema_name,\n      generated_at = excluded.generated_at,\n      ingested_at = excluded.ingested_at,\n      collector_id = excluded.collector_id,\n      state_hash = excluded.state_hash,\n      live_count = excluded.live_count,\n      candidate_count = excluded.candidate_count,\n      statistics_fixture_count = excluded.statistics_fixture_count,\n      live_odds_fixture_count = excluded.live_odds_fixture_count,\n      request_count_process = excluded.request_count_process,\n      rate_limit_remaining = excluded.rate_limit_remaining,\n      rate_limit_limit = excluded.rate_limit_limit,\n      payload_json = excluded.payload_json\n  `).bind(
    LATEST_ID,\n    String(payload.schema || 'nomadtips3.live.v2.fixture-snapshot'),\n    String(payload.generated_at || new Date(now).toISOString()),\n    now,\n    String(envelope.collector_id || 'unknown'),\n    String(envelope.state_hash || ''),\n    Number(payload.live_count || 0),\n    Number(payload.preliminary_candidate_count || 0),\n    Number(payload.statistics_fixture_count || 0),\n    Number(payload.live_odds_fixture_count || 0),\n    Number(payload.request_count_process || 0),\n    Number.isFinite(Number(rate.minute_remaining)) ? Number(rate.minute_remaining) : null,\n    Number.isFinite(Number(rate.minute_limit)) ? Number(rate.minute_limit) : null,\n    json(payload)
  )];

  const generatedAt = timestamp(payload.generated_at, now);
  const candidates = Array.isArray(payload?.engine?.active_candidates)
    ? payload.engine.active_candidates.slice(0, 100)
    : [];
  const signals = Array.isArray(payload?.engine?.recent_signals)
    ? payload.engine.recent_signals.slice(0, 200)
    : [];
  statements.push(...candidates.map(candidate => candidateHistoryStatement(env, candidate, generatedAt, now)));
  statements.push(...signals.map(signal => signalAnalyticsStatement(env, signal, generatedAt, now)).filter(Boolean));
  statements.push(
    env.DB.prepare('DELETE FROM v2_candidate_history WHERE last_seen_at < ?')
      .bind(now - 90 * 86_400_000)
  );
  await runStatementBatches(env, statements);
}
\nexport async function readLatestState(env) {
  const row = await env.DB.prepare(`SELECT * FROM v2_latest_state WHERE id = ? LIMIT 1`).bind(LATEST_ID).first();\n  if (!row) return null;\n  let payload = null;\n  try { payload = JSON.parse(row.payload_json || 'null'); } catch {}\n  return {\n    schemaName: row.schema_name,\n    generatedAt: row.generated_at,\n    ingestedAt: Number(row.ingested_at || 0),\n    collectorId: row.collector_id,\n    stateHash: row.state_hash,\n    liveCount: Number(row.live_count || 0),\n    candidateCount: Number(row.candidate_count || 0),\n    statisticsFixtureCount: Number(row.statistics_fixture_count || 0),\n    liveOddsFixtureCount: Number(row.live_odds_fixture_count || 0),\n    requestCountProcess: Number(row.request_count_process || 0),\n    rateLimitRemaining: row.rate_limit_remaining === null ? null : Number(row.rate_limit_remaining),\n    rateLimitLimit: row.rate_limit_limit === null ? null : Number(row.rate_limit_limit),\n    payload\n  };
}

function parsePayload(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function readOwnerAnalytics(env, days = 30, now = Date.now()) {
  const rangeDays = Math.max(1, Math.min(90, Math.round(numberOrNull(days) || 30)));
  const cutoff = now - rangeDays * 86_400_000;
  const [signalQuery, candidateQuery] = await Promise.all([
    env.DB.prepare(`
      SELECT payload_json
      FROM v2_signal_analytics
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 5000
    `).bind(cutoff).all(),
    env.DB.prepare(`
      SELECT candidate_key, fixture_id, selected_side, selected_team, opponent,
             market, entry_minute, last_minute, entry_score, last_score,
             peak_momentum, last_momentum, max_streak, triggered, state,
             sample_count, payload_json, first_seen_at, last_seen_at
      FROM v2_candidate_history
      WHERE last_seen_at >= ?
      ORDER BY last_seen_at DESC
      LIMIT 500
    `).bind(cutoff).all(),
  ]);

  const signals = (signalQuery.results || [])
    .map(row => parsePayload(row.payload_json, null))
    .filter(Boolean);
  const candidates = (candidateQuery.results || []).map(row => ({
    ...parsePayload(row.payload_json),
    candidate_key: row.candidate_key,
    fixture_id: Number(row.fixture_id || 0),
    side: row.selected_side,
    selected_team: row.selected_team,
    opponent: row.opponent,
    market: row.market,
    entry_minute: Number(row.entry_minute || 0),
    last_minute: Number(row.last_minute || 0),
    entry_score: row.entry_score,
    last_score: row.last_score,
    peak_momentum: row.peak_momentum === null ? null : Number(row.peak_momentum),
    last_momentum: row.last_momentum === null ? null : Number(row.last_momentum),
    max_streak: Number(row.max_streak || 0),
    triggered: Boolean(Number(row.triggered || 0)),
    state: String(row.state || 'WARMING'),
    sample_count: Number(row.sample_count || 0),
    first_seen_at: Number(row.first_seen_at || 0),
    last_seen_at: Number(row.last_seen_at || 0),
    active: now - Number(row.last_seen_at || 0) < 3 * 60_000,
  }));

  return {
    rangeDays,
    summary: summarizeSignalAnalytics(signals),
    daily: dailySignalAnalytics(signals, rangeDays, now),
    candidates,
    signals: signals.slice(0, 500),
    generatedAt: new Date(now).toISOString(),
  };
}

export async function readOwnerConfig(env) {
  const row = await env.DB.prepare(`\n    SELECT version, config_json, updated_at, updated_by\n    FROM v2_owner_config WHERE id = ? LIMIT 1\n  `).bind(CONFIG_ID).first();\n  if (!row) return null;\n  let config = {};\n  try { config = normalizeV2OwnerConfig(JSON.parse(row.config_json || '{}')); } catch {
    config = normalizeV2OwnerConfig(DEFAULT_V2_OWNER_CONFIG);
  }
  return {\n    version: Number(row.version || 1),\n    config,\n    updatedAt: Number(row.updated_at || 0),\n    updatedBy: row.updated_by || 'owner'\n  };\n}\n\nexport async function writeOwnerConfig(env, config, expectedVersion = null, updatedBy = 'owner') {
  const current = await readOwnerConfig(env);\n  if (expectedVersion !== null && current && Number(expectedVersion) !== current.version) {\n    return { ok: false, conflict: true, current };\n  }\n  const normalized = normalizeV2OwnerConfig(config);
  const nextVersion = current ? current.version + 1 : 1;
  const now = Date.now();\n  await env.DB.prepare(`\n    INSERT INTO v2_owner_config (id, version, config_json, updated_at, updated_by)\n    VALUES (?, ?, ?, ?, ?)\n    ON CONFLICT(id) DO UPDATE SET\n      version = excluded.version,\n      config_json = excluded.config_json,\n      updated_at = excluded.updated_at,\n      updated_by = excluded.updated_by\n  `).bind(CONFIG_ID, nextVersion, json(normalized), now, String(updatedBy || 'owner')).run();
  return {\n    ok: true,\n    conflict: false,\n    version: nextVersion,\n    config: normalized,
    updatedAt: now,\n    updatedBy: String(updatedBy || 'owner')\n  };\n}\n