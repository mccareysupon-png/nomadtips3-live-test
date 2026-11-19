// Mask only the original sidebar number; never touch scripts, data, DOM nodes or click handlers.
export const maskCSS='[data-stat-market] > b, [data-stat-market] b { visibility: hidden !important; }';
const name='ball46-sidebar-css-only-test-20261119',origin='https://ball46.com';
const paths=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph']);
const pagePaths=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const reply=(o,status=200)=>Response.json(o,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return reply({ok:false,error:'READ_ONLY'},405);
 if(u.pathname==='/_mask_health')return reply({ok:true,name,mode:'CSS_ONLY',selector:maskCSS,extraDataRequests:0});
 if(!pagePaths.has(u.pathname)&&!paths.has(u.pathname)&&!( /^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return reply({ok:false,error:'PATH_NOT_ALLOWED'},404);
 const enabled=u.searchParams.get('b46_mask')!=='0';
 u.searchParams.delete('b46_mask');
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const dest=new URL(u.pathname+u.search,origin);
 const upstream=await env.B46_PRODUCTION_READ.fetch(new Request(dest,{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(upstream.headers);
 h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');h.set('x-b46-css-test',enabled?'on':'off');
 const loc=h.get('location');
 if(loc){const d=new URL(loc,origin);if(['ball46.com','www.ball46.com'].includes(d.hostname)){d.searchParams.set('b46_mask',enabled?'1':'0');h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}}
 const response=new Response(req.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
 if(req.method!=='GET'||!upstream.ok||!enabled||!pagePaths.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return response;
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 return new HTMLRewriter().on('head',{element(el){el.append('<style id="b46-css-only-mask">'+maskCSS+'</style>',{html:true})}}).transform(new Response(response.body,{status:response.status,headers:h}));
}};