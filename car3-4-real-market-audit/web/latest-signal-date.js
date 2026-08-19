(()=>{
  const FALLBACK_WORKER='https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
  const LIMIT=6;
  let records=[];
  let refreshSeconds=15;

  const formatDate=value=>{
    if(!value)return'—';
    try{return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));}
    catch{return'—';}
  };
  const formatTime=value=>{
    if(!value)return'—';
    try{return new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
    catch{return'—';}
  };

  const apply=()=>{
    const cards=[...document.querySelectorAll('#signals .signal-card')].slice(0,LIMIT);
    cards.forEach((card,index)=>{
      const record=records[index];
      if(!record)return;
      const meta=card.querySelector('.signal-meta');
      if(!meta)return;
      const entry=`${record.entryScore?.home??'—'}-${record.entryScore?.away??'—'}`;
      meta.textContent=`Locked ${formatDate(record.selectedAt)} · ${formatTime(record.selectedAt)} · entry ${entry}`;
    });
  };

  const load=async()=>{
    let workerUrl=FALLBACK_WORKER;
    try{
      const runtime=await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
      workerUrl=runtime.workerUrl||workerUrl;
      refreshSeconds=Math.max(10,Number(runtime.refreshSeconds)||15);
    }catch{}
    try{
      const payload=await fetch(`${workerUrl}/history?page=1&limit=${LIMIT}`,{cache:'no-store'}).then(r=>{
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      records=Array.isArray(payload?.records)?payload.records.slice(0,LIMIT):[];
      apply();
    }catch{}
  };

  const start=()=>{
    const holder=document.getElementById('signals');
    if(holder)new MutationObserver(apply).observe(holder,{childList:true,subtree:true});
    load();
    setInterval(load,refreshSeconds*1000);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
