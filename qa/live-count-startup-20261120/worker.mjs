const name='ball46-live-count-startup-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);


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

export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_live_count_health')return Response.json({ok:true,name,scope:'TEST_ONLY_SIGNAL_STARTUP',revision:'SIGNAL_STARTUP_V1'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method==='GET'&&r.ok&&[dashboard,workspace].includes(u.pathname)){for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');try{return new Response(patchStartup(await r.text(),u.pathname),{status:r.status,headers:h})}catch(e){return Response.json({error:e.message},{status:502})}}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
}};