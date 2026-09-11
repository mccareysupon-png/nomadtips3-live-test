function engineRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'engine.internal';
  upstream.pathname = path;
  return new Request(upstream, request);
}

const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const copy = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value ?? null;

async function noStoreUiAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  const path = new URL(request.url).pathname;
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-nomad-ui-revision', '343-active-signal-board-v2');
  if (path.startsWith('/statistics')) headers.set('x-nomad-stat-revision', '343-stat-results-v6');
  if (path.startsWith('/signal')) headers.set('x-nomad-signal-revision', '343-signal-active-v2');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function fixtureIsLive(fixture) {
  const raw = String(fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? '').toLowerCase();
  if (fixture?.boardState === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return false;
  return fixture?.boardState === 'live' || /in_play|in play|live|playing|first|second|\b1h\b|\b2h\b/.test(raw);
}

function liveMinute(fixture, signal) {
  const direct = num(fixture?.minute);
  if (direct !== null) return direct;
  const match = String(fixture?.statusCode ?? '').match(/\d+/);
  if (match) return Number(match[0]);
  return num(signal?.entryMinute ?? signal?.minute);
}

async function activeSignals(request, env) {
  const [signalResponse, boardResponse] = await Promise.all([
    env.ENGINE.fetch(engineRequest(request, '/signals')),
    env.ENGINE.fetch(engineRequest(request, '/board'))
  ]);

  const [signalData, boardData] = await Promise.all([
    signalResponse.json().catch(() => ({})),
    boardResponse.json().catch(() => ({}))
  ]);

  if (signalData?.ok !== true) {
    return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  }
  if (boardData?.ok !== true) {
    return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: boardResponse.status || 503 });
  }

  const fixtures = Array.isArray(boardData?.fixtures) ? boardData.fixtures : [];
  const liveFixtures = fixtures.filter(fixtureIsLive);
  const liveFixtureMap = new Map(liveFixtures.map(f => [String(f?.fixtureId ?? ''), f]));
  const pending = Array.isArray(signalData?.signals) ? signalData.signals : [];
  let hiddenPendingSignals = 0;

  const signals = pending
    .filter(signal => {
      const visible = liveFixtureMap.has(String(signal?.fixtureId ?? ''));
      if (!visible) hiddenPendingSignals += 1;
      return visible;
    })
    .map(signal => {
      const fixture = liveFixtureMap.get(String(signal.fixtureId));
      return {
        ...signal,
        mirrorMinute: liveMinute(fixture, signal),
        mirrorScore: copy(fixture?.goals ?? signal?.entryScore ?? signal?.scoreAt),
        mirrorState: 'LIVE',
        mirrorSource: 'ENGINE_BOARD_LIVE',
        liveStatistics: copy(fixture?.statistics),
        liveCorners: copy(fixture?.corners),
        liveCards: copy(fixture?.cards),
        liveEvents: Array.isArray(fixture?.events) ? copy(fixture.events) : [],
        liveStatus: fixture?.status ?? null,
        liveStatusCode: fixture?.statusCode ?? null,
        liveUpdatedAt: boardData?.hubFetchedAt ?? null,
        liveAgeMs: num(boardData?.hubAgeMs)
      };
    })
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));

  const activeMatches = new Set(signals.map(s => String(s.fixtureId))).size;
  return Response.json({
    ...signalData,
    signals,
    mirror: {
      source: 'ENGINE_BOARD_LIVE',
      externalRequestsAdded: 0,
      boardFixtures: fixtures.length,
      liveFixtures: liveFixtures.length,
      activeMatches,
      activeSignals: signals.length,
      hiddenPendingSignals,
      hubFetchedAt: boardData?.hubFetchedAt ?? null,
      hubAgeMs: num(boardData?.hubAgeMs),
      stale: Boolean(boardData?.stale)
    }
  }, { headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/engine/signals' && request.method === 'GET') {
      return activeSignals(request, env);
    }
    if (url.pathname.startsWith('/api/engine/')) {
      const upstream = new URL(request.url);
      upstream.protocol = 'https:';
      upstream.hostname = 'engine.internal';
      upstream.pathname = url.pathname.replace('/api/engine', '') || '/';
      return env.ENGINE.fetch(new Request(upstream, request));
    }
    if (request.method === 'GET' && (
      url.pathname === '/statistics.html' || url.pathname === '/statistics.js' || url.pathname === '/statistics-page-343.css' ||
      url.pathname === '/signal.html' || url.pathname === '/signal.js' || url.pathname === '/signal-compact-343.css'
    )) {
      return noStoreUiAsset(request, env);
    }
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/index.html';
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};
