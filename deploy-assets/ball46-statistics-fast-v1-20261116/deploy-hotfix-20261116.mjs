// Owner-authorized BALL46 V1 visual hotfix. One existing text module ONLY.
// No Engine, Ledger, source formula, original KV, or unrelated Worker module changes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {verifyBrowser} from './verify-fast-browser.mjs';
const ROOT='deploy-assets/ball46-statistics-fast-v1-20261116';
const WORKER='ball46-production',ENGINE='nomadtips3-engine-343',
 ACCOUNT='62cb0db544160e6591342abd6b4f35cc',
 SNAPSHOT='b46-stats-fast-v1-snapshot-20261116',
 EXPECTED='d2fe6c5e-5602-40f9-9b6f-d4d8674de638',
 ENTRY='statistics-fast-v1-release-20261116.mjs',
 SCRIPT_MODULE='statistics-fast-v1-js-20261116.txt',
 SCRIPT_PATH='/b46-statistics-fast-v1-20261116.js',
 SOURCE=ROOT+'/fast-client-hotfix-20261116.js',
 DIRECT='https://ball46-production.mccarey-supon.workers.dev',
 SITE='https://www.ball46.com';
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const namesort=a=>[...a].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const audit=ROOT+'/hotfix-release-audit';await mkdir(audit,{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,operation:'V1 visual regression hotfix',
 mode:process.env.B46_HOTFIX_MODE,productionChanged:false,engineWrites:0,ledgerWrites:0,
 stage:'preflight',writes:[]};
const save=()=>writeFile(audit+'/deployment.json',JSON.stringify(report,null,2));
let baseId=null,candidateId=null;
async function cf(method,path,data){
 if(method!=='GET'){
  assert.equal(method,'POST','ONLY_POST_ALLOWED');
  assert(['/workers/scripts/'+WORKER+'/versions','/workers/scripts/'+WORKER+'/deployments']
   .includes(path.split('?')[0]),'FORBIDDEN_CF_MUTATION_'+path);
  report.writes.push({method,path});await save();
 }
 const token=process.env.CLOUDFLARE_API_TOKEN;
 assert(token,'CLOUDFLARE_TOKEN_MISSING');
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
  method,headers:{authorization:'Bearer '+token,
   ...(data instanceof FormData?{}:data?{'content-type':'application/json'}:{})},
  body:data instanceof FormData?data:data?JSON.stringify(data):undefined,
  signal:AbortSignal.timeout(90000)
 });
 const out=await res.json();
 assert(res.ok&&out.success===true,'CF_'+res.status+':'+JSON.stringify(out.errors||[]));
 return out.result;
}
async function active(worker=WORKER){
 const data=(await cf('GET','/workers/scripts/'+worker+'/deployments?per_page=1')).deployments?.[0];
 assert(data?.versions?.length===1&&Number(data.versions[0].percentage)===100,'SPLIT_TRAFFIC_'+worker);
 return {id:data.versions[0].version_id,deploymentId:data.id};
}
async function version(worker,id){
 for(let i=0;i<12;i++){
  try{return await cf('GET','/workers/workers/'+worker+'/versions/'+id+'?include=modules')}
  catch(e){if(!String(e).includes('10071')||i===11)throw e;
   await new Promise(resolve=>setTimeout(resolve,1400))}
 }
 throw Error('VERSION_NOT_VISIBLE');
}
const modHash=m=>hash(Buffer.from(m.content_base64,'base64'));
async function asset(host,path){
 const res=await fetch(new URL(path,host),{headers:{'cache-control':'no-cache'},
  redirect:'error',signal:AbortSignal.timeout(55000)});
 const body=Buffer.from(await res.arrayBuffer());
 assert(res.status===200&&body.length,'ASSET_BAD_'+res.status+'_'+path);
 return body;
}
async function staticFingerprints(host){
 const names=['/dashboard-v2-stage3-featured-facts-20261013a.js',
  '/bulk-odds-compat-343.js','/singlepage-workspace-343.js','/longterm-performance-343.js'];
 const out={};
 for(const name of names)out[name]=hash(await asset(host,name));
 const health=JSON.parse(await asset(host,'/api/engine/health'));
 assert(health?.ok===true,'ENGINE_HEALTH_FAIL');
 return out;
}
async function browserHotfix(host){
 return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[ROOT+'/hotfix-readonly-qa.mjs'],{
    stdio:'inherit',env:{...process.env,B46_HOTFIX_TEST_REAL:'1',B46_HOTFIX_TEST_HOST:host}});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('HOTFIX_BROWSER_TIMEOUT'))},380000);
   child.on('error',e=>{clearTimeout(timer);reject(e)});
   child.on('exit',(code,signal)=>{clearTimeout(timer);
     if(code===0)resolve(true);
     else reject(Error('HOTFIX_BROWSER_FAILURE_'+code+'_'+signal))});
 });
}
async function verifyCandidate(got,base,replacementHash){
 assert.equal(got.main_module,ENTRY,'MAIN_MODULE_DRIFT');
 assert.equal(got.compatibility_date,base.compatibility_date,'DATE_DRIFT');
 assert.equal(canonical(got.compatibility_flags||[]),canonical(base.compatibility_flags||[]),'FLAG_DRIFT');
 assert.equal(canonical(got.assets?.config),canonical(base.assets?.config),'ASSET_CONFIG_DRIFT');
 assert.equal(canonical(namesort(got.bindings)),canonical(namesort(base.bindings)),'BINDINGS_CHANGED');
 assert.equal(got.modules.length,base.modules.length,'MODULE_COUNT_DRIFT');
 const old=new Map(base.modules.map(x=>[x.name,x]));
 for(const module of got.modules){
  const before=old.get(module.name);
  assert(before,'UNEXPECTED_MODULE_'+module.name);
  assert.equal(module.content_type,before.content_type,'MODULE_TYPE_CHANGED_'+module.name);
  assert.equal(modHash(module),module.name===SCRIPT_MODULE?replacementHash:modHash(before),
   'UNRELATED_MODULE_MUTATED_'+module.name);
 }
}
async function rollback(error){
 report.error=String(error?.stack||error).slice(0,6500);report.stage='FAILED';
 try{
  const current=await active();
  if(candidateId&&baseId&&current.id===candidateId){
   await cf('POST','/workers/scripts/'+WORKER+'/deployments',{
    strategy:'percentage',versions:[{version_id:baseId,percentage:100}],
    annotations:{'workers/message':'Auto rollback V1 visual hotfix after failed QA'}});
   report.rolledBack=(await active()).id===baseId;
  }
 }catch(e){report.rollbackError=String(e)}
 await save();
 console.error('B46_V1_VISUAL_HOTFIX_STOP='+JSON.stringify({
  error:report.error.slice(0,750),stage:report.stage,activated:report.productionChanged,
  rolledBack:report.rolledBack||false,baseline:baseId,candidate:candidateId}));
 process.exitCode=1;
}
try{
 assert.equal(process.env.B46_HOTFIX_APPROVED,'YES','OWNER_AUTH_MISSING');
 assert(['candidate','activate'].includes(process.env.B46_HOTFIX_MODE),'HOTFIX_MODE_MISSING');
 const script=await readFile(SOURCE,'utf8');
 new Function(script);
 assert(script.includes('.b46-stats-loader{display:none')&&
  script.includes('enhanceFilteredMarket')&&
  script.includes('ball46:finance-line-ready'),'HOTFIX_PATCH_INCOMPLETE');
 const newHash=hash(Buffer.from(script));report.newHash=newHash;
 report.before=await active();baseId=report.before.id;
 assert.equal(baseId,EXPECTED,'PRODUCTION_CHANGED_ABORT');
 const [engine,snapshotWorker,base,settings,other]=await Promise.all([
  active(ENGINE),active(SNAPSHOT),version(WORKER,baseId),
  cf('GET','/workers/scripts/'+WORKER+'/settings'),staticFingerprints(DIRECT)]);
 report.engineBefore=engine;report.snapshotBefore=snapshotWorker;report.otherAssets=other;
 assert.equal(base.main_module,ENTRY,'ACTIVE_MAIN_CHANGED');
 assert(base.modules.length>=50,'ACTIVE_MODULES_INCOMPLETE');
 const original=base.modules.find(x=>x.name===SCRIPT_MODULE);
 assert(original&&original.content_type==='text/plain','FAST_MODULE_NOT_FOUND');
 assert.notEqual(modHash(original),newHash,'HOTFIX_CONTENT_SAME_AS_BASE');
 const oldLiveHash=hash(await asset(DIRECT,SCRIPT_PATH));
 assert.equal(oldLiveHash,modHash(original),'ACTIVE_SCRIPT_BODY_NOT_BASELINE');
 const aux='https://'+SNAPSHOT+'.mccarey-supon.workers.dev';
 const [head,chart]=await Promise.all([asset(aux,'/head'),asset(aux,'/chart')]);
 const h=JSON.parse(head.toString()),g=JSON.parse(chart.toString());
 assert(h.ok&&g.ok&&h.total===g.summary?.rows&&h.snapshotSavedAt===g.asOf,
  'SNAPSHOT_SERVICE_NOT_VERIFIED');
 report.preflight={active:baseId,modules:base.modules.length,fastAsOf:h.snapshotSavedAt};
 await save();
 const modules=base.modules.map(x=>x.name===SCRIPT_MODULE?{
  ...x,content_base64:Buffer.from(script).toString('base64')}:x);
 const zip=modules.reduce((s,m)=>s+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);
 assert(zip<10*1024*1024-100*1024,'WORKER_GZIP_TOO_LARGE');
 const meta={main_module:base.main_module,compatibility_date:base.compatibility_date,
  compatibility_flags:base.compatibility_flags||[],
  bindings:base.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:'latest'}:x),
  keep_assets:true,
  annotations:{'workers/tag':'B46_V1_VISUAL_HOTFIX_20261116',
    'workers/message':'Owner-authorized post-V1 visual hotfix; only fast-client module changed'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])
   if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of modules)form.set(m.name,
  new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.deepEqual(await active(),report.before,'CONCURRENT_PROD_BEFORE_CANDIDATE');
 report.stage='UPLOAD_INACTIVE';await save();
 candidateId=(await cf('POST','/workers/scripts/'+WORKER+'/versions?bindings_inherit=strict',form)).id;
 assert(candidateId&&candidateId!==baseId,'INVALID_CANDIDATE_ID');
 report.candidateId=candidateId;
 const candidate=await version(WORKER,candidateId);
 await verifyCandidate(candidate,base,newHash);
 const preview='https://'+candidateId.slice(0,8)+'-'+WORKER+'.mccarey-supon.workers.dev';
 report.preview=preview;report.stage='INACTIVE_BROWSER_QA';await save();
 const html=(await asset(preview,'/?view=statistics')).toString('utf8');
 assert(html.includes('B46_STATISTICS_FAST_V1_OWNER_APPROVED_20261116'),'LOST_V1_HTML_INJECTION');
 assert.equal(hash(await asset(preview,SCRIPT_PATH)),newHash,'CANDIDATE_SCRIPT_HASH_BAD');
 assert.deepEqual(await staticFingerprints(preview),other,'CANDIDATE_OTHER_ASSETS_DRIFT');
 report.browserBase=await verifyBrowser(preview,'visual-candidate',audit);
 await browserHotfix(preview);await save();
 if(process.env.B46_HOTFIX_MODE==='candidate'){
  report.stage='INACTIVE_CANDIDATE_VERIFIED';report.ok=true;await save();
  console.log('B46_V1_VISUAL_HOTFIX_CANDIDATE_VERIFIED='+JSON.stringify({
    candidateId,preview,rollback:baseId,existingModules:base.modules.length,
    tests:report.browserBase,productionChanged:false}));
  process.exit(0);
 }
 assert.deepEqual(await active(),report.before,'CONCURRENT_PROD_CHANGED_STOP');
 assert.deepEqual(await active(ENGINE),engine,'ENGINE_VERSION_CHANGED_STOP');
 assert.deepEqual(await active(SNAPSHOT),snapshotWorker,'SNAPSHOT_VERSION_CHANGED_STOP');
 assert.deepEqual(await staticFingerprints(DIRECT),other,'PROD_ASSETS_CHANGED_STOP');
 report.stage='ACTIVATE';await save();
 await cf('POST','/workers/scripts/'+WORKER+'/deployments',{
  strategy:'percentage',versions:[{version_id:candidateId,percentage:100}],
  annotations:{'workers/message':'Owner-approved BALL46 V1 visual regression hotfix; tested'}});
 report.productionChanged=true;await save();
 assert.equal((await active()).id,candidateId,'ACTIVE_VERSION_INCORRECT');
 // Verify both canonical website and direct Worker at the actual active version.
 for(const host of [DIRECT,SITE]){
  let content=null;
  for(let retry=0;retry<12;retry++){
   try{content=await asset(host,SCRIPT_PATH)}catch{}
   if(content&&hash(content)===newHash)break;
   await new Promise(resolve=>setTimeout(resolve,1500));
  }
  assert(content&&hash(content)===newHash,'HOTFIX_PROPAGATION_FAIL_'+host);
 }
 report.stage='LIVE_QA';await save();
 report.liveBase=await verifyBrowser(DIRECT,'visual-live',audit);
 await browserHotfix(DIRECT);
 await verifyCandidate(await version(WORKER,candidateId),base,newHash);
 assert.deepEqual(await staticFingerprints(DIRECT),other,'LIVE_ASSET_DRIFT');
 assert.deepEqual(await active(ENGINE),engine,'ENGINE_CHANGED_POST_RELEASE');
 assert.deepEqual(await active(SNAPSHOT),snapshotWorker,'SNAPSHOT_CHANGED_POST_RELEASE');
 report.after=await active();report.ok=true;report.stage='LIVE_VERIFIED';await save();
 console.log('B46_V1_VISUAL_HOTFIX_RELEASE_SUCCESS='+JSON.stringify({
  before:baseId,after:report.after.id,rollback:baseId,
  unchangedModules:base.modules.length-1,modifiedModule:SCRIPT_MODULE,
  noEngineLedgerWrites:true,liveChecks:report.liveBase,run:report.run}));
}catch(e){await rollback(e)}
