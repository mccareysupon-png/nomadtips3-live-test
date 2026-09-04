const API_ROUTES=new Map([
  ['/api/feed','/feed'],
  ['/api/statistics','/statistics'],
  ['/api/config','/config'],
  ['/api/health','/health'],
]);

const PREDICTIONS_ORIGIN='https://mccareysupon-png.github.io';
const PREDICTIONS_BASE='/nomadtips3-live-test';
const NOMAD342_PREFIX='/nomad-live-342';
const PUBLIC_INFO_PREFIXES=['/about','/privacy','/terms','/user-guide','/disclaimer'];
const ROOT_SHARED_FOOTER_ASSETS=new Set(['/site-footer.css','/site-footer.js']);
const PUBLIC_INFO_ASSETS=new Set([
  '/info-pages.css',
  '/public-info-footer.css',
  '/public-info-footer.js',
  '/news.html',
  '/news.css',
  '/news-bg.svg',
  '/nomad-live/styles.css',
  '/nomad-live/public-site-nav.css',
  '/nomad-live/site-footer.css',
  '/nomad-live/site-footer.js',
]);

function unavailable(message,status=503){
  return new Response(message,{status,headers:{
    'cache-control':'no-store',
    'content-type':'text/plain; charset=utf-8',
    'x-nomad-web':'3.41-production',
  }});
}

async function proxyApi(request,env,url){
  const enginePath=API_ROUTES.get(url.pathname);
  if(!enginePath) return unavailable('Production API route not found',404);
  if(!env?.PROD_ENGINE||typeof env.PROD_ENGINE.fetch!=='function'){
    return unavailable('Production Engine binding unavailable');
  }
  const internalUrl=new URL(enginePath+url.search,'https://nomadtips3-live-engine.internal');
  return env.PROD_ENGINE.fetch(new Request(internalUrl,request));
}

function legacyLiveRedirect(url){
  if(url.pathname==='/nomad-live/index.html'){
    return Response.redirect(new URL('/'+url.search,url.origin).toString(),302);
  }
  if(url.pathname==='/nomad-live/statistics.html'){
    return Response.redirect(new URL('/statistics.html'+url.search,url.origin).toString(),302);
  }
  return null;
}

async function proxyPredictions(request,url){
  if(url.pathname==='/soccer-predictions'){
    return Response.redirect(new URL('/soccer-predictions/'+url.search,url.origin).toString(),302);
  }
  if(!url.pathname.startsWith('/soccer-predictions/')) return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('Soccer Predictions route supports GET/HEAD only',405);
  }
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','soccer-predictions-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function isPublicInfoPath(pathname){
  if(PUBLIC_INFO_ASSETS.has(pathname))return true;
  if(pathname.startsWith('/nomad-live/assets/icons/'))return true;
  return PUBLIC_INFO_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'));
}

function isInfoOrPredictionsReferer(request){
  const raw=String(request.headers.get('referer')||'');
  if(!raw)return false;
  try{
    const pathname=new URL(raw).pathname;
    if(pathname==='/soccer-predictions'||pathname.startsWith('/soccer-predictions/'))return true;
    return PUBLIC_INFO_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'));
  }catch{
    return false;
  }
}

async function routeSharedFooterAsset(request,env,url){
  if(!ROOT_SHARED_FOOTER_ASSETS.has(url.pathname))return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('Footer assets support GET/HEAD only',405);
  }

  /* Signal and Statistics historically load /site-footer.* from the local
     3.41 asset bundle. Only the information pages and Soccer Predictions
     need the repository-root legacy asset. Keeping this split prevents the
     public-info bridge from replacing the original 3.41 footer. */
  if(!isInfoOrPredictionsReferer(request)){
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function'){
      return unavailable('Static assets unavailable');
    }
    return env.ASSETS.fetch(request);
  }

  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','root-footer-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function proxyPublicInfo(request,url){
  if(!isPublicInfoPath(url.pathname))return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('NOMADTIPS3 information routes support GET/HEAD only',405);
  }
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','public-info-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function proxyNomad342(request,env,url){
  if(url.pathname===NOMAD342_PREFIX){
    return Response.redirect(new URL(NOMAD342_PREFIX+'/'+url.search,url.origin).toString(),302);
  }
  if(!url.pathname.startsWith(NOMAD342_PREFIX+'/')) return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('NOMAD Live 3.42 route supports GET/HEAD only',405);
  }
  if(url.pathname===NOMAD342_PREFIX+'/feed'){
    if(!env?.EVENT_ENGINE||typeof env.EVENT_ENGINE.fetch!=='function'){
      return unavailable('NOMAD Live 3.42 Event Engine binding unavailable');
    }
    const internalUrl=new URL('/feed'+url.search,'https://nomadtips3-live-engine-342.internal');
    const response=await env.EVENT_ENGINE.fetch(new Request(internalUrl,request));
    const headers=new Headers(response.headers);
    headers.set('cache-control','no-store, max-age=0');
    headers.set('pragma','no-cache');
    headers.set('expires','0');
    headers.set('x-nomad-web','nomad-live-342-feed-binding');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','nomad-live-342-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function releaseResponse(){
  return Response.json({
    ok:true,
    service:'nomadtips3-live-web-production',
    version:'3.41',
    mode:'production',
  },{headers:{
    'cache-control':'no-store',
    'x-nomad-web':'3.41-production',
  }});
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/__nomad_release') return releaseResponse();
    if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
      return proxyApi(request,env,url);
    }
    const liveRedirect=legacyLiveRedirect(url);
    if(liveRedirect) return liveRedirect;
    const predictionsResponse=await proxyPredictions(request,url);
    if(predictionsResponse) return predictionsResponse;
    const nomad342Response=await proxyNomad342(request,env,url);
    if(nomad342Response) return nomad342Response;
    const sharedFooterResponse=await routeSharedFooterAsset(request,env,url);
    if(sharedFooterResponse) return sharedFooterResponse;
    const publicInfoResponse=await proxyPublicInfo(request,url);
    if(publicInfoResponse) return publicInfoResponse;
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function'){
      return unavailable('Static assets unavailable');
    }
    return env.ASSETS.fetch(request);
  },
};
