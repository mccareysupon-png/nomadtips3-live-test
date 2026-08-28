(()=>{
  'use strict';

  const predictionUrl='data/predictions.json?v=20260829-local-time-v1';
  const resultsUrl='data/results.json?v=20260829-local-time-v1';
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local time';

  function localKickoff(row){
    const raw=row?.kickoffAt;
    if(!raw) return row?.kickoff||'—';
    const date=new Date(raw);
    if(Number.isNaN(date.getTime())) return row?.kickoff||'—';
    try{
      const dateText=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(date);
      const timeText=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(date);
      return `${dateText} · ${timeText}`;
    }catch{
      return row?.kickoff||'—';
    }
  }

  function applyRows(selector,metaSelector,rows){
    const cards=[...document.querySelectorAll(selector)];
    if(!cards.length||!Array.isArray(rows)||!rows.length) return false;
    cards.forEach((card,index)=>{
      const row=rows[index];
      if(!row) return;
      const meta=card.querySelector(metaSelector);
      if(!meta) return;
      meta.textContent=localKickoff(row);
      meta.title=`Kickoff shown in your local timezone · ${zone}`;
      meta.dataset.localTimezone=zone;
    });
    return true;
  }

  async function load(path){
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function boot(){
    try{
      const [predictionData,resultData]=await Promise.all([load(predictionUrl),load(resultsUrl)]);
      const picks=Array.isArray(predictionData?.picks)?predictionData.picks:[];
      const results=Array.isArray(resultData?.results)?resultData.results:[];
      const render=()=>{
        const today=applyRows('.prediction-card','.league-line span:nth-child(3)',picks);
        const yesterday=applyRows('.result-card','.result-meta span:nth-child(3)',results);
        return today&&yesterday;
      };
      if(render()) return;
      const root=document.querySelector('main')||document.body;
      const observer=new MutationObserver(()=>{if(render())observer.disconnect();});
      observer.observe(root,{childList:true,subtree:true});
      setTimeout(()=>observer.disconnect(),15000);
    }catch(error){
      console.warn('Local kickoff display unavailable; keeping source timezone labels.',error);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
