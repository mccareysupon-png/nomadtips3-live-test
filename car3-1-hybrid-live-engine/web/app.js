import { CAR31_DEFAULT_CONFIG, normalizeCar31Config } from '../src/config.js';

const STORAGE_KEY = 'nomadtips3-car31-active-config';
const config = normalizeCar31Config(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || CAR31_DEFAULT_CONFIG);

document.querySelector('#primarySource').textContent = config.sourcePrimary;
document.querySelector('#apiPolicy').textContent = config.apiVerifyPolicy.replaceAll('_', ' ');

const matches = [
  {
    id:'G-31001',matchConfidence:96,league:'Demo Premier Division',minute:72,home:'North Harbor FC',away:'City Athletic',score:[0,1],state:'SIGNAL',momentum:74,
    stats:{possession:[58,42],attacks:[96,72],dangerous:[54,31],shots:[14,8],sot:[6,3],corners:[7,3],red:[0,0]},
    baseline:{dangerous:39,shots:9,sot:3,corners:5},
    odds:{win:[2.05,3.25,3.60],ah:['+0.25',1.91],ou:['Over 2.5',1.98]},
    sources:[['GOALOO','stats · 9s'],['API-FOOTBALL','fixture verified'],['MATCH','96%']],
    pressure:[[58,52,48],[60,55,45],[62,59,41],[64,61,39],[66,65,35],[68,69,31],[70,72,28],[72,74,26]],
    danger:[[58,40,28],[60,42,29],[62,44,29],[64,46,30],[66,49,30],[68,51,31],[70,53,31],[72,54,31]],
    events:[[12,'🟨','Away card'],[37,'⚽','Away goal'],[60,'◉','Window start'],[68,'↗','Momentum pass'],[72,'✓','Evidence pass']],
    trace:'Primary web snapshot supplies score/minute/stats. API verification is marked candidate-only. No source mismatch in this demo row.'
  },
  {
    id:'G-31002',matchConfidence:91,league:'Demo National League',minute:67,home:'Greenfield United',away:'Royal Town',score:[1,1],state:'NEAR',momentum:63,
    stats:{possession:[51,49],attacks:[81,79],dangerous:[39,36],shots:[10,9],sot:[4,4],corners:[5,6],red:[0,0]},
    baseline:{dangerous:34,shots:8,sot:3,corners:4},odds:{win:[2.32,3.00,2.95],ah:['0',1.84],ou:['Over 2.5',2.08]},
    sources:[['GOALOO','stats · 13s'],['API-FOOTBALL','waiting'],['MATCH','91%']],
    pressure:[[55,49,51],[58,52,48],[61,55,45],[64,59,41],[67,63,37]],danger:[[55,34,32],[58,35,33],[61,36,34],[64,38,35],[67,39,36]],
    events:[[26,'⚽','Home goal'],[44,'⚽','Away goal'],[60,'◉','Window start']],trace:'Primary data is fresh. Candidate has not completed confirmation rounds in this demo.'
  },
  {
    id:'G-31003',matchConfidence:98,league:'Demo Super League',minute:76,home:'Metro Stars',away:'Seaside FC',score:[2,1],state:'WATCH',momentum:57,
    stats:{possession:[55,45],attacks:[102,83],dangerous:[48,40],shots:[16,11],sot:[7,5],corners:[8,4],red:[0,0]},
    baseline:{dangerous:43,shots:13,sot:6,corners:7},odds:{win:[1.52,3.80,6.80],ah:['-0.75',1.88],ou:['Over 3.5',1.92]},
    sources:[['GOALOO','stats · 7s'],['API-FOOTBALL','not required'],['MATCH','98%']],
    pressure:[[62,62,38],[65,61,39],[68,59,41],[71,58,42],[74,56,44],[76,57,43]],danger:[[62,43,34],[65,44,35],[68,45,37],[71,46,38],[74,47,39],[76,48,40]],
    events:[[8,'⚽','Home goal'],[33,'⚽','Away goal'],[52,'⚽','Home goal'],[60,'◉','Window start']],trace:'Good data coverage, but momentum is below the configured threshold in this demo.'
  }
];

let selected = 0;

function escapeHtml(value){return String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function pct(a,b){const total=Math.max(1,Number(a)+Number(b));return [Math.round(Number(a)/total*100),Math.round(Number(b)/total*100)];}

function sparkSvg(points){
  const values=points.map(p=>p[1]); const min=Math.min(...values),max=Math.max(...values); const range=Math.max(1,max-min);
  const coords=values.map((v,i)=>`${i/(values.length-1||1)*100},${28-((v-min)/range)*22}`).join(' ');
  return `<svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="#00df91" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderCandidates(){
  const list=document.querySelector('#candidateList');
  list.innerHTML=matches.map((m,i)=>`<button class="candidate ${i===selected?'active':''}" data-index="${i}"><div class="candidate-top"><span class="candidate-minute">${m.minute}'</span><span class="state ${m.state.toLowerCase()}">${m.state}</span></div><div class="teams">${escapeHtml(m.home)} ${m.score[0]}–${m.score[1]} ${escapeHtml(m.away)}</div><div class="candidate-sub"><span>Momentum ${m.momentum}%</span><span>${escapeHtml(m.league)}</span></div><div class="spark">${sparkSvg(m.pressure)}</div></button>`).join('');
  list.querySelectorAll('.candidate').forEach(btn=>btn.addEventListener('click',()=>{selected=Number(btn.dataset.index);renderAll();}));
}

function barRow(label,values){const [a,b]=values;const [pa,pb]=pct(a,b);return `<div class="stat-row"><div class="stat-label"><b>${a}</b><span>${label}</span><b>${b}</b></div><div class="bar"><i style="width:${pa}%"></i><i style="width:${pb}%"></i></div></div>`}

function lineChart(svg,points,threshold=null){
  const width=800,height=220,pad=22; const xs=points.map(p=>p[0]); const minX=Math.min(...xs),maxX=Math.max(...xs); const xRange=Math.max(1,maxX-minX);
  const map=(x,y)=>[pad+((x-minX)/xRange)*(width-pad*2),height-pad-(y/100)*(height-pad*2)];
  const path=(idx)=>points.map((p,i)=>`${i?'L':'M'} ${map(p[0],p[idx])[0].toFixed(1)} ${map(p[0],p[idx])[1].toFixed(1)}`).join(' ');
  let grid=''; for(let y=0;y<=100;y+=25){const yy=map(minX,y)[1];grid+=`<line x1="${pad}" y1="${yy}" x2="${width-pad}" y2="${yy}" stroke="#233137" stroke-width="1"/><text x="2" y="${yy+3}" fill="#6f8580" font-size="9">${y}</text>`;}
  const thresholdLine=threshold===null?'':`<line x1="${pad}" y1="${map(minX,threshold)[1]}" x2="${width-pad}" y2="${map(minX,threshold)[1]}" stroke="#f4c84b" stroke-width="1.5" stroke-dasharray="7 6"/><text x="${width-74}" y="${map(minX,threshold)[1]-5}" fill="#f4c84b" font-size="9">TH ${threshold}%</text>`;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`); svg.innerHTML=`${grid}${thresholdLine}<path d="${path(1)}" fill="none" stroke="#00df91" stroke-width="3"/><path d="${path(2)}" fill="none" stroke="#55c8ff" stroke-width="2.5"/><text x="${pad}" y="${height-4}" fill="#6f8580" font-size="9">${minX}'</text><text x="${width-pad-20}" y="${height-4}" fill="#6f8580" font-size="9">${maxX}'</text>`;
}

function dangerChart(svg,points){
  const normalized=points.map(p=>[p[0],Math.min(100,p[1]),Math.min(100,p[2])]); lineChart(svg,normalized,null);
}

function decisionFor(m){
  const selectedOdds=config.market==='AH'?Number(m.odds.ah[1]):config.market==='OU'?Number(m.odds.ou[1]):Number(m.odds.win[0]);
  const ahLine=Number(String(m.odds.ah[0]).replace('+',''));
  const ouLine=Number((String(m.odds.ou[0]).match(/([0-9]+(?:\.[0-9]+)?)/)||[])[1]);
  const marketPass=config.market==='WIN' || (config.market==='AH' && Number.isFinite(ahLine) && ahLine>=config.ahMin && (config.ahMax===null || ahLine<=config.ahMax)) || (config.market==='OU' && Number.isFinite(ouLine) && Math.abs(ouLine-config.ouLine)<0.001);
  const goalGap=Math.abs(m.score[0]-m.score[1]);
  const evidence={dangerous:m.stats.dangerous[0]-m.baseline.dangerous,shots:m.stats.shots[0]-m.baseline.shots,sot:m.stats.sot[0]-m.baseline.sot,corners:m.stats.corners[0]-m.baseline.corners};
  const evidenceRules=[
    ['DA',config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],
    ['SHOTS',config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],
    ['SOT',config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],
    ['CORNERS',config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]
  ].filter(r=>r[1]);
  const passed=evidenceRules.filter(r=>r[2]>=r[3]).length; const required=config.attackEvidenceRequirement==='ALL'?evidenceRules.length:Number(config.attackEvidenceRequirement);
  const gates=[
    ['MINUTE',m.minute>=config.minuteMin&&m.minute<=config.minuteMax,`${config.minuteMin}-${config.minuteMax}'`],
    ['MARKET',marketPass,config.market==='AH'?`AH ${m.odds.ah[0]} / ${config.ahMin}${config.ahMax===null?'+':` to ${config.ahMax}`}`:config.market==='OU'?`${m.odds.ou[0]} / ${config.ouDirection} ${config.ouLine}`:'1X2 WIN'],
    ['ODDS',selectedOdds>=config.oddsMin&&(config.oddsMax===null||selectedOdds<=config.oddsMax),`${selectedOdds.toFixed(2)} / ≥${config.oddsMin.toFixed(2)}`],
    ['MOMENTUM',m.momentum>=config.momentumMin,`${m.momentum}% / ≥${config.momentumMin}%`],
    ['EVIDENCE',!config.attackEvidenceEnabled||passed>=Math.min(required,evidenceRules.length),`${passed}/${evidenceRules.length} · need ${config.attackEvidenceRequirement}`],
    ['GOAL GAP',!config.goalGapLimited||goalGap<=config.maxGoalGap,`${goalGap} / max ${config.maxGoalGap}`],
    ['SOURCE',m.matchConfidence>=config.matchConfidenceMin,`${m.matchConfidence}% / ≥${config.matchConfidenceMin}%`]
  ];
  const all=gates.every(g=>g[1]);
  return {gates,decision:all?'SHADOW SIGNAL':m.momentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',reason:all?`confirmation ${config.confirmationRounds} rounds required before real activation`:'one or more gates not ready',evidence};
}

function renderAll(){
  renderCandidates(); const m=matches[selected];
  document.querySelector('#homeTeam').textContent=m.home;document.querySelector('#awayTeam').textContent=m.away;document.querySelector('#matchMinute').textContent=`${m.minute}' LIVE`;document.querySelector('#scoreText').textContent=`${m.score[0]} – ${m.score[1]}`;document.querySelector('#leagueText').textContent=m.league;
  document.querySelector('#sourceRow').innerHTML=m.sources.map(([k,v])=>`<div class="source-pill"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('');
  const stats=[['Possession %',m.stats.possession],['Attacks',m.stats.attacks],['Dangerous Attacks',m.stats.dangerous],['Shots',m.stats.shots],['Shots on Target',m.stats.sot],['Corners',m.stats.corners],['Red Cards',m.stats.red]];
  document.querySelector('#statsGrid').innerHTML=stats.map(([l,v])=>barRow(l,v)).join('');
  lineChart(document.querySelector('#pressureChart'),m.pressure,config.momentumMin);dangerChart(document.querySelector('#dangerChart'),m.danger);
  const d=decisionFor(m);
  const evidenceCards=[['DANGEROUS ATTACKS',d.evidence.dangerous,config.attackEvidenceDangerousAttacksMin],['SHOTS',d.evidence.shots,config.attackEvidenceShotsMin],['SHOTS ON TARGET',d.evidence.sot,config.attackEvidenceShotsOnTargetMin],['CORNERS',d.evidence.corners,config.attackEvidenceCornersMin]];
  document.querySelector('#evidenceGrid').innerHTML=evidenceCards.map(([name,val,min])=>`<div class="evidence-card"><small>${name}</small><strong>${val>=0?'+':''}${val}</strong><span class="delta">need ≥${min}</span><div class="evidence-meter"><i style="width:${Math.min(100,Math.max(0,val/min*100))}%"></i></div></div>`).join('');
  document.querySelector('#oddsGrid').innerHTML=`<div class="odds-box"><small>1X2 SELECTED</small><b>${m.odds.win[0].toFixed(2)}</b></div><div class="odds-box"><small>ASIAN HANDICAP</small><b>${m.odds.ah[0]} @ ${m.odds.ah[1]}</b></div><div class="odds-box"><small>OVER / UNDER</small><b>${m.odds.ou[0]} @ ${m.odds.ou[1]}</b></div>`;
  document.querySelector('#events').innerHTML=m.events.map(([min,icon,text])=>`<div class="event"><b>${min}' ${icon}</b>${escapeHtml(text)}</div>`).join('');
  document.querySelector('#sourceTrace').textContent=m.trace;
  document.querySelector('#gateList').innerHTML=d.gates.map(([name,pass,text])=>`<div class="gate ${pass?'pass':''}"><span>${name}</span><b>${pass?'PASS':'WAIT'}</b><small>${escapeHtml(text)}</small></div>`).join('');
  document.querySelector('#finalDecision').textContent=d.decision;document.querySelector('#finalReason').textContent=d.reason;
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
  ['odds','events','source'].forEach(name=>{document.querySelector(`#tab-${name}`).hidden=name!==btn.dataset.tab;});
}));

renderAll();
