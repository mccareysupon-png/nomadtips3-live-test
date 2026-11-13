import assert from 'node:assert/strict';
import {patchWorkspace} from '../engine-memory-diagnosis-20261113/patch.mjs';
export function connectExistingUi({html,workspace,dashboard,sync}){
 const changes=[];
 function replace(source,before,after,name){assert.equal(source.split(before).length,2,'UI_SOURCE_DRIFT:'+name);changes.push(name);return source.replace(before,()=>after);}
 let w=patchWorkspace(workspace);
 const begin=w.indexOf('async function load() {'),end=w.indexOf('window.BALL46_STATISTICS_DATA = ',begin);assert(begin>=0&&end>begin);
 const loader=`/* B46_SUMMARY_FIRST_TEST_20261113: no history until Statistics is opened. */
let summaryCache=null,summaryAt=0,summaryLoading=null,detailsController=null;
function statisticsOpen(){const view=document.body?.dataset?.workspaceView;return view?view==='statistics':new URLSearchParams(location.search).get('view')==='statistics'}
function summaryDayNow(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const day=p.year+'-'+p.month+'-'+p.day;return Number(p.hour)<6?new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10):day}
async function loadSummary(){
 if(document.visibilityState==='hidden')return summaryCache;
 if(summaryCache&&summaryCache.daily.tk===summaryDayNow()&&Date.now()-summaryAt<10000)return summaryCache;
 if(summaryLoading)return summaryLoading;
 summaryLoading=(async()=>{const r=await fetch('/api/statistics/summary',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});const data=await r.json();
 if(!r.ok||data?.ok!==true||!Number.isSafeInteger(data.ledgerTotal)||!data.daily||!data.marketCounts||!Array.isArray(data.recentSettled)||data.recentSettled.length>4||!Number.isFinite(data.asOf))throw Error('SUMMARY_UNAVAILABLE');
 if(summaryCache&&data.asOf<summaryCache.asOf)throw Error('OLDER_SUMMARY');summaryCache=Object.freeze(data);summaryAt=Date.now();document.dispatchEvent(new CustomEvent('ball46:statistics-summary',{detail:summaryCache}));return summaryCache;})();
 try{return await summaryLoading}catch(error){if(summaryCache)return summaryCache;throw error}finally{summaryLoading=null}
}
function cancelDetails(){detailsController?.abort();detailsController=null;loading=null}
async function load({details=false}={}) {
 if(!details&&!statisticsOpen()){loadSummary().catch(()=>{});if(cached)return cached;throw Error('DETAILS_NOT_OPEN')}
 if(cached&&Date.now()-loadedAt<CACHE_MS)return cached;
 if(loading)return loading;
 const controller=new AbortController();detailsController=controller;const timeout=setTimeout(()=>controller.abort(),90000);
 const request=readAll(controller.signal).then(data=>{if(controller.signal.aborted)throw new DOMException('View closed','AbortError');cached=data;loadedAt=Date.now();document.dispatchEvent(new CustomEvent('ball46:statistics-snapshot',{detail:data}));return data;});loading=request;
 try{return await request}finally{clearTimeout(timeout);if(loading===request)loading=null;if(detailsController===controller)detailsController=null}
}
`;
 w=w.slice(0,begin)+loader+w.slice(end);changes.push('Replace shared loader with summary/detail split and owned cancellation');
 w=replace(w,'async function page(params = {}) {','async function page(params = {}, signal) {','Thread one detail abort signal');
 w=replace(w,'signal:AbortSignal.timeout(30000)','signal:signal||AbortSignal.timeout(30000)','Cancel detail fetch when leaving Statistics');
 w=replace(w,'async function readAll() {','async function readAll(signal) {','Keep complete cursor-reader validation');
 w=replace(w,'let first = await page();','let first = await page({},signal);','Initial bounded page');
 w=replace(w,'await page({limit:String(first.ledgerTotal)})','await page({limit:String(first.ledgerTotal)},signal)','Preserve compatibility signature');
 w=replace(w,'await page({cursor})','await page({cursor},signal)','Bounded continuation');
 w=replace(w,'Object.freeze({load, outcome, isSettled, counts, rate, getSnapshot:()=>cached, getSnapshotAt:()=>loadedAt})','Object.freeze({load,loadSummary,cancelDetails,outcome,isSettled,counts,rate,getSummary:()=>summaryCache,getSnapshot:()=>cached,getSnapshotAt:()=>cached?.preview?Number(cached.ledgerUpdatedAt):loadedAt})','Expose separate summary; never fake a full snapshot');
 w=replace(w,"statsLoading:false,statsLoadedAt:0","statsLoading:false,statsLoadedAt:0,statsRequest:0",'Own view request generation');
 w=replace(w,'function stopStatistics(){}','function stopStatistics(){state.statsRequest++;state.statsLoading=false;window.BALL46_STATISTICS_DATA.cancelDetails()}','Cancel only Statistics details, not live board/Signals');
 w=replace(w,"state.statsLoading=true;try{const j=await window.BALL46_STATISTICS_DATA.load();state.rows=","state.statsLoading=true;const ticket=++state.statsRequest;try{const j=await window.BALL46_STATISTICS_DATA.load({details:true});if(ticket!==state.statsRequest||state.view!=='statistics')return;state.rows=",'Existing Statistics rendering gets complete data only');
 w=replace(w,"catch(err){console.warn('Single-page statistics load failed',err);","catch(err){if(ticket!==state.statsRequest||err?.name==='AbortError')return;console.warn('Single-page statistics load failed',err);",'Closed view is not a feed failure');
 w=replace(w,'finally{state.statsLoading=false}','finally{if(ticket===state.statsRequest)state.statsLoading=false}','Old request cannot clear new loading state');
 w=replace(w,'const out=Object.fromEntries(MARKETS.map(m=>[m.id,0]));out.all=',"const out=Object.fromEntries(MARKETS.map(m=>[m.id,0]));const small=window.BALL46_STATISTICS_DATA.getSummary();if(!state.statsLoaded&&small)return{...out,...small.marketCounts};out.all=",'Menu counts use full-source summary before details open');
 w=replace(w,'function init(){const status=parseRoute();',"document.addEventListener('ball46:statistics-summary',()=>renderStatNav());function init(){const status=parseRoute();",'Update existing navigation without creating history rows');
 w=replace(w,"document.addEventListener('ball46:statistics-snapshot',e=>paint(e.detail));",`document.addEventListener('ball46:statistics-summary',e=>{const card=ensureCard(),value=e.detail?.settledDays;if(card){const el=card.querySelector('[data-sp-kpi="settled-days"]');if(el)el.textContent=value==null?'—':String(value);card.dataset.b46SettledDays=String(value??'')}});document.addEventListener('ball46:statistics-snapshot',e=>paint(e.detail));`,'Settled-days KPI uses summary until opened');
 let d=replace(dashboard,'const j=await window.BALL46_STATISTICS_DATA.load();settledSignalRows=j.rows.slice()','const j=await window.BALL46_STATISTICS_DATA.loadSummary();settledSignalRows=j.recentSettled.slice()','Existing scorebar gets only its four displayed settled results');
 const old="const r=await fetch('/api/engine/statistics?paged=1&limit=1&_='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok||j?.ok!==true)";
 const s=replace(sync,old,"const j=await window.BALL46_STATISTICS_DATA.loadSummary();if(j?.ok!==true)",'Existing menu polling shares small summary request');
 const consume=`function consumeSummary(data){try{if(data!==window.BALL46_STATISTICS_DATA?.getSummary?.()||data?.ok!==true||!validBucket(data.daily?.today)||!validBucket(data.daily?.yesterday)||data.daily.tk!==sportDay(Date.now()))return;lastGood=data.daily;verifiedAt=data.asOf;sourceMode=data.mode==='LIVE_SUMMARY'&&!data.stale?'snapshot':'cache';render(lastGood);cacheWrite();clearTimeout(ageTimer);ageTimer=setTimeout(()=>{const r=document.getElementById(ID);if(r&&lastGood)freshness(r)},Math.max(1000,verifiedAt+STALE_MS-Date.now()+1))}catch(e){console.warn('B46 summary skipped',e?.message||e)}}
`;
 let h=replace(html,"function boot(){document.addEventListener('ball46:statistics-snapshot',e=>consume(e.detail));",consume+"function boot(){document.addEventListener('ball46:statistics-summary',e=>consumeSummary(e.detail));document.addEventListener('ball46:statistics-snapshot',e=>consume(e.detail));",'Existing daily performance card consumes server aggregate');
 h=replace(h,'restoreCache();consume(window.BALL46_STATISTICS_DATA?.getSnapshot?.());if(!lastGood)showWaiting();','restoreCache();consumeSummary(window.BALL46_STATISTICS_DATA?.getSummary?.());consume(window.BALL46_STATISTICS_DATA?.getSnapshot?.());if(!lastGood)showWaiting();','Mount cached summary without changing card markup');
 assert.deepEqual([...h.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]),[...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]),'CSS_CHANGED');
 return {html:h,workspace:w,dashboard:d,sync:s,changes};
}
