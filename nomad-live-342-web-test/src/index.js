const TEST_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const ALLOWED=new Set([
  '/index.html','/statistics.html','/styles.css','/m88-observer.js','/app.js','/totalcorner-live.js'
]);
const BLOCKED=new Set(['/settings.html','/health.html']);

const withHeaders=response=>{
  const headers=new Headers(response.headers);
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(BLOCKED.has(url.pathname)) return new Response('Not available in 3.42 browser test',{status:404,headers:{'x-robots-tag':'noindex, nofollow, noarchive','cache-control':'no-store'}});
    if(url.pathname==='/runtime-config.js'){
      const body=`(()=>{window.NOMAD342_RUNTIME=Object.freeze({version:'3.42',environment:'TEST',engineBase:'${TEST_ENGINE}',feedPath:'/feed',pollMs:10000,requestTimeoutMs:9000});})();`;
      return new Response(body,{headers:{'content-type':'application/javascript; charset=utf-8','x-robots-tag':'noindex, nofollow, noarchive','cache-control':'no-store'}});
    }
    const path=url.pathname==='/'?'/index.html':url.pathname;
    if(!ALLOWED.has(path)) return new Response('Not found',{status:404,headers:{'x-robots-tag':'noindex, nofollow, noarchive','cache-control':'no-store'}});
    const assetUrl=new URL(request.url);
    assetUrl.pathname=path;
    return withHeaders(await env.ASSETS.fetch(new Request(assetUrl,request)));
  }
};
