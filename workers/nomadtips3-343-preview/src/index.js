function engineRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'engine.internal';
  upstream.pathname = path;
  return new Request(upstream, request);
}

const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const scoreCopy = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value ?? null;

async function noStoreStatisticsAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-nomad-stat-revision', '343-stat-clean-v5');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function fixtureState(fixture) {
  const raw = String(fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? '').toLowerCase();
  if (fixture?.boardState === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return 'FT';
  return 'LOCKED';
}

function fixtureIsLive(fixture) {
  const raw = String(fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? '').toLowerCase();
  if (fixture?.boardState === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return false;
  return fixture?.boardState === 'live' || /in_play|in play|live|playing|first|second|\b1h\b|\b2h\b/.test(raw);
}

function mirrorMinute(fixture, signal, state) {
  if (state === 'FT') return 'FT';
  const direct = num(fixture?.minute);
  if (direct !== null) return direct;
  const match = String(fixture?.statusCode ?? '').match(/\d+/);
  if (match) return Number(match[0]);
  return num(signal?.entryMinute ?? signal?.minute);
}

function mirrorScore(fixture, signal, state) {
  if (state === 'FT') return scoreCopy(signal?.finalScore ?? fixture?.goals ?? null);
  if (fixture?.goals && typeof fixture.goals === 'object') return scoreCopy(fixture.goals);
  return scoreCopy(signal?.entryScore ?? signal?.scoreAt);
}

async function mirroredSignals(request, env) {
  const [signalResponse, boardResponse, statisticsResponse] = await Promise.all([
    env.ENGINE.fetch(engineRequest(request, '/signals')),
    env.ENGINE.fetch(engineRequest(request, '/board')),
    env.ENGINE.fetch(engineRequest(request, '/statistics'))
  ]);

  const [signalData, boardData, statisticsData] = await Promise.all([
    signalResponse.json().catch(() => ({})),
    boardResponse.json().catch(() => ({})),
    statisticsResponse.json().catch(() => ({}))
  ]);

  if (signalData?.ok !== true) {
    return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  }

  const fixtures = Array.isArray(boardData?.fixtures) ? boardData.fixtures : [];
  const fixtureMap = new Map(fixtures.map(f => [String(f?.fixtureId ?? ''), f]));
  const boardIds = new Set(fixtureMap.keys());
  const liveCount = num(boardData?.counts?.live) ?? fixtures.filter(fixtureIsLive).length;
  const active = Array.isArray(signalData?.signals) ? signalData.signals : [];
  const finished = Array.isArray(statisticsData?.rows)
    ? statisticsData.rows.filter(s => boardIds.has(String(s?.fixtureId ?? '')))
    : [];

  const merged = new Map();
  for (const signal of [...active, ...finished]) {
    if (!signal?.id) continue;
    merged.set(String(signal.id), signal);
  }

  let orphanFtCount = 0;
  const signals = [...merged.values()]
    .map(signal => {
      const fixture = fixtureMap.get(String(signal?.fixtureId ?? ''));
      const settled = String(signal?.status ?? '').toUpperCase() === 'SETTLED';
      const orphanFt = !settled && !fixture && liveCount === 0;
      if (orphanFt) orphanFtCount += 1;
      const state = (settled || orphanFt) ? 'FT' : (fixture ? fixtureState(fixture) : 'LOCKED');
      return {
        ...signal,
        mirrorMinute: fixture ? mirrorMinute(fixture, signal, state) : (state === 'FT' ? 'FT' : num(signal?.entryMinute ?? signal?.minute)),
        mirrorScore: fixture ? mirrorScore(fixture, signal, state) : scoreCopy(state === 'FT' ? (signal?.finalScore ?? null) : (signal?.entryScore ?? signal?.scoreAt)),
        mirrorState: state,
        mirrorSource: orphanFt ? 'ENGINE_CACHE_ORPHAN_FT' : 'ENGINE_CACHE'
      };
    })
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
    .slice(0, 120);

  return Response.json({
    ...signalData,
    signals,
    mirror: {
      source: 'ENGINE_CACHE',
      externalRequestsAdded: 0,
      boardFixtures: fixtures.length,
      liveFixtures: liveCount,
      finishedMirrored: finished.length,
      orphanFtCount
    }
  }, { headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/engine/signals' && request.method === 'GET') {
      return mirroredSignals(request, env);
    }
    if (url.pathname.startsWith('/api/engine/')) {
      const upstream = new URL(request.url);
      upstream.protocol = 'https:';
      upstream.hostname = 'engine.internal';
      upstream.pathname = url.pathname.replace('/api/engine', '') || '/';
      return env.ENGINE.fetch(new Request(upstream, request));
    }
    if (request.method === 'GET' && (url.pathname === '/statistics.html' || url.pathname === '/statistics.js' || url.pathname === '/statistics-page-343.css')) {
      return noStoreStatisticsAsset(request, env);
    }
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/index.html';
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};
