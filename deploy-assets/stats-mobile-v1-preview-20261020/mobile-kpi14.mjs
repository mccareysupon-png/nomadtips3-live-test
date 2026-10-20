/* BALL46 Statistics mobile: 14 live source KPI values in exactly 7 columns x 2 rows.
  Source values are mirrored only. Never touches calculations or settlement code. */
export const KPI14_SCRIPT_ID='b46-mobile-stats-14-kpi-7x2-20261020';
export const KPI14_SCRIPT=String.raw`(function(){
 'use strict';
 if(window.__b46Mobile14Kpi7x2Installed)return;
 window.__b46Mobile14Kpi7x2Installed=true;
 const ROOT='.workspace.singlepage .sp-stats-content';
 let prior=null,strip=null,grid=null,detail=null,priorSignature='',selected=-1;
 const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
 const one=(root,sel)=>root.querySelector(sel);
 function values(root){
  const top=[...root.querySelectorAll('.sp-kpis .sp-kpi')];
  const perf=[...root.querySelectorAll('.b46-perf-kpis .b46-perf-kpi')];
  if(top.length!==8||perf.length!==6)return null;
  const items=[
   ...top.map((e,i)=>({i:i+1,label:text(one(e,'span')),value:text(one(e,'strong')),meta:text(one(e,'small'))})),
   ...perf.map((e,i)=>({i:i+9,label:text(one(e,'span')),value:text(one(e,'b')),meta:text(one(e,'small'))}))
  ];
  return items.every(x=>x.label&&x.value)?items:null;
 }
 function clear(){
  if(prior)prior.classList.remove('b46m14-ready');
  if(strip)strip.remove();
  prior=null;strip=null;grid=null;detail=null;priorSignature='';selected=-1;
 }
 function mk(tag,className,parent){
  const e=document.createElement(tag);e.className=className;if(parent)parent.appendChild(e);return e;
 }
 function initialize(root){
  strip=mk('section','b46m14-strip');
  strip.setAttribute('aria-label','14 statistics, seven per row');
  grid=mk('div','b46m14-grid',strip);
  for(let i=0;i<14;i++){
   const card=mk('button','b46m14-card',grid);
   card.type='button';
   card.dataset.index=String(i);
   card.setAttribute('aria-pressed','false');
   mk('span','b46m14-label',card);
   mk('strong','b46m14-value',card);
   card.addEventListener('click',()=>{
    if(selected===i){selected=-1;detail.hidden=true;}
    else{selected=i;const items=values(root);if(items)showDetail(items[i]);}
    refreshSelected();
   });
  }
  detail=mk('div','b46m14-detail',strip);
  detail.hidden=true;
  const hero=one(root,'.sp-stat-hero');
  if(!hero){strip.remove();strip=null;grid=null;detail=null;return false}
  hero.insertAdjacentElement('afterend',strip);
  prior=root;
  return true;
 }
 function refreshSelected(){
  if(!grid)return;
  [...grid.children].forEach((e,i)=>e.setAttribute('aria-pressed',selected===i?'true':'false'));
 }
 function showDetail(item){
  if(!detail||!item)return;
  detail.replaceChildren();
  const label=mk('span','b46m14-detail-label',detail);label.textContent=item.label;
  const value=mk('strong','b46m14-detail-value',detail);value.textContent=item.value;
  if(item.meta){const sub=mk('span','b46m14-detail-meta',detail);sub.textContent=item.meta;}
  detail.hidden=false;
 }
 function update(){
  const root=document.querySelector(ROOT);
  if(root!==prior&&prior)clear();
  if(!root||!window.matchMedia('(max-width:767px)').matches){
   if(prior)clear();
   return;
  }
  const items=values(root);
  if(!items){if(prior)clear();return}
  if(!strip&&!initialize(root))return;
  const signature=items.map(x=>x.label+'\u001e'+x.value+'\u001e'+x.meta).join('\u001f');
  if(priorSignature!==signature){
   if(!grid||grid.children.length!==14){clear();return}
   for(let i=0;i<14;i++){
    const card=grid.children[i],item=items[i];
    card.children[0].textContent=item.label;
    card.children[1].textContent=item.value;
    card.title=item.label+' — '+item.value+(item.meta?' · '+item.meta:'');
    card.setAttribute('aria-label',card.title);
    card.dataset.kpi=String(item.i);
   }
   priorSignature=signature;
   if(selected>=0)showDetail(items[selected]);
  }
  root.classList.add('b46m14-ready');
 }
 const start=()=>{update();setInterval(update,1000);window.addEventListener('resize',update,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;
