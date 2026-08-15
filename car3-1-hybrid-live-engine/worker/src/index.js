const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

const GOALOO_INDEX = 'https://live10.goaloo28.com/gf/data/bf_us.js';
const GOALOO_INDEX_ALT = 'https://live10.goaloo28.com/gf/data/bf_us1.js';
const GOALOO_MATCH_BASE = 'https://live10.goaloo28.com/match/live-';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function cleanText(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

function pairFromText(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?%?)\\s+${escaped}\\s+(\\d+(?:\\.\\d+)?%?)(?:\\s|$)`, 'i'),
    new RegExp(`${escaped}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?%?)\\s*[-–:]\\s*(\\d+(?:\\.\\d+)?%?)`, 'i')
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return { home: number(match[1]), away: number(match[2]) };
  }
  return { home: null, away: null };
}

function titleTeams(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const text = cleanText(title);
  const match = text.match(/^(.+?)\s+vs\s+(.+?)\s+(?:Live|Livescore|Live Score|Live Scores|Football|Soccer)/i);
  return match ? { home: match[1].trim(), away: match[2].trim() } : { home: '', away: '' };
}

function coreStatsComplete(stats) {
  return ['possession','attacks','dangerous_attacks','shots','shots_on_target','corners']
    .every(key => stats[key]?.home !== null && stats[key]?.away !== null);
}

function splitJsArray(body) {
  const values = [];
  let token = '';
  let quote = null;
  let escape = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (escape) { token += ch; escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === quote) { quote = null; continue; }
      token += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === ',') { values.push(jsScalar(token)); token = ''; continue; }
    token += ch;
  }
  values.push(jsScalar(token));
  return values;
}

function jsScalar(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === 'null' || value === 'undefined') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return value;
}

function parseIndexedArrays(source, variable) {
  const out = new Map();
  const re = new RegExp(`${variable}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`, 'g');
  for (const match of source.matchAll(re)) out.set(Number(match[1]), splitJsArray(match[2]));
  return out;
}

function parseGoalooIndex(source) {
  const A = parseIndexedArrays(source, 'A');
  const B = parseIndexedArrays(source, 'B');
  const all = [];
  for (const [index, row] of A.entries()) {
    const stateCode = number(row[8]);
    if (stateCode === null) continue;
    const leagueRow = B.get(number(row[1])) || [];
    const start = String(row[6] ?? '');
    const clock = String(row[7] ?? '');
    let minute = null;
    if (stateCode === 2) minute = 45;
    else if (stateCode > 0) {
      const startMs = Date.parse(start.replace(' ', 'T') + 'Z');
      const clockMs = Date.parse(clock.replace(' ', 'T') + 'Z');
      if (Number.isFinite(startMs) && Number.isFinite(clockMs) && clockMs >= startMs) minute = Math.max(1, Math.min(120, Math.round((clockMs - startMs) / 60000)));
    }
    all.push({
      index,
      id: String(row[0]),
      leagueIndex: number(row[1]),
      leagueId: leagueRow[0] ?? null,
      league: String(leagueRow[2] ?? 'Goaloo Live'),
      homeId: row[2] ?? null,
      awayId: row[3] ?? null,
      home: String(row[4] ?? ''),
      away: String(row[5] ?? ''),
      kickoff: start || null,
      clock: clock || null,
      stateCode,
      status: stateCode === 2 ? 'HT' : stateCode > 0 ? 'LIVE' : stateCode === -1 ? 'FT' : 'SCHEDULED',
      minute,
      score: { home: number(row[9]) ?? 0, away: number(row[10]) ?? 0 },
      halfScore: { home: number(row[11]), away: number(row[12]) },
      redCards: { home: number(row[13]) ?? 0, away: number(row[14]) ?? 0 },
      yellowCards: { home: number(row[15]) ?? 0, away: number(row[16]) ?? 0 },
      rank: { home: row[17] ?? null, away: row[18] ?? null },
      ahLine: number(row[21]),
      overUnderLine: number(row[25]),
      corner: { home: number(row[27]), away: number(row[28]) }
    });
  }
  const live = all.filter(match => match.stateCode > 0);
  return { all, live, matchcount: A.size, leagueCount: B.size };
}

function parseGoalooMatch(seed, html, url, collectedAt) {
  const text = cleanText(html);
  const title = titleTeams(html);
  const stats = {
    possession: pairFromText(text, 'Possession'),
    attacks: pairFromText(text, 'Attack'),
    dangerous_attacks: (() => {
      const exact = pairFromText(text, 'Dangerous Attack');
      return exact.home === null ? pairFromText(text, 'Dangerous attack') : exact;
    })(),
    shots: pairFromText(text, 'Shots'),
    shots_on_target: pairFromText(text, 'Shots On Goal'),
    corners: pairFromText(text, 'Corner Kicks'),
    yellow_cards: pairFromText(text, 'Yellow Cards'),
    red_cards: pairFromText(text, 'Red Cards')
  };
  if (stats.corners.home === null && seed.corner.home !== null) stats.corners = seed.corner;
  if (stats.red_cards.home === null) stats.red_cards = seed.redCards;
  if (stats.yellow_cards.home === null) stats.yellow_cards = seed.yellowCards;
  const complete = coreStatsComplete(stats);
  return {
    source: 'GOALOO',
    sourceMatchId: seed.id,
    canonicalMatchId: `goaloo:${seed.id}`,
    sourceUrl: url,
    league: seed.league,
    leagueId: seed.leagueId,
    home: title.home || seed.home,
    away: title.away || seed.away,
    kickoffUtc: seed.kickoff,
    minute: seed.minute,
    status: seed.status,
    score: seed.score,
    stats,
    odds: {
      oneXtwo: null,
      asianHandicap: seed.ahLine === null ? null : { line: seed.ahLine, home: null, away: null },
      overUnder: seed.overUnderLine === null ? null : { line: seed.overUnderLine, over: null, under: null },
      rawAvailable: /Live Odds/i.test(text)
    },
    coreStatsComplete: complete,
    collectedAt,
    sourceFreshnessSeconds: 0,
    parseVersion: 2,
    warnings: [
      ...(complete ? [] : ['CORE_STATS_INCOMPLETE']),
      ...(!title.home || !title.away ? ['DETAIL_TITLE_FALLBACK_TO_INDEX'] : []),
      ...(seed.minute === null ? ['MINUTE_CLOCK_INCOMPLETE'] : [])
    ]
  };
}

async function fetchText(url, ttl = 20) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'NOMADTIPS3-CAR3.1-Shadow/1.0 (+public research monitor)',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.8'
    },
    cf: { cacheTtl: ttl, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.text();
}

async function discoverGoaloo() {
  const errors = [];
  for (const url of [GOALOO_INDEX, GOALOO_INDEX_ALT]) {
    try {
      const source = await fetchText(`${url}?t=${Math.floor(Date.now()/30000)}`, 5);
      const parsed = parseGoalooIndex(source);
      if (parsed.live.length || parsed.all.length) return { ...parsed, discoveryUrl: url, errors };
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  return { all: [], live: [], matchcount: 0, leagueCount: 0, discoveryUrl: null, errors };
}

async function mapWithConcurrency(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { output[index] = await fn(items[index], index); }
      catch (error) { output[index] = { error: String(error?.message || error), item: items[index] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, runner));
  return output;
}

export class Car31State {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/scan' && request.method === 'POST') return this.scan('manual');
    if (url.pathname === '/health') return json(await this.health());
    if (url.pathname === '/live') return json(await this.live());
    if (url.pathname === '/snapshots') return json({ ok: true, snapshots: await this.state.storage.get('snapshots') || [] });
    return json({ ok: true, engine: 'CAR 3.1', mode: 'SHADOW', routes: ['/health','/live','/snapshots','POST /scan'] });
  }

  async health() {
    const health = await this.state.storage.get('health') || {};
    const latest = await this.state.storage.get('latest') || { matches: [] };
    return {
      ok: true,
      engine: 'CAR 3.1 HYBRID LIVE ENGINE',
      mode: 'SHADOW',
      sourceMode: 'GOALOO_ONLY',
      apiFootball: 'OFF',
      fallback: 'OFF',
      cron: 'EVERY_MINUTE',
      lastCycle: health.lastCycle || null,
      lastSuccess: health.lastSuccess || null,
      lastError: health.lastError || null,
      cycleMs: health.cycleMs || null,
      indexMatches: health.indexMatches || 0,
      discovered: health.discovered || 0,
      fetched: health.fetched || 0,
      liveMatches: latest.matches?.length || 0,
      coreStatsReady: latest.matches?.filter(m => m.coreStatsComplete).length || 0,
      sourceUrl: health.sourceUrl || null
    };
  }

  async live() {
    const latest = await this.state.storage.get('latest') || { generatedAt: null, matches: [] };
    const now = Date.now();
    return {
      ok: true,
      ...latest,
      matches: (latest.matches || []).map(match => ({
        ...match,
        sourceFreshnessSeconds: match.collectedAt ? Math.max(0, Math.round((now - Date.parse(match.collectedAt)) / 1000)) : null
      }))
    };
  }

  async scan(trigger = 'cron') {
    const started = Date.now();
    const collectedAt = new Date().toISOString();
    const maxMatches = Math.max(1, Math.min(50, Number(this.env.MAX_MATCHES_PER_CYCLE || 24)));
    const concurrency = Math.max(1, Math.min(6, Number(this.env.FETCH_CONCURRENCY || 3)));
    try {
      const discovery = await discoverGoaloo();
      const seeds = discovery.live.slice(0, maxMatches);
      const fetched = await mapWithConcurrency(seeds, concurrency, async seed => {
        const target = `${GOALOO_MATCH_BASE}${seed.id}`;
        try {
          const html = await fetchText(target, 15);
          return parseGoalooMatch(seed, html, target, collectedAt);
        } catch (error) {
          return {
            source: 'GOALOO', sourceMatchId: seed.id, canonicalMatchId: `goaloo:${seed.id}`, sourceUrl: target,
            league: seed.league, leagueId: seed.leagueId, home: seed.home, away: seed.away, kickoffUtc: seed.kickoff,
            minute: seed.minute, status: seed.status, score: seed.score,
            stats: { possession:{home:null,away:null}, attacks:{home:null,away:null}, dangerous_attacks:{home:null,away:null}, shots:{home:null,away:null}, shots_on_target:{home:null,away:null}, corners:seed.corner, red_cards:seed.redCards, yellow_cards:seed.yellowCards },
            odds: { oneXtwo:null, asianHandicap:seed.ahLine===null?null:{line:seed.ahLine,home:null,away:null}, overUnder:seed.overUnderLine===null?null:{line:seed.overUnderLine,over:null,under:null} },
            coreStatsComplete:false, collectedAt, sourceFreshnessSeconds:0, parseVersion:2,
            warnings:[`DETAIL_FETCH_FAILED:${String(error?.message || error)}`]
          };
        }
      });
      const matches = fetched.filter(Boolean);
      const latest = {
        generatedAt: collectedAt,
        trigger,
        source: 'GOALOO',
        sourceMode: 'GOALOO_ONLY',
        discoveryUrl: discovery.discoveryUrl,
        indexMatchCount: discovery.matchcount,
        discoveredLive: discovery.live.length,
        matches,
        rawMatchCount: matches.length,
        errors: discovery.errors.slice(0, 12)
      };
      await this.state.storage.put('latest', latest);
      const previousSnapshots = await this.state.storage.get('snapshots') || [];
      previousSnapshots.push({ at: collectedAt, matches: matches.map(m => ({ id:m.sourceMatchId, minute:m.minute, score:m.score, stats:m.stats })) });
      while (previousSnapshots.length > 120) previousSnapshots.shift();
      await this.state.storage.put('snapshots', previousSnapshots);
      await this.state.storage.put('health', {
        lastCycle: collectedAt,
        lastSuccess: collectedAt,
        lastError: latest.errors.length ? latest.errors.join(' | ') : null,
        cycleMs: Date.now() - started,
        indexMatches: discovery.matchcount,
        discovered: discovery.live.length,
        fetched: matches.length,
        sourceUrl: discovery.discoveryUrl
      });
      return json({ ok:true, ...latest, cycleMs:Date.now()-started });
    } catch (error) {
      const message = String(error?.message || error);
      const oldHealth = await this.state.storage.get('health') || {};
      await this.state.storage.put('health', { ...oldHealth, lastCycle:collectedAt, lastError:message, cycleMs:Date.now()-started });
      return json({ ok:false, error:message, generatedAt:collectedAt }, 502);
    }
  }
}

function stateStub(env) {
  const id = env.CAR31_STATE.idFromName('car31-global-shadow');
  return env.CAR31_STATE.get(id);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:JSON_HEADERS });
    return stateStub(env).fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stateStub(env).fetch('https://car31.internal/scan', { method:'POST' }));
  }
};
