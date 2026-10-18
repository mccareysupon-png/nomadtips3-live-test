import test from 'node:test';import assert from 'node:assert/strict';
import {readSettledReceipt} from '../src/ledger-settlement-readback.mjs';
const make=(rows,nextCursor=null)=>({ok:true,statisticsSource:'LEDGER_V2_ONLY',
 statisticsLedgerVersion:'signal-ledger-v2-longterm',rows,nextCursor});
const env=docs=>({fetch:async(u,opt)=>({ok:true,json:async()=>docs.shift()})});
test('independent readback confirms exact archived Ledger V2 signal',async()=>{
 const r=await readSettledReceipt(env([make([{id:'s1',fixtureId:'f',status:'SETTLED',result:'WIN'}])]),['s1']);
 assert.equal(r.ok,true);assert.equal(r.state,'NATIVE_LEDGER_V2_SETTLED_CONFIRMED');
});
test('PENDING never claims SETTLED even when native HTTP succeeded',async()=>{
 const r=await readSettledReceipt(env([make([{id:'s1',fixtureId:'f',status:'PENDING',result:''}])]),['s1']);
 assert.equal(r.ok,false);assert.equal(r.state,'STILL_PENDING_OR_UNRESOLVED');
});
test('wrong Ledger source is held, no guessing',async()=>{
 const d=make([{id:'s1',status:'SETTLED',result:'WIN'}]);d.statisticsSource='CACHED_VIEW';
 const r=await readSettledReceipt(env([d]),['s1']);assert.equal(r.ok,false);
});
test('readback fails if an expected Signal ID is absent',async()=>{
 const r=await readSettledReceipt(env([make([{id:'s1',status:'SETTLED',result:'WIN'}])]),['s1','s2']);
 assert.equal(r.ok,false);assert.equal(r.state,'LEDGER_ROWS_MISSING');
});
test('paginates exactly the native reverse cursor and finishes on later page',async()=>{
 const docs=[make([{id:'x'}],'stat:v2:row:0000000000001:a'),
  make([{id:'s1',status:'SETTLED',result:'PUSH'}])];
 const r=await readSettledReceipt(env(docs),['s1']);assert.equal(r.ok,true);
});
