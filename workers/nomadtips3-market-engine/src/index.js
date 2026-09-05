import { normalizeProviderPayload } from './normalize.js';
import { fetchAsianBookiePayload, asianBookieConfig } from './asianbookie.js';
import { fetchApiFootballCandidate } from './api-football-candidate.js';
import { fetchNowgoalPayload, nowgoalConfig } from './nowgoal.js';

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
        apiFootballCandidate: {
          enabled: true,
          configured: Boolean(env.API_FOOTBALL_KEY),
          trigger: 'EVENT_PASS_ONLY',
          markets: ['1X2', 'OVER_UNDER'],
          fixtureCacheMs: 180000,
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
          asianHandicap: false,
        } : { enabled: false },
        eventDependency: false,
        oddStormPublicScraping: false,
      }, 200, env);
    }

    if (url.pathname === '/candidate' && request.method === 'GET') {
      if (!env.API_FOOTBALL_KEY) {
        return json(request, {
          ok: false,
          version: 'api-football-candidate-v1',
          error: 'api_football_key_not_configured',
          optional: true,
        }, 503, env);
      }
      const scoreHome = Number(url.searchParams.get('scoreHome'));
      const scoreAway = Number(url.searchParams.get('scoreAway'));
      const query = {
        home: url.searchParams.get('home') || '',
        away: url.searchParams.get('away') || '',
        minute: url.searchParams.get('minute'),
        score: Number.isFinite(scoreHome) && Number.isFinite(scoreAway) ? [scoreHome, scoreAway] : null,
      };
      try {
        const result = await fetchApiFootballCandidate(env.API_FOOTBALL_KEY, query, config.timeoutMs);
        return json(request, { ...result, optional: true }, result.ok ? 200 : 404, env);
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'api_football_timeout' : String(error?.message || error || 'api_football_candidate_failed');
        return json(request, {
          ok: false,
          version: 'api-football-candidate-v1',
          provider: 'API-Football',
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

export { providerConfig, fetchProvider };
