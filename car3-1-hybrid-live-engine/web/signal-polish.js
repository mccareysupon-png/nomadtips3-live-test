let runtime=null,liveRows=[],historyRecords=[];
const clockState=new Map();
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

function liveClockText(row){
  const status=String(row?.status||'LIVE').toUpperCase();
  const minute=Number(row?.minute);
  const key=String(row?.sourceMatchId||row?.id||'active'),now=Date.now();

  if(status==='FT'||status.includes('FINISH')){
    const previous=clockState.get(key),sourceSeconds=Number.isFinite(minute)?Math.max(0,Math.round(minute*60)):0;
    clockState.set(key,{sourceMinute:minute,status,anchorSeconds:Math.max(sourceSeconds,previous?.lastSeconds||0),anchorAt:now,lastSeconds:Math.max(sourceSeconds,previous?.lastSeconds||0)});
    return'FT';
  }
  if(status==='HT'||status.includes('HALF')){
    const previous=clockState.get(key),sourceSeconds=Number.isFinite(minute)?Math.max(0,Math.round(minute*60)):0;
    clockState.set(key,{sourceMinute:minute,status,anchorSeconds:Math.max(sourceSeconds,previous?.lastSeconds||0),anchorAt:now,lastSeconds:Math.max(sourceSeconds,previous?.lastSeconds||0)});
    return'HT';
  }
  if(!Number.isFinite(minute))return status==='LIVE'?'LIVE':'—';

  // Goaloo/CAR 3.1 supplies the authoritative source minute. Between feed updates,
  // keep a client-side second hand moving continuously across minute boundaries.
  // When a newer source minute arrives, sync forward to it but never jump backward.
  const sourceSeconds=Math.max(0,Math.round(minute*60));
  let state=clockState.get(key);
  if(!state){
    state={sourceMinute:minute,status,anchorSeconds:sourceSeconds,anchorAt:now,lastSeconds:sourceSeconds};
    clockState.set(key,state);
  }else if(minute!==state.sourceMinute||status!==state.status){
    const elapsed=Math.max(0,Math.floor((now-state.anchorAt)/1000));
    const projected=Math.max(state.lastSeconds||0,state.anchorSeconds+elapsed);
    const synced=Math.max(sourceSeconds,projected);
    state={sourceMinute:minute,status,anchorSeconds:synced,anchorAt:now,lastSeconds:synced};
    clockState.set(key,state);
  }

  const elapsed=Math.max(0,Math.floor((now-state.anchorAt)/1000));
  const seconds=Math.max(state.lastSeconds||0,state.anchorSeconds+elapsed);
  state.lastSeconds=seconds;

  const mins=Math.floor(seconds/60),secs=Math.floor(seconds%60);
  return `${mins}:${String(secs).padStart(2,'0')}`;
}

function updateSignalClock(row,record){
  const clock=ensureSignalClock();
  if(!clock)return;
  if(!row){clock.hidden=true;return;}
  clock.hidden=false;
  const entry=Number(record?.entryMinute);
  const signalText=Number.isFinite(entry)?`${entry}'`:'—';
  const signalEl=$('#signalMinute'),liveEl=$('#liveClock');
  if(signalEl)signalEl.textContent=signalText;
  if(liveEl)liveEl.textContent=liveClockText(row);
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
  liveRows=live.matches||[];historyRecords=history.records||[];apply();
}

document.addEventListener('click',event=>{if(event.target.closest('.candidate'))setTimeout(apply,0);});
refresh().catch(()=>{});
setInterval(apply,1000);
setInterval(()=>refresh().catch(()=>{}),30000);
