// Local Miniflare only. No credentials, provider calls, Production writes or deployment.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{Miniflare}=require('miniflare');
import {projectLedgerRow} from './persisted-read-store.mjs';
const clean=s=>s.replace(/^import .*?;\r?\n/gm,'');
const model=await readFile(new URL('./read-model.mjs',import.meta.url),'utf8'),store=clean(await readFile(new URL('./persisted-read-store.mjs',import.meta.url),'utf8'));
const worker=`import {DurableObject} from 'cloudflare:workers';\n${model}\n${store}\n
export class ReviewStatisticsDO extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.store=new PersistedReadStore(ctx.storage)}
 async fetch(request){const u=new URL(request.url);if(u.pathname==='/__qa/publish'){const b=await request.json();try{return Response.json(await this.store.publish(b.rows,{contentRevision:b.revision,asOf:b.asOf}))}catch(e){return Response.json({error:e.message},{status:409})}}
 if(u.pathname==='/summary')return Response.json(await this.store.summary());
 const r=await this.store.view({revision:Number(u.searchParams.get('revision')),rangeDays:Number(u.searchParams.get('days')||7),metric:u.searchParams.get('metric')||'units'});return Response.json(r,{status:r.status||200});
 }}
export default {fetch(request,env){return env.STAGING.get(env.STAGING.idFromName('statistics-test-only')).fetch(request)}};`;
let outbound=0;const mf=new Miniflare({workers:[{name:'statistics-local-review',script:worker,modules:true,compatibilityDate:'2026-08-06',cf:false,durableObjects:{STAGING:{className:'ReviewStatisticsDO',useSQLite:true}},outboundService:()=>{outbound++;throw Error('OUTBOUND_FORBIDDEN')}}]});
try{
 const w=await mf.getWorker('statistics-local-review'),input=JSON.parse(await readFile(new URL('./qa/live-ledger.json',import.meta.url),'utf8')),rows=input.rows.map(projectLedgerRow),asOf=Date.parse(input.ended);
 const post=(rows,revision)=>w.fetch('https://test.invalid/__qa/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rows,revision,asOf})});
 assert.equal((await post(rows,1)).status,200);let v=await(await w.fetch('https://test.invalid/view?revision=1&days=7')).json();assert(v.ok&&v.rows.length===50&&v.performance.unitPoints.length>0);
 const roi=await(await w.fetch('https://test.invalid/view?revision=1&days=7&metric=roi')).json();assert.equal(roi.performance.roiPoints.length,roi.performance.priced);
 assert.equal((await post(rows.slice(1),2)).status,200);assert.equal((await w.fetch('https://test.invalid/view?revision=1')).status,409);assert.equal((await(await w.fetch('https://test.invalid/summary')).json()).contentRevision,2);assert.equal(outbound,0);
 const result={ok:true,runtime:'Miniflare SQLite Durable Object',sourceRows:rows.length,checks:6,outbound,productionWrites:0};await writeFile(new URL('./qa/runtime-integration-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(result);
}finally{await mf.dispose()}
