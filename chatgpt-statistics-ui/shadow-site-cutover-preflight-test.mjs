import assert from 'node:assert/strict';
import {readReceiverBundle,isCandidateStatisticsRoute} from './shadow-site-cutover-preflight.mjs';
const status={ok:true,graphReady:true,pendingReadReady:true,pendingLiveReady:true,bookSequence:16095,projection:{generation:9},bookAggregate:{total:16095}};
const graph={ok:true,schema:1,market:'all',generation:9,sequence:16095,asOf:1794996000000,summary:{rows:16095,net:1372.4075},counts:{WIN:6700,LOSS:5045,HALF_WIN:980,HALF_LOSS:500,PUSH:2870},series:{units:[{date:1794996000000,value:1372.4075}]}};
const pending={ok:true,generation:9,pending:285,unresolved:0,coverageVerified:true};
function env({s=status,g=graph,p=pending,end=s,fail=false}={}){
 let count=0;
 return {B46_MARKET_READER:{fetch:async req=>{
  const u=new URL(req.url);assert.equal(u.hostname,'shadow.internal');assert.equal(req.method,'GET');assert.equal(req.headers.get('authorization'),null);
  if(fail)throw Error('service unavailable');
  return Response.json(u.pathname==='/projection-status-v1'?(count++===0?s:end):u.pathname==='/projection-graph-v1'?g:p);
 }}};
}
const test=async (options,code,error)=>{const r=await readReceiverBundle(env(options));assert.equal(r.status,code);const d=await r.json();if(error)assert.equal(d.error,error);return d};
const good=await test({},200);assert.equal(good.head.total,16095);assert.equal(good.head.pending,285);assert.equal(good.head.snapshotSavedAt,good.graph.asOf);
await test({p:{...pending,coverageVerified:false}},503,'PENDING_SOURCE_COVERAGE_NOT_VERIFIED');
await test({s:{...status,pendingLiveReady:false},end:{...status,pendingLiveReady:false}},503,'PENDING_SOURCE_COVERAGE_NOT_VERIFIED');
await test({g:{...graph,generation:10}},503,'RECEIVER_GENERATION_CHANGED');
await test({end:{...status,bookSequence:16096}},503,'RECEIVER_GENERATION_CHANGED');
await test({fail:true},503,'RECEIVER_READ_UNAVAILABLE');
await test({g:{...graph,counts:{...graph.counts,WIN:0}}},503,'COUNTS_MISMATCH');
assert.equal((await readReceiverBundle({})).status,503);
assert.equal((await readReceiverBundle(env(),'bad')).status,400);
assert(isCandidateStatisticsRoute(new Request('https://www.ball46.com/b46-receiver-v1/bundle')));
for(const p of ['/api/engine/health','/api/engine/statistics','/api/engine/signals','/b46-fast-v1/head','/member'])assert(!isCandidateStatisticsRoute(new Request('https://www.ball46.com'+p)));
assert(!isCandidateStatisticsRoute(new Request('https://www.ball46.com/b46-receiver-v1/bundle',{method:'POST'})));
console.log('SITE_CUTOVER_ADAPTER_TEST=PASS; synthetic only; coverage, generation, auth boundary, route allowlist and fallback checked');
