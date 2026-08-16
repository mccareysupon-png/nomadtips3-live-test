const WORKER='https://nomadtips3-car33-live.mccarey-supon.workers.dev';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};

let page=1;
const limit=25;
let total=0;
let pageBusy=false;
let chartBusy=false;
let chartRangeDays=365;

const odds=v=>n(v)===null?'—':n(v).toFixed(2);
const line=v=>n(v)===null?'—':`${n(v)>0?'+':''}${Number.isInteger(n(v))?n(v).toFixed(1):n(v)}`;

function signalText(r){
  if(r.market==='AH')return`${r.selectedTeam} ${line(r.selectedLine)} @ ${odds(r.lockedOdds)}`;
  if(r.market==='OU')return`${r.ouDirection||'OVER'} ${line(r.selectedLine)} @ ${odds(r.lockedOdds)}`;
  return`${r.selectedTeam} WIN @ ${odds(r.lockedOdds)}`;
}
function signalTime(r){
  const s=n(r.signalElapsedSeconds);
  return s===null?`${r.entryMinute??'—'}'`:`${Math.floor(s/60)}:${String(Math.floor(s)%60).padStart(2,'0')}`;
}
function entryScore(r){
  if(!r.entryScore)return'—';
  return r.selectedSide==='AWAY'?`${r.entryScore.away??'—'}–${r.entryScore.home??'—'}`:`${r.entryScore.home??'—'}–${r.entryScore.away??'—'}`;
}
function finalScore(r){
  return r.finalScore?`${r.finalScore.home??'—'}–${r.finalScore.away??'—'}`:(r.result==='PENDING'?'LIVE':'—');
}
function dtShort(v){
  if(!v)return'—';
  const d=new Date(v);
  if(!Number.isFinite(d.getTime()))return'—';
  return d.toLocaleString([], {year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function signed(v){const x=n(v);return x===null?'—':`${x>=0?'+':''}${x}`;}
function evidenceText(r){
  const e=r.evidence||{};
  return`Danger ${signed(e.dangerous)} · Shots ${signed(e.shots)} · SOT ${signed(e.sot)} · Corners ${signed(e.corners)}`;
}

function mainRow(r){
  const status=String(r.result||'PENDING').toUpperCase();
  const pending=status==='PENDING';
  const momentum=n(r.momentum)===null?'—':`${Math.round(n(r.momentum))}%`;
  const title=[r.league||'',evidenceText(r),r.resultDetail||status].filter(Boolean).join(' · ');
  return `<tr class="record-row ${pending?'pending-row':''}" title="${esc(title)}">
    <td><span class="status-pill ${esc(status)}">${esc(status)}</span></td>
    <td class="signal-cell"><strong>${esc(signalText(r))}</strong></td>
    <td class="match-cell">${esc(r.home||'—')} <span>vs</span> ${esc(r.away||'—')}</td>
    <td class="entry-cell"><b>${esc(signalTime(r))}</b><span>${esc(entryScore(r))}</span></td>
    <td>${esc(momentum)}</td>
    <td class="final-cell ${pending?'pending-note':''}">${esc(finalScore(r))}</td>
    <td>${esc(dtShort(r.selectedAt))}</td>
    <td>${pending?'<span class="pending-note">PENDING</span>':esc(dtShort(r.settledAt))}</td>
  </tr>`;
}

function renderSummary(s={}){
  const settled=(n(s.win)||0)+(n(s.loss)||0)+(n(s.draw)||0);
  const cards=[
    ['TOTAL',s.total??0,''],
    ['SETTLED',settled,''],
    ['PENDING',s.pending??0,'pending'],
    ['WIN',s.win??0,'win'],
    ['LOSS',s.loss??0,'loss'],
    ['DRAW',s.draw??0,'draw'],
    ['WIN RATE',s.winRate==null?'—':`${Number(s.winRate).toFixed(1)}%`,'rate'],
    ['AVG ODDS',s.averageOdds==null?'—':Number(s.averageOdds).toFixed(2),'odds']
  ];
  $('#summary').innerHTML=cards.map(([k,v,c])=>`<div class="stats-metric ${c}"><small>${k}</small><b>${v}</b></div>`).join('');
}

function showMessage(text='',error=false){
  const box=$('#message');
  box.innerHTML=text?`<div class="stats-message ${error?'error':''}">${esc(text)}</div>`:'';
}
async function getJson(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const p=await r.json();
  if(!p||!Array.isArray(p.records)||!p.summary)throw new Error('Invalid history payload');
  return p;
}

function pageTokens(current,count){
  if(count<=7)return Array.from({length:count},(_,i)=>i+1);
  const keep=new Set([1,count,current,current-1,current+1,current-2,current+2]);
  const list=[...keep].filter(v=>v>=1&&v<=count).sort((a,b)=>a-b);
  const out=[];
  for(let i=0;i<list.length;i++){
    if(i&&list[i]-list[i-1]>1)out.push('…');
    out.push(list[i]);
  }
  return out;
}
function renderPager(){
  const count=Math.max(1,Math.ceil(total/limit));
  if(page>count)page=count;
  const box=$('#pages');
  box.innerHTML=pageTokens(page,count).map(v=>v==='…'?'<span class="page-gap">…</span>':`<button type="button" class="page-btn ${v===page?'active':''}" data-page="${v}">${v}</button>`).join('');
  box.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=()=>{const next=Number(btn.dataset.page);if(next&&next!==page){page=next;loadPage();window.scrollTo({top:document.querySelector('.history-section').offsetTop-80,behavior:'smooth'});}});
  $('#prev').disabled=page<=1;
  $('#next').disabled=page>=count;
  const from=total?((page-1)*limit+1):0,to=Math.min(page*limit,total);
  $('#historyMeta').textContent=`${from}–${to} OF ${total}`;
}

async function loadPage(){
  if(pageBusy)return;
  pageBusy=true;
  try{
    showMessage();
    const data=await getJson(`${WORKER}/api/history?page=${page}&limit=${limit}&t=${Date.now()}`);
    total=data.total||0;
    renderSummary(data.summary);
    const rows=data.records||[];
    $('#rows').innerHTML=rows.map(mainRow).join('');
    if(!rows.length){
      $('#rows').innerHTML='<tr><td colspan="8"><div class="stats-message">No signal records yet. Confirmed signals will appear here automatically.</div></td></tr>';
    }
    renderPager();
  }catch(e){
    console.error(e);
    renderSummary({});
    $('#rows').innerHTML='<tr><td colspan="8"><div class="stats-message error">Statistics could not load from the history API.</div></td></tr>';
    $('#historyMeta').textContent='DATA ERROR';
    showMessage(`STATISTICS DATA ERROR · ${e.message}`,true);
  }finally{pageBusy=false;}
}

function rangeCutoff(days){
  if(!days)return null;
  return Date.now()-days*86400000;
}
async function fetchChartRecords(days){
  const cutoff=rangeCutoff(days);
  const first=await getJson(`${WORKER}/api/history?page=1&limit=100&t=${Date.now()}`);
  const records=[...(first.records||[])];
  const pages=Math.max(1,Math.ceil((first.total||0)/100));
  for(let p=2;p<=pages;p++){
    const oldest=records.at(-1);
    if(cutoff&&oldest&&Date.parse(oldest.selectedAt)<cutoff)break;
    const next=await getJson(`${WORKER}/api/history?page=${p}&limit=100&t=${Date.now()}-${p}`);
    records.push(...(next.records||[]));
    if(!(next.records||[]).length)break;
  }
  return records;
}

function compressSeries(records,maxPoints=260){
  const sorted=records
    .filter(r=>r.result&&r.result!=='PENDING')
    .slice()
    .sort((a,b)=>Date.parse(a.settledAt||a.selectedAt)-Date.parse(b.settledAt||b.selectedAt));
  if(!sorted.length)return{points:[],counts:{win:0,loss:0,draw:0},raw:0};
  const bucket=Math.max(1,Math.ceil(sorted.length/maxPoints));
  let win=0,loss=0,draw=0;
  const points=[{win:0,loss:0,draw:0,date:Date.parse(sorted[0].settledAt||sorted[0].selectedAt)}];
  for(let i=0;i<sorted.length;i++){
    const result=String(sorted[i].result).toUpperCase();
    if(result==='WIN')win++;
    else if(result==='LOSS')loss++;
    else if(result==='DRAW')draw++;
    const endOfBucket=(i+1)%bucket===0||i===sorted.length-1;
    if(endOfBucket)points.push({win,loss,draw,date:Date.parse(sorted[i].settledAt||sorted[i].selectedAt)});
  }
  return{points,counts:{win,loss,draw},raw:sorted.length};
}
function svgPath(points,key,x,y){
  return points.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(2)} ${y(p[key]).toFixed(2)}`).join(' ');
}
function chartDate(ms){
  const d=new Date(ms);
  return Number.isFinite(d.getTime())?d.toLocaleDateString([], {month:'short',year:'2-digit'}):'';
}
function renderCurve(records=[]){
  const cutoff=rangeCutoff(chartRangeDays);
  const scoped=cutoff?records.filter(r=>Date.parse(r.settledAt||r.selectedAt)>=cutoff):records;
  const {points,counts,raw}=compressSeries(scoped);
  if(!points.length){
    $('#curve').innerHTML='<div class="stats-message">No settled records in this range.</div>';
    $('#chartMeta').textContent='NO SETTLED DATA';
    return;
  }
  const w=1200,h=260,pL=46,pR=18,pT=18,pB=30;
  const max=Math.max(1,...points.flatMap(p=>[p.win,p.loss,p.draw]));
  const x=i=>pL+(w-pL-pR)*(i/Math.max(1,points.length-1));
  const y=v=>h-pB-(h-pT-pB)*(v/max);
  const grid=[0,.25,.5,.75,1].map(f=>{const yy=(pT+(h-pT-pB)*f).toFixed(1);return`<line x1="${pL}" y1="${yy}" x2="${w-pR}" y2="${yy}"/>`;}).join('');
  const labelIdx=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  const labels=labelIdx.map(i=>`<text x="${x(i).toFixed(1)}" y="${h-8}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(chartDate(points[i].date))}</text>`).join('');
  $('#curve').innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Cumulative win loss draw chart">
    <g class="curve-grid">${grid}</g>
    <path class="curve-series curve-win" d="${svgPath(points,'win',x,y)}"/>
    <path class="curve-series curve-loss" d="${svgPath(points,'loss',x,y)}"/>
    <path class="curve-series curve-draw" d="${svgPath(points,'draw',x,y)}"/>
    <g class="curve-labels">${labels}</g>
  </svg>`;
  const range=chartRangeDays?`${chartRangeDays===365?'1Y':chartRangeDays===730?'2Y':`${chartRangeDays}D`}`:'ALL';
  $('#chartMeta').textContent=`${range} · ${raw} SETTLED · ${counts.win} WIN · ${counts.loss} LOSS · ${counts.draw} DRAW · ${points.length-1} PLOTTED POINTS`;
}

async function loadChart(){
  if(chartBusy)return;
  chartBusy=true;
  $('#chartMeta').textContent='LOADING PERFORMANCE…';
  try{
    const records=await fetchChartRecords(chartRangeDays);
    renderCurve(records);
  }catch(e){
    console.error(e);
    $('#curve').innerHTML='<div class="stats-message error">Performance chart unavailable.</div>';
    $('#chartMeta').textContent='CHART DATA ERROR';
  }finally{chartBusy=false;}
}

$('#prev').onclick=()=>{if(page>1){page--;loadPage();}};
$('#next').onclick=()=>{if(page*limit<total){page++;loadPage();}};
$('#rangeButtons').querySelectorAll('[data-days]').forEach(btn=>btn.onclick=()=>{
  chartRangeDays=Number(btn.dataset.days)||0;
  $('#rangeButtons').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
  loadChart();
});

loadPage();
loadChart();
setInterval(loadPage,10000);
setInterval(loadChart,60000);
