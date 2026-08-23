(()=>{
  const summary=document.querySelector('.panel-head .muted');
  if(!summary)return;

  const colorize=()=>{
    if(summary.querySelector('.stats-win,.stats-loss,.stats-push'))return;
    const text=(summary.textContent||'').trim();
    const match=text.match(/^WIN\s+(\d+)\s*·\s*LOSS\s+(\d+)\s*·\s*PUSH\s+(\d+)$/i);
    if(!match)return;

    summary.innerHTML=`<span class="stats-win" style="color:var(--green);font-weight:900">WIN ${match[1]}</span> · <span class="stats-loss" style="color:#ff8b8b;font-weight:900">LOSS ${match[2]}</span> · <span class="stats-push" style="color:var(--muted);font-weight:900">PUSH ${match[3]}</span>`;
  };

  new MutationObserver(colorize).observe(summary,{childList:true,subtree:true,characterData:true});
  colorize();
})();
