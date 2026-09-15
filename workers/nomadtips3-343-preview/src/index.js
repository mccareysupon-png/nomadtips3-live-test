function engineRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'engine.internal';
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
  headers.set('x-nomad-ui-revision', '343-bettor-view-v1');
  if (path.startsWith('/statistics')) headers.set('x-nomad-stat-revision', '343-stat-results-v7-live-mirror');
  if (path.startsWith('/signal')) headers.set('x-nomad-signal-revision', '343-signal-bettor-v4');
  if (path === '/index.html' || path === '/live.js' || path === '/full-odds-main-343.js' || path.startsWith('/event-flow-343')) headers.set('x-nomad-live-revision', '343-live-full-market-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function mixerPage() {
  const html = String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>NOMAD 3.43 · API Mixer</title><style>
:root{font-family:Arial,Helvetica,sans-serif;background:#050d09;color:#edf8f1;--g:#32e67f;--y:#f5dc45;--r:#ff566b;--line:#1b5b40;--panel:#091a13}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#0b2a20 0,#07130f 40%,#050c09 100%)}header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;border-bottom:1px solid var(--line)}.brand{font-size:24px;font-weight:900}.brand b{color:var(--g)}.sub{font-size:11px;color:#8da69a;margin-top:3px}.state{display:flex;align-items:center;gap:8px;color:var(--g);font-size:12px;font-weight:800}.dot{width:9px;height:9px;border-radius:50%;background:var(--g);box-shadow:0 0 14px var(--g)}main{max-width:1120px;margin:auto;padding:16px}.notice,.panel,.card{border:1px solid var(--line);background:linear-gradient(180deg,#0a2018,#08150f);border-radius:10px}.notice{padding:13px 14px;margin-bottom:12px}.notice strong{color:#cffff0}.notice small{display:block;color:#90a99e;margin-top:5px;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card{padding:14px}.label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#88a398}.value{font-size:29px;font-weight:900;margin-top:7px}.green{color:var(--g)}.yellow{color:var(--y)}.red{color:var(--r)}.detail{font-size:10px;color:#9eb4aa;margin-top:6px;line-height:1.5}.bar{height:10px;margin-top:10px;border:1px solid #244f3d;background:#10231a;border-radius:6px;overflow:hidden}.fill{height:100%;width:0;background:var(--g);transition:.25s}.panel{margin-top:10px;padding:14px}.panelTop{display:flex;justify-content:space-between;align-items:center;gap:10px}.panel h2{font-size:14px;margin:0}.row{display:grid;grid-template-columns:190px 1fr;gap:10px;padding:8px 0;border-top:1px solid #143326;font-size:11px}.row:first-of-type{margin-top:10px}.k{color:#86a095}.muted{color:#879d92}.btn{border:1px solid #28885d;background:#0d3927;color:#ddffec;border-radius:6px;padding:8px 11px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.55}.foot{text-align:center;color:#71897e;font-size:9px;padding:14px 0 3px}@media(max-width:850px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){header{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.row{grid-template-columns:1fr;gap:2px}}
</style></head><body><header><div><div class="brand">NOMAD <b>3.43</b></div><div class="sub">API MIXER · SAFE READ-ONLY MONITOR</div></div><div class="state"><i class="dot"></i><span id="state">กำลังตรวจสอบ</span></div></header><main><section class="notice"><strong>SAFE MODE · กู้คืนเฉพาะหน้า Mixer</strong><small>หน้านี้อ่านเฉพาะ health state ภายใน ไม่ยิง 5USD provider และไม่ปรับรอบเครื่อง การควบคุม per-fixture รุ่นเก่าถูกล็อกไว้เพื่อป้องกัน request burst และไม่กระทบ 3.43 / 3.41</small></section><section class="grid"><article class="card"><div class="label">Full Market Worker</div><div class="value green" id="worker">CHECK</div><div class="detail" id="version">health only</div></article><article class="card"><div class="label">Provider used · 60s</div><div class="value" id="used">—</div><div class="bar"><div class="fill" id="fill"></div></div><div class="detail" id="limitText">ไม่สร้าง provider request เพิ่ม</div></article><article class="card"><div class="label">Soft guard</div><div class="value yellow" id="soft">—</div><div class="detail">เพดานป้องกันก่อนชน account limit</div></article><article class="card"><div class="label">Bookmakers</div><div class="value green" id="books">—</div><div class="detail">อ่านจำนวนที่ worker ตั้งไว้ · ไม่โหลด odds</div></article></section><section class="panel"><div class="panelTop"><h2>สถานะ Mixer</h2><button id="refresh" class="btn">REFRESH</button></div><div class="row"><div class="k">Mode</div><div class="green">READ ONLY · ISOLATED RESTORE</div></div><div class="row"><div class="k">Health endpoint</div><div>/api/full-market/health</div></div><div class="row"><div class="k">Provider request จาก Mixer</div><div class="green">0</div></div><div class="row"><div class="k">Legacy per-fixture controls</div><div class="yellow">LOCKED / NOT RESTORED</div></div><div class="row"><div class="k">Last update</div><div id="updated">—</div></div><div class="row"><div class="k">Detail</div><div id="detail" class="muted">รอข้อมูล</div></div></section><div class="foot">NOMADTIPS3 · 3.43 · Mixer isolated recovery</div></main><script>
(function(){var busy=false;function t(id,v){document.getElementById(id).textContent=v}function paint(used,limit){var p=limit>0?Math.max(0,Math.min(100,used/limit*100)):0;document.getElementById('fill').style.width=p+'%';var el=document.getElementById('used');el.className='value '+(p>=90?'red':p>=60?'yellow':'green')}async function load(){if(busy)return;busy=true;var b=document.getElementById('refresh');b.disabled=true;try{var r=await fetch('/api/full-market/health?mixer='+Date.now(),{cache:'no-store'});var j=await r.json();if(!r.ok||!j||j.ok!==true)throw new Error(j&&j.error?j.error:'HTTP '+r.status);var rate=j.rate||{},used=Number(rate.usedInWindow||0),limit=Number(rate.accountLimitPerMinute||40),soft=Number(rate.sidecarSoftLimitPerMinute||0),books=Array.isArray(j.bookmakers)?j.bookmakers.length:0;t('worker','ONLINE');t('version',j.version||j.component||'NOMAD343_FULL_MARKET');t('used',used+' / '+limit);t('soft',soft?soft+' / min':'—');t('books',books||'—');t('limitText','Account limit '+limit+'/min · health read only');t('state','READ ONLY · ONLINE');t('updated',new Date().toLocaleString());t('detail','Health OK · cached state only · ไม่มี provider fetch จาก Mixer');paint(used,limit)}catch(e){t('worker','OFFLINE');t('state','MIXER HEALTH ERROR');t('detail',String(e&&e.message||e));document.getElementById('worker').className='value red'}finally{busy=false;b.disabled=false}}document.getElementById('refresh').addEventListener('click',load);load();setInterval(load,15000)})();
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', 'pragma': 'no-cache', 'x-nomad-mixer-revision': '343-mixer-isolated-readonly-v1' } });
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
  if (match) return Number(match[0]);
  return null;
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
        mirrorMinute: liveMinute(fixture),
        mirrorScore: copy(fixture?.goals),
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
    if (request.method === 'GET' && (url.pathname === '/api/full-market/mixer.html' || url.pathname === '/api/full-market/mixer')) {
      return mixerPage();
    }
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
    if (url.pathname.startsWith('/api/full-market/')) {
      const path = url.pathname.replace('/api/full-market', '') || '/';
      return env.FULL_MARKET.fetch(fullMarketRequest(request, path));
    }
    if (request.method === 'GET' && (
      url.pathname === '/index.html' || url.pathname === '/live.js' || url.pathname === '/full-odds-main-343.js' || url.pathname === '/event-flow-343.js' || url.pathname === '/event-flow-343.css' ||
      url.pathname === '/statistics.html' || url.pathname === '/statistics.js' || url.pathname === '/statistics-page-343.css' ||
      url.pathname === '/signal.html' || url.pathname === '/signal.js' || url.pathname === '/signal-compact-343.css' || url.pathname === '/signal-bettor-343.css'
    )) {
      return noStoreUiAsset(request, env);
    }
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/index.html';
      return noStoreUiAsset(new Request(assetUrl, request), env);
    }
    return env.ASSETS.fetch(request);
  }
};