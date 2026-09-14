import { DurableObject } from 'cloudflare:workers';

const VERSION = 'nomad343-full-market-v3-api-mixer';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const HUB_HEALTH_URL = 'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health';
const ENGINE_HEALTH_URL = 'https://nomadtips3-engine-343.mccarey-supon.workers.dev/health';
const BOOKMAKERS = [
  { slug: 'bet365', name: 'Bet365', role: 'MAIN', order: 1 },
  { slug: 'pinnacle', name: 'Pinnacle', role: 'REFEREE', order: 2 },
  { slug: 'crown', name: 'Crown', role: 'REFEREE ASIA', order: 3 },
  { slug: '1xbet', name: '1xBet', role: 'GLOBAL MASS', order: 4 },
  { slug: '12bet', name: '12Bet', role: 'ASIA', order: 5 },
  { slug: 'interwetten', name: 'Interwetten', role: 'EUROPE', order: 6 },
  { slug: 'macauslot', name: 'Macau Slot', role: 'EAST ASIA', order: 7 },
  { slug: '18bet', name: '18Bet', role: 'ASIA #2', order: 8 },
  { slug: 'vcbet', name: 'VCBet', role: 'RESERVE', order: 9 },
  { slug: 'easybets', name: 'Easybets', role: 'RESERVE', order: 10 }
];
const BOOKMAKER_QUERY = BOOKMAKERS.map(x => x.slug).join(',');
const ACCOUNT_RATE_LIMIT_PER_MIN = 40;
const SIDECAR_SOFT_LIMIT_PER_MIN = 24;
const DEFAULT_CONTROL = Object.freeze({
  refreshSeconds: 30,
  workerCacheSeconds: 30,
  eventTrigger: true,
  softLimitPerMinute: SIDECAR_SOFT_LIMIT_PER_MIN
});
const STALE_MS = 5 * 60_000;
const BUDGET_WINDOW_MS = 60_000;
const TELEMETRY_KEEP_MS = 10 * 60_000;
const MAX_TELEMETRY = 500;
const MAX_RECENT_FIXTURES = 64;

const now = () => Date.now();
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const normalized = value => String(value ?? '').toLowerCase().replace(/[\s_-]/g, '');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sanitizeControl(raw = {}) {
  return {
    refreshSeconds: clamp(Math.round(num(raw.refreshSeconds) ?? DEFAULT_CONTROL.refreshSeconds), 10, 120),
    workerCacheSeconds: clamp(Math.round(num(raw.workerCacheSeconds) ?? DEFAULT_CONTROL.workerCacheSeconds), 10, 120),
    eventTrigger: raw.eventTrigger === undefined ? DEFAULT_CONTROL.eventTrigger : Boolean(raw.eventTrigger),
    softLimitPerMinute: clamp(Math.round(num(raw.softLimitPerMinute) ?? DEFAULT_CONTROL.softLimitPerMinute), 1, 36)
  };
}
function bookmakerArray(payload) {
  const roots = [payload?.data, payload, payload?.data?.odds, payload?.odds].filter(Boolean);
  for (const root of roots) {
    if (Array.isArray(root?.bookmakers)) return root.bookmakers;
    if (Array.isArray(root)) return root;
  }
  return [];
}
function availableBookmakers(payload) {
  const found = new Set();
  for (const row of bookmakerArray(payload)) {
    const key = normalized(row?.slug ?? row?.bookmaker?.slug ?? row?.name ?? row?.bookmaker?.name);
    if (!key) continue;
    for (const book of BOOKMAKERS) {
      const target = normalized(book.slug);
      if (key === target || key.includes(target) || target.includes(key)) found.add(book.slug);
    }
  }
  return BOOKMAKERS.filter(x => found.has(x.slug)).map(x => x.slug);
}
function response(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      ...extraHeaders
    }
  });
}
function htmlResponse(body) {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
}
async function externalJson(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ac.signal, headers: { accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j !== 'object') throw new Error(`HTTP_${r.status}`);
    return { ok: true, data: j };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}
function mixerPage() {
  return String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>NOMAD 3.43 · API Mixer</title><style>
:root{font-family:Inter,system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:#eaf7ef;background:#06100c;--green:#32e67f;--yellow:#f5dc45;--orange:#ff8c39;--red:#ff475f;--line:#184b38;--panel:#091b14}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#0a2a20 0,#07130f 38%,#050c09 100%);color:#eaf7ef}.top{padding:18px 22px;border-bottom:1px solid #184b38;display:flex;align-items:center;gap:20px;justify-content:space-between}.brand{font-size:25px;font-weight:950;letter-spacing:.04em}.brand b{color:var(--green)}.sub{font-size:11px;color:#8eaa9d}.live{display:flex;align-items:center;gap:8px;color:var(--green);font-weight:800}.dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 14px var(--green)}.shell{max-width:1480px;margin:auto;padding:16px}.notice{display:flex;gap:12px;justify-content:space-between;align-items:center;border:1px solid #265b45;background:#0a1d15;padding:12px 14px;margin-bottom:12px}.notice strong{color:#c8ffe0}.notice small{color:#86a293}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card{border:1px solid #1d6b4a;background:linear-gradient(180deg,#0a2018,#081710);border-radius:10px;padding:14px;min-width:0}.cardhead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.card h2{font-size:16px;margin:0}.badge{font-size:9px;border:1px solid #2e9265;color:#73f2ac;padding:4px 6px;border-radius:5px;white-space:nowrap}.desc{font-size:10px;color:#90aa9e;margin:6px 0 9px;min-height:28px}.list{font-size:10px;color:#c4d9cf;line-height:1.7;min-height:92px}.count{font-size:28px;font-weight:900;color:var(--green);margin-top:6px}.count span{font-size:13px;color:#9fb6aa;font-weight:700}.chart{height:150px;position:relative;border-left:1px solid #28503f;border-bottom:1px solid #28503f;margin:8px 4px 10px 26px;background:repeating-linear-gradient(to top,transparent 0,transparent 36px,#173326 37px)}.ceil,.warn{position:absolute;left:-9px;right:0;border-top:2px dashed}.ceil{top:0;border-color:var(--red)}.warn{top:40%;border-color:var(--yellow)}.bar{position:absolute;left:18%;width:44%;bottom:0;height:2%;min-height:2px;background:var(--green);transition:.35s;border-radius:4px 4px 0 0;box-shadow:0 0 16px #32e67f40}.scale{position:absolute;left:-27px;font-size:9px;color:#89a397}.s40{top:-6px}.s24{top:56px}.s0{bottom:-5px}.mixer{border-top:1px solid #174533;padding-top:10px}.control{margin:8px 0}.control label{display:flex;justify-content:space-between;font-size:10px;color:#d4e6dc;margin-bottom:4px}.control input[type=range]{width:100%;accent-color:#49a7ff}.control input:disabled{opacity:.42}.lock{font-size:9px;color:#708e80}.switch{display:flex;justify-content:space-between;align-items:center;font-size:10px;margin-top:8px}.switch input{width:20px;height:20px;accent-color:var(--green)}.save{width:100%;border:1px solid #26be70;background:#0d3b28;color:#dffff0;padding:10px;font-weight:900;border-radius:6px;cursor:pointer}.save:hover{background:#115236}.summary{display:grid;grid-template-columns:1.3fr .7fr .7fr .7fr;gap:10px;margin-top:10px}.box{border:1px solid #21503d;background:#081711;border-radius:10px;padding:14px}.big{font-size:29px;font-weight:950}.progress{height:18px;border:1px solid #244f3d;background:#10231a;border-radius:5px;overflow:hidden;margin:8px 0}.fill{height:100%;width:0;background:var(--green);transition:.35s}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stats b{display:block;font-size:23px}.stats small{color:#85a194}.warnbox{border-color:#784128}.warnbox b{color:var(--yellow)}.logs{margin-top:10px;border:1px solid #21503d;background:#081711;border-radius:10px;padding:14px}.logs h3{margin:0 0 8px;font-size:13px}.log{display:grid;grid-template-columns:80px 1fr 70px;gap:8px;padding:6px 0;border-top:1px solid #143326;font-size:10px}.ok{color:var(--green)}.yellow{color:var(--yellow)}.orange{color:var(--orange)}.red{color:var(--red)}.muted{color:#80988d}.foot{padding:12px 0 2px;color:#779185;font-size:9px;text-align:center}@media(max-width:1050px){.cards{grid-template-columns:1fr 1fr}.summary{grid-template-columns:1fr 1fr}}@media(max-width:620px){.top{align-items:flex-start;flex-direction:column}.cards,.summary{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr 1fr}.log{grid-template-columns:65px 1fr 55px}}
</style></head><body><header class="top"><div><div class="brand">NOMAD <b>3.43</b></div><div class="sub">API MIXER & QUOTA MONITOR · 1 request type = 1 bar = 1 setting group</div></div><div class="live"><i class="dot"></i><span id="sys">กำลังอ่านข้อมูลจริง</span></div></header><main class="shell"><section class="notice"><div><strong>ตรวจสอบการใช้ 5USD API แบบแยกตามชนิด request</strong><br><small>ข้อมูลที่มากับ request เดียวกันถูกรวมไว้ใต้แท่งเดียว · ไม่แตก slider ย่อย</small></div><small id="updated">—</small></section><section class="cards">
<article class="card" data-key="bulk"><div class="cardhead"><h2>① Bulk HUB</h2><span class="badge">FIXTURES QUERY</span></div><div class="desc">Today + Live snapshot · รวมข้อมูลก้อนเดียวตามรอบ HUB</div><div class="list">✓ Score / Minute / Status<br>✓ Events<br>✓ Statistics<br>✓ Bulk Odds / Lines<br><span class="yellow">Today + Live อาจมี pagination หลาย request/รอบ</span></div><div class="count" id="bulkCount">— <span>/ 40 req/60s</span></div><div class="chart"><i class="ceil"></i><i class="warn"></i><i class="scale s40">40</i><i class="scale s24">24</i><i class="scale s0">0</i><i class="bar" id="bulkBar"></i></div><div class="mixer"><div class="control"><label><span>รอบ HUB</span><b id="bulkRefresh">120 วินาที</b></label><input type="range" min="30" max="300" value="120" disabled></div><div class="lock">🔒 ล็อกไว้ · ไม่แตะ HUB ที่ทำงานปกติ</div></div></article>
<article class="card" data-key="referee"><div class="cardhead"><h2>② Bet365 Referee</h2><span class="badge">FIXTURE ODDS · 1 BOOK</span></div><div class="desc">Engine referee และ UI expand ใช้ endpoint ชนิดเดียวกัน</div><div class="list">✓ AH / O/U / 1X2 / ตลาดที่ Bet365 มี<br>✓ Engine คัดก่อนยิงราคา<br>✓ สูงสุด 4 fixture/scan<br><span class="yellow">UI Expand มี cache 60s แต่ยังไม่มี counter กลาง</span></div><div class="count" id="refCount">— <span>/ 40 req/60s</span></div><div class="chart"><i class="ceil"></i><i class="warn"></i><i class="scale s40">40</i><i class="scale s24">24</i><i class="scale s0">0</i><i class="bar" id="refBar"></i></div><div class="mixer"><div class="control"><label><span>เพดาน Engine</span><b>4 / scan</b></label><input type="range" min="1" max="10" value="4" disabled></div><div class="lock">🔒 Monitor only · ไม่แก้ Engine</div></div></article>
<article class="card" data-key="full"><div class="cardhead"><h2>③ Full Market 10-Book</h2><span class="badge">FIXTURE ODDS · 10 BOOKS</span></div><div class="desc">Regular + Event-trigger ใช้ request type เดียวกัน จึงรวมแท่งเดียว</div><div class="list">✓ AH / O/U / 1X2<br>✓ Corners / Cards / ตลาดอื่น<br>✓ 10 bookmaker ใน request เดียวต่อ fixture<br><span id="fullBreak" class="ok">Regular 0 · Event 0</span></div><div class="count" id="fullCount">— <span>/ 40 req/60s</span></div><div class="chart"><i class="ceil"></i><i class="warn"></i><i class="scale s40">40</i><i class="scale s24">24</i><i class="scale s0">0</i><i class="bar" id="fullBar"></i></div><div class="mixer"><div class="control"><label><span>Provider refresh</span><b id="refreshLabel">30s</b></label><input id="refresh" type="range" min="10" max="120" value="30"></div><div class="control"><label><span>Worker cache</span><b id="cacheLabel">30s</b></label><input id="cache" type="range" min="10" max="120" value="30"></div><div class="control"><label><span>Soft limit</span><b id="softLabel">24/min</b></label><input id="soft" type="range" min="1" max="36" value="24"></div><div class="switch"><span>Event Trigger</span><input id="event" type="checkbox" checked></div><button id="save" class="save">บันทึก Full Market</button></div></article>
<article class="card" data-key="other"><div class="cardhead"><h2>④ Other / Untracked</h2><span class="badge">SHARED KEY</span></div><div class="desc">เผื่อ request จากจุดที่ยังไม่ส่ง telemetry เข้าตัวมอนิเตอร์</div><div class="list">• Manual UI referee ที่ไม่ผ่าน counter<br>• งานภายนอก/Worker อื่นที่ใช้ key เดียวกัน<br>• 429 จากระบบอื่นอาจเกิดได้<br><span class="yellow">ไม่เดาตัวเลข · จะแสดงว่า UNTRACKED</span></div><div class="count muted">— <span>ไม่ใส่ตัวเลขปลอม</span></div><div class="chart"><i class="ceil"></i><i class="warn"></i><i class="scale s40">40</i><i class="scale s24">24</i><i class="scale s0">0</i><i class="bar" style="height:0;opacity:.2"></i></div><div class="mixer"><div class="control"><label><span>ตั้งค่า</span><b>Monitor only</b></label><input type="range" min="0" max="40" value="0" disabled></div><div class="lock">🔒 ต้องรวม telemetry กลางก่อนจึงค่อยปลดล็อก</div></div></article>
</section><section class="summary"><div class="box"><div style="display:flex;justify-content:space-between;align-items:end"><div><small class="muted">TRACKED REQUESTS · ย้อนหลัง 60 วินาที</small><div class="big"><span id="total">—</span> <span class="muted" style="font-size:16px">/ 40</span></div></div><b id="pct">—%</b></div><div class="progress"><div class="fill" id="totalFill"></div></div><small class="muted">ตัวเลขนี้เป็น “ขั้นต่ำที่มองเห็น” จนกว่าจะรวม counter ของ Manual/UI และ consumer อื่นทั้งหมด</small></div><div class="box"><small class="muted">CACHE HIT · 60s</small><div class="big ok" id="cacheHits">0</div><small class="muted">ไม่เสีย provider quota</small></div><div class="box"><small class="muted">PROVIDER 429 · 60s</small><div class="big" id="errs">0</div><small class="muted">Full Market telemetry</small></div><div class="box warnbox"><small class="muted">SOFT GUARD · 60s</small><div class="big" id="guards">0</div><small class="muted">ถูกกันก่อนยิง provider</small></div></section><section class="logs"><h3>บันทึกล่าสุด · Full Market</h3><div id="logs"><div class="muted">ยังไม่มี telemetry</div></div></section><div class="foot">NOMAD 3.43 · API Mixer (Canary) · Monitor ก่อน จูนเฉพาะ Full Market · Engine / HUB ไม่ถูกแก้</div></main><script>
(()=>{'use strict';const MON='/api/full-market/monitor',SET='/api/full-market/settings';const $=id=>document.getElementById(id);let busy=false;function cls(n){return n>=36?'red':n>=32?'orange':n>=24?'yellow':'ok'}function paintBar(id,n){const el=$(id);const v=Math.max(0,Number(n)||0),pct=Math.min(100,v/40*100);el.style.height=Math.max(2,pct)+'%';el.style.background=v>=36?'var(--red)':v>=32?'var(--orange)':v>=24?'var(--yellow)':'var(--green)';el.style.boxShadow='0 0 16px '+(v>=36?'#ff475f66':v>=32?'#ff8c3966':v>=24?'#f5dc4566':'#32e67f55')}function setCount(id,n){const el=$(id);el.firstChild.nodeValue=(n===null||n===undefined?'—':String(n))+' ';el.className='count '+(n===null||n===undefined?'muted':cls(Number(n)))}function time(ts){if(!ts)return'—';try{return new Date(ts).toLocaleTimeString('th-TH',{hour12:false})}catch{return'—'}}function fillControls(c){if(!c)return;$('refresh').value=c.refreshSeconds;$('cache').value=c.workerCacheSeconds;$('soft').value=c.softLimitPerMinute;$('event').checked=!!c.eventTrigger;labels()}function labels(){$('refreshLabel').textContent=$('refresh').value+'s';$('cacheLabel').textContent=$('cache').value+'s';$('softLabel').textContent=$('soft').value+'/min'}['refresh','cache','soft'].forEach(id=>$(id).addEventListener('input',labels));async function load(){if(busy)return;busy=true;try{const r=await fetch(MON+'?_='+Date.now(),{cache:'no-store'}),j=await r.json();if(!r.ok||j.ok!==true)throw Error(j.error||'HTTP_'+r.status);const g=j.groups||{},bulk=g.bulk||{},ref=g.referee||{},full=g.fullMarket||{};setCount('bulkCount',bulk.used60s);paintBar('bulkBar',bulk.used60s);$('bulkRefresh').textContent=Math.round((bulk.refreshMs||120000)/1000)+' วินาที';setCount('refCount',ref.used60s);paintBar('refBar',ref.used60s);setCount('fullCount',full.used60s);paintBar('fullBar',full.used60s);$('fullBreak').textContent='Regular '+(full.regular60s||0)+' · Event '+(full.event60s||0);fillControls(j.control);const t=Number(j.total?.tracked60s||0),p=Math.round(t/40*100);$('total').textContent=t;$('pct').textContent=p+'%';$('pct').className=cls(t);$('totalFill').style.width=Math.min(100,p)+'%';$('totalFill').style.background=t>=36?'var(--red)':t>=32?'var(--orange)':t>=24?'var(--yellow)':'var(--green)';$('cacheHits').textContent=j.stats?.cacheHits60s||0;$('errs').textContent=j.stats?.provider42960s||0;$('errs').className='big '+((j.stats?.provider42960s||0)>0?'red':'ok');$('guards').textContent=j.stats?.softGuards60s||0;$('updated').textContent='อัปเดต '+time(j.generatedAt);$('sys').textContent=(j.coverage?.hubOnline&&j.coverage?.engineOnline?'ระบบ Monitor ออนไลน์':'Monitor บางส่วน');const logs=Array.isArray(j.recent)?j.recent:[];$('logs').innerHTML=logs.length?logs.slice().reverse().map(x=>'<div class="log"><span>'+time(x.at)+'</span><span>'+String(x.source||x.kind||'').replace(/[<>&]/g,'')+(x.fixtureId?' · '+String(x.fixtureId).replace(/[<>&]/g,''):'')+'</span><b class="'+(Number(x.status)===429?'red':x.kind==='cache'?'ok':'muted')+'">'+(x.kind==='cache'?'CACHE':x.kind==='soft_guard'?'GUARD':x.status||'—')+'</b></div>').join(''):'<div class="muted">ยังไม่มี telemetry</div>'}catch(e){$('sys').textContent='Monitor อ่านข้อมูลไม่ครบ';$('sys').className='red';$('updated').textContent=e.message}finally{busy=false}}$('save').addEventListener('click',async()=>{const b=$('save');b.disabled=true;b.textContent='กำลังบันทึก…';try{const control={refreshSeconds:Number($('refresh').value),workerCacheSeconds:Number($('cache').value),softLimitPerMinute:Number($('soft').value),eventTrigger:$('event').checked};const r=await fetch(SET,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({control}),cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw Error(j?.error||'SAVE_FAILED');b.textContent='บันทึกแล้ว ✓';setTimeout(()=>b.textContent='บันทึก Full Market',1400);load()}catch(e){b.textContent='บันทึกไม่สำเร็จ';setTimeout(()=>b.textContent='บันทึก Full Market',1800)}finally{b.disabled=false}});load();setInterval(load,10000)})();
</script></body></html>`;
}

export class FullMarketHub extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; this.env = env; this.inflight = new Map(); }
  async control() { return sanitizeControl(await this.ctx.storage.get('fullMarketControl') || DEFAULT_CONTROL); }
  async saveControl(raw) { const next = sanitizeControl(raw); await this.ctx.storage.put('fullMarketControl', next); return next; }
  async rateState(at = now()) {
    const raw = await this.ctx.storage.get('providerRequestTimes') || [];
    const times = raw.filter(value => Number.isFinite(Number(value)) && at - Number(value) < BUDGET_WINDOW_MS);
    if (times.length !== raw.length) await this.ctx.storage.put('providerRequestTimes', times);
    return times;
  }
  async consumeProviderBudget(control, at = now()) {
    const times = await this.rateState(at);
    if (times.length >= control.softLimitPerMinute) return { ok: false, used: times.length };
    times.push(at); await this.ctx.storage.put('providerRequestTimes', times); return { ok: true, used: times.length };
  }
  async telemetry(at = now()) {
    const raw = await this.ctx.storage.get('telemetryEvents') || [];
    const rows = raw.filter(x => x && Number.isFinite(Number(x.at)) && at - Number(x.at) < TELEMETRY_KEEP_MS).slice(-MAX_TELEMETRY);
    if (rows.length !== raw.length) await this.ctx.storage.put('telemetryEvents', rows);
    return rows;
  }
  async recordTelemetry(event) {
    const at = num(event?.at) ?? now();
    const rows = await this.telemetry(at);
    rows.push({ at, kind: String(event?.kind || 'unknown'), source: String(event?.source || 'UNKNOWN'), fixtureId: event?.fixtureId ? String(event.fixtureId) : null, status: num(event?.status), note: event?.note ? String(event.note).slice(0,120) : null });
    await this.ctx.storage.put('telemetryEvents', rows.slice(-MAX_TELEMETRY));
  }
  async rememberFixture(fixtureId) {
    const key = String(fixtureId), raw = await this.ctx.storage.get('recentFixtures') || [], next = raw.filter(x => String(x) !== key);
    next.push(key); const evicted = next.length > MAX_RECENT_FIXTURES ? next.splice(0, next.length - MAX_RECENT_FIXTURES) : [];
    if (evicted.length) await this.ctx.storage.delete(evicted.map(id => `fixture:${id}`));
    await this.ctx.storage.put('recentFixtures', next);
  }
  async cached(fixtureId) { return await this.ctx.storage.get(`fixture:${fixtureId}`) || null; }
  async providerFetch(fixtureId) {
    if (!this.env.FIVEDOLLAR_API_KEY) throw Object.assign(new Error('FIVEDOLLAR_API_KEY_MISSING'), { status: 500 });
    const url = `${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(BOOKMAKER_QUERY)}`;
    const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json', authorization: `Bearer ${this.env.FIVEDOLLAR_API_KEY}` } });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
    if (!r.ok) { const error = new Error(`5USD_FULL_MARKET_HTTP_${r.status}`); error.status = r.status; error.retryAfter = num(r.headers.get('retry-after')); error.providerBody = json ?? text.slice(0,300); throw error; }
    if (!json || typeof json !== 'object') throw Object.assign(new Error('5USD_FULL_MARKET_SHAPE'), { status: 502 });
    return json;
  }
  rateMeta(control, usedInWindow) { return { accountLimitPerMinute: ACCOUNT_RATE_LIMIT_PER_MIN, sidecarSoftLimitPerMinute: control.softLimitPerMinute, usedInWindow, burstFriendly: true }; }
  async freshFixture(fixtureId, previous, control, source = '5USD_ULTRA_10BOOK') {
    const requestAt = now(), budget = await this.consumeProviderBudget(control, requestAt);
    if (!budget.ok) {
      await this.recordTelemetry({ at: requestAt, kind: 'soft_guard', source, fixtureId, status: 429, note: 'FULL_MARKET_SOFT_RATE_LIMIT' });
      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) return { ok:true, fixtureId, version:VERSION, fullOdds:clone(previous.fullOdds), fetchedAt:previous.fetchedAt, requestedBookmakers:BOOKMAKERS, availableBookmakers:previous.availableBookmakers || availableBookmakers(previous.fullOdds), cached:true, stale:true, limited:true, source:'FULL_MARKET_STALE_RATE_GUARD', control, rate:this.rateMeta(control,budget.used) };
      const error = new Error('FULL_MARKET_SOFT_RATE_LIMIT'); error.status = 429; error.retryAfter = 3; throw error;
    }
    try {
      const fullOdds = await this.providerFetch(fixtureId);
      await this.recordTelemetry({ at: requestAt, kind: 'provider', source, fixtureId, status: 200 });
      const fetchedAt = now(), record = { fullOdds:clone(fullOdds), fetchedAt, availableBookmakers:availableBookmakers(fullOdds) };
      await this.ctx.storage.put(`fixture:${fixtureId}`, record); await this.rememberFixture(fixtureId);
      return { ok:true, fixtureId, version:VERSION, fullOdds, fetchedAt, requestedBookmakers:BOOKMAKERS, availableBookmakers:record.availableBookmakers, cached:false, stale:false, limited:false, source, control, rate:this.rateMeta(control,budget.used) };
    } catch (error) {
      await this.recordTelemetry({ at: requestAt, kind: 'provider', source, fixtureId, status:num(error?.status) ?? 502, note:String(error?.message || error) });
      const staleAge = previous?.fetchedAt ? now() - Number(previous.fetchedAt) : null;
      if (previous?.fullOdds && staleAge !== null && staleAge <= STALE_MS) return { ok:true, fixtureId, version:VERSION, fullOdds:clone(previous.fullOdds), fetchedAt:previous.fetchedAt, requestedBookmakers:BOOKMAKERS, availableBookmakers:previous.availableBookmakers || availableBookmakers(previous.fullOdds), cached:true, stale:true, limited:Number(error?.status)===429, source:'FULL_MARKET_STALE_PROVIDER_FALLBACK', refreshError:String(error?.message || error), retryAfter:num(error?.retryAfter), control, rate:this.rateMeta(control,budget.used) };
      throw error;
    }
  }
  async fixtureOdds(fixtureId) {
    const control = await this.control(), cached = await this.cached(fixtureId), age = cached?.fetchedAt ? Math.max(0, now()-Number(cached.fetchedAt)) : null, freshWindowMs = Math.max(control.refreshSeconds, control.workerCacheSeconds)*1000;
    if (cached?.fullOdds && age !== null && age <= freshWindowMs) {
      const times = await this.rateState(); await this.recordTelemetry({ kind:'cache', source:'FULL_MARKET', fixtureId, status:200 });
      return { ok:true, fixtureId, version:VERSION, fullOdds:clone(cached.fullOdds), fetchedAt:cached.fetchedAt, requestedBookmakers:BOOKMAKERS, availableBookmakers:cached.availableBookmakers || availableBookmakers(cached.fullOdds), cached:true, stale:false, limited:false, source:'FULL_MARKET_CACHE', control, rate:this.rateMeta(control,times.length) };
    }
    if (this.inflight.has(fixtureId)) return this.inflight.get(fixtureId);
    const task = this.freshFixture(fixtureId,cached,control).finally(()=>this.inflight.delete(fixtureId)); this.inflight.set(fixtureId,task); return task;
  }
  async eventRefresh(fixtureId) {
    const control = await this.control();
    if (!control.eventTrigger) { const times=await this.rateState(); return { ok:true, fixtureId, version:VERSION, skipped:true, reason:'EVENT_TRIGGER_OFF', control, rate:this.rateMeta(control,times.length) }; }
    const previous = await this.cached(fixtureId); if (this.inflight.has(fixtureId)) return this.inflight.get(fixtureId);
    const task = this.freshFixture(fixtureId,previous,control,'5USD_ULTRA_EVENT_TRIGGER').finally(()=>this.inflight.delete(fixtureId)); this.inflight.set(fixtureId,task); return task;
  }
  async settingsResponse() {
    const control=await this.control(),times=await this.rateState();
    return { ok:true, component:'NOMAD343_FULL_MARKET', version:VERSION, control, defaults:DEFAULT_CONTROL, accountLimitPerMinute:ACCOUNT_RATE_LIMIT_PER_MIN, usedInWindow:times.length };
  }
  async health() {
    const control=await this.control(),times=await this.rateState();
    return { ok:true, component:'NOMAD343_FULL_MARKET', version:VERSION, bookmakers:BOOKMAKERS, bookmakerQuery:BOOKMAKER_QUERY, cacheMs:Math.max(control.refreshSeconds,control.workerCacheSeconds)*1000, staleMs:STALE_MS, control, rate:this.rateMeta(control,times.length) };
  }
  async monitor() {
    const generatedAt=now(),control=await this.control(),rows=await this.telemetry(generatedAt),recent60=rows.filter(x=>generatedAt-Number(x.at)<60_000),provider=recent60.filter(x=>x.kind==='provider'),regular=provider.filter(x=>x.source!=='5USD_ULTRA_EVENT_TRIGGER'),event=provider.filter(x=>x.source==='5USD_ULTRA_EVENT_TRIGGER'),cacheHits=recent60.filter(x=>x.kind==='cache').length,provider429=provider.filter(x=>Number(x.status)===429).length,softGuards=recent60.filter(x=>x.kind==='soft_guard').length;
    const [hubRes,engineRes]=await Promise.all([externalJson(HUB_HEALTH_URL),externalJson(ENGINE_HEALTH_URL)]),hub=hubRes.ok?hubRes.data:null,engine=engineRes.ok?engineRes.data:null;
    const hubFetchedAt=num(hub?.fetchedAt),bulkUsed=hubFetchedAt!==null&&generatedAt-hubFetchedAt<60_000?Math.max(0,Math.round(num(hub?.providerRequestCount)??0)):0;
    const engineFinished=num(engine?.finishedAt),refUsed=engineFinished!==null&&generatedAt-engineFinished<60_000?Math.max(0,Math.round(num(engine?.refereeRequests)??0)):0;
    const fullUsed=provider.length,tracked=bulkUsed+refUsed+fullUsed;
    const recent=rows.slice(-18);
    return { ok:true, component:'NOMAD343_API_MIXER', version:VERSION, generatedAt, accountLimitPerMinute:ACCOUNT_RATE_LIMIT_PER_MIN, control, groups:{ bulk:{used60s:hubRes.ok?bulkUsed:null,refreshMs:num(hub?.refreshMs)??120000,lastRefreshRequestCount:num(hub?.providerRequestCount),fetchedAt:hubFetchedAt,bundled:['Today fixtures','Live fixtures','Score / Minute / Status','Events','Statistics','Bulk Odds / Lines'],pagination:true,source:'5USD_HUB'}, referee:{used60s:engineRes.ok?refUsed:null,latestScanRequests:num(engine?.refereeRequests),finishedAt:engineFinished,maxFixturesPerScan:4,uiExpandTracked:false,source:'ENGINE_BET365_REFEREE'}, fullMarket:{used60s:fullUsed,regular60s:regular.length,event60s:event.length,source:'FULL_MARKET_10BOOK',requestType:'fixture odds / 10 bookmakers'} }, total:{tracked60s:tracked,exactAccountTotal:false,remainingBefore40AtLeast:Math.max(0,ACCOUNT_RATE_LIMIT_PER_MIN-tracked)}, stats:{cacheHits60s:cacheHits,provider42960s:provider429,softGuards60s:softGuards}, coverage:{hubOnline:hubRes.ok,engineOnline:engineRes.ok,fullMarketExact:true,manualUiExact:false,otherConsumersExact:false,note:'Tracked total is a lower bound until every shared-key consumer reports to one central counter.'}, external:{hub:hub?{version:hub.version,lastError:hub.lastError,stale:hub.stale}:null,engine:engine?{version:engine.version,lastError:engine.lastError}:null,hubError:hubRes.ok?null:hubRes.error,engineError:engineRes.ok?null:engineRes.error}, recent };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method==='GET' && (url.pathname==='/mixer' || url.pathname==='/mixer.html')) return htmlResponse(mixerPage());
    if (request.method==='GET' && url.pathname==='/monitor') return response(await this.monitor());
    if (request.method==='GET' && (url.pathname==='/health' || url.pathname==='/status')) return response(await this.health());
    if (request.method==='GET' && url.pathname==='/settings') return response(await this.settingsResponse());
    if (request.method==='PUT' && url.pathname==='/settings') { const body=await request.json().catch(()=>null); if(!body||typeof body!=='object')return response({ok:false,version:VERSION,error:'INVALID_SETTINGS_BODY'},400); const control=await this.saveControl(body.control||body); return response({...await this.settingsResponse(),control}); }
    if (request.method==='GET' && url.pathname==='/fixture-odds') { const fixtureId=String(url.searchParams.get('fixtureId')||'').trim(); if(!fixtureId)return response({ok:false,version:VERSION,error:'FIXTURE_ID_REQUIRED'},400); try{return response(await this.fixtureOdds(fixtureId))}catch(error){const status=Number(error?.status)===429?429:Number(error?.status)>=400&&Number(error?.status)<600?Number(error.status):502,retryAfter=num(error?.retryAfter),headers=retryAfter!==null?{'retry-after':String(retryAfter)}:{};return response({ok:false,version:VERSION,fixtureId,error:String(error?.message||error),retryAfter,requestedBookmakers:BOOKMAKERS},status,headers)} }
    if (['GET','POST'].includes(request.method) && url.pathname==='/event-refresh') { const fixtureId=String(url.searchParams.get('fixtureId')||'').trim(); if(!fixtureId)return response({ok:false,version:VERSION,error:'FIXTURE_ID_REQUIRED'},400); try{return response(await this.eventRefresh(fixtureId))}catch(error){const status=Number(error?.status)===429?429:Number(error?.status)>=400&&Number(error?.status)<600?Number(error.status):502,retryAfter=num(error?.retryAfter),headers=retryAfter!==null?{'retry-after':String(retryAfter)}:{};return response({ok:false,version:VERSION,fixtureId,error:String(error?.message||error),retryAfter},status,headers)} }
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  }
}
function stub(env){const id=env.FULL_MARKET.idFromName('global');return env.FULL_MARKET.get(id)}
export default { async fetch(request,env){ const url=new URL(request.url); if(!['GET','HEAD','PUT','POST'].includes(request.method))return response({ok:false,version:VERSION,error:'METHOD_NOT_ALLOWED'},405); const target=new URL('https://full-market.internal');target.pathname=url.pathname;target.search=url.search;const init={method:request.method,headers:request.headers};if(!['GET','HEAD'].includes(request.method))init.body=request.body;const r=await stub(env).fetch(new Request(target,init));if(request.method==='HEAD')return new Response(null,{status:r.status,headers:r.headers});return r; } };
