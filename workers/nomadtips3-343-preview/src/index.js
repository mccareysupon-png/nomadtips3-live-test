function engineRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'engine.internal';
  upstream.pathname = path;
  return new Request(upstream, request);
}

function hubRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'hub.internal';
  upstream.pathname = path;
  return new Request(upstream, request);
}

function fullMarketRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'full-market.internal';
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
  headers.set('x-nomad-ui-revision', '343-full-market-v1');
  if (path.startsWith('/statistics')) headers.set('x-nomad-stat-revision', '343-stat-results-v7-live-mirror');
  if (path.startsWith('/signal')) headers.set('x-nomad-signal-revision', '343-signal-bettor-v4');
  if (path === '/index.html' || path === '/live.js' || path === '/full-odds-main-343.js' || path.startsWith('/event-flow-343')) headers.set('x-nomad-live-revision', '343-live-full-market-v1');
  if (path === '/5usd-control.html') headers.set('x-nomad-control-revision', '343-5usd-control-v1');
  if (path === '/detection-test.html') headers.set('x-nomad-detection-revision', '343-detection-test-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function fixtureIsLive(fixture) {
  const raw = String(fixture?.boardState ?? fixture?.status ?? fixture?.statusCode ?? '').toLowerCase();
  if (fixture?.boardState === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return false;
  return fixture?.boardState === 'live' || /in_play|in play|live|playing|first|second|\b1h\b|\b2h\b/.test(raw);
}

function liveMinute(fixture) {
  const direct = num(fixture?.minute);
  if (direct !== null) return direct;
  const match = String(fixture?.statusCode ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function oddsContainerHasData(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return false;
  if (!Object.keys(value).length) return false;
  const containers = [
    value.bookmakers, value.odds, value.markets,
    value?.data?.bookmakers, value?.data?.odds, value?.data?.markets
  ];
  if (containers.some(v => Array.isArray(v) ? v.length > 0 : Boolean(v && typeof v === 'object' && Object.keys(v).length))) return true;
  return Object.keys(value).some(k => /bet365|pinnacle|williamhill|ladbrokes|vcbet|1xbet|bwin|easybets|interwetten|betfair|snai|macauslot|betsson|betathome|18bet|10bet|12bet|coral|crown|bookmaker/i.test(String(k)));
}

function boardHasBookmakerOdds(board) {
  const fixtures = Array.isArray(board?.fixtures) ? board.fixtures : [];
  return fixtures.some(fixture =>
    oddsContainerHasData(fixture?.providerOdds) ||
    oddsContainerHasData(fixture?.fullOdds) ||
    oddsContainerHasData(fixture?.odds)
  );
}

function mergeLastGood(previous, incoming) {
  if (incoming === null || incoming === undefined || incoming === '') return previous;
  if (Array.isArray(incoming)) return incoming.length ? incoming : previous;
  if (typeof incoming !== 'object') return incoming;
  const prev = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  const out = { ...prev };
  for (const [key, value] of Object.entries(incoming)) out[key] = mergeLastGood(prev[key], value);
  return out;
}

function liveFixtureIds(board) {
  const seen = new Set();
  const ids = [];
  for (const fixture of Array.isArray(board?.fixtures) ? board.fixtures : []) {
    if (!fixtureIsLive(fixture)) continue;
    const id = String(fixture?.fixtureId ?? fixture?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function fullMarketCacheSnapshot(env, fixtureIds) {
  if (!env.FULL_MARKET || !fixtureIds.length) return null;
  const request = new Request('https://full-market.internal/board-cache', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({fixtureIds})
  });
  const response = await env.FULL_MARKET.fetch(request);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.ok === true && data?.entries && typeof data.entries === 'object' ? data : null;
}

async function enrichBoardWithCachedFullMarket(board, env) {
  if (!board || board.ok !== true || !Array.isArray(board.fixtures)) return { board, changed:false };
  const ids = liveFixtureIds(board);
  if (!ids.length) return { board, changed:false };
  try {
    const cache = await fullMarketCacheSnapshot(env, ids);
    if (!cache) return { board, changed:false };
    let hits = 0;
    let staleHits = 0;
    const fixtures = board.fixtures.map(fixture => {
      const id = String(fixture?.fixtureId ?? fixture?.id ?? '').trim();
      const hit = cache.entries?.[id];
      if (!fixtureIsLive(fixture) || !hit?.fullOdds || typeof hit.fullOdds !== 'object') return fixture;
      hits += 1;
      if (hit.stale) staleHits += 1;
      return {
        ...fixture,
        providerOdds: mergeLastGood(fixture?.providerOdds, hit.fullOdds),
        providerOddsUpdatedAt: Number(hit.fetchedAt || fixture?.providerOddsUpdatedAt || 0) || fixture?.providerOddsUpdatedAt || null,
        providerOddsFreshAt: Number(hit.fetchedAt || fixture?.providerOddsFreshAt || 0) || fixture?.providerOddsFreshAt || null,
        providerOddsHeld: Boolean(hit.stale),
        centralFullMarketCached: true
      };
    });
    if (!hits) return { board, changed:false };
    return {
      board:{
        ...board,
        fixtures,
        fullMarketCache:{
          mode:'SERVER_CENTRAL_LAST_GOOD',
          requested:ids.length,
          hits,
          staleHits,
          externalRequestsAdded:0,
          version:cache.version || null
        }
      },
      changed:true
    };
  } catch {
    return { board, changed:false };
  }
}

async function engineBoardResponse(request, env) {
  const engineResponse = await env.ENGINE.fetch(engineRequest(request, '/board'));
  const engineBoard = engineResponse.ok ? await engineResponse.clone().json().catch(() => null) : null;
  const engineHasOdds = boardHasBookmakerOdds(engineBoard);

  if (engineResponse.ok && engineBoard?.ok === true && engineHasOdds) {
    const enriched = await enrichBoardWithCachedFullMarket(engineBoard, env);
    if (!enriched.changed) return engineResponse;
    return Response.json(enriched.board, { headers:{'cache-control':'no-store','x-ball46-board-source':'engine-plus-central-full-market-cache'} });
  }

  const hubResponse = await env.HUB.fetch(hubRequest(request, '/snapshot'));
  if (!hubResponse.ok) return engineResponse;
  const hub = await hubResponse.json().catch(() => null);
  if (!hub || hub.ok !== true || !Array.isArray(hub.fixtures)) return engineResponse;
  const hubHasOdds = boardHasBookmakerOdds(hub);
  if (engineResponse.ok && !hubHasOdds) return engineResponse;

  const fallbackBoard = {
    ...hub,
    version: 'ball46-board-fallback-john-continuity-v2-odds-aware',
    engineBoardFallback: true,
    engineBoardFallbackReason: engineResponse.ok ? 'ENGINE_BOARD_ODDS_EMPTY' : 'ENGINE_BOARD_ERROR',
    engineBoardStatus: engineResponse.status,
    engineBoardHasOdds: engineHasOdds,
    hubBoardHasOdds: hubHasOdds,
    hubVersion: hub.version,
    hubFetchedAt: hub.fetchedAt ?? null,
    hubAgeMs: hub.ageMs ?? null,
    referee: { mode: 'HUB_SNAPSHOT_FALLBACK', externalRequestsAdded: 0, requests: 0, queued: 0, errors: [] }
  };
  const enriched = await enrichBoardWithCachedFullMarket(fallbackBoard, env);
  return Response.json(enriched.board, { headers: { 'cache-control': 'no-store', 'x-ball46-board-source': enriched.changed ? 'hub-plus-central-full-market-cache' : 'hub-snapshot-fallback' } });
}

async function activeSignals(request, env) {
  const [signalResponse, boardResponse] = await Promise.all([
    env.ENGINE.fetch(engineRequest(request, '/signals')),
    engineBoardResponse(request, env)
  ]);
  const [signalData, boardData] = await Promise.all([
    signalResponse.json().catch(() => ({})),
    boardResponse.json().catch(() => ({}))
  ]);
  if (signalData?.ok !== true) return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  if (boardData?.ok !== true) return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: boardResponse.status || 503 });

  const fixtures = Array.isArray(boardData?.fixtures) ? boardData.fixtures : [];
  const liveFixtures = fixtures.filter(fixtureIsLive);
  const liveFixtureMap = new Map(liveFixtures.map(f => [String(f?.fixtureId ?? ''), f]));
  const pending = Array.isArray(signalData?.signals) ? signalData.signals : [];
  let hiddenPendingSignals = 0;
  const signals = pending.filter(signal => {
    const visible = liveFixtureMap.has(String(signal?.fixtureId ?? ''));
    if (!visible) hiddenPendingSignals += 1;
    return visible;
  }).map(signal => {
    const fixture = liveFixtureMap.get(String(signal.fixtureId));
    return {
      ...signal,
      mirrorMinute: liveMinute(fixture), mirrorScore:copy(fixture?.goals), mirrorState:'LIVE', mirrorSource:boardData?.engineBoardFallback?'HUB_SNAPSHOT_FALLBACK':'ENGINE_BOARD_LIVE',
      liveStatistics:copy(fixture?.statistics), liveCorners:copy(fixture?.corners), liveCards:copy(fixture?.cards),
      liveEvents:Array.isArray(fixture?.events)?copy(fixture.events):[], liveStatus:fixture?.status??null, liveStatusCode:fixture?.statusCode??null,
      liveUpdatedAt:boardData?.hubFetchedAt??boardData?.fetchedAt??null, liveAgeMs:num(boardData?.hubAgeMs??boardData?.ageMs)
    };
  }).sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));

  return Response.json({
    ...signalData,
    signals,
    mirror:{ source:boardData?.engineBoardFallback?'HUB_SNAPSHOT_FALLBACK':'ENGINE_BOARD_LIVE', externalRequestsAdded:0, boardFixtures:fixtures.length, liveFixtures:liveFixtures.length,
      activeMatches:new Set(signals.map(s=>String(s.fixtureId))).size, activeSignals:signals.length, hiddenPendingSignals,
      hubFetchedAt:boardData?.hubFetchedAt??boardData?.fetchedAt??null, hubAgeMs:num(boardData?.hubAgeMs??boardData?.ageMs), stale:Boolean(boardData?.stale) }
  }, { headers:{'cache-control':'no-store'} });
}

async function fullMarketCompat(request, env, path) {
  if (!env.FULL_MARKET) return Response.json({ok:false,error:'FULL_MARKET_SERVICE_NOT_BOUND'},{status:503,headers:{'cache-control':'no-store'}});
  if (path === '/health' || path === '/status') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/health'));
  if (path === '/fixture-odds') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'));
  if (path === '/settings') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/settings'));
  return Response.json({ok:false,error:'FULL_MARKET_ROUTE_NOT_FOUND'},{status:404,headers:{'cache-control':'no-store'}});
}

async function discoverLiveFixturesForPrewarm(env) {
  const request = new Request('https://ball46-cron.internal/board');
  const engineResponse = await env.ENGINE.fetch(engineRequest(request, '/board'));
  if (engineResponse.ok) {
    const board = await engineResponse.json().catch(() => null);
    if (board?.ok === true && Array.isArray(board.fixtures)) return liveFixtureIds(board);
  }
  const hubResponse = await env.HUB.fetch(hubRequest(request, '/snapshot'));
  if (!hubResponse.ok) return [];
  const hub = await hubResponse.json().catch(() => null);
  return hub?.ok === true && Array.isArray(hub.fixtures) ? liveFixtureIds(hub) : [];
}

async function prewarmLiveFullMarket(env) {
  if (!env.FULL_MARKET) return;
  const fixtureIds = await discoverLiveFixturesForPrewarm(env);
  if (!fixtureIds.length) return;
  const request = new Request('https://full-market.internal/prewarm', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({fixtureIds})
  });
  await env.FULL_MARKET.fetch(request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/hub/')) {
      const path = url.pathname.replace('/api/hub', '') || '/';
      return env.HUB.fetch(hubRequest(request, path));
    }
    if (url.pathname === '/api/engine/board' && request.method === 'GET') return engineBoardResponse(request, env);
    if (url.pathname === '/api/engine/signals' && request.method === 'GET') return activeSignals(request, env);
    if (url.pathname.startsWith('/api/engine/')) {
      const path = url.pathname.replace('/api/engine', '') || '/';
      return env.ENGINE.fetch(engineRequest(request, path));
    }
    if (url.pathname === '/api/full-market/settings') {
      if (!env.FULL_MARKET) return Response.json({ok:false,error:'FULL_MARKET_SERVICE_NOT_BOUND'},{status:503});
      return env.FULL_MARKET.fetch(fullMarketRequest(request, '/settings'));
    }
    if (url.pathname.startsWith('/api/full-market/')) {
      const path = url.pathname.replace('/api/full-market', '') || '/';
      return fullMarketCompat(request, env, path);
    }
    if (request.method === 'GET' && (
      url.pathname === '/index.html' || url.pathname === '/live.js' || url.pathname === '/full-odds-main-343.js' || url.pathname === '/event-flow-343.js' || url.pathname === '/event-flow-343.css' ||
      url.pathname === '/statistics.html' || url.pathname === '/statistics.js' || url.pathname === '/statistics-page-343.css' ||
      url.pathname === '/signal.html' || url.pathname === '/signal.js' || url.pathname === '/signal-compact-343.css' || url.pathname === '/signal-bettor-343.css' ||
      url.pathname === '/5usd-control.html' || url.pathname === '/detection-test.html'
    )) return noStoreUiAsset(request, env);
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url); assetUrl.pathname='/index.html'; return noStoreUiAsset(new Request(assetUrl,request),env);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(prewarmLiveFullMarket(env));
  }
};
