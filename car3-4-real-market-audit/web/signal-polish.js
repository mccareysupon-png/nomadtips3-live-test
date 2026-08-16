let runtime=null,liveRows=[],historyRecords=[];
let lastAutoFocusedSignalKey=null;
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function confirmedRecord(row){
  return historyRecords.find(r=>String(r.id)===String(row?.sourceMatchId));
}

function signalKey(record,row){
  return String(record?.key??record?.id??row?.sourceMatchId??row?.id??'');
}

function ensureDisplayStyles(){
  if(document.querySelector('#car31SignalDisplayStyles'))return;
  const style=document.createElement('style');
  style.id='car31SignalDisplayStyles';
  style.textContent=`
    .signal-clock-row{gap:0!important}.signal-clock-row>i,#liveClock{display:none!important}
    .locked-signal-order{margin-top:7px!important;padding:7px 8px!important;border-radius:8px!important}
    .signal-card-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;min-width:0}
    .signal-card-summary>b{font-size:7px;color:#baffca;letter-spacing:.06em;white-space:nowrap}
    .signal-card-summary>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#fff;font-weight:950}
    .signal-card-summary>span{font-size:7px;color:#f4c84b;font-weight:900;white-space:nowrap}
    .signal-ticket{margin:10px 0 12px;padding:13px 14px 14px;border-radius:13px;background:linear-gradient(135deg,rgba(13,51,27,.98),rgba(18,38,25,.96) 58%,rgba(23,27,25,.96));box-shadow:inset 4px 0 0 #39d06f,0 12px 28px rgba(0,0,0,.25),0 0 26px rgba(57,208,111,.10)}
    .signal-ticket[hidden]{display:none!important}
    .signal-ticket-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}
    .signal-ticket-head>span{font-size:10px;color:#caffd9;font-weight:950;letter-spacing:.09em}
    .signal-ticket-head>b{font-size:9px;color:#f4c84b;font-weight:900;white-space:nowrap}
    .signal-ticket-main{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
    .signal-ticket-main>small{font-size:8px;color:#91a298;font-weight:900;letter-spacing:.09em}
    .signal-ticket-main>strong{font-size:22px;line-height:1.12;color:#fff;font-weight:950;overflow-wrap:anywhere}
    .signal-ticket-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
    .signal-ticket-grid>span{display:flex;flex-direction:column;gap:3px;min-width:0;padding:8px 9px;border-radius:8px;background:rgba(0,0,0,.22)}
    .signal-ticket-grid small{font-size:6.5px;color:#7f9086;font-weight:850;letter-spacing:.07em}
    .signal-ticket-grid b{font-size:10px;color:#effaf2;font-weight:950;overflow-wrap:anywhere}
    .signal-ticket-grid .signal-ticket-odds b{color:#f4c84b;font-size:13px}
    .signal-ticket-grid .signal-ticket-minute b{color:#8dffad}
    @media(max-width:1000px){.signal-ticket-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:620px){.signal-card-summary{grid-template-columns:auto 1fr}.signal-card-summary>span{grid-column:1/-1}.signal-ticket{padding:11px}.signal-ticket-head{align-items:flex-start;flex-direction:column;gap:4px}.signal-ticket-main>strong{font-size:17px}.signal-ticket-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
}

function ensureSignalClock(){
  let clock=$('#signalClockRow');
  if(clock){
    const spans=clock.querySelectorAll(':scope > span');
    clock.querySelector(':scope > i')?.remove();
    if(spans[1])spans[1].remove();
    clock.querySelector('#liveClock')?.remove();
    const label=spans[0]?.querySelector('small');
    if(label)label.textContent='SIGNAL';
    return clock;
  }
  const score=$('.score');
  if(!score)return null;
  clock=document.createElement('div');
  clock.id='signalClockRow';
  clock.className='signal-clock-row';
  clock.hidden=true;
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

function ensureSignalTicket(){
  let ticket=$('#signalTicket');
  if(ticket)return ticket;
  const scoreboard=$('.scoreboard');
  if(!scoreboard)return null;
  ticket=document.createElement('section');
  ticket.id='signalTicket';
  ticket.className='signal-ticket';
  ticket.hidden=true;
  ticket.setAttribute('aria-live','polite');
  ticket.innerHTML='<div class="signal-ticket-head"><span>⚡ CONFIRMED SIGNAL</span><b id="signalTicketDetected">DETECTED —</b></div><div class="signal-ticket-main"><small>TAKE</small><strong id="signalTicketPick">—</strong></div><div class="signal-ticket-grid"><span><small>MARKET</small><b id="signalTicketMarket">—</b></span><span><small>LINE @ SIGNAL</small><b id="signalTicketLine">—</b></span><span class="signal-ticket-odds"><small>ODDS @ SIGNAL</small><b id="signalTicketOdds">—</b></span><span><small>ENTRY SCORE</small><b id="signalTicketEntryScore">—</b></span><span class="signal-ticket-minute"><small>DETECTED MINUTE</small><b id="signalTicketMinute">—</b></span><span><small>LOCKED LOCAL</small><b id="signalTicketLocal">—</b></span></div>';
  scoreboard.insertAdjacentElement('afterend',ticket);
  return ticket;
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
    card.querySelectorAll('.candidate-match-time').forEach(el=>el.remove());
  });
}

function updateSignalClock(row,record){
  const clock=ensureSignalClock();
  if(!clock)return;
  if(!row||!record){clock.hidden=true;return;}
  const entry=Number(record.entryMinute);
  const signalText=Number.isFinite(entry)?`${entry}'`:'—';
  const signalEl=$('#signalMinute');
  if(signalEl&&signalEl.textContent!==signalText)signalEl.textContent=signalText;
  clock.hidden=false;
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

function localLockedTime(value){
  if(!value)return'—';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return'—';
  try{return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date);}catch{return date.toLocaleTimeString();}
}

function entryScoreText(record){
  const h=Number(record?.entryScore?.home),a=Number(record?.entryScore?.away);
  return Number.isFinite(h)&&Number.isFinite(a)?`${h}–${a}`:'—';
}

function lockedSignalView(record,row){
  const side=String(record?.selectedSide||'HOME').toUpperCase();
  const team=record?.selectedTeam||(side==='AWAY'?row?.away:row?.home)||'—';
  const market=String(record?.market||'').toUpperCase();
  const line=Number(record?.selectedLine??record?.line);
  const entry=Number(record?.entryMinute);
  const detected=Number.isFinite(entry)?`${entry}'`:'—';
  const common={odds:decimalOdds(record?.odds),detected,entryScore:entryScoreText(record),localTime:localLockedTime(record?.selectedAt)};
  if(market==='AH'){
    const handicap=signedLine(line);
    return {...common,pick:`${team} ${handicap}`,market:'ASIAN HANDICAP',line:handicap};
  }
  if(market==='OU'){
    const direction=String(record?.ouDirection||'OVER').toUpperCase();
    const goalLine=Number.isFinite(line)?String(line):'—';
    return {...common,pick:`${direction} ${goalLine}`,market:'GOAL LINE',line:goalLine};
  }
  return {...common,pick:`${team} WIN`,market:'1X2',line:'WIN'};
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
  const next=`<div class="signal-card-summary"><b>⚡ SIGNAL</b><strong>${esc(view.pick)}</strong><span>@ ${esc(view.odds)} · ${esc(view.detected)}</span></div>`;
  if(box.innerHTML!==next)box.innerHTML=next;
}

function renderSignalTicket(record,row){
  const ticket=ensureSignalTicket();
  if(!ticket)return;
  if(!record||!row){ticket.hidden=true;return;}
  const view=lockedSignalView(record,row);
  const values={
    signalTicketDetected:`DETECTED ${view.detected}`,
    signalTicketPick:view.pick,
    signalTicketMarket:view.market,
    signalTicketLine:view.line,
    signalTicketOdds:view.odds,
    signalTicketEntryScore:view.entryScore,
    signalTicketMinute:view.detected,
    signalTicketLocal:view.localTime
  };
  Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el&&el.textContent!==String(value))el.textContent=String(value);});
  ticket.hidden=false;
}

function promoteConfirmedCards(cards){
  const list=$('#candidateList');
  if(!list||cards.length<2)return cards;
  const ranked=cards.map((card,order)=>{
    const index=Number(card.dataset.index||0),row=liveRows[index],record=confirmedRecord(row);
    const historyRank=record?historyRecords.findIndex(r=>String(r.key??r.id)===String(record.key??record.id)):Number.MAX_SAFE_INTEGER;
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
  ensureDisplayStyles();
  ensureSignalClock();
  ensureSignalTicket();
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
  renderSignalTicket(record,row);
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
ensureDisplayStyles();
refresh().catch(()=>{});
setInterval(()=>refresh().catch(()=>{}),5000);
