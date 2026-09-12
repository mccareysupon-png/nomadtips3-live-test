const LEGACY_API_ROUTES=new Map([
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
  '/info-pages.css','/public-info-footer.css','/public-info-footer.js','/news.html','/news.css','/news-bg.svg',
  '/nomad-live/styles.css','/nomad-live/public-site-nav.css','/nomad-live/site-footer.css','/nomad-live/site-footer.js',
]);
const NO_STORE_343=new Set(['/','/index.html','/live.js','/full-odds-main-343.js','/event-flow-343.js','/event-flow-343.css','/statistics.html','/statistics.js','/statistics-page-343.css','/settings.html','/settings.js','/signal.html','/signal.js','/signal-compact-343.css','/signal-bettor-343.css']);

const num=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const copy=value=>value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value??null;

function unavailable(message,status=503){
  return new Response(message,{status,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-nomad-web':'3.43-production'}});
}
function engineRequest(request,path){const u=new URL(request.url);u.protocol='https:';u.hostname='engine.internal';u.pathname=path;return new Request(u,request)}
function fullMarketRequest(request,path){const u=new URL(request.url);u.protocol='https:';u.hostname='full-market.internal';u.pathname=path;return new Request(u,request)}

async function proxyLegacyApi(request,env,url){
  const enginePath=LEGACY_API_ROUTES.get(url.pathname);
  if(!enginePath)return null;
  if(!env?.PROD_ENGINE||typeof env.PROD_ENGINE.fetch!=='function')return unavailable('Legacy Production Engine binding unavailable');
  const internalUrl=new URL(enginePath+url.search,'https://nomadtips3-live-engine.internal');
  return env.PROD_ENGINE.fetch(new Request(internalUrl,request));
}
function fixtureIsLive(fixture){
  const raw=String(fixture?.boardState??fixture?.status??fixture?.statusCode??'').toLowerCase();
  if(fixture?.boardState==='finished'||/finished|full_time|full time|\bft\b|ended/.test(raw))return false;
  return fixture?.boardState==='live'||/in_play|in play|live|playing|first|second|\b1h\b|\b2h\b/.test(raw);
}
function liveMinute(fixture){const direct=num(fixture?.minute);if(direct!==null)return direct;const m=String(fixture?.statusCode??'').match(/\d+/);return m?Number(m[0]):null}
async function activeSignals(request,env){
  if(!env?.ENGINE||typeof env.ENGINE.fetch!=='function')return unavailable('3.43 Engine binding unavailable');
  const [signalResponse,boardResponse]=await Promise.all([env.ENGINE.fetch(engineRequest(request,'/signals')),env.ENGINE.fetch(engineRequest(request,'/board'))]);
  const [signalData,boardData]=await Promise.all([signalResponse.json().catch(()=>({})),boardResponse.json().catch(()=>({}))]);
  if(signalData?.ok!==true)return Response.json(signalData||{ok:false,error:'SIGNALS_NOT_READY'},{status:signalResponse.status||503});
  if(boardData?.ok!==true)return Response.json({ok:false,error:'BOARD_NOT_READY',signals:[]},{status:boardResponse.status||503});
  const fixtures=Array.isArray(boardData?.fixtures)?boardData.fixtures:[],liveFixtures=fixtures.filter(fixtureIsLive),liveFixtureMap=new Map(liveFixtures.map(f=>[String(f?.fixtureId??''),f]));
  let hiddenPendingSignals=0;
  const pending=Array.isArray(signalData?.signals)?signalData.signals:[];
  const signals=pending.filter(signal=>{const visible=liveFixtureMap.has(String(signal?.fixtureId??''));if(!visible)hiddenPendingSignals+=1;return visible}).map(signal=>{
    const fixture=liveFixtureMap.get(String(signal.fixtureId));return {...signal,mirrorMinute:liveMinute(fixture),mirrorScore:copy(fixture?.goals),mirrorState:'LIVE',mirrorSource:'ENGINE_BOARD_LIVE',liveStatistics:copy(fixture?.statistics),liveCorners:copy(fixture?.corners),liveCards:copy(fixture?.cards),liveEvents:Array.isArray(fixture?.events)?copy(fixture.events):[],liveStatus:fixture?.status??null,liveStatusCode:fixture?.statusCode??null,liveUpdatedAt:boardData?.hubFetchedAt??null,liveAgeMs:num(boardData?.hubAgeMs)};
  }).sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));
  const activeMatches=new Set(signals.map(s=>String(s.fixtureId))).size;
  return Response.json({...signalData,signals,mirror:{source:'ENGINE_BOARD_LIVE',externalRequestsAdded:0,boardFixtures:fixtures.length,liveFixtures:liveFixtures.length,activeMatches,activeSignals:signals.length,hiddenPendingSignals,hubFetchedAt:boardData?.hubFetchedAt??null,hubAgeMs:num(boardData?.hubAgeMs),stale:Boolean(boardData?.stale)}},{headers:{'cache-control':'no-store'}});
}
async function proxyEngineApi(request,env,url){
  if(!url.pathname.startsWith('/api/engine/'))return null;
  if(!env?.ENGINE||typeof env.ENGINE.fetch!=='function')return unavailable('3.43 Engine binding unavailable');
  if(url.pathname==='/api/engine/signals'&&request.method==='GET')return activeSignals(request,env);
  const path=url.pathname.replace('/api/engine','')||'/';
  return env.ENGINE.fetch(engineRequest(request,path));
}
async function proxyFullMarket(request,env,url){
  if(!url.pathname.startsWith('/api/full-market/'))return null;
  if(!env?.FULL_MARKET||typeof env.FULL_MARKET.fetch!=='function')return unavailable('3.43 Full Market binding unavailable');
  const path=url.pathname.replace('/api/full-market','')||'/';
  return env.FULL_MARKET.fetch(fullMarketRequest(request,path));
}
function legacyLiveRedirect(url){
  if(url.pathname==='/nomad-live/index.html')return Response.redirect(new URL('/'+url.search,url.origin).toString(),302);
  if(url.pathname==='/nomad-live/statistics.html')return Response.redirect(new URL('/statistics.html'+url.search,url.origin).toString(),302);
  return null;
}
async function proxyPredictions(request,url){
  if(url.pathname==='/soccer-predictions')return Response.redirect(new URL('/soccer-predictions/'+url.search,url.origin).toString(),302);
  if(!url.pathname.startsWith('/soccer-predictions/'))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable('Soccer Predictions route supports GET/HEAD only',405);
  return proxyGithub(request,url,'soccer-predictions-bridge');
}
async function proxyPrediction3(request,url){
  if(url.pathname==='/prediction3')return Response.redirect(new URL('/prediction3/'+url.search,url.origin).toString(),302);
  if(!url.pathname.startsWith('/prediction3/'))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable('Prediction3 route supports GET/HEAD only',405);
  return proxyGithub(request,url,'prediction3-manual-bridge');
}
async function proxyGithub(request,url,marker){
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN),response=await fetch(new Request(upstreamUrl.toString(),request)),headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');headers.set('pragma','no-cache');headers.set('expires','0');headers.set('x-nomad-web',marker);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function isPublicInfoPath(pathname){if(PUBLIC_INFO_ASSETS.has(pathname))return true;if(pathname.startsWith('/nomad-live/assets/icons/'))return true;return PUBLIC_INFO_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'))}
function isInfoOrPredictionsReferer(request){
  const raw=String(request.headers.get('referer')||'');if(!raw)return false;
  try{const pathname=new URL(raw).pathname;if(pathname==='/soccer-predictions'||pathname.startsWith('/soccer-predictions/'))return true;if(pathname==='/prediction3'||pathname.startsWith('/prediction3/'))return true;return PUBLIC_INFO_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'))}catch{return false}
}
async function routeSharedFooterAsset(request,env,url){
  if(!ROOT_SHARED_FOOTER_ASSETS.has(url.pathname))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable('Footer assets support GET/HEAD only',405);
  if(isInfoOrPredictionsReferer(request))return proxyGithub(request,url,'root-footer-bridge');
  if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')return unavailable('Static assets unavailable');
  return env.ASSETS.fetch(request);
}
async function proxyPublicInfo(request,url){
  if(!isPublicInfoPath(url.pathname))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable('NOMADTIPS3 information routes support GET/HEAD only',405);
  return proxyGithub(request,url,'public-info-bridge');
}
async function proxyNomad342(request,env,url){
  if(url.pathname===NOMAD342_PREFIX)return Response.redirect(new URL(NOMAD342_PREFIX+'/'+url.search,url.origin).toString(),302);
  if(!url.pathname.startsWith(NOMAD342_PREFIX+'/'))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return unavailable('NOMAD Live 3.42 route supports GET/HEAD only',405);
  if(url.pathname===NOMAD342_PREFIX+'/feed'){
    if(!env?.EVENT_ENGINE||typeof env.EVENT_ENGINE.fetch!=='function')return unavailable('NOMAD Live 3.42 Event Engine binding unavailable');
    const internalUrl=new URL('/feed'+url.search,'https://nomadtips3-live-engine-342.internal'),response=await env.EVENT_ENGINE.fetch(new Request(internalUrl,request)),headers=new Headers(response.headers);
    headers.set('cache-control','no-store, max-age=0');headers.set('pragma','no-cache');headers.set('expires','0');headers.set('x-nomad-web','nomad-live-342-feed-binding');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
  return proxyGithub(request,url,'nomad-live-342-bridge');
}
async function noStoreAsset(request,env,url){
  if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')return unavailable('Static assets unavailable');
  const assetUrl=new URL(request.url);if(url.pathname==='/')assetUrl.pathname='/index.html';
  const response=await env.ASSETS.fetch(new Request(assetUrl,request)),headers=new Headers(response.headers);
  if(NO_STORE_343.has(url.pathname)||url.pathname==='/'){headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('pragma','no-cache');headers.set('expires','0')}
  headers.set('x-nomad-web','3.43-production');
  if(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/live.js'||url.pathname==='/full-odds-main-343.js'||url.pathname.startsWith('/event-flow-343'))headers.set('x-nomad-live-revision','343-live-full-market-v1');
  if(url.pathname.startsWith('/statistics'))headers.set('x-nomad-stat-revision','343-stat-results-v7-live-mirror');
  if(url.pathname.startsWith('/signal'))headers.set('x-nomad-signal-revision','343-signal-bettor-v4');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function releaseResponse(){return Response.json({ok:true,service:'nomadtips3-live-web-production',version:'3.43',mode:'production',engine:'nomadtips3-engine-343',cadenceMs:3000},{headers:{'cache-control':'no-store','x-nomad-web':'3.43-production'}})}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/__nomad_release')return releaseResponse();
    const engineResponse=await proxyEngineApi(request,env,url);if(engineResponse)return engineResponse;
    const fullMarketResponse=await proxyFullMarket(request,env,url);if(fullMarketResponse)return fullMarketResponse;
    const legacyApiResponse=await proxyLegacyApi(request,env,url);if(legacyApiResponse)return legacyApiResponse;
    const redirect=legacyLiveRedirect(url);if(redirect)return redirect;
    const predictionsResponse=await proxyPredictions(request,url);if(predictionsResponse)return predictionsResponse;
    const prediction3Response=await proxyPrediction3(request,url);if(prediction3Response)return prediction3Response;
    const nomad342Response=await proxyNomad342(request,env,url);if(nomad342Response)return nomad342Response;
    const sharedFooterResponse=await routeSharedFooterAsset(request,env,url);if(sharedFooterResponse)return sharedFooterResponse;
    const publicInfoResponse=await proxyPublicInfo(request,url);if(publicInfoResponse)return publicInfoResponse;
    return noStoreAsset(request,env,url);
  }
};
