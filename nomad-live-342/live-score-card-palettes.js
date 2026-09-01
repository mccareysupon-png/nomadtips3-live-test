(()=>{
  'use strict';

  // Presentation-only deterministic palette assignment for Live Score event cards.
  // No network requests, timers, feed reads, odds reads, market logic or event logic.
  const PALETTES=[
    {home:'#69d17d',homeRgb:'105,209,125',away:'#e45f66',awayRgb:'228,95,102'},
    {home:'#38bdf8',homeRgb:'56,189,248',away:'#f59e0b',awayRgb:'245,158,11'},
    {home:'#f4c95d',homeRgb:'244,201,93',away:'#9b6bff',awayRgb:'155,107,255'},
    {home:'#a3e635',homeRgb:'163,230,53',away:'#ec4899',awayRgb:'236,72,153'},
    {home:'#60a5fa',homeRgb:'96,165,250',away:'#fb7185',awayRgb:'251,113,133'},
    {home:'#6ee7b7',homeRgb:'110,231,183',away:'#fbbf24',awayRgb:'251,191,36'},
    {home:'#a78bfa',homeRgb:'167,139,250',away:'#22d3ee',awayRgb:'34,211,238'},
    {home:'#4f8ef7',homeRgb:'79,142,247',away:'#f472b6',awayRgb:'244,114,182'},
    {home:'#2dd4bf',homeRgb:'45,212,191',away:'#f43f5e',awayRgb:'244,63,94'},
    {home:'#facc15',homeRgb:'250,204,21',away:'#6366f1',awayRgb:'99,102,241'},
    {home:'#34d399',homeRgb:'52,211,153',away:'#d97706',awayRgb:'217,119,6'},
    {home:'#7dd3fc',homeRgb:'125,211,252',away:'#c026d3',awayRgb:'192,38,211'}
  ];

  const stableHash=value=>{
    const text=String(value??'');
    let hash=2166136261;
    for(let i=0;i<text.length;i++){
      hash^=text.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return hash>>>0;
  };

  const decorate=card=>{
    if(!card)return;
    const matchId=String(card.dataset.matchId||'').trim();
    if(!matchId)return;
    const index=stableHash(matchId)%PALETTES.length;
    const palette=PALETTES[index];
    const paletteId=String(index+1).padStart(2,'0');
    if(card.dataset.nomadPalette===paletteId)return;

    card.dataset.nomadPalette=paletteId;
    card.style.setProperty('--match-home',palette.home);
    card.style.setProperty('--match-home-rgb',palette.homeRgb);
    card.style.setProperty('--match-away',palette.away);
    card.style.setProperty('--match-away-rgb',palette.awayRgb);
    card.style.setProperty('--match-draw','#4b514e');
    card.style.setProperty('--match-draw-rgb','75,81,78');
  };

  const decorateAll=()=>{
    document.querySelectorAll('#matchList .event-compact[data-match-id]').forEach(decorate);
  };

  const start=()=>{
    if(document.body?.dataset?.page!=='live')return;
    const list=document.getElementById('matchList');
    if(!list)return;
    let queued=false;
    const queue=()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{
        queued=false;
        decorateAll();
      });
    };
    new MutationObserver(queue).observe(list,{childList:true,subtree:true});
    decorateAll();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
