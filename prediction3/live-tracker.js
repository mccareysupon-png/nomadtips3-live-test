(()=>{
  'use strict';

  const TRACKER='https://nomadtips3-prediction3-tracker.mccarey-supon.workers.dev/state?refresh=1';
  const LEDGER='data/ledger.json?v=20260906-auto-tracking-v1';
  const POLL_MS=15000;
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local time';
  let ledger=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const fmtOdds=value=>finite(value)?Number(value).toFixed(2):'—';
  const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  async function getJson(url){
    const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function kickoffIso(item,record){return record?.kickoffUtc||item?.tracking?.kickoffUtc||item?.kickoffAt||null;}
  function localKickoff(value,fallback='—'){
    if(!value)return fallback;
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return fallback;
    try{
      return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(date);
    }catch{return fallback;}
  }
  function scoreText(record){
    if(!Array.isArray(record?.score)||record.score.length<2||!finite(record.score[0])||!finite(record.score[1]))return '— : —';
    return `${Number(record.score[0])} : ${Number(record.score[1])}`;
  }
  function stateText(record){
    if(!record)return '';
    if(record.status==='LIVE')return `${scoreText(record)} · ${finite(record.minute)?`${Number(record.minute)}′`:'LIVE'}`;
    if(record.status==='FT')return `FT ${scoreText(record)}${record.result?` · ${record.result}`:''}`;
    return '— : —';
  }

  function recordFor(item,records){
    const exact=(records||[]).find(row=>String(row?.id||'')===String(item?.id||''));
    if(exact)return exact;
    const home=norm(item?.home),away=norm(item?.away);
    return (records||[]).find(row=>norm(row?.home)===home&&norm(row?.away)===away)||null;
  }

  function predictionCards(){return [...document.querySelectorAll('.p3-featured')];}
  function applyToday(records){
    if(!ledger||!Array.isArray(ledger.today))return;
    const cards=predictionCards();
    ledger.today.forEach((item,index)=>{
      const card=cards[index];
      if(!card)return;
      const record=recordFor(item,records);
      const meta=card.querySelector('.p3-match-meta span:nth-child(3)');
      if(meta){
        const local=localKickoff(kickoffIso(item,record),item.kickoff||'—');
        const status=stateText(record);
        meta.textContent=status?`${local} · ${status}`:local;
        meta.title=`Kickoff shown in your local timezone · ${zone}`;
        meta.dataset.localTimezone=zone;
      }
      card.dataset.trackingStatus=record?.status||'SCHEDULED';
      if(record?.fixtureId)card.dataset.fixtureId=record.fixtureId;
      if(record?.result)card.dataset.result=record.result;
    });
  }

  function autoResultCard(item,record){
    const result=String(record?.result||'PENDING').toUpperCase();
    const state=result.toLowerCase();
    const kickoff=localKickoff(kickoffIso(item,record),item?.kickoff||item?.date||'—');
    return `<article class="result-card ${esc(state)}" data-auto-result-id="${esc(item.id)}" data-search="${esc(`${item.home||''} ${item.away||''} ${item.league||''} ${item.pick||''} ${result}`.toLowerCase())}">
      <div class="result-main">
        <div class="result-meta"><span>${esc(item.league||'—')}</span><span>•</span><span>${esc(kickoff)}</span></div>
        <div class="result-match"><span>${esc(item.home||'Home')}</span><span class="vs">VS</span><span>${esc(item.away||'Away')}</span></div>
        <div class="result-pick"><strong>${esc(item.pick||'—')}</strong></div>
        <div class="result-summary">Automatically settled from the connected live-score feed.</div>
      </div>
      <div class="result-settle">
        <div class="settle-box"><span>FINAL SCORE</span><strong>${esc(scoreText(record).replace(' : ','-'))}</strong></div>
        <div class="settle-box"><span>ODDS</span><strong>${fmtOdds(item.referenceOdds||item.odds)}</strong></div>
        <div class="settle-box"><span>RESULT</span><strong class="settle-result ${esc(state)}">${esc(result)}</strong></div>
      </div>
    </article>`;
  }

  function mergedSettled(records){
    const staticRows=Array.isArray(ledger?.results)?ledger.results:[];
    const dynamic=[];
    for(const item of Array.isArray(ledger?.today)?ledger.today:[]){
      const record=recordFor(item,records);
      if(!record?.result||record.status!=='FT')continue;
      if(staticRows.some(row=>String(row.id||'')===String(item.id||'')))continue;
      dynamic.push({item,record});
    }
    return {staticRows,dynamic};
  }

  function applyResults(records){
    if(!ledger)return;
    const list=document.getElementById('resultList');
    if(!list)return;
    const {staticRows,dynamic}=mergedSettled(records);
    list.querySelectorAll('[data-auto-result-id]').forEach(node=>node.remove());
    if(dynamic.length){
      list.insertAdjacentHTML('beforeend',dynamic.map(({item,record})=>autoResultCard(item,record)).join(''));
    }

    const all=[
      ...staticRows.map(row=>({result:String(row.result||'').toUpperCase(),odds:Number(row.odds)})),
      ...dynamic.map(({item,record})=>({result:String(record.result||'').toUpperCase(),odds:Number(item.referenceOdds||item.odds)})),
    ].filter(row=>['WIN','LOSS','PUSH'].includes(row.result));
    const wins=all.filter(row=>row.result==='WIN').length;
    const losses=all.filter(row=>row.result==='LOSS').length;
    const pushes=all.filter(row=>row.result==='PUSH').length;
    const decided=wins+losses;
    const odds=all.map(row=>row.odds).filter(Number.isFinite);
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set('statSettled',String(all.length));
    set('statWins',String(wins));
    set('statLosses',String(losses));
    set('statPushes',String(pushes));
    set('statWinRate',decided?`${(wins/decided*100).toFixed(1)}%`:'—');
    set('statAvgOdds',odds.length?(odds.reduce((a,b)=>a+b,0)/odds.length).toFixed(2):'—');
    set('resultCount',String(staticRows.length+dynamic.length));
  }

  async function waitForCards(timeout=15000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      if(predictionCards().length||document.querySelector('.p3-empty'))return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }

  async function refresh(){
    try{
      const state=await getJson(TRACKER);
      const records=Array.isArray(state?.records)?state.records:[];
      applyToday(records);
      applyResults(records);
    }catch(error){
      console.warn('Prediction3 live tracking unavailable; keeping local kickoff display.',error);
      applyToday([]);
    }
  }

  async function boot(){
    try{ledger=await getJson(LEDGER);}catch(error){console.warn('Prediction3 ledger unavailable for live tracking.',error);return;}
    await waitForCards();
    applyToday([]);
    await refresh();
    setInterval(refresh,POLL_MS);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
