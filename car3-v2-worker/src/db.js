import { apiUsage, thaiCycleStart } from './api.js';

export const SIGNAL_LIMIT = 10;
const DAY_MS = 86_400_000;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS car3_v2_runtime (id INTEGER PRIMARY KEY CHECK(id=1), lock_until INTEGER NOT NULL DEFAULT 0, last_started_at INTEGER, last_finished_at INTEGER, last_ok INTEGER NOT NULL DEFAULT 1, last_error TEXT, snapshot_json TEXT, updated_at INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO car3_v2_runtime (id, lock_until, updated_at) VALUES (1,0,0)`,
  `CREATE TABLE IF NOT EXISTS car3_v2_state (state_key TEXT PRIMARY KEY, fixture_id INTEGER NOT NULL, selected_side TEXT NOT NULL, stats_json TEXT NOT NULL, last_percent REAL, streak INTEGER NOT NULL DEFAULT 0, triggered INTEGER NOT NULL DEFAULT 0, last_minute INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS car3_v2_signals (signal_key TEXT PRIMARY KEY, fixture_id INTEGER NOT NULL, selected_side TEXT NOT NULL, selected_market TEXT NOT NULL, selected_team TEXT NOT NULL, opponent TEXT NOT NULL, actual_home TEXT NOT NULL, actual_away TEXT NOT NULL, league TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, entry_minute INTEGER NOT NULL, entry_selected_score INTEGER NOT NULL, entry_opponent_score INTEGER NOT NULL, entry_actual_home_score INTEGER NOT NULL, entry_actual_away_score INTEGER NOT NULL, momentum REAL, selected_odds REAL, ah_line REAL, ah_odds REAL, status TEXT NOT NULL DEFAULT 'PENDING', result TEXT NOT NULL DEFAULT 'PENDING', final_status TEXT, final_selected_score INTEGER, final_opponent_score INTEGER, final_actual_home_score INTEGER, final_actual_away_score INTEGER, settled_at INTEGER, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_car3_v2_signals_created ON car3_v2_signals(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_car3_v2_signals_status ON car3_v2_signals(status)`,
  `CREATE TABLE IF NOT EXISTS car3_v2_api_usage (cycle_start INTEGER NOT NULL, endpoint TEXT NOT NULL, upstream_calls INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(cycle_start, endpoint))`
];
let ready = false;

export async function ensureSchema(env) {
  if (ready) return;
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  ready = true;
}

export async function activeConfig(env) {
  const row = await env.DB.prepare('SELECT active_json, activated_at FROM condition_config WHERE id=1').first().catch(() => null);
  let stored = {};
  try { stored = JSON.parse(row?.active_json || '{}'); } catch {}
  const side = String(stored.side || 'HOME').toUpperCase();
  return {
    side: ['HOME','AWAY','BOTH'].includes(side) ? side : 'HOME',
    minuteMin: Math.max(1, Number(stored.minuteMin || 60)),
    minuteMax: Math.min(120, Number(stored.minuteMax || 80)),
    market: String(stored.market || 'WIN').toUpperCase() === 'AH' ? 'AH' : 'WIN',
    oddsMin: Number(stored.oddsMin || 1.70),
    oddsMax: stored.oddsMax === null || stored.oddsMax === undefined || stored.oddsMax === '' ? null : Number(stored.oddsMax),
    ahMin: Number(stored.ahMin ?? 0.25),
    ahMax: stored.ahMax === null || stored.ahMax === undefined || stored.ahMax === '' ? null : Number(stored.ahMax),
    momentumMin: Math.max(1, Number(stored.momentumMin || 60)),
    attackEvidenceEnabled: stored.attackEvidenceEnabled !== false,
    goalGapLimited: Boolean(stored.goalGapLimited),
    maxGoalGap: Number(stored.maxGoalGap || 1),
    confirmationRounds: Math.max(1, Number(stored.confirmationRounds || 2)),
    signalLimit: SIGNAL_LIMIT,
    resetHour: 12,
    timezone: 'Asia/Bangkok',
    version: Number(row?.activated_at || 0)
  };
}

export async function claimLock(env, now = Date.now()) {
  const result = await env.DB.prepare(`UPDATE car3_v2_runtime SET lock_until=?, last_started_at=?, updated_at=? WHERE id=1 AND lock_until<=?`)
    .bind(now + 55_000, now, now, now).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function releaseLock(env, ok, snapshot = null, error = null) {
  const now = Date.now();
  await env.DB.prepare(`UPDATE car3_v2_runtime SET lock_until=0,last_finished_at=?,last_ok=?,last_error=?,snapshot_json=COALESCE(?,snapshot_json),updated_at=? WHERE id=1`)
    .bind(now, ok ? 1 : 0, error, snapshot ? JSON.stringify(snapshot) : null, now).run();
}

export async function cycleCount(env, now = Date.now()) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM car3_v2_signals WHERE created_at>=?').bind(thaiCycleStart(now)).first();
  return Number(row?.total || 0);
}

export async function pendingSignals(env) {
  const rows = await env.DB.prepare(`SELECT * FROM car3_v2_signals WHERE status='PENDING' ORDER BY created_at ASC LIMIT 200`).all();
  return rows.results || [];
}

export async function statesFor(env, keys) {
  const map = new Map();
  for (let i=0; i<keys.length; i+=50) {
    const group = keys.slice(i,i+50);
    if (!group.length) continue;
    const placeholders = group.map(()=>'?').join(',');
    const rows = await env.DB.prepare(`SELECT * FROM car3_v2_state WHERE state_key IN (${placeholders})`).bind(...group).all();
    for (const row of rows.results || []) map.set(row.state_key,row);
  }
  return map;
}

export async function existingSignals(env, keys) {
  const set = new Set();
  for (let i=0; i<keys.length; i+=50) {
    const group = keys.slice(i,i+50);
    if (!group.length) continue;
    const placeholders = group.map(()=>'?').join(',');
    const rows = await env.DB.prepare(`SELECT signal_key FROM car3_v2_signals WHERE signal_key IN (${placeholders})`).bind(...group).all();
    for (const row of rows.results || []) set.add(row.signal_key);
  }
  return set;
}

export async function saveState(env, item) {
  await env.DB.prepare(`INSERT INTO car3_v2_state (state_key,fixture_id,selected_side,stats_json,last_percent,streak,triggered,last_minute,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(state_key) DO UPDATE SET stats_json=excluded.stats_json,last_percent=excluded.last_percent,streak=excluded.streak,triggered=excluded.triggered,last_minute=excluded.last_minute,updated_at=excluded.updated_at`)
    .bind(item.key,item.fixtureId,item.side,JSON.stringify(item.stats),item.percent,item.streak,item.triggered?1:0,item.minute,Date.now()).run();
}

export async function insertSignal(env, s) {
  const now = Date.now();
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO car3_v2_signals (signal_key,fixture_id,selected_side,selected_market,selected_team,opponent,actual_home,actual_away,league,country,created_at,entry_minute,entry_selected_score,entry_opponent_score,entry_actual_home_score,entry_actual_away_score,momentum,selected_odds,ah_line,ah_odds,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(s.key,s.fixtureId,s.side,s.market,s.selectedTeam,s.opponent,s.actualHome,s.actualAway,s.league,s.country,now,s.minute,s.selectedScore,s.opponentScore,s.actualHomeScore,s.actualAwayScore,s.momentum,s.selectedOdds,s.ahLine,s.ahOdds,now).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function settleSignal(env, row, fixture, result, isVoid=false) {
  const now = Date.now();
  if (isVoid) {
    await env.DB.prepare(`UPDATE car3_v2_signals SET status='VOID',result='NEUTRAL',final_status=?,settled_at=?,updated_at=? WHERE signal_key=? AND status='PENDING'`)
      .bind(fixture.status,now,now,row.signal_key).run();
    return;
  }
  const away = String(row.selected_side)==='AWAY';
  const selectedFinal = away ? fixture.away : fixture.home;
  const opponentFinal = away ? fixture.home : fixture.away;
  await env.DB.prepare(`UPDATE car3_v2_signals SET status='SETTLED',result=?,final_status=?,final_selected_score=?,final_opponent_score=?,final_actual_home_score=?,final_actual_away_score=?,settled_at=?,updated_at=? WHERE signal_key=? AND status='PENDING'`)
    .bind(result,fixture.status,selectedFinal,opponentFinal,fixture.home,fixture.away,now,now,row.signal_key).run();
}

export async function cleanupStates(env) {
  await env.DB.prepare('DELETE FROM car3_v2_state WHERE updated_at<?').bind(Date.now()-6*60*60_000).run();
}

export async function statusPayload(env) {
  const runtime = await env.DB.prepare('SELECT * FROM car3_v2_runtime WHERE id=1').first();
  const config = await activeConfig(env);
  const start = thaiCycleStart();
  const rows = await env.DB.prepare(`SELECT * FROM car3_v2_signals WHERE created_at>=? ORDER BY created_at DESC LIMIT 20`).bind(start).all();
  const signals = rows.results || [];
  let snapshot = null;
  try { snapshot = runtime?.snapshot_json ? JSON.parse(runtime.snapshot_json) : null; } catch {}
  return {
    ok: Boolean(runtime?.last_ok ?? 1), version:'CAR3-V2-COLLECTOR-1', generatedAt:new Date().toISOString(), config,
    cycle:{count:signals.length,limit:SIGNAL_LIMIT,remaining:Math.max(0,SIGNAL_LIMIT-signals.length),cycleStartAt:new Date(start).toISOString(),nextResetAt:new Date(start+DAY_MS).toISOString(),timezone:'Asia/Bangkok',resetHour:12},
    runtime:{lastStartedAt:runtime?.last_started_at?new Date(Number(runtime.last_started_at)).toISOString():null,lastFinishedAt:runtime?.last_finished_at?new Date(Number(runtime.last_finished_at)).toISOString():null,lastError:runtime?.last_error||null,locked:Number(runtime?.lock_until||0)>Date.now()},
    usage:await apiUsage(env), snapshot, signals
  };
}
