(()=>{
'use strict';

const REFRESH_MS=10_000;
const REQUEST_TIMEOUT_MS=8_000;
const INCIDENT_KEY='nomadControlCenterIncidentsV2';
const STATE_KEY='nomadControlCenterStatesV2';
const LIVE_ENGINE_HEALTH='https://nomadtips3-live-engine.mccarey-supon.workers.dev/health';
const LIVE_ENGINE_FEED='https://nomadtips3-live-engine.mccarey-supon.workers.dev/feed';

const PHYSICAL_SYSTEMS=[
  {id:'tc-v3',group:'primary',name:'TotalCorner · Live Feed V3',role:'แหล่งข้อมูลบอลสดและเหตุการณ์หลัก',endpoint:'https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/health',capacity:60,capacityLabel:'เพดานวางแผน 60 คู่สด'},
  {id:'live-engine',group:'primary',name:'NOMAD Live Engine',role:'เครื่องยนต์ Signal และทะเบียนแหล่งราคา',endpoint:LIVE_ENGINE_HEALTH,capacity:60,capacityLabel:'เพดานวางแผน 60 คู่'},
  {id:'market-engine',group:'primary',name:'Market Engine',role:'AsianBookie + API-Football Candidate',endpoint:'https://nomadtips3-market-engine.mccarey-supon.workers.dev/health'},
  {id:'tc-v2',group:'support',name:'TotalCorner · Live Feed V2',role:'แหล่งบอลสดสำรอง',endpoint:'https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev/health',capacity:60,capacityLabel:'เพดานวางแผน 60 คู่สด'},
  {id:'car34',group:'support',name:'Goaloo / CAR 3.4',role:'เครื่องทดลอง Shadow / ตรวจตลาดจริง',endpoint:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev/health',shadow:true,capacity:24,capacityLabel:'สูงสุด 24 คู่ต่อรอบ'},
  {id:'price-5d',group:'support',name:'5Dollar Price Adapter',role:'Adapter ราคาที่ Runtime 3.42 ยังอ้างถึง',endpoint:'https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev/health',drift:true,capacity:9,capacityLabel:'เพดานภายใน 9 request/นาที'}
];

const WEB_TARGETS=[
  {name:'หน้าแรก NOMADTIPS3',url:'https://www.nomadtips3.com/'},
  {name:'Live Score 3.42',url:'https://www.nomadtips3.com/nomad-live-342/index.html'},
  {name:'Signal',url:'https://www.nomadtips3.com/nomad-live-342/signal.html'},
  {name:'Statistics',url:'https://www.nomadtips3.com/nomad-live-342/statistics.html'},
  {name:'Soccer Predictions',url:'https://www.nomadtips3.com/soccer-predictions/'}
];

const INVENTORY=[
  {name:'Nowgoal',meta:'ใช้งานผ่าน NOMAD Live Engine · กรรมการ AH · 20 bookmaker identities'},
  {name:'Odds-API.io',meta:'ลงทะเบียน · แหล่งราคา S1'},
  {name:'The Odds API',meta:'ลงทะเบียน · แหล่งราคา S2'},
  {name:'API-Football',meta:'Candidate 1X2 / Over-Under · สถานะดูผ่าน Market Engine'},
  {name:'TotalCorner / Pinnacle',meta:'ลงทะเบียน · peer source S26'},
  {name:'AsianBookie',meta:'มี Adapter · สถานะดูผ่าน Market Engine'},
  {name:'Bet365',meta:'Bookmaker / ตัวตนราคาที่ Adapter ใช้'},
  {name:'ScoutingStats Odds Board',meta:'กรรมการ 1X2 ภายนอก · Browser/DOM · ยังไม่เชื่อม Telemetry'},
  {name:'THScore / THG',meta:'กรรมการตรวจซ้ำภายนอก · ยังไม่เชื่อม Telemetry'},
  {name:'7MSport / Pinnacle',meta:'กรรมการ AH ภายนอก · ยังไม่เชื่อม Telemetry'},
  {name:'Flashscore',meta:'ระบบเดิม / แหล่งที่เคยใช้ · ยังไม่ยืนยัน Telemetry ปัจจุบัน'},
  {name:'SofaScore /graph',meta:'สำรองกราฟ Momentum · ยังไม่เชื่อม Telemetry'},
  {name:'BigBaller',meta:'API pool เดิม · ยังไม่เชื่อม Telemetry'},
  {name:'5Dollar source8',meta:'ทะเบียนใหม่ระบุปลดแล้ว แต่ Runtime adapter ยังอ้างถึง → ต้องเฝ้าค่าระบบไม่ตรงกัน'}
];

const STATUS_TH={
  ACTIVE:'กำลังทำงาน',READY:'พร้อมใช้',STANDBY:'พร้อมสำรอง',WAIT:'รอตรวจ',SHADOW:'ระบบทดลอง',
  DEGRADED:'ทำงานได้ แต่มีปัญหา',STALE:'ข้อมูลค้าง',DRIFT:'ค่าระบบไม่ตรงกัน',OFFLINE:'ขาดการติดต่อ',ERROR:'ระบบผิดปกติ',
  UNLINKED:'ยังไม่เชื่อม',REGISTERED:'ลงทะเบียน',LEGACY:'ระบบเดิม',RETIRED:'ปลดใช้งานแล้ว',REACHABLE:'เปิดถึง'
};

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const firstFinite=(...values)=>values.find(finite);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const labelState=state=>STATUS_TH[state]||state||'—';
const fmtTime=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
const fmtAge=ms=>{if(!finite(ms))return '—';const sec=Math.max(0,Math.round(Number(ms)/1000));if(sec<60)return `${sec} วินาที`;const min=Math.floor(sec/60),rest=sec%60;return `${min} นาที ${rest} วินาที`;};
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
let incidents=readLocal(INCIDENT_KEY,[]);
let previousStates=readLocal(STATE_KEY,{});
let busy=false;

function healthState(system,data,httpOk=true){
  if(!httpOk)return 'OFFLINE';
  if(data?.ok===false)return 'ERROR';
  if(data?.sourceStale===true)return 'STALE';
  if(data?.degraded===true||data?.servingLastGood===true||data?.lastError)return 'DEGRADED';
  if(system.drift)return 'DRIFT';
  if(system.shadow)return 'SHADOW';
  return 'ACTIVE';
}
function statusClass(state){
  if(['ACTIVE','READY','STANDBY','REACHABLE'].includes(state))return 'state-ready';
  if(['DEGRADED','STALE','DRIFT','WAIT'].includes(state))return `state-${state.toLowerCase()}`;
  if(['OFFLINE','ERROR'].includes(state))return `state-${state.toLowerCase()}`;
  if(state==='SHADOW')return 'state-shadow';
  return 'state-unlinked';
}
function extractActivity(system,data){
  if(system.activity)return system.activity;
  if(system.id==='price-5d'){
    const used=firstFinite(data?.upstream?.usedLast60s,data?.rate?.usedLast60s,data?.usedLast60s);
    if(finite(used))return {value:Number(used),label:`${Number(used)} request / นาที`};
  }
  const matches=firstFinite(data?.liveMatches,data?.matches,data?.counts?.live,data?.counts?.matches,data?.matchCount,data?.currentMatches);
  if(finite(matches))return {value:Number(matches),label:`${Number(matches)} คู่`};
  return null;
}
function calculateLoad(system,data){
  if(finite(system.loadPercent))return {percent:clamp(Number(system.loadPercent),0,100),label:system.loadLabel||'ข้อมูลจาก Engine'};
  const activity=extractActivity(system,data);
  if(!activity||!finite(system.capacity)||system.capacity<=0)return {percent:null,label:activity?.label||'ยังไม่มีตัวนับปริมาณงานตรง'};
  return {percent:clamp(Math.round(activity.value/Number(system.capacity)*100),0,100),label:activity.label};
}
function addIncident(id,name,from,to,note=''){
  if(!from||from===to)return;
  const problem=['DEGRADED','STALE','DRIFT','OFFLINE','ERROR'].includes(to);
  const recovered=['DEGRADED','STALE','OFFLINE','ERROR'].includes(from)&&['ACTIVE','READY','STANDBY','SHADOW'].includes(to);
  if(!problem&&!recovered)return;
  incidents.unshift({at:Date.now(),id,name,from,to,note,recovered});
  incidents=incidents.slice(0,50);writeLocal(INCIDENT_KEY,incidents);
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
  try{const result=await fetchJson(system.endpoint);return {...system,state:healthState(system,result.data,true),data:result.data,latency:result.latency,error:null};}
  catch(error){return {...system,state:'OFFLINE',data:null,latency:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error)}}
}
async function probeWeb(target){
  const started=performance.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{await fetch(`${target.url}${target.url.includes('?')?'&':'?'}_nomad_probe=${Date.now()}`,{mode:'no-cors',cache:'no-store',signal:controller.signal});return {...target,state:'REACHABLE',latency:Math.round(performance.now()-started),error:null};}
  catch(error){return {...target,state:'OFFLINE',latency:null,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error)}
  }finally{clearTimeout(timer)}
}
function aggregateNowgoal(feed,engineHealth){
  const matches=Array.isArray(feed?.matches)?feed.matches:[];
  const rows=[];const matchedIds=new Set();
  for(const match of matches){
    const sources=(Array.isArray(match?.priceSources)?match.priceSources:[]).filter(source=>String(source?.source||'').toLowerCase()==='nowgoal');
    if(sources.length)matchedIds.add(String(match.id??`${match.home}|${match.away}`));
    rows.push(...sources);
  }
  const pass=rows.filter(x=>x.status==='PASS').length,stale=rows.filter(x=>x.status==='STALE').length,fail=rows.filter(x=>['FAIL','ERROR'].includes(x.status)).length,waiting=rows.filter(x=>!['PASS','STALE','FAIL','ERROR'].includes(x.status)).length;
  const totalLive=firstFinite(feed?.counts?.live,feed?.counts?.matches,engineHealth?.counts?.matches,matches.length)||0;
  let state='STANDBY';
  if(engineHealth?.__offline)state='UNLINKED';else if(fail>0&&pass===0)state='DEGRADED';else if(stale>0&&pass===0)state='STALE';else if(pass>0)state='ACTIVE';else if(rows.length>0)state='WAIT';
  return {
    id:'nowgoal',group:'primary',name:'Nowgoal',role:'กรรมการราคา AH · เครือข่าย 20 Bookmakers',state,
    data:{bookmakers:20,observed:rows.length,pass,stale,fail,waiting,activeMatches:matchedIds.size,totalLive,lastSuccess:engineHealth?.lastSuccess||null},
    activity:{value:matchedIds.size,label:rows.length?`${matchedIds.size} คู่มีข้อมูล Nowgoal`:'ยังไม่มีคู่ที่เรียก Nowgoal'},
    capacity:null,capacityLabel:'ไม่ใช้เปอร์เซ็นต์แทนภาระเซิร์ฟเวอร์',
    note:rows.length?`ข้อมูลจาก NOMAD Live Engine · PASS ${pass} · รอ ${waiting} · ค้าง ${stale} · ผิดพลาด ${fail}`:'Engine ติดต่อได้ แต่รอบนี้ยังไม่มี telemetry Nowgoal ระดับคู่แข่งขัน',
    metrics:[['Bookmakers','20'],['คู่ที่พบ Nowgoal',String(matchedIds.size)],['PASS',String(pass)],['รอ / ค้าง',`${waiting} / ${stale}`],['ผิดพลาด',String(fail)],['Engine ล่าสุด',fmtTime(engineHealth?.lastSuccess)]],
    error:engineHealth?.__offline?'NOMAD Live Engine ขาดการติดต่อ':null
  };
}
function deriveMarketChildren(market){
  if(!market)return [];
  if(market.state==='OFFLINE')return [
    {id:'asianbookie',group:'support',name:'AsianBookie',role:'แหล่งตลาดสำรอง',state:'UNLINKED',data:{},note:'Market Engine ขาดการติดต่อ จึงยืนยันสถานะ Adapter ไม่ได้'},
    {id:'api-football',group:'support',name:'API-Football',role:'Candidate 1X2 / Over-Under',state:'UNLINKED',data:{},note:'Market Engine ขาดการติดต่อ จึงยืนยันสถานะ Candidate ไม่ได้'}
  ];
  const d=market.data||{};
  const asianEnabled=d?.asianBookie?.enabled===true;
  const asianState=asianEnabled?(d.providerConfigured?'STANDBY':'READY'):'UNLINKED';
  const apiConfigured=d?.apiFootballCandidate?.configured===true;
  return [
    {id:'asianbookie',group:'support',name:'AsianBookie',role:'แหล่งตลาดสำรอง',state:asianState,data:d,metrics:[['Adapter',asianEnabled?'พร้อม':'ไม่เปิด'],['Provider',d.providerName||'—'],['Match cache',finite(d?.asianBookie?.matchCacheMs)?fmtAge(d.asianBookie.matchCacheMs):'—'],['Odds cache',finite(d?.asianBookie?.oddsCacheMs)?fmtAge(d.asianBookie.oddsCacheMs):'—']],note:asianEnabled?'Adapter มีอยู่และถูกดูแลผ่าน Market Engine':'ยังไม่เปิด AsianBookie ใน Market Engine'},
    {id:'api-football',group:'support',name:'API-Football',role:'Candidate 1X2 / Over-Under',state:apiConfigured?'STANDBY':'UNLINKED',data:d,metrics:[['Candidate',d?.apiFootballCandidate?.enabled?'เปิด':'ปิด'],['API key',apiConfigured?'พร้อม':'ยังไม่ตั้งค่า'],['ตลาด','1X2 / Over-Under'],['Trigger',d?.apiFootballCandidate?.trigger||'—']],note:apiConfigured?'พร้อมให้ Event Gate เรียกเมื่อเข้าเงื่อนไข':'Candidate มีในโค้ด แต่ยังยืนยัน API key ไม่ได้'}
  ];
}
function metricsFor(system){
  if(Array.isArray(system.metrics))return system.metrics;
  const d=system.data||{},activity=extractActivity(system,d),sourceAge=firstFinite(d.sourceAgeMs,d.priceAgeMs,d.ageMs),lastSuccess=d.lastSuccessAt||d.lastSuccess||d.updatedAt||null,cycle=firstFinite(d.cycle,d.cycleCount),provider=d.providerName||d.source?.name||d.service||d.component||'—';
  return [['งานที่กำลังทำ',activity?.label||'—'],['อายุข้อมูล',fmtAge(sourceAge)],['สำเร็จล่าสุด',fmtTime(lastSuccess)],['รอบการทำงาน',finite(cycle)?String(cycle):'—'],['เวลาตอบสนอง',finite(system.latency)?`${system.latency} ms`:'—'],['แหล่งข้อมูล',provider]];
}
function systemNote(system){
  const d=system.data||{};
  if(system.note)return system.note;
  if(system.error)return `ติดต่อ Monitor ไม่สำเร็จ: ${system.error}`;
  if(d.lastError)return `ข้อผิดพลาดล่าสุด: ${d.lastError}`;
  if(system.id==='price-5d')return 'Runtime 3.42 ยังอ้างถึง Adapter นี้ แต่ Source 8 ถูกปลดจาก Registry ใหม่ จึงเฝ้าเป็น “ค่าระบบไม่ตรงกัน”';
  if(d.servingLastGood)return 'กำลังใช้ข้อมูลล่าสุดที่ดีอยู่ ระหว่างแหล่งต้นทางมีปัญหา';
  if(system.capacityLabel)return `ฐานคำนวณปริมาณงาน: ${system.capacityLabel}`;
  return 'เชื่อม Health endpoint แล้ว · อ่านอย่างเดียว';
}
function renderSystemGroup(id,systems){
  const root=$(id);if(!root)return;
  root.innerHTML=systems.map(system=>{
    const load=calculateLoad(system,system.data||{}),width=load.percent==null?0:load.percent,metrics=metricsFor(system).map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    return `<article class="system-card"><div class="card-top"><div><div class="system-name">${esc(system.name)}</div><div class="role">${esc(system.role)}</div></div><span class="state-badge ${statusClass(system.state)}">${esc(labelState(system.state))}</span></div><div class="load-row"><div class="load-head"><span>ปริมาณงาน</span><b>${load.percent==null?'—':`${load.percent}%`}</b></div><div class="bar"><i style="width:${width}%"></i></div><div class="load-head"><span>${esc(load.label)}</span><span>${esc(system.capacityLabel||'ข้อมูลสถานะเท่านั้น')}</span></div></div><div class="metrics">${metrics}</div><div class="note">${esc(systemNote(system))}</div></article>`;
  }).join('');
}
function renderWeb(items){$('webGrid').innerHTML=items.map(item=>`<div class="web-card"><div class="name">${esc(item.name)}<small>${esc(item.url)}</small></div><span class="state-badge ${item.state==='REACHABLE'?'state-ready':'state-offline'}">${item.state==='REACHABLE'?'เปิดถึง':'ขาดการติดต่อ'}</span><span class="latency">เวลาตอบสนอง ${finite(item.latency)?`${item.latency} ms`:(item.error||'—')}</span></div>`).join('');}
function renderInventory(){$('inventoryGrid').innerHTML=INVENTORY.map(item=>`<div class="inventory-card"><b>${esc(item.name)}</b><span>${esc(item.meta)}</span></div>`).join('');}
function renderIncidents(){const root=$('incidentList');if(!incidents.length){root.innerHTML='<div class="empty">ยังไม่มีการเปลี่ยนสถานะที่ต้องบันทึกในหน้าจอนี้</div>';return;}root.innerHTML=incidents.slice(0,14).map(item=>`<div class="incident"><time>${fmtTime(item.at)}</time><div><b>${esc(item.name)}</b><div><em>${esc(labelState(item.from))} → ${esc(labelState(item.to))}${item.recovered?' · กลับมาปกติ':''}</em></div></div><span class="state-badge ${statusClass(item.to)}">${esc(labelState(item.to))}</span></div>`).join('');}
function maintenanceFor(system){
  if(system.state==='OFFLINE')return 'ตรวจ /health, Worker deployment, DNS/route และ upstream ก่อน';
  if(system.state==='ERROR')return 'เปิดดู error ล่าสุดและตรวจ Worker configuration';
  if(system.state==='STALE')return 'ตรวจ freshness, upstream source และเวลาที่ข้อมูลเปลี่ยนล่าสุด';
  if(system.state==='DEGRADED')return 'ตรวจ lastError และดูว่ากำลังใช้ last-good/fallback หรือไม่';
  if(system.state==='DRIFT')return 'ตรวจ Runtime reference เทียบ Registry ก่อนแก้หรือลบ Adapter';
  return null;
}
function renderMaintenance(systems,web){
  const tasks=systems.map(s=>({name:s.name,state:s.state,text:maintenanceFor(s)})).filter(x=>x.text);
  for(const item of web.filter(x=>x.state==='OFFLINE'))tasks.push({name:item.name,state:'OFFLINE',text:'ตรวจหน้าเว็บ, deployment และ route ก่อน อย่าแก้ Engine หาก /health ยังปกติ'});
  $('maintenanceList').innerHTML=tasks.length?tasks.map(item=>`<div class="maintenance-item"><div><b>${esc(item.name)}</b><span>${esc(item.text)}</span></div><span class="state-badge ${statusClass(item.state)}">${esc(labelState(item.state))}</span></div>`).join(''):'<div class="empty">ยังไม่มีจุดที่ต้องซ่อมจากสถานะที่ตรวจพบ</div>';
}
function renderSummary(systems){
  const states=systems.map(x=>x.state),good=states.filter(x=>['ACTIVE','READY','STANDBY','SHADOW'].includes(x)).length,attention=states.filter(x=>['DEGRADED','STALE','DRIFT','WAIT'].includes(x)).length,offline=states.filter(x=>['OFFLINE','ERROR'].includes(x)).length,unlinked=states.filter(x=>x==='UNLINKED').length+INVENTORY.filter(x=>/ยังไม่เชื่อม Telemetry/.test(x.meta)).length;
  const scored=Math.max(1,good+attention+offline),health=Math.round((good+attention*.55)/scored*100);
  $('overallHealth').textContent=`${health}%`;$('activeCount').textContent=String(good);$('standbyCount').textContent=String(unlinked);$('warningCount').textContent=String(attention);$('offlineCount').textContent=String(offline);$('lastUpdate').textContent=fmtTime(Date.now());
  $('overallNote').textContent=offline?'มีระบบขาดการติดต่อ ต้องตรวจทันที':attention?'ระบบยังทำงาน แต่มีจุดที่ควรตรวจ':'ระบบที่ตรวจได้อยู่ในสภาพปกติ';
}
async function refresh(){
  if(busy)return;busy=true;$('liveText').textContent='กำลังสแกน';
  try{
    const physicalPromise=Promise.all(PHYSICAL_SYSTEMS.map(checkSystem));
    const webPromise=Promise.all(WEB_TARGETS.map(probeWeb));
    const feedPromise=fetchJson(LIVE_ENGINE_FEED).catch(()=>({ok:false,data:null,latency:null}));
    const [physical,web,feedResult]=await Promise.all([physicalPromise,webPromise,feedPromise]);
    const liveEngine=physical.find(x=>x.id==='live-engine');
    const market=physical.find(x=>x.id==='market-engine');
    if(liveEngine)liveEngine.data={...(liveEngine.data||{}),__offline:liveEngine.state==='OFFLINE'};
    const nowgoal=aggregateNowgoal(feedResult?.data,liveEngine?.data||{__offline:true});
    const derived=deriveMarketChildren(market);
    const primary=[physical.find(x=>x.id==='tc-v3'),nowgoal,liveEngine,market].filter(Boolean);
    const support=[physical.find(x=>x.id==='tc-v2'),...derived,physical.find(x=>x.id==='car34'),physical.find(x=>x.id==='price-5d')].filter(Boolean);
    const all=[...primary,...support];
    const nextStates={...previousStates};
    for(const item of all){addIncident(item.id,item.name,previousStates[item.id],item.state,item.error||item.data?.lastError||'');nextStates[item.id]=item.state;}
    previousStates=nextStates;writeLocal(STATE_KEY,previousStates);
    renderSystemGroup('primarySystemsGrid',primary);renderSystemGroup('supportSystemsGrid',support);renderWeb(web);renderIncidents();renderMaintenance(all,web);renderSummary(all);
  }finally{busy=false;$('liveText').textContent='กำลังตรวจสด'}
}

$('refreshBtn').addEventListener('click',refresh);
$('clearIncidents').addEventListener('click',()=>{incidents=[];writeLocal(INCIDENT_KEY,incidents);renderIncidents()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
renderInventory();renderIncidents();refresh();setInterval(refresh,REFRESH_MS);
})();
