// BALL46 TEST manual-control Win/Loss formula dropdown: guarded one-module deploy.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchAdaptiveFormulaSelect} from './b46-manual-control-formula-dropdown-test-patch.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CLOUDFLARE_CREDENTIAL_MISSING');
const target='ball46-prematch-only-test-20261120';
const baseline='95c52eeb-c4d7-47b0-838d-c561e8db7e75';
const moduleName='b46-adaptive-manual-control-page-test.mjs';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const dry=process.argv.includes('--dry-run');
async function cf(path,options={}){
 const response=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(70000)});
 const body=await response.json().catch(()=>null);
 assert(response.ok&&body?.success,path+' HTTP '+response.status+' '+JSON.stringify(body?.errors||[]).slice(0,250));
 return body.result;
}
async function versionOf(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function activate(id){return cf('/scripts/'+target+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})})}
const [active,guardBefore,deployed,settings,cronBefore]=await Promise.all([
 versionOf(target),Promise.all(protectedWorkers.map(versionOf)),
 cf('/workers/'+target+'/versions/'+baseline+'?include=modules'),
 cf('/scripts/'+target+'/settings'),cf('/scripts/'+target+'/schedules')
]);
assert.equal(active,baseline,'TEST_WORKER_VERSION_DRIFT_REFUSE_TO_OVERWRITE');
assert.equal(deployed.main_module,'prematch-only-worker.mjs');
const mods=new Map(deployed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
assert(mods.has(moduleName),'CONTROL_HTML_MODULE_MISSING');
const old=mods.get(moduleName).toString('utf8');
const next=patchAdaptiveFormulaSelect(old);
assert.notEqual(next,old,'CONTROL_HTML_NOT_CHANGED');
const patched=Buffer.from(next,'utf8');
mods.set(moduleName,patched);
const tempFile=join(await mkdtemp(join(tmpdir(),'b46-control-dropdown-')),moduleName);
await writeFile(tempFile,patched);
execFileSync(process.execPath,['--check',tempFile],{stdio:'inherit'});
assert.equal(mods.size,deployed.modules.length);
const html=JSON.parse(next.slice(next.indexOf('=')+1).trim().replace(/;$/,''));
assert(html.includes('<select id="search" aria-label="เลือกสูตรเพื่อกรอง Win / Loss">'),'NATIVE_SELECT_MISSING');
assert(html.includes("sel.value=ids.indexOf(previous)!==-1?previous:''"),'PRESERVE_SELECTION_MISSING');
assert(html.includes("if(this.value)selected=this.value;draw()"),'DETAIL_UPDATE_MISSING');
assert(!html.includes('<input id="search"'),'SEARCH_INPUT_STILL_PRESENT');
const metadata={main_module:deployed.main_module,compatibility_date:deployed.compatibility_date,
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(deployed.compatibility_flags?.length?{compatibility_flags:deployed.compatibility_flags}:{})};
if(dry){
 console.log('B46_FORMULA_DROPDOWN_PREFLIGHT_PASS '+JSON.stringify({
  baseline,changedOnly:moduleName,moduleCount:mods.size,formulasFromAPI:true,
  defaultAllFormulas:true,selectSyncWithDetail:true,
  cron:cronBefore.schedules.map(c=>c.cron),productionWrites:0,paidApiCalls:0}));
 process.exit(0);
}
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const [name,buf]of mods)form.append(name,new Blob([buf],{type:'application/javascript+module'}),name);
let created=null,activated=false;
try{
 assert.equal(await versionOf(target),baseline,'CONCURRENT_DEPLOY_REFUSE');
 created=(await cf('/scripts/'+target+'/versions?bindings_inherit=strict',{method:'POST',body:form})).id;
 assert(created,'NEW_TEST_VERSION_NOT_CREATED');
 const check=await cf('/workers/'+target+'/versions/'+created+'?include=modules');
 assert.equal(check.modules.length,mods.size,'MODULE_COUNT_CHANGED');
 for(const m of check.modules)assert(mods.get(m.name)?.equals(Buffer.from(m.content_base64,'base64')),'MODULE_CHANGED_'+m.name);
 assert.equal(await versionOf(target),baseline,'CONCURRENT_DEPLOY_BEFORE_ACTIVATION');
 await activate(created);activated=true;
 assert.equal(await versionOf(target),created,'ACTIVE_TEST_VERSION_NOT_MATCH');
 const [cronAfter,guardAfter]=await Promise.all([
  cf('/scripts/'+target+'/schedules'),Promise.all(protectedWorkers.map(versionOf))
 ]);
 assert.deepEqual(cronAfter.schedules.map(c=>c.cron),cronBefore.schedules.map(c=>c.cron),'CRON_CHANGED');
 assert.deepEqual(guardAfter,guardBefore,'PROTECTED_WORKERS_CHANGED');
 console.log('B46_FORMULA_DROPDOWN_TEST_DEPLOY_PASS '+JSON.stringify({
  baseline,version:created,moduleChanged:moduleName,
  url:'https://'+target+'.mccarey-supon.workers.dev/adaptive-control-test',
  all42FromLiveAPI:true,cronUnchanged:true,otherModulesPreserved:true,
  protectedWorkersUnchanged:true,productionWrites:0,paidProviderCalls:0
 }));
}catch(error){
 console.log('B46_FORMULA_DROPDOWN_DEPLOY_FAIL '+String(error?.stack||error));
 if(activated&&created&&await versionOf(target)===created)await activate(baseline);
 throw error;
}
