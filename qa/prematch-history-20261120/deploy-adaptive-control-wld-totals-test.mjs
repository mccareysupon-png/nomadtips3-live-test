import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {patchSource,MARK} from './patch-adaptive-control-wld-totals.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'TEST_CLOUDFLARE_CREDENTIALS_REQUIRED');
const worker='ball46-prematch-only-test-20261120',moduleName='b46-adaptive-manual-control-page-test.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedNames=['ball46-production','ball46-premium-match-colors-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const auditDir='qa/prematch-history-20261120/audit-control-wld-20261125';mkdirSync(auditDir,{recursive:true});
let record={task:MARK,worker,module:moduleName,run:process.env.GITHUB_RUN_ID};
const save=()=>writeFileSync(auditDir+'/deploy.json',JSON.stringify(record,null,2));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function cf(path,options={}){
 const opts={...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(90000)};
 const response=await fetch(root+path,opts),json=await response.json();
 assert(response.ok&&json.success,'CF_'+response.status+'_'+path+'_'+JSON.stringify(json.errors||[]).slice(0,400));
 return json.result;
}
async function current(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const active=d.deployments?.[0];
 assert(active?.versions?.length===1&&Number(active.versions[0].percentage)===100,'AMBIGUOUS_ACTIVE_'+name);
 return {version:active.versions[0].version_id,deployment:active.id};
}
async function versions(names){return Object.fromEntries(await Promise.all(names.map(async name=>[name,(await current(name)).version])))}
try{
 const initial=await current(worker);record.oldVersion=initial.version;
 const protectedBefore=await versions(protectedNames);record.protectedBefore=protectedBefore;
 const version=await cf('/workers/'+worker+'/versions/'+initial.version+'?include=modules');
 const settings=await cf('/scripts/'+worker+'/settings');
 const page=version.modules.find(m=>m.name===moduleName);
 assert(page?.content_base64,'CONTROL_PAGE_MODULE_NOT_FOUND');
 assert(version.main_module==='prematch-only-worker.mjs','BACKEND_WORKER_STRUCTURE_CHANGED');
 assert(version.modules.length>=5,'BACKEND_MODULE_LAYOUT_UNEXPECTED');
 const old=Buffer.from(page.content_base64,'base64').toString('utf8');
 assert(old.includes('Adaptive Formula Control')||old.includes('Adaptive Formula Manual Control'),'WRONG_CONTROL_SOURCE');
 const patched=patchSource(old);
 assert(patched.html.includes(MARK)&&patched.html.includes('showWldTotals(data.formulas)'));
 const changed=version.modules.map(m=>m.name===moduleName?{...m,content_base64:Buffer.from(patched.module).toString('base64')}:m);
 assert.equal(changed.length,version.modules.length,'MODULE_COUNT_CHANGED');
 for(let i=0;i<version.modules.length;i++)if(version.modules[i].name!==moduleName)assert.equal(changed[i].content_base64,version.modules[i].content_base64,'UNRELATED_MODULE_CHANGED');
 const metadata={main_module:version.main_module,compatibility_date:version.compatibility_date,
   compatibility_flags:version.compatibility_flags||[],bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'}))};
 record.originalModuleSHA=hash(old);record.updatedModuleSHA=hash(patched.module);record.moduleCount=changed.length;
 record.bindingNames=settings.bindings.map(b=>b.name);save();
 assert.equal((await current(worker)).version,initial.version,'CONCURRENT_BACKEND_VERSION_CHANGED');
 const currentProtected=await versions(protectedNames);
 assert.deepEqual(currentProtected,protectedBefore,'CONCURRENT_PROTECTED_WORKER_CHANGE');
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const module of changed){form.append(module.name,new Blob([Buffer.from(module.content_base64,'base64')],{type:module.content_type||'application/javascript+module'}),module.name)}
 const next=await cf('/scripts/'+worker+'/versions?bindings_inherit=strict',{method:'POST',body:form});
 assert(next.id);record.candidate=next.id;save();
 const uploaded=await cf('/workers/'+worker+'/versions/'+next.id+'?include=modules');
 assert.equal(uploaded.modules.length,version.modules.length);
 for(const m of changed)assert.equal(uploaded.modules.find(n=>n.name===m.name)?.content_base64,m.content_base64,'MODULE_BYTES_CHANGED_'+m.name);
 assert.equal((await current(worker)).version,initial.version,'CONCURRENT_DEPLOY_BEFORE_ACTIVATION');
 assert.deepEqual(await versions(protectedNames),protectedBefore,'PROTECTED_CHANGED_BEFORE_ACTIVATION');
 const activated=await cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
  strategy:'percentage',versions:[{version_id:next.id,percentage:100}],annotations:{'workers/message':'Adaptive Formula Control WLD 42 formula totals UI-only read-only '+MARK}
 })});
 record.deployment=activated.id;save();
 for(let i=0;i<15;i++){if((await current(worker)).version===next.id)break;await new Promise(r=>setTimeout(r,1000))}
 assert.equal((await current(worker)).version,next.id,'WLD_NOT_ACTIVE');
 const publicUrl='https://'+worker+'.mccarey-supon.workers.dev';
 let pageOk=false;
 for(let i=0;i<15;i++){
  const r=await fetch(publicUrl+'/adaptive-control-test?deploy='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(r.ok&&(await r.text()).includes(MARK)){pageOk=true;break}
  await new Promise(r=>setTimeout(r,1400));
 }
 assert(pageOk,'WLD_PAGE_NOT_SERVING_PATCH');
 const noAuth=await fetch(publicUrl+'/adaptive-control-api-test',{signal:AbortSignal.timeout(30000)});
 assert.equal(noAuth.status,401,'AUTH_GATE_REMOVED');
 record.activeVersion=next.id;record.status='ACTIVE_PENDING_BROWSER_QA';save();
 console.log('B46_ADAPTIVE_CONTROL_WLD_TEST_DEPLOYED '+JSON.stringify({url:publicUrl+'/adaptive-control-test',activeVersion:next.id,previousVersion:initial.version,deployId:activated.id,pageReady:pageOk,unauthorizedApiStatus:noAuth.status,modulesPreserved:version.modules.length-1,productionWrites:0,otherWorkerDeployments:0}));
}catch(e){record.status='ERROR';record.error=String(e.stack||e);save();throw e}
