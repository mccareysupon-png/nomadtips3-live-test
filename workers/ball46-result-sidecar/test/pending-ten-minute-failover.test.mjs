import test from 'node:test';
import assert from 'node:assert/strict';
import {routeOverduePending,closeAfterLedgerSettlement,pendingTimeMs}
 from '../src/pending-ten-minute-failover.mjs';
const base='2026-10-18T10:00:00Z';
const now='2026-10-18T10:20:00Z';
const signal=(fid='5usd-1',id='s1',createdAt=base,market='FT_OVER')=>
 ({fixtureId:fid,id,createdAt,market,period:'FT',status:'PENDING'});
const route=(rows=[signal()],routes={})=>routeOverduePending({rows,routes,now});
test('PENDING >10m reroutes that original fixture to Goaloo',()=>{
 const r=route();
 assert.equal(r.ok,true);assert.equal(r.eligible.length,1);
 assert.equal(r.eligible[0].route,'GOALOO');
 assert.equal(r.updates[0].record.state,'GOALOO');
});
test('9m 59s stays on 5USD',()=>{
 const r=route([signal('5usd-1','s1','2026-10-18T10:10:01Z')]);
 assert.equal(r.eligible.length,0);
 assert.equal(r.updates[0].record.state,'PRIMARY');
});
test('10min elapsed qualifies; not dependent on FT',()=>{
 const r=route([signal('5usd-1','s1','2026-10-18T10:10:00Z')]);
 assert.equal(r.eligible.length,1);
});
test('no PENDING from authoritative Ledger means no Goaloo lookups',()=>{
 assert.equal(route([]).eligible.length,0);
 assert.equal(route([{...signal(),status:'SETTLED'}]).eligible.length,0);
});
test('existing DONE fixture never reroutes even if stale PENDING exists',()=>{
 const r=route([signal()],{'5usd-1':{state:'DONE',neverInspectGoalooAgain:true}});
 assert.equal(r.eligible.length,0);
 assert.equal(r.holds[0].reason,'ALREADY_FINAL_STOP');
});
test('Corners and Cards are not settled using Goaloo goal score',()=>{
 const r=route([signal('5usd-1','s1',base,'FT_CORNER_OVER'),signal('5usd-2','s2',base,'CARDS')]);
 assert.equal(r.eligible.length,0);
});
test('FT eligible signal newly emitted on same fixture is not rerouted early',()=>{
 const r=route([signal(),signal('5usd-1','s2','2026-10-18T10:18:00Z','FT_AH')]);
 assert.equal(r.eligible.length,0);
 assert.equal(r.holds[0].reason,'PENDING_LESS_THAN_10_MIN');
});
test('missing createdAt begins reliable clock when Ledger first observed',()=>{
 const first=route([signal('5usd-1','s1',null)]);
 assert.equal(first.eligible.length,0);
 const prior={'5usd-1':first.updates[0].record};
 const later=routeOverduePending({rows:[signal('5usd-1','s1',null)],routes:prior,
  now:'2026-10-18T10:30:01Z'});
 assert.equal(later.eligible.length,1);
});
test('repeated 5-minute checks reuse existing Goaloo route without new durable writes',()=>{
 const first=route();
 const second=route([signal()],{'5usd-1':first.updates[0].record});
 assert.equal(second.eligible.length,1);
 assert.equal(second.eligible[0].reused,true);
 assert.equal(second.updates.length,0);
});
test('unknown status and non-UTC timestamps never allow accidental reroute',()=>{
 assert.equal(route([signal('5usd-1','s1','bogus')]).eligible.length,0);
 assert.equal(pendingTimeMs('2026-10-18 10:00:00'),null);
});
test('supports unix ms or unix sec timestamps from Ledger V2',()=>{
 const millis=Date.parse(base);
 assert.equal(pendingTimeMs(millis),millis);
 assert.equal(pendingTimeMs(String(millis/1000)),millis);
 assert.equal(route([signal('5usd-1','s1',millis)]).eligible.length,1);
});
test('duplicate signal IDs across fixtures hold both instead of routing',()=>{
 const r=route([signal('5usd-1','s1'),signal('5usd-2','s1')]);
 assert.equal(r.eligible.length,0);
});
const receipt={ok:true,rows:[{id:'s1',fixtureId:'5usd-1',status:'SETTLED',result:'WIN'}]};
const doneRoute={state:'GOALOO',signalIds:['s1'],routedAt:now,firstObservedAt:base};
test('native Ledger V2 verified SETTLED creates permanent DONE tombstone',()=>{
 const result=closeAfterLedgerSettlement({fixtureId:'5usd-1',route:doneRoute,
  ledgerRows:[{id:'s1',fixtureId:'5usd-1',status:'SETTLED'}],verifiedReadback:receipt,now});
 assert.equal(result.ok,true);
 assert.equal(result.record.neverInspectGoalooAgain,true);
 assert.equal(route([signal()],{'5usd-1':result.record}).eligible.length,0);
});
test('pending Corners keeps fixture open even if goals were settled',()=>{
 const r=closeAfterLedgerSettlement({fixtureId:'5usd-1',route:doneRoute,
  ledgerRows:[{id:'s1',fixtureId:'5usd-1',status:'SETTLED'},
   signal('5usd-1','corners-2',base,'FT_CORNER_OVER')],
  verifiedReadback:receipt,now});
 assert.equal(r.ok,false);
 assert.equal(r.state,'FIXTURE_STILL_HAS_PENDING');
});
test('native ACK alone never closes a fixture',()=>{
 assert.equal(closeAfterLedgerSettlement({fixtureId:'5usd-1',route:doneRoute,
  ledgerRows:[],verifiedReadback:{ok:false,rows:receipt.rows},now}).ok,false);
});
test('wrong fixture id or missing graded result refuses DONE',()=>{
 const bad={ok:true,rows:[{id:'s1',fixtureId:'different',status:'SETTLED',result:'WIN'}]};
 assert.equal(closeAfterLedgerSettlement({fixtureId:'5usd-1',route:doneRoute,
  ledgerRows:[],verifiedReadback:bad,now}).ok,false);
});
