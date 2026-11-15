// BALL46 B46-STAT-UI-01 real-page visual staging.
// GET-only mirror of the CURRENT PUBLIC ball46.com frontend; only cosmetic scoped CSS added.
// No Production writes, no secrets forwarded, and no Production Cloudflare Worker mutation.
import css from './live-staging-overlay.css';
const ORIGIN = 'https://ball46.com';
const stamp = 'B46-STAT-UI-01-real-ui-v1';
const json = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=UTF-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}
});
const baseHeaders = {
  'cache-control':'no-store, max-age=0',
  'x-robots-tag':'noindex, nofollow',
  'x-b46-staging':'REAL-UI-READONLY',
  'x-content-type-options':'nosniff'
};
export default {
  async fetch(request) {
    const u = new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return json({ok:false,error:'READ_ONLY_STAGING'},405);
    if (u.pathname === '/_b46_ui_health') return json({ok:true,mode:'real-frontend-read-only',stamp,origin:'ball46.com',productionWrites:0,overlay:'live-staging-overlay.css'});
    if (u.pathname === '/_b46_ui_overlay.css') return new Response(request.method==='HEAD'?null:css,{
      headers:{...baseHeaders,'content-type':'text/css; charset=UTF-8','x-b46-overlay':stamp}
    });
    if (u.pathname.startsWith('/_b46_')) return json({ok:false,error:'NOT_FOUND'},404);
    // Static/public GET routes only. No request bodies, credentials, cookies or authorization forwarded.
    const originURL = new URL(u.pathname + u.search,ORIGIN);
    const accept = request.headers.get('accept');
    const headers = new Headers();
    if(accept) headers.set('accept',accept.slice(0,256));
    // Some real Statistics reads transiently return 599 on the original site.
    // Staging may retry the SAME GET only; no writes, no historical calculation.
    const readOnce = () => fetch(originURL.toString(), {
      method:request.method,headers,redirect:'manual',
      cf:{cacheTtl:0,cacheEverything:false}
    });
    let upstream = await readOnce();
    if (u.pathname === '/api/engine/statistics' && [502,503,504,599].includes(upstream.status)) {
      for (let attempt=0; attempt<2 && [502,503,504,599].includes(upstream.status); attempt++) {
        try { await upstream.body?.cancel(); } catch {}
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt+1)));
        upstream = await readOnce();
      }
    }
    const h = new Headers(upstream.headers);
    for(const x of ['set-cookie','content-length','content-encoding','etag','content-security-policy','content-security-policy-report-only','access-control-allow-origin','transfer-encoding']) h.delete(x);
    Object.entries(baseHeaders).forEach(([k,v])=>h.set(k,v));
    // Prevent accidental redirects to a Production URL when viewing the staging site.
    const location=h.get('location');
    if(location){
      const dest=new URL(location,ORIGIN);
      if(dest.origin===ORIGIN){h.set('location',u.origin+dest.pathname+dest.search+dest.hash);}
    }
    // A scope-limited staging-only patch of the CURRENT chart module's own CSS:
    // style element from the renderer is appended after our HTML stylesheet on load.
    // Make its final CSS include the thin-line, 50/50 layout so later paints cannot
    // restore the old full-width geometry. The executable loader/render logic stays unchanged.
    if(request.method==='GET' && upstream.ok && u.pathname==='/longterm-performance-343.js'){
      const source=await upstream.text();
      const begin='const f46CSS=',end=';let f46Geo=';
      const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
      let patched=source;
      let status='NOT_PATCHED_SOURCE_DRIFT';
      if(a>=0 && b>a && source.indexOf(begin,a+begin.length)===-1){
        try{
          const originalCSS=JSON.parse(source.slice(a+begin.length,b));
          if(typeof originalCSS==='string' && originalCSS.includes('.f46-line')){
            patched=source.slice(0,a+begin.length)
                +JSON.stringify(originalCSS+'\n'+css)
                +source.slice(b);
            status='CURRENT_RENDERER_CSS_PATCHED';
          }
        }catch{}
      }
      h.set('content-type','application/javascript; charset=UTF-8');
      h.set('x-b46-renderer-css',status);
      return new Response(patched,{status:upstream.status,headers:h});
    }
    const ct=upstream.headers.get('content-type')||'';
    if (request.method==='GET' && upstream.ok && ct.includes('text/html')){
      const original = await upstream.text();
      const inject = '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/_b46_ui_overlay.css?v=20261115" data-b46-staging-overlay="1">';
      const html = original.includes('</head>') ? original.replace('</head>',inject+'</head>') : original;
      h.set('content-type','text/html; charset=UTF-8');
      h.set('x-b46-overlay',original.includes('</head>')?stamp:'INJECTION_ANCHOR_MISSING');
      return new Response(html,{status:upstream.status,headers:h});
    }
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
  }
};
