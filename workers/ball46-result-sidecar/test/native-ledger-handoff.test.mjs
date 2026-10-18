import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOriginalEngineFinal,dispatchThroughNativeLedger} from '../src/native-ledger-handoff.mjs';
const token='X'.repeat(40);
const sample=()=>({source:'goaloo',fixtureId:'5D-42',sourceFixtureId:'GO-88',
 verifiedAt:'2026-10-18T12:01:00Z',score:{home:2,away:1},
 fixture:{fixtureId:'5D-42',sourceIds:{'5usd':'5D-42',goaloo:'GO-88'},
  home:'Alpha FC',away:'Beta FC',league:'League A',
  kickoffUtc:'2026-10-18T10:00:00Z',
  sourceMapping:{policy:'fixture-match-v3',score:0.99}}
});
const fixture=()=>prepareOriginalEngineFinal(sample());
test('native bridge goals-only payload preserves canonical identity',()=>{
 const result=fixture();assert.equal(result.ok,true);
 assert.equal(result.fixture.id,'5D-42');
 assert.equal(result.fixture.goals.home,2);
 assert.equal(result.fixture.goals.away,1);
 assert.equal(result.fixture.corners.home,null);
 assert.equal(result.fixture.cards,null);
 assert.equal(result.fixture.status,'finished');
 assert.equal(result.idempotencyKey,'ball46:v1:FT:5D-42');
});
test('source original ID mismatch fail-closed',()=>{
 const s=sample();s.sourceFixtureId='WRONG';
 assert.equal(prepareOriginalEngineFinal(s).ok,false);
});
test('scores cannot pass with missing or negative goals',()=>{
 const s=sample();s.score.home=-1;
 assert.equal(prepareOriginalEngineFinal(s).ok,false);
});
test('unmapped same-team candidate does not pass',()=>{
 const s=sample();delete s.fixture.sourceMapping;
 assert.equal(prepareOriginalEngineFinal(s).ok,false);
});
test('missing UTC kickoff fails',()=>{
 const s=sample();s.fixture.kickoffUtc='2026-10-18 10:00:00';
 assert.equal(prepareOriginalEngineFinal(s).ok,false);
});
test('native dispatcher default disabled with zero network calls',async()=>{
 let count=0;const transport={fetch:async()=>{count++}};
 const r=await dispatchThroughNativeLedger(transport,fixture());
 assert.equal(r.state,'HOLD_LEDGER_V2_RELEASE_GATE');assert.equal(count,0);
});
test('native token and source version must be separately certified',async()=>{
 let count=0;const transport={fetch:async()=>{count++}};
 const r=await dispatchThroughNativeLedger(transport,fixture(),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true});
 assert.equal(r.state,'HOLD_NATIVE_CREDENTIAL');assert.equal(count,0);
});
test('early FT cannot be sent',async()=>{
 let count=0;const s=sample();s.verifiedAt='2026-10-18T10:30:00Z';
 const r=await dispatchThroughNativeLedger({fetch:async()=>{count++}},prepareOriginalEngineFinal(s),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true,
  authorizedDedicatedToken:token});
 assert.equal(r.state,'HOLD_UNVERIFIED_FT_TIME');assert.equal(count,0);
});
test('native bridge receives only existing 5USD-shaped fixture contract',async()=>{
 let got=null;
 const transport={fetch:async(url,options)=>{
  got={url,options};
  return {ok:true,json:async()=>({ok:true,fixtureId:'5D-42',settled:1,rows:[{id:'a'}]})};
 }};
 const r=await dispatchThroughNativeLedger(transport,fixture(),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true,
  authorizedDedicatedToken:token});
 assert.equal(r.state,'NATIVE_ACCEPTED');
 assert.equal(r.requiresLedgerV2Readback,true);
 assert.equal(got.options.headers['x-settlement-token'],token);
 assert.deepEqual(JSON.parse(got.options.body).fixture.goals,{home:2,away:1,halfHome:null,halfAway:null});
});
test('unauthorized native request does not claim settlement',async()=>{
 const r=await dispatchThroughNativeLedger({fetch:async()=>({ok:false,status:401})},fixture(),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true,authorizedDedicatedToken:token});
 assert.equal(r.state,'NATIVE_REJECTED');
});
test('native acknowledgement must match canonical fixture ID',async()=>{
 const transport={fetch:async()=>({ok:true,json:async()=>({ok:true,fixtureId:'DIFFERENT',settled:1,rows:[{}]})})};
 const r=await dispatchThroughNativeLedger(transport,fixture(),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true,authorizedDedicatedToken:token});
 assert.equal(r.state,'HOLD_INVALID_NATIVE_ACK');
});
test('no PENDING is not falsely reported as Ledger SETTLED success',async()=>{
 const transport={fetch:async()=>({ok:true,json:async()=>({ok:true,fixtureId:'5D-42',settled:0,rows:[]})})};
 const r=await dispatchThroughNativeLedger(transport,fixture(),{
  enabled:true,nativeLedgerV2Certified:true,nativeVersionCertified:true,authorizedDedicatedToken:token});
 assert.equal(r.state,'NATIVE_NO_PENDING');
 assert.equal(r.requiresLedgerV2Readback,true);
});
