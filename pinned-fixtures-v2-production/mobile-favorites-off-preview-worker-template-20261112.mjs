// BALL46_MOBILE_FAVORITES_OFF_PREVIEW_20261112
// These placeholders are replaced at build time using verified current Worker sources.
const STAGE_HTML=__STAGE_HTML__;
const STAGE_DASH=__STAGE_DASH__;
const ORIGIN='https://ball46.com';
const PAGE_PATHS=new Set(['/','/index.html']);
const DASH_PATH='/dashboard-v2-stage3-featured-facts-20261013a.js';

export default {
  async fetch(request) {
    const input=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-origin':'*','x-robots-tag':'noindex, nofollow'}});
    if(!['GET','HEAD'].includes(request.method))
      return new Response('Read-only test preview: method disabled',{status:405,headers:{Allow:'GET, HEAD, OPTIONS','cache-control':'no-store'}});
    if(PAGE_PATHS.has(input.pathname))
      return new Response(request.method==='HEAD'?null:STAGE_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-ball46-stage':'mobile-favorites-off'}});
    if(input.pathname===DASH_PATH)
      return new Response(request.method==='HEAD'?null:STAGE_DASH,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-ball46-stage':'mobile-favorites-off'}});
    // GET-only passthrough for public images, stylesheets and match data.
    const target=new URL(input.pathname+input.search,ORIGIN);
    const headers=new Headers();
    for(const h of ['accept','accept-language','if-none-match','if-modified-since','user-agent'])
      if(request.headers.has(h))headers.set(h,request.headers.get(h));
    const upstream=await fetch(new Request(target,{method:request.method,headers,redirect:'follow'}));
    const outHeaders=new Headers(upstream.headers);
    outHeaders.set('cache-control','no-store');
    outHeaders.set('x-robots-tag','noindex, nofollow');
    outHeaders.set('x-ball46-stage','mobile-favorites-off');
    outHeaders.delete('set-cookie');
    outHeaders.delete('content-security-policy-report-only');
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:outHeaders});
  }
};
