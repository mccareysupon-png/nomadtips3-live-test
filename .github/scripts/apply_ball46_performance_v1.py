from pathlib import Path

# 1) Dashboard: render Board first; Signals must never block first card/odds paint.
dash=Path('nomad-live-343/dashboard-v2-stage3.js')
s=dash.read_text()
s=s.replace("const POLL_MS=30_000;\n", "const POLL_MS=30_000;\nconst SIGNAL_POLL_MS=30_000;\nconst SIGNAL_AFTER_BOARD_MS=1000;\n", 1)
s=s.replace("async function loadSignals(){try{", "async function loadSignals(){if(document.visibilityState==='hidden')return;try{", 1)
old="async function load(){if(loading||(hasLoaded&&document.visibilityState==='hidden'))return;loading=true;try{const [board]=await Promise.all([fetchJson(API),loadSignals()]);if(board?.ok!==true)throw new Error(board?.error||'BOARD_NOT_READY');"
new="async function load(){if(loading||(hasLoaded&&document.visibilityState==='hidden'))return;loading=true;try{const board=await fetchJson(API);if(board?.ok!==true)throw new Error(board?.error||'BOARD_NOT_READY');"
if old not in s: raise SystemExit('dashboard load anchor not found')
s=s.replace(old,new,1)
old="function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}}"
new="function startSignalLoopAfterBoard(){let started=false;const begin=()=>{if(started)return;started=true;setTimeout(()=>{loadSignals();setInterval(loadSignals,SIGNAL_POLL_MS)},SIGNAL_AFTER_BOARD_MS)};const onReady=()=>{if(hasLoaded){window.removeEventListener('ball46:board-first-paint',onReady);begin()}};window.addEventListener('ball46:board-first-paint',onReady);return begin}\nfunction start(){initControls();const beginSignals=startSignalLoopAfterBoard();const first=load();Promise.resolve(first).finally(()=>{window.dispatchEvent(new CustomEvent('ball46:board-first-paint'));beginSignals()});setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BOARD_FIRST_THEN_SIGNALS',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}}"
if old not in s: raise SystemExit('dashboard start anchor not found')
s=s.replace(old,new,1)
dash.write_text(s)

# 2) Workspace Statistics: use compact read-only route. No Board/Signals/provider call.
sp=Path('nomad-live-343/singlepage-workspace-343.js')
s=sp.read_text()
if "const STAT_API='/api/engine/statistics';" not in s: raise SystemExit('statistics api anchor not found')
s=s.replace("const STAT_API='/api/engine/statistics';", "const STAT_API='/api/engine/statistics-lite';", 1)
sp.write_text(s)

# 3) Ball46 wrapper: lightweight statistics response, de-duplicate heavy signal mirroring path,
#    and give versioned static assets long browser cache.
worker=Path('workers/nomadtips3-343-preview/src/index.js')
s=worker.read_text()
anchor="const copy = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value ?? null;\n"
insert="""
const STAT_LITE_CACHE_MS = 30_000;
let statLiteCache = { at:0, body:null, promise:null };

function compactStatisticsRow(row) {
  return {
    id: row?.id ?? null,
    fixtureId: row?.fixtureId ?? null,
    league: row?.league ? { country:row.league.country ?? null, name:row.league.name ?? null } : null,
    home: row?.home ? { name:row.home.name ?? null } : null,
    away: row?.away ? { name:row.away.name ?? null } : null,
    market: row?.market ?? null,
    marketLabel: row?.marketLabel ?? null,
    providerMarket: row?.providerMarket ?? null,
    period: row?.period ?? null,
    selection: row?.selection ?? row?.pick ?? null,
    pick: row?.pick ?? null,
    line: row?.line ?? row?.selectionLine ?? null,
    odds: row?.odds ?? null,
    bookmaker: row?.bookmaker ?? null,
    createdAt: row?.createdAt ?? null,
    settledAt: row?.settledAt ?? row?.reconciledAt ?? null,
    entryScore: copy(row?.entryScore ?? row?.scoreAt),
    scoreAt: copy(row?.scoreAt ?? row?.entryScore),
    finalScore: copy(row?.finalScore),
    result: row?.result ?? row?.settlement ?? row?.outcome ?? null,
    settlement: row?.settlement ?? null,
    outcome: row?.outcome ?? null
  };
}

function statLiteResponse(body, cacheState='MISS') {
  return new Response(body, { headers:{
    'content-type':'application/json; charset=UTF-8',
    'cache-control':'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
    'x-ball46-statistics':'lite-v1',
    'x-ball46-stat-cache':cacheState
  }});
}

async function statisticsLite(request, env) {
  const age=Date.now()-Number(statLiteCache.at||0);
  if (statLiteCache.body && age < STAT_LITE_CACHE_MS) return statLiteResponse(statLiteCache.body,'HIT');
  if (!statLiteCache.promise) {
    statLiteCache.promise=(async()=>{
      const upstream=await env.ENGINE.fetch(engineRequest(request,'/statistics'));
      const data=await upstream.json().catch(()=>null);
      if (!upstream.ok || data?.ok!==true || !Array.isArray(data?.rows)) {
        throw Object.assign(new Error('STATISTICS_NOT_READY'),{status:upstream.status||503});
      }
      const payload={...data, rows:data.rows.map(compactStatisticsRow), compact:true, compactVersion:'stats-lite-v1'};
      const body=JSON.stringify(payload);
      statLiteCache={at:Date.now(),body,promise:null};
      return body;
    })().catch(err=>{statLiteCache.promise=null;throw err});
  }
  try { return statLiteResponse(await statLiteCache.promise,'MISS'); }
  catch (err) { return Response.json({ok:false,error:String(err?.message||err)},{status:Number(err?.status||503),headers:{'cache-control':'no-store'}}); }
}

async function versionedUiAsset(request, env) {
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);
  headers.set('cache-control','public, max-age=31536000, immutable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
"""
if insert.strip() not in s:
    if anchor not in s: raise SystemExit('worker copy anchor not found')
    s=s.replace(anchor,anchor+insert,1)

# Signals only need score/live stats mirror; do not run full-market odds enrichment again.
active_anchor="async function activeSignals(request, env) {\n"
signal_helper="""async function signalBoardData(request, env) {
  const engineResponse=await env.ENGINE.fetch(engineRequest(request,'/board'));
  if (engineResponse.ok) {
    const board=await engineResponse.json().catch(()=>null);
    if (board?.ok===true && Array.isArray(board?.fixtures)) return board;
  }
  const hubResponse=await env.HUB.fetch(hubRequest(request,'/snapshot'));
  if (!hubResponse.ok) return null;
  const hub=await hubResponse.json().catch(()=>null);
  return hub?.ok===true && Array.isArray(hub?.fixtures) ? {...hub,engineBoardFallback:true} : null;
}

"""
if signal_helper.strip() not in s:
    if active_anchor not in s: raise SystemExit('activeSignals anchor not found')
    s=s.replace(active_anchor,signal_helper+active_anchor,1)
old="""  const [signalResponse, boardResponse] = await Promise.all([
    env.ENGINE.fetch(engineRequest(request, '/signals')),
    engineBoardResponse(request, env)
  ]);
  const [signalData, boardData] = await Promise.all([
    signalResponse.json().catch(() => ({})),
    boardResponse.json().catch(() => ({}))
  ]);
  if (signalData?.ok !== true) return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  if (boardData?.ok !== true) return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: boardResponse.status || 503 });
"""
new="""  const [signalResponse, boardData] = await Promise.all([
    env.ENGINE.fetch(engineRequest(request, '/signals')),
    signalBoardData(request, env)
  ]);
  const signalData = await signalResponse.json().catch(() => ({}));
  if (signalData?.ok !== true) return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  if (boardData?.ok !== true) return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: 503 });
"""
if old not in s: raise SystemExit('activeSignals heavy board anchor not found')
s=s.replace(old,new,1)

route="    if (url.pathname === '/api/engine/signals' && request.method === 'GET') return activeSignals(request, env);\n"
if route not in s: raise SystemExit('worker signals route anchor not found')
s=s.replace(route,route+"    if (url.pathname === '/api/engine/statistics-lite' && request.method === 'GET') return statisticsLite(request, env);\n",1)

asset_anchor="""    if (url.pathname === '/') {
      const assetUrl = new URL(request.url); assetUrl.pathname='/index.html'; return noStoreUiAsset(new Request(assetUrl,request),env);
    }
    return env.ASSETS.fetch(request);
"""
asset_new="""    if (url.pathname === '/') {
      const assetUrl = new URL(request.url); assetUrl.pathname='/index.html'; return noStoreUiAsset(new Request(assetUrl,request),env);
    }
    if (request.method === 'GET' && url.searchParams.has('v') && /\\.(?:js|css|svg)$/.test(url.pathname)) return versionedUiAsset(request, env);
    return env.ASSETS.fetch(request);
"""
if asset_anchor not in s: raise SystemExit('asset route anchor not found')
s=s.replace(asset_anchor,asset_new,1)
worker.write_text(s)
