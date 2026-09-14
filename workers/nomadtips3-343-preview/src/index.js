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

function fullMarketEventScript() {
  return `(()=>{'use strict';
const SETTINGS_API='/api/full-market/settings',BOARD_API='/api/engine/board',EVENT_API='/api/full-market/event-refresh';
const POLL_MS=15000,TRIGGER_DEBOUNCE_MS=5000,settings={eventTrigger:true},seenScores=new Map(),seenEvents=new Map(),lastTriggered=new Map();let busy=false,lastSettingsAt=0;
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v),text=v=>String(v??'').toLowerCase();
const fixtureId=f=>String(f?.fixtureId??'').trim(),scoreKey=f=>{const h=num(f?.goals?.home),a=num(f?.goals?.away);return h===null||a===null?null:h+'-'+a};
const isLive=f=>{const s=text(f?.boardState??f?.status??f?.statusCode);return f?.boardState==='live'||/live|in_play|in play|playing|first|second|\\b1h\\b|\\b2h\\b/.test(s)};
const eventKey=e=>[e?.id,e?.eventId,e?.minute,e?.time?.elapsed,e?.type,e?.detail,e?.team?.id,e?.team?.name,e?.player?.id,e?.player?.name].map(v=>String(v??'')).join('|');
const criticalEvent=e=>/goal|penalty|red card|sending off|ใบแดง|จุดโทษ|ประตู/.test(text([e?.type,e?.detail,e?.name,e?.event,e?.description].filter(Boolean).join(' ')));
async function refreshSettings(force=false){if(!force&&Date.now()-lastSettingsAt<60000)return;lastSettingsAt=Date.now();try{const r=await fetch(SETTINGS_API+'?_='+Date.now(),{cache:'no-store'}),j=await r.json().catch(()=>null);if(r.ok&&j?.ok===true)settings.eventTrigger=Boolean(j?.control?.eventTrigger)}catch{}}
async function trigger(id,reason){const at=Date.now(),last=Number(lastTriggered.get(id)||0);if(at-last<TRIGGER_DEBOUNCE_MS)return;lastTriggered.set(id,at);try{const r=await fetch(EVENT_API+'?fixtureId='+encodeURIComponent(id)+'&reason='+encodeURIComponent(reason)+'&_='+at,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)return;window.NOMAD343_FULL_ODDS_MAIN?.reload?.(id)}catch{}}
function inspect(f){const id=fixtureId(f);if(!id||!isLive(f))return;const score=scoreKey(f),prev=seenScores.get(id);if(score!==null){if(prev!==undefined&&prev!==score)trigger(id,'GOAL_OR_SCORE_CHANGE');seenScores.set(id,score)}const events=Array.isArray(f?.events)?f.events:[];let known=seenEvents.get(id);if(!known){seenEvents.set(id,new Set(events.map(eventKey)));return}for(const e of events){const key=eventKey(e);if(!key||known.has(key))continue;known.add(key);if(criticalEvent(e))trigger(id,'CRITICAL_EVENT')}if(known.size>80)seenEvents.set(id,new Set(events.slice(-50).map(eventKey)))}
async function scan(){if(busy||document.visibilityState!=='visible')return;busy=true;try{await refreshSettings();if(!settings.eventTrigger)return;const r=await fetch(BOARD_API+'?_='+Date.now(),{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)return;(Array.isArray(j.fixtures)?j.fixtures:[]).forEach(inspect)}finally{busy=false}}
refreshSettings(true).finally(scan);setInterval(scan,POLL_MS);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan()});window.NOMAD343_FULL_MARKET_EVENT_TRIGGER={version:'343-full-market-event-trigger-v2-inline',scan};
})();`;
}

function fullMarketSettingsPage() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>3.43 · Full Market Settings</title><style>
:root{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#e7efe9;background:#09100b}*{box-sizing:border-box}body{margin:0;background:#09100b;color:#e7efe9}.top{border-bottom:1px solid #26342b;background:#0e1711}.top>div,.shell{max-width:1080px;margin:auto;padding:14px 16px}.brand{font-weight:900;letter-spacing:.02em}.brand span{color:#e8c758}.ver{font-size:10px;color:#748178;margin-top:2px}.head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin:18px 0 12px}.head h1{font-size:22px;margin:2px 0 6px}.head p{margin:0;color:#859289;font-size:11px}.pill{font-size:10px;font-weight:900;padding:7px 9px;border:1px solid #2b4734;background:#102017;color:#6fe28f;white-space:nowrap}.card{border:1px solid #304236;background:#0e1711}.cardhead{padding:13px 14px;border-bottom:1px solid #27362c}.cardhead small{color:#e8c758;font-weight:900}.cardhead h2{font-size:17px;margin:4px 0}.cardhead p{margin:0;color:#839087;font-size:10px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#27362c}.field{padding:13px;background:#111b14}.field label{display:block;font-size:10px;font-weight:900;margin-bottom:7px}.unit{display:flex;align-items:center;gap:7px}.unit input{min-width:0;width:100%;background:#09110c;color:#fff;border:1px solid #34473a;padding:10px;font-weight:900}.unit span{font-size:9px;color:#839087;white-space:nowrap}.field small{display:block;margin-top:7px;color:#77847b;font-size:9px;line-height:1.4}.field.event{grid-column:1/-1}.check{display:flex;align-items:center;gap:8px;background:#0b120e;border:1px solid #304236;padding:10px}.check input{accent-color:#54d97c;width:18px;height:18px}.meter{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#27362c}.metric{padding:11px 13px;background:#0c140f}.metric span{display:block;color:#7f8c83;font-size:8px}.metric b{display:block;margin-top:4px;font-size:13px}.green{color:#6fe28f}.yellow{color:#e8c758}.red{color:#ef8c86}.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-top:1px solid #29382e}.message{font-size:10px;color:#8c998f}.buttons{display:flex;gap:6px}.buttons button{border:0;padding:10px 12px;font-weight:900;cursor:pointer}.reset{background:#263029;color:#d4ded7}.save{background:#2c6a3d;color:#fff}.note{margin-top:10px;padding:10px;border-left:2px solid #e8c758;background:#111813;color:#929e96;font-size:10px;line-height:1.5}@media(max-width:760px){.head{display:block}.pill{display:inline-block;margin-top:10px}.grid,.meter{grid-template-columns:1fr 1fr}.field.event{grid-column:1/-1}.actions{align-items:flex-start;flex-direction:column}.buttons{width:100%}.buttons button{flex:1}}@media(max-width:430px){.grid,.meter{grid-template-columns:1fr}}
</style></head><body><header class="top"><div><div class="brand">nomad<span>tips3</span></div><div class="ver">3.43 · FULL MARKET REQUEST CONTROL</div></div></header><main class="shell"><section class="head"><div><small style="color:#e8c758;font-weight:900">FULL MARKET · 10 BOOKS</small><h1>ตั้งค่าการเรียก Full Market</h1><p>แยกจาก Engine / Signal / Statistics โดยสมบูรณ์</p></div><div class="pill" id="state">กำลังอ่านค่า</div></section><form class="card" id="form"><header class="cardhead"><small>5USD ULTRA</small><h2>Request Control</h2><p>ค่า Default ใหม่: 30s / 30s / Event ON / 24 per min · Account 40/min ล็อก</p></header><section class="grid"><div class="field"><label>Provider Refresh</label><div class="unit"><input name="refreshSeconds" type="number" min="10" max="120" step="1"><span>วินาที</span></div><small>รอบขั้นต่ำก่อน Full Market ยอมยิง 5USD ใหม่</small></div><div class="field"><label>Worker Cache</label><div class="unit"><input name="workerCacheSeconds" type="number" min="10" max="120" step="1"><span>วินาที</span></div><small>คู่เดิมใช้ cache ก่อนขอ provider ใหม่</small></div><div class="field"><label>Soft Limit</label><div class="unit"><input name="softLimitPerMinute" type="number" min="1" max="36" step="1"><span>req/min</span></div><small>Default 24 เพื่อเหลือพื้นที่ให้ระบบอื่น</small></div><div class="field"><label>Account Limit</label><div class="unit"><input id="account" value="40" readonly><span>req/min</span></div><small>อ่านอย่างเดียว · หน้านี้แก้ไม่ได้</small></div><div class="field event"><label>Event-trigger Refresh</label><div class="check"><input name="eventTrigger" type="checkbox"><b>ON · Goal / Red Card / Penalty ให้ขอราคาใหม่ทันที</b></div><small>Event-trigger ยังผ่าน Soft Limit ก่อนทุกครั้ง และกันยิงซ้ำเหตุการณ์เดียว 5 วินาที</small></div></section><section class="meter"><div class="metric"><span>USED · 60s</span><b id="used">—</b></div><div class="metric"><span>SOFT LIMIT</span><b id="soft">24</b></div><div class="metric"><span>ACCOUNT LIMIT</span><b>40</b></div><div class="metric"><span>STATUS</span><b id="rate">—</b></div></section><footer class="actions"><div class="message" id="message">พร้อมตั้งค่า</div><div class="buttons"><button type="button" class="reset" id="reset">RESET DEFAULT</button><button type="submit" class="save">บันทึก Full Market</button></div></footer></form><div class="note">หน้านี้คุมเฉพาะ Full Market 10-book เท่านั้น · ไม่แก้รอบ Bulk, Match Statistics, Events, Signal Engine หรือ Statistics page</div></main><script>
(()=>{'use strict';const API='/api/full-market/settings',form=document.getElementById('form'),state=document.getElementById('state'),msg=document.getElementById('message'),used=document.getElementById('used'),soft=document.getElementById('soft'),rate=document.getElementById('rate'),account=document.getElementById('account');let defaults={refreshSeconds:30,workerCacheSeconds:30,eventTrigger:true,softLimitPerMinute:24};const fields=()=>({refreshSeconds:Number(form.refreshSeconds.value),workerCacheSeconds:Number(form.workerCacheSeconds.value),eventTrigger:Boolean(form.eventTrigger.checked),softLimitPerMinute:Number(form.softLimitPerMinute.value)});function fill(c){form.refreshSeconds.value=c.refreshSeconds;form.workerCacheSeconds.value=c.workerCacheSeconds;form.eventTrigger.checked=Boolean(c.eventTrigger);form.softLimitPerMinute.value=c.softLimitPerMinute}function paint(j){const u=Number(j.usedInWindow||0),s=Number(j.control?.softLimitPerMinute||24),a=Number(j.accountLimitPerMinute||40);used.textContent=u;soft.textContent=s;account.value=a;rate.textContent=u>=s?'LIMIT':u>=s*.8?'WATCH':'CLEAR';rate.className=u>=s?'red':u>=s*.8?'yellow':'green';state.textContent='FULL MARKET ONLINE · '+j.control.refreshSeconds+'s';state.className='pill';defaults=j.defaults||defaults;fill(j.control)}async function load(){try{const r=await fetch(API+'?_='+Date.now(),{cache:'no-store'}),j=await r.json();if(!r.ok||j.ok!==true)throw Error(j.error||'HTTP_'+r.status);paint(j);msg.textContent='พร้อมตั้งค่า'}catch(e){state.textContent='FULL MARKET OFFLINE';state.className='pill red';msg.textContent='อ่านค่าไม่สำเร็จ · '+e.message}}async function save(c){const r=await fetch(API,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({control:c}),cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw Error(j?.error||'HTTP_'+r.status);paint(j)}form.addEventListener('submit',async e=>{e.preventDefault();const c=fields();if(c.refreshSeconds<10||c.refreshSeconds>120||c.workerCacheSeconds<10||c.workerCacheSeconds>120||c.softLimitPerMinute<1||c.softLimitPerMinute>36){msg.textContent='ค่าที่ตั้งอยู่นอกช่วงอนุญาต';return}msg.textContent='กำลังบันทึก…';try{await save(c);msg.textContent='บันทึกแล้ว'}catch(e){msg.textContent='บันทึกไม่สำเร็จ · '+e.message}});document.getElementById('reset').addEventListener('click',async()=>{msg.textContent='กำลังคืน Default…';try{await save(defaults);msg.textContent='คืน Default 30s / 30s / Event ON / 24/min แล้ว'}catch(e){msg.textContent='RESET ไม่สำเร็จ · '+e.message}});load();setInterval(load,30000)})();
</script></body></html>`;
}

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
  if (path === '/index.html' || path === '/live.js' || path === '/full-odds-main-343.js' || path.startsWith('/event-flow-343')) headers.set('x-nomad-live-revision', '343-live-full-market-settings-v1');
  if (path === '/index.html' && response.ok) {
    const html = await response.text();
    const injected = html.includes('</body>') ? html.replace('</body>', `<script>${fullMarketEventScript()}</script></body>`) : html;
    headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(injected, { status: response.status, statusText: response.statusText, headers });
  }
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
  if (signalData?.ok !== true) return Response.json(signalData || { ok: false, error: 'SIGNALS_NOT_READY' }, { status: signalResponse.status || 503 });
  if (boardData?.ok !== true) return Response.json({ ok: false, error: 'BOARD_NOT_READY', signals: [] }, { status: boardResponse.status || 503 });
  const fixtures = Array.isArray(boardData?.fixtures) ? boardData.fixtures : [];
  const liveFixtures = fixtures.filter(fixtureIsLive);
  const liveFixtureMap = new Map(liveFixtures.map(f => [String(f?.fixtureId ?? ''), f]));
  const pending = Array.isArray(signalData?.signals) ? signalData.signals : [];
  let hiddenPendingSignals = 0;
  const signals = pending.filter(signal => { const visible = liveFixtureMap.has(String(signal?.fixtureId ?? '')); if (!visible) hiddenPendingSignals += 1; return visible; }).map(signal => {
    const fixture = liveFixtureMap.get(String(signal.fixtureId));
    return { ...signal, mirrorMinute: liveMinute(fixture), mirrorScore: copy(fixture?.goals), mirrorState: 'LIVE', mirrorSource: 'ENGINE_BOARD_LIVE', liveStatistics: copy(fixture?.statistics), liveCorners: copy(fixture?.corners), liveCards: copy(fixture?.cards), liveEvents: Array.isArray(fixture?.events) ? copy(fixture.events) : [], liveStatus: fixture?.status ?? null, liveStatusCode: fixture?.statusCode ?? null, liveUpdatedAt: boardData?.hubFetchedAt ?? null, liveAgeMs: num(boardData?.hubAgeMs) };
  }).sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  const activeMatches = new Set(signals.map(s => String(s.fixtureId))).size;
  return Response.json({ ...signalData, signals, mirror: { source: 'ENGINE_BOARD_LIVE', externalRequestsAdded: 0, boardFixtures: fixtures.length, liveFixtures: liveFixtures.length, activeMatches, activeSignals: signals.length, hiddenPendingSignals, hubFetchedAt: boardData?.hubFetchedAt ?? null, hubAgeMs: num(boardData?.hubAgeMs), stale: Boolean(boardData?.stale) } }, { headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((url.pathname === '/full-market-settings' || url.pathname === '/full-market-settings.html') && request.method === 'GET') {
      return new Response(fullMarketSettingsPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
    }
    if (url.pathname === '/api/engine/signals' && request.method === 'GET') return activeSignals(request, env);
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
    )) return noStoreUiAsset(request, env);
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/index.html';
      return noStoreUiAsset(new Request(assetUrl, request), env);
    }
    return env.ASSETS.fetch(request);
  }
};
