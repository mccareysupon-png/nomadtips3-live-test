(()=>{
  'use strict';

  const CONFIG_URL='data/xbet-links.json?v=20260909-affiliate-team-v1';
  const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');

  function findCard(home,away){
    const h=norm(home),a=norm(away);
    return [...document.querySelectorAll('#predictionList .p3-featured')].find(card=>{
      const names=[...card.querySelectorAll('.p3-team strong')].map(el=>norm(el.textContent));
      return names.includes(h)&&names.includes(a);
    })||null;
  }

  function findTeamName(card,team){
    const wanted=norm(team);
    return [...card.querySelectorAll('.p3-team strong')].find(el=>norm(el.textContent)===wanted)||null;
  }

  function routeThroughAffiliate(anchor,entry){
    anchor.addEventListener('click',event=>{
      const affiliate=anchor.dataset.affiliate;
      const target=anchor.dataset.target;
      const deep=anchor.dataset.deep;
      if(deep){
        anchor.href=deep;
        return;
      }
      if(!affiliate||!target)return;
      event.preventDefault();
      const popup=window.open(affiliate,'_blank');
      if(!popup){
        window.location.href=affiliate;
        return;
      }
      window.setTimeout(()=>{
        try{ popup.location.href=target; }
        catch(_){ window.open(target,'_blank','noopener,noreferrer'); }
      },1800);
    });
  }

  function decorateName(strong,entry,affiliate){
    if(!strong||strong.closest('.p3-team-xbet-link'))return false;
    const anchor=document.createElement('a');
    anchor.className='p3-team-xbet-link';
    anchor.href=entry.affiliate_deep_link||affiliate.entry_url||'#';
    anchor.target='_blank';
    anchor.rel='nofollow sponsored';
    anchor.dataset.affiliate=affiliate.entry_url||'';
    anchor.dataset.target=entry.target_url||'';
    anchor.dataset.deep=entry.affiliate_deep_link||'';
    anchor.setAttribute('aria-label',`Open ${entry.home} vs ${entry.away} on 1xBet`);
    anchor.setAttribute('title','เปิดคู่นี้ใน 1xBet');
    strong.replaceWith(anchor);
    anchor.appendChild(strong);
    routeThroughAffiliate(anchor,entry);
    return true;
  }

  function apply(config){
    const links=config?.links||{};
    const affiliate=config?.affiliate||{};
    let count=0;
    Object.values(links).forEach(entry=>{
      const card=findCard(entry.home,entry.away);
      if(!card)return;
      const selected=entry.selected_team||null;
      if(selected){
        if(decorateName(findTeamName(card,selected),entry,affiliate))count+=1;
        return;
      }
      // O/U or BTTS has no selected team: keep the match reachable without adding a visible button.
      [...card.querySelectorAll('.p3-team strong')].forEach(strong=>{
        if(decorateName(strong,entry,affiliate))count+=1;
      });
    });
    return count;
  }

  async function boot(){
    let config;
    try{
      const response=await fetch(CONFIG_URL,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      config=await response.json();
    }catch(error){
      console.warn('Prediction3 1xBet link config unavailable',error);
      return;
    }

    if(apply(config)>0)return;
    const host=document.getElementById('predictionList');
    if(!host)return;
    const observer=new MutationObserver(()=>{
      if(apply(config)>0)observer.disconnect();
    });
    observer.observe(host,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
