import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createReadModel} from './read-model.mjs';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
import {ContentPublisher} from './content-publisher.mjs';
import {patchActualStatistics,patchActualPerformance} from './native-stage-ui.mjs';
const now=Date.UTC(2026,10,14,6,0),rows=Array.from({length:90},(_,i)=>({id:'row-'+i,status:i%9===0?'PENDING':'SETTLED',result:i%9===0?'LIVE':['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'][i%5],market:i%2?'Asian Handicap':'Over/Under',selection:i%2?'HOME':'OVER',odds:1.925,createdAt:now-i*86400000,settledAt:now-i*86400000,home:{name:'Home'},away:{name:'Away'}}));
function metadata(rows){const m={ledgerTotal:rows.length,total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0};const f={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};for(const r of rows){if(r.status==='SETTLED'){m.total++;m[f[r.result]]++;}else m[r.status.toLowerCase()]++;}return m;}
test('7D/30D/90D/ALL keep complete counts and calculate each selected range',()=>{
 const m=createReadModel(rows,{contentRevision:1,asOf:now,now});for(const d of ['all',7,30,90]){const v=m.query({rangeDays:d});assert.equal(v.totalRows,rows.length);assert.equal(v.metrics.ledgerTotal,rows.length);assert.equal(v.performance.rows,rows.filter(r=>r.status==='SETTLED'&&(d==='all'||r.settledAt>=now-d*86400000)).length);if(v.chart.length)assert(Math.abs(v.chart.at(-1).close-v.performance.net)<1e-9);}
});
test('Settled Days preserves inclusive Bangkok calendar span, not number of active dates',()=>{
 const m=createReadModel([{...rows[1],settledAt:now-4*86400000},{...rows[2],settledAt:now}],{contentRevision:1,now});assert.equal(m.summary.settledDays,5);
});
test('Empty Ledger and absent markets retain valid zero totals',()=>{const m=createReadModel([],{contentRevision:1,now});assert.equal(m.summary.ledgerTotal,0);assert.equal(m.summary.settledDays,0);assert.equal(m.query({rangeDays:7}).performance.rows,0);});
test('Published model isolates nested input mutations',()=>{const r=structuredClone(rows),m=createReadModel(r,{contentRevision:1,now});r[0].home.name='changed';assert.equal(m.query().rows[0].home.name,'Home');});
test('A new revision during publish is built and returned separately',async()=>{
 const store=new PersistedReadStore(new TestDurableStorage());const [a,b]=await Promise.all([store.publish(rows,{contentRevision:1,asOf:now}),store.publish(rows.slice(1),{contentRevision:2,asOf:now})]);assert.equal(a.contentRevision,1);assert.equal(b.contentRevision,2);assert.equal((await store.summary()).contentRevision,2);assert.equal((await store.view({revision:1})).status,409);
});
test('Failed derived writes preserve the active revision and the next update recovers',async()=>{
 const storage=new TestDurableStorage(),store=new PersistedReadStore(storage);await store.publish(rows,{contentRevision:1,asOf:now});storage.failAfter=storage.writes+3;await assert.rejects(store.publish(rows.slice(1),{contentRevision:2,asOf:now}),/WRITE_TEST_FAULT/);assert.equal((await store.summary()).contentRevision,1);storage.failAfter=Infinity;await store.publish(rows.slice(2),{contentRevision:3,asOf:now});assert.equal((await store.summary()).contentRevision,3);
});
test('No-op Ledger sync timestamp does not invalidate content; corrections do',async()=>{
 const store=new PersistedReadStore(new TestDurableStorage(),{clock:()=>now}),publisher=new ContentPublisher(store,{clock:()=>now});const meta=metadata(rows);assert((await publisher.ingest(rows,meta)).changed);const updated=rows.map(r=>({...r,mirrorUpdatedAt:now+1000}));const noOp=await publisher.ingest(updated,{...meta,ledgerUpdatedAt:now+1000});assert.equal(noOp.changed,false);assert.equal(noOp.contentRevision,1);updated[1].odds=2.1;assert.equal((await publisher.ingest(updated,meta)).contentRevision,2);
});
test('Partial data cannot be published',async()=>{const p=new ContentPublisher(new PersistedReadStore(new TestDurableStorage()),{clock:()=>now});await assert.rejects(p.ingest(rows.slice(1),metadata(rows)),/INCOMPLETE_LEDGER/);});
test('Source observation freshness is separate from content age',async()=>{
 let clock=now+10000;const store=new PersistedReadStore(new TestDurableStorage(),{clock:()=>clock,maxAgeMs:1000}),p=new ContentPublisher(store,{clock:()=>clock});await p.ingest(rows,metadata(rows));clock+=1500;assert((await store.summary()).stale);await p.ingest(rows,metadata(rows));assert(!(await store.summary()).stale);assert.equal((await store.summary()).contentRevision,1);
});
test('Exact metric points are lazy and stored within Durable Object value limits',async()=>{
 const st=new TestDurableStorage(),store=new PersistedReadStore(st,{clock:()=>now});await store.publish(rows,{contentRevision:1,asOf:now});const units=await store.view({revision:1,rangeDays:7}),roi=await store.view({revision:1,rangeDays:7,metric:'roi'});assert.equal(units.performance.roiPoints.length,0);assert.equal(roi.performance.roiPoints.length,roi.performance.priced);for(const value of st.map.values())assert(Buffer.byteLength(JSON.stringify(value))<128*1024);
});
test('Current original UI patches compile and remove chart/days eager history reads',async()=>{
 const root=new URL('./qa/live-base/',import.meta.url),workspace=await readFile(new URL('workspace.js',root),'utf8'),performance=await readFile(new URL('performance.js',root),'utf8');const w=patchActualStatistics(workspace),p=patchActualPerformance(performance);new vm.Script(w);new vm.Script(p);assert(!p.includes('BALL46_STATISTICS_DATA.load()'));assert(!w.includes('if(api?.load)api.load().then(paint)'));assert(w.includes('ball46:statistics-fast-refresh'));assert(w.includes('Statistics incomplete or unavailable'));assert(p.includes('function dailyUnitPoints(points){if(points.every(p=>p.dayKey))return points;'));
});
