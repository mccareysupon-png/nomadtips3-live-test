const API='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pair=p=>`${p?.home??'—'}–${p?.away??'—'}`;
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmtLine=v=>v==null?'—':`${v>0?'+':''}${Number(v).toFixed(2)}`;
const fmtOdds=v=>v==null?'—':Number(v).toFixed(2);
const when=s=>{try{return new Date(s).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return '—'}};
const pill=(ok,text)=>`<b class="${ok?'ok':'wait'}">${esc(text)}</b>`;
const priceLabel=status=>({
  'AH READY':'Price pass','AH LINE FAIL':'Line fail','AH ODDS FAIL':'Odds fail','AH STALE':'Price stale','AH INVALID':'Ah invalid',
  'ODDS NOT MATCHED':'Not matched','ODDS NOT READY':'Odds not ready','AH CHECKING':'Price checking','AH WAIT':'Price checking'
}[status]||'Price checking');
const bookmakerPriceLine=(market,label)=>market?.status==='AH READY'&&n(market.line)!=null&&n(market.homeOdds)!=null
  ?`${esc(label)} · Ah ${fmtLine(market.line)} · Odds ${fmtOdds(market.homeOdds)}`
  :`${esc(label)} · ${esc(priceLabel(market?.status||'ODDS NOT READY'))}`;

function setSource(text,ok=true){
  const el=document.querySelector('.source-pill'); if(!el)return;
  el.innerHTML=`<span class="dot" style="${ok?'':'background:#f2d21b;box-shadow:none'}"></span>${esc(text)}`;
}
function renderChecks(checks={},evidence={}){
  const labels={homeOnly:'HOME only',minute:'Minute window',score:'Score filter',hunger:'HOME hunger trend',evidence:evidence.required===false?'New HOME event (optional)':'New HOME event',market:'Full Match Live AH'};
  return Object.entries(checks).map(([k,v])=>`<div class="check"><span>${esc(labels[k]||k)}</span>${pill(Boolean(v),v?'PASS':'WAIT')}</div>`).join('');
}
function detail(m){
  const s=m.stats||{};
  const rolling=m.rolling||{},recent=rolling.recent||{},previous=rolling.previous||{},eventDelta=recent.delta||{};
  const price=m.marketCheck||{};
  const market=m.market||{};
  const comparison=m.marketComparison||{};
  const oneXBet=comparison.oneXBet||market;
  const bet365=comparison.bet365||{};
  const line=price.line??market.line;
  const odds=price.homeOdds??market.homeOdds;
  return `<div class="match-detail">
    <section class="detail-card"><h3>HOME ROLLING DELTA · ${rolling.windowMinutes??'—'} MIN</h3><div class="evidence">
      <div><span>ATTACK</span><b>${pair(s.attacks)}</b></div><div><span>DANGER</span><b>${pair(s.dangerousAttack)}</b></div>
      <div><span>SHOT OFF</span><b>${pair(s.shotsOff)}</b></div><div><span>SHOT ON</span><b>${pair(s.shotsOn)}</b></div>
      <div><span>CORNERS</span><b>${pair(s.corners)}</b></div><div><span>POSSESSION</span><b>${pair(s.possession)}</b></div>
      <div><span>Δ SOT / OFF / COR</span><b>${eventDelta.shotsOn?.home??'—'} / ${eventDelta.shotsOff?.home??'—'} / ${eventDelta.corners?.home??'—'}</b></div><div><span>HUNGER</span><b>${m.hunger?.passedCount??0} / ${m.hunger?.total??3}</b></div>
    </div></section>
    <section class="detail-card"><h3>PRESSURE TREND</h3><div class="check"><span>HOME pressure · recent / previous</span><b>${recent.homePressure??'—'} / ${previous.homePressure??'—'}</b></div><div class="check"><span>HOME pressure share</span><b>${rolling.available?`${Number(rolling.homePressureShare).toFixed(1)}%`:'—'}</b></div><div class="check"><span>Match tempo · recent / previous</span><b>${recent.tempo??'—'} / ${previous.tempo??'—'}</b></div></section>
    <section class="detail-card"><h3>DETECTOR CHECK</h3>${renderChecks(m.checks,m.evidence)}</section>
    <section class="detail-card"><h3>PRICE CHECK</h3><div class="check"><span>Primary status</span><b class="${price.passed?'ok':'wait'}">${esc(priceLabel(m.priceStatus))}</b></div><div class="check"><span>1xBet Ah / odds</span><b>${fmtLine(oneXBet.line)} / ${fmtOdds(oneXBet.homeOdds)}</b></div><div class="check"><span>Bet365 Ah / odds</span><b>${fmtLine(bet365.line)} / ${fmtOdds(bet365.homeOdds)}</b></div><div class="check"><span>1xBet status</span><b class="${oneXBet.status==='AH READY'?'ok':'wait'}">${esc(priceLabel(oneXBet.status))}</b></div><div class="check"><span>Bet365 status</span><b class="${bet365.status==='AH READY'?'ok':'wait'}">${esc(priceLabel(bet365.status))}</b></div><div class="check"><span>Source</span><b>Odds-API.io · 1xBet + Bet365</b></div><div class="check"><span>1xBet updated</span><b>${oneXBet.sourceUpdatedAt?when(oneXBet.sourceUpdatedAt):'—'}</b></div><div class="check"><span>Bet365 updated</span><b>${bet365.sourceUpdatedAt?when(bet365.sourceUpdatedAt):'—'}</b></div><div class="check"><span>Primary price age</span><b>${price.ageSeconds!=null?`${Number(price.ageSeconds).toFixed(0)} sec`:'—'}</b></div><div class="check"><span>Signal line / odds</span><b>${fmtLine(line)} / ${fmtOdds(odds)}</b></div></section>
  </div>`;
}
function matchRow(m){
  const state=m.state||'WATCHING';
  const st=state==='SIGNAL'?'signal':state==='NEAR SIGNAL'?'near':'';
  const market=m.market||{};
  const comparison=m.marketComparison||{};
  const oneXBet=comparison.oneXBet||market;
  const bet365=comparison.bet365||{};
  const side='HOME';
  const priceStatus=m.priceStatus||'AH CHECKING';
  const matchId=String(m.id??`${m.home}|${m.away}|${m.league}`);
  const currentPrice=`${bookmakerPriceLine(oneXBet,'1xBet')}<br>${bookmakerPriceLine(bet365,'Bet365')}`;
  return `<details class="match-wrap ${st}" data-match-id="${esc(matchId)}" data-state="${esc(state)}" data-search="${esc(`${m.home} ${m.away} ${m.league}`.toLowerCase())}">
    <summary class="match-row"><div class="statebox"><span class="state ${st}">● ${esc(state)}</span><span class="minute">${m.minute??'—'}′</span></div>
    <div class="match-main"><span class="league">${esc(m.league||'—')}</span><span class="teams">${esc(m.home||'Home')} — ${esc(m.away||'Away')}</span></div>
    <div class="score">${pair(m.score)}</div>
    <div class="quick"><div class="q"><span>Δ HOME PRESS</span><b>${m.rolling?.recent?.homePressure??'—'}</b></div><div class="q"><span>Δ SOT</span><b>+${m.rolling?.recent?.delta?.shotsOn?.home??0}</b></div><div class="q"><span>HUNGER</span><b>${m.hunger?.passedCount??0}/3</b></div><div class="q"><span>SIDE</span><b>${side}</b></div></div>
    <div class="market"><strong>${currentPrice}</strong><span class="${m.marketCheck?.passed?'ok':'wait'}">${esc(priceLabel(priceStatus))} · Primary 1xBet</span></div>
    <div class="cond"><span>CONDITIONS</span><strong class="${m.passed===m.total?'pass':m.detectionPassed?'warn':''}">${m.passed??0} / ${m.total??6}</strong></div></summary>${detail(m)}</details>`;
}
function setupFilters(){
  const tabs=[...document.querySelectorAll('.tabs .tab')], search=document.querySelector('.search input');
  if(search){search.disabled=false;search.placeholder='team / league';}
  const apply=()=>{
    const active=tabs.find(x=>x.dataset.active==='1')?.textContent?.trim().toUpperCase()||'ALL';
    const q=(search?.value||'').trim().toLowerCase();
    document.querySelectorAll('.match-wrap').forEach(row=>{
      const state=row.dataset.state||''; const stateOk=active==='ALL'||(active==='NEAR'?state==='NEAR SIGNAL':state===active);
      row.style.display=stateOk&&(!q||row.dataset.search.includes(q))?'':'none';
    });
  };
  tabs.forEach((b,i)=>b.addEventListener('click',()=>{tabs.forEach(x=>x.dataset.active='0');b.dataset.active='1';apply();}));
  if(tabs[0])tabs[0].dataset.active='1'; if(search)search.addEventListener('input',apply);
}
async function get(path){const r=await fetch(API+path,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}

async function livePage(){
  const list=document.querySelector('.match-list'); if(!list)return;
  const metric=[...document.querySelectorAll('.status-grid .metric strong')]; metric.forEach(x=>x.textContent='—');
  list.innerHTML='<div class="note">Connecting live engine…</div>'; setSource('LIVE DATA · CONNECTING',false);
  const mode=document.querySelector('.mode strong'); if(mode)mode.textContent='LIVE';
  setupFilters();
  const load=async()=>{
    try{
      const d=await get('/feed');
      if(metric[0])metric[0].textContent=d.counts?.live??0;if(metric[1])metric[1].textContent=d.counts?.watching??0;if(metric[2])metric[2].textContent=d.counts?.near??0;if(metric[3])metric[3].textContent=d.counts?.signal??0;
      const openMatchIds=new Set([...list.querySelectorAll('.match-wrap[open]')].map(row=>row.dataset.matchId).filter(Boolean));
      list.innerHTML=(d.matches||[]).length?(d.matches||[]).map(matchRow).join(''):'<div class="note">Engine online · no monitored matches currently meet the watch window.</div>';
      list.querySelectorAll('.match-wrap').forEach(row=>{if(openMatchIds.has(row.dataset.matchId))row.open=true;});
      const muted=document.querySelector('.panel-head .muted');if(muted)muted.textContent=`cycle ${d.cycle??0} · ${d.updatedAt?when(d.updatedAt):'waiting first cycle'}`;
      const note=document.querySelector('main > .note');if(note)note.textContent=d.lastError?`Engine source error: ${d.lastError}`:`Live engine connected · last update ${d.updatedAt?when(d.updatedAt):'pending'}.`;
      setSource(d.lastError?'LIVE DATA · SOURCE WAIT':'LIVE DATA · LIVE',!d.lastError);
    }catch(e){setSource('LIVE DATA · ENGINE OFFLINE',false);const note=document.querySelector('main > .note');if(note)note.textContent=`Engine connection unavailable: ${e.message}`;}
  };
  await load(); setInterval(load,10000);
}
function clsResult(r=''){return /WIN/.test(r)?'win':/LOSS/.test(r)?'loss':''}
async function statsPage(){
  const metrics=[...document.querySelectorAll('.summary-grid .metric strong')], tbody=document.querySelector('.data-table tbody');
  metrics.forEach(x=>x.textContent='—');if(tbody)tbody.innerHTML='<tr><td colspan="9">Connecting statistics engine…</td></tr>';setSource('RESULT LEDGER · CONNECTING',false);
  const load=async()=>{try{
    const d=await get('/statistics');
    if(metrics[0])metrics[0].textContent=d.totalSignals??0;if(metrics[1])metrics[1].textContent=`${Number(d.winRate||0).toFixed(1)}%`;if(metrics[2])metrics[2].textContent=d.avgOdds?Number(d.avgOdds).toFixed(2):'—';if(metrics[3])metrics[3].textContent=`${Number(d.roi||0)>=0?'+':''}${Number(d.roi||0).toFixed(1)}%`;
    if(tbody)tbody.innerHTML=(d.records||[]).length?d.records.map(r=>{const fin=r.settlement?.finalScore;const res=r.settlement?.result||'PENDING';const c=clsResult(res);return `<tr><td>${r.lockedAt?when(r.lockedAt):'—'}</td><td>${esc(r.home)} — ${esc(r.away)}</td><td>${esc((r.selection||'').toUpperCase())}</td><td>${fmtLine(r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${pair(r.entryScore)}</td><td>${fin?pair(fin):'—'}</td><td class="${c}">${esc(res)}</td><td class="${c}">${r.settlement?`${r.settlement.profit>=0?'+':''}${Number(r.settlement.profit).toFixed(2)}u`:'—'}</td></tr>`}).join(''):'<tr><td colspan="9">No locked signals yet.</td></tr>';
    const muted=document.querySelector('.panel-head .muted');if(muted)muted.textContent=`WIN ${d.wins||0} · LOSS ${d.losses||0} · PUSH ${d.pushes||0}`;
    const note=document.querySelector('main > .note');if(note)note.textContent=`Statistics connected · ${d.settled||0} settled records.`;setSource('RESULT LEDGER · LIVE',true);
  }catch(e){setSource('RESULT LEDGER · OFFLINE',false);}};await load();setInterval(load,15000);
}
async function healthPage(){
  const grid=document.querySelector('.health-grid');if(!grid)return;grid.innerHTML='<div class="note">Connecting engine health…</div>';setSource('SYSTEM HEALTH · CONNECTING',false);
  const load=async()=>{try{const d=await get('/health');const c=d.counts||{},s=d.source||{},o=s.oddsApi||{},rb=o.readyByBookmaker||{};grid.innerHTML=`
    <article class="health-item"><header><b>Primary feed</b><span class="${s.today?'win':'loss'}">● ${s.today?'READY':'WAIT'}</span></header><div class="rows"><div><span>Matches</span><strong>${c.matches||0}</strong></div><div><span>Last cycle</span><strong>${d.lastCycle?when(d.lastCycle):'—'}</strong></div><div><span>Cycle</span><strong>${d.cycle||0}</strong></div><div><span>Source</span><strong>TotalCorner · ${s.today?'FRESH':'WAIT'}</strong></div></div></article>
    <article class="health-item"><header><b>Live statistics</b><span class="${c.liveStats?'win':''}">● ${c.liveStats?'READY':'WAIT'}</span></header><div class="rows"><div><span>Watching</span><strong>${c.watching||0}</strong></div><div><span>Near signal</span><strong>${c.near||0}</strong></div><div><span>Stats available</span><strong>${c.liveStats||0}</strong></div><div><span>Freshness</span><strong>${d.config?.freshnessSec||'—'} sec</strong></div></div></article>
    <article class="health-item"><header><b>Market feed</b><span class="${o.status==='READY'?'win':o.status==='ERROR'||o.status==='KEY_MISSING'?'loss':''}">● ${esc(o.status||'IDLE')}</span></header><div class="rows"><div><span>Source</span><strong>Odds-API.io</strong></div><div><span>Bookmaker</span><strong>1xBet + Bet365</strong></div><div><span>Checked / mapped</span><strong>${o.checked??o.eligible??0} / ${o.mapped||0}</strong></div><div><span>AH ready · 1x / 365</span><strong>${rb['1xBet']??o.ready??c.market??0} / ${rb['Bet365']??0}</strong></div></div></article>
    <article class="health-item"><header><b>Detector</b><span class="${d.ok?'win':'loss'}">● ${d.ok?'READY':'ERROR'}</span></header><div class="rows"><div><span>Minute window</span><strong>${esc(d.config?.minute||'—')}</strong></div><div><span>Poll</span><strong>${d.config?.pollSec||'—'} sec</strong></div><div><span>Ended feed</span><strong>${s.ended?'READY':'WAIT'}</strong></div><div><span>Error</span><strong>${esc(d.lastError||'none')}</strong></div></div></article>`;
    const mode=document.querySelector('.mode strong');if(mode){mode.textContent=d.ok?'READY':'WAIT';mode.className=d.ok?'win':'warn';}setSource(d.ok?'SYSTEM HEALTH · LIVE':'SYSTEM HEALTH · SOURCE WAIT',d.ok);
  }catch(e){setSource('SYSTEM HEALTH · OFFLINE',false);}};await load();setInterval(load,10000);
}

const path=location.pathname.toLowerCase();
if(path.endsWith('/nomad-live/')||path.endsWith('/nomad-live/index.html')) livePage();
else if(path.endsWith('/nomad-live/statistics.html')) statsPage();
else if(path.endsWith('/nomad-live/health.html')) healthPage();
