let runtime=null;
let liveRows=[];

const $=s=>document.querySelector(s);

function minuteLabel(row){
  const status=String(row?.status||'LIVE').toUpperCase();
  if(status==='FT'||status.includes('FINISH'))return 'FT';
  if(status==='HT'||status.includes('HALF'))return 'HT';
  const minute=Number(row?.minute);
  return Number.isFinite(minute)?`${Math.max(0,Math.round(minute))}'`:'LIVE';
}

function statusLabel(row){
  const status=String(row?.status||'LIVE').toUpperCase();
  if(status==='FT'||status.includes('FINISH'))return 'FT';
  if(status==='HT'||status.includes('HALF'))return 'HT';
  return 'LIVE';
}

function ensureCard(card,row){
  if(!card||!row)return;
  const top=card.querySelector('.candidate-top');
  if(!top)return;
  const oldMinute=card.querySelector('.candidate-minute');
  if(oldMinute){
    oldMinute.hidden=true;
    oldMinute.textContent=minuteLabel(row);
  }
  card.dataset.matchId=String(row.sourceMatchId||row.id||'');
  let time=card.querySelector('.candidate-match-time');
  if(!time){
    time=document.createElement('span');
    time.className='candidate-match-time';
    time.innerHTML='<small>MATCH TIME</small><b>LIVE</b><em>LIVE</em>';
    top.prepend(time);
  }
  const value=time.querySelector('b');
  const state=time.querySelector('em');
  const nextMinute=minuteLabel(row),nextState=statusLabel(row);
  if(value&&value.textContent!==nextMinute)value.textContent=nextMinute;
  if(state&&state.textContent!==nextState)state.textContent=nextState;
}

function cleanSignalRow(){
  const row=$('#signalClockRow');
  if(!row)return;
  const spans=row.querySelectorAll(':scope > span');
  const divider=row.querySelector(':scope > i');
  if(spans[0]){
    const label=spans[0].querySelector('small');
    if(label&&label.textContent!=='SIGNAL LOCK')label.textContent='SIGNAL LOCK';
  }
  if(divider)divider.hidden=true;
  if(spans[1])spans[1].hidden=true;
  const signal=$('#signalMinute');
  const text=String(signal?.textContent||'').trim();
  const shouldHide=!text||text==='—';
  if(row.hidden!==shouldHide)row.hidden=shouldHide;
}

function apply(){
  const cards=[...document.querySelectorAll('.candidate')];
  cards.forEach(card=>{
    const index=Number(card.dataset.index||0);
    ensureCard(card,liveRows[index]);
  });

  const active=$('.candidate.active');
  if(active){
    const row=liveRows[Number(active.dataset.index||0)];
    const matchMinute=$('#matchMinute');
    if(row&&matchMinute){
      const value=minuteLabel(row);
      const text=value==='HT'||value==='FT'?value:`${value} LIVE`;
      if(matchMinute.textContent!==text)matchMinute.textContent=text;
    }
  }
  cleanSignalRow();
}

async function ensureRuntime(){
  if(runtime)return runtime;
  runtime=await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
  return runtime;
}

async function refreshLive(){
  const cfg=await ensureRuntime();
  const live=await fetch(`${cfg.workerUrl}/live?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json());
  liveRows=live.matches||[];
  apply();
}

function scheduleAligned(fn,periodMs,offsetMs=4000){
  const schedule=()=>{
    const now=Date.now();
    const mod=((now-offsetMs)%periodMs+periodMs)%periodMs;
    const delay=mod===0?periodMs:periodMs-mod;
    setTimeout(async()=>{
      try{await fn();}catch{}
      schedule();
    },delay);
  };
  schedule();
}

const observer=new MutationObserver(()=>apply());
const list=$('#candidateList');
if(list)observer.observe(list,{childList:true,subtree:true,characterData:true});
const score=$('.score');
if(score)observer.observe(score,{childList:true,subtree:true,characterData:true});

document.addEventListener('click',event=>{if(event.target.closest('.candidate'))setTimeout(apply,0);});
refreshLive().catch(()=>{});
setInterval(apply,1000);
scheduleAligned(refreshLive,5000,4000);
