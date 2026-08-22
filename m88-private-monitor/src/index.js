const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function privateAllowed(request, env) {
  const secret = String(env.PRIVATE_TOKEN || '').trim();
  if (!secret) return true;
  const auth = request.headers.get('authorization') || '';
  const header = request.headers.get('x-private-token') || '';
  return auth === `Bearer ${secret}` || header === secret;
}

function absoluteUrl(base, candidate) {
  try { return new URL(candidate, base).href; } catch { return null; }
}

function extractScriptUrls(html, base) {
  const out = [];
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absoluteUrl(base, m[1]);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

function discoverCandidateUrls(text, base) {
  const found = new Set();
  const absolute = /https?:\\?\/\\?\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%\\-]+/g;
  for (const raw of text.match(absolute) || []) {
    const cleaned = raw.replace(/\\\//g, '/').replace(/["'`)\]}>,;]+$/g, '');
    if (/odds|market|sport|event|match|live|fixture|api/i.test(cleaned)) found.add(cleaned);
  }
  const relative = /["'](\/?[A-Za-z0-9_./-]*(?:api|sport|event|match|odds|market|live)[A-Za-z0-9_./?=&%:-]*)["']/gi;
  let m;
  while ((m = relative.exec(text))) {
    const u = absoluteUrl(base, m[1]);
    if (u) found.add(u);
  }
  return [...found].slice(0, 120);
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; M88PrivateMonitor/1.0; public-read-only)',
      'accept': '*/*',
      ...(init.headers || {})
    },
    cf: { cacheTtl: 0, cacheEverything: false },
    ...init
  });
  const text = await response.text();
  return { response, text };
}

async function probeM88(env, deep = false) {
  const appUrl = env.M88_PUBLIC_APP_URL || 'https://msports.m88.com/app/v2/';
  const startedAt = new Date().toISOString();
  const { response, text } = await fetchText(appUrl, { headers: { accept: 'text/html,*/*' } });
  const scriptUrls = extractScriptUrls(text, response.url || appUrl);
  const result = {
    source: 'M88 MSports public page',
    appUrl,
    fetchedUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    bytes: new TextEncoder().encode(text).byteLength,
    checkedAt: startedAt,
    scriptCount: scriptUrls.length,
    scripts: scriptUrls.slice(0, 24),
    candidates: discoverCandidateUrls(text, response.url || appUrl),
    note: 'Read-only public probe. No login, account session, bet placement or transaction automation.'
  };

  if (!deep || !response.ok) return result;

  const bundleReports = [];
  for (const scriptUrl of scriptUrls.slice(0, 8)) {
    try {
      const { response: sr, text: js } = await fetchText(scriptUrl);
      const candidates = discoverCandidateUrls(js.slice(0, 2_500_000), scriptUrl);
      bundleReports.push({
        url: scriptUrl,
        status: sr.status,
        bytesScanned: Math.min(js.length, 2_500_000),
        candidates: candidates.slice(0, 40)
      });
    } catch (error) {
      bundleReports.push({ url: scriptUrl, error: String(error?.message || error) });
    }
  }
  result.bundleReports = bundleReports;
  result.candidates = [...new Set([
    ...result.candidates,
    ...bundleReports.flatMap(x => x.candidates || [])
  ])].slice(0, 160);
  return result;
}

function scoreTuple(obj) {
  const home = Number(obj.homeScore ?? obj.scoreHome ?? obj.home_score ?? obj.hScore ?? obj.homeGoals);
  const away = Number(obj.awayScore ?? obj.scoreAway ?? obj.away_score ?? obj.aScore ?? obj.awayGoals);
  return Number.isFinite(home) && Number.isFinite(away) ? [home, away] : null;
}

function firstString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = Number(obj?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function looksLikeMatch(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const home = firstString(obj, ['home', 'homeName', 'homeTeam', 'home_team', 'team1', 'competitor1']);
  const away = firstString(obj, ['away', 'awayName', 'awayTeam', 'away_team', 'team2', 'competitor2']);
  if (home && away) return true;
  const text = JSON.stringify(obj).slice(0, 1200);
  return /home/i.test(text) && /away/i.test(text) && /(odd|market|score|minute|period|live)/i.test(text);
}

function extractOdds(obj) {
  const direct = firstNumber(obj, ['odds', 'odd', 'price', 'decimalOdds', 'decimal_odds']);
  if (direct != null) return direct;
  for (const value of Object.values(obj || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const n = firstNumber(value, ['odds', 'odd', 'price', 'decimalOdds']);
      if (n != null) return n;
    }
  }
  return null;
}

function normalizeMatch(obj, index) {
  const home = firstString(obj, ['home', 'homeName', 'homeTeam', 'home_team', 'team1', 'competitor1']);
  const away = firstString(obj, ['away', 'awayName', 'awayTeam', 'away_team', 'team2', 'competitor2']);
  const score = scoreTuple(obj);
  return {
    sourceId: String(obj.id ?? obj.eventId ?? obj.matchId ?? obj.fixtureId ?? obj.event_id ?? `row-${index}`),
    league: firstString(obj, ['league', 'leagueName', 'competition', 'competitionName', 'tournament']),
    home,
    away,
    minute: firstNumber(obj, ['minute', 'liveMinute', 'matchMinute', 'clock', 'time']),
    homeScore: score?.[0] ?? null,
    awayScore: score?.[1] ?? null,
    market: firstString(obj, ['market', 'marketName', 'betType', 'market_name']),
    selection: firstString(obj, ['selection', 'selectionName', 'pick', 'side']),
    odds: extractOdds(obj),
    status: firstString(obj, ['status', 'state', 'matchStatus', 'period']),
    raw: obj
  };
}

function recursiveObjects(value, out, depth = 0) {
  if (depth > 8 || out.length > 5000) return;
  if (Array.isArray(value)) {
    for (const item of value) recursiveObjects(item, out, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (looksLikeMatch(value)) out.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') recursiveObjects(child, out, depth + 1);
  }
}

function normalizeFeed(payload) {
  const objects = [];
  recursiveObjects(payload, objects);
  const seen = new Set();
  const matches = [];
  objects.forEach((obj, index) => {
    const row = normalizeMatch(obj, index);
    if (!row.home || !row.away) return;
    const key = `${row.sourceId}|${row.home}|${row.away}|${row.market}|${row.selection}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(row);
  });
  return matches.slice(0, 1500);
}

async function readFeed(env) {
  const feedUrl = String(env.M88_FEED_URL || '').trim();
  if (!feedUrl) {
    return {
      ok: false,
      mode: 'probe-required',
      message: 'M88_FEED_URL has not been selected yet. Use /api/source/probe?deep=1 to discover public feed candidates.',
      matches: [],
      checkedAt: new Date().toISOString()
    };
  }
  const { response, text } = await fetchText(feedUrl, { headers: { accept: 'application/json,text/plain,*/*' } });
  let payload;
  try { payload = JSON.parse(text); } catch {
    return {
      ok: false,
      mode: 'feed-parse-error',
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes: text.length,
      message: 'Configured public feed did not return JSON.',
      matches: [],
      checkedAt: new Date().toISOString()
    };
  }
  const matches = normalizeFeed(payload);
  return {
    ok: response.ok,
    mode: 'public-feed',
    feedUrl,
    status: response.status,
    matchCount: matches.length,
    matches,
    checkedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (!privateAllowed(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      try {
        if (url.pathname === '/api/health') {
          return json({
            ok: true,
            service: 'm88-private-monitor',
            source: 'M88 public MSports',
            loginRequired: false,
            transactionAutomation: false,
            feedConfigured: Boolean(String(env.M88_FEED_URL || '').trim()),
            privateLockConfigured: Boolean(String(env.PRIVATE_TOKEN || '').trim()),
            now: new Date().toISOString()
          });
        }
        if (url.pathname === '/api/source/probe') {
          return json(await probeM88(env, url.searchParams.get('deep') === '1'));
        }
        if (url.pathname === '/api/feed') {
          return json(await readFeed(env));
        }
        return json({ ok: false, error: 'not_found' }, 404);
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error), now: new Date().toISOString() }, 502);
      }
    }

    if (!privateAllowed(request, env)) {
      return new Response('Private monitor', { status: 401, headers: TEXT_HEADERS });
    }

    return env.ASSETS.fetch(request);
  }
};
