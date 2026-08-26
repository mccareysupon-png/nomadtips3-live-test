const API_ROUTES=new Map([
  ['/api/feed','/feed'],
  ['/api/statistics','/statistics'],
  ['/api/config','/config'],
  ['/api/health','/health'],
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
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function'){
      return unavailable('Static assets unavailable');
    }
    return env.ASSETS.fetch(request);
  },
};
