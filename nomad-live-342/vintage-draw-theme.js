(()=>{
  'use strict';

  const HOME_COLORS=[
    '#d86f78','#72c28b','#6e9ed8','#d16c76','#cd6b7d','#df7c34',
    '#a882bd','#c95d64','#d0a43e','#6fb6bc','#9ca65e','#6c92df'
  ];
  const AWAY_COLORS=[
    '#e6d7b3','#e5dcc0','#d8ae4b','#8eb9c5','#62b7bf','#b8b9b4',
    '#d7c397','#a7cfad','#6d8fc5','#b8676d','#e7dfc8','#cc676d'
  ];
  const DRAW_COLORS=[
    '#5faeb6', // 01 Aged Turquoise
    '#b57bc4', // 02 Dusty Orchid
    '#c778a6', // 03 Rose Mauve
    '#9eaa5c', // 04 Antique Olive
    '#c9b255', // 05 Old Brass
    '#718eb8', // 06 Slate Blue
    '#5fa88f', // 07 Aged Sea Green
    '#8975b7', // 08 Dusty Violet
    '#b86fa0', // 09 Mauve Plum
    '#a9ad58', // 10 Moss Gold
    '#6f82b8', // 11 Vintage Indigo
    '#cac091'  // 12 Khaki Ivory
  ];

  const rgb=hex=>{
    const value=String(hex||'').replace('#','');
    return [0,2,4].map(i=>Number.parseInt(value.slice(i,i+2),16));
  };
  const distance=(a,b)=>{
    const x=rgb(a),y=rgb(b);
    return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);
  };
  const allColors=[...HOME_COLORS,...AWAY_COLORS,...DRAW_COLORS].map(v=>v.toLowerCase());
  const exactUnique=new Set(allColors).size===36;
  const localDistinct=DRAW_COLORS.every((draw,index)=>
    distance(draw,HOME_COLORS[index])>=70&&distance(draw,AWAY_COLORS[index])>=70
  );

  window.NOMAD342_DRAW_THEME={
    version:'20260902-v1',
    colors:DRAW_COLORS.slice(),
    exactUnique,
    localDistinct
  };

  if(!exactUnique||!localDistinct){
    console.error('[NOMAD342] DRAW palette invariant failed; draw theme disabled.');
    return;
  }

  const decorateCard=card=>{
    if(!card||card.dataset.vintageDrawThemeReady==='1')return;
    const palette=Number(card.dataset.vintagePalette||0);
    if(!Number.isInteger(palette)||palette<1||palette>12)return;
    const index=palette-1;
    const expectedHome=HOME_COLORS[index];
    const expectedAway=AWAY_COLORS[index];
    const draw=DRAW_COLORS[index];
    const currentHome=String(card.style.getPropertyValue('--vt-home')||'').trim().toLowerCase();
    const currentAway=String(card.style.getPropertyValue('--vt-away')||'').trim().toLowerCase();
    if(currentHome&&currentHome!==expectedHome||currentAway&&currentAway!==expectedAway){
      console.error('[NOMAD342] DRAW palette refused: HOME/AWAY palette mismatch.',palette);
      return;
    }
    if(draw===expectedHome||draw===expectedAway){
      console.error('[NOMAD342] DRAW palette refused: duplicate match color.',palette);
      return;
    }
    card.style.setProperty('--vt-draw',draw);
    card.dataset.vintageDrawPalette=String(palette).padStart(2,'0');
    card.dataset.vintageDrawThemeReady='1';
    card.classList.add('vintage-draw-theme-ready');
  };

  const decorateAll=()=>document.querySelectorAll('.event-compact.vintage-theme-ready[data-vintage-palette]').forEach(decorateCard);
  let queued=false;
  const queue=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorateAll()});
  };
  const start=()=>{
    if(document.body?.dataset?.page!=='live')return;
    decorateAll();
    const list=document.getElementById('matchList');
    if(list)new MutationObserver(queue).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-vintage-palette']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
