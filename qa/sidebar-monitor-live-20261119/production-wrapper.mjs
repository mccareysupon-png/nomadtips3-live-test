// Additive site presentation only; native entrypoint, API body, all other requests unchanged.
import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import {BRIDGE_SOURCE} from './b46-sidebar-monitor-client-source-20261119.mjs';
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const pagePaths=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const scriptPath='/b46-sidebar-monitor-client-20261119.js';
const CSS='.b46-rate-snapshot-v2{display:none!important}@media (min-width:1024px){.left-rail [data-stat-market] > b,.left-rail [data-stat-market] b{visibility:hidden!important}.left-rail [data-stat-market]{position:relative!important}.left-rail [data-stat-market] > span.b46-rate-snapshot-v2{position:absolute!important;inset-inline-end:10px!important;top:50%!important;transform:translateY(-50%)!important;pointer-events:none!important;visibility:visible!important;display:block!important;font-size:10px!important;font-weight:700!important;font-family:Inter,Arial,sans-serif!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important;line-height:1.2!important}}';
const valid=s=>s&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&s.rates&&Object.keys(s.rates).length===8&&keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])&&s.rates[k]>=0&&s.rates[k]<=100));
const pause=ms=>new Promise(r=>setTimeout(()=>r(null),ms));
async function read(env,path){const r=await env.B46_SIDEBAR_MONITOR.fetch(new Request('https://monitor.internal'+path));if(!r.ok)return null;const d=await r.json();return valid(d.snapshot)?d.snapshot:null}
function mark(k,s){
 if(!keys.includes(k))return '';
 const v=s?s.rates[k]:null;
 const color=v===null?'inherit':v>50?'#168b57':v<50?'#d54b60':'#ba8b20';
 const seq=s?' data-b46-monitor-sequence="'+s.sequence+'"':'';
 return '<span class="b46-rate-snapshot-v2" data-b46-rate-snapshot="'+k+'"'+seq+' title="'+(s?'Receiver Win Rate · sequence '+s.sequence:'Receiver Win Rate unavailable')+'" style="color:'+color+'!important;font-size:10px!important;font-weight:700!important;font-family:Inter,Arial,sans-serif!important">'+(v===null?'—':v.toFixed(2)+'%')+'</span>';
}
export default {...original,async fetch(req,env,ctx){
 const u=new URL(req.url);
 if(u.pathname===scriptPath&&['GET','HEAD'].includes(req.method))return new Response(req.method==='HEAD'?null:BRIDGE_SOURCE,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
 // Preserve the entire native mobile response, including graph API and navigation drawer.
 if(req.headers.get('sec-ch-ua-mobile')==='?1'||/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(req.headers.get('user-agent')||''))return original.fetch(req,env,ctx);
 const graph=req.method==='GET'&&u.pathname==='/b46-receiver-v1/graph';
 const page=req.method==='GET'&&pagePaths.has(u.pathname);
 const cached=graph||page?read(env,'/cached').catch(()=>null):Promise.resolve(null);
 const res=await original.fetch(req,env,ctx);
 if(req.method!=='GET'||!res.ok)return res;
 if(graph){
  const h=new Headers(res.headers);
  const native=res.clone().json().catch(()=>null);
  const job=(async()=>{
   const d=await native;
   if(!d?.ok||!Number.isSafeInteger(d.sequence)||d.sequence<0)return null;
   const current=await cached;
   if(valid(current)&&current.sequence>=d.sequence)return current;
   const v=await read(env,'/refresh?sequence='+d.sequence);
   return valid(v)&&v.sequence>=d.sequence?v:null;
  })().catch(()=>null);
  ctx.waitUntil(job);const s=await Promise.race([job,pause(25)]);
  if(!valid(s))return res;
  h.set('x-b46-monitor-rates',JSON.stringify(s));return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
 }
 if(!pagePaths.has(u.pathname)||!res.headers.get('content-type')?.includes('text/html'))return res;
 const s=await Promise.race([cached,pause(25)]);
 const h=new Headers(res.headers);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.prepend('<script src="'+scriptPath+'"></script>',{html:true});e.append('<style id="b46-css-only-mask">'+CSS+'</style>',{html:true})}}).on('.left-rail [data-stat-market]',{element(e){const k=e.getAttribute('data-stat-market');if(keys.includes(k))e.append(mark(k,valid(s)?s:null),{html:true})}}).transform(new Response(res.body,{status:res.status,statusText:res.statusText,headers:h}));
}};