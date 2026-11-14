import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createReadModel,familyOf,selectionOf,isSettled,dateMs,outcome} from './read-model.mjs';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
import {ContentPublisher,verifyCompleteLedger} from './content-publisher.mjs';
const base=new URL('./qa/',import.meta.url),input=JSON.parse(await readFile(new URL('live-ledger.json',base),'utf8'));
assert(input.metadataStable,'LIVE_SOURCE_CHANGED_DURING_CAPTURE');verifyCompleteLedger(input.rows,input.first);
const registryText=await readFile(new URL('live-base/registry.js',base),'utf8'),financeText=await readFile(new URL('live-base/performance.js',base),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');assert.equal(sha(financeText),'822f3d9d271a948d6b862eb7732f8797dcedbcc743cd63f3094f217b537b22bf');
const regCtx={window:{}};vm.runInNewContext(registryText,regCtx);const registry=regCtx.window.BALL46_MARKET_REGISTRY;
const lines=financeText.split('\n'),ctx={window:{BALL46_STATISTICS_DATA:{outcome}},Intl,Date};
vm.runInNewContext([lines[8],lines[9],lines[23],lines[24],lines[27],...lines.slice(50,54),...lines.slice(55,69),'this.api={stats,dailyUnitPoints};'].join('\n'),ctx);
const rows=input.rows,now=Date.parse(input.ended),model=createReadModel(rows,{contentRevision:1,asOf:now,now,registry}),groups=new Map();
for(const r of rows){const m=familyOf(r,registry),v=registry.resolve(r)?.key||'other',f=selectionOf(r);for(const q of [{market:'all',variant:'all',filter:'all'},{market:m,variant:'all',filter:'all'},{market:m,variant:v,filter:'all'},{market:m,variant:'all',filter:f},{market:m,variant:v,filter:f}])groups.set(JSON.stringify(q),q);}
let cases=0;for(const q of groups.values())for(const days of ['all',7,30,90]){
 const selected=rows.filter(r=>(q.market==='all'||familyOf(r,registry)===q.market)&&(q.variant==='all'||registry.resolve(r)?.key===q.variant)&&(q.filter==='all'||selectionOf(r)===q.filter));
 const settled=selected.filter(isSettled).filter(r=>days==='all'||dateMs(r.settledAt??r.createdAt)>=now-days*86400000).sort((a,b)=>dateMs(a.settledAt??a.createdAt)-dateMs(b.settledAt??b.createdAt));
 const expected=ctx.api.stats(settled),actual=model.query({...q,rangeDays:days});assert.equal(actual.totalRows,selected.length);
 for(const field of ['rows','wins','losses','pushes','priced','net','stake','roi','avgOdds','maxDD','peak','bestRun']){const a=actual.performance[field],b=expected[field];assert(a===b||Math.abs(a-b)<1e-7,JSON.stringify({q,days,field,a,b}));}
 const ep=ctx.api.dailyUnitPoints(expected.unitPoints),ap=actual.performance.unitPoints;assert.equal(ep.length,ap.length);for(let i=0;i<ep.length;i++)for(const key of ['open','high','low','close','count','firstDate','lastDate'])assert(Math.abs(ep[i][key]-ap[i][key])<1e-7,key);
 for(const metric of ['roiPoints','ratePoints']){assert.equal(actual.performance[metric].length,expected[metric].length);assert(actual.performance[metric].every((p,i)=>Math.abs(p.value-expected[metric][i].value)<1e-7));}
 cases++;
}
const storage=new TestDurableStorage(),store=new PersistedReadStore(storage,{clock:()=>now}),publisher=new ContentPublisher(store,{registry,clock:()=>now});
let t=performance.now();await publisher.ingest(rows,input.first);const publishMs=performance.now()-t;
t=performance.now();const view=await store.view({revision:1}),viewMs=performance.now()-t;
const noOp=await publisher.ingest(rows,{...input.first,ledgerUpdatedAt:Date.now()});assert(!noOp.changed);
const same=await store.view({revision:1});assert.deepEqual(same.performance,view.performance);
const maxValueBytes=Math.max(...[...storage.map.values()].map(x=>Buffer.byteLength(JSON.stringify(x))));assert(maxValueBytes<128*1024,'DURABLE_VALUE_TOO_LARGE');
const report={ok:true,productionBase:'488bb408-fec7-4620-aa63-5e1078904d33',capturedAt:input.ended,captureStarted:input.started,metadataStable:input.metadataStable,sourceSnapshotPinned:false,sourceRows:rows.length,settled:model.summary.settledTotal,marketCounts:model.summary.marketCounts,groups:groups.size,rangeParityCases:cases,allFinancialAndChartPointsExact:true,publishMs,viewMs,firstViewBytes:Buffer.byteLength(JSON.stringify(view)),fullSourceBytes:Buffer.byteLength(JSON.stringify(rows)),maxValueBytes,providerRequests:0,productionWrites:0};
await writeFile(new URL('live-parity-result.json',base),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
