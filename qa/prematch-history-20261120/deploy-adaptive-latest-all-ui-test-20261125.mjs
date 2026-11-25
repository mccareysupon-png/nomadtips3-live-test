// TEST-only patch latest Adaptive O/U research selections into all relevant BALL46 test views.
// Versions are pinned; require a fresh preflight and protect production. Never use paid providers.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchNativeAdaptiveLatest} from './b46-adaptive-latest-native-test-patch.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CREDENTIALS_MISSING');
const repoPath='qa/prematch-history-20261120/';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const owner='ball46-prematch-only-test-20261120';
const frontend='ball46-premium-match-colors-test-20261120';
const expected={
 [owner]:'a788f547-ac8e-4fd2-9785-e8dfa3a54f85',
 [frontend]:'56e2fa91-bf72-4ba5-a5ba-afe96b6004fa',
};
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
const dry=process.argv.includes('--dry-run');
async function cf(path,options={}){
 const response=await fetch(api+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(60000)});
 const json=await response.json();
 assert(response.ok&&json.success,path+' HTTP '+response.status+' '+JSON.stringify(json.errors).slice(0,250));
 return json.result;
}
async function active(name){return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function service(path,opts={}){
 const response=await fetch('https://'+(path.startsWith('/adaptive-control-')||path.startsWith('/ou-adaptive-')?owner:frontend)+'.mccarey-supon.workers.dev'+path,{
  ...opts,headers:{accept:'application/json',...opts.headers},cache:'no-store',signal:AbortSignal.timeout(35000)});
 const contentType=response.headers.get('content-type')||'';
 const body=contentType.includes('application/json')?await response.json():await response.text();
 return {status:response.status,body};
}
function modulesOf(installed){
 const mods=new Map(installed.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64')]));
 assert(mods.has(installed.main_module),'MAIN_NOT_PRESENT');
 return mods;
}
async function inspect(name){
 const id=await active(name);
 assert.equal(id,expected[name],'TEST_VERSION_DRIFT_'+name);
 const [installed,settings,schedules]=await Promise.all([
  cf('/workers/'+name+'/versions/'+id+'?include=modules'),
  cf('/scripts/'+name+'/settings'),
  cf('/scripts/'+name+'/schedules')
 ]);
 return {id,installed,settings,schedules,modules:modulesOf(installed)};
}
function meta(a){
 return {main_module:a.installed.main_module,compatibility_date:a.installed.compatibility_date,
  bindings:a.settings.bindings.map(x=>({name:x.name,type:'inherit'})),
  ...(a.installed.compatibility_flags?.length?{compatibility_flags:a.installed.compatibility_flags}:{})};
}
async function upload(name,a,modules){
 assert.equal(await active(name),a.id,'CONCURRENT_DEPLOY_BEFORE_UPLOAD_'+name);
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(meta(a))],{type:'application/json'}));
 for(const [key,content] of modules)form.append(key,new Blob([content],{type:'application/javascript+module'}),key);
 const result=await cf('/scripts/'+name+'/versions?bindings_inherit=strict',{method:'POST',body:form});
 assert(result.id,'VERSION_CREATE_FAILED_'+name);
 const check=await cf('/workers/'+name+'/versions/'+result.id+'?include=modules');
 assert.equal(check.modules.length,modules.size,'MODULE_COUNT_DRIFT_'+name);
 for(const m of check.modules)assert(modules.get(m.name).equals(Buffer.from(m.content_base64,'base64')),'MODULE_CONTENT_MISMATCH_'+name+'_'+m.name);
 return result.id;
}
async function setActive(name,id){
 await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})});
}
function sameSchedule(a,b){return JSON.stringify(a.schedules.map(x=>x.cron))===JSON.stringify(b.schedules.map(x=>x.cron))}
const [ownerInfo,frontInfo,protectedBefore,publicBefore]=await Promise.all([
 inspect(owner),inspect(frontend),Promise.all(protectedWorkers.map(active)),service('/__b46_pm_adaptive_research')
]);
assert(publicBefore.status===200,'PUBLIC_ADAPTIVE_NOT_AVAILABLE');
assert.equal(publicBefore.body.formulas?.length,42,'ADAPTIVE_FORMULAS_NOT_42');
assert.equal(ownerInfo.installed.main_module,'prematch-only-worker.mjs');
assert.equal(frontInfo.installed.main_module,'worker.js');
assert(ownerInfo.schedules.schedules.some(x=>x.cron==='*/15 * * * *'),'ADAPTIVE_CRON_MISSING');
const m1=new Map(ownerInfo.modules);
for(const name of ['b46-adaptive-formula-control-risk-test.mjs','b46-adaptive-manual-control-page-test.mjs','b46-adaptive-ou-ui-v1-test.mjs']){
 const prior=m1.get(name);assert(prior,'EXPECTED_MODULE_MISSING_'+name);
 const next=await readFile(repoPath+name);
 assert(!prior.equals(next),'EXPECTED_UPDATED_MODULE_'+name);
 m1.set(name,next);
}
const m2=new Map(frontInfo.modules);
const newFrontend=patchNativeAdaptiveLatest(m2.get('worker.js').toString('utf8'));
m2.set('worker.js',Buffer.from(newFrontend));
const tmp=await mkdtemp(join(tmpdir(),'ball46-latest-all-ui-'));
for(const [name,content] of [...m1].filter(([name])=>['b46-adaptive-formula-control-risk-test.mjs','b46-adaptive-manual-control-page-test.mjs','b46-adaptive-ou-ui-v1-test.mjs'].includes(name)).concat([['worker.js',m2.get('worker.js')]])){
 const file=join(tmp,name);
 await writeFile(file,content);
 execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
assert(newFrontend.includes('b46pm-adaptive-latest-predictions-content'));
assert(newFrontend.includes("b46AdaptiveLatestBlock(data,'statistics')"));
assert(newFrontend.includes('b46AdaptiveLatestPredictions(content)'));
assert.equal(await active(owner),ownerInfo.id);
assert.equal(await active(frontend),frontInfo.id);
if(dry){
 console.log('B46_ADAPTIVE_LATEST_ALL_UI_TEST_PREFLIGHT_PASS '+JSON.stringify({
  ownerSource:ownerInfo.id,frontendSource:frontInfo.id,sourceRecords:publicBefore.body.records.length,
  sourceFormulaCount:42,ownerModulesChanged:3,frontendModulesChanged:1,protectedWorkersUnchanged:true,
  noDeploy:true,providerCalls:0,productionWrites:0}));
 process.exit(0);
}
let ownerNext=null,frontNext=null,ownerDeployed=false,frontDeployed=false;
try{
 ownerNext=await upload(owner,ownerInfo,m1);
 frontNext=await upload(frontend,frontInfo,m2);
 assert.equal(await active(owner),ownerInfo.id,'OWNER_VERSION_DRIFT_BEFORE_ACTIVATE');
 assert.equal(await active(frontend),frontInfo.id,'FRONT_VERSION_DRIFT_BEFORE_ACTIVATE');
 await setActive(owner,ownerNext);ownerDeployed=true;
 await setActive(frontend,frontNext);frontDeployed=true;
 const auth='Bearer '+createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
 let apiState=null;
 for(let retry=0;retry<18;retry++){
  const r=await service('/adaptive-control-api-test',{headers:{authorization:auth}});
  if(retry===0||retry===10||retry===17)console.log('B46_OWNER_API_DIAGNOSTIC '+JSON.stringify({
   http:r.status,keys:r.body&&typeof r.body==='object'?Object.keys(r.body):[],
   code:r.body?.code||null,error:r.body?.error||null,
   formulaCount:r.body?.formulas?.length??null,latestCount:r.body?.latestSignals?.length??null
  }));
  if(r.status===200&&r.body?.latestSignals?.length&&r.body.formulas?.length===42){apiState=r.body;break;}
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 assert(apiState,'OWNER_LATEST_SIGNALS_API_UNAVAILABLE');
 const [researchHtml,ownerHtml,publicAdaptive,cronAfter,frontCronAfter]=await Promise.all([
  service('/ou-adaptive-research-test'),service('/adaptive-control-test'),service('/__b46_pm_adaptive_research'),
  cf('/scripts/'+owner+'/schedules'),cf('/scripts/'+frontend+'/schedules')
 ]);
 assert(researchHtml.status===200&&researchHtml.body.includes('b46-research-latest'),'RESEARCH_HTML_NO_LATEST_PANEL');
 assert(ownerHtml.status===200&&ownerHtml.body.includes('b46-control-latest'),'CONTROL_HTML_NO_LATEST_PANEL');
 assert(publicAdaptive.status===200&&publicAdaptive.body.formulas?.length===42,'PUBLIC_ADAPTIVE_REGRESSION');
 assert.equal(apiState.formulas.length,42);
 assert(sameSchedule(ownerInfo.schedules,cronAfter),'CRON_CHANGED_OWNER');
 assert(sameSchedule(frontInfo.schedules,frontCronAfter),'CRON_CHANGED_FRONTEND');
 assert.deepEqual(await Promise.all(protectedWorkers.map(active)),protectedBefore,'PRODUCTION_OR_PROTECTED_WORKER_CHANGED');
 assert.equal(await active(owner),ownerNext);
 assert.equal(await active(frontend),frontNext);
 const recent=publicAdaptive.body.records.slice().sort((a,b)=>b.picked_at-a.picked_at).filter((r,i,a)=>Number(r.picked_at)===Number(a[0].picked_at));
 const expectedRecords=recent.map(r=>r.fixture_id+'|'+r.formula_id+'|'+r.selection+'|'+r.odds).sort();
 const ownerRecords=apiState.latestSignals.map(r=>r.fixture_id+'|'+r.formula_id+'|'+r.selection+'|'+r.odds).sort();
 if(Number(apiState.latestPickedAt)===Number(recent[0]?.picked_at))assert.deepEqual(ownerRecords,expectedRecords,'LATEST_OWNER_RESEARCH_MISMATCH');
 console.log('B46_ADAPTIVE_LATEST_ALL_UI_TEST_DEPLOY_PASS '+JSON.stringify({
  ownerBefore:ownerInfo.id,ownerAfter:ownerNext,frontendBefore:frontInfo.id,frontendAfter:frontNext,
  mainUrl:'https://'+frontend+'.mccarey-supon.workers.dev/?b46pm=ou',
  predictionsUrl:'https://'+frontend+'.mccarey-supon.workers.dev/?b46pm=ou-predictions',
  researchUrl:'https://'+owner+'.mccarey-supon.workers.dev/ou-adaptive-research-test',
  controlUrl:'https://'+owner+'.mccarey-supon.workers.dev/adaptive-control-test',
  lastBatch:apiState.latestPickedAt,signals:apiState.latestSignals.map(r=>({formula:r.formula_id,selection:r.selection,fixtureId:r.fixture_id,odds:r.odds,status:r.status,quoteResearchOnly:r.quoteResearchOnly})),
  protectedWorkersUnchanged:true,cronUnchanged:true,providerCalls:0,productionWrites:0}));
}catch(err){
 console.log('B46_LATEST_ALL_UI_TEST_DEPLOY_FAILURE '+String(err?.stack||err));
 if(frontDeployed&&await active(frontend)===frontNext)await setActive(frontend,frontInfo.id);
 if(ownerDeployed&&await active(owner)===ownerNext)await setActive(owner,ownerInfo.id);
 throw err;
}
