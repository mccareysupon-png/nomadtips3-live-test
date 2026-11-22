// TEST-only proxy: reads production and existing sidebar monitor; never writes.
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const valid=s=>s&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&s.rates&&keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])&&s.rates[k]>=0&&s.rates[k]<=100));
const JS=`(()=>{'use strict';
if(window.__b46SidebarFirstPaintTest)return;window.__b46SidebarFirstPaintTest=true;
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const state=window.__b46SidebarFirstPaintState={requested:0,updated:0,source:'pending'};
function valid(s){return s&&Number.isSafeInteger(s.sequence)&&s.rates&&keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])))}
function paint(s){if(!valid(s))return;document.querySelectorAll('.left-rail [data-b46-rate-snapshot]').forEach(el=>{
 const k=el.dataset.b46RateSnapshot;if(!keys.includes(k)||Number(el.dataset.b46MonitorSequence||-1)>s.sequence)return;
 const v=s.rates[k],label=v===null?'—':v.toFixed(2)+'%';
 if(el.textContent!==label){el.textContent=label;state.updated++}
 el.style.setProperty('color',v===null?'inherit':v>50?'#168b57':v<50?'#d54b60':'#ba8b20','important');
 el.dataset.b46MonitorSequence=String(s.sequence);el.dataset.b46MonitorLive='1';
 el.title='Receiver Win Rate · sequence '+s.sequence;
})}
async function boot(){if(!document.querySelector('.left-rail [data-b46-rate-snapshot]'))return;
 for(let attempt=0;attempt<3;attempt++){
  state.requested++;
  try{
   const r=await fetch('/__b46_sidebar_initial_snapshot',{cache:'no-store'});
   if(!r.ok)throw Error('SNAPSHOT_HTTP_'+r.status);
   const d=await r.json();if(!valid(d.snapshot))throw Error('SNAPSHOT_INVALID');
   state.source='monitor-cache';state.sequence=d.snapshot.sequence;paint(d.snapshot);return;
  }catch(e){state.source='retrying';state.error=String(e);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)))}
 }
 state.source='fallback';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();`;
async function read(env){const r=await env.B46_SIDEBAR_MONITOR.fetch(new Request('https://monitor.internal/cached'));if(!r.ok)return null;const d=await r.json();return valid(d.snapshot)?d.snapshot:null}
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return new Response('READ_ONLY_TEST',{status:405,headers:{'cache-control':'no-store'}});
 if(u.pathname==='/__sidebar_initial_health')return Response.json({scope:'ISOLATED_TEST_ONLY',component:'SIDEBAR_FIRST_PAINT',productionWrites:0,graphRequestsAdded:0},{headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 if(u.pathname==='/__b46_sidebar_initial_test.js')return new Response(req.method==='HEAD'?null:JS,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
 if(u.pathname==='/__b46_sidebar_initial_snapshot'){
  try{const snapshot=await read(env);return Response.json({ok:!!snapshot,snapshot},{status:snapshot?200:503,headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}})}
  catch{return Response.json({ok:false,error:'MONITOR_READ_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}})}
 }
 const origin=new URL(u.pathname+u.search,'https://ball46.com');
 const headers=new Headers();for(const h of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(h);if(v)headers.set(h,v)}
 const res=await env.B46_PRODUCTION_READ.fetch(new Request(origin,{method:req.method,headers,redirect:'manual'}));
 const out=new Headers(res.headers);out.delete('set-cookie');out.set('x-robots-tag','noindex,nofollow');
 if(req.method==='GET'&&pages.has(u.pathname)&&res.ok&&res.headers.get('content-type')?.includes('text/html')){
  for(const h of ['content-length','content-encoding','etag','last-modified'])out.delete(h);
  out.set('cache-control','no-store');out.set('x-b46-release-scope','SIDEBAR_INITIAL_WINRATE_TEST_ONLY');
  return new HTMLRewriter().on('head',{element(e){e.append('<script defer src="/__b46_sidebar_initial_test.js"></script>',{html:true})}}).transform(new Response(res.body,{status:res.status,statusText:res.statusText,headers:out}));
 }
 return new Response(req.method==='HEAD'?null:res.body,{status:res.status,statusText:res.statusText,headers:out});
}};