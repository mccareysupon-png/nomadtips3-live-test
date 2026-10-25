(()=>{
  const realFetch=window.fetch.bind(window);
  let latest=[];
  const safe=v=>String(v??'').trim();
  const val=v=>v===null||v===undefined||v===''?'—':String(v);
  const pair=(m,a,b)=>`${val(m[a])}/${val(m[b])}`;
  const statsText=m=>[
    `A ${pair(m,'homeAttacks','awayAttacks')}`,
    `DA ${pair(m,'homeDangerousAttacks','awayDangerousAttacks')}`,
    `S ${pair(m,'homeShots','awayShots')}`,
    `SOT ${pair(m,'homeShotsOnTarget','awayShotsOnTarget')}`,
    `C ${pair(m,'homeCorners','awayCorners')}`,
    `P ${pair(m,'homePossession','awayPossession')}`
  ].join(' · ');
  window.fetch=async function(input,init){
    const response=await realFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!/\/api\/feed(?:\?|$)/.test(url))return response;
      const data=await response.clone().json();
      if(Array.isArray(data?.matches)){latest=data.matches;queueMicrotask(enrich);}
    }catch{}
    return response;
  };
  function ensureHeaders(){
    const row=document.querySelector('#matchRows')?.closest('table')?.querySelector('thead tr');if(!row)return;
    if(row.querySelector('[data-rich-head]'))return;
    for(const text of ['Stats H/A','Coverage','Events / Markets']){const th=document.createElement('th');th.dataset.richHead='1';th.textContent=text;row.appendChild(th);}
  }
  function enrich(){
    ensureHeaders();
    const body=document.querySelector('#matchRows');if(!body)return;
    const rows=[...body.querySelectorAll('tr')];
    if(rows.length===1&&rows[0].querySelector('.empty')){const td=rows[0].querySelector('td');if(td)td.colSpan=12;return;}
    rows.forEach((tr,i)=>{
      if(tr.querySelector('[data-rich-cell]'))return;
      const m=latest[i]||{};
      const cells=[statsText(m),`${m.statsCoverage??0}/${m.statsCoverageMax??12}`,`${m.eventCount??0} / ${m.marketCount??0}`];
      for(const text of cells){const td=document.createElement('td');td.dataset.richCell='1';td.className='muted';td.textContent=text;tr.appendChild(td);}
      tr.title=`Football confidence: ${m.footballConfidence??'—'} · live: ${Boolean(m.isLive)} · virtual: ${Boolean(m.isVirtual)}`;
    });
  }
  const observer=new MutationObserver(()=>queueMicrotask(enrich));
  window.addEventListener('DOMContentLoaded',()=>{ensureHeaders();const body=document.querySelector('#matchRows');if(body)observer.observe(body,{childList:true,subtree:true});enrich();});
})();
