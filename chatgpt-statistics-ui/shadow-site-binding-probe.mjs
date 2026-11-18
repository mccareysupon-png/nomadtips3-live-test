// Additive pre-cutover probe only. Never alters public data source.
const path='/_b46/internal/receiver-preflight-v1';
const reply=(d,status=200)=>Response.json(d,{status,headers:{'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','x-robots-tag':'noindex'}});
async function authorized(req,secret){
 const supplied=req.headers.get('authorization')??'';
 if(typeof secret!=='string'||secret.length<32||supplied.length!==7+secret.length)return false;
 const enc=new TextEncoder(),a=await crypto.subtle.digest('SHA-256',enc.encode(supplied)),b=await crypto.subtle.digest('SHA-256',enc.encode('Bearer '+secret));
 const x=new Uint8Array(a),y=new Uint8Array(b);let bad=0;for(let i=0;i<x.length;i++)bad|=x[i]^y[i];return bad===0;
}
export function withReceiverProbe(original){
 return {...original,async fetch(req,env,ctx){
  const u=new URL(req.url);
  if(u.pathname!==path)return original.fetch(req,env,ctx);
  if(req.method!=='GET'||!await authorized(req,env.B46_SITE_PROBE_TOKEN))return reply({ok:false},403);
  if(!env.B46_MARKET_READER)return reply({ok:false,error:'RECEIVER_BINDING_MISSING'},503);
  const get=async(p)=>{
   const label=p.includes('status-v1')?'STATUS':p.includes('graph-v1')?'GRAPH':'PENDING';
   let r;try{r=await env.B46_MARKET_READER.fetch(new Request('https://shadow.internal'+p,{method:'GET',headers:{accept:'application/json'}}))}
   catch{throw Error('SERVICE_'+label+'_FETCH_THROW')}
   if(!r.ok)throw Error('SERVICE_'+label+'_HTTP_'+r.status);
   if(!r.headers.get('content-type')?.includes('application/json'))throw Error('SERVICE_'+label+'_NON_JSON');
   let v;try{v=await r.json()}catch{throw Error('SERVICE_'+label+'_INVALID_JSON')}
   if(!v.ok)throw Error('SERVICE_'+label+'_NOT_OK');return v;
  };
  try{
   const a=await get('/projection-status-v1');
   const [g,p]=await Promise.all([get('/projection-graph-v1'),get('/projection-pending-v1?limit=1')]);
   const b=await get('/projection-status-v1');
   const n=a.projection?.generation;
   if(!a.graphReady||!b.graphReady||!a.pendingReadReady||!b.pendingReadReady||!Number.isSafeInteger(n)||n!==b.projection?.generation||n!==g.generation||n!==p.generation||a.bookSequence!==b.bookSequence||a.bookSequence!==g.sequence)return reply({ok:false,error:'RECEIVER_GENERATION_CHANGED'},409);
   const total=b.bookAggregate?.total,pnl=b.bookAggregate?.total_pnl;
   if(!Number.isSafeInteger(total)||total<16105||!Number.isFinite(pnl)||g.summary?.rows!==total||!Number.isFinite(g.summary?.net)||Math.abs(g.summary.net-pnl)>1e-7||!Number.isSafeInteger(p.total)||p.total!==p.pending+p.unresolved||p.readMode!=='DURABLE_OBJECT_STATE_ONLY')return reply({ok:false,error:'RECEIVER_PARITY_FAILED'},503);
   return reply({ok:true,source:'B46_MARKET_READER',settled:total,pnl,winRate:b.bookAggregate.win_rate,pending:p.pending,unresolved:p.unresolved,generation:n,sequence:g.sequence,coverageVerified:!!p.coverageVerified,cutoverReady:!!(p.coverageVerified&&b.pendingLiveReady),publicSourceChanged:false});
  }catch(e){const message=String(e?.message??'');return reply({ok:false,error:/^SERVICE_(STATUS|GRAPH|PENDING)_(FETCH_THROW|HTTP_[0-9]{3}|NON_JSON|INVALID_JSON|NOT_OK)$/.test(message)?message:'RECEIVER_PROBE_UNAVAILABLE'},503)}
 }};
}
