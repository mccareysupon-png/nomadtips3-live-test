import {fullMarketOddsStyles,fullMarketOddsScript} from './fullmarket-odds-v3.mjs';
const SCRIPT='ball46-fullmarket-odds-v3-test-20261121';
const INJECT='<style id="b46-fullmarket-odds-v3-style-test">'+fullMarketOddsStyles+'</style><script id="b46-fullmarket-odds-v3-script-test">'+fullMarketOddsScript+'</script>';
const OVERSCROLL_TEST='<style id="b46-native-scroll-containment-test">@media(min-width:1024px){body[data-workspace-view="live"] .board-sections{overscroll-behavior-y:contain!important}}</style>';
// Surgical TEST-only hot spots. Preserve the native visuals, DOM, data,
 // Market renderer, odds detector, Event Flow chart and all service bindings.
const NATIVE_ASSETS=new Set(['/dashboard-v2-stage3-featured-facts-20261013a.js','/ui-sync-fixes-343-v2.js','/expanded-match-343.js']);
function replaceStrict(source,oldText,newText,label){
 if(source.split(oldText).length!==2)return source; // Fail OPEN in isolated TEST: native site JS must never be broken.
 return source.replace(oldText,newText);
}
function nativeOptimized(path,src){
 if(path==='/dashboard-v2-stage3-featured-facts-20261013a.js'){
  return replaceStrict(src,
   "function b46PinExpanded(){return !!document.querySelector('.match-expanded[data-expanded-match]')}",
   "let b46PinExpandedCacheTick=-1,b46PinExpandedCache=false;function b46PinExpanded(){const tick=Math.floor(performance.now()/16);if(tick!==b46PinExpandedCacheTick){b46PinExpandedCacheTick=tick;b46PinExpandedCache=!!document.querySelector('.match-expanded[data-expanded-match]')}return b46PinExpandedCache}",
   'DASHBOARD_PIN_QUERY_CACHE');
 }
 if(path==='/ui-sync-fixes-343-v2.js'){
  // Reverted: caching only getTotalLength regressed getPointAtLength on Chrome.
  return src;
 }
 if(path==='/expanded-match-343.js'){
  return replaceStrict(src,
   "if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}",
   "if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible'){const board=row.closest('.board-sections');if(board&&board.scrollHeight>board.clientHeight)board.scrollBy(0,delta);else window.scrollBy(0,delta)}}",
   'EXPANDED_ANCHOR_TARGETS_BOARD_SCROLL');
 }
 return src;
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return new Response('READ_ONLY_TEST',{status:405,headers:{'cache-control':'no-store'}});
 if(u.pathname==='/__fullmarket_health')return Response.json({ok:true,scope:'ISOLATED_TEST_ONLY',feature:'FULLMARKET_ODDS_V3',name:SCRIPT,sourceRequestsAdded:0,defaultOddsUnchanged:true,nativePerfTest:'EXPANDED_SCROLL_SCOPE_OVERSCROLL_TEST',styles:fullMarketOddsStyles,script:fullMarketOddsScript},{headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 if(/^\/(admin|internal)(\/|$)/i.test(u.pathname))return new Response('Forbidden',{status:403});
 const headers=new Headers();
 for(const h of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(h);if(v)headers.set(h,v)}
 const originUrl=new URL(u.pathname+u.search,'https://ball46.com');
 const source=await env.B46_PRODUCTION_READ.fetch(new Request(originUrl,{method:req.method,headers,redirect:'manual'}));
 const out=new Headers(source.headers);
 out.delete('set-cookie');out.set('x-robots-tag','noindex,nofollow');
 // JS resources are patched ONLY for this isolated workers.dev TEST origin.
 // No production asset, origin database, engine, Cloudflare route, or API is written.
 if(req.method==='GET'&&source.ok&&NATIVE_ASSETS.has(u.pathname)){
  const text=await source.text();
  if(u.searchParams.get('b46NativeRaw')==='1'){const rawHeaders=new Headers(out);for(const k of ['content-length','content-encoding','etag','last-modified'])rawHeaders.delete(k);rawHeaders.set('cache-control','no-store');rawHeaders.set('content-type','application/javascript; charset=utf-8');return new Response(text,{status:source.status,statusText:source.statusText,headers:rawHeaders})}
  let patched;
  try{patched=nativeOptimized(u.pathname,text)}
  catch(e){return new Response('B46_TEST_NATIVE_PATCH_FAILURE_'+u.pathname+':'+String(e)+'; bytes='+text.length,{status:500,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})}
  if(patched===text){const passthrough=new Headers(out);passthrough.set('x-b46-test-native-perf','passthrough');return new Response(text,{status:source.status,statusText:source.statusText,headers:passthrough})}
  for(const k of ['content-length','content-encoding','etag','last-modified'])out.delete(k);
  out.set('content-type','application/javascript; charset=utf-8');out.set('cache-control','no-store');
  out.set('x-b46-test-native-perf','scoped');
  return new Response(patched,{status:source.status,statusText:source.statusText,headers:out});
 }
 const redir=out.get('location');
 if(redir){const next=new URL(redir,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(next.hostname))out.set('location',new URL(next.pathname+next.search+next.hash,req.url).toString())}
 if(req.method!=='GET'||!source.ok||!['/','/index.html','/index'].includes(u.pathname)||!out.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:source.body,{status:source.status,statusText:source.statusText,headers:out});
 for(const h of ['content-length','content-encoding','etag','last-modified'])out.delete(h);
 out.set('cache-control','no-store');
 out.set('x-b46-release-scope','FULLMARKET_V3_TEST_ONLY');
 return new HTMLRewriter().on('head',{element(e){e.append(OVERSCROLL_TEST+INJECT,{html:true})}}).transform(new Response(source.body,{status:source.status,statusText:source.statusText,headers:out}));
}};