import baseWorker from './index.js';

const FIVEUSD_ROUTES=new Map([
  ['/api/feed','/fiveusd-feed'],
  ['/api/config','/config'],
  ['/api/health','/health'],
  ['/api/fiveusd-feed','/fiveusd-feed'],
  ['/api/fiveusd-event-flow','/fiveusd-event-flow'],
  ['/api/fiveusd-referee-flow','/fiveusd-referee-flow'],
  ['/api/fiveusd-test-signals','/fiveusd-test-signals'],
  ['/api/fiveusd-test-referee','/fiveusd-test-referee'],
  ['/api/fiveusd-native','/fiveusd-native'],
]);

function unavailable(message,status=503){
  return new Response(message,{status,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-nomad-web':'3.41-fiveusd-main'}});
}

async function proxyFiveUsd(request,env,url){
  const enginePath=FIVEUSD_ROUTES.get(url.pathname);
  if(!enginePath)return null;
  if(!env?.FIVEUSD_ENGINE||typeof env.FIVEUSD_ENGINE.fetch!=='function')return unavailable('5USD Engine binding unavailable');
  const internalUrl=new URL(enginePath+url.search,'https://nomadtips3-live-engine-5usd.internal');
  const response=await env.FIVEUSD_ENGINE.fetch(new Request(internalUrl,request));
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-nomad-live-data','5usd-authority-test');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function injectFiveUsdUi(response){
  const type=String(response.headers.get('content-type')||'');
  if(!/text\/html/i.test(type)||!response.body)return response;
  return new HTMLRewriter()
    .on('head',{element(el){el.append('<link rel="stylesheet" href="/event-flow-341.css?v=20260913-main-v1"><link rel="stylesheet" href="/referee-price-flow-341.css?v=20260913-main-v1">',{html:true});}})
    .on('body',{element(el){el.append('<script src="/event-flow-341.js?v=20260913-main-v1" defer></script><script src="/referee-price-flow-341.js?v=20260913-main-v1" defer></script>',{html:true});}})
    .transform(response);
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const fiveUsd=await proxyFiveUsd(request,env,url);
    if(fiveUsd)return fiveUsd;
    const response=await baseWorker.fetch(request,env,ctx);
    if((url.pathname==='/'||url.pathname==='/index.html')&&request.method==='GET')return injectFiveUsdUi(response);
    return response;
  },
};
