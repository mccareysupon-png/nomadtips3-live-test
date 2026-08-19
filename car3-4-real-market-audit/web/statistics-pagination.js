(()=>{
  const FALLBACK_WORKER='https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev';
  const PAGE_SIZE=25;
  const PUBLIC_SOURCE='Odds-API.io';
  const CACHE_KEY='nomadtips3.car34.stats.pages.v1';
  let workerUrl=FALLBACK_WORKER;
  let refreshSeconds=15;
  let currentPage=Math.max(1,Number(new URL(location.href).searchParams.get('page'))||1);
  let refreshTimer=null;

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return'—';}};
  const fmtDate=v=>{if(!v)return'—';try{return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v));}catch{return'—';}};
  const fmtLine=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}`:'—';};
  const fmtOdds=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'—';};
  const resultClass=r=>{const x=String(r||'PENDING').toUpperCase();return x==='WIN'?'win':x==='LOSS'?'loss':x==='DRAW'?'draw':'pending';};

  const setError=message=>{const el=$('#pageError');if(!el)return;el.textContent=message||'';el.hidden=!message;};
  const saveCache=(page,payload)=>{try{const cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');cache[page]={savedAt:Date.now(),payload};for(const key of Object.keys(cache))if(Object.keys(cache).length>8)delete cache[key];localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch{}};
  const readCache=page=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')?.[page]?.payload||null;}catch{return null;}};

  const updateSummary=summary=>{
    const pairs=[
      ['total',summary?.total??0],['settled',summary?.settled??0],['win',summary?.win??0],['loss',summary?.loss??0],['draw',summary?.draw??0],
      ['winRate',`${Number(summary?.winRate||0).toFixed(1)}%`],['avgOdds',Number(summary?.averageOdds||0).toFixed(2)],['netUnits',Number(summary?.netUnits||0).toFixed(2)]
    ];
    pairs.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
  };

  const renderRecords=records=>{
    const rows=$('#statsRows');
    if(rows)rows.innerHTML=records.map(r=>`<tr><td>${fmtTime(r.selectedAt)}<br><span class="muted">${esc(r.selectionDate||fmtDate(r.selectedAt))}</span></td><td>${esc(r.home)}<br><span class="muted">${esc(r.away)}</span></td><td class="pick">${esc(r.selectedTeam)}</td><td>${fmtLine(r.selectedLine??r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</td><td>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</td><td><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.settlementResult||r.resultGroup||r.result||'PENDING')}</span></td><td>${PUBLIC_SOURCE}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No statistics yet.</td></tr>';

    const cards=$('#statsCards');
    if(cards)cards.innerHTML=records.map(r=>{const result=r.settlementResult||r.resultGroup||r.result||'PENDING';return`<article class="stats-card"><div class="stats-card-head"><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(result)}</span><span class="muted">${fmtDate(r.selectedAt)} · ${fmtTime(r.selectedAt)}</span></div><h3>${esc(r.home)} vs ${esc(r.away)}</h3><div class="pick-line">${esc(r.selectedTeam)} ${fmtLine(r.selectedLine??r.line)} @ ${fmtOdds(r.odds)}</div><div class="stats-card-meta"><div><small>ENTRY</small><strong>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</strong></div><div><small>FINAL</small><strong>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</strong></div><div><small>SOURCE</small><strong>${PUBLIC_SOURCE}</strong></div></div></article>`;}).join('')||'<div class="empty">No statistics yet.</div>';
  };

  const visiblePages=(current,total)=>{
    if(total<=7)return Array.from({length:total},(_,i)=>i+1);
    const set=new Set([1,total,current-1,current,current+1]);
    if(current<=3){set.add(2);set.add(3);set.add(4);}
    if(current>=total-2){set.add(total-1);set.add(total-2);set.add(total-3);}
    const pages=[...set].filter(p=>p>=1&&p<=total).sort((a,b)=>a-b),out=[];
    pages.forEach((p,i)=>{if(i&&p-pages[i-1]>1)out.push('gap');out.push(p);});
    return out;
  };

  const renderPager=payload=>{
    const pager=$('#statsPager');if(!pager)return;
    const pages=Math.max(1,Number(payload?.pages)||1);
    const total=Math.max(0,Number(payload?.total)||0);
    if(currentPage>pages)currentPage=pages;
    const items=visiblePages(currentPage,pages).map(item=>item==='gap'?'<span class="pager-gap">…</span>':`<button type="button" data-page="${item}" class="${item===currentPage?'active':''}" aria-current="${item===currentPage?'page':'false'}">${item}</button>`).join('');
    pager.innerHTML=`<button type="button" class="pager-arrow" data-page="${Math.max(1,currentPage-1)}" ${currentPage<=1?'disabled':''}>Previous</button>${items}<button type="button" class="pager-arrow" data-page="${Math.min(pages,currentPage+1)}" ${currentPage>=pages?'disabled':''}>Next</button><div class="stats-page-note">Page ${currentPage} of ${pages} · ${PAGE_SIZE} records per page · ${total} total</div>`;
  };

  const setUrl=(page,push)=>{
    const url=new URL(location.href);
    if(page>1)url.searchParams.set('page',String(page));else url.searchParams.delete('page');
    history[push?'pushState':'replaceState']({page},'',url);
  };

  const fetchPage=async(page,{push=false,scroll=false}={})=>{
    page=Math.max(1,Number(page)||1);
    try{
      const response=await fetch(`${workerUrl}/history?page=${page}&limit=${PAGE_SIZE}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      const pages=Math.max(1,Number(payload?.pages)||1);
      if(page>pages)return fetchPage(pages,{push,scroll});
      currentPage=page;
      saveCache(page,payload);
      updateSummary(payload.summary||{});
      renderRecords(Array.isArray(payload.records)?payload.records:[]);
      renderPager(payload);
      setUrl(page,push);
      setError('');
      if(scroll)document.querySelector('.public-section')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }catch(error){
      const cached=readCache(page);
      if(cached){currentPage=page;updateSummary(cached.summary||{});renderRecords(cached.records||[]);renderPager(cached);setUrl(page,push);setError('Live history is temporarily unavailable; showing the last cached page.');return;}
      setError(`Statistics unavailable: ${error.message||error}`);
    }
  };

  const boot=async()=>{
    try{
      const runtime=await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
      workerUrl=runtime.workerUrl||workerUrl;
      refreshSeconds=Math.max(15,Number(runtime.refreshSeconds)||15);
    }catch{}

    const pager=$('#statsPager');
    pager?.addEventListener('click',event=>{
      const button=event.target.closest('button[data-page]');
      if(!button||button.disabled)return;
      fetchPage(Number(button.dataset.page),{push:true,scroll:true});
    });
    addEventListener('popstate',()=>{
      const page=Math.max(1,Number(new URL(location.href).searchParams.get('page'))||1);
      fetchPage(page,{push:false,scroll:false});
    });

    await fetchPage(currentPage,{push:false,scroll:false});
    refreshTimer=setInterval(()=>fetchPage(currentPage,{push:false,scroll:false}),refreshSeconds*1000);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
