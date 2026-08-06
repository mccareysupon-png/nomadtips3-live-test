const WEIGHTS = {
  attacks: 0.16,
  dangerous_attacks: 0.52,
  shots: 2,
  shots_on_target: 4,
  corners: 1.25
};

const STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS auto_momentum_state (
  fixture_id INTEGER PRIMARY KEY,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  last_sample_at INTEGER NOT NULL,
  last_minute INTEGER NOT NULL,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  stats_json TEXT NOT NULL,
  last_home_percent REAL,
  streak INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
)`;

const STATUS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS auto_scan_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ran_at INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  counts_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT,
  error TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
)`;

const PAPER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS paper_trades (
  fixture_id INTEGER PRIMARY KEY,
  trade_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  entry_minute INTEGER NOT NULL,
  entry_home_score INTEGER NOT NULL,
  entry_away_score INTEGER NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  score_state TEXT NOT NULL DEFAULT '',
  momentum REAL,
  home_win_odds REAL,
  ah_line REAL NOT NULL,
  ah_odds REAL NOT NULL,
  stake_units REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT NOT NULL DEFAULT 'PENDING',
  settlement TEXT NOT NULL DEFAULT 'PENDING',
  final_status TEXT,
  final_home_score INTEGER,
  final_away_score INTEGER,
  post_entry_home_goals INTEGER,
  post_entry_away_goals INTEGER,
  profit_units REAL NOT NULL DEFAULT 0,
  returned_units REAL,
  split_lines TEXT,
  settled_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(PAPER_TABLE_SQL),
    env.DB.prepare(STATE_TABLE_SQL),
    env.DB.prepare(STATUS_TABLE_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auto_state_updated ON auto_momentum_state(updated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auto_paper_status ON paper_trades(status)')
  ]);
  schemaReady = true;
}

function activity(currentStats, previousStats, side) {
  let weighted = 0;
  let evidence = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const current = numeric(currentStats?.[key]?.[side]);
    const previous = numeric(previousStats?.[key]?.[side]);
    const delta = previous === null || current === null ? 0 : Math.max(0, current - previous);
    weighted += delta * weight;
    if (['dangerous_attacks', 'shots', 'shots_on_target', 'corners'].includes(key)) {
      evidence += delta;
    }
  }
  weighted += Math.max(0, numeric(currentStats?.possession?.[side]) || 0) * 0.07;
  return { weighted, evidence };
}

function momentum(candidate, previous, now) {
  if (!previous) return null;
  const age = now - Number(previous.last_sample_at || 0);
  const minute = Number(candidate.minute);
  if (age <= 0 || age > 8 * 60_000 || minute < Number(previous.last_minute || 0)) return null;

  let previousStats = null;
  try { previousStats = JSON.parse(previous.stats_json || '{}'); } catch { previousStats = {}; }
  const home = activity(candidate.stats, previousStats, 'home');
  const away = activity(candidate.stats, previousStats, 'away');
  const total = home.weighted + away.weighted;
  let homePercent = total > 0 ? (home.weighted / total) * 100 : 50;
  const lastPercent = numeric(previous.last_home_percent);
  if (lastPercent !== null) homePercent = lastPercent * 0.55 + homePercent * 0.45;
  homePercent = Math.round(clamp(homePercent, 0, 100));
  return { home: homePercent, away: 100 - homePercent, evidence: home.evidence };
}

function scoreState(candidate) {
  const difference = Number(candidate?.score?.home || 0) - Number(candidate?.score?.away || 0);
  if (difference > 0) return `เจ้าบ้านนำ ${difference} ลูก`;
  if (difference < 0) return `เจ้าบ้านตาม ${Math.abs(difference)} ลูก`;
  return 'สกอร์เสมอ';
}

function stateStatement(env, candidate, calculated, streak, triggered, now) {
  return env.DB.prepare(`
    INSERT INTO auto_momentum_state (
      fixture_id, home, away, league, country, last_sample_at, last_minute,
      home_score, away_score, stats_json, last_home_percent, streak, triggered, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fixture_id) DO UPDATE SET
      home = excluded.home,
      away = excluded.away,
      league = excluded.league,
      country = excluded.country,
      last_sample_at = excluded.last_sample_at,
      last_minute = excluded.last_minute,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      stats_json = excluded.stats_json,
      last_home_percent = excluded.last_home_percent,
      streak = excluded.streak,
      triggered = excluded.triggered,
      updated_at = excluded.updated_at
  `).bind(
    Number(candidate.fixtureId), String(candidate.home || 'Home'), String(candidate.away || 'Away'),
    String(candidate.league || ''), String(candidate.country || ''), now, Number(candidate.minute),
    Number(candidate.score?.home || 0), Number(candidate.score?.away || 0),
    JSON.stringify(candidate.stats || {}), calculated?.home ?? null, streak, triggered ? 1 : 0, now
  );
}

function tradeStatement(env, candidate, calculated, now) {
  const ahLine = numeric(candidate?.markets?.homeAh);
  const ahOdds = numeric(candidate?.markets?.homeAhOdds);
  const homeWinOdds = numeric(candidate?.markets?.homeWin);
  if (ahLine === null || ahOdds === null || ahOdds <= 1) return null;
  return env.DB.prepare(`
    INSERT OR IGNORE INTO paper_trades (
      fixture_id, trade_id, created_at, entry_minute, entry_home_score, entry_away_score,
      home, away, league, country, score_state, momentum, home_win_odds, ah_line, ah_odds,
      stake_units, status, result, settlement, profit_units, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 'PENDING', 'PENDING', 'PENDING', 0, ?, ?)
  `).bind(
    Number(candidate.fixtureId), `P5-${candidate.fixtureId}`, now, Number(candidate.minute),
    Number(candidate.score?.home || 0), Number(candidate.score?.away || 0),
    String(candidate.home || 'Home'), String(candidate.away || 'Away'), String(candidate.league || ''),
    String(candidate.country || ''), scoreState(candidate), calculated?.home ?? null,
    homeWinOdds, ahLine, ahOdds,
    'Created automatically by Cloudflare Worker momentum scanner', now
  );
}

async function rowsByFixture(env, table, ids) {
  const map = new Map();
  for (let index = 0; index < ids.length; index += 50) {
    const group = ids.slice(index, index + 50);
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE fixture_id IN (${placeholders})`)
      .bind(...group)
      .all();
    for (const row of result.results || []) map.set(Number(row.fixture_id), row);
  }
  return map;
}

async function saveStatus(env, status) {
  await env.DB.prepare(`
    INSERT INTO auto_scan_status (id, ran_at, ok, counts_json, payload_json, error, warnings_json, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ran_at = excluded.ran_at,
      ok = excluded.ok,
      counts_json = excluded.counts_json,
      payload_json = excluded.payload_json,
      error = excluded.error,
      warnings_json = excluded.warnings_json,
      updated_at = excluded.updated_at
  `).bind(
    status.ranAt,
    status.ok ? 1 : 0,
    JSON.stringify(status.counts || {}),
    status.payload ? JSON.stringify(status.payload) : null,
    status.error || null,
    JSON.stringify(status.warnings || []),
    Date.now()
  ).run();
}

async function fetchBaseScan(baseWorker, env, ctx) {
  const request = new Request('https://internal.nomadtips3/live-condition-scan?source=scheduled', {
    method: 'GET'
  });
  const response = await baseWorker.fetch(request, env, ctx);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Live scan HTTP ${response.status}`);
  return payload;
}

export async function runAutoMomentumScan(baseWorker, env, ctx) {
  await ensureSchema(env);
  const now = Date.now();
  try {
    const payload = await fetchBaseScan(baseWorker, env, ctx);
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const ids = candidates.map(item => Number(item.fixtureId)).filter(Number.isInteger);
    const [states, existingTrades] = await Promise.all([
      rowsByFixture(env, 'auto_momentum_state', ids),
      rowsByFixture(env, 'paper_trades', ids)
    ]);

    const statements = [];
    let momentumReady = 0;
    let passing = 0;
    let triggered = 0;
    let newTrades = 0;

    for (const candidate of candidates) {
      const fixtureId = Number(candidate.fixtureId);
      const previous = states.get(fixtureId) || null;
      const calculated = momentum(candidate, previous, now);
      if (calculated) momentumReady += 1;
      const threshold = Number(candidate.minute) <= 74 ? 60 : 65;
      const pass = Boolean(calculated && calculated.home >= threshold && calculated.evidence >= 1);
      if (pass) passing += 1;
      const previousStreak = previous ? Number(previous.streak || 0) : 0;
      const streak = pass ? previousStreak + 1 : 0;
      let wasTriggered = Boolean(previous && Number(previous.triggered));
      const alreadyStored = existingTrades.has(fixtureId);
      if (alreadyStored) wasTriggered = true;

      if (!wasTriggered && streak >= 2) {
        const insert = tradeStatement(env, candidate, calculated, now);
        if (insert) {
          statements.push(insert);
          wasTriggered = true;
          newTrades += 1;
        }
      }
      if (wasTriggered) triggered += 1;
      statements.push(stateStatement(env, candidate, calculated, streak, wasTriggered, now));
    }

    for (let index = 0; index < statements.length; index += 80) {
      await env.DB.batch(statements.slice(index, index + 80));
    }
    await env.DB.prepare('DELETE FROM auto_momentum_state WHERE updated_at < ?')
      .bind(now - 6 * 60 * 60_000)
      .run();

    const counts = {
      ...(payload.counts || {}),
      serverCandidates: candidates.length,
      momentumReady,
      passing,
      triggered,
      newTrades
    };
    const serverPayload = {
      ...payload,
      generatedAt: new Date(now).toISOString(),
      mode: 'PAGE-5-WORKER-AUTO-MOMENTUM',
      serverOnline: true,
      counts
    };
    await saveStatus(env, {
      ranAt: now,
      ok: true,
      counts,
      payload: serverPayload,
      warnings: payload.warnings || []
    });
    return { ok: true, generatedAt: serverPayload.generatedAt, counts };
  } catch (error) {
    await saveStatus(env, {
      ranAt: now,
      ok: false,
      counts: {},
      error: error?.message || 'Automatic scan failed',
      warnings: []
    });
    throw error;
  }
}

export async function getLatestAutoPayload(env, maxAgeMs = 4 * 60_000) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM auto_scan_status WHERE id = 1').first();
  if (!row || !Number(row.ok) || !row.payload_json) return null;
  if (Date.now() - Number(row.ran_at || 0) > maxAgeMs) return null;
  try { return JSON.parse(row.payload_json); } catch { return null; }
}

export async function handleAutoRequest(request, env, url) {
  await ensureSchema(env);
  if (url.pathname !== '/auto-scan-status' || request.method !== 'GET') {
    return { status: 404, data: { ok: false, error: 'Auto scanner endpoint not found' } };
  }
  const row = await env.DB.prepare('SELECT * FROM auto_scan_status WHERE id = 1').first();
  const active = await env.DB.prepare(`
    SELECT fixture_id, home, away, last_minute, home_score, away_score,
           last_home_percent, streak, triggered, updated_at
    FROM auto_momentum_state
    WHERE updated_at >= ?
    ORDER BY triggered DESC, last_home_percent DESC
    LIMIT 100
  `).bind(Date.now() - 15 * 60_000).all();

  let counts = {};
  let warnings = [];
  try { counts = row?.counts_json ? JSON.parse(row.counts_json) : {}; } catch {}
  try { warnings = row?.warnings_json ? JSON.parse(row.warnings_json) : []; } catch {}
  return {
    status: 200,
    data: {
      ok: Boolean(row && Number(row.ok)),
      online: Boolean(row && Number(row.ok) && Date.now() - Number(row.ran_at || 0) <= 7 * 60_000),
      generatedAt: row?.ran_at ? new Date(Number(row.ran_at)).toISOString() : null,
      error: row?.error || null,
      counts,
      warnings,
      active: active.results || []
    }
  };
}
