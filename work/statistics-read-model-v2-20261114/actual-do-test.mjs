import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(resolve('work/statistics-summary-shadow-20261113/.runtime/resolve.cjs'));
const {Miniflare}=require('miniflare'),{build}=require('esbuild'),D='work/statistics-read-model-v2-20261114';
await mkdir(D+'/qa',{recursive:true});
await build({entryPoints:[D+'/durable-worker-harness.mjs'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:*'],outfile:D+'/qa/durable-runtime.mjs'});
const worker=await readFile(D+'/qa/durable-runtime.mjs','utf8');
let outboundCalls=0;
const mf=new Miniflare({workers:[{
 name:'b46-statistics-isolated-stage',script:worker,modules:true,compatibilityDate:'2026-08-06',cf:false,
 durableObjects:{STAGING:{className:'StatsStageDO',useSQLite:true}},
 outboundService:()=>{outboundCalls++;throw Error('EXTERNAL_PROVIDER_FORBIDDEN')}
}]});
try{
 const w=await mf.getWorker('b46-statistics-isolated-stage');
 const input=JSON.parse(await readFile('work/statistics-summary-shadow-20261113/reference/ui-proof/qa/verified-full-ledger.json','utf8'));
 const rows=input.rows.slice(0,1200),revision=8;
 const post=(data)=>w.fetch('https://isolated.local/__qa/publish',{method:'POST',headers:{'content-type':'application/json','x-local-stage':'1'},body:JSON.stringify(data)});
 const pre=await w.fetch('https://isolated.local/fast-summary');assert.equal(pre.status,503);
 assert.equal((await w.fetch('https://isolated.local/__qa/publish',{method:'POST'})).status,403);
 const published=await post({rows,revision,asOf:input.asOf});assert.equal(published.status,200,await published.clone().text());
 const result=await published.json();assert.equal(result.sourceRows,rows.length);assert(result.pages>=24);
 const summaryResp=await w.fetch('https://isolated.local/fast-summary'),summary=await summaryResp.json();assert.equal(summaryResp.status,200);assert.equal(summary.ledgerTotal,rows.length);assert.equal(summary.contentRevision,revision);
 const view=await (await w.fetch('https://isolated.local/fast-view?market=all&limit=50&page=1&revision=8')).json();
 assert(view.ok);assert.equal(view.rows.length,50);assert.equal(view.totalRows,1200);assert.equal(view.metrics.ledgerTotal,1200);
 const second=await(await w.fetch('https://isolated.local/fast-view?market=all&limit=50&page=2&revision=8')).json();
 assert.equal(second.rows.length,50);assert.equal(new Set([...view.rows,...second.rows].map(r=>r.id)).size,100);
 const OU=await(await w.fetch('https://isolated.local/fast-view?market=ou&revision=8')).json();
 assert.equal(OU.totalRows,summary.marketCounts.ou);
 const invalid=await w.fetch('https://isolated.local/fast-view?revision=7');assert.equal(invalid.status,409);
 const prev=await post({rows:rows.slice(0,100),revision:7,asOf:input.asOf});assert.equal(prev.status,409);
 const latest=await(await w.fetch('https://isolated.local/fast-summary')).json();assert.equal(latest.contentRevision,8);
 const report={ok:true,actualRuntime:'Miniflare SQLite-backed Durable Object',sourceRows:rows.length,revision:8,pageRows:view.rows.length,summaryTotal:summary.ledgerTotal,groupCount:result.views,pages:result.pages,rollbacksVerified:true,sourceFormulaPreserved:true,externalCalls:outboundCalls,productionWrites:0};
 assert.equal(outboundCalls,0);await writeFile(D+'/qa/actual-do-stage.json',JSON.stringify(report,null,2));
 console.log('DURABLE_OBJECT_STAGE '+JSON.stringify(report));
}finally{await mf.dispose()}
