(()=>{
'use strict';
const ROOT='[data-next-signal-list]';
const TEAM='.next-signal-card .next-teams';
function paint(el){
  if(!el||el.dataset.b46TeamNameColors==='1')return;
  const raw=(el.textContent||'').trim();
  const sep=' — ';
  const at=raw.indexOf(sep);
  if(at<1)return;
  const home=raw.slice(0,at).trim();
  const away=raw.slice(at+sep.length).trim();
  if(!home||!away)return;
  const h=document.createElement('span');h.className='b46-team-home-name';h.textContent=home;
  const s=document.createElement('span');s.className='b46-team-separator';s.textContent=sep;
  const a=document.createElement('span');a.className='b46-team-away-name';a.textContent=away;
  el.replaceChildren(h,s,a);
  el.dataset.b46TeamNameColors='1';
}
function scan(root=document){root.querySelectorAll(TEAM).forEach(paint)}
function boot(){
  const root=document.querySelector(ROOT);
  if(!root)return;
  scan(root);
  const mo=new MutationObserver(()=>scan(root));
  mo.observe(root,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
