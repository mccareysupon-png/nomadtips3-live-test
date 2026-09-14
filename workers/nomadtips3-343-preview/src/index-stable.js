import legacy from './index.js';

const STABLE_VERSION='343-stable-preview-router-v2-central-market-cache';

function noStore(response,revision=STABLE_VERSION){
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-live-revision',revision);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function json(body,status=200,headers={}){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
}

async function stableAsset(request,env,path){
  const url=new URL(request.url);url.pathname=path;
  return noStore(await env.ASSETS.fetch(new Request(url,request)));
}

async function liveSnapshot(request,env){
  const upstream=new URL(request.url);
  upstream.protocol='https:';
  upstream.hostname='hub.internal';
  upstream.pathname='/snapshot';
  const response=await env.HUB.fetch(new Request(upstream,request));
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-nomad-view-source','5usd-hub-bulk');
  headers.set('x-nomad-view-router',STABLE_VERSION);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function fullMarketInternalRequest(request,path){
  const upstream=new URL(request.url);
  upstream.protocol='https:';
  upstream.hostname='full-market.internal';
  upstream.pathname=path;
  return new Request(upstream,request);
}

async function centralMarketSnapshot(request,env,ctx){
  const url=new URL(request.url);
  const cacheKey=new Request(`${url.origin}/__edge/full-market/cache-snapshot`,{method:'GET'});
  const edgeCache=globalThis.caches?.default;
  if(edgeCache){
    const hit=await edgeCache.match(cacheKey);
    if(hit)return hit;
  }
  const response=await env.FULL_MARKET.fetch(fullMarketInternalRequest(request,'/cache-snapshot'));
  const headers=new Headers(response.headers);
  headers.set('cache-control','public, max-age=10, s-maxage=10');
  headers.set('x-nomad-view-router',STABLE_VERSION);
  headers.set('x-nomad-full-market-mode','CENTRAL_CACHE_ONLY');
  headers.set('x-nomad-provider-trigger','0');
  const out=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  if(edgeCache&&response.ok)ctx?.waitUntil?.(edgeCache.put(cacheKey,out.clone()));
  return out;
}

async function cacheOnlyFixture(request,env){
  const response=await env.FULL_MARKET.fetch(fullMarketInternalRequest(request,'/fixture-odds-cache'));
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-nomad-view-router',STABLE_VERSION);
  headers.set('x-nomad-full-market-mode','CENTRAL_CACHE_ONLY');
  headers.set('x-nomad-provider-trigger','0');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const LIVE_ASSETS=new Set([
  '/index.html','/live-stable-343.js','/live-stable-343.css','/full-odds-bulk-343.js','/full-odds-10book-343.js',
  '/event-flow-343.js','/event-flow-343.css','/readability-343.css','/app.css','/engine.css',
  '/ui.js','/odds-format-343.js','/football-language-343.js','/language-menu-343.js',
  '/language-es-343.js','/language-fr-343.js','/language-pt-br-343.js','/language-ar-343.js','/language-id-343.js',
  '/league-flags-343.js','/team-kits-343.js','/card-order-343.js'
]);

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/live/snapshot')return liveSnapshot(request,env);
    if(request.method==='GET'&&url.pathname==='/api/full-market/cache-snapshot')return centralMarketSnapshot(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/full-market/fixture-odds')return cacheOnlyFixture(request,env);
    if(url.pathname==='/api/full-market/event-refresh')return json({ok:false,error:'VIEWER_PROVIDER_REFRESH_DISABLED',mode:'CENTRAL_SCHEDULER_ONLY'},403,{'x-nomad-provider-trigger':'0'});
    if(url.pathname==='/api/full-market/scheduler-tick')return json({ok:false,error:'SCHEDULER_NOT_PUBLIC'},403,{'x-nomad-provider-trigger':'0'});
    if(request.method==='GET'&&url.pathname==='/')return stableAsset(request,env,'/index.html');
    if(request.method==='GET'&&LIVE_ASSETS.has(url.pathname))return stableAsset(request,env,url.pathname);
    return legacy.fetch(request,env);
  }
};
