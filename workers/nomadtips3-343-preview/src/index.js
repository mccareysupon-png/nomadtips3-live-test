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

function hubRequest(request, path) {
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = 'hub.internal';
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
  const html = String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>NOMAD 3.43 · Bulk Live Speed</title><style>
:root{font-family:Arial,Helvetica,sans-serif;background:#07100c;color:#eef6f0;--bg:#07100c;--panel:#0d1711;--panel2:#111d16;--line:rgba(155,190,168,.13);--text:#eef6f0;--muted:#91a096;--green:#83df89;--green2:#b7f0bb;--yellow:#f2d21b;--orange:#f1a14e;--red:#ff8383}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 82% 0,#103226 0,#0b1711 38%,#07100c 72%);color:var(--text)}button,select{font:inherit}.top{min-height:66px;padding:14px 20px;border-bottom:1px solid rgba(131,223,137,.16);background:linear-gradient(90deg,#123328,#125c45,#123328);display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-size:21px;font-weight:900;letter-spacing:.03em}.brand b{color:#bdf5c0}.sub{font-size:11px;color:#c2d7ca;margin-top:3px}.online{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;color:#dfffe1}.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}main{max-width:1160px;margin:auto;padding:18px}.intro{margin-bottom:14px}.intro h1{font-size:21px;margin:0 0 6px}.intro p{font-size:12px;line-height:1.65;color:var(--muted);margin:0}.status{display:grid;grid-template-columns:1.25fr .8fr .8fr .8fr;gap:10px}.card,.box{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:12px}.card{padding:15px}.eyebrow{font-size:9px;font-weight:900;letter-spacing:.09em;color:#83958a;text-transform:uppercase}.big{font-size:31px;font-weight:900;margin-top:7px;line-height:1}.unit{font-size:13px;color:#a8b6ad;margin-left:4px}.small{font-size:10px;color:var(--muted);margin-top:8px;line-height:1.5}.green{color:var(--green)}.yellow{color:var(--yellow)}.orange{color:var(--orange)}.red{color:var(--red)}.section{margin-top:12px;padding:16px}.sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:12px}.section h2{font-size:15px;margin:0}.sectionHead small{font-size:10px;color:var(--muted);text-align:right}.presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.preset{border:1px solid rgba(160,188,170,.15);background:#0b1510;color:#b8c4bc;border-radius:10px;padding:11px 8px;cursor:pointer;text-align:center;transition:.12s ease}.preset:hover{border-color:rgba(131,223,137,.45);color:#e8ffea}.preset strong{display:block;font-size:20px;color:#e9f3ec}.preset span{display:block;font-size:9px;margin-top:5px;color:#84948a}.preset.active{border-color:rgba(131,223,137,.8);background:#12251a;box-shadow:inset 0 0 0 1px rgba(131,223,137,.14)}.preset.active strong{color:var(--green)}.preset.extreme strong{color:var(--orange)}.preset.extreme.active{border-color:rgba(241,161,78,.85);background:#281b10}.preset.extreme.active strong{color:#ffc17e}.explain{margin-top:12px;padding:11px 12px;background:rgba(131,223,137,.045);border-radius:9px;font-size:11px;color:#aebbb3;line-height:1.65}.explain b{color:#dfffe2}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.autoChoices{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.auto{border:1px solid rgba(160,188,170,.14);background:#0b1510;color:#aebbb3;border-radius:8px;padding:9px 6px;font-size:10px;font-weight:800;cursor:pointer}.auto.active{border-color:rgba(131,223,137,.7);color:var(--green);background:#12251a}.miniRows{margin-top:10px}.mini{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid rgba(160,188,170,.08);font-size:10px}.mini:first-child{border-top:0}.mini span{color:#87978d}.mini b{text-align:right}.alert{display:none;margin-top:12px;padding:11px 12px;border:1px solid rgba(255,131,131,.32);background:rgba(255,100,100,.07);border-radius:9px;font-size:10px;line-height:1.55;color:#ffc0c0}.alert.show{display:block}.actions{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}.btn{border:1px solid rgba(131,223,137,.35);background:#12251a;color:#dffff0;border-radius:9px;padding:10px 15px;font-size:11px;font-weight:900;cursor:pointer}.btn.primary{background:#1b613c;border-color:#36b96a;color:#fff}.btn.secondary{background:#101812;color:#aebbb3}.btn:disabled{opacity:.55;cursor:wait}.saveNote{font-size:10px;color:#8ea096;align-self:center;margin-right:auto}.foot{text-align:center;color:#65756c;font-size:9px;padding:16px 0 4px}@media(max-width:900px){.status{grid-template-columns:1fr 1fr}.presets{grid-template-columns:repeat(3,1fr)}.two{grid-template-columns:1fr}}@media(max-width:560px){.top{align-items:flex-start;flex-direction:column}.online{font-size:10px}main{padding:12px}.status{grid-template-columns:1fr 1fr}.card{padding:12px}.big{font-size:25px}.presets{grid-template-columns:repeat(2,1fr)}.autoChoices{grid-template-columns:1fr 1fr}.sectionHead{align-items:flex-start;flex-direction:column}.sectionHead small{text-align:left}.actions{display:grid;grid-template-columns:1fr 1fr}.saveNote{grid-column:1/-1}.btn{width:100%}}
</style></head><body><header class="top"><div><div class="brand">NOMAD <b>3.43</b></div><div class="sub">ศูนย์ควบคุมความเร็ว 5USD · Bulk Live</div></div><div class="online"><i class="dot"></i><span id="sys">กำลังอ่านสถานะ</span></div></header><main><section class="intro"><h1>ความเร็วการดึงบอลสดทั้งกระดาน</h1><p>ตั้งค่าความถี่ของ <b>Bulk Live</b> เท่านั้น — 1 รอบเรียกข้อมูลบอลสดทั้งชุดในครั้งเดียว ไม่ยิงทีละคู่ ตามแนวทางที่ผู้ให้บริการแนะนำ</p></section><section class="status"><article class="card"><div class="eyebrow">รอบปัจจุบัน</div><div class="big green"><span id="currentSec">—</span><span class="unit">วินาที</span></div><div class="small" id="modeText">กำลังตรวจสอบ</div></article><article class="card"><div class="eyebrow">Bulk Live</div><div class="big"><span id="rpm">—</span><span class="unit">req/min</span></div><div class="small">ประมาณจากรอบที่เลือก</div></article><article class="card"><div class="eyebrow">เพดานบัญชี Ultra</div><div class="big"><span>40</span><span class="unit">/min</span></div><div class="small">ใช้ร่วมกับบริการอื่นในบัญชี</div></article><article class="card"><div class="eyebrow">เหลือก่อนนับส่วนอื่น</div><div class="big"><span id="headroom">—</span><span class="unit">/min</span></div><div class="small">ค่าประมาณ ไม่ใช่โควตาคงเหลือจริง</div></article></section><section class="box section"><div class="sectionHead"><div><h2>เลือกความเร็ว</h2></div><small>เลขยิ่งน้อย = ข้อมูลยิ่งสด · ถ้าพบ 429 ให้เพิ่มจำนวนวินาที</small></div><div class="presets" id="presets"><button class="preset" data-sec="120"><strong>120s</strong><span>ประหยัด</span></button><button class="preset" data-sec="60"><strong>60s</strong><span>ปกติ</span></button><button class="preset" data-sec="30"><strong>30s</strong><span>เร็ว</span></button><button class="preset" data-sec="15"><strong>15s</strong><span>เร็วมาก</span></button><button class="preset" data-sec="6"><strong>6s</strong><span>เทอร์โบ</span></button><button class="preset" data-sec="3"><strong>3s</strong><span>เร็วสุดแนะนำ</span></button></div><div style="margin-top:8px"><button class="preset extreme" data-sec="2" style="width:100%;max-width:185px"><strong>2s</strong><span>EXTREME · 30 req/min</span></button></div><div class="explain"><b>หลักการ:</b> Bulk Live ใช้ <b>1 HTTP request ต่อรอบ</b> และขอ <b>per_page=500</b> สำหรับ live board ทั้งชุด ส่วน Today / Schedule / Finished ยังคงรอบ 120 วินาทีแยกต่างหาก จึงไม่ถูกเร่งตามปุ่มนี้</div></section><section class="two"><article class="box section"><div class="sectionHead"><h2>กลับค่าปกติอัตโนมัติ</h2><small>ครบเวลาแล้วกลับ 120 วินาที</small></div><div class="autoChoices"><button class="auto" data-min="0">ปิด</button><button class="auto" data-min="30">30 นาที</button><button class="auto" data-min="60">60 นาที</button><button class="auto" data-min="120">120 นาที</button></div><div class="miniRows"><div class="mini"><span>ค่าที่เลือก</span><b id="chosenText">—</b></div><div class="mini"><span>เวลาคืนค่า</span><b id="returnText">ปิด</b></div></div></article><article class="box section"><div class="sectionHead"><h2>สถานะระบบ</h2><small>อ่านจาก HUB โดยไม่สร้าง provider request เพิ่ม</small></div><div class="miniRows"><div class="mini"><span>ข้อมูลล่าสุด</span><b id="ageText">—</b></div><div class="mini"><span>บอลสด</span><b id="liveCount">—</b></div><div class="mini"><span>รอบ Today/Schedule</span><b>120 วินาที</b></div><div class="mini"><span>รอบถัดไป</span><b id="nextText">—</b></div></div><div class="alert" id="alert429"><b>ตรวจพบ 429</b><br><span id="alertText">ลดความเร็วหรือรอตาม Retry-After</span></div></article></section><div class="actions"><span class="saveNote" id="saveNote">เลือกค่าที่ต้องการ แล้วกด “ใช้ทันที”</span><button class="btn secondary" id="reset">คืนค่า 120s</button><button class="btn primary" id="save">ใช้ทันที</button></div><div class="foot">NOMADTIPS3 · 3.43 · Bulk Live Control · Full Market / Signal Rules ไม่ถูกแก้จากหน้านี้</div></main><script>
(()=>{'use strict';const API='/api/hub/control',presets=[120,60,30,15,6,3,2],autos=[0,30,60,120],$=id=>document.getElementById(id);let selected=120,auto=0,dirty=false,busy=false,last=null;const req=s=>Math.round(60/Number(s)*10)/10;function mode(s){if(s<=2)return['EXTREME','orange'];if(s<=3)return['เร็วสุดแนะนำ','green'];if(s<=6)return['เทอร์โบ','green'];if(s<=15)return['เร็วมาก','green'];if(s<=30)return['เร็ว','green'];if(s<=60)return['ปกติ','green'];return['ประหยัด','green']}function fmtTime(ts){if(!ts)return'—';try{return new Date(ts).toLocaleTimeString('th-TH',{hour12:false})}catch{return'—'}}function age(ms){if(ms===null||ms===undefined)return'—';const s=Math.max(0,Math.round(Number(ms)/1000));return s<60?s+' วินาที':Math.floor(s/60)+' นาที '+s%60+' วินาที'}function paintChoice(){document.querySelectorAll('[data-sec]').forEach(b=>b.classList.toggle('active',Number(b.dataset.sec)===selected));document.querySelectorAll('[data-min]').forEach(b=>b.classList.toggle('active',Number(b.dataset.min)===auto));const r=req(selected),m=mode(selected);$('chosenText').textContent='ทุก '+selected+' วินาที · ~'+r+' req/min';$('returnText').textContent=auto?auto+' นาที → 120s':'ปิด';$('modeText').textContent=m[0];$('modeText').className='small '+m[1];$('rpm').textContent=r;$('headroom').textContent=Math.max(0,Math.round((40-r)*10)/10)}function paintStatus(j){last=j;const c=j.control||j.health?.control||{},sec=Number(c.liveRefreshSeconds||120);if(!dirty){selected=presets.includes(sec)?sec:120;auto=autos.includes(Number(c.autoReturnMinutes))?Number(c.autoReturnMinutes):0}paintChoice();$('currentSec').textContent=sec;$('sys').textContent=j.ok===false?'HUB ERROR':'HUB ONLINE';$('ageText').textContent=age(j.ageMs);$('liveCount').textContent=String(j.counts?.live??'—');$('nextText').textContent=j.nextAlarmAt?fmtTime(j.nextAlarmAt):'กำลังจัดรอบ';const alert=$('alert429');if(j.lastRateLimitAt){alert.classList.add('show');$('alertText').textContent='ล่าสุด '+fmtTime(j.lastRateLimitAt)+(j.retryAfterSec?' · Retry-After '+j.retryAfterSec+'s':'')+' · หากเกิดซ้ำให้เพิ่มจำนวนวินาที'}else alert.classList.remove('show')}async function load(){if(busy)return;try{const r=await fetch(API+'?_='+Date.now(),{cache:'no-store'}),j=await r.json();if(!r.ok||j?.ok!==true)throw Error(j?.error||'HTTP_'+r.status);paintStatus(j)}catch(e){$('sys').textContent='อ่าน HUB ไม่สำเร็จ';$('sys').className='red';$('saveNote').textContent=String(e.message||e)}}async function save(){if(busy)return;if(selected===2&&!confirm('โหมด 2 วินาทีใช้ประมาณ 30 requests/min เฉพาะ Bulk Live และเหลือพื้นที่ให้ส่วนอื่นน้อยลง ต้องการใช้ต่อหรือไม่?'))return;busy=true;const btn=$('save');btn.disabled=true;$('reset').disabled=true;$('saveNote').textContent='กำลังบันทึกและเริ่มรอบใหม่…';try{const r=await fetch(API,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({liveRefreshSeconds:selected,autoReturnMinutes:auto}),cache:'no-store'}),j=await r.json();if(!r.ok||j?.ok!==true)throw Error(j?.error||'SAVE_FAILED');dirty=false;$('saveNote').textContent='บันทึกแล้ว · ใช้ค่าทันที';paintStatus(j.health||j);setTimeout(load,900)}catch(e){$('saveNote').textContent='บันทึกไม่สำเร็จ · '+String(e.message||e)}finally{busy=false;btn.disabled=false;$('reset').disabled=false}}document.querySelectorAll('[data-sec]').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.sec);dirty=true;paintChoice();$('saveNote').textContent='เลือก '+selected+'s แล้ว · กด “ใช้ทันที”'}));document.querySelectorAll('[data-min]').forEach(b=>b.addEventListener('click',()=>{auto=Number(b.dataset.min);dirty=true;paintChoice()}));$('save').addEventListener('click',save);$('reset').addEventListener('click',()=>{selected=120;auto=0;dirty=true;paintChoice();save()});paintChoice();load();setInterval(()=>{if(!dirty)load()},5000)})();
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', 'pragma': 'no-cache', 'x-nomad-mixer-revision': '343-bulk-live-control-v1' } });
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
    if (url.pathname.startsWith('/api/hub/')) {
      const path = url.pathname.replace('/api/hub', '') || '/';
      return env.HUB.fetch(hubRequest(request, path));
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
