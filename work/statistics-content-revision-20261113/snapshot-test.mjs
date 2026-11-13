import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {SnapshotStore} from './snapshot-store.mjs';
class Storage{
 constructor(){this.map=new Map();this.writes=0}
 async get(k){return Array.isArray(k)?new Map(k.filter(x=>this.map.has(x)).map(x=>[x,structuredClone(this.map.get(x))])):structuredClone(this.map.get(k))}
 async put(k,v){for(const[a,b]of typeof k==='string'?[[k,v]]:Object.entries(k)){this.map.set(a,structuredClone(b));this.writes++}}
 async delete(k){for(const key of Array.isArray(k)?k:[k])this.map.delete(key)}
 async list({prefix='',start='',limit=Infinity}){return new Map([...this.map].sort(([a],[b])=>a.localeCompare(b)).filter(([k])=>k.startsWith(prefix)&&k>=start).slice(0,limit))}
 async transaction(fn){const before=structuredClone(this.map);try{return await fn(this)}catch(e){this.map=before;throw e}}
}
let now=100000;const rows=Array.from({length:301},(_,i)=>({id:'r'+i,createdAt:3600000*Math.floor(i/100),status:'SETTLED',result:i%2?'WIN':'LOSS',odds:1.925}));
const source={revision:1,rows:structuredClone(rows)},storage=new Storage(),store=new SnapshotStore(storage,{clock:()=>now,ttlMs:20000,minBuildIntervalMs:0,maxGenerations:4});
const reduce=async(read,{onPage})=>{const before=source.revision,copy=structuredClone(source.rows);for(let i=0;i<copy.length;i+=100)await onPage(copy.slice(i,i+100),{});assert.equal(source.revision,before,'SOURCE_CHANGED');return {data:{contentRevision:before,ledgerTotal:copy.length,total:copy.length,asOf:99990},metadata:{pending:0,unresolved:0},signature:String(before),proof:{pages:Math.ceil(copy.length/100)}}};
const results=[];async function test(name,fn){await fn();results.push({name,ok:true})}
let first;
await test('Immutable old cursor remains complete during real source insertion',async()=>{first=await store.build(null,reduce);const p=await store.page(store.firstCursor(first),100);source.rows.unshift({...rows[0],id:'new'});source.revision++;await store.build(null,reduce);let all=[...p.rows],c=p.nextCursor;while(c){const q=await store.page(c,100);all.push(...q.rows);c=q.nextCursor}assert.deepEqual(all,rows);assert.equal(all.length,301)});
await test('Published generations reuse unchanged hour chunks; payload fields preserved',async()=>{const current=await store.active();assert(current.proof.reusedChunks>=3);assert(current.proof.newChunks<=2);assert(current.proof.largestChunk<=96000);assert.equal((await store.page(store.firstCursor(current))).rows[1].odds,1.925)});
await test('Concurrent cold readers coalesce one build',async()=>{let builds=0;const s=new SnapshotStore(new Storage(),{clock:()=>now,minBuildIntervalMs:0});const f=async(...args)=>{builds++;await new Promise(r=>setTimeout(r,5));return reduce(...args)};const m=await Promise.all([s.build(null,f),s.build(null,f),s.build(null,f)]);assert.equal(builds,1);assert.equal(new Set(m.map(x=>x.id)).size,1)});
await test('Failed generation is never published; prior complete generation retained',async()=>{const before=(await store.active()).id;await assert.rejects(()=>store.build(null,async(read,{onPage})=>{await onPage([{id:'transient',createdAt:1}]);throw Error('SOURCE_CHANGED')}),/SOURCE_CHANGED/);assert.equal((await store.active()).id,before);assert.equal((await store.page(store.firstCursor(await store.active()))).rows.length,302)});
await test('Expired old cursors return 410 and cleanup preserves active data',async()=>{now+=20001;await assert.rejects(()=>store.page(store.firstCursor(first)),e=>e.status===410);source.revision++;await store.build(null,reduce);await store.collect();assert.equal(await storage.get('b46:statistics:history:v1:manifest:'+first.id),undefined);assert.equal((await store.page(store.firstCursor(await store.active()))).rows.length,302)});
await test('Storage eviction/restart retains exact active snapshot',async()=>{const restarted=new SnapshotStore(storage,{clock:()=>now});assert.deepEqual(await restarted.active(),await store.active());assert.equal((await restarted.page(restarted.firstCursor(await restarted.active()))).rows.length,302)});
await test('Row/storage budgets reject safely instead of truncating or replacing active',async()=>{const small=new SnapshotStore(new Storage(),{clock:()=>now,maxBlobBytes:1});await assert.rejects(()=>small.build(null,reduce),/DISK_BUDGET/);assert.equal(await small.active(),null);const bounded=new SnapshotStore(new Storage(),{clock:()=>now,maxRows:1});await assert.rejects(()=>bounded.build(null,reduce),/ROW_BUDGET/)});
await test('Duplicate source identity rejects publication',async()=>{const s=new SnapshotStore(new Storage(),{clock:()=>now});await assert.rejects(()=>s.build(null,async(read,{onPage})=>{await onPage([rows[0],rows[0]]);return {}}),/DUPLICATE/);assert.equal(await s.active(),null)});
await test('No Engine/Ledger keys exist in snapshot storage',async()=>{assert([...storage.map.keys()].every(k=>k.startsWith('b46:statistics:history:v1:')))});
await writeFile('work/statistics-content-revision-20261113/qa/snapshot.json',JSON.stringify({ok:true,checks:results.length,results},null,2));console.log('SNAPSHOT_TEST '+JSON.stringify({ok:true,checks:results.length}));

