(()=>{
'use strict';

const REFRESH_MS=10_000;
const REQUEST_TIMEOUT_MS=8_000;
const INCIDENT_KEY='nomadControlCenterIncidentsV1';
const STATE_KEY='nomadControlCenterStatesV1';

const HEALTH_SYSTEMS=[
  {id:'tc-v3',name:'TotalCorner · Live Feed V3',role:'MAIN LIVE SCORE / EVENT SOURCE',endpoint:'https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/health',capacity:60,capacityLabel:'planning cap 60 live matches',purpose:'บอลสด + เหตุการณ์การแข่งขัน',displayPage:'Live Score 3.42',displayUrl:'https://www.nomadtips3.com/nomad-live-342/index.html',relation:'แหล่ง Live Score / Event หลักของหน้า 3.42'},
  {id:'tc-v2',name:'TotalCorner · Live Feed V2',role:'FALLBACK LIVE SCORE SOURCE',endpoint:'https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev/health',capacity:60,capacityLabel:'planning cap 60 live matches',purpose:'แหล่งบอลสดสำรอง',displayPage:'Live Score 3.42 · Fallback',displayUrl:'https://www.nomadtips3.com/nomad-live-342/index.html',relation:'สำรองของ V3 · ไม่ใช่แหล่งหลักขณะ V3 ปกติ'},
  {id:'live-engine',name:'NOMAD Live Engine',role:'SIGNAL / PRICE SOURCE REGISTRY',endpoint:'https://nomadtips3-live-engine.mccarey-supon.workers.dev/health',capacity:60,capacityLabel:'planning activity cap 60 matches',purpose:'Signal + Price Source Registry',displayPage:'NOMADTIPS3 Home / Live',displayUrl:'https://www.nomadtips3.com/',relation:'NOWGOAL · AH referee · 20 bookmaker identities · ทำงานภายใน Engine นี้'},
  {id:'market-engine',name:'Market Engine',role:'ASIANBOOKIE + API-FOOTBALL CANDIDATE',endpoint:'https://nomadtips3-market-engine.mccarey-supon.workers.dev/health',purpose:'AsianBookie + API-Football candidate / market layer',displayPage:'Live Score 3.42',displayUrl:'https://www.nomadtips3.com/nomad-live-342/index.html',relation:'เชื่อมหน้า 3.42 ในโหมด DISPLAY · optional · ไม่ block event render'},
  {id:'price-5d',name:'5Dollar Price Adapter',role:'3.42 PRICE RUNTIME · CONFIG DRIFT WATCH',endpoint:'https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev/health',drift:true,capacity:9,capacityLabel:'internal upstream ceiling 9 req/min',purpose:'ราคา AH สำหรับ runtime 3.42',displayPage:'Live Score 3.42 · Price Runtime',displayUrl:'https://www.nomadtips3.com/nomad-live-342/index.html',relation:'Runtime 3.42 ยังอ้างถึง adapter นี้ · source8 ใน registry ถูก retire → CONFIG DRIFT'},
  {id:'car34',name:'Goaloo / CAR 3.4',role:'SHADOW / REAL-MARKET AUDIT',endpoint:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev/health',shadow:true,capacity:24,capacityLabel:'MAX_MATCHES_PER_CYCLE 24',purpose:'Goaloo live stats + real-market AH audit',displayPage:'CAR 3.4 Detector · SHADOW',displayUrl:'https://mccareysupon-png.github.io/nomadtips3-live-test/car3-4-real-market-audit/web/index.html',relation:'SHADOW / ทดลอง · ไม่ใช่ Production หลัก',extraLinks:[{label:'ดู Statistics',url:'https://mccareysupon-png.github.io/nomadtips3-live-test/car3-4-real-market-audit/web/statistics.html'}]}
];

const WEB_TARGETS=[
  {name:'NOMADTIPS3 Home',url:'https://www.nomadtips3.com/'},
  {name:'Live Score 3.42',url:'https://www.nomadtips3.com/nomad-live-342/index.html'},
  {name:'Soccer Predictions',url:'https://www.nomadtips3.com/soccer-predictions/'},
  {name:'Prediction2',url:'https://www.nomadtips3.com/prediction2'}
];

const INVENTORY=[
  {name:'Nowgoal',meta:'REGISTERED · AH referee · 20 bookmaker identities'},
  {name:'Odds-API.io',meta:'REGISTERED · price source S1'},
  {name:'The Odds API',meta:'REGISTERED · price source S2'},
  {name:'API-Football',meta:'REGISTERED · price source S3 / candidate adapter'},
  {name:'TotalCorner / Pinnacle',meta:'REGISTERED · peer source S26'},
  {name:'AsianBookie',meta:'ADAPTER PRESENT · monitored through Market Engine'},
  {name:'Bet365',meta:'BOOKMAKER / price identity used by adapters'},
  {name:'ScoutingStats Odds Board',meta:'EXTERNAL · 1X2 referee · browser/DOM · telemetry UNLINKED'},
  {name:'THScore / THG',meta:'EXTERNAL REFEREE · validation plan · telemetry UNLINKED'},
  {name:'7MSport / Pinnacle',meta:'EXTERNAL AH REFEREE · telemetry UNLINKED'},
  {name:'Flashscore',meta:'LEGACY / prior source · current active telemetry not verified'},
  {name:'SofaScore /graph',meta:'SPARE GRAPH / momentum · telemetry UNLINKED'},
  {name:'BigBaller',meta:'LEGACY API POOL · telemetry UNLINKED'},
  {name:'5Dollar source8',meta:'REGISTRY RETIRED · runtime adapter still referenced → DRIFT'}
];

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const firstFinite=(...values)=>values.find(finite);
const fmtTime=value=>{
  if(!value)return '—';
  const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
};
const fmtAge=ms=>{
  if(!finite(ms))return '—';
  const sec=Math.max(0,Math.round(Number(ms)/1000));
  if(sec<60)return `${sec}s`;
  const min=Math.floor(sec/60),rest=sec%60;return `${min}m ${rest}s`;
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
let incidents=readLocal(INCIDENT_KEY,[]);
let previousStates=readLocal(STATE_KEY,{});
let busy=false;

function healthState(system,data,httpOk=true){
  if(!httpOk)return 'OFFLINE';
  if(data?.ok===false)return 'ERROR';
  if(data?.sourceStale===true)return 'STALE';
  if(data?.degraded===true||data?.servingLastGood===true)return 'DEGRADED';
  if(data?.lastError)return 'DEGRADED';
  if(system.drift)return 'DRIFT';
  if(system.shadow)return 'SHADOW';
  return 'ACTIVE';
}

function statusClass(state){
  if(['ACTIVE','READY'].includes(state))return 'state-ready';
  if(['DEGRADED','STALE','DRIFT'].includes(state))return `state-${state.toLowerCase()}`;
  if(['OFFLINE','ERROR'].includes(state))return `state-${state.toLowerCase()}`;
  if(state==='SHADOW')return 'state-shadow';
  return 'state-unlinked';
}

function extractActivity(system,data){
  if(system.id==='price-5d'){
    const used=firstFinite(data?.upstream?.usedLast60s,data?.rate?.usedLast60s,data?.usedLast60s);
    if(finite(used))return {value:Number(used),label:`${Number(used)} req / min`};
  }
  const matches=firstFinite(data?.liveMatches,data?.matches,data?.counts?.live,data?.matchCount,data?.currentMatches);
  if(finite(matches))return {value:Number(matches),label:`${Number(matches)} matches`};
  return null;
}

function calculateLoad(system,data){
  const activity=extractActivity(system,data);
  if(!activity||!finite(system.capacity)||system.capacity<=0)return {percent:null,label:activity?.label||'No load counter'};
  return {percent:clamp(Math.round(activity.value/Number(system.capacity)*100),0,100),label:activity.label};
}

function addIncident(id,name,from,to,note=''){
  if(!from||from===to)return;
  const problem=['DEGRADED','STALE','DRIFT','OFFLINE','ERROR'].includes(to);
  const recovered=['DEGRADED','STALE','OFFLINE','ERROR'].includes(from)&&['ACTIVE','SHADOW'].includes(to);
  if(!problem&&!recovered)return;
  incidents.unshift({at:Date.now(),id,name,from,to,note,recovered});
  incidents=incidents.slice(0,40);writeLocal(INCIDENT_KEY,incidents);
}

async function fetchJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);const started=performance.now();
  try{
    const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store',signal:controller.signal});
    const latency=Math.round(performance.now()-started);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();return {ok:true,data,latency};
  }finally{clearTimeout(timer)}
}

async function checkSystem(system){
  try{
    const result=await fetchJson(system.endpoint);
    const state=healthState(system,result.data,true);
    return {...system,state,data:result.data,latency:result.latency,error:null};
  }catch(error){return {...system,state:'OFFLINE',data:null,latency:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error)}}
}

async function probeWeb(target){
  const started=performance.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    await fetch(`${target.url}${target.url.includes('?')?'&':'?'}_nomad_probe=${Date.now()}`,{mode:'no-cors',cache:'no-store',signal:controller.signal});
    return {...target,state:'REACHABLE',latency:Math.round(performance.now()-started),error:null};
  }catch(error){return {...target,state:'OFFLINE',latency:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error)}
  }finally{clearTimeout(timer)}
}

function metricsFor(system){
  const d=system.data||{};
  const activity=extractActivity(system,d);
  const sourceAge=firstFinite(d.sourceAgeMs,d.priceAgeMs,d.ageMs);
  const lastSuccess=d.lastSuccessAt||d.lastSuccess||d.updatedAt||null;
  const cycle=firstFinite(d.cycle,d.cycleCount);
  const provider=d.providerName||d.source?.name||d.service||d.component||'—';
  return [
    ['Current work',activity?.label||'—'],
    ['Data age',fmtAge(sourceAge)],
    ['Last success',fmtTime(lastSuccess)],
    ['Cycle',finite(cycle)?String(cycle):'—'],
    ['Latency',finite(system.latency)?`${system.latency} ms`:'—'],
    ['Provider',provider]
  ];
}

function systemNote(system){
  const d=system.data||{};
  if(system.error)return `Monitor contact failed: ${system.error}`;
  if(d.lastError)return `Last error: ${d.lastError}`;
  if(system.id==='price-5d')return 'Runtime still references this adapter while source8 is retired in the newer registry. Monitor as CONFIG DRIFT.';
  if(d.servingLastGood)return 'Serving last-good data while upstream is degraded.';
  if(system.capacityLabel)return `Load scale: ${system.capacityLabel}.`;
  return 'Health endpoint connected. Read-only monitoring.';
}

function renderDisplayMap(system){
  if(!system.purpose&&!system.displayPage&&!system.displayUrl)return '';
  const extra=(Array.isArray(system.extraLinks)?system.extraLinks:[]).map(link=>`<a class="system-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>`).join('');
  return `<div class="display-map">
    <div class="display-row"><span>หน้าที่</span><b>${esc(system.purpose||'—')}</b></div>
    <div class="display-row"><span>แสดงผลที่</span><b>${esc(system.displayPage||'—')}</b></div>
    <div class="system-links">
      ${system.displayUrl?`<a class="system-link" href="${esc(system.displayUrl)}" target="_blank" rel="noopener noreferrer">เปิดหน้าแสดงผล</a>`:''}
      <a class="system-link health" href="${esc(system.endpoint)}" target="_blank" rel="noopener noreferrer">ตรวจสุขภาพ</a>
      ${extra}
    </div>
    ${system.relation?`<div class="system-relation">${esc(system.relation)}</div>`:''}
  </div>`;
}

function renderSystems(systems){
  const root=$('systemsGrid');
  root.innerHTML=systems.map(system=>{
    const load=calculateLoad(system,system.data||{});const width=load.percent==null?0:load.percent;
    const metrics=metricsFor(system).map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    return `<article class="system-card">
      <div class="card-top"><div><div class="system-name">${esc(system.name)}</div><div class="role">${esc(system.role)}</div></div><span class="state-badge ${statusClass(system.state)}">${esc(system.state)}</span></div>
      <div class="load-row"><div class="load-head"><span>WORKLOAD</span><b>${load.percent==null?'—':`${load.percent}%`}</b></div><div class="bar"><i style="width:${width}%"></i></div><div class="load-head"><span>${esc(load.label)}</span><span>${esc(system.capacityLabel||'telemetry only')}</span></div></div>
      <div class="metrics">${metrics}</div>${renderDisplayMap(system)}<div class="note">${esc(systemNote(system))}</div>
    </article>`;
  }).join('');
}

function renderWeb(items){
  $('webGrid').innerHTML=items.map(item=>`<div class="web-card"><div class="name">${esc(item.name)}<small>${esc(item.url)}</small></div><span class="state-badge ${item.state==='REACHABLE'?'state-ready':'state-offline'}">${esc(item.state)}</span><span class="latency">${finite(item.latency)?`${item.latency} ms`:(item.error||'—')}</span></div>`).join('');
}

function renderInventory(){
  $('inventoryGrid').innerHTML=INVENTORY.map(item=>`<div class="inventory-card"><b>${esc(item.name)}</b><span>${esc(item.meta)}</span></div>`).join('');
}

function renderIncidents(){
  const root=$('incidentList');
  if(!incidents.length){root.innerHTML='<div class="empty">No local state changes recorded yet.</div>';return;}
  root.innerHTML=incidents.slice(0,12).map(item=>`<div class="incident"><time>${fmtTime(item.at)}</time><div><b>${esc(item.name)}</b><div><em>${esc(item.from)} → ${esc(item.to)}${item.recovered?' · RECOVERED':''}</em></div></div><span class="state-badge ${statusClass(item.to)}">${esc(item.to)}</span></div>`).join('');
}

function renderSummary(systems,web){
  const states=systems.map(x=>x.state);
  const good=states.filter(x=>['ACTIVE','SHADOW'].includes(x)).length;
  const attention=states.filter(x=>['DEGRADED','STALE','DRIFT'].includes(x)).length;
  const offline=states.filter(x=>['OFFLINE','ERROR'].includes(x)).length;
  const standby=INVENTORY.filter(x=>/UNLINKED|LEGACY|EXTERNAL/.test(x.meta)).length;
  const scored=Math.max(1,good+attention+offline);const health=Math.round((good+attention*.55)/scored*100);
  $('overallHealth').textContent=`${health}%`;$('activeCount').textContent=String(good);$('standbyCount').textContent=String(standby);$('warningCount').textContent=String(attention);$('offlineCount').textContent=String(offline);$('lastUpdate').textContent=fmtTime(Date.now());
  $('overallNote').textContent=offline?'Immediate attention required':attention?'System online with warnings':'Monitored systems healthy';
  $('liveText').textContent=busy?'SCANNING':'MONITOR LIVE';
}

async function refresh(){
  if(busy)return;busy=true;$('liveText').textContent='SCANNING';
  try{
    const [systems,web]=await Promise.all([Promise.all(HEALTH_SYSTEMS.map(checkSystem)),Promise.all(WEB_TARGETS.map(probeWeb))]);
    const nextStates={...previousStates};
    for(const item of systems){addIncident(item.id,item.name,previousStates[item.id],item.state,item.error||item.data?.lastError||'');nextStates[item.id]=item.state;}
    previousStates=nextStates;writeLocal(STATE_KEY,previousStates);
    renderSystems(systems);renderWeb(web);renderIncidents();renderSummary(systems,web);
  }finally{busy=false;$('liveText').textContent='MONITOR LIVE'}
}

$('refreshBtn').addEventListener('click',refresh);
$('clearIncidents').addEventListener('click',()=>{incidents=[];writeLocal(INCIDENT_KEY,incidents);renderIncidents()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
renderInventory();renderIncidents();refresh();setInterval(refresh,REFRESH_MS);
})();
