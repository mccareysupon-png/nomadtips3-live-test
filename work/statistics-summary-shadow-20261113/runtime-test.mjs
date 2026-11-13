import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const D='work/statistics-summary-shadow-20261113';
const require=createRequire(resolve(D+'/.runtime/resolve.cjs'));
const {Miniflare}=require('miniflare'),{build}=require('esbuild');
await build({entryPoints:[D+'/runtime-entry.mjs'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:*'],outfile:D+'/qa/runtime-bundle.mjs'});
const script=await readFile(D+'/qa/runtime-bundle.mjs','utf8'),results=[];
const row={id:'runtime-1',fixtureId:'fixture-1',market:'ft_ah',selection:'HOME',status:'PENDING',result:null,odds:1.925,createdAt:1794477600000,entryScore:{home:0,away:0}};
for(const useSQLite of [false,true]){
 let outbound=0;
 const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-08-06',cf:false,durableObjects:{HARNESS:{className:'SummaryHarness',useSQLite}},outboundService:()=>{outbound++;throw Error('OUTBOUND_FORBIDDEN');}});
 try{
  async function call(operation,row){const r=await mf.dispatchFetch('http://localhost/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,row})});assert.equal(r.status,200,await r.clone().text());return r.json();}
  let j=await call('write',row);assert.equal(j.summary.summary.pending,1);results.push({backend:useSQLite?'SQLITE':'LEGACY_KV',name:'insert on real local runtime',pass:true});
  const win={...row,status:'SETTLED',result:'WIN',settledAt:1794478600000};j=await call('write',win);assert.equal(j.summary.summary.win,1);assert.equal(j.summary.summary.pending,0);assert(Math.abs(j.summary.summary.net-0.925)<1e-8);results.push({backend:useSQLite?'SQLITE':'LEGACY_KV',name:'settlement updates counters and net',pass:true});
  j=await call('write',{...win,result:'LOSS',settledAt:1794478601000});assert.equal(j.summary.summary.win,0);assert.equal(j.summary.summary.loss,1);assert.equal(j.summary.summary.net,-1);results.push({backend:useSQLite?'SQLITE':'LEGACY_KV',name:'correction subtracts old result',pass:true});
  j=await call('rollback',{...row,id:'rollback-row'});assert.equal(j.summary.ledgerTotal,1);assert.equal(j.summary.loss,1);assert.equal((await call('read')).summary.ledgerTotal,1);assert.equal(outbound,0);results.push({backend:useSQLite?'SQLITE':'LEGACY_KV',name:'atomic rollback leaves no extra row/count',pass:true});
 }finally{await mf.dispose();}
}
await mkdir(D+'/qa',{recursive:true});const report={ok:true,checks:results.length,results,compatibilityDate:'2026-08-06',productionReady:false,productionWrites:0,providerRequests:0,productionRuntimeRequests:0,limit:'Local workerd via Miniflare, isolated namespaces. Available binary date predates Production compatibility date. Not exact hosted-runtime equivalence, real Ledger audit or live memory observation.'};await writeFile(D+'/qa/runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));