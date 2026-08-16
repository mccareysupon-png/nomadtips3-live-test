const WORKER='https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev';
const LIMIT=25;
let page=1,pages=1,loading=false,lastTrend=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const dt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('th-TH',{hour12:false});};
const signed=v=>v===null||v===undefined||v===''?'—':`${Number(v)>=0?'+':''}${v}`;
const exactLabel=v=>String(v||'PENDING').replaceAll('_',' ');

async function getJson(path,timeout=15000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(`${WORKER}${path}${path.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(data?.ok===false)throw new Error(data.error||'Service returned an error');
    return data;
  }finally{clearTimeout(timer);}
}

function setStatus(text,state='warn'){
  const el=$('historyHealth'); if(!el)return;
  el.textContent=text; el.classList.remove('good','warn','red'); el.classList.add(state);
}

function renderHealth(h){
  const last=h?.lastSuccess||h?.lastCycle||null;
  const age=last?Math.max(0,Math.round((Date.now()-Date.parse(last))/1000)):null;
  const healthy=h?.ok===true&&last&&age<240&&!h?.lastError;
  setStatus(healthy?'ONLINE':h?.ok===true?'CHECKING':'OFFLINE',healthy?'good':'warn');
  $('wheelMode').textContent='CONTINUOUS';
  $('lastCycle').textContent=last?dt(last):'—';
  $('cycleAge').textContent=age===null?'—':`${age}s ago`;
  $('cycleError').textContent=h?.lastError?'CHECKING':'ACTIVE';
  $('feedState').textContent=`LIVE ${num(h?.liveMatches)} · READY ${num(h?.coreStatsReady)}`;
  $('settlementState').textContent='VERIFIED';
}

function normalizeSummary(data){
  const s=data?.summary||{};
  const win=num(s.win??s.correct),loss=num(s.loss??s.incorrect),draw=num(s.draw??s.push),pending=num(s.pending),voids=num(s.void),total=num(s.total??data?.total);
  const averageOdds=num(s.averageOdds),winRate=Number.isFinite(Number(s.winRate))?Number(s.winRate):(win+loss?win/(win+loss)*100:0),netUnits=num(s.netUnits);
  return{total,pending,win,loss,draw,voids,averageOdds,winRate,netUnits,trend:Array.isArray(s.trend)?s.trend:[]};
}

function renderSummary(data){
  const s=normalizeSummary(data); lastTrend=s.trend;
  const values=[['TOTAL',s.total],['PENDING',s.pending],['WIN',s.win],['LOSS',s.loss],['DRAW',s.draw],['VOID',s.voids],['AVG ODDS',s.averageOdds.toFixed(2)],['WIN RATE',`${s.winRate.toFixed(2)}%`],['NET UNITS',signed(s.netUnits)]];
  $('historySummary').innerHTML=values.map(([k,v])=>`<article class="metric"><small>${k}</small><b>${esc(v)}</b></article>`).join('');
}

function resultClass(v){
  let x=String(v||'PENDING').toUpperCase();
  if(x==='CORRECT')x='WIN'; if(x==='INCORRECT')x='LOSS'; if(x==='PUSH')x='DRAW';
  return ['WIN','LOSS','DRAW','PENDING','VOID'].includes(x)?x.toLowerCase():'pending';
}

function drawChart(){
  const canvas=$('resultChart');if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(320,Math.round(rect.width||320)),h=260;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.height=`${h}px`;
  const c=canvas.getContext('2d');if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const pad={l:38,r:16,t:18,b:30},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,data=lastTrend.length?lastTrend:[{index:0,win:0,loss:0,draw:0}],max=Math.max(1,...data.flatMap(x=>[num(x.win),num(x.loss),num(x.draw)]));
  c.font='10px system-ui';c.fillStyle='#929aa2';c.strokeStyle='#30363d';c.lineWidth=1;
  for(let i=0;i<=4;i++){const y=pad.t+ph*i/4,val=Math.round(max*(1-i/4));c.beginPath();c.moveTo(pad.l,y);c.lineTo(w-pad.r,y);c.stroke();c.fillText(String(val),5,y+3);}
  const xAt=i=>pad.l+(data.length<=1?0:i/(data.length-1)*pw),yAt=v=>pad.t+ph-num(v)/max*ph;
  for(const [key,color] of [['win','#39d06f'],['loss','#ef5b63'],['draw','#929aa2']]){c.beginPath();data.forEach((p,i)=>{const x=xAt(i),y=yAt(p[key]);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=color;c.lineWidth=2.5;c.stroke();}
  c.fillStyle='#929aa2';c.fillText('1',pad.l,h-8);c.fillText(String(data.length),Math.max(pad.l,w-pad.r-20),h-8);
}

function renderHistory(data){
  renderSummary(data);
  page=Math.max(1,num(data.page,page));pages=Math.max(1,num(data.pages,1));
  $('historyUpdated').textContent=`Updated ${dt(data.generatedAt)} · ${num(data.total)} records`;
  const rows=Array.isArray(data.records)?data.records:[];
  $('historyBody').innerHTML=rows.length?rows.map((r,i)=>{
    let group=String(r.resultGroup||r.result||'PENDING').toUpperCase();
    if(group==='CORRECT')group='WIN';if(group==='INCORRECT')group='LOSS';if(group==='PUSH')group='DRAW';
    const line=r.selectedLine??r.settlementLine??r.line;
    const exact=r.settlementResult||group;
    const net=r.settlementNetUnits;
    return `<tr><td>${num(data.offset)+i+1}</td><td><b>${esc(r.selectionDate)}</b><br>${dt(r.selectedAt)}</td><td><b>${esc(r.league)}</b><br>${esc(r.home)} vs ${esc(r.away)}</td><td><b class="history-selected-team">${esc(r.selectedTeam||'—')}</b><br>${esc(r.selectedSide)}</td><td>${esc(r.entryMinute)}′<br>${esc(r.entryScore?.home)}-${esc(r.entryScore?.away)}</td><td><b>${esc(r.market)}</b><br>Line ${esc(signed(line))}<br>Odds ${esc(r.odds)}</td><td>${esc(r.momentum)}%<br>DA ${signed(r.evidence?.dangerous??0)} · Shots ${signed(r.evidence?.shots??0)}<br>SOT ${signed(r.evidence?.sot??0)} · C ${signed(r.evidence?.corners??0)}</td><td>${dt(r.kickoffUtc)}</td><td>${esc(r.ftStatus||r.status)}<br>${dt(r.settledAt)}</td><td>${r.finalScore?`${esc(r.finalScore.home)}-${esc(r.finalScore.away)}`:'—'}</td><td><span class="result ${resultClass(group)}">${esc(group)}</span><small class="settlement-detail">${esc(exactLabel(exact))}</small></td><td>${net===null||net===undefined?'—':signed(Number(net).toFixed(3))}</td></tr>`;
  }).join(''):'<tr><td colspan="12" class="empty-row">No confirmed signals have been recorded yet.</td></tr>';
  $('pageInfo').textContent=`Page ${page} / ${pages} · ${LIMIT} rows/page`;
  $('prevPage').disabled=loading||page<=1;$('nextPage').disabled=loading||page>=pages;
  requestAnimationFrame(drawChart);
}

function showError(error){
  setStatus('RETRYING','red');
  $('historyUpdated').textContent='Live data connection issue — automatic retry active';
  $('historyBody').innerHTML=`<tr><td colspan="12" class="empty-row">Statistics are temporarily unavailable. Automatic retry is active. ${esc(error?.message||'')}</td></tr>`;
}

async function load(){
  if(loading)return;loading=true;$('refreshStats').disabled=true;
  try{
    const [health,history]=await Promise.all([getJson('/health'),getJson(`/history?page=${page}&limit=${LIMIT}`)]);
    renderHealth(health);renderHistory(history);
  }catch(error){showError(error);}
  finally{loading=false;$('refreshStats').disabled=false;$('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages;}
}

$('prevPage').onclick=()=>{if(!loading&&page>1){page--;load();}};
$('nextPage').onclick=()=>{if(!loading&&page<pages){page++;load();}};
$('refreshStats').onclick=()=>load();
window.addEventListener('resize',()=>requestAnimationFrame(drawChart),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
load();setInterval(load,30000);
