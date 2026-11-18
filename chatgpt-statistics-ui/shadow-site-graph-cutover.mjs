// Website-only graph read proxy. All pending/history routes remain legacy.
const markets=new Set(['all','AH','1X2','O/U','Corners','BTTS','Cards','Other']);
const ranges=new Set(['all','d7','d30','d90']);
const headers={'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','x-robots-tag':'noindex'};
const json=(d,status=200,source='')=>Response.json(d,{status,headers:{...headers,...(source?{'x-b46-statistics-source':source}:{})}});
export async function receiverGraph(req,env){
 const u=new URL(req.url);
 if(req.method!=='GET')return json({ok:false},405);
 const q=u.searchParams,m=q.get('market')??'all',v=q.get('variant')??'all',f=q.get('filter')??'all',r=q.get('range')??'all';
 if([...q.keys()].some(k=>!['market','variant','filter','range'].includes(k))||!markets.has(m)||!ranges.has(r)||!(/^(all|(?:ft|ht)_[a-z0-9_]{1,64})$/.test(v))||!(/^[a-z0-9_]{1,64}$/.test(f)))return json({ok:false,error:'INVALID_STATISTICS_FILTER'},400);
 try{
  const query=new URLSearchParams({market:m,variant:v,filter:f,range:r});
  const z=await env.B46_MARKET_READER.fetch(new Request('https://shadow.internal/projection-graph-v1?'+query,{method:'GET',headers:{accept:'application/json'}}));
  if(z.status!==200||!(z.headers.get('content-type')??'').includes('application/json'))return json({ok:false,error:'RECEIVER_GRAPH_UNAVAILABLE'},503);
  const d=await z.json(),c=d.counts,s=d.summary;
  const counts=['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'];
  if(!d.ok||d.schema!==1||d.market!==m||d.variant!==v||d.filter!==f||d.range!==r||!Number.isSafeInteger(d.sequence)||!Number.isSafeInteger(d.generation)||!Number.isFinite(d.asOf)||!c||!s||!counts.every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||counts.reduce((n,k)=>n+c[k],0)!==s.rows||s.wins!==c.WIN+c.HALF_WIN||s.losses!==c.LOSS+c.HALF_LOSS||s.pushes!==c.PUSH||!['net','stake','maxDD','priced'].every(k=>Number.isFinite(s[k]))||!['units','roi','rate'].every(k=>Array.isArray(d.series?.[k])&&d.series[k].every(p=>Number.isFinite(p.value)&&Number.isFinite(p.date))))return json({ok:false,error:'RECEIVER_GRAPH_SCHEMA'},503);
  // No pending metadata, internal auth, receipts or book administration is exposed.
  return json({ok:true,schema:1,source:'RECEIVER',market:m,variant:v,filter:f,range:r,asOf:d.asOf,generation:d.generation,sequence:d.sequence,summary:s,counts:c,series:d.series},200,'RECEIVER');
 }catch{return json({ok:false,error:'RECEIVER_GRAPH_UNAVAILABLE'},503)}
}
export function withGraphCutover(original,assets){
 return {...original,async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(u.pathname==='/b46-receiver-v1/graph')return receiverGraph(req,env);
  if(req.method==='GET'&&Object.hasOwn(assets,u.pathname)){
   const res=await original.fetch(req,env,ctx);
   if(res.status!==200)return res;
   try{
    const code=assets[u.pathname](await res.text()),h=new Headers(res.headers);
    for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
    h.set('cache-control','no-store, max-age=0');h.set('content-type','application/javascript; charset=utf-8');h.set('x-b46-graph-cutover','PATCHED');
    return new Response(code,{status:200,headers:h});
   }catch{return new Response('/* Statistics script unavailable; release gate must rollback. */',{status:503,headers:{...headers,'content-type':'application/javascript; charset=utf-8'}})}
  }
  return original.fetch(req,env,ctx);
 }};
}
