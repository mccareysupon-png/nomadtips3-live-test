(()=>{
'use strict';
const markets=new Set(['all','1x2','ah','ou','btts','corners','cards','other']);
function artwork(){
 const hero=document.querySelector('.workspace-panel[data-workspace-panel="statistics"] .sp-stat-hero');if(!hero)return;
 const active=document.querySelector('[data-stat-market].active,[data-stat-market][aria-selected="true"],[data-stat-market][aria-pressed="true"]');
 let key=active?.dataset.statMarket;
 if(!markets.has(key)){const title=hero.querySelector('h3')?.textContent||'';key=/^1X2/.test(title)?'1x2':/^AH/.test(title)?'ah':/Over \/ Under/.test(title)?'ou':/^BTTS/.test(title)?'btts':/^Corners/.test(title)?'corners':/^Cards/.test(title)?'cards':/^Other/.test(title)?'other':'all';}
 if(hero.dataset.b46Art!==key){hero.dataset.b46Art=key;hero.style.setProperty('--b46-market-art','url("/b46-stat-art-'+(key==='all'?'total':key)+'-20261030.webp")');}
}
function eventKey(title){const t=(title.split(' · ')[1]||'').toLowerCase();if(/second.*yellow|yellow.*red/.test(t))return'second-yellow';if(/penalty/.test(t))return'penalty';if(/goal/.test(t)&&!/kick|disallow|cancel/.test(t))return'goal';if(/corner/.test(t))return'corner';if(/yellow/.test(t))return'yellow-card';if(/red/.test(t))return'red-card';if(/sub/.test(t))return'substitution';if(/var/.test(t))return'var';if(/offside/.test(t))return'offside';if(/injur/.test(t))return'injury';return null;}
function icons(){
 // Only live match detail graphs; Signals rendering is preserved.
 for(const svg of document.querySelectorAll('.match-expanded .expand-flow-chart svg,#b46gn-detail .b46gn-event-flow .expand-flow-chart svg')){
  const matrix=svg.getScreenCTM();if(!matrix||!matrix.a||!matrix.d)continue;
  const sx=Math.hypot(matrix.a,matrix.b),sy=Math.hypot(matrix.c,matrix.d);if(sx<=0||sy<=0)continue;
  for(const g of svg.querySelectorAll('[data-b46-event-icon="1"]')){
   const title=g.querySelector('title')?.textContent||'',key=eventKey(title);if(!key)continue;
   const original=g.dataset.b46OriginalTransform||g.getAttribute('transform')||'';
   const signature=key+':'+sx.toFixed(3)+':'+sy.toFixed(3);if(g.dataset.b46VisualSignature===signature)continue;
   g.dataset.b46OriginalTransform=original;g.dataset.b46VisualSignature=signature;
   g.setAttribute('transform',original+' scale('+(1/sx)+' '+(1/sy)+')');
   const circle=g.querySelector('circle');if(circle){circle.setAttribute('r','10');circle.setAttribute('fill','#10271f');circle.setAttribute('stroke-width','1.4');}
   g.querySelector('text')?.remove();let image=g.querySelector('image');if(!image){image=document.createElementNS('http://www.w3.org/2000/svg','image');g.append(image);}
   image.setAttribute('href','/b46-event-'+key+'-20261030.svg');image.setAttribute('x','-10');image.setAttribute('y','-10');image.setAttribute('width','20');image.setAttribute('height','20');image.setAttribute('preserveAspectRatio','xMidYMid meet');
  }
 }
}
function mobile(){
 if(!matchMedia('(max-width:760px)').matches)return;
 const body=document.querySelector('#b46gn-detail[aria-hidden="false"] [data-b46gn-detailbody]');if(!body)return;
 const summary=body.querySelector(':scope > .b46gn-featured:not(.b46-suite-stats)'),featured=summary?.querySelector('.featured-card[data-featured]');
 if(!summary||!featured)return;
 summary.classList.add('b46-suite-summary');summary.id='b46-suite-summary';
 const flow=body.querySelector(':scope > .b46gn-event-flow'),markets=body.querySelector(':scope > .b46gn-full-market');
 if(flow)flow.id='b46-suite-flow';if(markets)markets.id='b46-suite-markets';
 let stats=body.querySelector(':scope > .b46-suite-stats');
 const pieces=[...featured.children].filter(n=>n.matches('.feature-stats,.feature-events'));
 if(pieces.length){if(!stats){stats=document.createElement('section');stats.className='b46gn-featured b46-suite-stats';stats.id='b46-suite-stats';const card=document.createElement('div');card.className=featured.className;card.setAttribute('data-featured','');stats.append(card);body.append(stats);}for(const piece of pieces)stats.firstElementChild.append(piece);}
 let nav=body.querySelector(':scope > .b46-suite-nav');if(!nav){nav=document.createElement('nav');nav.className='b46-suite-nav';nav.setAttribute('aria-label','Match detail sections');for(const [label,id] of [['Summary','summary'],['Event Flow','flow'],['Stats','stats'],['Markets','markets']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.b46Section=id;button.addEventListener('click',()=>{const target=body.querySelector('#b46-suite-'+id);if(target)target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});nav.append(button);}body.prepend(nav);}
 for(const button of nav.querySelectorAll('button'))button.disabled=!body.querySelector('#b46-suite-'+button.dataset.b46Section);
 const expected=[summary,flow,stats,markets].filter(Boolean),actual=[...body.children].filter(n=>expected.includes(n));
 if(actual.some((n,i)=>n!==expected[i]))for(const n of expected)body.append(n);
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;artwork();mobile();icons();});}
function boot(){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-hidden','class']});window.addEventListener('resize',schedule,{passive:true});document.addEventListener('click',schedule);schedule();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
