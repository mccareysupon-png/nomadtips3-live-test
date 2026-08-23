(()=>{
  const pill=document.querySelector('.source-pill');
  if(!pill)return;

  const apply=()=>{
    const text=(pill.textContent||'').trim().replace(/\s+/g,' ');
    if(text==='LIVE DATA · LIVE'){
      const dot=pill.querySelector('.dot')?.outerHTML||'<span class="dot"></span>';
      pill.innerHTML=`${dot}LIVE DATA · LIVE · TotalCorner`;
    }
  };

  new MutationObserver(apply).observe(pill,{childList:true,subtree:true,characterData:true});
  apply();
})();
