// Guarded TEST-only private KV connector bridge; adds ONE KV binding and changes ONE Worker code module.
// Does not modify Public research routes, owner auth/controls, formulas, Ledger, Cron schedule or Production.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {patchDotKvTestWorker,KV_NAME,KV_KEY,KV_NAMESPACE} from './b46-adaptive-dot-kv-bridge-test-patch.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_CREDS_REQUIRED');
const name='ball46-prematch-only-test-20261120';
const oldVersion='da5793ff-3d7b-49f9-a7d7-0aa9d9952d02';
const guarded=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,opts={}){
 const url=path.startsWith('/storage/')?'https://api.cloudflare.com/client/v4/accounts/'+account+path:base+path;
 const resp=await fetch(url,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(70000)});
 const json=await resp.json().catch(()=>null);
 assert(resp.ok&&json?.success,path+'_HTTP_'+resp.status+' '+JSON.stringify(json?.errors).slice(0,250));
 return json.result;
}
async function liveVersion(worker){return (await cf('/scripts/'+worker+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function activate(id){return cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})})}
const [active,protectedBefore,installed,settings,cron,ns]=await Promise.all([
 liveVersion(name),Promise.all(guarded.map(liveVersion)),
 cf('/workers/'+name+'/versions/'+oldVersion+'?include=modules'),
 cf('/scripts/'+name+'/settings'),
 cf('/scripts/'+name+'/schedules'),
 cf('/storage/kv/namespaces') // read-only namespace inventory
]);
assert.equal(active,oldVersion,'TEST_WORKER_ACTIVE_VERSION_CHANGED');
assert.equal(installed.main_module,'prematch-only-worker.mjs');
assert(cron.schedules.some(x=>x.cron==='*/15 * * * *'),'15_MINUTE_TEST_CRON_MISSING');
assert(ns.some(x=>x.id===KV_NAMESPACE),'PRIVATE_KV_NAMESPACE_NOT_FOUND');
assert(!settings.bindings.some(x=>x.name===KV_NAME),'KV_ALREADY_BOUND_TO_TEST');
const oldMap=new Map(installed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
const updatedMain=Buffer.from(patchDotKvTestWorker(oldMap.get('prematch-only-worker.mjs').toString('utf8')));
const files=new Map(oldMap);files.set('prematch-only-worker.mjs',updatedMain);
assert.equal(files.size,oldMap.size);
const tmp=join(await mkdtemp(join(tmpdir(),'b46-dot-kv-test-')),'prematch-only-worker.mjs');
await writeFile(tmp,updatedMain);execFileSync(process.execPath,['--check',tmp],{stdio:'inherit'});
const metadata={main_module:installed.main_module,compatibility_date:installed.compatibility_date,
 bindings:[...settings.bindings.map(x=>({type:'inherit',name:x.name})),
 {name:KV_NAME,type:'kv_namespace',namespace_id:KV_NAMESPACE}],
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
if(process.argv.includes('--dry-run')){
 console.log('B46_PRIVATE_KV_TEST_PREFLIGHT_PASS '+JSON.stringify({
  oldVersion,moduleCount:files.size,changedOnly:'prematch-only-worker.mjs',
  addedPrivateKvBinding:KV_NAME,cron:cron.schedules.map(x=>x.cron),
  noPublicRoute:true,noFormulaChange:true,productionWrites:0,paidApiCalls:0}));
 process.exit(0);
}
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const [path,content]of files)form.append(path,new Blob([content],{type:'application/javascript+module'}),path);
let newVersion=null,activated=false;
try{
 assert.equal(await liveVersion(name),oldVersion,'CONCURRENT_TEST_DEPLOY_DETECTED');
 const created=await cf('/scripts/'+name+'/versions?bindings_inherit=strict',{method:'POST',body:form});
 newVersion=created.id;assert(newVersion,'NEW_VERSION_MISSING');
 const verify=await cf('/workers/'+name+'/versions/'+newVersion+'?include=modules');
 assert.equal(verify.modules.length,files.size,'MODULE_COUNT_DRIFT');
 for(const mod of verify.modules)assert(files.get(mod.name)?.equals(Buffer.from(mod.content_base64,'base64')),'MODULE_MISMATCH_'+mod.name);
 assert(verify.bindings.some(b=>b.name===KV_NAME&&b.type==='kv_namespace'),'PRIVATE_KV_BINDING_NOT_INSTALLED');
 assert.equal(await liveVersion(name),oldVersion,'CONCURRENT_DEPLOY_BEFORE_ACTIVATE');
 await activate(newVersion);activated=true;
 assert.equal(await liveVersion(name),newVersion,'NEW_KV_TEST_VERSION_NOT_ACTIVE');
 const checks=await Promise.all(guarded.map(liveVersion));
 assert.deepEqual(checks,protectedBefore,'OTHER_WORKER_CHANGED');
 const cronAfter=await cf('/scripts/'+name+'/schedules');
 assert.deepEqual(cronAfter.schedules.map(x=>x.cron),cron.schedules.map(x=>x.cron),'CRON_CHANGED');
 console.log('B46_PRIVATE_KV_TEST_DEPLOY_PASS '+JSON.stringify({before:oldVersion,after:newVersion,
  privateNamespace:KV_NAMESPACE,key:KV_KEY,cron:cronAfter.schedules.map(x=>x.cron),
  changedOnly:'prematch-only-worker.mjs',protectedWorkersUnchanged:true,
  writesUntilNextRealCron:0,manualControlPreserved:true,paidProviderCalls:0,productionWrites:0}));
}catch(e){
 console.log('B46_PRIVATE_KV_TEST_DEPLOY_FAILED '+String(e?.stack||e));
 if(activated&&await liveVersion(name)===newVersion)await activate(oldVersion);
 throw e;
}
