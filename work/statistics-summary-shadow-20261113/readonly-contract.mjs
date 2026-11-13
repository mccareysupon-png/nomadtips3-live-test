import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const D='work/statistics-summary-shadow-20261113';
export async function verifyReadOnlyRoutes(raw){
 const moduleless=raw.replace('import { DurableObject } from "cloudflare:workers";','').replace(/export \{[\s\S]*?\};\s*\/\/# sourceMappingURL=index-bulk-recovery\.js\.map\s*$/,'');
 class DO{constructor(ctx,env){this.ctx=ctx;this.env=env;}}
 const {Engine,worker}=new Function('DurableObject','fetch',moduleless+';return {Engine:Nomad343Engine2,worker:index_bulk_recovery_default}')(DO,()=>{throw Error('PROVIDER_FORBIDDEN')});
 const reads=[];let scans=0;
 const storage={get:async key=>{reads.push(key);if(key==='stat:v2:meta')return {ledgerTotal:0,settledTotal:0,updatedAt:1};if(key==='board')return null;return null;},list:async options=>{assert.equal(options.limit,501);assert.equal(options.end,'stat:v2:row:\uffff');return new Map();},put:async()=>{throw Error('WRITE_FORBIDDEN');},delete:async()=>{throw Error('DELETE_FORBIDDEN');}};
 const engine=new Engine({storage},{});
 engine.scanIfDue=async()=>{scans++;throw Error('SCAN_FORBIDDEN');};engine.syncStatisticsLedger=async()=>{throw Error('SYNC_FORBIDDEN');};
 const env={ENGINE:{idFromName:name=>{assert.equal(name,'global');return name;},get:()=>({fetch:r=>engine.fetch(r)})}};
 for(const path of ['/ledger-health','/bridge-health','/statistics?paged=1&cursor='+encodeURIComponent('stat:v2:row:\uffff')]){
  const r=await worker.fetch(new Request('https://test.invalid'+path),env);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
 }
 assert.equal(scans,0);
 const bad=await worker.fetch(new Request('https://test.invalid/statistics?cursor=bad'),env);assert.equal(bad.status,400);assert.equal(scans,0);
 await assert.rejects(()=>worker.fetch(new Request('https://test.invalid/statistics?paged=1'),env),/SCAN_FORBIDDEN/);assert.equal(scans,1);
 return {checks:5,ok:true,readOnlyPaths:['/ledger-health','/bridge-health','/statistics WITH nonempty validated cursor'],ordinaryFirstPageTriggersScan:true};
}
if(process.argv[1]?.endsWith('readonly-contract.mjs')){
 const raw=await readFile(D+'/source/engine.js','utf8');console.log(JSON.stringify(await verifyReadOnlyRoutes(raw)));
}
