(()=>{
  const pill=document.querySelector('.source-pill');
  if(!pill)return;

  const apply=()=>{
    const text=(pill.textContent||'').trim().replace(/\s+/g,' ');
    const next=text
      .replace(/\s*·\s*(?:TotalCorner|Nowgoal|Goaloo|Odds-API\.io|The Odds API|API-Football|Oddspedia).*$/i,'')
      .replace(/SOURCE WAIT/gi,'WAIT')
      .replace(/ENGINE OFFLINE/gi,'OFFLINE');
    if(next!==text){
      const dot=pill.querySelector('.dot')?.outerHTML||'<span class="dot"></span>';
      pill.innerHTML=`${dot}${next}`;
    }
  };

  new MutationObserver(apply).observe(pill,{childList:true,subtree:true,characterData:true});
  apply();
})();
