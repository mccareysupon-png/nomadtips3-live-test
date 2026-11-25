// BALL46 original PreMatch O/U view, 2026-11-22 routing compatibility.
// Reuse the CURRENT, TEST-verified PreMatch frontend instead of introducing any new page.
// This module does not alter the prediction engine, ledger, statistics or unrelated routes.
export const B46_ORIGINAL_OU_PRODUCTION_20261125 = true;
const TEST_ORIGIN='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const INTERNAL_SHELL_FLAG='__b46_original_ui_shell';
const DATA_ENDPOINTS=new Set([
 '/__b46_prematch_client.js',
 '/__b46_prematch_mirror.js',
 '/__b46_pm_adaptive_research',
 '/__b46_prematch_data',
 '/__b46_pm_btts_readiness',
 '/__b46_pm_btts_candidates',
 '/__b46_prematch_graph'
]);
export function isOriginalOuRoute(url){
 return url.pathname==='/'&&url.searchParams.get('b46pm')==='ou'&&url.searchParams.get(INTERNAL_SHELL_FLAG)!=='1';
}
export function isOriginalOuAsset(pathname){return DATA_ENDPOINTS.has(pathname)}
export async function originalOuHandler(request,env){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method)){
  return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
 }
 if(!env.B46_ORIGINAL_OU_TEST_UI?.fetch){
  return new Response('PreMatch O/U temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
 }
 const isPage=isOriginalOuRoute(url);
 const dest=new URL(isPage?'/':url.pathname,TEST_ORIGIN);
 if(isPage){
  // The original TEST Worker calls the Production homepage as its shell.
  // This private marker prevents the resulting Worker-to-Worker recursion.
  dest.searchParams.set('b46pm','ou');
  dest.searchParams.set(INTERNAL_SHELL_FLAG,'1');
  if(['today','all'].includes(url.searchParams.get('b46pmPeriod')))dest.searchParams.set('b46pmPeriod',url.searchParams.get('b46pmPeriod'));
 }else if(url.pathname==='/__b46_prematch_graph'){
  for(const k of ['market','range','filter','variant']){
   const value=url.searchParams.get(k);
   if(value!=null&&value.length<=40)dest.searchParams.set(k,value);
  }
 }else if(url.pathname==='/__b46_pm_btts_candidates'){
  for(const k of ['filter','page']){
   const value=url.searchParams.get(k);
   if(value!=null&&value.length<=40)dest.searchParams.set(k,value);
  }
 }
 const h=new Headers();
 for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){
  const value=request.headers.get(k);
  if(value)h.set(k,value);
 }
 try{
  const response=await env.B46_ORIGINAL_OU_TEST_UI.fetch(new Request(dest,{method:request.method,headers:h,redirect:'manual',signal:AbortSignal.timeout(25000)}));
  const type=response.headers.get('content-type')||'';
  if(isPage&&(!response.ok||!type.includes('text/html'))){
   return new Response('Original O/U view temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
  }
  const headers=new Headers(response.headers);
  for(const k of ['content-length','content-encoding','etag','last-modified','set-cookie'])headers.delete(k);
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  headers.set('x-b46-original-ou-path','restored-20261125');
  if(isPage)headers.set('x-b46-original-ou-view','original-path-no-flicker');
  const redirect=headers.get('location');
  if(redirect){
   const loc=new URL(redirect,dest);
   if(loc.origin===TEST_ORIGIN)headers.set('location',new URL(loc.pathname+loc.search,url.origin).href);
  }
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
 }catch(err){
  console.warn('B46_ORIGINAL_OU_VIEW_UNAVAILABLE',String(err?.message||err).slice(0,140));
  return new Response('Original O/U view temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
 }
}
