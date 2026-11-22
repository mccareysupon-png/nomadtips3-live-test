// Additive-only first-paint hydration for BALL46 desktop Sidebar Statistics.
import original from './__ORIGINAL_MAIN__';
export * from './__ORIGINAL_MAIN__';
import {SIDEBAR_FIRSTPAINT_CLIENT} from './b46-sidebar-firstpaint-client-20261122.mjs';
const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const valid=s=>s&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&s.rates&&keys.every(k=>Object.hasOwn(s.rates,k)&&(s.rates[k]===null||typeof s.rates[k]==='number'&&Number.isFinite(s.rates[k])&&s.rates[k]>=0&&s.rates[k]<=100));
const MOBILE=/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;
async function snapshot(env){const r=await env.B46_SIDEBAR_MONITOR.fetch(new Request('https://monitor.internal/cached'));if(!r.ok)return null;const d=await r.json();return valid(d.snapshot)?d.snapshot:null}
export default {...original,async fetch(req,env,ctx){
 const path=new URL(req.url).pathname;
 const desktop=req.headers.get('sec-ch-ua-mobile')!=='?1'&&!MOBILE.test(req.headers.get('user-agent')||'');
 if(desktop&&req.method==='GET'&&path==='/__b46_sidebar_initial_test.js'){
  return new Response(SIDEBAR_FIRSTPAINT_CLIENT,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }
 if(desktop&&req.method==='GET'&&path==='/__b46_sidebar_initial_snapshot'){
  try {const s=await snapshot(env);return Response.json({ok:!!s,snapshot:s},{status:s?200:503,headers:{'cache-control':'no-store'}})}
  catch{return Response.json({ok:false,error:'MONITOR_READ_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}})}
 }
 const res=await original.fetch(req,env,ctx);
 if(!desktop||req.method!=='GET'||!res.ok||!pages.has(path)||!res.headers.get('content-type')?.includes('text/html'))return res;
 const h=new Headers(res.headers);
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append('<script defer src="/__b46_sidebar_initial_test.js"></script>',{html:true})}}).transform(new Response(res.body,{status:res.status,statusText:res.statusText,headers:h}));
}};
