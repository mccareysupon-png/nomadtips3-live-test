(()=>{
  'use strict';

  const TRACKER='https://nomadtips3-prediction3-tracker.mccarey-supon.workers.dev/state?refresh=1';
  const LIVE_FEED='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
  const LEDGER='data/ledger.json?v=20260906-auto-tracking-v1';
  const POLL_MS=15000;
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local time';
  let ledger=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'
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
  function liveRowFor(item,record,matches){
    const fixtureId=String(record?.fixtureId||item?.tracking?.fixtureId||'').trim();
    if(fixtureId){
      const exact=(matches||[]).find(row=>String(row?.id||'')===fixtureId);
      if(exact)return exact;
    }
    const home=norm(item?.home),away=norm(item?.away);
    return (matches||[]).find(row=>norm(row?.home)===home&&norm(row?.away)===away)||null;
  }
  const pair=value=>Array.isArray(value)&&finite(value[0])&&finite(value[1])?[Number(value[0]),Number(value[1])]:null;

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

  function ensureSiriusPanel(card){
    let panel=card.querySelector('.p3-sirius-live');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.className='p3-sirius-live';
    panel.hidden=true;
    panel.setAttribute('aria-label','Sirius live match analytics');
    panel.innerHTML=`
      <div class="p3-sirius-head">
        <div class="p3-sirius-title">
          <span class="p3-sirius-kicker">SIRIUS MATCH INTELLIGENCE</span>
          <strong>Golden Live Reading</strong>
        </div>
        <div class="p3-sirius-score">
          <span class="p3-sirius-state" data-sirius-state>LIVE DATA</span>
          <strong data-sirius-score>— : —</strong>
          <span class="p3-sirius-minute" data-sirius-minute>—</span>
        </div>
      </div>
      <div class="p3-sirius-body">
        <div class="p3-sirius-chart">
          <div class="p3-sirius-block-head"><strong>EVENT FLOW</strong><small>recent attack · danger · corner movement</small></div>
          <div class="p3-pressure-chart" data-sirius-pressure></div>
          <div class="p3-sirius-legend"><span data-sirius-home>HOME</span><b>LIVE PULSE</b><span data-sirius-away>AWAY</span></div>
        </div>
        <div class="p3-sirius-metrics">
          <div class="p3-sirius-metrics-title">MATCH STATS</div>
          ${metricShell('ATTACKS','attacks')}
          ${metricShell('DANGEROUS','dangerous')}
          ${metricShell('CORNERS','corner')}
          <div class="p3-sirius-source"><span>Source</span><strong>TotalCorner V3</strong></div>
        </div>
        <div class="p3-sirius-analysis">
          <div class="p3-sirius-metrics-title">LIVE ANALYSIS</div>
          <div class="p3-analysis-reading"><span>PRESSURE SHARE</span><strong data-sirius-share>50% · 50%</strong></div>
          <div class="p3-analysis-balance" aria-hidden="true"><i data-sirius-balance></i><b></b></div>
          <div class="p3-analysis-reading"><span>CURRENT EDGE</span><strong data-sirius-edge>BALANCED</strong></div>
          <div class="p3-analysis-reading"><span>RECENT PULSE</span><strong data-sirius-recent>—</strong></div>
          <p class="p3-analysis-note">Observed live event volume only · not win probability.</p>
        </div>
      </div>`;
    const anchor=card.querySelector('.p3-pick-grid');
    if(anchor)anchor.insertAdjacentElement('afterend',panel);else card.appendChild(panel);
    return panel;
  }
  function metricShell(label,key){
    return `<div class="p3-sirius-metric" data-sirius-metric="${key}">
      <div class="p3-sirius-metric-head"><strong data-home>—</strong><span>${label}</span><strong data-away>—</strong></div>
      <div class="p3-sirius-track"><span class="p3-sirius-half home"><i class="p3-sirius-fill" data-home-fill></i></span><span class="p3-sirius-half away"><i class="p3-sirius-fill" data-away-fill></i></span></div>
    </div>`;
  }
  function setMetric(panel,key,values){
    const row=panel.querySelector(`[data-sirius-metric="${key}"]`);
    if(!row)return false;
    const p=pair(values);
    if(!p){row.hidden=true;return false;}
    row.hidden=false;
    const [home,away]=p,max=Math.max(home,away,1);
    row.querySelector('[data-home]').textContent=String(home);
    row.querySelector('[data-away]').textContent=String(away);
    row.querySelector('[data-home-fill]').style.width=`${Math.max(4,home/max*100).toFixed(1)}%`;
    row.querySelector('[data-away-fill]').style.width=`${Math.max(4,away/max*100).toFixed(1)}%`;
    return true;
  }
  function pressureSeries(snapshots){
    const rows=(Array.isArray(snapshots)?snapshots:[]).slice(-18);
    if(rows.length<2)return [];
    const out=[];
    for(let i=1;i<rows.length;i++){
      const prev=rows[i-1]||{},cur=rows[i]||{};
      const delta=(key,side)=>{
        const a=pair(prev[key]),b=pair(cur[key]);
        return a&&b?Math.max(0,b[side]-a[side]):0;
      };
      out.push({
        minute:finite(cur.minute)?Number(cur.minute):null,
        home:delta('attacks',0)*.7+delta('dangerous',0)*2+delta('corner',0)*3,
        away:delta('attacks',1)*.7+delta('dangerous',1)*2+delta('corner',1)*3,
      });
    }
    return out;
  }
  function drawPressure(panel,snapshots){
    const host=panel.querySelector('[data-sirius-pressure]');
    if(!host)return;
    const series=pressureSeries(snapshots);
    if(!series.length){host.innerHTML='<span class="p3-pressure-pair"><i class="p3-pressure-bar" style="height:2px"></i><i class="p3-pressure-bar away" style="height:2px"></i></span>';return;}
    const max=Math.max(1,...series.flatMap(row=>[row.home,row.away]));
    host.innerHTML=series.map(row=>{
      const h=row.home>0?Math.max(5,row.home/max*100):2;
      const a=row.away>0?Math.max(5,row.away/max*100):2;
      const title=`${row.minute??'—'}′ · H ${row.home.toFixed(1)} / A ${row.away.toFixed(1)}`;
      return `<span class="p3-pressure-pair" title="${esc(title)}"><i class="p3-pressure-bar" style="height:${h.toFixed(1)}%"></i><i class="p3-pressure-bar away" style="height:${a.toFixed(1)}%"></i></span>`;
    }).join('');
  }
  function setAnalysis(panel,latest,snapshots){
    const attacks=pair(latest?.attacks)||[0,0];
    const dangerous=pair(latest?.dangerous)||[0,0];
    const corners=pair(latest?.corner)||[0,0];
    const home=attacks[0]*.35+dangerous[0]*1.4+corners[0]*2;
    const away=attacks[1]*.35+dangerous[1]*1.4+corners[1]*2;
    const total=home+away;
    const share=total>0?Math.max(0,Math.min(100,home/total*100)):50;
    const awayShare=100-share;
    const edge=Math.abs(share-50)<5?'BALANCED':share>50?'HOME PRESSURE':'AWAY PRESSURE';
    const recent=pressureSeries(snapshots).slice(-5);
    const recentHome=recent.reduce((sum,row)=>sum+row.home,0);
    const recentAway=recent.reduce((sum,row)=>sum+row.away,0);
    const shareEl=panel.querySelector('[data-sirius-share]');
    const bar=panel.querySelector('[data-sirius-balance]');
    const edgeEl=panel.querySelector('[data-sirius-edge]');
    const recentEl=panel.querySelector('[data-sirius-recent]');
    if(shareEl)shareEl.textContent=`${share.toFixed(0)}% · ${awayShare.toFixed(0)}%`;
    if(bar)bar.style.width=`${share.toFixed(1)}%`;
    if(edgeEl)edgeEl.textContent=edge;
    if(recentEl)recentEl.textContent=recent.length?`H ${recentHome.toFixed(1)} · A ${recentAway.toFixed(1)}`:'WAITING';
  }
  function applySirius(records,matches){
    if(!ledger||!Array.isArray(ledger.today))return;
    const cards=predictionCards();
    ledger.today.forEach((item,index)=>{
      const card=cards[index];if(!card)return;
      const record=recordFor(item,records);
      const liveRow=liveRowFor(item,record,matches);
      const snapshots=liveRow?.event?.snapshots;
      const latest=Array.isArray(snapshots)&&snapshots.length?snapshots[snapshots.length-1]:null;
      const panel=ensureSiriusPanel(card);
      if(!liveRow||!latest){panel.hidden=true;return;}
      panel.hidden=false;
      panel.querySelector('[data-sirius-state]').textContent='LIVE DATA';
      panel.querySelector('[data-sirius-score]').textContent=Array.isArray(liveRow.score)&&finite(liveRow.score[0])&&finite(liveRow.score[1])?`${Number(liveRow.score[0])} : ${Number(liveRow.score[1])}`:'— : —';
      panel.querySelector('[data-sirius-minute]').textContent=finite(liveRow.minute)?`${Number(liveRow.minute)}′`:'LIVE';
      panel.querySelector('[data-sirius-home]').textContent=item.home||'HOME';
      panel.querySelector('[data-sirius-away]').textContent=item.away||'AWAY';
      setMetric(panel,'attacks',latest.attacks);
      setMetric(panel,'dangerous',latest.dangerous);
      setMetric(panel,'corner',latest.corner);
      drawPressure(panel,snapshots);
      setAnalysis(panel,latest,snapshots);
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
    const [trackerState,liveState]=await Promise.allSettled([getJson(TRACKER),getJson(LIVE_FEED)]);
    const records=trackerState.status==='fulfilled'&&Array.isArray(trackerState.value?.records)?trackerState.value.records:[];
    const matches=liveState.status==='fulfilled'&&Array.isArray(liveState.value?.matches)?liveState.value.matches:[];
    if(trackerState.status==='rejected')console.warn('Prediction3 live tracking unavailable; keeping local kickoff display.',trackerState.reason);
    if(liveState.status==='rejected')console.warn('Sirius live analytics unavailable; keeping Prediction3 card compact.',liveState.reason);
    applyToday(records);
    applyResults(records);
    applySirius(records,matches);
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
