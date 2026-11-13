import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ShadowSummary,backfill,londonDay,unitSettlement} from './summary.mjs';
const D='work/statistics-summary-shadow-20261113';
const fresh=existsSync(D+'/source/active.json');
const engineSource=await readFile(fresh?D+'/source/engine.js':'work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js','utf8');
assert.equal(createHash('sha256').update(engineSource).digest('hex'),'30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56');
const extract=name=>{const start=engineSource.indexOf('function '+name+'('),end=engineSource.indexOf('\n__name(',start);assert(start>=0&&end>start);return engineSource.slice(start,end);};
// blankLedgerMeta refers to an unchanged source constant.
const ref=new Function('STAT_LEDGER_VERSION',extract('blankLedgerMeta')+'\n'+extract('ledgerResultBucket')+'\n'+extract('applyLedgerMeta')+'\nreturn {blankLedgerMeta,applyLedgerMeta};')('signal-ledger-v2-longterm');
const financialSource=await readFile(fresh?D+'/source/longterm-performance-343.js':'work/perf-longterm-performance-343.js','utf8');
const sf=financialSource.match(/function settlement\(r\)\{[^\n]+/);assert(sf,'FINANCIAL_SOURCE_DRIFT');
const financial=new Function('outcome','num',sf[0]+';return settlement')(r=>String(r.result||'').toUpperCase(),v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null);
class Storage {
 constructor(){this.data=new Map();this.tail=Promise.resolve();this.reads=0;this.writes=0;this.fail=false;this.maxWrites=0;}
 async transaction(fn) {
  const run=this.tail.then(async()=>{
   const local=new Map();let written=0;
   const tx={get:async k=>{this.reads++;return structuredClone(local.has(k)?local.get(k):this.data.get(k));},put:async(k,v)=>{
    const entries=typeof k==='string'?[[k,v]]:Object.entries(k);for(const [key,value] of entries){assert(key.startsWith('b46:statistics:shadow:v1:'));local.set(key,structuredClone(value));written++;}
    if(this.fail){this.fail=false;throw Error('SIMULATED_STORAGE_FAILURE');}
   }};
   const result=await fn(tx);for(const [k,v]of local)this.data.set(k,v);this.writes+=written;this.maxWrites=Math.max(this.maxWrites,written);return result;
  });this.tail=run.catch(()=>{});return run;
 }
}
const source={engineVersion:'02e09215-02b1-47fb-b1cf-9423f50c7ce9',engineSha:'30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56',generation:'test-snapshot-1'};
const results=[];
async function test(name,fn){await fn();results.push({name,pass:true});}
const make=(id,over={})=>({id,market:'ft_ah',status:'PENDING',result:null,odds:1.925,createdAt:Date.parse('2026-11-12T10:00:00Z'),...over});
async function setup(){const storage=new Storage(),shadow=new ShadowSummary(storage,'test');await shadow.initialize(source);return {storage,shadow};}
function expected(rows){const m=ref.blankLedgerMeta();for(const r of rows)ref.applyLedgerMeta(m,r,1);return {...m,complete:true,sourceGeneration:source.generation};}
async function parity(shadow,rows){const e=expected(rows),actual=(await shadow.read()).summary;for(const k of ['ledgerTotal','settledTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'])assert.equal(actual[k],e[k],k);const a=await shadow.audit(e);assert.equal(a.ok,true);let net=0,stake=0;for(const r of rows.filter(x=>x.status==='SETTLED')){const v=financial(r);if(v.priced){net+=v.profit;stake+=v.stake;}}assert(Math.abs(actual.net-net)<1e-7);assert.equal(actual.stake,stake);}
await test('all five outcomes match existing financial function including missing odds',async()=>{
 for(const result of ['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID','UNKNOWN'])for(const odds of [null,undefined,'',0,1,1.925,'2.1',NaN])assert.deepEqual(unitSettlement({result,odds}),financial({result,odds}));
});
await test('empty snapshot never reports Production readiness',async()=>{const {shadow}=await setup();await parity(shadow,[]);assert.equal((await shadow.read()).productionReady,false);});
await test('pending -> settled -> corrected -> unresolved subtracts old result',async()=>{const {shadow}=await setup();for(const [i,row]of [make('a'),make('a',{status:'SETTLED',result:'WIN'}),make('a',{status:'SETTLED',result:'HALF_LOSS'}),make('a',{status:'UNRESOLVED'})].entries()){await shadow.apply({id:'a',revision:i+1,row});await parity(shadow,[row]);}});
await test('repeated delivery is idempotent',async()=>{const {shadow,storage}=await setup(),change={id:'a',revision:1,row:make('a')};await shadow.apply(change);const before=storage.writes;assert.equal((await shadow.apply(change)).state,'DUPLICATE');assert.equal(storage.writes,before);await parity(shadow,[change.row]);});
await test('conflicting replay rejected',async()=>{const {shadow}=await setup();await shadow.apply({id:'a',revision:1,row:make('a')});await assert.rejects(()=>shadow.apply({id:'a',revision:1,row:make('a',{status:'SETTLED',result:'WIN'})}),/CONFLICTING_REPLAY/);});
await test('late update rejected and tombstone prevents resurrection',async()=>{const {shadow}=await setup();await shadow.apply({id:'a',revision:2,row:make('a')});await shadow.apply({id:'a',revision:3,row:null});await assert.rejects(()=>shadow.apply({id:'a',revision:2,row:make('a')}),/OUT_OF_ORDER/);await parity(shadow,[]);});
await test('market correction moves counts between buckets',async()=>{const {shadow}=await setup();await shadow.apply({id:'a',revision:1,row:make('a')});await shadow.apply({id:'a',revision:2,row:make('a',{market:'ft_ou'})});assert.equal((await shadow.read('market/ft_ah')).summary.ledgerTotal,0);assert.equal((await shadow.read('market/ft_ou')).summary.ledgerTotal,1);});
await test('London 06:00 boundary and both DST transitions',async()=>{for(const [ms,day]of [['2026-11-12T05:59:59Z','2026-11-11'],['2026-11-12T06:00:00Z','2026-11-12'],['2026-03-29T04:59:59Z','2026-03-28'],['2026-03-29T05:00:00Z','2026-03-29'],['2026-10-25T05:59:59Z','2026-10-24'],['2026-10-25T06:00:00Z','2026-10-25']])assert.equal(londonDay(ms),day);});
await test('created-day correction removes prior day',async()=>{const {shadow}=await setup();await shadow.apply({id:'a',revision:1,row:make('a')});await shadow.apply({id:'a',revision:2,row:make('a',{createdAt:Date.parse('2026-11-13T10:00:00Z')})});assert.equal((await shadow.read('created-day/2026-11-12')).summary.ledgerTotal,0);assert.equal((await shadow.read('created-day/2026-11-13')).summary.ledgerTotal,1);});
await test('settlement-day correction removes prior Bangkok day',async()=>{const {shadow}=await setup();await shadow.apply({id:'a',revision:1,row:make('a',{status:'SETTLED',result:'WIN',settledAt:Date.parse('2026-11-12T16:59:59Z')})});await shadow.apply({id:'a',revision:2,row:make('a',{status:'SETTLED',result:'LOSS',settledAt:Date.parse('2026-11-12T17:00:00Z')})});assert.equal((await shadow.read('settled-day/2026-11-12')).summary.settledTotal,0);assert.equal((await shadow.read('settled-day/2026-11-13')).summary.loss,1);});
await test('transaction failure rolls back row and all counters; retry succeeds',async()=>{const {shadow,storage}=await setup();storage.fail=true;await assert.rejects(()=>shadow.apply({id:'a',revision:1,row:make('a')}),/STORAGE_FAILURE/);await parity(shadow,[]);await shadow.apply({id:'a',revision:1,row:make('a')});await parity(shadow,[make('a')]);});
await test('isolate restart recovers persisted counters',async()=>{const {shadow,storage}=await setup();await shadow.apply({id:'a',revision:1,row:make('a')});await parity(new ShadowSummary(storage,'test'),[make('a')]);});
await test('simultaneous updates are serialized atomically',async()=>{const {shadow}=await setup();const rows=Array.from({length:100},(_,i)=>make('x'+i));await Promise.all(rows.map(row=>shadow.apply({id:row.id,revision:1,row})));await parity(shadow,rows);});
await test('mismatch cannot pass counts gate; mutation invalidates previous audit',async()=>{const {shadow}=await setup();await parity(shadow,[]);await shadow.apply({id:'a',revision:1,row:make('a')});assert.equal((await shadow.read()).countsVerified,false);assert.equal((await shadow.audit(expected([]))).ok,false);assert.equal((await shadow.read()).countsVerified,false);});
await test('incomplete snapshot or changed generation rejected',async()=>{const {shadow}=await setup();await assert.rejects(()=>shadow.audit({...expected([]),complete:false}),/COMPLETE_SOURCE_REQUIRED/);await assert.rejects(()=>shadow.audit({...expected([]),sourceGeneration:'changed'}),/SOURCE_GENERATION_CHANGED/);});
await test('500 row bound enforced',async()=>{const {shadow}=await setup();await assert.rejects(()=>backfill(shadow,(async function*(){yield Array.from({length:501},()=>({}));})()),/PAGE_BOUND/);});
await test('15000 rows backfilled in 30 bounded pages, source count and net parity',async()=>{const {shadow,storage}=await setup();const rows=Array.from({length:15000},(_,i)=>make('bulk'+i,{market:i%2?'ft_ah':'ft_ou',status:i%11?'SETTLED':'PENDING',result:['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'][i%5]}));const p=await backfill(shadow,(async function*(){for(let i=0;i<rows.length;i+=500)yield rows.slice(i,i+500).map(row=>({id:row.id,revision:1,row}));})());assert.deepEqual(p,{rows:15000,maxPageRows:500});await parity(shadow,rows);assert(storage.maxWrites<=8);const before=storage.reads;await shadow.read();assert.equal(storage.reads-before,2);});
await test('deterministic correction sequence matches full recomputation',async()=>{const {shadow}=await setup();const latest=new Map(),revs=new Map();let seed=7;for(let i=0;i<500;i++){seed=(seed*16807)%2147483647;const id='random'+(seed%40),revision=(revs.get(id)||0)+1;revs.set(id,revision);const row=i%17===0?null:make(id,{status:['PENDING','UNRESOLVED','SETTLED'][i%3],result:['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'][i%5],market:i%2?'ft_ah':'ft_ou'});await shadow.apply({id,revision,row});if(row)latest.set(id,row);else latest.delete(id);if(i%25===0)await parity(shadow,[...latest.values()]);}await parity(shadow,[...latest.values()]);});
await mkdir(D+'/qa',{recursive:true});
const report={ok:true,checks:results.length,sourceMode:fresh?'FRESH_CONTROL_PLANE':'RECORDED_SOURCE_ONLY',productionReady:false,productionWrites:0,providerRequests:0,runtimeRequests:0,results,limitations:['Mock transactional storage, not Cloudflare runtime','No live Ledger reads or writer integration','Counts/financial parity uses generated rows; no real Ledger parity','Daily homepage half-result semantics and chart OHLC/max drawdown not switched']};
await writeFile(D+'/qa/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
