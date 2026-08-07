import { sharedFixtureDetails } from './shared-api-football.js';

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const VOID_STATUSES = new Set(['CANC', 'ABD', 'AWD', 'WO', 'PST']);

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

let schemaReady = false;

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(RESULT_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_result_created ON member_prediction_results(member_id, created_at)')
  ]);
  schemaReady = true;
}

function fixtureSnapshot(item) {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  return {
    fixtureId: Number(fixture.id) || null,
    status: String(fixture?.status?.short || '').toUpperCase(),
    minute: numeric(fixture?.status?.elapsed),
    actualHome: teams?.home?.name || 'Home',
    actualAway: teams?.away?.name || 'Away',
    homeScore: numeric(goals?.home),
    awayScore: numeric(goals?.away)
  };
}

function inferMarket(row, signalPayload, statePayload) {
  const explicit = String(
    signalPayload?.selectedMarket || statePayload?.selectedMarket || statePayload?.market || ''
  ).toUpperCase();
  if (explicit === 'AH' || explicit === 'WIN') return explicit;
  const ahLine = numeric(signalPayload?.ahLine ?? statePayload?.markets?.homeAh);
  const ahOdds = numeric(signalPayload?.ahOdds ?? statePayload?.markets?.homeAhOdds);
  const selectedOdds = numeric(row?.selected_odds ?? signalPayload?.selectedOdds);
  if (ahLine !== null && ahOdds !== null && selectedOdds !== null && Math.abs(ahOdds - selectedOdds) < 0.0001) return 'AH';
  return 'WIN';
}

function evaluateHalf(margin, line) {
  const adjusted = margin + line;
  if (adjusted > 0.000001) return 'WIN';
  if (adjusted < -0.000001) return 'LOSS';
  return 'PUSH';
}

function settleAsian(margin, rawLine) {
  const line = numeric(rawLine);
  if (line === null) return 'VOID';
  const quarter = Math.round(line * 4) / 4;
  if (Math.abs(quarter - line) < 0.0001 && Math.abs(Math.round(quarter * 4)) % 2 === 1) {
    const lower = Math.floor(quarter * 2) / 2;
    const upper = lower + 0.5;
    const first = evaluateHalf(margin, lower);
    const second = evaluateHalf(margin, upper);
    if (first === second) return first;
    const pair = new Set([first, second]);
    if (pair.has('WIN') && pair.has('PUSH')) return 'HALF-WIN';
    if (pair.has('LOSS') && pair.has('PUSH')) return 'HALF-LOSS';
    return 'PUSH';
  }
  return evaluateHalf(margin, line);
}

function settlementOutcome(row, snapshot, signalPayload, statePayload) {
  if (VOID_STATUSES.has(snapshot.status)) return 'VOID';
  if (!TERMINAL_STATUSES.has(snapshot.status)) return 'PENDING';
  if (snapshot.homeScore === null || snapshot.awayScore === null) return 'PENDING';
  const selectedSide = String(row?.selected_side || signalPayload?.selectedSide || 'HOME').toUpperCase();
  const selectedScore = selectedSide === 'AWAY' ? snapshot.awayScore : snapshot.homeScore;
  const opponentScore = selectedSide === 'AWAY' ? snapshot.homeScore : snapshot.awayScore;
  const market = inferMarket(row, signalPayload, statePayload);
  if (market === 'AH') {
    const line = numeric(signalPayload?.ahLine ?? statePayload?.markets?.homeAh);
    return settleAsian(selectedScore - opponentScore, line);
  }
  return selectedScore > opponentScore ? 'WIN' : 'LOSS';
}

function resultPayload(row, signalPayload, statePayload, market) {
  return {
    type: 'LIVE_SIGNAL',
    signalKey: String(row.signal_key),
    selectedSide: String(row.selected_side || signalPayload?.selectedSide || 'HOME'),
    selectedTeam: String(row.selected_team || signalPayload?.selectedTeam || ''),
    opponent: String(row.opponent || signalPayload?.opponent || ''),
    minute: Number(row.minute || signalPayload?.minute || 0),
    momentum: numeric(row.momentum ?? signalPayload?.momentum),
    selectedOdds: numeric(row.selected_odds ?? signalPayload?.selectedOdds),
    selectedMarket: market,
    ahLine: numeric(signalPayload?.ahLine ?? statePayload?.markets?.homeAh),
    signalScore: signalPayload?.score || null,
    feed: 'SHARED_LIVE_FEED'
  };
}

async function loadUnsettledSignals(env, activeMemberIds) {
  const active = new Set((activeMemberIds || []).map(String));
  const rows = await env.DB.prepare(`
    SELECT
      s.member_id, s.signal_key, s.fixture_id, s.selected_side, s.selected_team, s.opponent,
      s.minute, s.momentum, s.selected_odds, s.payload_json AS signal_payload_json, s.created_at,
      st.payload_json AS state_payload_json,
      r.result_key, r.outcome
    FROM member_live_signals s
    LEFT JOIN member_live_state st
      ON st.member_id = s.member_id AND st.state_key = s.signal_key
    LEFT JOIN member_prediction_results r
      ON r.member_id = s.member_id AND r.result_key = ('LIVE:' || s.signal_key)
    WHERE r.result_key IS NULL OR UPPER(COALESCE(r.outcome, 'PENDING')) = 'PENDING'
    ORDER BY s.created_at ASC
    LIMIT 2000
  `).all();
  return (rows.results || []).filter(row => active.has(String(row.member_id)));
}

function liveItemMap(liveItems) {
  const map = new Map();
  for (const item of Array.isArray(liveItems) ? liveItems : []) {
    const id = Number(item?.fixture?.id);
    if (Number.isInteger(id)) map.set(id, item);
  }
  return map;
}

async function insertPendingResults(env, rows) {
  const statements = [];
  for (const row of rows) {
    const signalPayload = parseJson(row.signal_payload_json, {});
    const statePayload = parseJson(row.state_payload_json, {});
    const market = inferMarket(row, signalPayload, statePayload);
    const payload = resultPayload(row, signalPayload, statePayload, market);
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO member_prediction_results (
        member_id, result_key, source_type, fixture_id, market, pick, odds,
        outcome, payload_json, created_at, settled_at
      ) VALUES (?, ?, 'LIVE_SIGNAL', ?, ?, ?, ?, 'PENDING', ?, ?, NULL)
    `).bind(
      String(row.member_id),
      `LIVE:${String(row.signal_key)}`,
      Number(row.fixture_id),
      market === 'AH' ? 'AH' : '1X2',
      String(row.selected_team || ''),
      numeric(row.selected_odds),
      JSON.stringify(payload),
      Number(row.created_at || Date.now())
    ));
  }
  for (let index = 0; index < statements.length; index += 80) {
    await env.DB.batch(statements.slice(index, index + 80));
  }
}

function refreshedStatePayload(row, snapshot, signalPayload, statePayload) {
  const selectedSide = String(row.selected_side || signalPayload?.selectedSide || 'HOME').toUpperCase();
  return {
    ...statePayload,
    actualHome: snapshot.actualHome,
    actualAway: snapshot.actualAway,
    actualScore: { home: snapshot.homeScore, away: snapshot.awayScore },
    selectedMarket: inferMarket(row, signalPayload, statePayload),
    status: snapshot.status,
    feed: 'SHARED_LIVE_FEED'
  };
}

async function refreshOrSettle(env, rows, fixtures, now) {
  const statements = [];
  let settled = 0;
  let refreshed = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;

  for (const row of rows) {
    const item = fixtures.get(Number(row.fixture_id));
    if (!item) continue;
    const snapshot = fixtureSnapshot(item);
    const signalPayload = parseJson(row.signal_payload_json, {});
    const statePayload = parseJson(row.state_payload_json, {});
    const outcome = settlementOutcome(row, snapshot, signalPayload, statePayload);
    const market = inferMarket(row, signalPayload, statePayload);
    const payload = {
      ...resultPayload(row, signalPayload, statePayload, market),
      finalStatus: snapshot.status,
      finalScore: { home: snapshot.homeScore, away: snapshot.awayScore },
      actualHome: snapshot.actualHome,
      actualAway: snapshot.actualAway,
      settledAt: outcome === 'PENDING' ? null : now
    };

    if (outcome !== 'PENDING') {
      statements.push(env.DB.prepare(`
        UPDATE member_prediction_results
        SET market = ?, pick = ?, odds = ?, outcome = ?, payload_json = ?, settled_at = ?
        WHERE member_id = ? AND result_key = ?
      `).bind(
        market === 'AH' ? 'AH' : '1X2',
        String(row.selected_team || ''),
        numeric(row.selected_odds),
        outcome,
        JSON.stringify(payload),
        now,
        String(row.member_id),
        `LIVE:${String(row.signal_key)}`
      ));
      statements.push(env.DB.prepare(
        'DELETE FROM member_live_state WHERE member_id = ? AND state_key = ?'
      ).bind(String(row.member_id), String(row.signal_key)));
      settled += 1;
      if (outcome === 'WIN' || outcome === 'HALF-WIN') wins += 1;
      else if (outcome === 'LOSS' || outcome === 'HALF-LOSS') losses += 1;
      else pushes += 1;
      continue;
    }

    if (LIVE_STATUSES.has(snapshot.status)) {
      const selectedSide = String(row.selected_side || signalPayload?.selectedSide || 'HOME').toUpperCase();
      const selectedScore = selectedSide === 'AWAY' ? snapshot.awayScore : snapshot.homeScore;
      const opponentScore = selectedSide === 'AWAY' ? snapshot.homeScore : snapshot.awayScore;
      const nextPayload = refreshedStatePayload(row, snapshot, signalPayload, statePayload);
      statements.push(env.DB.prepare(`
        UPDATE member_live_state
        SET minute = ?, selected_score = ?, opponent_score = ?, payload_json = ?, updated_at = ?
        WHERE member_id = ? AND state_key = ? AND triggered = 1
      `).bind(
        Number(snapshot.minute || row.minute || 0),
        Number(selectedScore ?? 0),
        Number(opponentScore ?? 0),
        JSON.stringify(nextPayload),
        now,
        String(row.member_id),
        String(row.signal_key)
      ));
      refreshed += 1;
    }
  }

  for (let index = 0; index < statements.length; index += 80) {
    await env.DB.batch(statements.slice(index, index + 80));
  }
  return { settled, refreshed, wins, losses, pushes };
}

export async function settleMemberLiveSignals(env, activeMemberIds, liveItems = []) {
  await ensureSchema(env);
  const rows = await loadUnsettledSignals(env, activeMemberIds);
  if (!rows.length) {
    return { ok: true, pending: 0, settled: 0, refreshed: 0, upstreamRequests: 0, cacheHits: 0 };
  }

  await insertPendingResults(env, rows);

  const fixtures = liveItemMap(liveItems);
  const missingIds = [...new Set(rows
    .map(row => Number(row.fixture_id))
    .filter(Number.isInteger)
    .filter(id => !fixtures.has(id)))];

  let upstreamRequests = 0;
  let cacheHits = 0;
  if (missingIds.length) {
    const details = await sharedFixtureDetails(missingIds, env);
    upstreamRequests = Number(details.upstreamRequests || 0);
    cacheHits = Number(details.cacheHits || 0);
    for (const [fixtureId, item] of details.items.entries()) fixtures.set(Number(fixtureId), item);
  }

  const result = await refreshOrSettle(env, rows, fixtures, Date.now());
  return {
    ok: true,
    pending: rows.length - result.settled,
    ...result,
    upstreamRequests,
    cacheHits,
    requestedFinalFixtures: missingIds.length
  };
}
