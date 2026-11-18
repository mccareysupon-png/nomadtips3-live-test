// Candidate-only service binding adapter. No writes, no public credentials, no route changes.
// Integrate in the actual website Worker only after full cut-over approval/gates.
const validMarkets=new Set(['all','AH','1X2','O/U','Corners','BTTS','Cards','Other']);
const json=(d,status=200)=>Response.json(d,{status,headers:{'cache-control':'no-store'}});
const unavailable=reason=>json({ok:false,error:reason,source:'LEGACY_FALLBACK_REQUIRED'},503);
export async function readReceiverBundle(env,market='all'){
 if(!validMarkets.has(market))return json({ok:false,error:'INVALID_MARKET'},400);
 if(!env.B46_MARKET_READER)return unavailable('RECEIVER_BINDING_MISSING');
 const read=async(path,params='')=>{
  const r=await env.B46_MARKET_READER.fetch(new Request('https://shadow.internal'+path+params,{method:'GET',headers:{accept:'application/json'}}));
  if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('RECEIVER_HTTP_'+r.status);
  const d=await r.json();if(!d.ok)throw Error('RECEIVER_NOT_OK');return d;
 };
 try{
  const s=await read('/projection-status-v1');
  if(!s.graphReady||!s.pendingReadReady)return unavailable('RECEIVER_NOT_READY');
  const q='?market='+encodeURIComponent(market);
  const [g,p]=await Promise.all([read('/projection-graph-v1',q),read('/projection-pending-v1',q+'&limit=1')]);
  const e=await read('/projection-status-v1');
  const n=s.projection?.generation;
  if(!Number.isSafeInteger(n)||n!==g.generation||n!==p.generation||n!==e.projection?.generation||s.bookSequence!==g.sequence||s.bookSequence!==e.bookSequence||!e.graphReady)return unavailable('RECEIVER_GENERATION_CHANGED');
  if(g.market!==market||g.schema!==1||!Number.isSafeInteger(g.summary?.rows)||!Number.isFinite(g.summary?.net)||!Array.isArray(g.series?.units)||!Number.isSafeInteger(p.pending)||!Number.isSafeInteger(p.unresolved))return unavailable('RECEIVER_SCHEMA_MISMATCH');
  if(!p.coverageVerified||!e.pendingLiveReady)return unavailable('PENDING_SOURCE_COVERAGE_NOT_VERIFIED');
  const c=g.counts;
  if(!c||!['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||Object.values(c).reduce((a,b)=>a+b,0)!==g.summary.rows)return unavailable('COUNTS_MISMATCH');
  if(market==='all'&&g.summary.rows!==e.bookAggregate?.total)return unavailable('BOOK_TOTAL_MISMATCH');
  return json({ok:true,source:'RECEIVER',generation:n,sequence:g.sequence,head:{schema:1,ok:true,total:g.summary.rows,pending:p.pending,unresolved:p.unresolved,win:c.WIN,loss:c.LOSS,halfWin:c.HALF_WIN,halfLoss:c.HALF_LOSS,push:c.PUSH,snapshotSavedAt:g.asOf},graph:g});
 }catch{return unavailable('RECEIVER_READ_UNAVAILABLE')}
}
// Intentionally not attached to Production fetch handler. Only an allowlisted
// statistics bundle can be routed; leave all other API paths, history and detail unchanged.
export function isCandidateStatisticsRoute(request){
 const u=new URL(request.url);return request.method==='GET'&&u.pathname==='/b46-receiver-v1/bundle';
}
