function serviceRequest(request, hostname, path) {
  const u = new URL(request.url);
  u.protocol = 'https:';
  u.hostname = hostname;
  u.pathname = path;
  return new Request(u, request);
}

const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const copy = v => v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v ?? null;

async function noStoreUiAsset(request, env) {
  const r = await env.ASSETS.fetch(request);
  const h = new Headers(r.headers);
  const path = new URL(request.url).pathname;
  h.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  h.set('pragma', 'no-cache');
  h.set('expires', '0');
  h.set('x-nomad-ui-revision', '343-bulk-snapshot-zero-click-v4-rich-overlay');
  if (path.startsWith('/statistics')) h.set('x-nomad-stat-revision', '343-stat-results-v7-live-mirror');
  if (path.startsWith('/signal')) h.set('x-nomad-signal-revision', '343-signal-bettor-v4');
  if (path === '/index.html' || path.startsWith('/expanded-match-343') || path.startsWith('/full-market-bookmaker-343')) h.set('x-nomad-live-revision', '343-bulk-snapshot-zero-click-v4-rich-overlay');
  if (path === '/dashboard-v2-api-monitor.html') h.set('x-nomad-api-center-revision', '343-api-control-monitor-v2-restored');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

function fixtureIsLive(f) {
  const raw = String(f?.boardState ?? f?.status ?? f?.statusCode ?? '').toLowerCase();
  if (f?.boardState === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return false;
  return f?.boardState === 'live' || /in_play|in play|live|playing|first|second|\b1h\b|\b2h\b/.test(raw);
}

function liveMinute(f) {
  const d = num(f?.minute);
  if (d !== null) return d;
  const m = String(f?.statusCode ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function activeSignals(request, env) {
  const [sr, br] = await Promise.all([
    env.ENGINE.fetch(serviceRequest(request, 'engine.internal', '/signals')),
    env.ENGINE.fetch(serviceRequest(request, 'engine.internal', '/board'))
  ]);
  const [s, b] = await Promise.all([
    sr.json().catch(() => ({})),
    br.json().catch(() => ({}))
  ]);
  if (s?.ok !== true) return Response.json(s || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: sr.status || 503 });
  if (b?.ok !== true) return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: br.status || 503 });
  const fixtures = Array.isArray(b.fixtures) ? b.fixtures : [];
  const live = fixtures.filter(fixtureIsLive);
  const map = new Map(live.map(f => [String(f?.fixtureId ?? ''), f]));
  const pending = Array.isArray(s.signals) ? s.signals : [];
  let hidden = 0;
  const signals = pending
    .filter(x => {
      const ok = map.has(String(x?.fixtureId ?? ''));
      if (!ok) hidden++;
      return ok;
    })
    .map(x => {
      const f = map.get(String(x.fixtureId));
      return {
        ...x,
        mirrorMinute: liveMinute(f),
        mirrorScore: copy(f?.goals),
        mirrorState: 'LIVE',
        mirrorSource: 'ENGINE_BOARD_LIVE',
        liveStatistics: copy(f?.statistics),
        liveCorners: copy(f?.corners),
        liveCards: copy(f?.cards),
        liveEvents: Array.isArray(f?.events) ? copy(f.events) : [],
        liveStatus: f?.status ?? null,
        liveStatusCode: f?.statusCode ?? null,
        liveUpdatedAt: b?.hubFetchedAt ?? null,
        liveAgeMs: num(b?.hubAgeMs)
      };
    })
    .sort((a, c) => Number(c?.createdAt || 0) - Number(a?.createdAt || 0));
  return Response.json({
    ...s,
    signals,
    mirror: {
      source: 'ENGINE_BOARD_LIVE',
      externalRequestsAdded: 0,
      boardFixtures: fixtures.length,
      liveFixtures: live.length,
      activeMatches: new Set(signals.map(x => String(x.fixtureId))).size,
      activeSignals: signals.length,
      hiddenPendingSignals: hidden,
      hubFetchedAt: b?.hubFetchedAt ?? null,
      hubAgeMs: num(b?.hubAgeMs),
      stale: Boolean(b?.stale)
    }
  }, { headers: { 'cache-control': 'no-store' } });
}

async function boardWithHubOdds(request, env) {
  const [br, hr] = await Promise.all([
    env.ENGINE.fetch(serviceRequest(request, 'engine.internal', '/board')),
    env.HUB.fetch(serviceRequest(request, 'hub.internal', '/snapshot-rich'))
  ]);
  const [b, h] = await Promise.all([
    br.json().catch(() => ({})),
    hr.json().catch(() => ({}))
  ]);
  if (b?.ok !== true) return Response.json(b || { ok: false, error: 'BOARD_NOT_READY' }, { status: br.status || 503 });
  const sourceRows = h?.ok === true && Array.isArray(h.fixtures) ? h.fixtures : [];
  const rich = new Map(sourceRows.filter(x => fixtureIsLive(x) && x?.richOddsSource === 'CENTRAL_SCHEDULED_PER_FIXTURE').map(x => [String(x.fixtureId ?? ''), x]));
  let overlaid = 0;
  const fixtures = (Array.isArray(b.fixtures) ? b.fixtures : []).map(f => {
    const r = rich.get(String(f?.fixtureId ?? ''));
    if (!r) return f;
    overlaid++;
    return {
      ...f,
      providerOdds: copy(r.providerOdds),
      providerOddsUpdatedAt: r.providerOddsUpdatedAt ?? f.providerOddsUpdatedAt ?? null,
      richOddsUpdatedAt: r.richOddsUpdatedAt ?? null,
      richOddsBookmakerCount: r.richOddsBookmakerCount ?? 0,
      richOddsSource: r.richOddsSource,
      snapshotOddsView: 'RICH_UI_FULL'
    };
  });
  return Response.json({
    ...b,
    fixtures,
    hubVersion: h?.version ?? b.hubVersion,
    hubFetchedAt: h?.fetchedAt ?? b.hubFetchedAt,
    hubAgeMs: num(h?.ageMs) ?? b.hubAgeMs,
    stale: h?.stale ?? b.stale,
    richOdds: h?.richOdds ?? null,
    oddsOverlay: {
      source: 'HUB_RICH_SNAPSHOT_ZERO_CLICK',
      snapshotMode: h?.snapshotMode ?? null,
      viewVersion: h?.viewVersion ?? null,
      enrichedFixtures: overlaid,
      externalRequestsAdded: 0,
      clickRequests: 0
    }
  }, { headers: { 'cache-control': 'no-store' } });
}

async function hubRoute(request, env, path) {
  if (!env.HUB) return Response.json({ ok: false, error: 'HUB_BINDING_MISSING' }, { status: 503 });
  const isRead = request.method === 'GET' && ['/health', '/status', '/control'].includes(path);
  const isWrite = request.method === 'POST' && path === '/control';
  if (!isRead && !isWrite) return Response.json({ ok: false, error: 'HUB_ROUTE_NOT_ALLOWED' }, { status: 405 });

  let upstreamRequest;
  if (isWrite) {
    const u = new URL(request.url);
    u.protocol = 'https:';
    u.hostname = 'hub.internal';
    u.pathname = path;
    upstreamRequest = new Request(u, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nomad-internal-control': 'preview-binding-v1'
      },
      body: await request.text()
    });
  } else {
    upstreamRequest = serviceRequest(request, 'hub.internal', path);
  }

  const response = await env.HUB.fetch(upstreamRequest);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-nomad-monitor-read-only', isRead ? '1' : '0');
  if (isWrite) headers.set('x-nomad-owner-control', 'internal-service-binding');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (u.pathname === '/api/engine/signals' && request.method === 'GET') {
      return activeSignals(request, env);
    }
    if (u.pathname === '/api/engine/board' && request.method === 'GET') {
      return boardWithHubOdds(request, env);
    }
    if (u.pathname.startsWith('/api/engine/')) {
      return env.ENGINE.fetch(serviceRequest(request, 'engine.internal', u.pathname.replace('/api/engine', '') || '/'));
    }
    if (u.pathname.startsWith('/api/hub/')) {
      return hubRoute(request, env, u.pathname.replace('/api/hub', '') || '/');
    }
    if (u.pathname.startsWith('/api/full-market/')) {
      return Response.json({ ok: false, error: 'FULL_MARKET_CLICK_ROUTE_REMOVED', source: 'BULK_SNAPSHOT_ONLY' }, { status: 410, headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && u.pathname === '/dashboard-v2-api-control.html') {
      const target = new URL('/dashboard-v2-api-monitor.html', request.url);
      return Response.redirect(target.toString(), 302);
    }

    if (request.method === 'GET' && (
      u.pathname === '/index.html' ||
      u.pathname.startsWith('/expanded-match-343') ||
      u.pathname.startsWith('/full-market-bookmaker-343') ||
      u.pathname === '/statistics.html' ||
      u.pathname === '/statistics.js' ||
      u.pathname === '/statistics-page-343.css' ||
      u.pathname === '/signal.html' ||
      u.pathname === '/signal.js' ||
      u.pathname === '/signal-compact-343.css' ||
      u.pathname === '/signal-bettor-343.css' ||
      u.pathname === '/dashboard-v2-api-monitor.html'
    )) {
      return noStoreUiAsset(request, env);
    }

    if (u.pathname === '/') {
      const a = new URL(request.url);
      a.pathname = '/index.html';
      return noStoreUiAsset(new Request(a, request), env);
    }

    return env.ASSETS.fetch(request);
  }
};
