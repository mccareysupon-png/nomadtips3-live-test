(()=>{
  'use strict';

  const LEDGER='data/ledger.json?v=20260906-prematch-gold-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const clamp=value=>Math.max(0,Math.min(100,Number(value)||0));

  async function getJson(url){
    const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function metricRow(metric){
    if(!metric||!finite(metric.home)||!finite(metric.away))return '';
    const home=Number(metric.home),away=Number(metric.away);
    const max=finite(metric.max)&&Number(metric.max)>0?Number(metric.max):Math.max(Math.abs(home),Math.abs(away),1);
    const homeWidth=clamp(Math.max(0,home)/max*100);
    const awayWidth=clamp(Math.max(0,away)/max*100);
    const homeText=metric.homeText??String(home);
    const awayText=metric.awayText??String(away);
    return `<div class="p3-hist-row">
      <div class="p3-hist-values"><strong>${esc(homeText)}</strong><span>${esc(metric.label||'STAT')}</span><strong>${esc(awayText)}</strong></div>
      <div class="p3-hist-bars" aria-hidden="true"><i class="p3-hist-half home"><b style="width:${homeWidth.toFixed(1)}%"></b></i><i class="p3-hist-half away"><b style="width:${awayWidth.toFixed(1)}%"></b></i></div>
    </div>`;
  }

  function coin(label,value){
    if(value===null||value===undefined||value==='')return '';
    return `<div class="p3-gold-coin"><div class="p3-gold-coin-face"><span>${esc(label)}</span><strong>${esc(value)}</strong></div></div>`;
  }

  function panelHtml(item){
    const stats=item?.historicalStats||{};
    const metrics=Array.isArray(stats.metrics)?stats.metrics.filter(row=>finite(row?.home)&&finite(row?.away)):[];
    const why=Array.isArray(item?.why)&&item.why.length?item.why[0]:'Pre-match edge remains under analyst review.';
    const tactical=Array.isArray(item?.tactical)&&item.tactical.length?item.tactical[0]:'Tactical reading pending final team confirmation.';
    const gate=item?.finalCall||'FINAL CHECK REQUIRED';
    const indicators=[
      coin('GRADE',item?.grade||'—'),
      coin('CONFIDENCE',item?.confidenceLabel||'—'),
      coin('RISK',item?.risk||'—'),
      coin('VIEW',item?.nomadView||'—')
    ].join('');
    const history=metrics.length?`<div class="p3-historical-gold">
      <div class="p3-history-head"><strong>HISTORICAL STATS</strong><small>${esc(stats.sampleLabel||'RECENT FORM SAMPLE')}</small></div>
      ${metrics.map(metricRow).join('')}
      <p class="p3-history-note">${esc(stats.note||'Structured pre-match sample only. Live match data is shown separately after kick-off.')}</p>
    </div>`:'';

    return `<section class="p3-prematch-gold" aria-label="Sirius pre-match analysis">
      <div class="p3-prematch-head"><div><span>SIRIUS PRE-MATCH</span><strong>Golden Match Tablet</strong></div><small>PRE-MATCH ONLY · SEPARATE FROM LIVE DATA</small></div>
      <div class="p3-prematch-layout">
        <div class="p3-gold-stone">
          <div class="p3-gold-title">PRE-MATCH ANALYSIS</div>
          <div class="p3-gold-reading"><span>FORM EDGE</span><strong>${esc(why)}</strong></div>
          <div class="p3-gold-reading"><span>TACTICAL READ</span><strong>${esc(tactical)}</strong></div>
          <div class="p3-gold-gate"><span>FINAL GATE</span><strong>${esc(gate)}</strong></div>
        </div>
        <div class="p3-prematch-right">
          ${history}
          <div class="p3-key-coins"><div class="p3-key-coins-title">KEY INDICATORS</div><div class="p3-gold-coins">${indicators}</div></div>
        </div>
      </div>
    </section>`;
  }

  function mount(today){
    const cards=[...document.querySelectorAll('.p3-featured')];
    (Array.isArray(today)?today:[]).forEach((item,index)=>{
      const card=cards[index];
      const host=card?.querySelector('.p3-pick-grid');
      if(!host||host.querySelector('.p3-prematch-gold'))return;
      host.insertAdjacentHTML('beforeend',panelHtml(item));
    });
  }

  async function waitForCards(timeout=12000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      if(document.querySelector('.p3-featured,.p3-empty'))return;
      await new Promise(resolve=>setTimeout(resolve,80));
    }
  }

  async function boot(){
    try{
      const data=await getJson(LEDGER);
      await waitForCards();
      mount(data?.today);
    }catch(error){
      console.warn('Prediction3 pre-match presentation unavailable; base card remains unchanged.',error);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
