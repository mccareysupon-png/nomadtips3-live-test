import { normalizeProviderPayload } from './normalize.js';
import { fetchAsianBookiePayload, asianBookieConfig } from './asianbookie.js';
import { fetchNowgoalCandidate, fetchNowgoalPayload, nowgoalConfig } from './nowgoal.js';

const CACHE_MS = 5_000;
let memoryCache = { at: 0, payload: null, providerKey: '' };

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const fixed = new Set([
    'https://www.nomadtips3.com',
    'https://nomadtips3.com',
    'https://mccareysupon-png.github.io',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ]);
  if (env.MARKET_ALLOW_ORIGIN) fixed.add(String(env.MARKET_ALLOW_ORIGIN));
  return fixed.has(origin) ? origin : fixed.has('https://www.nomadtips3.com') ? 'https://www.nomadtips3.com' : '';
}

function json(request, payload, status = 200, env = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'Origin',
  });
  const origin = allowedOrigin(request, env);
  if (origin) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  return new Response(JSON.stringify(payload), { status, headers });
}

function providerConfig(env) {
  const kind = String(env.MARKET_PROVIDER_KIND || '').trim().toLowerCase();
  const endpoint = String(env.MARKET_PROVIDER_ENDPOINT || '').trim();
  const token = String(env.MARKET_PROVIDER_TOKEN || '').trim();
  const providerName = String(env.MARKET_PROVIDER_NAME || (kind === 'asianbookie' ? 'AsianBookie Tipster' : kind === 'nowgoal' ? 'Nowgoal' : 'authorized-market-feed')).trim();
  const maxAgeMsRaw = Number(env.MAX_MARKET_AGE_MS);
  const maxAgeMs = Number.isFinite(maxAgeMsRaw) ? Math.max(5_000, Math.min(120_000, maxAgeMsRaw)) : 30_000;
  const timeoutRaw = Number(env.MARKET_PROVIDER_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1_000, Math.min(12_000, timeoutRaw)) : 6_000;
  const configured = kind === 'asianbookie' || kind === 'nowgoal' || Boolean(endpoint);
  return { kind, endpoint, token, providerName, maxAgeMs, timeoutMs, configured };
}

async function fetchGenericProvider(config) {
  if (!config.endpoint) {
    const error = new Error('provider_not_configured');
    error.code = 'provider_not_configured';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('provider_timeout'), config.timeoutMs);
  try {
    const headers = new Headers({ accept: 'application/json' });
    if (config.token) headers.set('authorization', `Bearer ${config.token}`);
    const response = await fetch(config.endpoint, { method: 'GET', headers, signal: controller.signal, cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      const error = new Error(`provider_http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return normalizeProviderPayload(payload, { providerName: config.providerName, maxAgeMs: config.maxAgeMs });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProvider(config, env) {
  if (config.kind === 'asianbookie') {
    const raw = await fetchAsianBookiePayload(env);
    const normalized = normalizeProviderPayload(raw, { providerName: config.providerName, maxAgeMs: config.maxAgeMs });
    return { ...normalized, sourceDiagnostics: raw.sourceDiagnostics };
  }
  if (config.kind === 'nowgoal') {
    const raw = await fetchNowgoalPayload(env);
    const normalized = normalizeProviderPayload(raw, { providerName: config.providerName, maxAgeMs: config.maxAgeMs });
    return { ...normalized, sourceDiagnostics: raw.sourceDiagnostics };
  }
  return fetchGenericProvider(config);
}

async function markets(config, env) {
  const now = Date.now();
  const providerKey = `${config.kind}|${config.endpoint}|${config.providerName}`;
  if (memoryCache.payload && memoryCache.providerKey === providerKey && now - memoryCache.at < CACHE_MS) {
    return { ...memoryCache.payload, cache: 'memory' };
  }
  const payload = await fetchProvider(config, env);
  memoryCache = { at: Date.now(), payload, providerKey };
  return { ...payload, cache: 'fresh' };
}

function candidateQuery(url) {
  const scoreHome = Number(url.searchParams.get('scoreHome'));
  const scoreAway = Number(url.searchParams.get('scoreAway'));
  const minute = Number(url.searchParams.get('minute'));
  return {
    home: url.searchParams.get('home') || '',
    away: url.searchParams.get('away') || '',
    minute: Number.isFinite(minute) ? minute : null,
    score: Number.isFinite(scoreHome) && Number.isFinite(scoreAway) ? [scoreHome, scoreAway] : null,
  };
}

async function nowgoalCandidate(config, env, query) {
  const raw = await fetchNowgoalCandidate(env, query);
  if (!raw.ok) return raw;
  const normalized = normalizeProviderPayload({
    provider: 'Nowgoal',
    observedAt: raw.observedAt,
    matches: [raw.match],
  }, {
    providerName: 'Nowgoal',
    maxAgeMs: config.maxAgeMs,
  });
  const match = normalized.matches[0] || null;
  const oneXtwo = match?.main?.oneXtwo || null;
  const total = match?.main?.totals || null;
  if (!match || (!oneXtwo && !total)) {
    return {
      ok: false,
      provider: 'Nowgoal',
      observedAt: raw.observedAt,
      error: 'nowgoal_candidate_markets_unavailable',
      sourceDiagnostics: raw.sourceDiagnostics || null,
    };
  }
  const possession = raw.possession || null;
  const availableMarkets = [oneXtwo ? '1X2' : null, total ? 'OVER_UNDER' : null].filter(Boolean);
  return {
    ok: true,
    version: 'nowgoal-candidate-v1',
    provider: 'Nowgoal',
    observedAt: raw.observedAt,
    fixture: {
      id: String(raw.match.id),
      home: raw.match.home,
      away: raw.match.away,
      minute: query.minute,
      score: raw.match.score,
    },
    oneXtwo: oneXtwo ? {
      home: oneXtwo.home,
      draw: oneXtwo.draw,
      away: oneXtwo.away,
    } : {
      home: null,
      draw: null,
      away: null,
    },
    totals: total ? {
      line: total.line,
      over: total.overOdds,
      under: total.underOdds,
    } : {
      line: null,
      over: null,
      under: null,
    },
    statistics: {
      home: {
        shotOnTarget: null,
        shotOff: null,
        possession: possession?.home ?? null,
      },
      away: {
        shotOnTarget: null,
        shotOff: null,
        possession: possession?.away ?? null,
      },
    },
    sourceDiagnostics: {
      ...(raw.sourceDiagnostics || {}),
      availableMarkets,
      partialMarket: availableMarkets.length === 1,
      activeStatistics: ['possession'],
      inactiveStatistics: ['shotOnTarget', 'shotOff'],
    },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json(request, {}, 204, env);
    const url = new URL(request.url);
    const config = providerConfig(env);

    if (url.pathname === '/' || url.pathname === '/health') {
      const asian = config.kind === 'asianbookie' ? asianBookieConfig(env) : null;
      const nowgoal = config.kind === 'nowgoal' ? nowgoalConfig(env) : null;
      return json(request, {
        ok: true,
        service: 'nomadtips3-market-engine',
        version: 'market-v1',
        mode: 'isolated-optional',
        providerConfigured: config.configured,
        providerKind: config.kind || 'generic',
        providerName: config.providerName,
        maxMarketAgeMs: config.maxAgeMs,
        nowgoalCandidate: {
          enabled: config.kind === 'nowgoal',
          trigger: 'MARKET_SETTINGS_SCAN',
          markets: ['1X2', 'OVER_UNDER'],
          statistics: ['POSSESSION'],
          unavailableStatistics: ['SOT', 'SHOT_OFF'],
          matchGuards: ['HOME/AWAY orientation', 'exact score', 'team similarity', 'ambiguity reject'],
        },
        asianBookie: asian ? {
          enabled: true,
          base: asian.base,
          matchCacheMs: asian.matchCacheMs,
          oddsCacheMs: asian.oddsCacheMs,
        } : { enabled: false },
        nowgoal: nowgoal ? {
          enabled: true,
          base: nowgoal.base,
          bookmakers: nowgoal.bookmakers,
          markets: ['1X2', 'OVER_UNDER'],
          candidateStatistics: ['POSSESSION'],
          asianHandicap: false,
        } : { enabled: false },
        eventDependency: false,
        oddStormPublicScraping: false,
      }, 200, env);
    }

    if (url.pathname === '/candidate' && request.method === 'GET') {
      if (config.kind !== 'nowgoal') {
        return json(request, {
          ok: false,
          version: 'nowgoal-candidate-v1',
          provider: 'Nowgoal',
          error: 'nowgoal_candidate_provider_not_active',
          optional: true,
        }, 503, env);
      }
      const query = candidateQuery(url);
      if (!query.home || !query.away || !Array.isArray(query.score)) {
        return json(request, {
          ok: false,
          version: 'nowgoal-candidate-v1',
          provider: 'Nowgoal',
          error: 'nowgoal_candidate_identity_incomplete',
          optional: true,
        }, 400, env);
      }
      try {
        const result = await nowgoalCandidate(config, env, query);
        const notMatched = String(result?.error || '').includes('no_candidate') || String(result?.error || '').includes('ambiguous') || String(result?.error || '').includes('score_required');
        return json(request, { ...result, optional: true }, result.ok ? 200 : notMatched ? 404 : 502, env);
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'nowgoal_candidate_timeout' : String(error?.code || error?.message || error || 'nowgoal_candidate_failed');
        return json(request, {
          ok: false,
          version: 'nowgoal-candidate-v1',
          provider: 'Nowgoal',
          error: reason,
          optional: true,
        }, 502, env);
      }
    }

    if (url.pathname === '/markets' && request.method === 'GET') {
      if (!config.configured) {
        return json(request, {
          ok: false,
          version: 'market-v1',
          error: 'provider_not_configured',
          optional: true,
          matches: [],
        }, 503, env);
      }
      try {
        return json(request, await markets(config, env), 200, env);
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'provider_timeout' : String(error?.code || error?.message || 'provider_unavailable');
        return json(request, {
          ok: false,
          version: 'market-v1',
          provider: config.providerName,
          error: reason,
          details: error?.details || null,
          optional: true,
          matches: [],
        }, 502, env);
      }
    }

    return json(request, { ok: false, error: 'not_found' }, 404, env);
  },
};

export { providerConfig, fetchProvider, nowgoalCandidate };
