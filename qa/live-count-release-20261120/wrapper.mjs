import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
const dashboard='/dashboard-v2-stage3-featured-facts-20261013a.js',workspace='/singlepage-workspace-343.js';
function exact(s,a,b){if(s.split(a).length!==2)throw Error('STARTUP_SOURCE_DRIFT '+a.slice(0,120));return s.replace(a,b)}
export function patchStartup(s,path){
 if(path===dashboard){
  s=exact(s,'const SIGNAL_AFTER_BOARD_MS=1000;','/* B46_SIGNAL_STARTUP_EARLY_V1: same native request, no extra polling */');
  const from=s.indexOf('function startSignalLoopAfterBoard(){'),to=s.indexOf('function syncWorkspaceMode(){',from);
  if(from<0||to<0)throw Error('SIGNAL_SCHEDULER_DRIFT');
  s=s.slice(0,from)+"function startSignalLoopEarly(){loadSignals();setInterval(loadSignals,SIGNAL_POLL_MS)}\n"+s.slice(to);
  s=exact(s,'const beginSignals=startSignalLoopAfterBoard();const first=load();','startSignalLoopEarly();const first=load();');
  s=exact(s,'beginSignals();','');
  s=exact(s,"mode:'BOARD_FIRST_THEN_SIGNALS'","mode:'SIGNALS_BOARD_PARALLEL'");
  s=exact(s,"async function loadSignals(){if(document.visibilityState==='hidden')return;try{const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:[],next=new Map();","let b46SignalInFlight=false;\nasync function loadSignals(){if(b46SignalInFlight||document.visibilityState==='hidden')return;b46SignalInFlight=true;try{const j=await fetchJson(SIGNALS_API);if(j?.ok!==true||!Array.isArray(j.signals))throw Error('SIGNALS_NOT_READY');const rows=j.signals,next=new Map();");
  s=exact(s,"signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{};window.dispatchEvent(new CustomEvent('ball46:signals-snapshot'","signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{};setText('[data-signal-count]',signalRows.length);setText('[data-workspace-signal-count]',signalRows.length);renderSignalMarketCounts();window.dispatchEvent(new CustomEvent('ball46:signals-snapshot'");
  s=exact(s,"renderCounts();renderLeagueFilters();renderBoard();renderFeatured()}catch(err){console.warn('Signals refresh failed; keeping last-good signal state',err)}}","if(hasLoaded||fixtures.length){renderCounts();renderLeagueFilters();renderBoard();renderFeatured()}else renderWorkspaceScorebar()}catch(err){console.warn('Signals refresh failed; keeping last-good signal state',err)}finally{b46SignalInFlight=false}}");
  s=exact(s,'async function loadScorebarSettlements(){if(document.visibilityState===\'hidden\')return;','async function loadScorebarSettlements(){if(document.visibilityState===\'hidden\'||b46SignalInFlight)return;');
 }else if(path===workspace){
  s=exact(s,"const boot=()=>{ensureCard();const api=window.BALL46_STATISTICS_DATA;if(api?.load)api.load().then(paint).catch(()=>{})};","const boot=()=>{ensureCard();const api=window.BALL46_STATISTICS_DATA;const snapshot=api?.getSnapshot?.();if(snapshot)paint(snapshot);if(document.body.dataset.workspaceView==='statistics'&&window.__B46_FAST_DETAILS_REQUESTED&&api?.load)api.load().then(paint).catch(()=>{})};");
 }
 return s;
}


export default {...original,async fetch(req,env,ctx){
 const r=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!r.ok)return r;
 const path=new URL(req.url).pathname;
 if(![dashboard,workspace].includes(path))return r;
 const source=await r.text();let output;try{output=patchStartup(source,path)}catch(e){console.error('B46_STARTUP_DRIFT',e.message);output=source}
 const h=new Headers(r.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new Response(output,{status:r.status,statusText:r.statusText,headers:h});
}};