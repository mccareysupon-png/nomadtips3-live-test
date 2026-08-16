let runtime=null,liveRows=[],historyRecords=[];
const clockState=new Map();
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function confirmedRecord(row){
  return historyRecords.find(r=>String(r.id)===String(row?.sourceMatchId));
}

function ensureSignalClock(){
  let clock=$('#signalClockRow');
  if(clock)return clock;
  const score=$('.score');
  if(!score)return null;
  clock=document.createElement('div');
  clock.id='signalClockRow';
  clock.className='signal-clock-row';
  clock.hidden=true;
  clock.innerHTML='<span><small>SIGNAL</small><b id="signalMinute">—</b></span><i aria-hidden="true"></i><span><small>LIVE TIME</small><b id="liveClock">—</b></span>';
  score.appendChild(clock);
  return clock;
}

function liveClockText(row){
  const status=String(row?.status||'LIVE').toUpperCase();
  if(status==='FT'||status.includes('FINISH'))return'FT';
  if(status==='HT'||status.includes('HALF'))return'HT';
  const minute=Number(row?.minute);
  if(!Number.isFinite(minute))return status==='LIVE'?'LIVE':'—';
  const key=String(row.sourceMatchId||row.id||'active'),now=Date.now(),sourceSeconds=Math.max(0,Math.round(minute*60));
  let state=clockState.get(key);
  if(!state){
    state={sourceMinute:minute,anchorSeconds:sourceSeconds,anchorAt:now,lastSeconds:sourceSeconds};
    clockState.set(key,state);
  }else if(minute>state.sourceMinute){
    const projected=state.anchorSeconds+Math.max(0,Math.floor((now-state.anchorAt)/1000));
    const next=Math.max(sourceSeconds,projected,state.lastSeconds||0);
    state.sourceMinute=minute;state.anchorSeconds=next;state.anchorAt=now;state.lastSeconds=next;
  }
  const projected=state.anchorSeconds+Math.max(0,Math.floor((now-state.anchorAt)/1000));
  const seconds=Math.max(sourceSeconds,state.lastSeconds||0,projected);
  state.lastSeconds=seconds;
  const mins=Math.floor(seconds/60),secs=Math.floor(seconds%60);
  return `${mins}:${String(secs).padStart(2,'0')}`;
}

function updateSignalClock(row,record){
  const clock=ensureSignalClock();
  if(!clock)return;
  if(!row||!record){clock.hidden=true;return;}
  clock.hidden=false;
  const entry=Number(record.entryMinute);
  const signalText=Number.isFinite(entry)?`${entry}'`:'—';
  const signalEl=$('#signalMinute'),liveEl=$('#liveClock');
  if(signalEl)signalEl.textContent=signalText;
  if(liveEl)liveEl.textContent=liveClockText(row);
}

function apply(){
  const cards=[...document.querySelectorAll('.candidate')];
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

  const active=$('.candidate.active'),index=Number(active?.dataset.index||0),row=liveRows[index],record=confirmedRecord(row);
  const selectedName=$('#homeTeam'),opponentName=$('#awayTeam');
  updateSignalClock(row,record);
  if(!selectedName||!row)return;
  const side=String(record?.selectedSide||row.engine?.side||'HOME').toUpperCase(),other=side==='AWAY'?'HOME':'AWAY';
  const selectedLabel=selectedName.closest('.team-copy')?.querySelector('small'),opponentLabel=opponentName?.closest('.team-copy')?.querySelector('small');
  if(selectedLabel)selectedLabel.textContent=`SELECT ${side}`;
  if(opponentLabel)opponentLabel.textContent=`OPPONENT / ${other}`;
  const confirmed=Boolean(record);
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
