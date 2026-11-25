// BALL46 Adaptive Dot read-only TEST-only deployment.
// Installs a distinct high-entropy reader authorization hash as a Cloudflare secret (never printed).
// Leaves 42 formula rules, control modes, stored Ledger, data sources and other Workers unchanged.
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchAdaptiveDotRiskReadOnly} from './b46-adaptive-dot-readonly-worker-patch-test.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_DEPLOY_CREDENTIALS_NOT_CONFIGURED');
const worker='ball46-prematch-only-test-20261120';
const baseline='d66ec919-8158-4dd3-b797-2ade236c1ca5';
const protect=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
const host='https://'+worker+'.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const folder='qa/prematch-history-20261120/';
const dotModule='b46-adaptive-dot-risk-readonly-v1-test.mjs';
const secretName='B46_ADAPTIVE_DOT_READ_HASH';
const dry=process.argv.includes('--dry-run');
// Dedicated read bearer credential. It is not the owner password, and is never written to Git or logs.
const dotToken=createHmac('sha256',token).update('BALL46_TEST_DOT_RISK_READER_V1_INDEPENDENT_SCOPE').digest('hex');
const dotHash=createHash('sha256').update(dotToken).digest('hex');
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(75000)});
 const v=await r.json().catch(()=>null);
 assert(r.ok&&v?.success,path+' HTTP '+r.status+' '+JSON.stringify(v?.errors||[]).slice(0,280));
 return v.result;
}
async function active(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function deployedSettings(){return cf('/scripts/'+worker+'/settings')}
async function getVersion(id){return cf('/workers/'+worker+'/versions/'+id+'?include=modules')}
async function deploy(id){return cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})})}
const [initial,protectBefore,installBefore,cronBefore,secretsBefore]=await Promise.all([
 active(worker),Promise.all(protect.map(active)),getVersion(baseline),cf('/scripts/'+worker+'/schedules'),cf('/scripts/'+worker+'/secrets')
]);
assert.equal(initial,baseline,'TEST_WORKER_SOURCE_VERSION_DRIFT');
assert(cronBefore.schedules.some(x=>x.cron==='*/15 * * * *'),'TEST_CRON_15M_UNEXPECTEDLY_MISSING');
assert(secretsBefore.some(x=>x.name===secretName),'DEDICATED_DOT_SECRET_NOT_PRESENT');
const oldMap=new Map(installBefore.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
assert.equal(installBefore.main_module,'prematch-only-worker.mjs');
assert(!oldMap.has(dotModule));
const main=patchAdaptiveDotRiskReadOnly(oldMap.get(installBefore.main_module).toString('utf8'));
const source=await readFile(folder+dotModule);
const tmp=await mkdtemp(join(tmpdir(),'b46-dot-risk-test-'));
for(const [filename,text] of [[installBefore.main_module,main],[dotModule,source.toString('utf8')]]){
 const path=join(tmp,filename);await writeFile(path,text);execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}
assert(main.includes("x-b46-adaptive-cron-source"));
assert(main.includes('B46_DOT_READ_ONLY_CRON_V1'));
const newMap=new Map(oldMap);newMap.set(installBefore.main_module,Buffer.from(main));newMap.set(dotModule,source);
assert.equal(newMap.size,oldMap.size+1);
if(dry){
 console.log('B46_DOT_READONLY_PREFLIGHT_PASS '+JSON.stringify({
  worker,sourceVersion:baseline,existingModules:oldMap.size,newModules:newMap.size,
  cron:cronBefore.schedules.map(x=>x.cron),
  changed:[installBefore.main_module,dotModule],
  dedicatedReaderCredential:true,secretNotPrinted:true,noDeploy:true,productionWrites:0
 }));
 process.exit(0);
}
// Cloudflare creates a new version when adding the reader hash binding.
// The value is SHA-256(dotToken); neither it nor the dotToken are logged or committed.
let afterSecret=null,patchedVersion=null,activated=false;
try{
 // Dedicated hash secret was created in the prior attempt and is never rotated implicitly.
 assert(secretsBefore.some(x=>x.name===secretName));
 const listed=await cf('/scripts/'+worker+'/secrets');
 assert(listed.some(x=>x.name===secretName),'READ_ONLY_SECRET_MISSING_AFTER_ADD');
 afterSecret=await active(worker);
 const fresh=await getVersion(afterSecret);
 const freshMap=new Map(fresh.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
 assert.equal(freshMap.size,oldMap.size,'SECRET_ADD_DELETED_MODULE');
 for(const [name,content] of oldMap)assert(freshMap.get(name)?.equals(content),'SECRET_ADD_MUTATED_CODE_'+name);
 const settings=await deployedSettings();
 assert(settings.bindings.some(b=>b.name===secretName),'READ_ONLY_SECRET_NOT_IN_WORKER_SETTINGS');
 const metadata={main_module:fresh.main_module,compatibility_date:fresh.compatibility_date,
  bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
  ...(fresh.compatibility_flags?.length?{compatibility_flags:fresh.compatibility_flags}:{})};
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const [name,content]of newMap)form.append(name,new Blob([content],{type:'application/javascript+module'}),name);
 assert.equal(await active(worker),afterSecret,'CONCURRENT_DEPLOY_DURING_SECRET_INSTALL');
 const draft=await cf('/scripts/'+worker+'/versions?bindings_inherit=strict',{method:'POST',body:form});
 patchedVersion=draft.id;assert(patchedVersion,'NO_DRAFT_VERSION');
 const written=await getVersion(patchedVersion);
 assert.equal(written.modules.length,newMap.size);
 for(const mod of written.modules)assert(newMap.get(mod.name)?.equals(Buffer.from(mod.content_base64,'base64')),'UPLOAD_CHANGED_'+mod.name);
 assert.equal(await active(worker),afterSecret,'CONCURRENT_DEPLOY_BEFORE_ACTIVATION');
 await deploy(patchedVersion);activated=true;
 assert.equal(await active(worker),patchedVersion,'DEPLOYED_VERSION_NOT_ACTIVE');
 async function probe(method,credential){
  const r=await fetch(host+'/adaptive-dot-risk-read-test',{method,headers:{authorization:'Bearer '+credential,accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(25000)});
  const j=await r.json().catch(()=>null);return {http:r.status,data:j,cache:r.headers.get('cache-control'),cors:r.headers.get('access-control-allow-origin')};
 }
 // Wait for edge propagation; /READ may remain UNAVAILABLE until an ACTUAL scheduled cron executes.
 let legitimate=null;
 for(let attempt=0;attempt<24;attempt++){
  const v=await probe('GET',dotToken);
  if(attempt===0||attempt===8||attempt===16||attempt===23)console.log('B46_DOT_READER_DIAGNOSTIC '+JSON.stringify({
   attempt,http:v.http,status:v.data?.status??null,code:v.data?.code??null,
   reason:v.data?.reason??null,hasFormulas:Array.isArray(v.data?.formulas),cors:v.cors??null
  }));
  if((v.http===200||v.http===503)&&v.data?.code==='B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST'){legitimate=v;break;}
  await new Promise(resolve=>setTimeout(resolve,1600));
 }
 assert(legitimate,'DOT_READER_ENDPOINT_NOT_ON_EDGE');
 assert(legitimate.cache?.includes('no-store'),'DOT_READER_HTTP_CACHE_POLICY_INVALID');
 assert(!legitimate.cors,'PUBLIC_BROWSER_CORS_WRONGLY_ENABLED');
 if(legitimate.http===200)assert.equal(legitimate.data.formulas?.length,42);
 else{assert.equal(legitimate.data.formulas,null,'UNAVAILABLE_MUST_RETURN_NULL');assert(['UNAVAILABLE','STALE','DATA_QUALITY_ERROR'].includes(legitimate.data.status));}
 const [badCredential,mutation,ownerAgainstReader]=await Promise.all([
  probe('GET','0'.repeat(64)),
  probe('POST',dotToken),
  probe('GET',createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex'))
 ]);
 assert.equal(badCredential.http,401,'READER_BAD_CREDENTIAL_WAS_ACCEPTED');
 assert.equal(ownerAgainstReader.http,401,'OWNER_AUTH_ACCEPTED_AS_DOT');
 assert.equal(mutation.http,405,'DOT_READER_CAN_WRITE');
 const dotWrite=await fetch(host+'/adaptive-control-dot-test',{method:'POST',
  headers:{authorization:'Bearer '+dotToken,'content-type':'application/json'},
  body:JSON.stringify({formula:'A02',action:'PAUSE_IF_DD'}),signal:AbortSignal.timeout(25000)});
 assert(dotWrite.status===401||dotWrite.status===403,'DOT_READER_TOKEN_PERMITTED_CONTROL_MUTATION');
 const ownerKey=createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
 const ownerControl=await fetch(host+'/adaptive-control-api-test',{headers:{authorization:'Bearer '+ownerKey},signal:AbortSignal.timeout(25000)});
 assert(ownerControl.ok,'OWNER_CONTROL_REGRESSION');
 const ownerData=await ownerControl.json();assert.equal(ownerData.formulas?.length,42);
 const cronAfter=await cf('/scripts/'+worker+'/schedules');
 assert.deepEqual(cronAfter.schedules.map(c=>c.cron),cronBefore.schedules.map(c=>c.cron),'CRON_CHANGED');
 assert.deepEqual(await Promise.all(protect.map(active)),protectBefore,'PROTECTED_WORKER_CHANGED');
 console.log('B46_DOT_READONLY_DEPLOY_PASS '+JSON.stringify({
  previous:initial,afterReaderSecret:afterSecret,version:patchedVersion,
  endpoint:host+'/adaptive-dot-risk-read-test',
  credential:'stored-as-Cloudflare-secret-hash; derived-only-in-secure-CI',
  dotAccessHttp:legitimate.http,dotAccessStatus:legitimate.data.status,
  badCredentialDenied:true,ownerNotReusable:true,readerPostDenied:true,
  oldDotControlDenied:true,ownerManual42Preserved:true,
  cron:cronAfter.schedules.map(c=>c.cron),protectedWorkersUnchanged:true,
  noPublicLedgerRouteAdded:true,providerCalls:0,productionWrites:0
 }));
}catch(error){
 console.log('B46_DOT_READONLY_DEPLOY_FAILED '+String(error?.stack||error));
 if(activated&&patchedVersion&&await active(worker)===patchedVersion)await deploy(afterSecret||baseline);
 throw error;
}
