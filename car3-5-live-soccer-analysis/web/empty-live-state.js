(()=>{
  const hero=document.getElementById('noLiveHero');
  const layout=document.getElementById('liveLayout');
  const count=document.getElementById('liveCount');
  const updated=document.getElementById('lastUpdated');
  if(!hero||!layout||!count||!updated)return;

  let zeroStreak=0;
  let lastSuccessStamp='';

  const showLive=()=>{
    zeroStreak=0;
    hero.hidden=true;
    layout.hidden=false;
  };

  const confirmSuccessfulScan=()=>{
    const stamp=String(updated.textContent||'').trim();
    if(!stamp.startsWith('Updated ')||stamp===lastSuccessStamp)return;
    lastSuccessStamp=stamp;

    const live=Number(count.textContent);
    if(Number.isFinite(live)&&live>0){
      showLive();
      return;
    }

    if(Number.isFinite(live)&&live===0){
      zeroStreak+=1;
      if(zeroStreak>=3){
        hero.hidden=false;
        layout.hidden=true;
      }
    }
  };

  new MutationObserver(()=>{
    const live=Number(count.textContent);
    if(Number.isFinite(live)&&live>0)showLive();
  }).observe(count,{childList:true,characterData:true,subtree:true});

  new MutationObserver(confirmSuccessfulScan).observe(updated,{childList:true,characterData:true,subtree:true});
  queueMicrotask(confirmSuccessfulScan);
})();
