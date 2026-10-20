export const RIBBON_MARKER='b46-statistics-v23-single-row-14-20261020';
export const RIBBON_SCRIPT=String.raw`(function(){
 'use strict';
 if(window.__b46StatisticsV23SingleRowInstalled)return;
 window.__b46StatisticsV23SingleRowInstalled=true;
 let lastRoot=null,lastSignature='';
 const read=(node,selector)=>node?.querySelector(selector)?.textContent?.trim()||'';
 function originalItems(root){
  const top=[...root.querySelectorAll('.sp-kpis .sp-kpi')];
  const performance=[...root.querySelectorAll('.b46-perf-kpis .b46-perf-kpi')];
  if(top.length!==8||performance.length!==6)return null;
  return [
   ...top.map((e,i)=>({index:i+1,label:read(e,'span'),value:read(e,'strong'),meta:read(e,'small')})),
   ...performance.map((e,i)=>({index:i+9,label:read(e,'span'),value:read(e,'b'),meta:read(e,'small')}))
  ];
 }
 function makeCard(item){
  const el=document.createElement('div');
  el.className='b46v23-micro-card';
  el.dataset.kpiIndex=String(item.index);
  const label=document.createElement('span');label.className='b46v23-label';
  const value=document.createElement('strong');value.className='b46v23-value';
  const meta=document.createElement('small');meta.className='b46v23-meta';
  el.append(label,value,meta);return el;
 }
 function reset(root){
  if(root)root.classList.remove('b46v23-ready');
  root?.querySelector('.b46v23-strip')?.remove();
  lastRoot=null;lastSignature='';
 }
 function sync(){
  const root=document.querySelector('.workspace.singlepage .sp-stats-content');
  if(lastRoot&&root!==lastRoot)reset(lastRoot);
  if(!root)return;
  if(!window.matchMedia('(min-width:1024px)').matches||document.documentElement.dataset.theme!=='dark'){
   if(root.classList.contains('b46v23-ready'))reset(root);
   return;
  }
  const items=originalItems(root);
  if(!items||items.some(x=>!x.label||!x.value)){
   if(root.classList.contains('b46v23-ready'))reset(root);
   return;
  }
  const hero=root.querySelector('.sp-stat-hero');
  if(!hero)return;
  let strip=root.querySelector('.b46v23-strip');
  if(!strip){
   strip=document.createElement('div');
   strip.className='b46v23-strip';
   strip.setAttribute('role','region');
   strip.setAttribute('aria-label','All 14 statistics on one horizontal row');
   strip.tabIndex=0;
   const grid=document.createElement('div');grid.className='b46v23-strip-grid';
   items.forEach(x=>grid.appendChild(makeCard(x)));
   strip.appendChild(grid);
   hero.insertAdjacentElement('afterend',strip);
   lastRoot=root;lastSignature='';
  }
  const signature=items.map(x=>[x.label,x.value,x.meta].join('\u001e')).join('\u001f');
  if(signature!==lastSignature){
   const cards=[...strip.querySelectorAll('.b46v23-micro-card')];
   if(cards.length!==14){reset(root);return;}
   items.forEach((it,i)=>{
    const card=cards[i];
    const children=card.children;
    const vals=[it.label,it.value,it.meta];
    for(let j=0;j<3;j++)if(children[j].textContent!==vals[j])children[j].textContent=vals[j];
    card.title=it.label+' · '+it.value+(it.meta?' · '+it.meta:'');
    card.setAttribute('aria-label',card.title);
   });
   lastSignature=signature;
  }
  root.classList.add('b46v23-ready');
 }
 function start(){
  sync();
  const interval=window.setInterval(sync,900);
  window.addEventListener('resize',sync,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();`;
