import { CAR31_DEFAULT_CONFIG, CAR31_SOURCE_MODE, normalizeCar31Config } from '../src/config.js';

const STORAGE_KEY = 'nomadtips3-car31-active-config';
const config = normalizeCar31Config(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || CAR31_DEFAULT_CONFIG);

document.querySelector('#primarySource').textContent = config.sourcePrimary;
document.querySelector('#apiPolicy').textContent = CAR31_SOURCE_MODE.locked ? 'OFF · GOALOO ONLY' : config.apiVerifyPolicy.replaceAll('_', ' ');

let matches = [];
let selected = 0;
let runtime = null;
let snapshots = [];

function escapeHtml(value){return String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function pairObj(value){return [num(value?.home),num(value?.away)];}
function pct(a,b){const total=Math.max(1,Number(a)+Number(b));return [Math.round(Number(a)/total*100),Math.round(Number(b)/total*100)];}
function fmt(value,digits=2){const n=Number(value);return Number.isFinite(n)?n.toFixed(digits):'N/A';}

function weightedPressure(stats){
  const w=config.momentumWeights;
  const keys=[
    ['attacks',w.attacks],['dangerous_attacks',w.dangerous_attacks],['shots',w.shots],['shots_on_target',w.shots_on_target],['corners',w.corners],['possession',w.possession]
  ];
  let home=0,away=0;
  for(const [key,weight] of keys){home+=num(stats?.[key]?.home)*weight;away+=num(stats?.[key]?.away)*weight;}
  const total=Math.max(.0001,home+away);
  return [Math.round(home/total*100),Math.round(away/total*100)];
}

function snapshotSeries(id,key){
  const rows=[];
  for(const snap of snapshots){
    const m=(snap.matches||[]).find(x=>String(x.id)===String(id));
    if(!m || !Number.isFinite(Number(m.minute))) continue;
    const stats=m.stats||{};
    if(key==='pressure'){
      const [home,away]=weightedPressure(stats);rows.push([Number(m.minute),home,away]);
    } else {
      rows.push([Number(m.minute),num(stats?.dangerous_attacks?.home),num(stats?.dangerous_attacks?.away)]);
    }
  }
  const dedup=new Map();rows.forEach(row=>dedup.set(row[0],row));
  return [...dedup.values()].sort((a,b)=>a[0]-b[0]).slice(-Math.max(4,config.chartHistoryMinutes));
}

function baselineFor(id,current){
  const candidates=[];
  for(const snap of snapshots){
    const m=(snap.matches||[]).find(x=>String(x.id)===String(id));
    if(!m || !Number.isFinite(Number(m.minute))) continue;
    if(Number(m.minute)>=config.minuteMin) candidates.push(m);
  }
  const first=candidates.sort((a,b)=>Number(a.minute)-Number(b.minute))[0];
  const stats=first?.stats||{};
  return {
    dangerous:num(stats?.dangerous_attacks?.home,current.stats.dangerous[0]),
    shots:num(stats?.shots?.home,current.stats.shots[0]),
    sot:num(stats?.shots_on_target?.home,current.stats.sot[0]),
    corners:num(stats?.corners?.home,current.stats.corners[0])
  };
}

function adaptMatch(row){
  const stats={
    possession:pairObj(row.stats?.possession),attacks:pairObj(row.stats?.attacks),dangerous:pairObj(row.stats?.dangerous_attacks),shots:pairObj(row.stats?.shots),sot:pairObj(row.stats?.shots_on_target),corners:pairObj(row.stats?.corners),red:pairObj(row.stats?.red_cards)
  };
  const [homeMomentum]=weightedPressure(row.stats||{});
  const base={id:String(row.sourceMatchId),matchConfidence:row.coreStatsComplete?100:70,league:row.league||'Goaloo Live',minute:Number.isFinite(Number(row.minute))?Number(row.minute):0,home:row.home||'Home',away:row.away||'Away',score:[num(row.score?.home),num(row.score?.away)],state:'WATCH',momentum:homeMomentum,stats,
    odds:{win:[null,null,null],ah:[null,null],ou:[null,null]},
    sources:[['GOALOO',`live · ${row.sourceFreshnessSeconds ?? 0}s`],['CORE STATS',row.coreStatsComplete?'READY':'PARTIAL'],['SOURCE ID',String(row.sourceMatchId)]],
    events:[],trace:`GOALOO ONLY live record · ${row.sourceUrl||''} · ${row.warnings?.length?row.warnings.join(', '):'parser OK'}`};
  base.baseline=baselineFor(base.id,base);
  base.pressure=snapshotSeries(base.id,'pressure');
  base.danger=snapshotSeries(base.id,'danger');
  if(!base.pressure.length) base.pressure=[[base.minute,homeMomentum,100-homeMomentum]];
  if(!base.danger.length) base.danger=[[base.minute,stats.dangerous[0],stats.dangerous[1]]];
  const decision=decisionFor(base);
  base.state=decision.decision==='SHADOW SIGNAL'?'SIGNAL':decision.decision;
  return base;
}

function sparkSvg(points){
  if(!points?.length)return '';
  const values=points.map(p=>p[1]); const min=Math.min(...values),max=Math.max(...values); const range=Math.max(1,max-min);
  const coords=values.map((v,i)=>`${i/(values.length-1||1)*100},${28-((v-min)/range)*22}`).join(' ');
  return `<svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="#00df91" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderCandidates(){
  const list=document.querySelector('#candidateList');
  if(!matches.length){list.innerHTML='<div class="footer-note">ยังไม่พบข้อมูล Goaloo ที่ parser อ่านได้ในรอบล่าสุด · เครื่องยังหมุนและจะลองใหม่ทุกนาที</div>';return;}
  list.innerHTML=matches.map((m,i)=>`<button class="candidate ${i===selected?'active':''}" data-index="${i}"><div class="candidate-top"><span class="candidate-minute">${m.minute?`${m.minute}'`:'LIVE'}</span><span class="state ${m.state.toLowerCase()}">${m.state}</span></div><div class="teams">${escapeHtml(m.home)} ${m.score[0]}–${m.score[1]} ${escapeHtml(m.away)}</div><div class="candidate-sub"><span>Momentum ${m.momentum}%</span><span>${escapeHtml(m.league)}</span></div><div class="spark">${sparkSvg(m.pressure)}</div></button>`).join('');
  list.querySelectorAll('.candidate').forEach(btn=>btn.addEventListener('click',()=>{selected=Number(btn.dataset.index);renderAll();}));
}

function barRow(label,values){const [a,b]=values;const [pa,pb]=pct(a,b);return `<div class="stat-row"><div class="stat-label"><b>${a}</b><span>${label}</span><b>${b}</b></div><div class="bar"><i style="width:${pa}%"></i><i style="width:${pb}%"></i></div></div>`}

function lineChart(svg,points,threshold=null){
  const safe=points?.length?points:[[0,0,0]];
  const width=800,height=220,pad=22; const xs=safe.map(p=>p[0]); const minX=Math.min(...xs),maxX=Math.max(...xs); const xRange=Math.max(1,maxX-minX);
  const map=(x,y)=>[pad+((x-minX)/xRange)*(width-pad*2),height-pad-(Math.max(0,Math.min(100,y))/100)*(height-pad*2)];
  const path=(idx)=>safe.map((p,i)=>`${i?'L':'M'} ${map(p[0],p[idx])[0].toFixed(1)} ${map(p[0],p[idx])[1].toFixed(1)}`).join(' ');
  let grid=''; for(let y=0;y<=100;y+=25){const yy=map(minX,y)[1];grid+=`<line x1="${pad}" y1="${yy}" x2="${width-pad}" y2="${yy}" stroke="#233137" stroke-width="1"/><text x="2" y="${yy+3}" fill="#6f8580" font-size="9">${y}</text>`;}
  const thresholdLine=threshold===null?'':`<line x1="${pad}" y1="${map(minX,threshold)[1]}" x2="${width-pad}" y2="${map(minX,threshold)[1]}" stroke="#f4c84b" stroke-width="1.5" stroke-dasharray="7 6"/><text x="${width-74}" y="${map(minX,threshold)[1]-5}" fill="#f4c84b" font-size="9">TH ${threshold}%</text>`;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.innerHTML=`${grid}${thresholdLine}<path d="${path(1)}" fill="none" stroke="#00df91" stroke-width="3"/><path d="${path(2)}" fill="none" stroke="#55c8ff" stroke-width="2.5"/><text x="${pad}" y="${height-4}" fill="#6f8580" font-size="9">${minX}'</text><text x="${width-pad-20}" y="${height-4}" fill="#6f8580" font-size="9">${maxX}'</text>`;
}
function dangerChart(svg,points){lineChart(svg,(points||[]).map(p=>[p[0],Math.min(100,p[1]),Math.min(100,p[2])]),null);}

function decisionFor(m){
  const selectedOdds=config.market==='AH'?Number(m.odds.ah[1]):config.market==='OU'?Number(m.odds.ou[1]):Number(m.odds.win[0]);
  const hasOdds=Number.isFinite(selectedOdds);
  const ahLine=Number(String(m.odds.ah[0]??'').replace('+',''));
  const ouLine=Number((String(m.odds.ou[0]??'').match(/([0-9]+(?:\.[0-9]+)?)/)||[])[1]);
  const marketPass=config.market==='WIN'?hasOdds:(config.market==='AH'&&hasOdds&&Number.isFinite(ahLine)&&ahLine>=config.ahMin&&(config.ahMax===null||ahLine<=config.ahMax))||(config.market==='OU'&&hasOdds&&Number.isFinite(ouLine)&&Math.abs(ouLine-config.ouLine)<0.001);
  const goalGap=Math.abs(m.score[0]-m.score[1]);
  const evidence={dangerous:m.stats.dangerous[0]-m.baseline.dangerous,shots:m.stats.shots[0]-m.baseline.shots,sot:m.stats.sot[0]-m.baseline.sot,corners:m.stats.corners[0]-m.baseline.corners};
  const evidenceRules=[['DA',config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],['SHOTS',config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],['SOT',config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],['CORNERS',config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]].filter(r=>r[1]);
  const passed=evidenceRules.filter(r=>r[2]>=r[3]).length; const required=config.attackEvidenceRequirement==='ALL'?evidenceRules.length:Number(config.attackEvidenceRequirement);
  const gates=[
    ['MINUTE',m.minute>=config.minuteMin&&m.minute<=config.minuteMax,`${config.minuteMin}-${config.minuteMax}'`],
    ['MARKET / ODDS',marketPass,hasOdds?`${config.market} @ ${fmt(selectedOdds)}`:'Goaloo odds parser waiting'],
    ['MOMENTUM',m.momentum>=config.momentumMin,`${m.momentum}% / ≥${config.momentumMin}%`],
    ['EVIDENCE',!config.attackEvidenceEnabled||passed>=Math.min(required,evidenceRules.length),`${passed}/${evidenceRules.length} · need ${config.attackEvidenceRequirement}`],
    ['GOAL GAP',!config.goalGapLimited||goalGap<=config.maxGoalGap,`${goalGap} / max ${config.maxGoalGap}`],
    ['SOURCE',m.matchConfidence>=config.matchConfidenceMin,`Goaloo ${m.id} · ${m.matchConfidence}%`]
  ];
  const all=gates.every(g=>g[1]);
  return {gates,decision:all?'SHADOW SIGNAL':m.momentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',reason:all?`confirmation ${config.confirmationRounds} rounds required before real activation`:'one or more gates not ready',evidence};
}

function clearDetail(message){
  document.querySelector('#homeTeam').textContent='—';document.querySelector('#awayTeam').textContent='—';document.querySelector('#matchMinute').textContent='WAITING';document.querySelector('#scoreText').textContent='—';document.querySelector('#leagueText').textContent=message;
  document.querySelector('#sourceRow').innerHTML='';document.querySelector('#statsGrid').innerHTML='';document.querySelector('#evidenceGrid').innerHTML='';document.querySelector('#oddsGrid').innerHTML='<div class="footer-note">Waiting for Goaloo live data.</div>';document.querySelector('#events').innerHTML='';document.querySelector('#sourceTrace').textContent=message;document.querySelector('#gateList').innerHTML='';document.querySelector('#finalDecision').textContent='WAIT';document.querySelector('#finalReason').textContent=message;
  lineChart(document.querySelector('#pressureChart'),[[0,0,0]],config.momentumMin);dangerChart(document.querySelector('#dangerChart'),[[0,0,0]]);
}

function renderMetrics(){
  document.querySelector('#metricLive').textContent=matches.length;
  document.querySelector('#metricStats').textContent=matches.filter(m=>m.matchConfidence===100).length;
  document.querySelector('#metricWindow').textContent=matches.filter(m=>m.minute>=config.minuteMin&&m.minute<=config.minuteMax).length;
  const states=matches.map(m=>decisionFor(m).decision);
  document.querySelector('#metricWatch').textContent=states.filter(s=>s==='WATCH').length;
  document.querySelector('#metricNear').textContent=states.filter(s=>s==='NEAR').length;
  document.querySelector('#metricSignal').textContent=states.filter(s=>s==='SHADOW SIGNAL').length;
}

function renderAll(){
  renderCandidates();renderMetrics();
  if(!matches.length){clearDetail(runtime?.workerUrl?'Goaloo collector online · waiting for parseable live matches':'Worker endpoint not published yet');return;}
  if(selected>=matches.length)selected=0; const m=matches[selected];
  document.querySelector('#homeTeam').textContent=m.home;document.querySelector('#awayTeam').textContent=m.away;document.querySelector('#matchMinute').textContent=m.minute?`${m.minute}' LIVE`:'LIVE';document.querySelector('#scoreText').textContent=`${m.score[0]} – ${m.score[1]}`;document.querySelector('#leagueText').textContent=m.league;
  document.querySelector('#sourceRow').innerHTML=m.sources.map(([k,v])=>`<div class="source-pill"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('');
  const stats=[['Possession %',m.stats.possession],['Attacks',m.stats.attacks],['Dangerous Attacks',m.stats.dangerous],['Shots',m.stats.shots],['Shots on Target',m.stats.sot],['Corners',m.stats.corners],['Red Cards',m.stats.red]];
  document.querySelector('#statsGrid').innerHTML=stats.map(([l,v])=>barRow(l,v)).join('');
  lineChart(document.querySelector('#pressureChart'),m.pressure,config.momentumMin);dangerChart(document.querySelector('#dangerChart'),m.danger);
  const d=decisionFor(m);
  const evidenceCards=[['DANGEROUS ATTACKS',d.evidence.dangerous,config.attackEvidenceDangerousAttacksMin],['SHOTS',d.evidence.shots,config.attackEvidenceShotsMin],['SHOTS ON TARGET',d.evidence.sot,config.attackEvidenceShotsOnTargetMin],['CORNERS',d.evidence.corners,config.attackEvidenceCornersMin]];
  document.querySelector('#evidenceGrid').innerHTML=evidenceCards.map(([name,val,min])=>`<div class="evidence-card"><small>${name}</small><strong>${val>=0?'+':''}${val}</strong><span class="delta">need ≥${min}</span><div class="evidence-meter"><i style="width:${Math.min(100,Math.max(0,min?val/min*100:0))}%"></i></div></div>`).join('');
  document.querySelector('#oddsGrid').innerHTML='<div class="odds-box"><small>1X2</small><b>N/A</b></div><div class="odds-box"><small>ASIAN HANDICAP</small><b>N/A</b></div><div class="odds-box"><small>OVER / UNDER</small><b>N/A</b></div>';
  document.querySelector('#events').innerHTML=m.events.length?m.events.map(([min,icon,text])=>`<div class="event"><b>${min}' ${icon}</b>${escapeHtml(text)}</div>`).join(''):'<div class="footer-note">Event parser not connected yet.</div>';
  document.querySelector('#sourceTrace').textContent=m.trace;
  document.querySelector('#gateList').innerHTML=d.gates.map(([name,pass,text])=>`<div class="gate ${pass?'pass':''}"><span>${name}</span><b>${pass?'PASS':'WAIT'}</b><small>${escapeHtml(text)}</small></div>`).join('');
  document.querySelector('#finalDecision').textContent=d.decision;document.querySelector('#finalReason').textContent=d.reason;
}

async function loadRuntime(){
  const response=await fetch(`./runtime.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error(`runtime ${response.status}`);return response.json();
}
async function refreshLive(){
  try{
    runtime=runtime||await loadRuntime();
    if(!runtime?.workerUrl){renderAll();return;}
    const [liveRes,snapRes,healthRes]=await Promise.all([
      fetch(`${runtime.liveUrl}?t=${Date.now()}`,{cache:'no-store'}),
      fetch(`${runtime.workerUrl}/snapshots?t=${Date.now()}`,{cache:'no-store'}),
      fetch(`${runtime.healthUrl}?t=${Date.now()}`,{cache:'no-store'})
    ]);
    if(liveRes.ok){const live=await liveRes.json();}
    const live=liveRes.ok?await fetch(`${runtime.liveUrl}?t=${Date.now()+1}`,{cache:'no-store'}).then(r=>r.json()):{matches:[]};
    snapshots=snapRes.ok?(await snapRes.json()).snapshots||[]:[];
    const health=healthRes.ok?await healthRes.json():null;
    matches=(live.matches||[]).map(adaptMatch).filter(m=>m.home&&m.away).sort((a,b)=>b.momentum-a.momentum);
    if(health){document.querySelector('#primarySource').textContent=`GOALOO · ${health.lastSuccess?'ONLINE':'WAIT'}`;document.querySelector('#apiPolicy').textContent=`API OFF · CRON 1 MIN · ${health.cycleMs??'—'}ms`;}
    renderAll();
  }catch(error){console.error('CAR 3.1 live refresh',error);renderAll();}
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
  ['odds','events','source'].forEach(name=>{document.querySelector(`#tab-${name}`).hidden=name!==btn.dataset.tab;});
}));

renderAll();
refreshLive();
setInterval(refreshLive,15000);
