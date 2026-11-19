// Dedicated preview only. No API requests or calculations in overlay; no native renderer changes.
export function monitorOverlay(){
 const aliases={all:'all',total:'all','1x2':'1x2',ah:'ah','o/u':'ou',ou:'ou',btts:'btts',corners:'corners',cards:'cards',other:'other'};
 const names=['all','1x2','ah','ou','btts','corners','cards','other'];
 const cls='b46-monitor-rate-mask-v1', flag='data-b46-monitor-original';
 const values=new Map();let seq=-1;
 const normalize=k=>aliases[String(k??'').trim().toLowerCase()];
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
 const styleId='b46-monitor-rate-mask-style';
 function paint(){
  if(!document.head)return;
  if(!document.getElementById(styleId)){
   const style=document.createElement('style');style.id=styleId;
   style.textContent='[data-stat-market] b['+flag+']{display:none!important}[data-stat-market] .'+cls+'{display:inline-block!important;font:inherit;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;margin-inline-start:auto;flex-shrink:0;pointer-events:none}';
   document.head.append(style);
  }
  for(const button of document.querySelectorAll('[data-stat-market]')){
   const key=normalize(button.dataset.statMarket),original=button.querySelector('b');
   if(!key||!original)continue;
   let label=button.querySelector('.'+cls);
   if(!label){label=document.createElement('span');label.className=cls;original.insertAdjacentElement('afterend',label)}
   const v=values.get(key),display=v==null?'—':v.toFixed(2)+'%';
   if(label.textContent!==display)label.textContent=display;
   label.title=v==null?'Monitor has not supplied an eligible Win Rate':'Win Rate from existing all-time monitor';
   original.setAttribute(flag,'');
  }
 }
 window.__B46_MONITOR_MASK_V1=function(g){
  try{
   if(!g||!Number.isSafeInteger(g.sequence)||g.sequence<seq)return;
   if(g.sequence>seq){values.clear();seq=g.sequence}
   const map=g.sidebarWinRates??g.sidebar_win_rate;
   if(map&&typeof map==='object'){
    for(const [k,entry] of Object.entries(map)){
     const name=normalize(k);if(!name)continue;
     const v=entry&&typeof entry==='object'?(entry.rate??entry.winRate??entry.win_rate):entry;
     if(entry&&typeof entry==='object'&&entry.settled===0){values.set(name,null);continue}
     if(v===null||finite(v))values.set(name,v);
    }
   }
   // Use the already-returned all-time native monitor point only; never use filtered/ranged data or scan history.
   const m=normalize(g.market);
   if(m&&g.range==='all'&&g.variant==='all'&&g.filter==='all'&&!values.has(m)){
    const c=g.counts,eligibleKeys=['WIN','HALF_WIN','LOSS','HALF_LOSS'];
    if(c&&eligibleKeys.every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)){
     if(eligibleKeys.every(k=>c[k]===0))values.set(m,null);
     else{
      const v=g.winRate??g.win_rate??g.summary?.winRate??g.summary?.win_rate??g.series?.rate?.at(-1)?.value;
      if(finite(v))values.set(m,v);
     }
    }
   }
   paint();
  }catch{/* native graph and history must remain unaffected */}
 };
}
export function patchChart(source){
 const anchor="b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');";
 if(source.split(anchor).length!==2)return {source,status:'SOURCE_DRIFT'};
 if(source.includes('__B46_MONITOR_MASK_V1'))return {source,status:'ALREADY_PATCHED'};
 return {source:';('+monitorOverlay.toString()+')();\n'+source.replace(anchor,anchor+'\ntry{queueMicrotask(()=>window.__B46_MONITOR_MASK_V1?.(g))}catch{}'),status:'OVERLAY_ONLY'};
}
const origin='https://www.ball46.com';
const allowed=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph']);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return reply({ok:false,error:'READ_ONLY'},405);
 if(u.pathname==='/_overlay_health')return reply({ok:true,mode:'monitor-mask-preview',productionWrites:0,additionalMonitorRequests:0});
 if(!allowed.has(u.pathname)&&!['/','/statistics','/index'].includes(u.pathname)&&!/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/.test(u.pathname))return reply({ok:false,error:'NOT_ALLOWED'},404);
 if(u.pathname.startsWith('/api/')&&!allowed.has(u.pathname))return reply({ok:false,error:'NOT_ALLOWED'},404);
 if(!env.B46_PRODUCTION_READ)return reply({ok:false,error:'BINDING_MISSING'},503);
 const headers=new Headers();const accept=request.headers.get('accept');if(accept)headers.set('accept',accept.slice(0,256));
 const upstream=await env.B46_PRODUCTION_READ.fetch(new Request(origin+u.pathname+u.search,{method:request.method,headers,redirect:'manual'}));
 const h=new Headers(upstream.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');h.set('x-b46-preview','monitor-mask-only');h.set('cache-control','no-store');
 const loc=h.get('location');if(loc){const d=new URL(loc,origin);if(['www.ball46.com','ball46.com'].includes(d.hostname))h.set('location',u.origin+d.pathname+d.search+d.hash)}
 if(request.method==='GET'&&upstream.ok&&u.pathname==='/longterm-performance-343.js'){
  const out=patchChart(await upstream.text());for(const k of ['content-length','content-encoding','etag','transfer-encoding'])h.delete(k);
  h.set('content-type','application/javascript; charset=utf-8');h.set('x-b46-monitor-overlay',out.status);
  return new Response(out.source,{status:upstream.status,headers:h});
 }
 return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
}};