(()=>{
  const API=window.NOMAD_RUNTIME?.engineBase;
  if(!API){console.error('NOMAD runtime engine URL is unavailable');return;}
  const REFRESH_MS=15000;
  let ledger=new Map();
  let lastFetch=0;
  let fetching=false;
  let frame=0;

  const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  const recordKey=record=>normalize(`${record?.home||''} — ${record?.away||''}`);
  const scoreText=score=>score&&score.home!=null&&score.away!=null?`${score.home}–${score.away}`:null;

  const style=document.createElement('style');
  style.textContent='@keyframes entryPulse{0%,100%{opacity:1}50%{opacity:.35}}.match-wrap.signal .score .entry-score{display:block;margin-top:3px;font-size:7px;line-height:1.1;color:var(--green);font-weight:900;letter-spacing:.05em;white-space:nowrap;animation:entryPulse 1.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.match-wrap.signal .score .entry-score{animation:none}}';
  document.head.appendChild(style);

  const rebuildLedger=records=>{
    const next=new Map();
    for(const record of Array.isArray(records)?records:[]){
      if(!record?.entryScore)continue;
      const key=recordKey(record);
      if(!key||key==='—')continue;
      const previous=next.get(key);
      const currentTime=Date.parse(record.lockedAt||'')||0;
      const previousTime=Date.parse(previous?.lockedAt||'')||0;
      if(!previous||currentTime>=previousTime)next.set(key,record);
    }
    ledger=next;
  };

  const apply=()=>{
    frame=0;
    document.querySelectorAll('.match-wrap.signal').forEach(row=>{
      const teams=row.querySelector('.teams');
      const score=row.querySelector('.score');
      if(!teams||!score)return;
      const record=ledger.get(normalize(teams.textContent));
      const entry=scoreText(record?.entryScore);
      let label=score.querySelector('.entry-score');
      if(!entry){if(label)label.remove();return;}
      if(!label){label=document.createElement('span');label.className='entry-score';score.appendChild(label);}
      label.textContent=`ENTRY ${entry}`;
    });
  };

  const schedule=()=>{
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(apply);
  };

  const refresh=async force=>{
    const now=Date.now();
    if(fetching||(!force&&now-lastFetch<REFRESH_MS))return;
    fetching=true;
    try{
      const response=await fetch(`${API}/statistics?_=${now}`,{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      rebuildLedger(data?.records);
      lastFetch=now;
      schedule();
    }catch{}finally{fetching=false;}
  };

  const list=document.querySelector('.match-list');
  if(list)new MutationObserver(()=>{schedule();refresh(false);}).observe(list,{childList:true,subtree:true});
  refresh(true);
  setInterval(()=>refresh(true),REFRESH_MS);
})();
