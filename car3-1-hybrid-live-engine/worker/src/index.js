const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

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
  const n = Number(String(value ?? '').replace('%', '').trim());
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

function extractLeague(html, pageText) {
  const meta = (html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i) || [])[1];
  if (meta) {
    const m = cleanText(meta).match(/(?:in|for)\s+([^,.|]+?)(?:\s+on\s+|,|\.|$)/i);
    if (m) return m[1].trim();
  }
  const beforeOdds = pageText.split(/Live Odds|Match Timeline|Match Stats|Tech Statistics/i)[0] || '';
  const snippets = beforeOdds.split(/\s{2,}|\|/).map(s => s.trim()).filter(Boolean);
  return snippets.find(s => s.length > 3 && s.length < 80 && !/goaloo|live|football|soccer|score|home|away/i.test(s)) || 'Goaloo Live';
}

function extractMinuteAndScore(text) {
  const liveRows = [...text.matchAll(/(?:^|\s)(\d{1,3})['′]\s+(\d+)\s*[-–]\s*(\d+)(?:\s|$)/g)];
  if (liveRows.length) {
    const row = liveRows[liveRows.length - 1];
    return { minute: Number(row[1]), score: { home: Number(row[2]), away: Number(row[3]) }, status: 'LIVE' };
  }
  const ht = text.match(/(?:^|\s)HT\s+(\d+)\s*[-–]\s*(\d+)/i);
  if (ht) return { minute: 45, score: { home: Number(ht[1]), away: Number(ht[2]) }, status: 'HT' };
  const ft = text.match(/(?:^|\s)FT\s+(\d+)\s*[-–]\s*(\d+)/i);
  if (ft) return { minute: 90, score: { home: Number(ft[1]), away: Number(ft[2]) }, status: 'FT' };
  return { minute: null, score: { home: null, away: null }, status: /\bLive\b/i.test(text) ? 'LIVE' : 'UNKNOWN' };
}

function discoverIds(html) {
  const ids = [];
  const seen = new Set();
  for (const match of html.matchAll(/(?:live-|\/live\/|match\/live-)(\d{5,})/gi)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      ids.push(match[1]);
    }
  }
  return ids;
}

function coreStatsComplete(stats) {
  return ['possession','attacks','dangerous_attacks','shots','shots_on_target','corners']
    .every(key => stats[key]?.home !== null && stats[key]?.away !== null);
}

function parseGoalooMatch(id, html, url, collectedAt) {
  const text = cleanText(html);
  const teams = titleTeams(html);
  const state = extractMinuteAndScore(text);
  const stats = {
    possession: pairFromText(text, 'Possession'),
    attacks: pairFromText(text, 'Attack'),
    dangerous_attacks: (() => {
      const a = pairFromText(text, 'Dangerous Attack');
      return a.home === null ? pairFromText(text, 'Dangerous attack') : a;
    })(),
    shots: pairFromText(text, 'Shots'),
    shots_on_target: pairFromText(text, 'Shots On Goal'),
    corners: pairFromText(text, 'Corner Kicks'),
    yellow_cards: pairFromText(text, 'Yellow Cards'),
    red_cards: pairFromText(text, 'Red Cards')
  };
  const complete = coreStatsComplete(stats);
  return {
    source: 'GOALOO',
    sourceMatchId: String(id),
    canonicalMatchId: `goaloo:${id}`,
    sourceUrl: url,
    league: extractLeague(html, text),
    home: teams.home || `Goaloo Home ${id}`,
    away: teams.away || `Goaloo Away ${id}`,
    minute: state.minute,
    status: state.status,
    score: state.score,
    stats,
    odds: { oneXtwo: null, asianHandicap: null, overUnder: null, rawAvailable: /Live Odds/i.test(text) },
    coreStatsComplete: complete,
    collectedAt,
    sourceFreshnessSeconds: 0,
    parseVersion: 1,
    warnings: [
      ...(teams.home && teams.away ? [] : ['TEAM_PARSE_INCOMPLETE']),
      ...(state.minute !== null || state.status === 'HT' || state.status === 'FT' ? [] : ['MINUTE_PARSE_INCOMPLETE']),
      ...(complete ? [] : ['CORE_STATS_INCOMPLETE'])
    ]
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'NOMADTIPS3-CAR3.1-Shadow/1.0 (+public research monitor)',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.8'
    },
    cf: { cacheTtl: 20, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.text();
}

async function discoverGoaloo(env) {
  const sources = [env.GOALOO_MOBILE || 'https://m.goaloo.com/', env.GOALOO_HOME || 'https://www.goaloo.com/'];
  const errors = [];
  const ids = [];
  const seen = new Set();
  for (const url of sources) {
    try {
      const html = await fetchText(url);
      for (const id of discoverIds(html)) {
        if (!seen.has(id)) { seen.add(id); ids.push(id); }
      }
      if (ids.length) return { ids, discoveryUrl: url, errors };
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  return { ids, discoveryUrl: null, errors };
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
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/scan' && request.method === 'POST') return this.scan('manual');
    if (url.pathname === '/health') return json(await this.health());
    if (url.pathname === '/live') return json(await this.live());
    if (url.pathname === '/snapshots') {
      const snapshots = await this.state.storage.get('snapshots') || [];
      return json({ ok: true, snapshots });
    }
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
      discovered: health.discovered || 0,
      fetched: health.fetched || 0,
      liveMatches: latest.matches?.filter(m => m.status === 'LIVE' || m.status === 'HT').length || 0,
      coreStatsReady: latest.matches?.filter(m => m.coreStatsComplete).length || 0,
      sourceUrl: health.sourceUrl || null
    };
  }

  async live() {
    const latest = await this.state.storage.get('latest') || { generatedAt: null, matches: [] };
    const now = Date.now();
    latest.matches = (latest.matches || []).map(match => ({
      ...match,
      sourceFreshnessSeconds: match.collectedAt ? Math.max(0, Math.round((now - Date.parse(match.collectedAt)) / 1000)) : null
    }));
    return { ok: true, ...latest };
  }

  async scan(trigger = 'cron') {
    const started = Date.now();
    const collectedAt = new Date().toISOString();
    const maxMatches = Math.max(1, Math.min(40, Number(this.env.MAX_MATCHES_PER_CYCLE || 18)));
    const concurrency = Math.max(1, Math.min(6, Number(this.env.FETCH_CONCURRENCY || 3)));
    try {
      const discovery = await discoverGoaloo(this.env);
      const ids = discovery.ids.slice(0, maxMatches);
      const fetched = await mapWithConcurrency(ids, concurrency, async id => {
        const candidates = [
          `https://m.goaloo.com/football/match/live-${id}`,
          `https://www.goaloo.com/football/match/live-${id}`
        ];
        let lastError = null;
        for (const target of candidates) {
          try {
            const html = await fetchText(target);
            return parseGoalooMatch(id, html, target, collectedAt);
          } catch (error) { lastError = error; }
        }
        throw lastError || new Error(`Unable to fetch Goaloo match ${id}`);
      });
      const matches = fetched.filter(row => row && !row.error);
      const errors = fetched.filter(row => row?.error);
      const liveLike = matches.filter(m => m.status === 'LIVE' || m.status === 'HT');
      const latest = {
        generatedAt: collectedAt,
        trigger,
        source: 'GOALOO',
        sourceMode: 'GOALOO_ONLY',
        discoveryUrl: discovery.discoveryUrl,
        matches: liveLike.length ? liveLike : matches,
        rawMatchCount: matches.length,
        errors: [...discovery.errors, ...errors.map(e => e.error)].slice(0, 12)
      };
      await this.state.storage.put('latest', latest);
      const previousSnapshots = await this.state.storage.get('snapshots') || [];
      previousSnapshots.push({ at: collectedAt, matches: latest.matches.map(m => ({ id: m.sourceMatchId, minute: m.minute, score: m.score, stats: m.stats })) });
      while (previousSnapshots.length > 120) previousSnapshots.shift();
      await this.state.storage.put('snapshots', previousSnapshots);
      await this.state.storage.put('health', {
        lastCycle: collectedAt,
        lastSuccess: collectedAt,
        lastError: latest.errors.length ? latest.errors.join(' | ') : null,
        cycleMs: Date.now() - started,
        discovered: discovery.ids.length,
        fetched: matches.length,
        sourceUrl: discovery.discoveryUrl
      });
      return json({ ok: true, ...latest, cycleMs: Date.now() - started });
    } catch (error) {
      const message = String(error?.message || error);
      const oldHealth = await this.state.storage.get('health') || {};
      await this.state.storage.put('health', { ...oldHealth, lastCycle: collectedAt, lastError: message, cycleMs: Date.now() - started });
      return json({ ok: false, error: message, generatedAt: collectedAt }, 502);
    }
  }
}

function stateStub(env) {
  const id = env.CAR31_STATE.idFromName('car31-global-shadow');
  return env.CAR31_STATE.get(id);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    return stateStub(env).fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stateStub(env).fetch('https://car31.internal/scan', { method: 'POST' }));
  }
};
