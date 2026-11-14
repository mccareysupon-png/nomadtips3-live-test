import test from 'node:test';
import assert from 'node:assert/strict';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
const P='b46:stat:read-v2:',rows=[{id:'a',status:'SETTLED',result:'WIN',market:'1X2',selection:'HOME',odds:2,createdAt:1,settledAt:1}];
test('Derived retention keeps current/previous and protects unrelated data',async()=>{
 let clock=1000;const storage=new TestDurableStorage(),store=new PersistedReadStore(storage,{clock:()=>clock,retentionGraceMs:100});
 await storage.put('real-ledger:never-touch',{id:'protected'});await storage.put(P+'0:build',{createdAt:0});await storage.put(P+'0:partial',[1]);
 await store.publish(rows,{contentRevision:1,asOf:clock});clock+=200;
 await store.publish(rows,{contentRevision:2,asOf:clock});clock+=200;
 await store.publish(rows,{contentRevision:3,asOf:clock});
 assert(![...storage.map.keys()].some(k=>k.startsWith(P+'0:')||k.startsWith(P+'1:')));
 assert([...storage.map.keys()].some(k=>k.startsWith(P+'2:')));assert((await store.view({revision:3})).ok);
 assert.deepEqual(await storage.get('real-ledger:never-touch'),{id:'protected'});assert.equal((await store.view({revision:1})).status,409);
});
test('Young derived generations survive until grace expires; cleanup failures preserve published data',async()=>{
 let clock=1000;const storage=new TestDurableStorage(),store=new PersistedReadStore(storage,{clock:()=>clock,retentionGraceMs:100});
 for(let revision=1;revision<=3;revision++)await store.publish(rows,{contentRevision:revision,asOf:clock});
 assert(storage.map.has(P+'1:manifest'));const list=storage.list.bind(storage);storage.list=async()=>{throw Error('CLEANUP_FAULT')};clock+=200;
 await store.publish(rows,{contentRevision:4,asOf:clock});assert((await store.view({revision:4})).ok);assert.equal(store.cleanupError,'CLEANUP_FAULT');
 storage.list=list;await store.pruneDerived(3);assert(!storage.map.has(P+'1:manifest'));assert(storage.map.has(P+'3:manifest'));assert(storage.map.has(P+'4:manifest'));
});
