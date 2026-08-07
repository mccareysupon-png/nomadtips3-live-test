const API_BASE = 'https://v3.football.api-sports.io';
const TERMINAL = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'PST']);
const VOID_STATUS = new Set(['CANC', 'ABD', 'PST', 'WO', 'AWD']);
const STAKE_DEFAULT = 100;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS paper_trades_side (
  trade_key TEXT PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  trade_id TEXT NOT NULL,
  selected_side TEXT NOT NULL DEFAULT 'HOME',
  selected_team TEXT NOT NULL,
  opponent TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  entry_minute INTEGER NOT NULL,
  entry_selected_score INTEGER NOT NULL,
  entry_opponent_score INTEGER NOT NULL,
  actual_home TEXT NOT NULL,
  actual_away TEXT NOT NULL,
  entry_actual_home_score INTEGER NOT NULL,
  entry_actual_away_score INTEGER NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  score_state TEXT NOT NULL DEFAULT '',
  momentum REAL,
  selected_win_odds REAL,
  ah_line REAL NOT NULL,
  ah_odds REAL NOT NULL,
  stake_units REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result TEXT NOT NULL DEFAULT 'PENDING',
  settlement TEXT NOT NULL DEFAULT 'PENDING',
  final_status TEXT,
  final_selected_score INTEGER,
  final_opponent_score INTEGER,
  final_actual_home_score INTEGER,
  final_actual_away_score INTEGER,
  post_entry_selected_goals INTEGER,
  post_entry_opponent_goals INTEGER,
  profit_units REAL NOT NULL DEFAULT 0,
  returned_units REAL,
  split_lines TEXT,
  settled_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
)`;

const CREATE_STATUS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_paper_side_status ON paper_trades_side(status)`;
const CREATE_CREATED_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_paper_side_created ON paper_trades_side(created_at DESC)`;
const CREATE_FIXTURE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_paper_side_fixture ON paper_trades_side(fixture_id, selected_side)`;

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

function normalizeSide(value) {
  return String(value || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
}

function tradeKey(fixtureId, side) {
  return `${Number(fixtureId)}:${normalizeSide(side)}`;
}

async function ensureDatabase(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(CREATE_TABLE_SQL),
    env.DB.prepare(CREATE_STATUS_INDEX_SQL),
    env.DB.prepare(CREATE_CREATED_INDEX_SQL),
    env.DB.prepare(CREATE_FIXTURE_INDEX_SQL)
  ]);

  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO paper_trades_side (
        trade_key, fixture_id, trade_id, selected_side, selected_team, opponent,
        created_at, entry_minute, entry_selected_score, entry_opponent_score,
        actual_home, actual_away, entry_actual_home_score, entry_actual_away_score,
        league, country, score_state, momentum, selected_win_odds, ah_line, ah_odds,
        stake_units, status, result, settlement, final_status,
        final_selected_score, final_opponent_score, final_actual_home_score, final_actual_away_score,
        post_entry_selected_goals, post_entry_opponent_goals, profit_units, returned_units,
        split_lines, settled_at, note, updated_at
      )
      SELECT
        CAST(fixture_id AS TEXT) || ':HOME', fixture_id, trade_id, 'HOME', home, away,
        created_at, entry_minute, entry_home_score, entry_away_score,
        home, away, entry_home_score, entry_away_score,
        league, country, score_state, momentum, home_win_odds, ah_line, ah_odds,
        stake_units, status, result, settlement, final_status,
        final_home_score, final_away_score, final_home_score, final_away_score,
        post_entry_home_goals, post_entry_away_goals, profit_units, returned_units,
        split_lines, settled_at, note, updated_at
      FROM paper_trades
    `).run();
  } catch {
    // Fresh databases may not have the legacy table yet.
  }

  schemaReady = true;
}

function scoreState(selectedScore, opponentScore) {
  const diff = Number(selectedScore) - Number(opponentScore);
  if (diff > 0) return `ทีมที่เลือกนำ ${diff} ลูก`;
  if (diff < 0) return `ทีมที่เลือกตาม ${Math.abs(diff)} ลูก`;
  return 'สกอร์เสมอ';
}

function signalInsertStatement(env, signal) {
  const side = normalizeSide(signal.selected_side);
  const fixtureId = integer(signal.fixture_id);
  const selectedScore = integer(signal.selected_score);
  const opponentScore = integer(signal.opponent_score);
  const ahLine = number(signal.ah_line);
  const ahOdds = number(signal.ah_odds);
  if (!fixtureId || selectedScore === null || opponentScore === null || ahLine === null || ahOdds === null || ahOdds <= 1) {
    return null;
  }

  const selectedTeam = String(signal.selected_team || 'Selected');
  const opponent = String(signal.opponent || 'Opponent');
  const actualHome = side === 'AWAY' ? opponent : selectedTeam;
  const actualAway = side === 'AWAY' ? selectedTeam : opponent;
  const actualHomeScore = side === 'AWAY' ? opponentScore : selectedScore;
  const actualAwayScore = side === 'AWAY' ? selectedScore : opponentScore;
  const key = tradeKey(fixtureId, side);
  const now = Date.now();

  return env.DB.prepare(`
    INSERT OR IGNORE INTO paper_trades_side (
      trade_key, fixture_id, trade_id, selected_side, selected_team, opponent,
      created_at, entry_minute, entry_selected_score, entry_opponent_score,
      actual_home, actual_away, entry_actual_home_score, entry_actual_away_score,
      league, country, score_state, momentum, selected_win_odds, ah_line, ah_odds,
      stake_units, status, result, settlement, profit_units, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100,
              'PENDING', 'PENDING', 'PENDING', 0, ?, ?)
  `).bind(
    key, fixtureId, `P5-${fixtureId}-${side}`, side, selectedTeam, opponent,
    integer(signal.created_at) || now, integer(signal.minute) || 0, selectedScore, opponentScore,
    actualHome, actualAway, actualHomeScore, actualAwayScore,
    String(signal.league || ''), String(signal.country || ''), scoreState(selectedScore, opponentScore),
    number(signal.momentum), number(signal.selected_odds), ahLine, ahOdds,
    'Created automatically from NOMAD condition signal', now
  );
}

export async function syncSignalsToPaperTrades(env) {
  await ensureDatabase(env);
  let rows = [];
  try {
    const result = await env.DB.prepare(`
      SELECT s.*
      FROM condition_signals s
      LEFT JOIN paper_trades_side p ON p.trade_key = s.signal_key
      WHERE p.trade_key IS NULL
      ORDER BY s.created_at ASC
      LIMIT 2000
    `).all();
    rows = result.results || [];
  } catch (error) {
    return { scanned: 0, created: 0, warnings: [error?.message || 'condition_signals unavailable'] };
  }

  const statements = [];
  for (const row of rows) {
    const statement = signalInsertStatement(env, row);
    if (statement) statements.push(statement);
  }
  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
  return { scanned: rows.length, created: statements.length, warnings: [] };
}

function validateTrade(input) {
  const trade = input && typeof input === 'object' ? input : {};
  const fixtureId = integer(trade.fixtureId);
  const side = normalizeSide(trade.selectedSide);
  const entrySelectedScore = integer(trade.entryHomeScore ?? trade.entrySelectedScore);
  const entryOpponentScore = integer(trade.entryAwayScore ?? trade.entryOpponentScore);
  const entryMinute = integer(trade.entryMinute);
  const ahLine = number(trade.ahLine);
  const ahOdds = number(trade.ahOdds);
  const stakeUnits = number(trade.stakeUnits) ?? STAKE_DEFAULT;
  const createdAt = integer(trade.createdAt) ?? Date.now();

  if (!fixtureId || fixtureId <= 0) throw new Error('Invalid fixtureId');
  if (entryMinute === null || entryMinute < 0 || entryMinute > 130) throw new Error('Invalid entryMinute');
  if (entrySelectedScore === null || entrySelectedScore < 0 || entryOpponentScore === null || entryOpponentScore < 0) {
    throw new Error('Invalid entry score');
  }
  if (ahLine === null || ahLine < -10 || ahLine > 10) throw new Error('Invalid AH line');
  if (ahOdds === null || ahOdds <= 1 || ahOdds > 100) throw new Error('Invalid AH odds');
  if (stakeUnits <= 0 || stakeUnits > 100000) throw new Error('Invalid stake units');

  const selectedTeam = String(trade.selectedTeam || trade.home || 'Selected').slice(0, 200);
  const opponent = String(trade.opponent || trade.away || 'Opponent').slice(0, 200);
  const actualHome = String(trade.actualHome || (side === 'AWAY' ? opponent : selectedTeam)).slice(0, 200);
  const actualAway = String(trade.actualAway || (side === 'AWAY' ? selectedTeam : opponent)).slice(0, 200);
  const actualHomeScore = integer(trade.entryActualHomeScore) ?? (side === 'AWAY' ? entryOpponentScore : entrySelectedScore);
  const actualAwayScore = integer(trade.entryActualAwayScore) ?? (side === 'AWAY' ? entrySelectedScore : entryOpponentScore);

  return {
    tradeKey: String(trade.tradeKey || tradeKey(fixtureId, side)).slice(0, 120),
    fixtureId,
    id: String(trade.id || `P5-${fixtureId}-${side}`).slice(0, 100),
    selectedSide: side,
    selectedTeam,
    opponent,
    createdAt,
    entryMinute,
    entrySelectedScore,
    entryOpponentScore,
    actualHome,
    actualAway,
    entryActualHomeScore: actualHomeScore,
    entryActualAwayScore: actualAwayScore,
    league: String(trade.league || '').slice(0, 200),
    country: String(trade.country || '').slice(0, 100),
    scoreState: String(trade.scoreState || scoreState(entrySelectedScore, entryOpponentScore)).slice(0, 100),
    momentum: number(trade.momentum),
    selectedWinOdds: number(trade.selectedWinOdds ?? trade.homeWinOdds),
    ahLine,
    ahOdds,
    stakeUnits,
    status: String(trade.status || 'PENDING').toUpperCase(),
    result: String(trade.result || 'PENDING').toUpperCase(),
    settlement: String(trade.settlement || 'PENDING').toUpperCase(),
    note: String(trade.note || '').slice(0, 500)
  };
}

function insertStatement(env, trade) {
  return env.DB.prepare(`
    INSERT OR IGNORE INTO paper_trades_side (
      trade_key, fixture_id, trade_id, selected_side, selected_team, opponent,
      created_at, entry_minute, entry_selected_score, entry_opponent_score,
      actual_home, actual_away, entry_actual_home_score, entry_actual_away_score,
      league, country, score_state, momentum, selected_win_odds, ah_line, ah_odds,
      stake_units, status, result, settlement, profit_units, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    trade.tradeKey, trade.fixtureId, trade.id, trade.selectedSide, trade.selectedTeam, trade.opponent,
    trade.createdAt, trade.entryMinute, trade.entrySelectedScore, trade.entryOpponentScore,
    trade.actualHome, trade.actualAway, trade.entryActualHomeScore, trade.entryActualAwayScore,
    trade.league, trade.country, trade.scoreState, trade.momentum, trade.selectedWinOdds,
    trade.ahLine, trade.ahOdds, trade.stakeUnits, trade.status, trade.result, trade.settlement,
    trade.note, Date.now()
  );
}

async function upsertTrades(env, rawTrades) {
  await ensureDatabase(env);
  const unique = new Map();
  for (const raw of Array.isArray(rawTrades) ? rawTrades.slice(0, 5000) : []) {
    const trade = validateTrade(raw);
    if (!unique.has(trade.tradeKey)) unique.set(trade.tradeKey, trade);
  }
  if (!unique.size) return { received: 0, stored: 0 };
  const statements = [...unique.values()].map(trade => insertStatement(env, trade));
  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
  return { received: unique.size, stored: unique.size };
}

function parseSplitLines(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function rowToTrade(row) {
  return {
    id: row.trade_id,
    tradeKey: row.trade_key,
    fixtureId: row.fixture_id,
    selectedSide: row.selected_side,
    selectedTeam: row.selected_team,
    opponent: row.opponent,
    createdAt: row.created_at,
    entryMinute: row.entry_minute,
    entryHomeScore: row.entry_selected_score,
    entryAwayScore: row.entry_opponent_score,
    home: row.selected_team,
    away: row.opponent,
    actualHome: row.actual_home,
    actualAway: row.actual_away,
    entryActualHomeScore: row.entry_actual_home_score,
    entryActualAwayScore: row.entry_actual_away_score,
    league: row.league,
    country: row.country,
    scoreState: row.score_state,
    momentum: row.momentum,
    homeWinOdds: row.selected_win_odds,
    selectedWinOdds: row.selected_win_odds,
    ahLine: row.ah_line,
    ahOdds: row.ah_odds,
    stakeUnits: row.stake_units,
    status: row.status,
    result: row.result,
    settlement: row.settlement,
    finalStatus: row.final_status,
    finalHomeScore: row.final_selected_score,
    finalAwayScore: row.final_opponent_score,
    finalActualHomeScore: row.final_actual_home_score,
    finalActualAwayScore: row.final_actual_away_score,
    postEntryHomeGoals: row.post_entry_selected_goals,
    postEntryAwayGoals: row.post_entry_opponent_goals,
    profitUnits: row.profit_units,
    returnedUnits: row.returned_units,
    splitLines: parseSplitLines(row.split_lines),
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
  const query = await env.DB.prepare(`SELECT * FROM paper_trades_side ORDER BY created_at DESC LIMIT ?`)
    .bind(safeLimit).all();
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
  const stake = number(trade.stake_units) || STAKE_DEFAULT;
  if (VOID_STATUS.has(fixture.status)) {
    return {
      status: 'VOID', result: 'NEUTRAL', settlement: 'VOID', finalStatus: fixture.status,
      finalSelectedScore: null, finalOpponentScore: null, finalActualHomeScore: null, finalActualAwayScore: null,
      postSelected: null, postOpponent: null, profitUnits: 0, returnedUnits: stake,
      splitLines: null, settledAt: Date.now(), note: `Void by fixture status ${fixture.status}`
    };
  }
  const score = finalScore(fixture);
  if (score.home === null || score.away === null) return null;
  const entryActualHome = integer(trade.entry_actual_home_score);
  const entryActualAway = integer(trade.entry_actual_away_score);
  if (score.home < entryActualHome || score.away < entryActualAway) {
    return {
      status: 'VOID', result: 'NEUTRAL', settlement: 'VOID', finalStatus: fixture.status,
      finalSelectedScore: null, finalOpponentScore: null, finalActualHomeScore: score.home, finalActualAwayScore: score.away,
      postSelected: null, postOpponent: null, profitUnits: 0, returnedUnits: stake,
      splitLines: null, settledAt: Date.now(), note: 'Void because final score was lower than entry score'
    };
  }

  const postActualHome = score.home - entryActualHome;
  const postActualAway = score.away - entryActualAway;
  const awaySelected = normalizeSide(trade.selected_side) === 'AWAY';
  const postSelected = awaySelected ? postActualAway : postActualHome;
  const postOpponent = awaySelected ? postActualHome : postActualAway;
  const finalSelected = awaySelected ? score.away : score.home;
  const finalOpponent = awaySelected ? score.home : score.away;
  const settled = settleAsian(postSelected - postOpponent, number(trade.ah_line), number(trade.ah_odds), stake);

  return {
    status: 'SETTLED', result: settled.result, settlement: settled.settlement,
    finalStatus: fixture.status, finalSelectedScore: finalSelected, finalOpponentScore: finalOpponent,
    finalActualHomeScore: score.home, finalActualAwayScore: score.away,
    postSelected, postOpponent, profitUnits: settled.profitUnits, returnedUnits: settled.returnedUnits,
    splitLines: settled.splitLines, settledAt: Date.now(), note: 'Settled automatically by selected-team perspective'
  };
}

function updateSettlementStatement(env, key, settled) {
  return env.DB.prepare(`
    UPDATE paper_trades_side SET
      status = ?, result = ?, settlement = ?, final_status = ?,
      final_selected_score = ?, final_opponent_score = ?,
      final_actual_home_score = ?, final_actual_away_score = ?,
      post_entry_selected_goals = ?, post_entry_opponent_goals = ?,
      profit_units = ?, returned_units = ?, split_lines = ?, settled_at = ?, note = ?, updated_at = ?
    WHERE trade_key = ? AND status = 'PENDING'
  `).bind(
    settled.status, settled.result, settled.settlement, settled.finalStatus,
    settled.finalSelectedScore, settled.finalOpponentScore,
    settled.finalActualHomeScore, settled.finalActualAwayScore,
    settled.postSelected, settled.postOpponent,
    settled.profitUnits, settled.returnedUnits,
    settled.splitLines ? JSON.stringify(settled.splitLines) : null,
    settled.settledAt, settled.note, Date.now(), key
  );
}

export async function settlePendingTrades(env) {
  await ensureDatabase(env);
  const pendingQuery = await env.DB.prepare(`
    SELECT * FROM paper_trades_side WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 500
  `).all();
  const pending = pendingQuery.results || [];
  if (!pending.length) return { pending: 0, settled: 0, checked: 0, warnings: [] };

  const fixtureMap = new Map();
  const warnings = [];
  const ids = [...new Set(pending.map(trade => integer(trade.fixture_id)).filter(Number.isInteger))];
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
    const fixture = fixtureMap.get(integer(trade.fixture_id));
    if (!fixture) continue;
    const settled = settlementForTrade(trade, fixture);
    if (settled) updates.push(updateSettlementStatement(env, trade.trade_key, settled));
  }
  for (let index = 0; index < updates.length; index += 100) {
    await env.DB.batch(updates.slice(index, index + 100));
  }
  return { pending: pending.length, settled: updates.length, checked: fixtureMap.size, warnings: warnings.slice(0, 20) };
}

export async function handlePaperRequest(request, env, url) {
  await ensureDatabase(env);
  if (url.pathname === '/paper-health' && request.method === 'GET') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM paper_trades_side').first();
    return {
      status: 200,
      data: { ok: true, database: 'D1', ledger: 'SIDE-AWARE-V2', binding: 'DB', trades: Number(count?.count || 0), generatedAt: new Date().toISOString() }
    };
  }
  if (url.pathname === '/paper-trades' && request.method === 'GET') {
    await syncSignalsToPaperTrades(env);
    const listed = await listTrades(env, url.searchParams.get('limit'));
    return { status: 200, data: { ok: true, database: 'D1', ledger: 'SIDE-AWARE-V2', generatedAt: new Date().toISOString(), ...listed } };
  }
  if (url.pathname === '/paper-trades' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const result = await upsertTrades(env, [body?.trade || body]);
    return { status: 200, data: { ok: true, database: 'D1', ledger: 'SIDE-AWARE-V2', ...result } };
  }
  if (url.pathname === '/paper-trades/import' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const result = await upsertTrades(env, body?.trades);
    return { status: 200, data: { ok: true, database: 'D1', ledger: 'SIDE-AWARE-V2', ...result } };
  }
  if (url.pathname === '/paper-settle' && request.method === 'POST') {
    await syncSignalsToPaperTrades(env);
    const result = await settlePendingTrades(env);
    return { status: 200, data: { ok: true, database: 'D1', ledger: 'SIDE-AWARE-V2', generatedAt: new Date().toISOString(), ...result } };
  }
  return { status: 404, data: { ok: false, error: 'Paper endpoint not found' } };
}
