(()=>{
'use strict';
const KEY='ball46_workspace_last_view_v1';
function navType(){try{return performance.getEntriesByType('navigation')?.[0]?.type||''}catch{return''}}
function cleanLiveRoute(){
  const q=new URLSearchParams(location.search);
  let changed=false;
  for(const k of ['view','market','variant','filter','page'])if(q.has(k)){q.delete(k);changed=true}
  if(!changed)return;
  const next=`${location.pathname}${q.toString()?`?${q}`:''}${location.hash||''}`;
  history.replaceState(history.state,'',next);
}
try{
  const last=sessionStorage.getItem(KEY);
  if(navType()==='reload'&&last==='live')cleanLiveRoute();
}catch(_){ }

document.addEventListener('ball46:workspace-view',e=>{
  const view=String(e.detail?.view||'');
  if(!['live','signal','statistics'].includes(view))return;
  try{sessionStorage.setItem(KEY,view)}catch(_){ }
  if(view==='live')cleanLiveRoute();
});
})();
