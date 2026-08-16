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
  if(clock)return clock;
  const score=$('.score');
  if(!score)return null;
  clock=document.createElement('div');
  clock.id='signalClockRow';
  clock.className='signal-clock-row';
  clock.hidden=false;
  clock.innerHTML='<span><small>SIGNAL</small><b id="signalMinute">—</b></span><i aria-hidden="true"></i><span><small>LIVE TIME</small><b id="liveClock">—</b></span>';
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

function formatElapsed(seconds){
  const value=Number(seconds);
  if(!Number.isFinite(value)||value<0)return null;
  const whole=Math.round(value),mins=Math.floor(whole/60),secs=whole%60;
  return `${mins}:${String(secs).padStart(2,'0')}`;
}

function sourceClockText(row){
  const status=String(row?.status||'LIVE').toUpperCase();
  if(status==='FT'||status.includes('FINISH'))return'FT';
  if(status==='HT'||status.includes('HALF'))return'HT';
  if(row?.goalooClock?.verified===true){
    const exact=formatElapsed(row.goalooElapsedSeconds);
    if(exact)return exact;
  }
  const minute=Number(row?.minute);
  return Number.isFinite(minute)?`${Math.max(0,Math.round(minute))}'`:status==='LIVE'?'LIVE':'—';
}

function sourceMinuteText(row){
  return sourceClockText(row);
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

function liveClockText(row){
  return sourceClockText(row);
}

function updateSignalClock(row,record){
  const clock=ensureSignalClock();
  if(!clock)return;
  if(!row){clock.hidden=true;return;}
  clock.hidden=false;
  const entry=Number(record?.entryMinute);
  const signalText=Number.isFinite(entry)?`${entry}'`:'—';
  const signalEl=$('#signalMinute'),liveEl=$('#liveClock');
  if(signalEl&&signalEl.textContent!==signalText)signalEl.textContent=signalText;
  if(liveEl){
    const liveText=liveClockText(row);
    if(liveEl.textContent!==liveText)liveEl.textContent=liveText;
  }
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
    const base=sourceMinuteText(row),next=(base==='HT'||base==='FT')?base:`${base} LIVE`;
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
  const [live,history]=await Promise.all([
    fetch(`${runtime.workerUrl}/live?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({matches:[]})),
    fetch(`${runtime.workerUrl}/history?page=1&limit=100&t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({records:[]}))
  ]);
  liveRows=live.matches||[];historyRecords=history.records||[];
  apply();
}

document.addEventListener('click',event=>{if(event.target.closest('.candidate'))setTimeout(apply,0);});
refresh().catch(()=>{});
setInterval(()=>refresh().catch(()=>{}),5000);
