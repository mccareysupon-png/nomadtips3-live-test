// Patch the exact deployed browser scripts, retaining the native graph renderer, controls and legacy table.
function once(s,a,b){if(s.split(a).length!==2)throw Error('CUTOVER_ANCHOR_DRIFT_'+a.slice(0,80));return s.replace(a,b)}
export function patchChart(s){
 const renderAnchor="function render(){const card=ensureCard();if(!card)return;const shell=card.querySelector('[data-b46-perf-shell]');if(!shell)return;const selected=filteredRows(),s=stats(selected),points=f46Points(s),last=points.at(-1),rate=s.ratePoints.at(-1)?.value??null;";
 const inject=String.raw`let b46GraphData=null,b46GraphKey='',b46Request=null,b46Last=0,b46FailedAt=0,b46FailedKey='';
const b46Aliases={all:'all',ah:'AH','1x2':'1X2',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
function b46Query(){const f=routeFilter(),market=b46Aliases[f.market];return market?new URLSearchParams({market,variant:f.variant,filter:f.filter,range}):null}
function b46Valid(g,q){return g&&g.ok===true&&g.source==='RECEIVER'&&g.schema===1&&['market','variant','filter','range'].every(k=>g[k]===q.get(k))&&Number.isSafeInteger(g.sequence)&&Number.isSafeInteger(g.summary?.rows)&&Number.isFinite(g.summary?.net)&&['units','roi','rate'].every(k=>Array.isArray(g.series?.[k])&&g.series[k].every(p=>Number.isFinite(p.date)&&Number.isFinite(p.value)))}
function b46Expose(){const content=$('.sp-stats-content');if(content)content.style.setProperty('display','block','important');document.documentElement.classList.add('b46-receiver-graph-ready');}
function b46Legacy(){if(typeof window.__B46_FAST_LOAD_DETAILS==='function')window.__B46_FAST_LOAD_DETAILS();else setTimeout(()=>{if(active())window.__B46_FAST_LOAD_DETAILS?.()},100);if(rowsCache.length)renderFromStats(stats(filteredRows()),'legacy');else void legacyLoad()}
function render(force=false){
 if(!active())return;
 const q=b46Query(),key=q?.toString();if(!q){b46Legacy();return}
 const same=b46GraphKey===key&&b46GraphData;
 if(same){renderFromStats(b46GraphData,'receiver');if(!force&&Date.now()-b46Last<12000)return}
 if(b46FailedKey===key&&Date.now()-b46FailedAt<10000){if(!same)b46Legacy();return}
 if(b46Request?.key===key)return;
 const request={key};b46Request=request;
 if(!same){const c=ensureCard();if(c){c.dataset.b46StatisticsSource='loading';const sh=c.querySelector('[data-b46-perf-shell]');if(sh)sh.innerHTML='<div class="f46-empty">Loading performance…</div>'}b46Expose()}
 (async()=>{try{
  const response=await fetch('/b46-receiver-v1/graph?'+q,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('RECEIVER_HTTP_'+response.status);
  const g=await response.json();if(!b46Valid(g,q))throw Error('RECEIVER_GRAPH_INVALID');
  if(!active()||b46Query()?.toString()!==key||b46Request!==request)return;
  b46GraphData={...g.summary,unitPoints:g.series.units,roiPoints:g.series.roi,ratePoints:g.series.rate,b46Daily:true,b46Sequence:g.sequence,b46Market:g.market,b46Variant:g.variant,b46Filter:g.filter,b46Range:g.range};
  b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');
 }catch(e){
  if(!active()||b46Query()?.toString()!==key||b46Request!==request)return;
  b46FailedKey=key;b46FailedAt=Date.now();b46GraphData=null;b46GraphKey='';b46Legacy();
 }finally{if(b46Request===request)b46Request=null}})();
}
function renderFromStats(s,source){const card=ensureCard();if(!card)return;const shell=card.querySelector('[data-b46-perf-shell]');if(!shell)return;const points=f46Points(s),last=points.at(-1),rate=s.ratePoints.at(-1)?.value??null;`;
 s=once(s,renderAnchor,inject);
 s=once(s,"function f46Points(s){const raw=getPoints(s);","function f46Points(s){const raw=getPoints(s);if(s.b46Daily)return raw;");
 // Only approved statistics graph changes; own a single graph inside the existing card, no duplicate overlay.
 s=once(s,"bindCard();bindChart();if(!f46Observer)","card.dataset.b46StatisticsSource=source;card.dataset.b46Sequence=String(s.b46Sequence??'');card.dataset.b46Market=String(s.b46Market??'');card.dataset.b46Variant=String(s.b46Variant??'');card.dataset.b46Filter=String(s.b46Filter??'');card.dataset.b46Range=String(s.b46Range??'');card.dataset.b46Settled=String(s.rows);card.dataset.b46Net=String(s.net);b46Expose();if(!window.__B46_FAST_DETAILS_REQUESTED){const btn=document.createElement('button');btn.type='button';btn.className='b46-fast-details';btn.dataset.b46LegacyDetails='1';btn.textContent='Load detailed history';btn.style.cssText='padding:8px 12px;margin:6px 12px 12px;border:1px solid var(--f46-border);border-radius:8px;background:var(--f46-button);color:var(--f46-ink);cursor:pointer';btn.onclick=()=>{btn.disabled=true;btn.textContent='Loading detailed history…';window.__B46_FAST_LOAD_DETAILS?.();};shell.querySelector('.f46-card')?.append(btn)}bindCard();bindChart();if(!f46Observer)");
 s=once(s,"async function load(){/* B46_VERIFIED_FAST_V1_LAZY_20261116 */","function load(){render()}\\nasync function legacyLoad(){/* B46_VERIFIED_FAST_V1_LAZY_20261116 */".replace('\\n','\n'));
 // Native fallback only, not an automatic full-history read on successful Receiver reads.
 s=once(s,"rowsCache=data.rows;loadedAt=Date.now();render()}catch(err)","rowsCache=data.rows;loadedAt=Date.now();if(active())renderFromStats(stats(filteredRows()),'legacy')}catch(err)");
 s=once(s,"if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){render();return}","if(rowsCache.length&&Date.now()-loadedAt<CACHE_MS){renderFromStats(stats(filteredRows()),'legacy');return}");
 // On filter clicks the workspace writes its URL at the end of its event; original refreshSoon waits 40ms.
 s=once(s,"if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();","if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();setInterval(()=>{if(active()&&!document.hidden)render(true)},15000);");
 return s;
}
export function patchWorkspace(s){
 // Leave all live navigation, original table and Pending metadata unchanged.
 const start="function startStatistics(){if(!window.__B46_FAST_DETAILS_REQUESTED)return;";
 s=once(s,start,"function startStatistics(){if(!window.__B46_FAST_DETAILS_REQUESTED){renderStats();return}");
 s=once(s,"function renderStats(){if(!state.statsLoaded)return;","function renderStats(){if(!state.statsLoaded){renderVariants();renderFilters();renderStatHeader();return}");
 const a="function filters(){if(state.market==='all')return[{id:'all',label:'All results'}];";
 s=once(s,a,a+"if(!state.statsLoaded){const ids=({ah:['home','away'],'1x2':['home','draw','away'],ou:['over','under'],corners:['over','under'],btts:['yes','no'],cards:['over','under'],other:[]})[state.market]||[];const keys=['all',...ids];if(state.filter&&!keys.includes(state.filter))keys.push(state.filter);return keys.map(id=>({id,label:({all:'All',home:'Home',away:'Away',draw:'Draw',over:'Over',under:'Under',yes:'Yes',no:'No'})[id]||id}));}");
 // Deferred native history only on explicit request (or failover).
 return s;
}
export function patchFastClient(s){
 const i=s.indexOf('const begin=async()=>{');
 if(i<0||s.indexOf('const begin=async()=>{',i+1)>=0)throw Error('FAST_CLIENT_DRIFT');
 // Keep original native desktop enhancement, remove legacy fast snapshot fetching and overlay.
 return s.slice(0,i)+String.raw`
diag.status='receiver-native-chart';
function b46LegacyChrome(){
 const card=$('#b46-finance-chart-card');if(card?.dataset.b46StatisticsSource==='receiver')diag.status='receiver-ready';
 else if(card?.dataset.b46StatisticsSource==='legacy')diag.status='native-ready';
 // Existing market right-card enhancer operates on verified native metrics only.
 enhanceFilteredMarket();
}
document.addEventListener('ball46:finance-line-ready',b46LegacyChrome);
document.addEventListener('ball46:workspace-view',()=>queueMicrotask(b46LegacyChrome));
const style=document.createElement('style');style.textContent='html.b46-receiver-graph-ready body[data-workspace-view="statistics"] #b46-data-orbit-loading,html.b46-receiver-graph-ready body[data-workspace-view="statistics"] .b46-stats-loader{display:none!important}';document.head.append(style);
})();`;
}
