(()=>{
  const tabs=[...document.querySelectorAll('.tabs .tab')];
  const list=document.querySelector('.match-list');
  const search=document.querySelector('.search input');
  if(!tabs.length||!list)return;

  const STORE='nomad341LiveFilterV1';
  const valid=new Set(['ALL','SIGNAL','NEAR','WATCHING']);
  const tabName=tab=>String(tab?.textContent||'').trim().toUpperCase();
  const signalOrder=new Map();
  let nextSignalOrder=0;
  let selected='ALL';

  // Prevent browser scroll anchoring from following newly inserted/reordered live cards.
  list.style.overflowAnchor='none';

  try{
    const saved=String(localStorage.getItem(STORE)||'').toUpperCase();
    if(valid.has(saved))selected=saved;
  }catch{}

  const persist=()=>{try{localStorage.setItem(STORE,selected);}catch{}};
  const syncTabs=()=>{
    for(const tab of tabs){
      const active=tabName(tab)===selected;
      tab.dataset.active=active?'1':'0';
      tab.setAttribute('aria-pressed',active?'true':'false');
      tab.style.color=active?'var(--yellow)':'';
      tab.style.cursor='pointer';
    }
  };
  const apply=()=>{
    syncTabs();
    const q=String(search?.value||'').trim().toLowerCase();
    const rows=[...list.querySelectorAll('.match-wrap')];

    if(selected==='SIGNAL'){
      for(const row of rows){
        const state=String(row.dataset.state||'').toUpperCase();
        const locked=String(row.dataset.signalStatus||'').toUpperCase()==='LOCKED';
        if(state!=='SIGNAL'&&!locked){row.style.order='';continue;}
        const id=String(row.dataset.matchId||row.dataset.search||'');
        if(!signalOrder.has(id))signalOrder.set(id,nextSignalOrder++);
        row.style.order=String(signalOrder.get(id));
      }
    }else{
      for(const row of rows)row.style.order='';
    }

    for(const row of rows){
      const state=String(row.dataset.state||'').toUpperCase();
      const locked=String(row.dataset.signalStatus||'').toUpperCase()==='LOCKED';
      const stateOk=selected==='ALL'||(selected==='SIGNAL'?(locked||state==='SIGNAL'):selected==='NEAR'?state==='NEAR SIGNAL':state===selected);
      const searchOk=!q||String(row.dataset.search||'').includes(q);
      row.style.display=stateOk&&searchOk?'':'none';
    }
  };

  for(const tab of tabs){
    tab.addEventListener('click',()=>{
      const next=tabName(tab);
      if(valid.has(next)){selected=next;persist();requestAnimationFrame(apply);}
    });
  }
  if(search)search.addEventListener('input',()=>requestAnimationFrame(apply));

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(item=>item.type==='childList'))requestAnimationFrame(apply);
  });
  observer.observe(list,{childList:true,subtree:false});

  syncTabs();
  requestAnimationFrame(apply);
})();
