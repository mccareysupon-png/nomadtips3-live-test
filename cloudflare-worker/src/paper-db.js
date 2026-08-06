const API_BASE = 'https://v3.football.api-sports.io';
const TERMINAL = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'PST']);
const VOID_STATUS = new Set(['CANC', 'ABD', 'PST', 'WO', 'AWD']);
const STAKE_DEFAULT = 100;

const CREATE_TABLE_SQL = `
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
const CREATE_STATUS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status)`;
const CREATE_CREATED_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_paper_trades_created_at ON paper_trades(created_at DESC)`;

let schemaReady = false;

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function ensureDatabase(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(CREATE_TABLE_SQL),
    env.DB.prepare(CREATE_STATUS_INDEX_SQL),
    env.DB.prepare(CREATE_CREATED_INDEX_SQL)
  ]);
  schemaReady = true;
}

function validateTrade(input) {
  const trade = input && typeof input === 'object' ? input : {};
  const fixtureId = integer(trade.fixtureId);
  const entryMinute = integer(trade.entryMinute);
  const entryHomeScore = integer(trade.entryHomeScore);
  const entryAwayScore = integer(trade.entryAwayScore);
  const ahLine = number(trade.ahLine);
  const ahOdds = number(trade.ahOdds);
  const stakeUnits = number(trade.stakeUnits) ?? STAKE_DEFAULT;
  const createdAt = integer(trade.createdAt) ?? Date.now();

  if (!fixtureId || fixtureId <= 0) throw new Error('Invalid fixtureId');
  if (entryMinute === null || entryMinute < 0 || entryMinute > 130) throw new Error('Invalid entryMinute');
  if (entryHomeScore === null || entryHomeScore < 0 || entryAwayScore === null || entryAwayScore < 0) {
    throw new Error('Invalid entry score');
  }
  if (ahLine === null || ahLine < -10 || ahLine > 10) throw new Error('Invalid AH line');
  if (ahOdds === null || ahOdds <= 1 || ahOdds > 100) throw new Error('Invalid AH odds');
  if (stakeUnits <= 0 || stakeUnits > 100000) throw new Error('Invalid stake units');

  const status = String(trade.status || 'PENDING').toUpperCase();
  const result = String(trade.result || 'PENDING').toUpperCase();
  const settlement = String(trade.settlement || 'PENDING').toUpperCase();

  return {
    fixtureId,
    id: String(trade.id || `P5-${fixtureId}`).slice(0, 100),
    createdAt,
    entryMinute,
    entryHomeScore,
    entryAwayScore,
    home: String(trade.home || 'Home').slice(0, 200),
    away: String(trade.away || 'Away').slice(0, 200),
    league: String(trade.league || '').slice(0, 200),
    country: String(trade.country || '').slice(0, 100),
    scoreState: String(trade.scoreState || '').slice(0, 100),
    momentum: number(trade.momentum),
    homeWinOdds: number(trade.homeWinOdds),
    ahLine,
    ahOdds,
    stakeUnits,
    status,
    result,
    settlement,
    finalStatus: trade.finalStatus ? String(trade.finalStatus).slice(0, 20) : null,
    finalHomeScore: integer(trade.finalHomeScore),
    finalAwayScore: integer(trade.finalAwayScore),
    postEntryHomeGoals: integer(trade.postEntryHomeGoals),
    postEntryAwayGoals: integer(trade.postEntryAwayGoals),
    profitUnits: number(trade.profitUnits) ?? 0,
    returnedUnits: number(trade.returnedUnits),
    splitLines: Array.isArray(trade.splitLines) ? trade.splitLines : null,
    settledAt: integer(trade.settledAt),
    note: String(trade.note || '').slice(0, 500)
  };
}

function insertStatement(env, trade) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO paper_trades (
      fixture_id, trade_id, created_at, entry_minute, entry_home_score, entry_away_score,
      home, away, league, country, score_state, momentum, home_win_odds, ah_line, ah_odds,
      stake_units, status, result, settlement, final_status, final_home_score, final_away_score,
      post_entry_home_goals, post_entry_away_goals, profit_units, returned_units, split_lines,
      settled_at, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    trade.fixtureId, trade.id, trade.createdAt, trade.entryMinute, trade.entryHomeScore,
    trade.entryAwayScore, trade.home, trade.away, trade.league, trade.country,
    trade.scoreState, trade.momentum, trade.homeWinOdds, trade.ahLine, trade.ahOdds,
    trade.stakeUnits, trade.status, trade.result, trade.settlement, trade.finalStatus,
    trade.finalHomeScore, trade.finalAwayScore, trade.postEntryHomeGoals,
    trade.postEntryAwayGoals, trade.profitUnits, trade.returnedUnits,
    trade.splitLines ? JSON.stringify(trade.splitLines) : null, trade.settledAt,
    trade.note, Date.now()
  );
}

function settlementImportStatement(env, trade) {
  return env.DB.prepare(`
    UPDATE paper_trades SET
      status = ?, result = ?, settlement = ?, final_status = ?, final_home_score = ?,
      final_away_score = ?, post_entry_home_goals = ?, post_entry_away_goals = ?,
      profit_units = ?, returned_units = ?, split_lines = ?, settled_at = ?, note = ?, updated_at = ?
    WHERE fixture_id = ? AND status = 'PENDING' AND ? <> 'PENDING'
  `).bind(
    trade.status, trade.result, trade.settlement, trade.finalStatus, trade.finalHomeScore,
    trade.finalAwayScore, trade.postEntryHomeGoals, trade.postEntryAwayGoals,
    trade.profitUnits, trade.returnedUnits,
    trade.splitLines ? JSON.stringify(trade.splitLines) : null, trade.settledAt,
    trade.note, Date.now(), trade.fixtureId, trade.status
  );
}

async function upsertTrades(env, rawTrades) {
  await ensureDatabase(env);
  const unique = new Map();
  for (const raw of Array.isArray(rawTrades) ? rawTrades.slice(0, 5000) : []) {
    const trade = validateTrade(raw);
    if (!unique.has(trade.fixtureId)) unique.set(trade.fixtureId, trade);
  }
  if (!unique.size) return { received: 0, stored: 0 };

  const statements = [];
  for (const trade of unique.values()) {
    statements.push(insertStatement(env, trade));
    statements.push(settlementImportStatement(env, trade));
  }
  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
  return { received: unique.size, stored: unique.size };
}

function rowToTrade(row) {
  let splitLines = null;
  try { splitLines = row.split_lines ? JSON.parse(row.split_lines) : null; } catch {}
  return {
    id: row.trade_id,
    fixtureId: row.fixture_id,
    createdAt: row.created_at,
    entryMinute: row.entry_minute,
    entryHomeScore: row.entry_home_score,
    entryAwayScore: row.entry_away_score,
    home: row.home,
    away: row.away,
    league: row.league,
    country: row.country,
    scoreState: row.score_state,
    momentum: row.momentum,
    homeWinOdds: row.home_win_odds,
    ahLine: row.ah_line,
    ahOdds: row.ah_odds,
    stakeUnits: row.stake_units,
    status: row.status,
    result: row.result,
    settlement: row.settlement,
    finalStatus: row.final_status,
    finalHomeScore: row.final_home_score,
    finalAwayScore: row.final_away_score,
    postEntryHomeGoals: row.post_entry_home_goals,
    postEntryAwayGoals: row.post_entry_away_goals,
    profitUnits: row.profit_units,
    returnedUnits: row.returned_units,
    splitLines,
    settledAt: row.settled_at,
    note: row.note,
    updatedAt: row.updated_at
  };
}

function summarize(trades) {
  const pending = trades.filter(trade => trade.status === 'PENDING').length;
  const decided = trades.filter(trade => ['SETTLED', 'VOID'].includes(trade.status));
  const correct = decided.filter(trade => trade.result === 'CORRECT').length;
  const incorrect = decided.filter(trade => trade.result === 'INCORRECT').length;
  const netUnits = round2(decided.reduce((sum, trade) => sum + (number(trade.profitUnits) || 0), 0));
  const investedUnits = round2(trades.reduce((sum, trade) => sum + (number(trade.stakeUnits) || STAKE_DEFAULT), 0));
  const settledStake = decided.reduce((sum, trade) => sum + (number(trade.stakeUnits) || STAKE_DEFAULT), 0);
  const returnedUnits = round2(decided.reduce((sum, trade) => sum + (number(trade.returnedUnits) || 0), 0));
  return {
    total: trades.length,
    pending,
    settled: decided.length,
    correct,
    incorrect,
    investedUnits,
    returnedUnits,
    netUnits,
    roiPercent: settledStake ? round2(netUnits / settledStake * 100) : 0,
    accuracyPercent: correct + incorrect ? round2(correct / (correct + incorrect) * 100) : 0
  };
}

async function listTrades(env, limit = 5000) {
  await ensureDatabase(env);
  const safeLimit = Math.max(1, Math.min(10000, integer(limit) || 5000));
  const query = await env.DB.prepare(`SELECT * FROM paper_trades ORDER BY created_at DESC LIMIT ?`)
    .bind(safeLimit)
    .all();
  const trades = (query.results || []).map(rowToTrade);
  return { trades, summary: summarize(trades) };
}

async function apiFetch(path, env) {
  if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is not configured');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': env.API_FOOTBALL_KEY, 'Accept': 'application/json' }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `API HTTP ${response.status}`);
  if (payload?.errors && Object.keys(payload.errors).length) {
    throw new Error(typeof payload.errors === 'string' ? payload.errors : JSON.stringify(payload.errors));
  }
  return payload;
}

function splitHandicap(line) {
  const rounded = Math.round(Number(line) * 4) / 4;
  const quarterIndex = Math.round(Math.abs(rounded) * 4);
  if (quarterIndex % 2 === 1) {
    const lower = Math.floor(rounded * 2) / 2;
    return [lower, lower + 0.5];
  }
  return [rounded];
}

function settleAsian(postGoalDifference, line, odds, stake) {
  const parts = splitHandicap(line);
  const stakePart = stake / parts.length;
  const outcomes = [];
  let profit = 0;
  for (const part of parts) {
    const adjusted = postGoalDifference + part;
    if (adjusted > 0.00001) {
      outcomes.push('WIN');
      profit += stakePart * (odds - 1);
    } else if (adjusted < -0.00001) {
      outcomes.push('LOSS');
      profit -= stakePart;
    } else {
      outcomes.push('PUSH');
    }
  }
  let settlement = 'PUSH';
  if (outcomes.every(value => value === 'WIN')) settlement = 'FULL WIN';
  else if (outcomes.every(value => value === 'LOSS')) settlement = 'FULL LOSS';
  else if (outcomes.includes('WIN') && outcomes.includes('PUSH')) settlement = 'HALF WIN';
  else if (outcomes.includes('LOSS') && outcomes.includes('PUSH')) settlement = 'HALF LOSS';
  else if (outcomes.every(value => value === 'PUSH')) settlement = 'PUSH';
  else settlement = 'SPLIT';
  return {
    settlement,
    result: settlement.includes('WIN') ? 'CORRECT' : settlement.includes('LOSS') ? 'INCORRECT' : 'NEUTRAL',
    profitUnits: round2(profit),
    returnedUnits: round2(stake + profit),
    splitLines: parts
  };
}

function normalizeFixture(item) {
  const fixture = item?.fixture || {};
  const goals = item?.goals || {};
  const score = item?.score || {};
  return {
    fixtureId: integer(fixture.id),
    status: String(fixture?.status?.short || '').toUpperCase(),
    homeScore: integer(goals.home),
    awayScore: integer(goals.away),
    fulltimeHome: integer(score?.fulltime?.home),
    fulltimeAway: integer(score?.fulltime?.away)
  };
}

function finalScore(result) {
  if (['AET', 'PEN'].includes(result.status) && result.fulltimeHome !== null && result.fulltimeAway !== null) {
    return { home: result.fulltimeHome, away: result.fulltimeAway };
  }
  return { home: result.homeScore, away: result.awayScore };
}

function settlementForTrade(trade, fixture) {
  if (!TERMINAL.has(fixture.status)) return null;
  if (VOID_STATUS.has(fixture.status)) {
    return {
      status: 'VOID', result: 'NEUTRAL', settlement: 'VOID', finalStatus: fixture.status,
      finalHomeScore: null, finalAwayScore: null, postEntryHomeGoals: null,
      postEntryAwayGoals: null, profitUnits: 0, returnedUnits: trade.stakeUnits,
      splitLines: null, settledAt: Date.now(), note: `Void by fixture status ${fixture.status}`
    };
  }
  const score = finalScore(fixture);
  if (score.home === null || score.away === null) return null;
  if (score.home < trade.entryHomeScore || score.away < trade.entryAwayScore) {
    return {
      status: 'VOID', result: 'NEUTRAL', settlement: 'VOID', finalStatus: fixture.status,
      finalHomeScore: score.home, finalAwayScore: score.away, postEntryHomeGoals: null,
      postEntryAwayGoals: null, profitUnits: 0, returnedUnits: trade.stakeUnits,
      splitLines: null, settledAt: Date.now(), note: 'Void because final score was lower than entry score'
    };
  }
  const postHome = score.home - trade.entryHomeScore;
  const postAway = score.away - trade.entryAwayScore;
  const settled = settleAsian(postHome - postAway, trade.ahLine, trade.ahOdds, trade.stakeUnits);
  return {
    status: 'SETTLED', result: settled.result, settlement: settled.settlement,
    finalStatus: fixture.status, finalHomeScore: score.home, finalAwayScore: score.away,
    postEntryHomeGoals: postHome, postEntryAwayGoals: postAway,
    profitUnits: settled.profitUnits, returnedUnits: settled.returnedUnits,
    splitLines: settled.splitLines, settledAt: Date.now(), note: 'Settled automatically by Cloudflare Worker'
  };
}

function updateSettlementStatement(env, fixtureId, settled) {
  return env.DB.prepare(`
    UPDATE paper_trades SET
      status = ?, result = ?, settlement = ?, final_status = ?, final_home_score = ?,
      final_away_score = ?, post_entry_home_goals = ?, post_entry_away_goals = ?,
      profit_units = ?, returned_units = ?, split_lines = ?, settled_at = ?, note = ?, updated_at = ?
    WHERE fixture_id = ? AND status = 'PENDING'
  `).bind(
    settled.status, settled.result, settled.settlement, settled.finalStatus,
    settled.finalHomeScore, settled.finalAwayScore, settled.postEntryHomeGoals,
    settled.postEntryAwayGoals, settled.profitUnits, settled.returnedUnits,
    settled.splitLines ? JSON.stringify(settled.splitLines) : null,
    settled.settledAt, settled.note, Date.now(), fixtureId
  );
}

export async function settlePendingTrades(env) {
  await ensureDatabase(env);
  const pendingQuery = await env.DB.prepare(`SELECT * FROM paper_trades WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 500`).all();
  const pending = (pendingQuery.results || []).map(rowToTrade);
  if (!pending.length) return { pending: 0, settled: 0, checked: 0, warnings: [] };

  const fixtureMap = new Map();
  const warnings = [];
  const ids = pending.map(trade => trade.fixtureId);
  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    try {
      const payload = await apiFetch(`/fixtures?ids=${group.join('-')}`, env);
      for (const item of Array.isArray(payload?.response) ? payload.response : []) {
        const fixture = normalizeFixture(item);
        if (fixture.fixtureId) fixtureMap.set(fixture.fixtureId, fixture);
      }
    } catch (error) {
      warnings.push(error?.message || 'Fixture result request failed');
    }
  }

  const updates = [];
  for (const trade of pending) {
    const fixture = fixtureMap.get(trade.fixtureId);
    if (!fixture) continue;
    const settled = settlementForTrade(trade, fixture);
    if (settled) updates.push(updateSettlementStatement(env, trade.fixtureId, settled));
  }
  for (let index = 0; index < updates.length; index += 100) {
    await env.DB.batch(updates.slice(index, index + 100));
  }
  return { pending: pending.length, settled: updates.length, checked: fixtureMap.size, warnings: warnings.slice(0, 20) };
}

export async function handlePaperRequest(request, env, url) {
  await ensureDatabase(env);
  if (url.pathname === '/paper-health' && request.method === 'GET') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM paper_trades').first();
    return { status: 200, data: { ok: true, database: 'D1', binding: 'DB', trades: Number(count?.count || 0), generatedAt: new Date().toISOString() } };
  }
  if (url.pathname === '/paper-trades' && request.method === 'GET') {
    const listed = await listTrades(env, url.searchParams.get('limit'));
    return { status: 200, data: { ok: true, database: 'D1', generatedAt: new Date().toISOString(), ...listed } };
  }
  if (url.pathname === '/paper-trades' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const result = await upsertTrades(env, [body?.trade || body]);
    return { status: 200, data: { ok: true, database: 'D1', ...result } };
  }
  if (url.pathname === '/paper-trades/import' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const result = await upsertTrades(env, body?.trades);
    return { status: 200, data: { ok: true, database: 'D1', ...result } };
  }
  if (url.pathname === '/paper-settle' && request.method === 'POST') {
    const result = await settlePendingTrades(env);
    return { status: 200, data: { ok: true, database: 'D1', generatedAt: new Date().toISOString(), ...result } };
  }
  return { status: 404, data: { ok: false, error: 'Paper endpoint not found' } };
}
