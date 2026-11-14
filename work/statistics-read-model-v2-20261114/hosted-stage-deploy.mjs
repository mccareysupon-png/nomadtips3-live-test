// Isolated hosted test; never writes a production script/deployment/route/zone.
// Runs only in a GitHub Action with a temporary unique Worker script name.
// On failure the workflow disables the stage subdomain in a finally step.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
const R='work/statistics-read-model-v2-20261114',U='work/statistics-summary-shadow-20261113',A='62cb0db544160e6591342abd6b4f35cc';
const stage='b46-statistics-test-'+process.env.GITHUB_RUN_ID,auth=randomBytes(24).toString('hex');
const configPath=R+'/private-stage-config.json';
assert(/^b46-statistics-test-\d{8,15}$/.test(stage),'UNSAFE_STAGE_NAME');
assert(process.env.CLOUDFLARE_API_TOKEN,'CF_TOKEN_REQUIRED');
const cfToken=process.env.CLOUDFLARE_API_TOKEN;
const cf=async(method,path,body)=>{
 assert(method==='GET'||(method==='PUT'&&path==='/workers/scripts/'+stage)||(method==='POST'&&path==='/workers/scripts/'+stage+'/subdomain'),'CF_STAGE_ONLY');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method,headers:{authorization:'Bearer '+cfToken,...body&&!(body instanceof FormData)?{'content-type':'application/json'}:{}},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_STAGE_'+r.status+':'+JSON.stringify(j.errors));return j.result;
};
await mkdir(R+'/qa',{recursive:true});
await writeFile(configPath,JSON.stringify({stage,auth,origin:'https://'+stage+'.mccarey-supon.workers.dev'}));
const input=JSON.parse(await readFile(U+'/reference/ui-proof/qa/verified-full-ledger.json','utf8'));
const storage=new TestDurableStorage(),store=new PersistedReadStore(storage),revision=2026111401;
const local=await store.publish(input.rows,{contentRevision:revision,asOf:input.asOf,registry,formulas});
assert.equal(local.sourceRows,input.rows.length);
const cache=storage.map,active=cache.get('b46:stat:read-v2:active');
assert(active===local.generationKey);
const entries=[...cache.entries()].filter(([k])=>k!== 'b46:stat:read-v2:active');
const required=await store.summary();
assert.deepEqual(required.marketCounts,local.summary.marketCounts);
const require=createRequire(resolve(U+'/.runtime/resolve.cjs')),{build}=require('esbuild');
await build({entryPoints:[R+'/hosted-stage-worker.mjs'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:*'],loader:{'.txt':'text','.html':'text'},outfile:R+'/qa/hosted-worker.mjs'});
const bundle=await readFile(R+'/qa/hosted-worker.mjs');
const meta={main_module:'index.mjs',compatibility_date:'2026-08-06',bindings:[{type:'durable_object_namespace',name:'READ_MODEL',class_name:'StageReadDO'},{type:'plain_text',name:'STAGE_TOKEN',text:auth},{type:'plain_text',name:'STAGE_ID',text:stage}],migrations:{new_tag:'stage-'+process.env.GITHUB_RUN_ID,new_sqlite_classes:['StageReadDO']}};
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));form.set('index.mjs',new Blob([bundle],{type:'application/javascript+module'}),'index.mjs');
await cf('PUT','/workers/scripts/'+stage,form);
await cf('POST','/workers/scripts/'+stage+'/subdomain',{enabled:true,previews_enabled:false});
const origin='https://'+stage+'.mccarey-supon.workers.dev';
async function post(path,data,{tries=4}={}){
 for(let i=0;i<tries;i++){
  try{
   const r=await fetch(origin+path,{method:'POST',headers:{'x-b46-stage-auth':auth,'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(60000)});
   const result=await r.json();
   assert(r.status===200&&result.ok,'STAGE_POST_'+path+':'+r.status+':'+JSON.stringify(result).slice(0,160));return result;
  }catch(e){if(i===tries-1)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)))}
 }
}
async function get(path){
 const r=await fetch(origin+path,{headers:{'x-b46-stage-auth':auth},signal:AbortSignal.timeout(25000)});
 assert.equal(r.status,200,'STAGE_GET_'+path+':'+r.status);
 return r;
}
let batches=0,imported=0;
const batchSize=20;
for(let i=0;i<entries.length;i+=batchSize){
 const part=entries.slice(i,i+batchSize);
 await post('/__qa/import',{revision,batch:batches,entries:part});
 batches++;imported+=part.length;
 if(batches%20===0)console.log('STAGING_IMPORT '+JSON.stringify({batches,keys:imported,totalKeys:entries.length}));
}
assert.equal(imported,entries.length);
const published=await post('/__qa/activate',{revision,batches,keys:imported,sourceRows:input.rows.length});
assert.equal(published.sourceRows,input.rows.length);
const summary=await(await get('/api/statistics/fast-summary')).json();
assert.equal(summary.ledgerTotal,input.rows.length);assert.deepEqual(summary.marketCounts,required.marketCounts);
const view=await(await get('/api/statistics/fast-view?market=all&page=1&limit=50&rangeDays=all&revision='+revision)).json();
assert.equal(view.rows.length,50);assert.equal(view.totalRows,input.rows.length);
const html=await(await get('/?view=statistics')).text();assert(html.includes('data-workspace-panel')&&html.includes('STATISTICS STAGING'),'NATIVE_HTML_NOT_HOSTED');
const javascript=await(await get('/singlepage-workspace-343.js')).text();assert(javascript.includes('B46_ACTUAL_STATISTICS_STAGE'),'PATCHED_NATIVE_WORKSPACE_MISSING');
const result={ok:true,stage,origin,sourceRows:input.rows.length,revision,batches,keys:imported,groups:published.views,pages:published.pages,summaryBytes:Buffer.byteLength(JSON.stringify(summary)),firstViewBytes:Buffer.byteLength(JSON.stringify(view)),productionWrites:0,providerRequests:0,privateStage:true,originalHtml:true,originalStatisticsDom:true};
await writeFile(R+'/qa/hosted-stage.json',JSON.stringify(result,null,2));
console.log('HOSTED_STAGE_READY '+JSON.stringify(result));
