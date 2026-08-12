import {
  ensureV2Schema,
  readLatestState,
  readOwnerAnalytics,
} from './v2-storage.js';

const ALLOWED_ORIGINS = new Set([
  'https://nomadtips3.com',
  'https://www.nomadtips3.com',
  'https://mccareysupon-png.github.io',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://www.nomadtips3.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function first(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function safeText(value, max = 180) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function safeCondition(source = {}) {
  const allowed = [
    'enabled', 'statuses', 'side', 'minute_min', 'minute_max', 'market',
    'odds_min', 'odds_max', 'ah_min', 'ah_max', 'momentum_min',
    'attack_evidence_enabled', 'confirmation_rounds', 'goal_gap_enabled',
    'max_goal_gap', 'score_states', 'statistics_enabled', 'live_odds_enabled',
    'statistics_ttl_seconds', 'live_odds_ttl_seconds', 'signal_limit_enabled',
    'signal_limit', 'signal_limit_policy',
  ];
  const output = {};
  for (const key of allowed) {
    const value = source?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) output[key] = value.slice(0, 20).map(item => safeText(item, 40));
    else if (['string', 'number', 'boolean'].includes(typeof value) || value === null) output[key] = value;
  }
  return output;
}

function safeCounts(source = {}) {
  const output = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!/^[a-z0-9_]{1,48}$/i.test(key)) continue;
    const parsed = finite(value);
    if (parsed !== null) output[key] = parsed;
  }
  return output;
}

function safeSignal(source = {}) {
  return {
    signalId: safeText(first(source.signalId, source.signal_id), 100),
    fixtureId: finite(first(source.fixtureId, source.fixture_id)),
    selectedSide: safeText(first(source.selectedSide, source.selected_side, source.selection, source.side), 24),
    selectedTeam: safeText(first(source.selectedTeam, source.selected_team, source.team_name), 100),
    opponent: safeText(source.opponent, 100),
    home: safeText(first(source.home, source.home_name), 100),
    away: safeText(first(source.away, source.away_name), 100),
    market: safeText(first(source.market, source.market_name), 60),
    entryMinute: finite(first(source.entryMinute, source.entry_minute, source.minute)),
    entryScore: safeText(first(source.entryScore, source.entry_score, source.score), 40),
    targetOdds: finite(first(source.targetOdds, source.target_odds, source.odds, source.odd)),
    confidence: finite(first(source.confidence, source.momentum, source.momentum_score)),
    status: safeText(source.status, 32),
    outcome: safeText(first(source.outcome, source.result), 32),
    result: safeText(source.result, 32),
    settlement: safeText(source.settlement, 50),
    finalStatus: safeText(first(source.finalStatus, source.final_status), 32),
    finalScore: safeText(first(source.finalScore, source.final_score), 40),
    stakeUnits: finite(first(source.stakeUnits, source.stake_units)),
    profitUnits: finite(first(source.profitUnits, source.profit_units)),
    createdAt: first(source.createdAt, source.created_at),
    settledAt: first(source.settledAt, source.settled_at),
  };
}

function safeRuntime(source = {}) {
  return {
    ok: source?.ok === true,
    lastSuccessAt: first(source?.last_success_at, source?.lastSuccessAt),
    lastErrorAt: first(source?.last_error_at, source?.lastErrorAt),
    errorCode: safeText(first(source?.error_code, source?.errorCode), 60),
    consecutiveFailures: finite(first(source?.consecutive_failures, source?.consecutiveFailures)) || 0,
    retryInSeconds: finite(first(source?.retry_in_seconds, source?.retryInSeconds)) || 0,
  };
}

function publicMonitorState(latest) {
  if (!latest?.payload) return null;
  const source = latest.payload;
  const engine = source.engine && typeof source.engine === 'object' ? source.engine : {};
  const recentSignals = Array.isArray(engine.recent_signals)
    ? engine.recent_signals.slice(0, 60).map(safeSignal)
    : [];
  return {
    generatedAt: latest.generatedAt,
    ingestedAt: latest.ingestedAt,
    liveCount: latest.liveCount,
    candidateCount: latest.candidateCount,
    statisticsFixtureCount: latest.statisticsFixtureCount,
    liveOddsFixtureCount: latest.liveOddsFixtureCount,
    payload: {
      schema: source.schema,
      generated_at: source.generated_at,
      live_count: source.live_count,
      preliminary_candidate_count: source.preliminary_candidate_count,
      statistics_fixture_count: source.statistics_fixture_count,
      live_odds_fixture_count: source.live_odds_fixture_count,
      fixtures: Array.isArray(source.fixtures) ? source.fixtures : [],
      preliminary_candidates: Array.isArray(source.preliminary_candidates) ? source.preliminary_candidates : [],
      condition: safeCondition(source.condition || {}),
      condition_meta: {
        source: safeText(source.condition_meta?.source, 60),
        version: finite(source.condition_meta?.version) || 0,
      },
      engine: {
        counts: safeCounts(engine.counts || {}),
        recent_signals: recentSignals,
      },
      runtime: safeRuntime(source.runtime || {}),
      settlement_telemetry: {
        due: source.settlement_telemetry?.due === true,
        pending: finite(source.settlement_telemetry?.pending),
        checked: finite(source.settlement_telemetry?.checked),
        settled: finite(source.settlement_telemetry?.settled),
      },
    },
  };
}

function publicAnalytics(analytics = {}) {
  const summary = analytics.summary || {};
  return {
    rangeDays: finite(analytics.rangeDays) || 30,
    summary: {
      total: finite(summary.total) || 0,
      pending: finite(summary.pending) || 0,
      win: finite(summary.win) || 0,
      loss: finite(summary.loss) || 0,
      push: finite(summary.push) || 0,
      void: finite(summary.void) || 0,
      settled: finite(summary.settled) || 0,
      stakeUnits: finite(summary.stakeUnits) || 0,
      netUnits: finite(summary.netUnits) || 0,
      roiPercent: finite(summary.roiPercent) || 0,
      accuracyPercent: finite(summary.accuracyPercent) || 0,
    },
    daily: Array.isArray(analytics.daily)
      ? analytics.daily.slice(-90).map(row => ({
          date: safeText(row.date, 20),
          signals: finite(row.signals) || 0,
          win: finite(row.win) || 0,
          loss: finite(row.loss) || 0,
          push: finite(row.push) || 0,
          pending: finite(row.pending) || 0,
          void: finite(row.void) || 0,
          netUnits: finite(row.netUnits) || 0,
          cumulativeUnits: finite(row.cumulativeUnits) || 0,
        }))
      : [],
    signals: Array.isArray(analytics.signals)
      ? analytics.signals.slice(0, 100).map(safeSignal)
      : [],
    generatedAt: analytics.generatedAt || new Date().toISOString(),
  };
}

export async function handlePublicV2Route(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v2/public/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'GET') return reply(request, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  await ensureV2Schema(env);

  if (url.pathname === '/v2/public/monitor') {
    const latest = await readLatestState(env);
    return reply(request, { ok: true, state: publicMonitorState(latest) });
  }

  if (url.pathname === '/v2/public/analytics') {
    const analytics = await readOwnerAnalytics(env, url.searchParams.get('days') || 30);
    return reply(request, { ok: true, analytics: publicAnalytics(analytics) });
  }

  return reply(request, { ok: false, error: 'NOT_FOUND' }, 404);
}
