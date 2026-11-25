import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {patchAdaptiveWorker,PATCH_MARK} from './patch.mjs';
const name='ball46-premium-match-colors-test-20261120';
const protectedNames=['ball46-production','ball46-prematch-only-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_TEST_AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={task:PATCH_MARK,scope:'TEST_FRONTEND_ONLY',testWorker:name,run:process.env.GITHUB_RUN_ID};
mkdirSync('qa/adaptive-equity-no-flicker-20261125/audit',{recursive:true});
const save=()=>writeFileSync('qa/adaptive-equity-no-flicker-20261125/audit/deploy.json',JSON.stringify(report,null,2));
let previous,candidate,activated=false;
async function cf(path,options={}){
 const res=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(70000)});
 const body=await res.json();
 assert(res.ok&&body.success,'CLOUDFLARE_'+path+'_'+res.status+'_'+JSON.stringify(body.errors||[]));
 return body.result;
}
async function active(worker){
 const d=await cf('/scripts/'+worker+'/deployments?per_page=1');
 const versions=d.deployments?.[0]?.versions;
 assert(versions?.length===1&&Number(versions[0].percentage)===100,'NOT_SINGLE_ACTIVE_'+worker);
 return versions[0].version_id;
}
async function version(id){return cf('/workers/'+name+'/versions/'+id+'?include=modules')}
async function protect(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])))}
async function rollback(){
 if(!activated)return;
 if(await active(name)===previous)return;
 assert.equal(await active(name),candidate,'ANOTHER_TEST_DEPLOY_ACTIVE_STOP');
 await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({strategy:'percentage',versions:[{version_id:previous,percentage:100}],annotations:{'workers/message':'Rollback failed '+PATCH_MARK}})});
 report.rollbackVersion=previous;save();
 assert.equal(await active(name),previous,'TEST_ROLLBACK_NOT_CONFIRMED');
}
try{
 previous=await active(name);report.previousVersion=previous;
 const frozen=await protect(),installed=await version(previous);
 assert.equal(installed.main_module,'worker.js','TEST_WORKER_MAIN_DRIFT');
 assert(installed.modules.length>0&&installed.modules.every(x=>x.content_base64),'TEST_MODULES_UNAVAILABLE');
 const modules=new Map(installed.modules.map(x=>[x.name,{buffer:Buffer.from(x.content_base64,'base64'),type:x.content_type||'application/javascript+module'}]));
 const source=modules.get(installed.main_module)?.buffer?.toString('utf8');
 assert(source,'MAIN_MISSING');
 const patched=patchAdaptiveWorker(source);
 assert(patched.client.includes(PATCH_MARK),'MARKER_MISSING');
 assert(patched.client.includes('for(const days of [7,30,90])'),'PERIOD_BUTTONS_MISSING');
 assert(!patched.client.includes("b46AdaptiveChartDays=days;b46AdaptivePanel(content);"),'OLD_FLICKER_HANDLER_SURVIVES');
 modules.set(installed.main_module,{buffer:Buffer.from(patched.worker),type:'application/javascript+module'});
 report.patch={previousModuleSha:sha(Buffer.from(source)),candidateModuleSha:sha(Buffer.from(patched.worker)),originalClientSize:patched.originalClient.length,patchedClientSize:patched.client.length,oldGraphSize:patched.oldGraphSize,newGraphSize:patched.newGraphSize,moduleCount:modules.size};
 const settings=await cf('/scripts/'+name+'/settings');
 const metadata={main_module:installed.main_module,compatibility_date:installed.compatibility_date,
   bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
   ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
 assert(metadata.bindings.length===3,'TEST_BINDINGS_CHANGED');
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
 for(const [filename,module] of modules)form.append(filename,new Blob([module.buffer],{type:module.type}),filename);
 assert.equal(await active(name),previous,'TEST_CHANGED_BEFORE_UPLOAD');
 candidate=(await cf('/scripts/'+name+'/versions?bindings_inherit=strict',{method:'POST',body:form})).id;
 assert(candidate&&candidate!==previous,'CANDIDATE_MISSING');
 report.candidateVersion=candidate;save();
 const candidateVersion=await version(candidate);
 assert.equal(candidateVersion.main_module,installed.main_module,'CANDIDATE_MAIN_CHANGED');
 assert.equal(candidateVersion.modules.length,modules.size,'CANDIDATE_MODULES_CHANGED');
 for(const item of candidateVersion.modules)
  assert.equal(sha(Buffer.from(item.content_base64,'base64')),sha(modules.get(item.name).buffer),'CANDIDATE_FILE_CHANGED_'+item.name);
 assert.equal(await active(name),previous,'TEST_CHANGED_DURING_UPLOAD');
 assert.deepEqual(await protect(),frozen,'PROTECTED_WORKER_CHANGED_BEFORE_ACTIVATE');
 await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':PATCH_MARK}})});
 activated=true;save();
 assert.equal(await active(name),candidate,'TEST_ACTIVATION_FAILED');
 const host='https://'+name+'.mccarey-supon.workers.dev';
 let ready=false;
 for(let i=0;i<30;i++){
  const response=await fetch(host+'/__b46_prematch_client.js?equityRelease='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(22000)});
  const client=await response.text();
  if(response.ok&&client.includes(PATCH_MARK)&&client.includes('for(const days of [7,30,90])')){ready=true;break}
  await new Promise(r=>setTimeout(r,1200));
 }
 assert(ready,'PATCH_NOT_PROPAGATED_TO_TEST');
 const research=await fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(25000)});
 assert(research.ok,'RESEARCH_DATA_ENDPOINT_BROKEN');
 const data=await research.json();
 assert.equal(data.formulas?.length,42,'RESEARCH_FORMULA_COUNT_CHANGED');
 assert.equal(data.series30?.rangeDays,30,'30D_DATA_CHANGED');
 assert.equal(data.series90?.rangeDays,90,'90D_DATA_CHANGED');
 assert.deepEqual(await protect(),frozen,'PROTECTED_WORKER_CHANGED_AFTER_ACTIVATE');
 report.result='TEST_DEPLOYED_AWAITING_BROWSER_QA';report.protectedWorkers=frozen;save();
 console.log('B46_ADAPTIVE_EQUITY_TEST_DEPLOYED '+JSON.stringify({url:host+'/?b46pm=ou',previous,candidate,marker:PATCH_MARK,formulas:data.formulas.length,modules:modules.size,productionWrites:0}));
}catch(error){
 report.error=String(error.stack||error);report.result=activated?'TEST_FAILED_ROLLBACK':'TEST_FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(e){report.rollbackError=String(e);save()}
 console.error(error.stack||error);process.exitCode=1;
}
