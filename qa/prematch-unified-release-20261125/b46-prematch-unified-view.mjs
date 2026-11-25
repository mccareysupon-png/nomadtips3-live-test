// BALL46 unified PreMatch O/U presentation gateway.
// The UI is a pinned COPY of the audited TEST Worker, and every write is denied.
// Existing Production engine, statistics, and regular "/" routes remain untouched.
export const UNIFIED_MARK='B46_PREMATCH_OU_SINGLE_PRODUCTION_VIEW_20261125';
const testHost='https://ball46-prematch-ou-ui-pinned-20261125.mccarey-supon.workers.dev';
const paths=new Set([
  '/__b46_prematch_client.js',
  '/__b46_prematch_mirror.js',
  '/__b46_pm_adaptive_research',
  '/__b46_prematch_data',
  '/__b46_pm_btts_readiness',
  '/__b46_pm_btts_candidates',
  '/__b46_prematch_graph',
]);
const headersCopy=['accept','accept-language','user-agent','sec-ch-ua-mobile'];
function publicHeaders(source,isHtml){
 const headers=new Headers(source);
 headers.delete('set-cookie');
 headers.delete('content-length');
 headers.delete('content-encoding');
 headers.delete('etag');
 headers.delete('last-modified');
 headers.delete('content-security-policy-report-only');
 headers.set('cache-control','no-store');
 headers.set('x-robots-tag','noindex, nofollow');
 headers.set('x-content-type-options','nosniff');
 headers.set('x-b46-prematch-unified','readonly-pinned-20261125');
 if(isHtml)headers.set('x-b46-prematch-view','ou-single-source-v1');
 return headers;
}
export function isPrematchUnifiedAsset(path){return paths.has(path)}
export async function serveUnifiedPrematch(request,env){
 const incoming=new URL(request.url);
 const path=incoming.pathname;
 if(!['GET','HEAD'].includes(request.method)){
  return new Response('Read-only Research. Method Not Allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
 }
 if(!env.B46_PREMATCH_UNIFIED_UI?.fetch){
  return new Response('Research UI currently unavailable',{status:503,headers:{'cache-control':'no-store'}});
 }
 const isPage=path==='/prematch/over-under'||path==='/prematch/over-under/';
 if(isPage&&incoming.searchParams.get('b46pm')!=='ou'){
  const canonical=new URL('/prematch/over-under/',incoming.origin);
  canonical.searchParams.set('b46pm','ou');
  return Response.redirect(canonical,302);
 }
 // Do NOT forward the public URL path to TEST: it would call Production
 // recursively. Forward "/" with b46pm=ou; TEST fetches Production "/" as
 // its immutable shell, then inserts the current pinned PreMatch UI.
 const target=new URL(isPage?'/':path,testHost);
 if(isPage){
  target.searchParams.set('b46pm','ou');
  const period=incoming.searchParams.get('b46pmPeriod');
  if(period==='today'||period==='all')target.searchParams.set('b46pmPeriod',period);
 }else{
  // Only known GET-only endpoint query parameters; never proxy admin paths.
  const allowed={
   '/__b46_prematch_graph':['market','variant','filter','range'],
   '/__b46_pm_btts_candidates':['page','filter'],
  }[path]||[];
  for(const key of allowed){
   const v=incoming.searchParams.get(key);
   if(v!==null&&v.length<80)target.searchParams.set(key,v);
  }
 }
 const requestHeaders=new Headers();
 for(const key of headersCopy){const val=request.headers.get(key);if(val)requestHeaders.set(key,val)}
 try{
  const response=await env.B46_PREMATCH_UNIFIED_UI.fetch(new Request(target,{
   method:request.method,headers:requestHeaders,redirect:'manual',
   signal:AbortSignal.timeout(20000),
  }));
  const isHtml=!!response.headers.get('content-type')?.includes('text/html');
  if(isPage&&(!response.ok||!isHtml)){
   return new Response('Research UI unavailable',{status:503,headers:{'cache-control':'no-store'}});
  }
  const headers=publicHeaders(response.headers,isHtml);
  const loc=headers.get('location');
  if(loc){
   const destination=new URL(loc,target);
   if(destination.host===new URL(testHost).host){
    headers.set('location',new URL(destination.pathname+destination.search,incoming.origin).href);
   }
  }
  return new Response(request.method==='HEAD'?null:response.body,{
   status:response.status,statusText:response.statusText,headers,
  });
 }catch(error){
  console.warn('B46_UNIFIED_PREMATCH_READ_ERROR',String(error?.message||error).slice(0,140));
  return new Response('Research UI temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
 }
}
