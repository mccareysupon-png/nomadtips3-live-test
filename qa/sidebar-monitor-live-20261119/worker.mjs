// Mask only the original sidebar number; never touch scripts, data, DOM nodes or click handlers.
import {snapshot} from './snapshot.mjs';
import {browserBridge,valid} from './monitor.mjs';
export {MonitorRateCache} from './monitor.mjs';
const monitorScript='<script data-b46-monitor-bridge="1">;('+browserBridge.toString()+')();</script>';
const delay=ms=>new Promise(resolve=>setTimeout(()=>resolve(null),ms));
const cache=env=>env.B46_MONITOR_CACHE.getByName('receiver-rates-v1');
const baseCSS='[data-stat-market] > b, [data-stat-market] b { visibility: hidden !important; }';
const rules='[data-stat-market]{position:relative!important;}[data-stat-market] > span.b46-rate-snapshot-v2{position:absolute!important;inset-inline-end:10px!important;top:50%!important;transform:translateY(-50%)!important;pointer-events:none!important;visibility:visible!important;display:block!important;font-size:11px!important;font-weight:700!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important;line-height:1.2!important;}';
export const maskCSS=baseCSS+'\n'+rules;
function label(key){
 if(!Object.hasOwn(snapshot.rates,key))return '';
 const v=snapshot.rates[key],text=v===null?'—':v.toFixed(2)+'%',tone=v===null?'inherit':v>50?'#168b57':v<50?'#d54b60':'#ba8b20';
 return '<span class="b46-rate-snapshot-v2" data-b46-rate-snapshot="'+key+'" title="Opening snapshot; waiting for native graph refresh" style="color:'+tone+'!important">'+text+'</span>';
}
const name='ball46-sidebar-monitor-live-test-20261119',origin='https://ball46.com';
const paths=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph']);
const pagePaths=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const reply=(o,status=200)=>Response.json(o,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export default {async fetch(req,env,ctx){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return reply({ok:false,error:'READ_ONLY'},405);
 if(u.pathname==='/_mask_health'){
 let current=null;try{const r=await cache(env).fetch('https://monitor.internal/cached');current=await r.json()}catch{}
 return reply({ok:true,name,mode:'LIVE_MONITOR_TEST',selector:maskCSS,snapshot,current,extraBrowserDataRequests:0});
 }
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
 // Read the response clone only on the native graph route. Keep original body and status unchanged.
 if(req.method==='GET'&&upstream.ok&&u.pathname==='/b46-receiver-v1/graph'){
  const job=(async()=>{
   const data=await upstream.clone().json();
   if(!data.ok||!Number.isSafeInteger(data.sequence)||data.sequence<0)return null;
   const rr=await cache(env).fetch('https://monitor.internal/refresh?sequence='+data.sequence);
   if(!rr.ok)return null;
   const v=await rr.json();
   if(!valid(v.snapshot)||v.snapshot.sequence<data.sequence)return null;
   return v.snapshot;
  })().catch(()=>null);
  ctx.waitUntil(job);
  const live=await Promise.race([job,delay(350)]);
  if(valid(live))h.set('x-b46-monitor-rates',JSON.stringify(live));
 }
 const response=new Response(req.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
 if(req.method!=='GET'||!upstream.ok||!enabled||!pagePaths.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return response;
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 return new HTMLRewriter().on('head',{element(el){el.append('<meta name="b46-winrate-mode" content="receiver-live"><style id="b46-css-only-mask">'+maskCSS+'</style>'+monitorScript+'',{html:true})}}).on('[data-stat-market]',{element(el){const html=label(el.getAttribute('data-stat-market'));if(html)el.append(html,{html:true})}}).transform(new Response(response.body,{status:response.status,headers:h}));
}};