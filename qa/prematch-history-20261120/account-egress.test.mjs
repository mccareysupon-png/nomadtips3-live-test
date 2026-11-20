import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardProvider,makeProviderBridge} from './provider-bridge.mjs';
const host='https://api.5dollarfootballapi.com';
const path='/v1/fixtures/123/odds?bookmakers=bet365,pinnacle';
const keys={history:'history-test-secret-00000001',referee:'referee-test-secret-0000002',fullmarket:'fullmarket-test-secret-000003'};
// Test harness only: all external egress forbidden; no production bindings or credentials.
test('isolated caller egress: service binding only, missing binding and failures cannot fall back',async()=>{
 const original=globalThis.fetch;let direct=0,leases=0,upstream=0,observations=0;
 globalThis.fetch=async()=>{direct++;throw Error('DIRECT_EGRESS_FORBIDDEN')};
 try{
  const bridge=makeProviderBridge({secrets:keys,enabled:true,historyHandler:async()=>Response.json({state:'deferred_budget',reason:'ACCOUNT_COORDINATION_NOT_VERIFIED'}),reserve:async()=>({allowed:true,id:String(++leases)}),transport:async()=>{upstream++;return Response.json({success:1},{headers:{'x-ratelimit-limit':'40'}})},observe:async()=>{observations++},failed:async()=>{}});
  const env={PROVIDER_BRIDGE_SECRET:keys.fullmarket,HUB:{fetch:(url,init)=>bridge(new Request(url,init))}};
  assert.equal((await forwardProvider(env,'fullmarket',host+path)).status,200);
  assert.equal(leases,1);assert.equal(upstream,1);assert.equal(observations,1);
  await assert.rejects(forwardProvider({},'fullmarket',host+path));
  await assert.rejects(forwardProvider({...env,HUB:{fetch:async()=>{throw Error('binding outage')}}},'fullmarket',host+path));
  assert.equal((await forwardProvider({...env,PROVIDER_BRIDGE_SECRET:keys.referee},'fullmarket',host+path)).status,404);
  const h=await forwardProvider({...env,PROVIDER_BRIDGE_SECRET:keys.history},'history',host+'/v1/leagues/8273/fixtures?status=finished&season=26%2F27&per_page=100&page=1');
  assert.equal((await h.json()).reason,'ACCOUNT_COORDINATION_NOT_VERIFIED');
  assert.equal(direct,0);assert.equal(upstream,1);assert.equal(leases,1);
 }finally{globalThis.fetch=original}
});
