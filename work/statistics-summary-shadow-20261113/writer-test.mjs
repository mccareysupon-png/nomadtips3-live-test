import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ShadowSummary} from './summary.mjs';
import {ledgerTestAdapter} from './test-ledger-adapter.mjs';
const D='work/statistics-summary-shadow-20261113';
const raw=await readFile(existsSync(D+'/source/active.json')?D+'/source/engine.js':'work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js','utf8');
assert.equal(createHash('sha256').update(raw).digest('hex'),'30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56');
const moduleless=raw.replace('import { DurableObject } from "cloudflare:workers";','').replace(/export \{[\s\S]*?\};\s*\/\/# sourceMappingURL=index-bulk-recovery\.js\.map\s*$/,'');
class DO{constructor(ctx,env){this.ctx=ctx;this.env=env;}}
const Engine=new Function('DurableObject','fetch',moduleless+';return Nomad343Engine2')(DO,()=>{throw Error('NETWORK_FORBIDDEN')});
class Store {
 constructor(){this.data=new Map();this.tail=Promise.resolve();this.fail=false;}
 async get(key){if(Array.isArray(key))return new Map(key.filter(k=>this.data.has(k)).map(k=>[k,structuredClone(this.data.get(k))]));return structuredClone(this.data.get(key));}
 async put(k,v){for(const [key,value]of typeof k==='string'?[[k,v]]:Object.entries(k))this.data.set(key,structuredClone(value));}
 async delete(k){for(const key of Array.isArray(k)?k:[k])this.data.delete(key);}
 async transaction(fn){const run=this.tail.then(async()=>{const tx=new Store();tx.data=structuredClone(this.data);const value=await fn(tx);if(this.fail){this.fail=false;throw Error('COMMIT_FAILED');}this.data=tx.data;return value;});this.tail=run.catch(()=>{});return run;}
}
const source={engineVersion:'02e09215-02b1-47fb-b1cf-9423f50c7ce9',engineSha:createHash('sha256').update(raw).digest('hex'),generation:'writer-test-1'};
const make=(over={})=>({id:'actual-writer-1',fixtureId:'fixture-1',market:'ft_ah',selection:'HOME',status:'PENDING',result:null,odds:1.925,createdAt:1794477600000,entryScore:{home:0,away:0},...over});
async function setup(){const storage=new Store(),wrapped=await ledgerTestAdapter(storage,'writer',source,{mode:'ISOLATED_TEST_STORAGE'}),engine=new Engine({storage:wrapped},{}),shadow=new ShadowSummary(storage,'writer');return {storage,wrapped,engine,shadow};}
const results=[];async function test(name,fn){await fn();results.push({name,pass:true});}
await test('test-only mode enforced',async()=>{await assert.rejects(()=>ledgerTestAdapter(new Store(),'writer',source),/TEST_STORAGE/);});
await test('actual Engine insert, settlement and correction update summary',async()=>{const {engine,shadow}=await setup();for(const row of [make(),make({status:'SETTLED',result:'WIN',settledAt:1794478600000}),make({status:'SETTLED',result:'LOSS',settledAt:1794478601000})]){const r=await engine.__b46UpsertLedgerUnlocked([row]);const s=(await shadow.read()).summary;for(const k of ['ledgerTotal','pending','settledTotal','win','loss','halfWin','halfLoss','push'])assert.equal(s[k],r.meta[k],k);}});
await test('unchanged actual writer preserves source sequence',async()=>{const {engine,storage}=await setup();await engine.__b46UpsertLedgerUnlocked([make()]);const clock=await storage.get('b46:statistics:shadow:v1:writer:source-clock');const r=await engine.__b46UpsertLedgerUnlocked([make()]);assert.equal(r.unchanged,1);assert.equal(await storage.get('b46:statistics:shadow:v1:writer:source-clock'),clock);});
await test('live score mirror changes do not rewrite statistics projection',async()=>{const {engine,storage,shadow}=await setup();await engine.__b46UpsertLedgerUnlocked([make()]);const clock=await storage.get('b46:statistics:shadow:v1:writer:source-clock');const fixture=new Map([['fixture-1',{minute:60,goals:{home:1,away:0}}]]);const r=await engine.__b46UpsertLedgerUnlocked([make()],fixture);assert.equal(r.updated,1);assert.equal(await storage.get('b46:statistics:shadow:v1:writer:source-clock'),clock);assert.equal((await shadow.read()).summary.ledgerTotal,1);});
await test('atomic commit failure leaves neither Ledger row nor summary delta',async()=>{const {engine,storage,shadow}=await setup();storage.fail=true;await assert.rejects(()=>engine.__b46UpsertLedgerUnlocked([make()]),/COMMIT_FAILED/);assert.equal([...storage.data.keys()].filter(k=>k.startsWith('stat:v2:row:')).length,0);assert.equal((await shadow.read()).summary.ledgerTotal,0);await engine.__b46UpsertLedgerUnlocked([make()]);assert.equal((await shadow.read()).summary.ledgerTotal,1);});
await test('Ledger row delete and restore retain count parity',async()=>{const {engine,wrapped,storage,shadow}=await setup();await engine.__b46UpsertLedgerUnlocked([make()]);const key=[...storage.data.keys()].find(k=>k.startsWith('stat:v2:row:')),row=await storage.get(key);await wrapped.transaction(tx=>tx.delete(key));assert.equal((await shadow.read()).summary.ledgerTotal,0);await wrapped.transaction(tx=>tx.put(key,row));assert.equal((await shadow.read()).summary.ledgerTotal,1);});
await test('unrelated storage writes do not touch statistics summary',async()=>{const {wrapped,storage}=await setup();await wrapped.put('unrelated',{unchanged:true});assert.equal(await storage.get('b46:statistics:shadow:v1:writer:source-clock'),undefined);});
await test('same ID moved to new source key is rejected before commit',async()=>{const {engine,wrapped,storage,shadow}=await setup();await engine.__b46UpsertLedgerUnlocked([make()]);await assert.rejects(()=>wrapped.put('stat:v2:row:different-key',make()),/SOURCE_KEY_CHANGED/);assert.equal(await storage.get('stat:v2:row:different-key'),undefined);assert.equal((await shadow.read()).summary.ledgerTotal,1);});
await mkdir(D+'/qa',{recursive:true});await writeFile(D+'/qa/writer.json',JSON.stringify({ok:true,checks:results.length,results,productionReady:false,productionWrites:0,providerRequests:0,limit:'Actual hash-verified Engine writer methods with isolated mock transactions. Adapter NOT installed on Engine. No real Ledger parity or Cloudflare runtime verification.'},null,2));console.log(JSON.stringify({ok:true,writerChecks:results.length}));
