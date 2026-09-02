(()=>{
  'use strict';

  const THEMES=[
    {name:'Burgundy / Cream',home:'#d86f78',away:'#e6d7b3',accent:'#d4aa58',homeSoft:'rgba(216,111,120,.105)',awaySoft:'rgba(230,215,179,.085)',homeGlow:'rgba(216,111,120,.24)',awayGlow:'rgba(230,215,179,.18)',line:'rgba(222,190,126,.20)',grid:'rgba(222,190,126,.12)',shirtHome:{base:'#721b24',secondary:'#c99a3f',accent:'#f1d58b',pattern:'pinstripe'},shirtAway:{base:'#e8e1cf',secondary:'#274d83',accent:'#b8a171',pattern:'vertical'}},
    {name:'Forest / Ivory',home:'#72c28b',away:'#e5dcc0',accent:'#d2ae62',homeSoft:'rgba(114,194,139,.10)',awaySoft:'rgba(229,220,192,.08)',homeGlow:'rgba(114,194,139,.22)',awayGlow:'rgba(229,220,192,.17)',line:'rgba(210,174,98,.20)',grid:'rgba(210,174,98,.11)',shirtHome:{base:'#193d2c',secondary:'#e7dec1',accent:'#d8bd76',pattern:'sash'},shirtAway:{base:'#ded6bd',secondary:'#35523c',accent:'#c9ad72',pattern:'hoops'}},
    {name:'Navy / Gold',home:'#6e9ed8',away:'#d8ae4b',accent:'#efd58d',homeSoft:'rgba(110,158,216,.10)',awaySoft:'rgba(216,174,75,.10)',homeGlow:'rgba(110,158,216,.22)',awayGlow:'rgba(216,174,75,.22)',line:'rgba(239,213,141,.20)',grid:'rgba(239,213,141,.11)',shirtHome:{base:'#173f7a',secondary:'#d8ae4b',accent:'#efd58d',pattern:'shoulder'},shirtAway:{base:'#c9972f',secondary:'#1f3459',accent:'#efd68b',pattern:'sash'}},
    {name:'Maroon / Powder Blue',home:'#d16c76',away:'#8eb9c5',accent:'#e5d2a0',homeSoft:'rgba(209,108,118,.10)',awaySoft:'rgba(142,185,197,.10)',homeGlow:'rgba(209,108,118,.22)',awayGlow:'rgba(142,185,197,.22)',line:'rgba(229,210,160,.19)',grid:'rgba(229,210,160,.11)',shirtHome:{base:'#6b2327',secondary:'#8eb9c5',accent:'#e5d2a0',pattern:'half'},shirtAway:{base:'#6f9eaa',secondary:'#e5d2a0',accent:'#f1e1b7',pattern:'plain'}},
    {name:'Wine / Teal',home:'#cd6b7d',away:'#62b7bf',accent:'#d9c58e',homeSoft:'rgba(205,107,125,.10)',awaySoft:'rgba(98,183,191,.10)',homeGlow:'rgba(205,107,125,.22)',awayGlow:'rgba(98,183,191,.22)',line:'rgba(217,197,142,.19)',grid:'rgba(217,197,142,.11)',shirtHome:{base:'#6f1c28',secondary:'#c7913a',accent:'#ecd08a',pattern:'pinstripe'},shirtAway:{base:'#176a73',secondary:'#e3dcc1',accent:'#d9c58e',pattern:'sleeve'}},
    {name:'Burnt Orange / Silver',home:'#df7c34',away:'#b8b9b4',accent:'#f0b45c',homeSoft:'rgba(223,124,52,.11)',awaySoft:'rgba(184,185,180,.08)',homeGlow:'rgba(223,124,52,.24)',awayGlow:'rgba(184,185,180,.18)',line:'rgba(240,180,92,.20)',grid:'rgba(240,180,92,.11)',shirtHome:{base:'#d46920',secondary:'#171817',accent:'#f0b45c',pattern:'chevron'},shirtAway:{base:'#a8aaa5',secondary:'#282927',accent:'#e2d6ae',pattern:'center'}},
    {name:'Plum / Beige',home:'#a882bd',away:'#d7c397',accent:'#c9ad72',homeSoft:'rgba(168,130,189,.10)',awaySoft:'rgba(215,195,151,.09)',homeGlow:'rgba(168,130,189,.22)',awayGlow:'rgba(215,195,151,.20)',line:'rgba(201,173,114,.20)',grid:'rgba(201,173,114,.11)',shirtHome:{base:'#4d2a68',secondary:'#e8dfc6',accent:'#c9ad72',pattern:'chest'},shirtAway:{base:'#d7c397',secondary:'#4f274d',accent:'#b99a6b',pattern:'plain'}},
    {name:'Oxblood / Sage',home:'#c95d64',away:'#a7cfad',accent:'#d7caa7',homeSoft:'rgba(201,93,100,.10)',awaySoft:'rgba(167,207,173,.10)',homeGlow:'rgba(201,93,100,.22)',awayGlow:'rgba(167,207,173,.22)',line:'rgba(215,202,167,.19)',grid:'rgba(215,202,167,.11)',shirtHome:{base:'#7d1d21',secondary:'#1b1b1a',accent:'#cf8751',pattern:'hoops'},shirtAway:{base:'#a7cfad',secondary:'#35523c',accent:'#d7caa7',pattern:'pinstripe'}},
    {name:'Mustard / Royal',home:'#d0a43e',away:'#6d8fc5',accent:'#efd68b',homeSoft:'rgba(208,164,62,.10)',awaySoft:'rgba(109,143,197,.10)',homeGlow:'rgba(208,164,62,.22)',awayGlow:'rgba(109,143,197,.22)',line:'rgba(239,214,139,.20)',grid:'rgba(239,214,139,.11)',shirtHome:{base:'#c9972f',secondary:'#1f3459',accent:'#efd68b',pattern:'sash'},shirtAway:{base:'#1b2b49',secondary:'#e6dcc0',accent:'#c5a666',pattern:'plain'}},
    {name:'Dusty Cyan / Wine',home:'#6fb6bc',away:'#b8676d',accent:'#d4b777',homeSoft:'rgba(111,182,188,.10)',awaySoft:'rgba(184,103,109,.10)',homeGlow:'rgba(111,182,188,.22)',awayGlow:'rgba(184,103,109,.22)',line:'rgba(212,183,119,.20)',grid:'rgba(212,183,119,.11)',shirtHome:{base:'#5fa3aa',secondary:'#e3dcc8',accent:'#d4b777',pattern:'quarters'},shirtAway:{base:'#6c2529',secondary:'#e7dfc8',accent:'#c69f61',pattern:'plain'}},
    {name:'Olive / Ivory',home:'#9ca65e',away:'#e7dfc8',accent:'#c9ad70',homeSoft:'rgba(156,166,94,.10)',awaySoft:'rgba(231,223,200,.08)',homeGlow:'rgba(156,166,94,.22)',awayGlow:'rgba(231,223,200,.17)',line:'rgba(201,173,112,.20)',grid:'rgba(201,173,112,.11)',shirtHome:{base:'#4b5028',secondary:'#151714',accent:'#c7ab67',pattern:'shoulder'},shirtAway:{base:'#e7dfc8',secondary:'#59662e',accent:'#c9ad70',pattern:'center'}},
    {name:'Royal / Brick',home:'#6c92df',away:'#cc676d',accent:'#d9b263',homeSoft:'rgba(108,146,223,.10)',awaySoft:'rgba(204,103,109,.10)',homeGlow:'rgba(108,146,223,.22)',awayGlow:'rgba(204,103,109,.22)',line:'rgba(217,178,99,.20)',grid:'rgba(217,178,99,.11)',shirtHome:{base:'#18356b',secondary:'#a9272d',accent:'#d9b263',pattern:'pinstripe'},shirtAway:{base:'#7f2c30',secondary:'#d1d3d0',accent:'#bda265',pattern:'hoops'}}
  ];

  const hash=value=>{
    let h=2166136261;
    const text=String(value||'nomad');
    for(let i=0;i<text.length;i+=1){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return h>>>0;
  };

  const patternMarkup=(type,secondary,accent)=>{
    switch(type){
      case'vertical':return `<g fill="${secondary}"><rect x="20" y="7" width="5" height="53"/><rect x="30" y="6" width="5" height="54"/><rect x="40" y="7" width="5" height="53"/></g>`;
      case'hoops':return `<g fill="${secondary}"><rect x="7" y="18" width="50" height="7"/><rect x="11" y="32" width="42" height="7"/><rect x="18" y="46" width="28" height="7"/></g>`;
      case'half':return `<rect x="32" y="4" width="31" height="57" fill="${secondary}"/>`;
      case'chest':return `<rect x="8" y="25" width="48" height="10" fill="${secondary}"/><rect x="8" y="35" width="48" height="1.5" fill="${accent}" opacity=".75"/>`;
      case'sash':return `<polygon points="8,17 15,11 54,49 47,56" fill="${secondary}"/><polygon points="11,13 14,11 54,50 51,53" fill="${accent}" opacity=".7"/>`;
      case'chevron':return `<path d="M8 18 32 38 56 18 52 13 32 30 12 13Z" fill="${secondary}"/><path d="M13 14 32 30 51 14" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".72"/>`;
      case'pinstripe':return `<g stroke="${secondary}" stroke-width="1.4" opacity=".9"><path d="M21 8V58"/><path d="M27 6V59"/><path d="M33 6V59"/><path d="M39 6V59"/><path d="M45 8V58"/></g>`;
      case'sleeve':return `<polygon points="7,14 22,7 22,20 12,26" fill="${secondary}"/><polygon points="42,7 57,14 52,26 42,20" fill="${secondary}"/><path d="M21 8H43" stroke="${accent}" stroke-width="1.5" opacity=".7"/>`;
      case'shoulder':return `<path d="M9 14 22 7H42L55 14 50 22 42 18H22L14 22Z" fill="${secondary}"/><path d="M18 10H46" stroke="${accent}" stroke-width="1.4" opacity=".72"/>`;
      case'center':return `<rect x="28" y="5" width="8" height="55" fill="${secondary}"/><rect x="27" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/><rect x="36" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/>`;
      case'quarters':return `<rect x="32" y="4" width="31" height="28" fill="${secondary}"/><rect x="1" y="32" width="31" height="29" fill="${secondary}"/><path d="M32 5V59M8 32H56" stroke="${accent}" stroke-width="1.2" opacity=".55"/>`;
      default:return `<path d="M18 21H46" stroke="${secondary}" stroke-width="1.2" opacity=".45"/>`;
    }
  };

  const shirtSvg=(def,seed)=>{
    const shape='M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    const a=(seed%13)+2,b=(seed%7)+3;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="c"><path d="${shape}"/></clipPath><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".30"/></linearGradient><pattern id="g" width="${a}" height="${b}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#fff" opacity=".055"/><circle cx="${Math.max(2,a-2)}" cy="${Math.max(2,b-2)}" r=".45" fill="#000" opacity=".07"/></pattern></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${def.base}"/>${patternMarkup(def.pattern,def.secondary,def.accent)}<rect width="64" height="64" fill="url(#s)"/><rect width="64" height="64" fill="url(#g)"/></g><path d="${shape}" fill="none" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/><path d="${shape}" fill="none" stroke="${def.accent}" stroke-opacity=".52" stroke-width=".72" stroke-linejoin="round"/><path d="M27 5 32 12 37 5" fill="#11130f" stroke="${def.accent}" stroke-width="1.05"/><path d="M28 6.2 32 10.5 36 6.2" fill="${def.secondary}" opacity=".88"/></svg>`;
  };
  const shirtUri=(def,seed)=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(shirtSvg(def,seed))}`;

  const themeIndex=card=>{
    const forced=Number(card?.dataset?.vintagePalette||0);
    if(Number.isInteger(forced)&&forced>=1&&forced<=THEMES.length)return forced-1;
    return hash(card?.dataset?.matchId||card?.textContent||'nomad')%THEMES.length;
  };

  const decorateTeam=(strong,side,def,seed)=>{
    if(!strong||strong.dataset.vintageTeamReady==='1')return;
    const name=String(strong.textContent||'').trim();
    strong.dataset.vintageTeamReady='1';
    strong.dataset.vintageTeamName=name;
    strong.classList.add('vintage-team',`vintage-team-${side}`);
    strong.textContent='';
    const img=document.createElement('img');
    img.className='vintage-team-shirt';
    img.alt='';img.setAttribute('aria-hidden','true');img.draggable=false;img.src=shirtUri(def,seed);
    const label=document.createElement('span');
    label.className='vintage-team-name';label.textContent=name;label.title=name;
    if(side==='home')strong.append(img,label);else strong.append(label,img);
  };

  const decorateCard=card=>{
    if(!card||card.dataset.vintageThemeReady==='1')return;
    const teams=card.querySelectorAll('.teams-line strong');
    if(teams.length<2)return;
    const index=themeIndex(card),theme=THEMES[index],key=card.dataset.matchId||`${teams[0].textContent}|${teams[1].textContent}`,seed=hash(`${key}|${index}`);
    card.dataset.vintageThemeReady='1';
    card.dataset.vintagePalette=String(index+1).padStart(2,'0');
    card.dataset.vintagePaletteName=theme.name;
    const vars={
      '--vt-home':theme.home,'--vt-away':theme.away,'--vt-accent':theme.accent,
      '--vt-home-soft':theme.homeSoft,'--vt-away-soft':theme.awaySoft,
      '--vt-home-glow':theme.homeGlow,'--vt-away-glow':theme.awayGlow,
      '--vt-line':theme.line,'--vt-grid':theme.grid
    };
    for(const [name,value] of Object.entries(vars))card.style.setProperty(name,value);
    card.classList.add('vintage-theme-ready');
    decorateTeam(teams[0],'home',theme.shirtHome,seed);
    decorateTeam(teams[teams.length-1],'away',theme.shirtAway,seed+17);
  };

  const decorateAll=()=>document.querySelectorAll('.event-compact[data-match-id]').forEach(decorateCard);
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
    if(list)new MutationObserver(queue).observe(list,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
