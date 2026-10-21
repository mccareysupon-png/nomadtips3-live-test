/* BALL46 FEATURED V11: decorate ONLY existing FEATURED MATCH contents.
   No new cards, no cloned feed nodes, no EVENT FLOW / match rows touched.
   Existing keyed live-signal parts are kept as direct host children. */
(()=>{
 'use strict';
 if(window.__b46FeaturedFaithfulV11)return;
 window.__b46FeaturedFaithfulV11=true;
 const roots=[
  '.workspace.singlepage .live-stage-grid > .right-rail > .featured-card[data-featured]',
  '#b46gn-detail .b46gn-featured .featured-card[data-featured]'
 ];
 const set=(node,name,value)=>{
  if(!node)return;
  const str=String(value??'');
  if(node.getAttribute(name)!==str)node.setAttribute(name,str);
 };
 const clean=t=>String(t||'').replace(/\s+/g,' ').trim();
 function signalParts(host){
  const mains=[...host.querySelectorAll(':scope > .feature-signal-main')];
  set(host,'data-v11-count',String(mains.length));
  for(const main of mains){
   const metrics=main.nextElementSibling;
   const timeline=metrics?.nextElementSibling;
   if(!metrics?.classList.contains('feature-signal-meta')||
      !timeline?.classList.contains('feature-signal-meta'))continue;
   set(metrics,'data-v11-kind','metrics');
   set(timeline,'data-v11-kind','timeline');
   const fields=[...metrics.children].filter(n=>n.tagName==='SPAN');
   fields.forEach((field,i)=>{
    const raw=clean(field.textContent);
    const label=['LINE','ODDS','BOOKMAKER'][i]||'';
    const value=i===0?raw.replace(/^line\s*/i,''):i===1?raw.replace(/^odds\s*/i,''):raw;
    set(field,'data-v11-label',label);
    set(field,'data-v11-value',value||'—');
   });
  }
 }
 function statsLegend(root){
  // Stats engine replaces .feature-stats children on live refresh. Never add
  // a child legend that the engine will delete: its repeated 37px re-insertion
  // caused the full Featured card to jump. Store names on the stable host.
  const stats=root.querySelector(':scope > .feature-stats');
  if(!stats)return;
  const home=clean(root.querySelector('[data-featured-home]')?.textContent)||'Home';
  const away=clean(root.querySelector('[data-featured-away]')?.textContent)||'Away';
  set(stats,'data-v12-home',home);
  set(stats,'data-v12-away',away);
  set(stats,'data-v12-has-rows',stats.querySelector(':scope > .stat-row')?'yes':'no');
 }
 function markEvents(root){
  const events=root.querySelector(':scope > .feature-events');
  if(!events)return;
  for(const row of events.querySelectorAll(':scope > .event-item')){
   const label=row.querySelector('span');
   if(!label)continue;
   const parts=clean(label.textContent).split(/\s*[·•]\s*/);
   const kind=(parts[0]||'event').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');
   const side=(parts[1]||'').trim().toUpperCase();
   const name=({yellow_card:'Yellow card',red_card:'Red card',goal:'Goal',corner:'Corner',period_score:'Period score',substitution:'Substitution',penalty:'Penalty'})[kind]||(parts[0]||'Event').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
   set(row,'data-v11-type',kind);
   set(label,'data-v11-event',name);
   set(label,'data-v11-side',side);
  }
 }
 function sync(){
  try{
   for(const selector of roots){
    const root=document.querySelector(selector);
    if(!root)continue;
    const signal=root.querySelector(':scope > .feature-signal');
    if(signal)signalParts(signal);
    statsLegend(root);
    markEvents(root);
   }
  }catch(e){console.warn('B46_FEATURED_V11_DECORATION_SKIPPED',String(e).slice(0,180))}
 }
 function boot(){sync();window.setInterval(sync,1100)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
