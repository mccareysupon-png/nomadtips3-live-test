const $=id=>document.getElementById(id);
const DEFAULT_WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
let runtime={liveUrl:`${DEFAULT_WORKER}/live`,healthUrl:`${DEFAULT_WORKER}/health`,refreshSeconds:15};
let historyPage=1,historyPages=1,historyRange='ALL',trend=[],historyRefreshing=false;

const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const workerBase=()=>String(runtime.workerUrl||runtime.liveUrl||DEFAULT_WORKER).replace(/\/live(?:\?.*)?$/,'');

async function json(url,timeout=15000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timer);}
}

async function loadRuntime(){
  try{runtime={...runtime,...await json(`./runtime.json?t=${Date.now()}`,5000)};}catch{}
}

function setFeed(ok,text){
  const state=document.querySelector('.feed-state');
  if(state)state.classList.toggle('offline',!ok);
  if($('feedState'))$('feedState').textContent=text;
}

function normalizeResult(value){
  return String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'_');
}

function exactResult(record){
  const exact=normalizeResult(record?.settlementResult??record?.resultDetail);
  if(['FULL_WIN','HALF_WIN','PUSH','HALF_LOSS','FULL_LOSS','VOID','PENDING'].includes(exact))return exact;

  const grouped=normalizeResult(record?.resultGroup??record?.result);
  if(['WIN','CORRECT'].includes(grouped))return'WIN';
  if(['LOSS','INCORRECT'].includes(grouped))return'LOSS';
  if(['DRAW','PUSH'].includes(grouped))return grouped==='PUSH'?'PUSH':'DRAW';
  if(['VOID','PENDING'].includes(grouped))return grouped;
  return'—';
}

function resultGroupName(record){
  const value=exactResult(record);
  if(['FULL_WIN','HALF_WIN','WIN'].includes(value))return'WIN';
  if(['FULL_LOSS','HALF_LOSS','LOSS'].includes(value))return'LOSS';
  if(['PUSH','DRAW'].includes(value))return'DRAW';
  return value;
}

function resultLabel(record){
  const value=exactResult(record);
  return value==='—'?'—':value.replaceAll('_',' ');
}

function lockedNetUnits(record){
  const stored=record?.settlementNetUnits;
  if(stored!==null&&stored!==undefined&&stored!==''&&Number.isFinite(Number(stored)))return Number(stored);

  const exact=exactResult(record);
  const odds=Number(record?.odds);
  if(!Number.isFinite(odds)||odds<=0)return null;
  if(exact==='FULL_WIN')return odds-1;
  if(exact==='HALF_WIN')return(odds-1)/2;
  if(exact==='PUSH')return 0;
  if(exact==='HALF_LOSS')return-.5;
  if(exact==='FULL_LOSS')return-1;
  return null;
}

function fmtSettlement(record){
  const label=resultLabel(record),units=lockedNetUnits(record);
  if(units===null)return label;
  const rounded=Math.abs(units)<.0005?0:units;
  return`${label} · ${rounded>0?'+':''}${rounded.toFixed(2)}u`;
}

function fmtDateTime(record){
  const value=record?.selectedAt;
  if(value){
    const date=new Date(value);
    if(Number.isFinite(date.getTime()))return date.toLocaleString([],{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  return record?.selectionDate||'—';
}

function fmtScore(score){
  const home=Number(score?.home),away=Number(score?.away);
  return Number.isFinite(home)&&Number.isFinite(away)?`${home}–${away}`:'—';
}

function fmtMarket(record){
  const market=String(record?.market||'—').toUpperCase();
  return market==='OU'?'O/U':market;
}

function fmtPick(record){
  if(String(record?.market||'').toUpperCase()==='OU')return String(record?.ouDirection||'—').toUpperCase();
  return record?.selectedTeam||record?.selectedSide||'—';
}

function fmtLine(record){
  const market=String(record?.market||'').toUpperCase();
  if(market==='WIN')return'—';
  const value=record?.selectedLine??record?.settlementLine??record?.line;
  if(!Number.isFinite(Number(value)))return'—';
  const n=Number(value);
  if(market==='AH')return`${n>0?'+':''}${Number.isInteger(n)?n.toFixed(1):String(n)}`;
  return String(n);
}

function fmtOdds(record){
  const odds=Number(record?.odds);
  return Number.isFinite(odds)?odds.toFixed(2):'—';
}

function fmtBookmaker(record){
  const value=record?.bookmaker??record?.bookmakerName??record?.oddsBookmaker;
  const label=String(value??'').trim();
  if(label)return label;
  const companyId=Number(record?.bookmakerCompanyId);
  if(companyId===8)return'Bet365';
  if(companyId===50)return'1xBet';
  return'—';
}

function fmtLockedOdds(record){
  return`${fmtOdds(record)} · ${fmtBookmaker(record)}`;
}

function fmtMomentum(record){
  const value=Number(record?.momentum);
  return Number.isFinite(value)?`${Math.round(value)}%`:'—';
}

function drawHistory(){
  const svg=$('historyChart');
  if(!svg)return;
  const data=trend.length?trend:[{index:0,date:'',win:0,loss:0,draw:0}],w=800,h=240,left=34,right=16,top=18,bottom=27;
  const max=Math.max(1,...data.flatMap(row=>[num(row.win),num(row.loss),num(row.draw)]));
  const innerW=w-left-right,innerH=h-top-bottom;
  const x=i=>left+(data.length<=1?innerW/2:i*innerW/(data.length-1));
  const y=value=>top+innerH-num(value)*innerH/max;
  const path=key=>data.map((row,i)=>`${i?'L':'M'} ${x(i).toFixed(2)} ${y(row[key]).toFixed(2)}`).join(' ');
  let grid='';
  for(let i=0;i<=4;i++){
    const yy=top+i*innerH/4;
    grid+=`<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="rgba(255,255,255,.055)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  const first=data[0]?.date||'',last=data[data.length-1]?.date||'';
  svg.innerHTML=`${grid}
    <path d="${path('win')}" fill="none" stroke="#33d17a" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <path d="${path('loss')}" fill="none" stroke="#ff5c5c" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <path d="${path('draw')}" fill="none" stroke="#8b929b" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <line id="historyHoverLine" x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.24)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>
    <text x="${left}" y="${h-7}" fill="#757c84" font-size="10">${esc(first)}</text>
    <text x="${w-right}" y="${h-7}" text-anchor="end" fill="#757c84" font-size="10">${esc(last)}</text>`;

  const tooltip=$('historyTooltip'),hoverLine=$('historyHoverLine'),wrap=svg.closest('.history-graph-wrap');
  const showPoint=event=>{
    if(!tooltip||!hoverLine||!wrap||!trend.length)return;
    const rect=svg.getBoundingClientRect(),wrapRect=wrap.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
    const index=Math.max(0,Math.min(trend.length-1,Math.round(ratio*(trend.length-1))));
    const row=trend[index],xx=x(index);
    hoverLine.setAttribute('x1',xx);hoverLine.setAttribute('x2',xx);hoverLine.setAttribute('visibility','visible');
    tooltip.textContent=`${row.date||'—'} · W ${num(row.win)} · L ${num(row.loss)} · D ${num(row.draw)}`;
    tooltip.style.display='block';
    tooltip.style.left=`${Math.max(42,Math.min(wrapRect.width-42,event.clientX-wrapRect.left))}px`;
    tooltip.style.top=`${Math.max(30,event.clientY-wrapRect.top)}px`;
  };
  svg.onpointermove=showPoint;
  svg.onpointerdown=showPoint;
  svg.onpointerleave=()=>{if(tooltip)tooltip.style.display='none';if(hoverLine)hoverLine.setAttribute('visibility','hidden');};
}

function renderHistory(data){
  const summary=data.summary||{};
  const win=num(summary.win??summary.correct),loss=num(summary.loss??summary.incorrect),draw=num(summary.draw??summary.push),avg=num(summary.averageOdds);
  const rate=Number.isFinite(Number(summary.winRate))?num(summary.winRate):(win+loss?win/(win+loss)*100:0);
  $('statWin').textContent=win;
  $('statLoss').textContent=loss;
  $('statDraw').textContent=draw;
  $('statRate').textContent=`${rate.toFixed(2)}%`;
  $('statOdds').textContent=avg.toFixed(2);
  trend=Array.isArray(summary.trend)?summary.trend:[];

  const records=Array.isArray(data.records)?data.records:[];
  $('historyBody').innerHTML=records.length?records.map(record=>{
    const group=resultGroupName(record),cls=group==='WIN'||group==='LOSS'||group==='DRAW'?`result-${group.toLowerCase()}`:'';
    return`<tr>
      <td>${esc(fmtDateTime(record))}</td>
      <td class="league-cell" title="${esc(record.league||'—')}">${esc(record.league||'—')}</td>
      <td class="match-cell">${esc(record.home||'—')} vs ${esc(record.away||'—')}</td>
      <td>${esc(record.entryMinute??'—')}${record.entryMinute!==null&&record.entryMinute!==undefined?"'":''}</td>
      <td><span class="score-pill">${esc(fmtScore(record.entryScore))}</span></td>
      <td>${esc(fmtMarket(record))}</td>
      <td>${esc(fmtPick(record))}</td>
      <td class="line-cell">${esc(fmtLine(record))}</td>
      <td class="odds-cell">${esc(fmtLockedOdds(record))}</td>
      <td>${esc(fmtMomentum(record))}</td>
      <td><span class="score-pill">${esc(fmtScore(record.finalScore))}</span></td>
      <td class="${cls}" title="Settlement uses the locked market, line and odds stored on this signal.">${esc(fmtSettlement(record))}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="12">No records are available in this range.</td></tr>';

  historyPage=num(data.page,historyPage);historyPages=Math.max(1,num(data.pages,1));
  $('pageInfo').textContent=`Page ${historyPage} / ${historyPages} · 25 rows/page`;
  $('prevPage').disabled=historyPage<=1;
  $('nextPage').disabled=historyPage>=historyPages;
  if($('historyMeta')){
    const storage=data.historyStorage==='SQLITE_HISTORY_ARCHIVE_V1'?'Long-term SQLite archive':'Working history';
    $('historyMeta').textContent=`${historyRange} · ${num(data.total)} records · ${storage}`;
  }
  requestAnimationFrame(drawHistory);
  setFeed(true,'Online');
}

async function refreshHistory(){
  if(historyRefreshing)return;
  historyRefreshing=true;
  try{
    const url=`${workerBase()}/history?page=${historyPage}&limit=25&range=${encodeURIComponent(historyRange)}&t=${Date.now()}`;
    const data=await json(url);
    if(data.ok===false)throw new Error(data.error||'History unavailable');
    renderHistory(data);
  }catch(error){
    setFeed(false,'Reconnecting');
    $('historyBody').innerHTML='<tr><td colspan="12">Statistics are temporarily unavailable. Automatic retry is active.</td></tr>';
    console.warn('Statistics refresh failed',error);
  }finally{historyRefreshing=false;}
}

async function init(){
  await loadRuntime();
  $('prevPage').onclick=()=>{if(historyPage>1){historyPage--;refreshHistory();}};
  $('nextPage').onclick=()=>{if(historyPage<historyPages){historyPage++;refreshHistory();}};
  document.querySelectorAll('#historyRanges [data-range]').forEach(button=>button.addEventListener('click',()=>{
    historyRange=button.dataset.range||'ALL';historyPage=1;
    document.querySelectorAll('#historyRanges [data-range]').forEach(item=>item.classList.toggle('active',item===button));
    refreshHistory();
  }));
  await refreshHistory();
  setInterval(refreshHistory,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHistory();});
  window.addEventListener('online',refreshHistory);
}

init();