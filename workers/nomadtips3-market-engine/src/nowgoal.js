const BASE = 'https://www.nowgoal.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';

const CORE_BOOKMAKERS = Object.freeze([
  Object.freeze({ companyId: '50', name: '1xBet' }),
  Object.freeze({ companyId: '8', name: 'Bet365' }),
  Object.freeze({ companyId: '17', name: 'M88' }),
]);

const MIN_TEAM_SCORE = 0.80;
const MIN_PAIR_SCORE = 0.86;
const MIN_MARGIN = 0.07;

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;

function cookieFromHeaders(headers) {
  const all = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (all.length) return all.map(value => String(value).split(';')[0]).filter(Boolean).join('; ');
  const one = headers?.get?.('set-cookie') || '';
  return one ? String(one).split(';')[0] : '';
}

async function requestText(fetchImpl, path, timeoutMs, cookie = '', accept = '*/*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('nowgoal_timeout'), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, BASE).toString(), {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent': UA,
        accept,
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache, no-store',
        pragma: 'no-cache',
        referer: `${BASE}/`,
        ...(cookie ? { cookie } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`nowgoal_http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (/cf-chl-|captcha|attention required|access denied/i.test(text)) {
      const error = new Error('nowgoal_blocked_or_challenge');
      error.code = 'nowgoal_blocked_or_challenge';
      throw error;
    }
    return { text, cookie: cookieFromHeaders(response.headers) };
  } finally {
    clearTimeout(timer);
  }
}

function splitLiteral(body = '') {
  const out = [];
  let current = '', quote = null, escape = false;
  for (const ch of body) {
    if (quote) {
      if (escape) { current += ch; escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === quote) { quote = null; continue; }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === ',') { out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  out.push(current.trim());
  return out.map(value => value === '' ? null : value);
}

export function parseNowgoalRoster(js = '') {
  const rows = [];
  for (const match of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)) {
    const fields = splitLiteral(match[1]);
    const id = String(fields[0] ?? '').trim();
    if (!/^\d+$/.test(id)) continue;
    rows.push({
      id,
      home: String(fields[4] ?? '').trim(),
      away: String(fields[5] ?? '').trim(),
      state: number(fields[8]),
      score: [number(fields[9]), number(fields[10])],
    });
  }
  return rows;
}

export function parseNowgoalGoalRows(xml = '') {
  const rows = new Map();
  for (const match of String(xml).matchAll(/<m>([^<]+)<\/m>/g)) {
    const fields = match[1].split(',').map(value => String(value ?? '').trim());
    const id = String(fields[0] || '').trim();
    if (!/^\d+$/.test(id)) continue;
    rows.set(id, fields);
  }
  return rows;
}

function decimal(value) {
  const n = number(value);
  return n !== null && n > 1 && n < 100 ? n : null;
}

function hkToDecimal(value) {
  const n = number(value);
  if (n === null || n < 0) return null;
  // goal*.xml O/U prices are Hong Kong odds. Decimal is always HK + 1.
  // Do not use a 1.50 threshold: e.g. raw 1.55 must normalize to 2.55, not 1.55.
  const out = 1 + n;
  return out > 1 && out < 100 ? Number(out.toFixed(4)) : null;
}

export function parseNowgoalOneXtwoTotals(fields = []) {
  const home = decimal(fields[6]);
  const draw = decimal(fields[7]);
  const away = decimal(fields[8]);
  const totalLine = number(fields[10]);
  const overOdds = hkToDecimal(fields[11]);
  const underOdds = hkToDecimal(fields[12]);
  const oneXtwo = home !== null && draw !== null && away !== null ? { home, draw, away } : null;
  const totals = totalLine !== null && overOdds !== null && underOdds !== null
    ? [{ line: totalLine, overOdds, underOdds }]
    : [];
  return { oneXtwo, totals };
}

function bookmakerSnapshot(definition, fields, observedAt) {
  if (!fields) return null;
  const markets = parseNowgoalOneXtwoTotals(fields);
  if (!markets.oneXtwo && !markets.totals.length) return null;
  return {
    name: definition.name,
    observedAt,
    markets: {
      oneXtwo: markets.oneXtwo,
      totals: markets.totals,
    },
  };
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, raw) => {
      const code = Number(raw);
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, raw) => {
      const code = parseInt(raw, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
    });
}

function htmlText(html = '') {
  return decodeEntities(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function statPair(text, label) {
  const match = String(text).match(new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*%?\\s*${label}\\s*(-?\\d+(?:\\.\\d+)?)\\s*%?`, 'i'));
  if (!match) return null;
  const home = number(match[1]);
  const away = number(match[2]);
  if (home === null || away === null || home < 0 || away < 0) return null;
  return { home, away };
}

export function parseNowgoalPossessionHtml(html = '') {
  const text = htmlText(html);
  if (!text) return null;
  const statsIndex = text.search(/\bStatistics\b/i);
  const after = statsIndex >= 0 ? text.slice(statsIndex) : text;
  const teamIndex = after.search(/\bTeam\s+Statistics\b/i);
  const scope = teamIndex > 0 ? after.slice(0, teamIndex) : after;
  return statPair(scope, 'Possession');
}

function cleanTeam(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\(\s*N\s*\)/ig, ' ');
}

const TEAM_ALIASES = Object.freeze({ utd: 'united', st: 'saint' });
const TEAM_STOP = new Set(['fc', 'cf', 'sc', 'afc', 'ac', 'fk', 'sk', 'club']);

function teamTokens(value = '') {
  return cleanTeam(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(token => TEAM_ALIASES[token] || token)
    .filter(token => !TEAM_STOP.has(token));
}

function compactTeam(value = '') { return teamTokens(value).join(''); }

export function nowgoalTeamScore(a, b) {
  const x = teamTokens(a), y = teamTokens(b);
  if (!x.length || !y.length) return 0;
  const xa = x.join(' '), ya = y.join(' ');
  if (xa === ya) return 1;
  if (compactTeam(a) === compactTeam(b)) return 0.995;
  if (xa.length >= 5 && ya.length >= 5 && (xa.includes(ya) || ya.includes(xa))) return 0.92;
  const xs = new Set(x), ys = new Set(y);
  let hit = 0;
  for (const token of xs) if (ys.has(token)) hit += 1;
  const dice = (2 * hit) / (xs.size + ys.size || 1);
  let prefix = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) break;
    prefix += 1;
  }
  return Math.min(0.98, dice + (prefix ? Math.min(0.08, prefix * 0.025) : 0));
}

function exactScore(queryScore, sourceScore) {
  if (!Array.isArray(queryScore) || !Array.isArray(sourceScore)) return null;
  const qh = number(queryScore[0]), qa = number(queryScore[1]);
  const sh = number(sourceScore[0]), sa = number(sourceScore[1]);
  if ([qh, qa, sh, sa].some(value => value === null)) return null;
  return qh === sh && qa === sa;
}

export function matchNowgoalLiveMatch(query = {}, roster = []) {
  if (exactScore(query.score, query.score) !== true) return { match: null, reason: 'SCORE_REQUIRED' };
  const candidates = [];
  for (const row of roster) {
    const homeScore = nowgoalTeamScore(query.home, row.home);
    const awayScore = nowgoalTeamScore(query.away, row.away);
    if (homeScore < MIN_TEAM_SCORE || awayScore < MIN_TEAM_SCORE) continue;
    const direct = (homeScore + awayScore) / 2;
    if (direct < MIN_PAIR_SCORE) continue;
    const reverse = (nowgoalTeamScore(query.home, row.away) + nowgoalTeamScore(query.away, row.home)) / 2;
    if (reverse >= direct - 0.02) continue;
    if (exactScore(query.score, row.score) !== true) continue;
    candidates.push({ row, confidence: direct + 0.08, homeScore, awayScore });
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0], second = candidates[1];
  if (!best) return { match: null, reason: 'NO_CANDIDATE' };
  if (second && best.confidence - second.confidence < MIN_MARGIN) return { match: null, reason: 'AMBIGUOUS' };
  return {
    match: best.row,
    reason: 'MATCHED',
    confidence: best.confidence,
    homeScore: best.homeScore,
    awayScore: best.awayScore,
  };
}

export function nowgoalConfig(env = {}) {
  const timeoutRaw = Number(env.MARKET_PROVIDER_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1_000, Math.min(12_000, timeoutRaw)) : 6_000;
  return { base: BASE, timeoutMs, bookmakers: CORE_BOOKMAKERS.map(item => item.name) };
}

async function openMarketSession(env = {}, fetchImpl = fetch, observedAt = Date.now()) {
  const config = nowgoalConfig(env);
  const homepage = await requestText(fetchImpl, '/', config.timeoutMs, '', 'text/html,*/*');
  if (!homepage.cookie) {
    const error = new Error('nowgoal_session_cookie_missing');
    error.code = 'nowgoal_session_cookie_missing';
    throw error;
  }

  const [rosterResponse, ...bookmakerResponses] = await Promise.all([
    requestText(fetchImpl, `/gf/data/bf_en-idn1.js?${observedAt}`, config.timeoutMs, homepage.cookie, 'application/javascript,text/javascript,*/*'),
    ...CORE_BOOKMAKERS.map(definition => requestText(
      fetchImpl,
      `/gf/data/odds/en/goal${definition.companyId}.xml?${observedAt}`,
      config.timeoutMs,
      homepage.cookie,
      'application/xml,text/xml,*/*',
    )),
  ]);

  const roster = parseNowgoalRoster(rosterResponse.text).filter(row => Number.isFinite(row.state) && row.state > 0 && row.home && row.away);
  const rowsByBookmaker = CORE_BOOKMAKERS.map((definition, index) => ({
    definition,
    rows: parseNowgoalGoalRows(bookmakerResponses[index]?.text || ''),
  }));
  return { config, cookie: homepage.cookie, roster, rowsByBookmaker, observedAt };
}

function rawMatch(row, rowsByBookmaker, observedAt, minute = null) {
  const bookmakers = rowsByBookmaker
    .map(({ definition, rows }) => bookmakerSnapshot(definition, rows.get(row.id), observedAt))
    .filter(Boolean);
  return {
    id: row.id,
    matchKey: `nowgoal:${row.id}`,
    home: row.home,
    away: row.away,
    minute: number(minute),
    score: row.score,
    observedAt,
    bookmakers,
  };
}

export async function fetchNowgoalCandidate(env = {}, query = {}, fetchImpl = fetch, observedAt = Date.now()) {
  const session = await openMarketSession(env, fetchImpl, observedAt);
  const picked = matchNowgoalLiveMatch(query, session.roster);
  if (!picked.match) {
    return {
      ok: false,
      provider: 'Nowgoal',
      observedAt,
      error: `nowgoal_candidate_${String(picked.reason || 'not_matched').toLowerCase()}`,
      matchReason: picked.reason || null,
      liveMatches: session.roster.length,
    };
  }

  const match = rawMatch(picked.match, session.rowsByBookmaker, observedAt, query.minute);
  let possession = null;
  let possessionError = null;
  try {
    const detail = await requestText(
      fetchImpl,
      `/match/live-${encodeURIComponent(picked.match.id)}?_=${observedAt}`,
      session.config.timeoutMs,
      session.cookie,
      'text/html,*/*',
    );
    possession = parseNowgoalPossessionHtml(detail.text);
  } catch (error) {
    possessionError = String(error?.code || error?.message || error || 'nowgoal_possession_failed');
  }

  return {
    ok: true,
    provider: 'Nowgoal',
    observedAt,
    match,
    possession,
    sourceDiagnostics: {
      liveMatches: session.roster.length,
      sourceMatchId: picked.match.id,
      matchConfidence: picked.confidence,
      possessionAvailable: Boolean(possession),
      possessionError,
      bookmakers: match.bookmakers.map(book => book.name),
      unavailableStatistics: ['shotOnTarget', 'shotOff'],
    },
  };
}

export async function fetchNowgoalPayload(env = {}, fetchImpl = fetch, observedAt = Date.now()) {
  const session = await openMarketSession(env, fetchImpl, observedAt);
  if (!session.roster.length) {
    return {
      provider: 'Nowgoal',
      observedAt,
      matches: [],
      sourceDiagnostics: { liveMatches: 0, referees: CORE_BOOKMAKERS.length, usableMatches: 0 },
    };
  }

  const matches = session.roster
    .map(row => rawMatch(row, session.rowsByBookmaker, observedAt))
    .filter(match => match.bookmakers.length > 0);

  return {
    provider: 'Nowgoal',
    observedAt,
    matches,
    sourceDiagnostics: {
      liveMatches: session.roster.length,
      referees: CORE_BOOKMAKERS.length,
      usableMatches: matches.length,
      bookmakerNames: CORE_BOOKMAKERS.map(item => item.name),
      markets: ['1X2', 'OVER_UNDER'],
      candidateStatistics: ['POSSESSION'],
      unavailableCandidateStatistics: ['SOT', 'SHOT_OFF'],
      asianHandicap: false,
    },
  };
}

export const NOWGOAL_MARKET_BOOKMAKERS = CORE_BOOKMAKERS;