let runtime=null,liveRows=[],historyRecords=[];
let lastAutoFocusedSignalKey=null;
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function confirmedRecord(row){
  return historyRecords.find(r=>String(r.id)===String(row?.sourceMatchId));
}

function signalKey(record,row){
  return String(record?.id??row?.sourceMatchId??row?.id??'');
}

function ensureSignalClock(){
  let clock=$('#signalClockRow');
  if(clock){
    // Remove the old non-real-time LIVE TIME segment if stale HTML is cached.
    const spans=clock.querySelectorAll(':scope > span');
    clock.querySelector(':scope > i')?.remove();
    if(spans[1])spans[1].remove();
    const label=spans[0]?.querySelector('small');
    if(label)label.textContent='SIGNAL';
    return clock;
  }
  const score=$('.score');
  if(!score)return null;
  clock=document.createElement('div');
  clock.id='signalClockRow';
  clock.className='signal-clock-row';
  clock.hidden=false;
  clock.innerHTML='<span><small>SIGNAL</small><b id="signalMinute">—</b></span>';
  score.appendChild(clock);
  return clock;
}

function ensureConfirmedBanner(){
  let banner=$('#confirmedSignalBanner');
  if(banner)return banner;
  const score=$('.score');
  if(!score)return null;
  banner=document.createElement('div');
  banner.id='confirmedSignalBanner';
  banner.className='confirmed-signal-banner';
  banner.hidden=true;
  banner.innerHTML='<span aria-hidden="true">⚡</span> CONFIRMED LIVE SIGNAL';
  score.prepend(banner);
  return banner;
}

function sourceStatus(row){
  const status=String(row?.status||row?.goalooClock?.status||'LIVE').toUpperCase();
  if(status.includes('FINISH')||status==='FT')return'FT';
  if(status.includes('HALF')||status==='HT')return'HT';
  return status==='LIVE'?'LIVE':status||'LIVE';
}

function sourceMinuteValue(row){
  const minute=Number(row?.minute);
  return Number.isFinite(minute)?Math.max(0,Math.floor(minute)):null;
}

function sourceMinuteText(row){
  const status=sourceStatus(row);
  if(status==='FT'||status==='HT')return status;
  const minute=sourceMinuteValue(row);
  return minute===null?status:`${minute}'`;
}

function sourceClockText(row){
  const status=sourceStatus(row);
  if(status==='FT'||status==='HT')return status;
  const minute=sourceMinuteValue(row);
  if(minute===null)return status;
  return status==='LIVE'?`${minute}'`:`${status} · ${minute}'`;
}

function updateCandidateMinutes(cards){
  cards.forEach(card=>{
    const index=Number(card.dataset.index||0),row=liveRows[index],minuteEl=card.querySelector('.candidate-minute');
    if(!row||!minuteEl)return;
    const next=sourceClockText(row);
    if(minuteEl.textContent!==next)minuteEl.textContent=next;
    if(minuteEl.hidden)minuteEl.hidden=false;
  });
}

function updateSignalClock(row,record){
  const clock=ensureSignalClock();
  if(!clock)return;
  if(!row){clock.hidden=true;return;}
  clock.hidden=false;
  const entry=Number(record?.entryMinute);
  const signalText=Number.isFinite(entry)?`${entry}'`:'—';
  const signalEl=$('#signalMinute');
  if(signalEl&&signalEl.textContent!==signalText)signalEl.textContent=signalText;
}

function signedLine(value){
  const n=Number(value);
  if(!Number.isFinite(n))return'—';
  return `${n>0?'+':''}${Number.isInteger(n)?n.toFixed(1):String(n)}`;
}

function decimalOdds(value){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(2):'—';
}

function lockedSignalView(record,row){
  const side=String(record?.selectedSide||'HOME').toUpperCase();
  const team=record?.selectedTeam||(side==='AWAY'?row?.away:row?.home)||'—';
  const market=String(record?.market||'').toUpperCase();
  const line=Number(record?.line);
  const entry=Number(record?.entryMinute);
  const detected=Number.isFinite(entry)?`${entry}'`:'—';
  if(market==='AH'){
    const handicap=signedLine(line);
    return {pick:`${team} ${handicap}`,market:'ASIAN HANDICAP',line:handicap,odds:decimalOdds(record?.odds),detected};
  }
  if(market==='OU'){
    const direction=String(record?.ouDirection||'OVER').toUpperCase();
    const goalLine=Number.isFinite(line)?String(line):'—';
    return {pick:`${direction} ${goalLine}`,market:'GOAL LINE',line:goalLine,odds:decimalOdds(record?.odds),detected};
  }
  return {pick:`${team} WIN`,market:'1X2',line:'WIN',odds:decimalOdds(record?.odds),detected};
}

function renderLockedSignalDetails(card,record,row){
  let box=card.querySelector('.locked-signal-order');
  if(!record||!row){box?.remove();return;}
  if(!box){
    box=document.createElement('div');
    box.className='locked-signal-order';
    card.appendChild(box);
  }
  const view=lockedSignalView(record,row);
  const next=`<div class="signal-order-head"><b>⚡ SIGNAL LOCKED</b><span>DETECTED ${esc(view.detected)}</span></div><div class="signal-order-pick"><small>TAKE</small><strong>${esc(view.pick)}</strong></div><div class="signal-order-grid"><span><small>MARKET</small><b>${esc(view.market)}</b></span><span><small>LINE @ SIGNAL</small><b>${esc(view.line)}</b></span><span><small>ODDS @ SIGNAL</small><b>${esc(view.odds)}</b></span></div>`;
  if(box.innerHTML!==next)box.innerHTML=next;
}

function promoteConfirmedCards(cards){
  const list=$('#candidateList');
  if(!list||cards.length<2)return cards;
  const ranked=cards.map((card,order)=>{
    const index=Number(card.dataset.index||0),row=liveRows[index],record=confirmedRecord(row);
    const historyRank=record?historyRecords.findIndex(r=>String(r.id)===String(record.id)):Number.MAX_SAFE_INTEGER;
    return {card,order,confirmed:Boolean(record),historyRank:historyRank<0?Number.MAX_SAFE_INTEGER:historyRank};
  }).sort((a,b)=>{
    if(a.confirmed!==b.confirmed)return a.confirmed?-1:1;
    if(a.confirmed&&a.historyRank!==b.historyRank)return a.historyRank-b.historyRank;
    return a.order-b.order;
  });
  const sorted=ranked.map(x=>x.card),same=sorted.every((card,i)=>cards[i]===card);
  if(!same)sorted.forEach(card=>list.appendChild(card));
  return sorted;
}

function apply(){
  let cards=[...document.querySelectorAll('.candidate')];
  updateCandidateMinutes(cards);
  cards.forEach(card=>{
    const index=Number(card.dataset.index||0),row=liveRows[index],record=confirmedRecord(row),teams=card.querySelector('.teams');
    card.classList.toggle('confirmed-signal',Boolean(record));
    renderLockedSignalDetails(card,record,row);
    if(!row||!record||!teams)return;
    const side=String(record.selectedSide||'HOME').toUpperCase();
    const selected=record.selectedTeam||(side==='AWAY'?row.away:row.home),opponent=side==='AWAY'?row.home:row.away;
    const selectedScore=side==='AWAY'?row.score?.away:row.score?.home,opponentScore=side==='AWAY'?row.score?.home:row.score?.away;
    const markup=`<span class="signal-selected">${esc(selected)}</span> ${esc(selectedScore??0)}–${esc(opponentScore??0)} <span>${esc(opponent)}</span>`;
    if(teams.innerHTML!==markup)teams.innerHTML=markup;
  });

  cards=promoteConfirmedCards(cards);
  const confirmedCards=cards.filter(card=>card.classList.contains('confirmed-signal'));
  const confirmedCount=confirmedCards.length;
  const signalMetric=$('#metricSignal'),signalMetricCard=signalMetric?.closest('.metric');
  signalMetric?.classList.toggle('signal-number-alert',confirmedCount>0);
  signalMetricCard?.classList.toggle('signal-alert-active',confirmedCount>0);

  const newestConfirmed=confirmedCards[0];
  if(newestConfirmed){
    const index=Number(newestConfirmed.dataset.index||0),row=liveRows[index],record=confirmedRecord(row),key=signalKey(record,row);
    if(key&&key!==lastAutoFocusedSignalKey){
      lastAutoFocusedSignalKey=key;
      newestConfirmed.click();
      return;
    }
  }

  const active=$('.candidate.active'),index=Number(active?.dataset.index||0),row=liveRows[index],record=confirmedRecord(row);
  const selectedName=$('#homeTeam'),opponentName=$('#awayTeam');
  const scoreboard=$('.scoreboard'),banner=ensureConfirmedBanner();
  const confirmed=Boolean(record);
  scoreboard?.classList.toggle('confirmed-signal-active',confirmed);
  if(banner)banner.hidden=!confirmed;
  updateSignalClock(row,record);
  const matchMinute=$('#matchMinute');
  if(row&&matchMinute){
    const status=sourceStatus(row),base=sourceMinuteText(row);
    const next=(status==='HT'||status==='FT')?status:`${base} LIVE`;
    if(matchMinute.textContent!==next)matchMinute.textContent=next;
  }
  if(!selectedName||!row)return;
  const side=String(record?.selectedSide||row.engine?.side||'HOME').toUpperCase(),other=side==='AWAY'?'HOME':'AWAY';
  const selectedLabel=selectedName.closest('.team-copy')?.querySelector('small'),opponentLabel=opponentName?.closest('.team-copy')?.querySelector('small');
  if(selectedLabel)selectedLabel.textContent=`SELECT ${side}`;
  if(opponentLabel)opponentLabel.textContent=`OPPONENT / ${other}`;
  if(confirmed){
    const selected=record.selectedTeam||(side==='AWAY'?row.away:row.home),opponent=side==='AWAY'?row.home:row.away;
    selectedName.textContent=selected;opponentName.textContent=opponent;
  }
  selectedName.classList.toggle('signal-selected',confirmed);
  selectedLabel?.classList.toggle('signal-selected',confirmed);
}

async function refresh(){
  runtime=runtime||await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
  const history=await fetch(`${runtime.workerUrl}/history?page=1&limit=100&t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({records:[]}));
  historyRecords=history.records||[];
  liveRows=Array.isArray(window.__CAR31_LIVE_ROWS__)?window.__CAR31_LIVE_ROWS__:[];
  apply();
}

window.addEventListener('car31:live-updated',()=>{
  liveRows=Array.isArray(window.__CAR31_LIVE_ROWS__)?window.__CAR31_LIVE_ROWS__:[];
  apply();
});

document.addEventListener('click',event=>{if(event.target.closest('.candidate'))setTimeout(apply,0);});
refresh().catch(()=>{});
setInterval(()=>refresh().catch(()=>{}),5000);
