// TEST integration only. These endpoints read derived storage, never providers.
(()=>{
 let summary=null,summaryAt=0,pendingSummary=null,timer=null,polling=false;
 const requests=new Map();
 async function json(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.status===409)return{conflict:true};if(!response.ok)throw Error('STATISTICS_HTTP_'+response.status);return response.json()}
 function acceptSummary(value){
  if(!value?.ok||!Number.isSafeInteger(value.contentRevision)||value.marketCounts?.all!==value.ledgerTotal)throw Error('UNVERIFIED_SUMMARY');
  if(summary&&value.contentRevision<summary.contentRevision)throw Error('REGRESSION_SUMMARY');
  summary=value;summaryAt=Date.now();return value;
 }
 async function getSummary(force=false){
  if(!force&&summary&&Date.now()-summaryAt<5000)return summary;
  if(pendingSummary)return pendingSummary;
  pendingSummary=json('/api/statistics/fast-summary').then(acceptSummary);
  try{return await pendingSummary}finally{pendingSummary=null}
 }
 async function open(params={}){
  for(let attempt=0;attempt<3;attempt++){
   const s=await getSummary(attempt>0),q=new URLSearchParams({market:'all',variant:'all',filter:'all',page:'1',limit:'50',rangeDays:'all',metric:'units',...params,revision:String(s.contentRevision)}),url='/api/statistics/fast-view?'+q;
   if(!requests.has(url))requests.set(url,json(url).finally(()=>requests.delete(url)));
   const view=await requests.get(url);
   if(view.conflict||view.contentRevision!==s.contentRevision)continue;
   if(!view.ok||!Array.isArray(view.rows)||view.rows.length>50||!view.performance||view.totalRows!==view.metrics?.ledgerTotal)throw Error('UNVERIFIED_VIEW');
   return{summary:s,view};
  }
  throw Error('REVISION_RACE_NO_MIXING');
 }
 const readyStyle=document.createElement('style');readyStyle.textContent='html[data-b46-statistics-render-ready="1"] .b46-stats-loader{display:none!important}';document.head.appendChild(readyStyle);
 document.addEventListener('ball46:statistics-fast-chart-ready',()=>{
  if(document.body.dataset.b46StageReady!=='1')return;
  document.documentElement.setAttribute('data-b46-statistics-render-ready','1');
  if(!document.documentElement.dataset.b46StatsReadyMs)document.documentElement.dataset.b46StatsReadyMs=String(Math.round(performance.now()));
  document.documentElement.removeAttribute('data-b46-statistics-render-error');
  document.querySelectorAll('.b46-stats-loader').forEach(e=>{e.hidden=true;e.setAttribute('aria-busy','false')});
 });
 function active(){return document.body.dataset.workspaceView==='statistics'&&!document.hidden}
 async function poll(){
  if(polling||!active())return;polling=true;
  try{const before=summary?.contentRevision,wasStale=!!summary?.stale,s=await getSummary(true);if(before!==undefined&&(s.contentRevision!==before||wasStale!==!!s.stale))document.dispatchEvent(new CustomEvent('ball46:statistics-fast-refresh'));}
  catch(error){document.body.dataset.b46StatsSourceStale='true';}
  finally{polling=false;schedule()}
 }
 function schedule(){clearTimeout(timer);timer=active()?setTimeout(poll,5000):null}
 document.addEventListener('ball46:workspace-view',schedule);
 document.addEventListener('visibilitychange',()=>{schedule();if(active())poll()});
 window.BALL46_STATISTICS_FAST={open,getSummary,acceptSummary};
 schedule();
})();
