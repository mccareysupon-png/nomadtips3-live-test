import { listActiveMemberConditionConfigs } from './member-config.js';
import { sharedApiFetch } from './shared-api-football.js';

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const REQUIRED_STATS = ['attacks', 'dangerous_attacks', 'shots', 'shots_on_target', 'corners', 'possession'];
const WEIGHTS = {
  attacks: 0.16,
  dangerous_attacks: 0.52,
  shots: 2,
  shots_on_target: 4,
  corners: 1.25
};

const LIVE_STATE_SQL = `
CREATE TABLE IF NOT EXISTS member_live_state (
  member_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  selected_team TEXT NOT NULL,
  opponent TEXT NOT NULL,
  minute INTEGER NOT NULL,
  selected_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  momentum REAL,
  streak INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0,
  config_version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, state_key)
)`;

const LIVE_SIGNAL_SQL = `
CREATE TABLE IF NOT EXISTS member_live_signals (
  member_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  selected_side TEXT NOT NULL,
  selected_team TEXT NOT NULL,
  opponent TEXT NOT NULL,
  minute INTEGER NOT NULL,
  momentum REAL,
  selected_odds REAL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, signal_key)
)`;

const NOTIFICATION_LOG_SQL = `
CREATE TABLE IF NOT EXISTS member_notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
)`;

const SCAN_STATUS_SQL = `
CREATE TABLE IF NOT EXISTS member_live_scan_status (
  member_id TEXT PRIMARY KEY,
  ran_at INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  config_version INTEGER NOT NULL DEFAULT 0,
  counts_json TEXT NOT NULL DEFAULT '{}',
  usage_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
)`;

const API_USAGE_SQL = `
CREATE TABLE IF NOT EXISTS member_api_usage (
  member_id TEXT NOT NULL,
  usage_day TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, usage_day, endpoint)
)`;

let schemaReady = false;

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function thaiDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(now));
  const read = type => parts.find(part => part.type === type)?.value || '00';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function startOfThaiDay(now) {
  const offset = 7 * 60 * 60_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(LIVE_STATE_SQL),
    env.DB.prepare(LIVE_SIGNAL_SQL),
    env.DB.prepare(NOTIFICATION_LOG_SQL),
    env.DB.prepare(SCAN_STATUS_SQL),
    env.DB.prepare(API_USAGE_SQL),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_live_scan_updated ON member_live_scan_status(updated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_member_api_usage_updated ON member_api_usage(member_id, updated_at)')
  ]);
  schemaReady = true;
}

function usageCounter() {
  return {
    totalRequests: 0,
    endpoints: {
      live_fixtures: { calls: 0, items: 0 },
      fixture_stats_batch: { calls: 0, items: 0 },
      live_odds: { calls: 0, items: 0 }
    }
  };
}

function recordUsage(usage, endpoint, items = 0) {
  if (!usage.endpoints[endpoint]) usage.endpoints[endpoint] = { calls: 0, items: 0 };
  usage.totalRequests += 1;
  usage.endpoints[endpoint].calls += 1;
  usage.endpoints[endpoint].items += Number(items || 0);
}

function apiErrorDetail(payload) {
  const errors = payload?.errors;
  if (!errors) return '';
  if (typeof errors === 'string') return errors.trim();
  if (Array.isArray(errors)) return errors.length ? JSON.stringify(errors) : '';
  if (typeof errors === 'object') return Object.keys(errors).length ? JSON.stringify(errors) : '';
  return String(errors);
}

function isRateLimit(response, payload) {
  const detail = `${response?.status || ''} ${payload?.message || ''} ${apiErrorDetail(payload)}`;
  return response?.status === 429 || /too many requests|rate.?limit|requests per minute/i.test(detail);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiFetchDirect(path, env, usage, endpoint, items = 0) {
  const result = await sharedApiFetch(path, env);
  if (Number(result.upstreamRequests || 0) > 0) recordUsage(usage, endpoint, items);
  return result.payload;
}

function normalizeStatKey(type) {
  const key = String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ({
    attacks: 'attacks',
    dangerousattacks: 'dangerous_attacks',
    ballpossession: 'possession',
    totalshots: 'shots',
    shotsongoal: 'shots_on_target',
    shotsontarget: 'shots_on_target',
    cornerkicks: 'corners',
    redcards: 'red_cards'
  })[key] || null;
}

function normalizeStatistics(raw) {
  const output = {};
  const teams = Array.isArray(raw) ? raw : [];
  teams.slice(0, 2).forEach((team, index) => {
    const side = index === 0 ? 'home' : 'away';
    for (const row of team?.statistics || team?.stats || []) {
      const key = normalizeStatKey(row?.type || row?.name);
      if (!key) continue;
      if (!output[key]) output[key] = { home: null, away: null };
      output[key][side] = row?.value ?? null;
    }
  });
  return output;
}

function swapStatistics(stats) {
  const output = {};
  for (const [key, value] of Object.entries(stats || {})) {
    output[key] = { home: value?.away ?? null, away: value?.home ?? null };
  }
  return output;
}

function fixtureSummary(item) {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  return {
    id: Number(fixture.id) || null,
    status: String(fixture?.status?.short || '').toUpperCase(),
    minute: numeric(fixture?.status?.elapsed),
    kickoffUtc: fixture.date ?? null,
    league: item?.league?.name ?? 'Live Football',
    country: item?.league?.country ?? 'World',
    home: teams?.home?.name ?? 'Home',
    away: teams?.away?.name ?? 'Away',
    homeScore: numeric(goals?.home),
    awayScore: numeric(goals?.away)
  };
}

function completeStatistics(stats) {
  const missing = REQUIRED_STATS.filter(key =>
    numeric(stats[key]?.home) === null || numeric(stats[key]?.away) === null
  );
  return { ok: missing.length === 0, missing };
}

function isSideValue(value, teamName, side) {
  const text = String(value ?? '').trim().toLowerCase();
  const team = String(teamName ?? '').trim().toLowerCase();
  if (team && text.includes(team)) return true;
  if (side === 'HOME') return text === 'home' || text === '1';
  return text === 'away' || text === '2';
}

function handicapNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return match ? numeric(match[1]) : null;
}

function flattenBetContainers(root) {
  const results = [];
  const seen = new Set();
  function walk(value, context = '') {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((child, index) => walk(child, `${context} ${index}`));
      return;
    }
    const name = value.name || value.bet?.name || value.label || '';
    const values = value.values || value.outcomes || value.selections;
    if (Array.isArray(values)) results.push({ name: String(name), values, context });
    Object.entries(value).slice(0, 500).forEach(([key, child]) => walk(child, `${context} ${key} ${name}`));
  }
  walk(root);
  return results;
}

function sideMarkets(oddsItem, teamName, side) {
  let win = null;
  let ah = null;
  let ahOdd = null;
  const containers = flattenBetContainers(oddsItem?.odds || oddsItem);
  for (const container of containers) {
    const betName = `${container.name} ${container.context}`.toLowerCase();
    const isWinner = /(match winner|1x2|fulltime result|moneyline|winner)/.test(betName);
    const isAh = /(asian handicap|asian line|\bah\b)/.test(betName);
    if (!isWinner && !isAh) continue;
    const ordered = [...container.values].sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));
    for (const value of ordered) {
      const sideValue = value?.value ?? value?.name ?? value?.label ?? value?.team;
      if (!isSideValue(sideValue, teamName, side)) continue;
      const odd = numeric(value?.odd ?? value?.odds ?? value?.price ?? value?.decimal);
      if (isWinner && win === null && odd !== null) win = odd;
      if (isAh && ah === null) {
        ah = handicapNumber(value?.handicap ?? value?.line ?? value?.hdp ?? sideValue);
        if (ah !== null) ahOdd = odd;
      }
    }
  }
  return { win, ah, ahOdd };
}

function inOptionalRange(value, min, max) {
  if (value === null) return false;
  if (value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function selectedSides(config) {
  return config.side === 'BOTH' ? ['HOME', 'AWAY'] : [config.side];
}

function selectedCandidate(source, markets, config, selectedSide) {
  const awaySelected = selectedSide === 'AWAY';
  const stats = awaySelected ? swapStatistics(source.stats) : source.stats;
  const selectedName = awaySelected ? source.match.away : source.match.home;
  const opponentName = awaySelected ? source.match.home : source.match.away;
  const selectedScore = awaySelected ? source.match.awayScore : source.match.homeScore;
  const opponentScore = awaySelected ? source.match.homeScore : source.match.awayScore;
  return {
    fixtureId: source.match.id,
    kickoffUtc: source.match.kickoffUtc,
    status: source.match.status,
    minute: source.match.minute,
    league: source.match.league,
    country: source.match.country,
    home: selectedName,
    away: opponentName,
    actualHome: source.match.home,
    actualAway: source.match.away,
    selectedSide,
    selectedMarket: config.market,
    selectedOdds: config.market === 'AH' ? markets.ahOdd : markets.win,
    score: { home: selectedScore, away: opponentScore },
    actualScore: { home: source.match.homeScore, away: source.match.awayScore },
    stats,
    markets: {
      homeWin: markets.win,
      homeAh: markets.ah,
      homeAhOdds: markets.ahOdd,
      selectedOdds: config.market === 'AH' ? markets.ahOdd : markets.win
    },
    redCards: {
      home: numeric(stats.red_cards?.home) || 0,
      away: numeric(stats.red_cards?.away) || 0
    }
  };
}

function liveOddsByFixture(payload, fixtureIds) {
  const wanted = new Set(fixtureIds.map(Number));
  const map = new Map();
  for (const item of Array.isArray(payload?.response) ? payload.response : []) {
    const fixtureId = Number(item?.fixture?.id ?? item?.fixtureId ?? item?.id);
    if (!Number.isInteger(fixtureId) || !wanted.has(fixtureId)) continue;
    map.set(fixtureId, item);
  }
  return map;
}

async function fetchCandidatesForMember(env, config, usage, warnings) {
  const livePayload = await apiFetchDirect('/fixtures?live=all', env, usage, 'live_fixtures', 1);
  const liveItems = (Array.isArray(livePayload?.response) ? livePayload.response : [])
    .filter(item => LIVE_STATUSES.has(String(item?.fixture?.status?.short || '').toUpperCase()));

  const preliminary = liveItems
    .map(item => ({ item, match: fixtureSummary(item) }))
    .filter(({ match }) => {
      if (!match.id || match.minute === null || match.homeScore === null || match.awayScore === null) return false;
      if (match.minute < config.minuteMin || match.minute > config.minuteMax) return false;
      if (config.goalGapLimited && Math.abs(match.homeScore - match.awayScore) > config.maxGoalGap) return false;
      return true;
    });

  const statsMap = new Map();
  const ids = preliminary.map(({ match }) => Number(match.id)).filter(Number.isInteger);
  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    try {
      const payload = await apiFetchDirect(`/fixtures?ids=${group.join('-')}`, env, usage, 'fixture_stats_batch', group.length);
      for (const item of Array.isArray(payload?.response) ? payload.response : []) {
        const fixtureId = Number(item?.fixture?.id);
        if (Number.isInteger(fixtureId)) statsMap.set(fixtureId, normalizeStatistics(item?.statistics));
      }
    } catch (error) {
      warnings.push(`stats ${group[0]}-${group.at(-1)}: ${error?.message || 'request failed'}`);
    }
  }

  const statEligible = preliminary
    .map(source => ({ ...source, stats: statsMap.get(Number(source.match.id)) || {} }))
    .filter(source => completeStatistics(source.stats).ok);

  let oddsMap = new Map();
  if (statEligible.length) {
    try {
      const payload = await apiFetchDirect('/odds/live', env, usage, 'live_odds', statEligible.length);
      oddsMap = liveOddsByFixture(payload, statEligible.map(({ match }) => match.id));
    } catch (error) {
      warnings.push(`live odds: ${error?.message || 'request failed'}`);
    }
  }

  const candidates = [];
  for (const source of statEligible) {
    const oddsItem = oddsMap.get(Number(source.match.id)) || null;
    for (const selectedSide of selectedSides(config)) {
      const teamName = selectedSide === 'AWAY' ? source.match.away : source.match.home;
      const markets = sideMarkets(oddsItem, teamName, selectedSide);
      const selectedOdds = config.market === 'AH' ? markets.ahOdd : markets.win;
      if (!inOptionalRange(selectedOdds, config.oddsMin, config.oddsMax)) continue;
      if (!inOptionalRange(markets.ah, config.ahMin, config.ahMax)) continue;
      const candidate = selectedCandidate(source, markets, config, selectedSide);
      if (candidate.redCards.home > candidate.redCards.away) continue;
      candidates.push(candidate);
    }
  }

  return {
    candidates,
    sourceCounts: {
      allLive: liveItems.length,
      minuteWindow: preliminary.length,
      completeStats: statEligible.length
    }
  };
}

function activity(currentStats, previousStats, side) {
  let weighted = 0;
  let evidence = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const current = numeric(currentStats?.[key]?.[side]);
    const previous = numeric(previousStats?.[key]?.[side]);
    const delta = previous === null || current === null ? 0 : Math.max(0, current - previous);
    weighted += delta * weight;
    if (['dangerous_attacks', 'shots', 'shots_on_target', 'corners'].includes(key)) evidence += delta;
  }
  weighted += Math.max(0, numeric(currentStats?.possession?.[side]) || 0) * 0.07;
  return { weighted, evidence };
}

function calculateMomentum(candidate, previous, now, configVersion) {
  if (!previous) return null;
  if (Number(previous.config_version || 0) !== Number(configVersion || 0)) return null;
  const age = now - Number(previous.updated_at || 0);
  if (age <= 0 || age > 8 * 60_000 || Number(candidate.minute) < Number(previous.minute || 0)) return null;
  const previousPayload = parseJson(previous.payload_json, {});
  const previousStats = previousPayload.stats || {};
  const selected = activity(candidate.stats, previousStats, 'home');
  const opponent = activity(candidate.stats, previousStats, 'away');
  const total = selected.weighted + opponent.weighted;
  let selectedPercent = total > 0 ? (selected.weighted / total) * 100 : 50;
  const lastPercent = numeric(previous.momentum);
  if (lastPercent !== null) selectedPercent = lastPercent * 0.55 + selectedPercent * 0.45;
  selectedPercent = Math.round(clamp(selectedPercent, 0, 100));
  return { home: selectedPercent, away: 100 - selectedPercent, evidence: selected.evidence };
}

function candidateKey(candidate) {
  return `${Number(candidate.fixtureId)}:${String(candidate.selectedSide || 'HOME')}`;
}

async function loadPreviousStates(env, memberId) {
  const rows = await env.DB.prepare(`
    SELECT * FROM member_live_state
    WHERE member_id = ? AND updated_at >= ?
  `).bind(memberId, Date.now() - 8 * 60 * 60_000).all();
  return new Map((rows.results || []).map(row => [String(row.state_key), row]));
}

async function loadExistingSignals(env, memberId, candidates) {
  const map = new Set();
  const ids = [...new Set(candidates.map(item => Number(item.fixtureId)).filter(Number.isInteger))];
  for (let index = 0; index < ids.length; index += 50) {
    const group = ids.slice(index, index + 50);
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT signal_key FROM member_live_signals
      WHERE member_id = ? AND fixture_id IN (${placeholders})
    `).bind(memberId, ...group).all();
    for (const row of rows.results || []) map.add(String(row.signal_key));
  }
  return map;
}

function stateStatement(env, memberId, candidate, calculated, streak, triggered, now, configVersion) {
  const payload = {
    stats: candidate.stats,
    markets: candidate.markets,
    league: candidate.league,
    country: candidate.country,
    actualHome: candidate.actualHome,
    actualAway: candidate.actualAway,
    actualScore: candidate.actualScore,
    evidence: calculated?.evidence ?? 0,
    selectedMarket: candidate.selectedMarket
  };
  return env.DB.prepare(`
    INSERT INTO member_live_state (
      member_id, state_key, fixture_id, selected_side, selected_team, opponent, minute,
      selected_score, opponent_score, momentum, streak, triggered, config_version, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id, state_key) DO UPDATE SET
      fixture_id = excluded.fixture_id,
      selected_side = excluded.selected_side,
      selected_team = excluded.selected_team,
      opponent = excluded.opponent,
      minute = excluded.minute,
      selected_score = excluded.selected_score,
      opponent_score = excluded.opponent_score,
      momentum = excluded.momentum,
      streak = excluded.streak,
      triggered = excluded.triggered,
      config_version = excluded.config_version,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    memberId, candidateKey(candidate), Number(candidate.fixtureId), String(candidate.selectedSide || 'HOME'),
    String(candidate.home || 'Selected'), String(candidate.away || 'Opponent'), Number(candidate.minute),
    Number(candidate.score?.home || 0), Number(candidate.score?.away || 0), calculated?.home ?? null,
    streak, triggered ? 1 : 0, Number(configVersion || 0), JSON.stringify(payload), now
  );
}

function signalStatement(env, memberId, candidate, calculated, now) {
  const key = candidateKey(candidate);
  const payload = {
    fixtureId: Number(candidate.fixtureId),
    selectedSide: candidate.selectedSide || 'HOME',
    selectedTeam: candidate.home,
    opponent: candidate.away,
    minute: Number(candidate.minute),
    score: candidate.score,
    momentum: calculated?.home ?? null,
    selectedOdds: numeric(candidate?.markets?.selectedOdds),
    ahLine: numeric(candidate?.markets?.homeAh),
    ahOdds: numeric(candidate?.markets?.homeAhOdds),
    createdAt: now
  };
  return env.DB.prepare(`
    INSERT OR IGNORE INTO member_live_signals (
      member_id, signal_key, fixture_id, selected_side, selected_team, opponent, minute,
      momentum, selected_odds, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    memberId, key, Number(candidate.fixtureId), String(candidate.selectedSide || 'HOME'),
    String(candidate.home || 'Selected'), String(candidate.away || 'Opponent'), Number(candidate.minute),
    calculated?.home ?? null, numeric(candidate?.markets?.selectedOdds), JSON.stringify(payload), now
  );
}

function notificationStatement(env, memberId, candidate, calculated, now) {
  const eventKey = `LIVE:${candidateKey(candidate)}`;
  const payload = {
    type: 'LIVE_SIGNAL',
    memberId,
    fixtureId: Number(candidate.fixtureId),
    selectedTeam: candidate.home,
    opponent: candidate.away,
    minute: Number(candidate.minute),
    momentum: calculated?.home ?? null,
    selectedOdds: numeric(candidate?.markets?.selectedOdds)
  };
  return env.DB.prepare(`
    INSERT INTO member_notification_log (
      member_id, event_key, channel, status, payload_json, created_at
    ) VALUES (?, ?, 'LINE', 'PENDING', ?, ?)
  `).bind(memberId, eventKey, JSON.stringify(payload), now);
}

async function persistUsage(env, memberId, usage, now) {
  const day = thaiDayKey(now);
  const statements = [];
  for (const [endpoint, value] of Object.entries(usage.endpoints || {})) {
    if (!Number(value.calls || 0)) continue;
    statements.push(env.DB.prepare(`
      INSERT INTO member_api_usage (member_id, usage_day, endpoint, calls, items, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(member_id, usage_day, endpoint) DO UPDATE SET
        calls = calls + excluded.calls,
        items = items + excluded.items,
        updated_at = excluded.updated_at
    `).bind(memberId, day, endpoint, Number(value.calls || 0), Number(value.items || 0), now));
  }
  if (statements.length) await env.DB.batch(statements);
}

async function saveScanStatus(env, memberId, status) {
  await env.DB.prepare(`
    INSERT INTO member_live_scan_status (
      member_id, ran_at, ok, config_version, counts_json, usage_json, error, warnings_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      ran_at = excluded.ran_at,
      ok = excluded.ok,
      config_version = excluded.config_version,
      counts_json = excluded.counts_json,
      usage_json = excluded.usage_json,
      error = excluded.error,
      warnings_json = excluded.warnings_json,
      updated_at = excluded.updated_at
  `).bind(
    memberId, status.ranAt, status.ok ? 1 : 0, Number(status.configVersion || 0),
    JSON.stringify(status.counts || {}), JSON.stringify(status.usage || {}), status.error || null,
    JSON.stringify(status.warnings || []), Date.now()
  ).run();
}

export async function runMemberLiveScan(env, member) {
  await ensureSchema(env);
  const now = Date.now();
  const memberId = String(member.memberId);
  const config = member.config;
  const usage = usageCounter();
  const warnings = [];
  try {
    const { candidates, sourceCounts } = await fetchCandidatesForMember(env, config, usage, warnings);
    const [states, existingSignals, dailyCountRow] = await Promise.all([
      loadPreviousStates(env, memberId),
      loadExistingSignals(env, memberId, candidates),
      env.DB.prepare('SELECT COUNT(*) AS total FROM member_live_signals WHERE member_id = ? AND created_at >= ?')
        .bind(memberId, startOfThaiDay(now)).first()
    ]);

    let momentumReady = 0;
    let passing = 0;
    let triggered = 0;
    let newSignals = 0;
    let dailySignals = Number(dailyCountRow?.total || 0);
    const statements = [];

    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      const previous = states.get(key) || null;
      const calculated = calculateMomentum(candidate, previous, now, config.version);
      if (calculated) momentumReady += 1;
      const pass = Boolean(calculated && calculated.home >= config.momentumMin && calculated.evidence >= 1);
      if (pass) passing += 1;
      const streak = pass ? Number(previous?.streak || 0) + 1 : 0;
      let wasTriggered = Boolean(previous && Number(previous.triggered));
      if (existingSignals.has(key)) wasTriggered = true;
      const limitReached = config.signalLimitEnabled && dailySignals >= config.maxSignalsPerDay;
      if (!wasTriggered && streak >= config.confirmationRounds && !limitReached) {
        statements.push(signalStatement(env, memberId, candidate, calculated, now));
        statements.push(notificationStatement(env, memberId, candidate, calculated, now));
        wasTriggered = true;
        dailySignals += 1;
        newSignals += 1;
      }
      if (wasTriggered) triggered += 1;
      statements.push(stateStatement(env, memberId, candidate, calculated, streak, wasTriggered, now, config.version));
    }

    for (let index = 0; index < statements.length; index += 80) {
      await env.DB.batch(statements.slice(index, index + 80));
    }
    await env.DB.prepare('DELETE FROM member_live_state WHERE member_id = ? AND updated_at < ?')
      .bind(memberId, now - 6 * 60 * 60_000).run();

    const counts = {
      ...sourceCounts,
      candidates: candidates.length,
      momentumReady,
      passing,
      triggered,
      newSignals,
      dailySignals
    };
    await persistUsage(env, memberId, usage, now);
    await saveScanStatus(env, memberId, {
      ranAt: now,
      ok: true,
      configVersion: config.version,
      counts,
      usage,
      warnings
    });
    return { ok: true, memberId, generatedAt: new Date(now).toISOString(), counts, usage, warnings };
  } catch (error) {
    await persistUsage(env, memberId, usage, now).catch(() => {});
    await saveScanStatus(env, memberId, {
      ranAt: now,
      ok: false,
      configVersion: config?.version,
      counts: {},
      usage,
      error: error?.message || 'Member live scan failed',
      warnings
    }).catch(() => {});
    throw error;
  }
}

export async function runMemberLiveBackgroundScans(env) {
  await ensureSchema(env);
  const members = await listActiveMemberConditionConfigs(env);
  const results = [];
  for (const member of members) {
    try {
      results.push(await runMemberLiveScan(env, member));
    } catch (error) {
      results.push({ ok: false, memberId: member.memberId, error: error?.message || 'Member live scan failed' });
    }
  }
  return {
    ok: results.every(result => result.ok),
    generatedAt: new Date().toISOString(),
    members: results.length,
    results
  };
}
