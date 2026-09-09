const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const NOMAD_FEED = 'https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
const VERSION = 'shot-sidecar-342-v1';
const PROVIDER = '5DollarFootballAPI';
const PROVIDER_CACHE_MS = 20 * 60 * 1000;
const NOMAD_CACHE_MS = 15 * 1000;
const PROVIDER_TIMEOUT_MS = 8000;
const NOMAD_TIMEOUT_MS = 8000;
const PROVIDER_PAGE_SIZE = 50;

let providerCache = { at: 0, fixtures: [], error: null };
let nomadCache = { at: 0, matches: [], error: null };
const mappingLocks = new Map();
const histories = new Map();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control':'no-store',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'content-type':'application/json; charset=utf-8' },
});
const now = () => Date.now();
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token && !new Set(['fc','cf','afc','sc','fk','club']).has(token))
    .map(token => ({ utd:'united', ath:'athletic', dep:'deportivo' }[token] ?? token))
    .join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length:b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenJaccard(a, b) {
  const aa = new Set(a.split(' ').filter(Boolean));
  const bb = new Set(b.split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection++;
  return intersection / (aa.size + bb.size - intersection);
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  if (short.length >= 3 && long.startsWith(short)) return Math.min(0.92, 0.76 + short.length / Math.max(20, long.length * 5));
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

function fuzzyTokenScore(a, b) {
  const aa = a.split(' ').filter(Boolean);
  const bb = b.split(' ').filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const directional = (from, to) => from.reduce((sum, token) => {
    let best = 0;
    for (const candidate of to) best = Math.max(best, tokenSimilarity(token, candidate));
    return sum + best;
  }, 0) / from.length;
  return Math.min(directional(aa, bb), directional(bb, aa));
}

function nameScore(left, right) {
  const a = normalizeName(left), b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 0.99;
  let score = Math.max(tokenJaccard(a, b), fuzzyTokenScore(a, b));
  if (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))) score = Math.max(score, 0.93);
  return Math.max(score, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

function fixtureTeams(fixture) {
  return {
    home: fixture?.teams?.home?.name ?? fixture?.home_team?.name ?? fixture?.home?.name ?? fixture?.home_name ?? '',
    away: fixture?.teams?.away?.name ?? fixture?.away_team?.name ?? fixture?.away?.name ?? fixture?.away_name ?? '',
  };
}
function fixtureLeague(fixture) { return fixture?.league?.name ?? fixture?.competition?.name ?? fixture?.league_name ?? ''; }
function fixtureId(fixture) { return fixture?.id ?? fixture?.fixture_id ?? fixture?.fixture?.id ?? null; }
function fixtureGoals(fixture) { return fixture?.goals ?? fixture?.score ?? null; }
function fixtureMinute(fixture) {
  const values = [fixture?.minute, fixture?.elapsed, fixture?.status?.minute, fixture?.status?.elapsed, fixture?.timer?.minute, fixture?.timer?.elapsed];
  for (const value of values) if (finite(value)) return Number(value);
  return null;
}

function strictMappingScore(target, fixture) {
  const teams = fixtureTeams(fixture);
  const home = nameScore(target?.home, teams.home);
  const away = nameScore(target?.away, teams.away);
  if (home < 0.82 || away < 0.82) return null;

  let score = (home + away) / 2;
  const leagueTarget = normalizeName(target?.league);
  const leagueFixture = normalizeName(fixtureLeague(fixture));
  const league = leagueTarget && leagueFixture ? nameScore(leagueTarget, leagueFixture) : null;
  if (league !== null) {
    if (league < 0.58) return null;
    score = Math.min(1, score * 0.90 + league * 0.10);
  }

  const suppliedScore = target?.score;
  const goals = fixtureGoals(fixture);
  if (finite(suppliedScore?.home) && finite(suppliedScore?.away) && finite(goals?.home) && finite(goals?.away)) {
    const diff = Math.abs(Number(suppliedScore.home) - Number(goals.home)) + Math.abs(Number(suppliedScore.away) - Number(goals.away));
    if (diff === 0) score = Math.min(1, score + 0.02);
    else if (diff >= 3) return null;
    else score -= 0.01 * diff;
  }

  const targetMinute = number(target?.minute);
  const providerMinute = fixtureMinute(fixture);
  if (targetMinute !== null && providerMinute !== null) {
    const diff = Math.abs(targetMinute - providerMinute);
    if (diff <= 8) score = Math.min(1, score + 0.01);
    else if (diff > 20) score -= 0.03;
  }

  return { score, home, away, league, providerMinute };
}

function mapFixture(target, fixtures) {
  const locked = mappingLocks.get(String(target.id));
  if (locked) {
    const fixture = fixtures.find(item => String(fixtureId(item)) === String(locked.fixtureId));
    if (fixture) return { fixture, locked:true, confidence:locked.confidence, reason:null };
    mappingLocks.delete(String(target.id));
  }

  const candidates = [];
  for (const fixture of fixtures) {
    const scored = strictMappingScore(target, fixture);
    if (!scored) continue;
    candidates.push({ fixture, ...scored });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  if (!best || best.score < 0.88) return { fixture:null, reason:'not_found_or_not_covered', candidates:candidates.length };
  const second = candidates[1] ?? null;
  if (second && best.score - second.score < 0.05) {
    return { fixture:null, reason:'ambiguous_live_match', candidates:candidates.length, bestScore:best.score, secondScore:second.score };
  }
  const id = fixtureId(best.fixture);
  if (id == null) return { fixture:null, reason:'fixture_id_missing', candidates:candidates.length };
  const confidence = Number(best.score.toFixed(4));
  mappingLocks.set(String(target.id), { fixtureId:String(id), confidence, lockedAt:now() });
  return { fixture:best.fixture, locked:false, confidence, reason:null, homeScore:best.home, awayScore:best.away, leagueScore:best.league };
}

function extractFixtures(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}

async function fetchJson(url, { timeoutMs, headers = {}, label = 'upstream' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 8000);
  try {
    const response = await fetch(url, { cache:'no-store', signal:controller.signal, headers });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${label}:HTTP_${response.status}`);
    if (!payload || typeof payload !== 'object') throw new Error(`${label}:INVALID_JSON`);
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label}:TIMEOUT`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function providerFixtures(env, force = false) {
  const timestamp = now();
  if (!force && providerCache.at && timestamp - providerCache.at < PROVIDER_CACHE_MS) return { ...providerCache, cacheHit:true };
  if (!env.FIVEDOLLAR_API_KEY) throw new Error('provider:FIVEDOLLAR_API_KEY_MISSING');
  const path = `/fixtures?status=live&include=stats&per_page=${PROVIDER_PAGE_SIZE}&page=1`;
  try {
    const payload = await fetchJson(`${API_BASE}${path}`, {
      timeoutMs:PROVIDER_TIMEOUT_MS,
      label:'provider',
      headers:{ accept:'application/json', authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}` },
    });
    const fixtures = extractFixtures(payload);
    providerCache = { at:now(), fixtures, error:null };
    return { ...providerCache, cacheHit:false };
  } catch (error) {
    providerCache = { ...providerCache, error:String(error?.message || error) };
    throw error;
  }
}

async function nomadMatches(force = false) {
  const timestamp = now();
  if (!force && nomadCache.at && timestamp - nomadCache.at < NOMAD_CACHE_MS) return { ...nomadCache, cacheHit:true };
  try {
    const payload = await fetchJson(`${NOMAD_FEED}?shot_sidecar=${timestamp}`, {
      timeoutMs:NOMAD_TIMEOUT_MS,
      label:'nomad',
      headers:{ accept:'application/json' },
    });
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    nomadCache = { at:now(), matches, error:null };
    return { ...nomadCache, cacheHit:false };
  } catch (error) {
    nomadCache = { ...nomadCache, error:String(error?.message || error) };
    throw error;
  }
}

function pair(source) {
  return { home:number(source?.home), away:number(source?.away) };
}
function statsFromFixture(fixture) {
  const root = fixture?.statistics ?? fixture?.stats ?? fixture?.live_statistics ?? null;
  if (!root || typeof root !== 'object') return null;
  const sot = pair(root.shots_on_target ?? root.shotsOnTarget ?? root.sot);
  const off = pair(root.shots_off_target ?? root.shotsOffTarget ?? root.off);
  const available = [sot.home, sot.away, off.home, off.away].some(value => value !== null);
  return available ? { shotOnTarget:sot, shotOffTarget:off } : null;
}

function bucketForMinute(minute) {
  if (!finite(minute)) return null;
  const m = Number(minute);
  if (m >= 80) return 80;
  if (m >= 60) return 60;
  if (m >= 40) return 40;
  if (m >= 20) return 20;
  return 0;
}

function rememberSnapshot(nomad, fixture, mapping, stats, observedAt) {
  const key = String(nomad.id);
  const bucket = bucketForMinute(nomad.minute);
  let rows = histories.get(key) || [];
  const next = {
    bucket,
    matchMinuteObserved:number(nomad.minute),
    observedAt,
    providerFixtureId:String(fixtureId(fixture)),
    shotOnTarget:stats.shotOnTarget,
    shotOffTarget:stats.shotOffTarget,
    mappingConfidence:mapping.confidence ?? null,
  };
  const last = rows[rows.length - 1];
  if (!last || last.bucket !== bucket || last.providerFixtureId !== next.providerFixtureId) rows = [...rows, next];
  else rows = [...rows.slice(0, -1), next];
  rows = rows.slice(-6);
  histories.set(key, rows);
  return rows;
}

function safeDelta(current, previous) {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  return delta >= 0 ? delta : null;
}
function rolling20(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const a = rows[rows.length - 2], b = rows[rows.length - 1];
  if (a.providerFixtureId !== b.providerFixtureId) return null;
  return {
    fromMinute:a.matchMinuteObserved,
    toMinute:b.matchMinuteObserved,
    shotOnTarget:{ home:safeDelta(b.shotOnTarget.home, a.shotOnTarget.home), away:safeDelta(b.shotOnTarget.away, a.shotOnTarget.away) },
    shotOffTarget:{ home:safeDelta(b.shotOffTarget.home, a.shotOffTarget.home), away:safeDelta(b.shotOffTarget.away, a.shotOffTarget.away) },
  };
}

function cleanup(activeIds) {
  for (const key of mappingLocks.keys()) if (!activeIds.has(key)) mappingLocks.delete(key);
  for (const key of histories.keys()) if (!activeIds.has(key)) histories.delete(key);
}

async function buildSnapshot(env, forceProvider = false) {
  const observedAt = now();
  const [nomad, provider] = await Promise.all([nomadMatches(), providerFixtures(env, forceProvider)]);
  const activeIds = new Set(nomad.matches.map(match => String(match.id)));
  cleanup(activeIds);

  const results = [];
  let matched = 0, statsReady = 0, ambiguous = 0, notCovered = 0;
  for (const match of nomad.matches) {
    const target = {
      id:String(match.id), home:match.home, away:match.away, league:match.league,
      minute:number(match.minute), score:{ home:number(match.score?.[0]), away:number(match.score?.[1]) },
    };
    const mapping = mapFixture(target, provider.fixtures);
    if (!mapping.fixture) {
      if (mapping.reason === 'ambiguous_live_match') ambiguous++;
      else notCovered++;
      results.push({ nomadMatchId:target.id, home:target.home, away:target.away, status:mapping.reason === 'ambiguous_live_match' ? 'AMBIGUOUS' : 'NOT_COVERED_OR_NOT_FOUND', mapping:{ reason:mapping.reason, candidates:mapping.candidates ?? 0 } });
      continue;
    }
    matched++;
    const stats = statsFromFixture(mapping.fixture);
    const providerFixtureId = String(fixtureId(mapping.fixture));
    if (!stats) {
      results.push({ nomadMatchId:target.id, providerFixtureId, home:target.home, away:target.away, status:'STATS_UNAVAILABLE', mapping:{ confidence:mapping.confidence ?? null, locked:Boolean(mapping.locked) } });
      continue;
    }
    statsReady++;
    const rows = rememberSnapshot(match, mapping.fixture, mapping, stats, observedAt);
    results.push({
      nomadMatchId:target.id,
      providerFixtureId,
      home:target.home,
      away:target.away,
      league:target.league,
      minute:target.minute,
      status:'MATCHED',
      source:PROVIDER,
      displayOnly:true,
      detectorConnected:false,
      futureDetectorPort:'READY',
      mapping:{ confidence:mapping.confidence ?? null, locked:Boolean(mapping.locked) },
      shotOnTarget:stats.shotOnTarget,
      shotOffTarget:stats.shotOffTarget,
      rolling20:rolling20(rows),
      snapshot:{ bucket:bucketForMinute(target.minute), matchMinuteObserved:target.minute, observedAt },
    });
  }

  return {
    ok:true,
    version:VERSION,
    mode:'DISPLAY_ONLY',
    detectorConnected:false,
    futureDetectorPort:'READY',
    rollingWindowMinutes:20,
    provider:{ name:PROVIDER, pageSize:PROVIDER_PAGE_SIZE, onePageOnly:true, cacheHit:provider.cacheHit, cacheAgeSeconds:Math.max(0,(now()-provider.at)/1000) },
    nomad:{ source:'3.42 live-score-feed-v3', cacheHit:nomad.cacheHit },
    counts:{ nomadLive:nomad.matches.length, providerLive:provider.fixtures.length, matched, statsReady, ambiguous, notCovered },
    observedAt,
    results,
  };
}

async function probeUpstreams(env) {
  const result = {
    ok:false,
    version:VERSION,
    mode:'DISPLAY_ONLY',
    detectorConnected:false,
    futureDetectorPort:'READY',
    nomad:{ ok:false, count:0, error:null },
    provider:{ ok:false, count:0, error:null },
  };
  try {
    const nomad = await nomadMatches(true);
    result.nomad = { ok:true, count:nomad.matches.length, error:null };
  } catch (error) {
    result.nomad.error = String(error?.message || error);
  }
  try {
    const provider = await providerFixtures(env, true);
    result.provider = { ok:true, count:provider.fixtures.length, error:null };
  } catch (error) {
    result.provider.error = String(error?.message || error);
  }
  result.ok = result.nomad.ok && result.provider.ok;
  return result;
}

function health() {
  return {
    ok:true,
    version:VERSION,
    mode:'DISPLAY_ONLY',
    detectorConnected:false,
    futureDetectorPort:'READY',
    rollingWindowMinutes:20,
    providerCache:{ ageSeconds:providerCache.at ? Math.max(0,(now()-providerCache.at)/1000) : null, count:providerCache.fixtures.length, lastError:providerCache.error },
    nomadCache:{ ageSeconds:nomadCache.at ? Math.max(0,(now()-nomadCache.at)/1000) : null, count:nomadCache.matches.length, lastError:nomadCache.error },
    locks:mappingLocks.size,
    histories:histories.size,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{ status:204, headers:cors });
    if (request.method !== 'GET') return json({ ok:false, error:'method_not_allowed' },405);
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return json(health());
    if (url.pathname === '/probe') return json(await probeUpstreams(env));
    if (url.pathname === '/snapshot' || url.pathname === '/status') {
      try {
        const snapshot = await buildSnapshot(env, url.searchParams.get('force') === '1');
        if (url.pathname === '/status') {
          const { results, ...summary } = snapshot;
          return json(summary);
        }
        return json(snapshot);
      } catch (error) {
        return json({
          ok:false,
          version:VERSION,
          mode:'DISPLAY_ONLY',
          detectorConnected:false,
          futureDetectorPort:'READY',
          error:String(error?.message || error),
          counts:{ nomadLive:nomadCache.matches.length, providerLive:providerCache.fixtures.length, matched:0, statsReady:0, ambiguous:0, notCovered:0 },
          results:[],
        },200);
      }
    }
    return json({ ok:false, error:'not_found' },404);
  },
};