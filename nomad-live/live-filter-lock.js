(()=>{
  const tabs=[...document.querySelectorAll('.tabs .tab')];
  const list=document.querySelector('.match-list');
  const search=document.querySelector('.search input');
  if(!tabs.length||!list)return;

  const STORE='nomad341LiveFilterV1';
  const valid=new Set(['ALL','SIGNAL','NEAR','WATCHING']);
  const tabName=tab=>String(tab?.textContent||'').trim().toUpperCase();
  let selected='ALL';
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
    }
  };
  const apply=()=>{
    syncTabs();
    const q=String(search?.value||'').trim().toLowerCase();
    for(const row of list.querySelectorAll('.match-wrap')){
      const state=String(row.dataset.state||'').toUpperCase();
      const stateOk=selected==='ALL'||(selected==='NEAR'?state==='NEAR SIGNAL':state===selected);
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
