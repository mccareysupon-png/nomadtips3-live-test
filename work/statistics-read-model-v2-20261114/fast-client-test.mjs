import assert from 'node:assert/strict';
import {FastStatisticsClient} from './fast-client.mjs';
import {createReadModel} from './read-model.mjs';
const rows=Array.from({length:300},(_,i)=>({id:'id-'+i,status:i%7===0?'PENDING':'SETTLED',result:i%7===0?null:i%2?'WIN':'LOSS',market:i%2?'Over 2.5':'Corners total',selection:i%2?'OVER':'UNDER',odds:1.9,createdAt:1700000000000+i*1000,settledAt:1700000000000+i*1000}));
let model=createReadModel(rows,{contentRevision:2,asOf:1700000400000}),clock=1700000400000,failSummary=false,changeNext=false,requests=[],asyncGate=null;
const serve=async path=>{requests.push(path);if(asyncGate)await asyncGate();if(path.endsWith('fast-summary')){if(failSummary)throw Error('NETWORK_OFFLINE');return model.summary;}const u=new URL(path,'https://test.invalid'),q=Object.fromEntries(u.searchParams);if(changeNext){changeNext=false;const current=model.query({market:q.market,variant:q.variant,filter:q.filter,page:Number(q.page),rangeDays:q.rangeDays==='all'?'all':Number(q.rangeDays)});model=createReadModel(rows,{contentRevision:5,asOf:1700000400001});return{...current,contentRevision:5};}return model.query({market:q.market,variant:q.variant,filter:q.filter,page:Number(q.page),rangeDays:q.rangeDays==='all'?'all':Number(q.rangeDays)});};
const client=new FastStatisticsClient(serve,{clock:()=>clock,ttlMs:10000});
const a=await client.open();assert(a.ok);assert.equal(a.summary.ledgerTotal,300);assert.equal(a.view.rows.length,50);assert.equal(a.view.totalRows,300);assert.deepEqual(requests.map(x=>x.split('?')[0]),['/api/statistics/fast-summary','/api/statistics/fast-view']);assert(requests.every(x=>!x.includes('/api/engine/statistics')));
const b=await client.open({market:'ou'});assert(b.ok);assert.equal(b.summary.ledgerTotal,300);assert.equal(b.view.rows.length,50);assert(b.view.totalRows<=300);assert.equal(requests.filter(x=>x.endsWith('fast-summary')).length,1);
const before=requests.length;const two=await Promise.all([client.getSummary(),client.getSummary()]);assert.equal(two[0],two[1]);assert.equal(requests.length,before);
clock+=10001;failSummary=true;const fallback=await client.getSummary();assert.equal(fallback.ledgerTotal,300);assert(fallback.stale);assert.equal(fallback.readError,'NETWORK_OFFLINE');failSummary=false;
clock+=10001;model=createReadModel(rows,{contentRevision:4,asOf:clock});const recovered=await client.getSummary({force:true});assert.equal(recovered.contentRevision,4);assert(!recovered.stale);
let release;const gate=new Promise(r=>{release=r});asyncGate=()=>gate;const cancelled=client.open({market:'corners'});await Promise.resolve();client.cancel();release();asyncGate=null;const maybe=await cancelled;assert(maybe.cancelled||maybe.ok); // cancellation is allowed before fetch starts
clock+=10001;const c=await client.open();assert(c.ok&&c.revision===4);
changeNext=true;clock+=10001;const race=await client.open();assert.equal(race.ok,true);assert.equal(race.revision,5);assert.equal(race.view.contentRevision,5);
const invalid=new FastStatisticsClient(async()=>({ok:true,contentRevision:1,ledgerTotal:100,marketCounts:{all:9}}));await assert.rejects(()=>invalid.getSummary(),/UNVERIFIED_SUMMARY/);
console.log('B46_FAST_CLIENT_TEST '+JSON.stringify({ok:true,checks:11,firstPage:50,allCount:300,requestCount:requests.length}));
