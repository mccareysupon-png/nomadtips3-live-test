const SEALED_MARKER='NOMAD_TEST_WEB_SEALED';

const SEALED_PAGE=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>NOMAD Live 3.41 TEST · Sealed</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071b15;color:#e9f7f0;font:16px/1.5 system-ui,sans-serif}.lock{width:min(520px,calc(100% - 32px));padding:34px;border:1px solid #2a614e;border-radius:18px;background:#0d2b22;box-shadow:0 24px 70px #0008}.eyebrow{margin:0 0 10px;color:#73d5aa;font-size:.78rem;font-weight:800;letter-spacing:.14em}.lock h1{margin:0 0 12px;font-size:clamp(1.65rem,5vw,2.5rem)}.lock p{margin:0;color:#b8d4c8}.marker{display:block;margin-top:22px;color:#739888;font:700 .72rem/1.4 ui-monospace,monospace;letter-spacing:.08em}
  </style>
</head>
<body>
  <main class="lock">
    <p class="eyebrow">NOMAD LIVE 3.41 · TEST</p>
    <h1>Test web is sealed</h1>
    <p>Owner access is not configured yet. Live pages and engine connections remain locked.</p>
    <span class="marker">${SEALED_MARKER}</span>
  </main>
</body>
</html>`;

const SEALED_HEADERS={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'x-nomad-web-mode':'SEALED',
  'x-robots-tag':'noindex, nofollow, noarchive',
};

const API_ROUTES=new Map([
  ['/api/feed','/feed'],
  ['/api/statistics','/statistics'],
  ['/api/config','/config'],
  ['/api/health','/health'],
]);

function unavailable(message,status=503){
  return new Response(message,{status,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
}

async function proxyApi(request,env,url){
  const enginePath=API_ROUTES.get(url.pathname);
  if(!enginePath) return unavailable('TEST API route not found',404);
  if(!env?.TEST_ENGINE||typeof env.TEST_ENGINE.fetch!=='function'){
    return unavailable('TEST Engine binding unavailable');
  }
  const internalUrl=new URL(enginePath+url.search,'https://nomadtips3-live-engine-test.internal');
  return await env.TEST_ENGINE.fetch(new Request(internalUrl,request));
}

export function sealedResponse(){
  return new Response(SEALED_PAGE,{status:403,headers:SEALED_HEADERS});
}

export default {
  async fetch(request,env){
    if(env?.NOMAD_WEB_MODE!=='open') return sealedResponse();
    const url=new URL(request.url);
    if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
      return proxyApi(request,env,url);
    }
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function'){
      return new Response('Static assets unavailable',{status:503,headers:{'cache-control':'no-store'}});
    }
    return env.ASSETS.fetch(request);
  },
};
