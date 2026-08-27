const TEST_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const ALLOWED=new Set([
  '/index.html','/statistics.html','/health.html','/styles.css','/m88-observer.js','/app.js','/totalcorner-live.js','/health-live.js'
]);
const BLOCKED=new Set(['/settings.html']);

const TEST_HEADERS={
  'x-robots-tag':'noindex, nofollow, noarchive',
  'cache-control':'no-store'
};

const withHeaders=response=>{
  const headers=new Headers(response.headers);
  Object.entries(TEST_HEADERS).forEach(([key,value])=>headers.set(key,value));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};

export default {
  async fetch(request,env){
    const url=new URL(request.url);

    if(url.pathname==='/'){
      const target=new URL('/index.html',url.origin);
      target.search=url.search;
      return new Response(null,{status:302,headers:{...TEST_HEADERS,location:target.toString()}});
    }

    if(BLOCKED.has(url.pathname)){
      return new Response('Not available in 3.42 browser test',{status:404,headers:TEST_HEADERS});
    }

    if(url.pathname==='/runtime-config.js'){
      const body=`(()=>{window.NOMAD342_RUNTIME=Object.freeze({version:'3.42',environment:'TEST',engineBase:'${TEST_ENGINE}',feedPath:'/feed',pollMs:10000,requestTimeoutMs:9000});})();`;
      return new Response(body,{headers:{'content-type':'application/javascript; charset=utf-8',...TEST_HEADERS}});
    }

    if(!ALLOWED.has(url.pathname)){
      return new Response('Not found',{status:404,headers:TEST_HEADERS});
    }

    return withHeaders(await env.ASSETS.fetch(request));
  }
};
