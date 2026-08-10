const REQUIRED_STATS = ['attacks', 'dangerous_attacks', 'shots', 'shots_on_target', 'corners', 'possession'];
const WEIGHTS = { attacks: 0.16, dangerous_attacks: 0.52, shots: 2, shots_on_target: 4, corners: 1.25 };
export const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
export const TERMINAL = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'PST']);
export const VOID_STATUS = new Set(['WO', 'AWD', 'CANC', 'ABD', 'PST']);

export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function statKey(type) {
  const key = String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ({
    attacks: 'attacks', dangerousattacks: 'dangerous_attacks', ballpossession: 'possession',
    totalshots: 'shots', shotsongoal: 'shots_on_target', shotsontarget: 'shots_on_target',
    cornerkicks: 'corners', redcards: 'red_cards'
  })[key] || null;
}

export function normalizeStatistics(raw) {
  const out = {};
  const teams = Array.isArray(raw) ? raw : [];
  teams.slice(0, 2).forEach((team, index) => {
    const side = index === 0 ? 'home' : 'away';
    for (const row of team?.statistics || []) {
      const key = statKey(row?.type);
      if (!key) continue;
      if (!out[key]) out[key] = { home: null, away: null };
      out[key][side] = row?.value ?? null;
    }
  });
  return out;
}

export function completeStatistics(stats) {
  return REQUIRED_STATS.every(key => num(stats?.[key]?.home) !== null && num(stats?.[key]?.away) !== null);
}

export function fixtureSummary(item) {
  return {
    id: Number(item?.fixture?.id) || null,
    status: String(item?.fixture?.status?.short || '').toUpperCase(),
    minute: num(item?.fixture?.status?.elapsed),
    home: String(item?.teams?.home?.name || 'Home'),
    away: String(item?.teams?.away?.name || 'Away'),
    homeScore: num(item?.goals?.home),
    awayScore: num(item?.goals?.away),
    league: String(item?.league?.name || ''),
    country: String(item?.league?.country || '')
  };
}

export function swapStats(stats) {
  const out = {};
  for (const [key, value] of Object.entries(stats || {})) {
    out[key] = { home: value?.away ?? null, away: value?.home ?? null };
  }
  return out;
}

function activity(current, previous, side) {
  let weighted = 0;
  let evidence = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const a = num(current?.[key]?.[side]);
    const b = num(previous?.[key]?.[side]);
    const delta = a === null || b === null ? 0 : Math.max(0, a - b);
    weighted += delta * weight;
    if (['dangerous_attacks', 'shots', 'shots_on_target', 'corners'].includes(key)) evidence += delta;
  }
  weighted += Math.max(0, num(current?.possession?.[side]) || 0) * 0.07;
  return { weighted, evidence };
}

export function momentum(current, previousRow) {
  if (!previousRow) return null;
  let previous = {};
  try { previous = JSON.parse(previousRow.stats_json || '{}'); } catch {}
  const selected = activity(current, previous, 'home');
  const opponent = activity(current, previous, 'away');
  const total = selected.weighted + opponent.weighted;
  let pct = total > 0 ? selected.weighted / total * 100 : 50;
  const last = num(previousRow.last_percent);
  if (last !== null) pct = last * 0.55 + pct * 0.45;
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  return { selected: pct, opponent: 100 - pct, evidence: selected.evidence };
}

export function selectedSides(config) {
  const side = String(config.side || 'HOME').toUpperCase();
  return side === 'BOTH' ? ['HOME', 'AWAY'] : [side === 'AWAY' ? 'AWAY' : 'HOME'];
}

function isSide(value, teamName, side) {
  const text = String(value ?? '').trim().toLowerCase();
  const team = String(teamName || '').trim().toLowerCase();
  if (team && text.includes(team)) return true;
  return side === 'HOME' ? text === 'home' || text === '1' : text === 'away' || text === '2';
}

function handicap(value) {
  const match = String(value ?? '').replace(',', '.').match(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return match ? num(match[1]) : null;
}

function betContainers(root) {
  const out = [];
  const seen = new Set();
  function walk(value, context = '') {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 600).forEach((child, index) => walk(child, `${context} ${index}`));
      return;
    }
    const name = value.name || value.bet?.name || value.label || '';
    const values = value.values || value.outcomes || value.selections;
    if (Array.isArray(values)) out.push({ name: String(name), values, context });
    for (const [key, child] of Object.entries(value).slice(0, 600)) walk(child, `${context} ${key} ${name}`);
  }
  walk(root);
  return out;
}

export function marketsFor(oddsItem, teamName, side) {
  let win = null, ah = null, ahOdds = null;
  for (const box of betContainers(oddsItem?.odds || oddsItem)) {
    const name = `${box.name} ${box.context}`.toLowerCase();
    const isWin = /(match winner|1x2|fulltime result|moneyline|winner)/.test(name);
    const isAh = /(asian handicap|asian line|\bah\b)/.test(name);
    if (!isWin && !isAh) continue;
    const values = [...box.values].sort((a, b) => Number(Boolean(b?.main)) - Number(Boolean(a?.main)));
    for (const value of values) {
      const sideText = value?.value ?? value?.name ?? value?.label ?? value?.team;
      if (!isSide(sideText, teamName, side)) continue;
      const odd = num(value?.odd ?? value?.odds ?? value?.price ?? value?.decimal);
      if (isWin && win === null && odd !== null) win = odd;
      if (isAh && ah === null) {
        ah = handicap(value?.handicap ?? value?.line ?? value?.hdp ?? sideText);
        if (ah !== null) ahOdds = odd;
      }
    }
  }
  return { win, ah, ahOdds };
}

export function inRange(value, min, max) {
  if (value === null) return false;
  if (value < Number(min)) return false;
  return max === null || max === undefined || value <= Number(max);
}

export function normalizeFinal(item) {
  const status = String(item?.fixture?.status?.short || '').toUpperCase();
  const goals = item?.goals || {};
  const full = item?.score?.fulltime || {};
  const home = ['AET', 'PEN'].includes(status) && num(full.home) !== null ? num(full.home) : num(goals.home);
  const away = ['AET', 'PEN'].includes(status) && num(full.away) !== null ? num(full.away) : num(goals.away);
  return { id: Number(item?.fixture?.id), status, home, away };
}

export function resultForSignal(signal, fixture) {
  if (VOID_STATUS.has(fixture.status) || fixture.home === null || fixture.away === null) return 'NEUTRAL';
  const awaySelected = String(signal.selected_side) === 'AWAY';
  const selectedFinal = awaySelected ? fixture.away : fixture.home;
  const opponentFinal = awaySelected ? fixture.home : fixture.away;
  if (String(signal.selected_market) !== 'AH') return selectedFinal > opponentFinal ? 'CORRECT' : 'INCORRECT';
  const postSelected = selectedFinal - Number(signal.entry_selected_score || 0);
  const postOpponent = opponentFinal - Number(signal.entry_opponent_score || 0);
  const adjusted = postSelected - postOpponent + Number(signal.ah_line || 0);
  return adjusted > 0 ? 'CORRECT' : adjusted < 0 ? 'INCORRECT' : 'NEUTRAL';
}
