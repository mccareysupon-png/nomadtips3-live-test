// BALL46 — owner-authorized removal of the redundant moved top KPI row in Statistics.
// Only module statistics-menu-entry-20261114.mjs is changed; all others identical.
// Strict inactive candidate QA before activate; rollback exact prior version on failure.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {verifyBrowser} from './verify-fast-browser.mjs';
import {removeMovedKpiStripFromMenu,PATCH_TAG} from './remove-moved-kpi-strip.mjs';

const ROOT='deploy-assets/ball46-statistics-fast-v1-20261116',
 WORKER='ball46-production',ENGINE='nomadtips3-engine-343',
 SNAPSHOT='b46-stats-fast-v1-snapshot-20261116',
 ACCOUNT='62cb0db544160e6591342abd6b4f35cc',
 EXPECTED='183f194b-0354-4366-8bca-9b17ca6458b0',
 MODULE='statistics-menu-entry-20261114.mjs',
 ENTRY='statistics-fast-v1-release-20261116.mjs',
 SCRIPT_PATH='/b46-statistics-fast-v1-20261116.js',
 DIRECT='https://ball46-production.mccarey-supon.workers.dev',
 SITE='https://www.ball46.com';
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,o)=>o&&typeof o==='object'&&!Array.isArray(o)?
 Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))):o);
const sort=a=>[...a].sort((x,y)=>String(x.name).localeCompare(String(y.name)));
const audit=ROOT+'/remove-top-kpis-release-audit';
await mkdir(audit,{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,mode:process.env.B46_TOP_KPI_MODE,
 stage:'PREDEPLOY',scope:'one menu module only',engineWrites:0,ledgerWrites:0,
 productionChanged:false,requestLog:[]};
const save=()=>writeFile(audit+'/release.json',JSON.stringify(report,null,2));
let baseId=null,candidateId=null;
async function cf(method,path,body){
 if(method!=='GET'){
  assert.equal(method,'POST','NO_METHOD_ALLOWED');
  assert(['/workers/scripts/'+WORKER+'/versions','/workers/scripts/'+WORKER+'/deployments'].includes(path.split('?')[0]),
   'CLOUDFLARE_WRITE_OUTSIDE_SITE_VERSION_DEPLOY');
  report.requestLog.push({method,path});await save();
 }
 const token=process.env.CLOUDFLARE_API_TOKEN;
 assert(token,'MISSING_CLOUDFLARE_TOKEN');
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
  method,headers:{authorization:'Bearer '+token,
   ...(body instanceof FormData?{}:body?{'content-type':'application/json'}:{})},
  body:body instanceof FormData?body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(90000)});
 const v=await res.json();
 assert(res.ok&&v.success===true,'CLOUDFLARE_'+res.status+'_'+JSON.stringify(v.errors||[]));
 return v.result;
}
async function active(worker=WORKER){
 const dep=(await cf('GET','/workers/scripts/'+worker+'/deployments?per_page=1')).deployments?.[0];
 assert(dep?.versions?.length===1&&Number(dep.versions[0].percentage)===100,
  'DEPLOY_NOT_FULL_PERCENTAGE_'+worker);
 return {id:dep.versions[0].version_id,deployment:dep.id};
}
async function version(worker,id){
 for(let i=0;i<12;i++){
  try{return await cf('GET','/workers/workers/'+worker+'/versions/'+id+'?include=modules');}
  catch(e){if(i===11||!String(e).includes('10071'))throw e;
    await new Promise(resolve=>setTimeout(resolve,1500));}
 }
 throw Error('CANDIDATE_VERSION_MISSING');
}
async function asset(host,path){
 const res=await fetch(new URL(path,host),{redirect:'error',
  headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(60000)});
 const buf=Buffer.from(await res.arrayBuffer());
 assert.equal(res.status,200,'HTTP_'+res.status+'_'+host+path);
 assert(buf.length>0,'EMPTY_'+path);
 return buf;
}
async function fingerprint(host){
 const out={};
 for(const path of ['/singlepage-workspace-343.js','/longterm-performance-343.js',
    '/bulk-odds-compat-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js',
    SCRIPT_PATH])
   out[path]=hash(await asset(host,path));
 const health=JSON.parse((await asset(host,'/api/engine/health')).toString());
 assert(health?.ok===true,'ENGINE_HEALTH_NOT_OK');
 return out;
}
function moduleDigest(m){return hash(Buffer.from(m.content_base64,'base64'))}
function inspectModules(got,base,replacement){
 assert.equal(got.main_module,ENTRY,'MAIN_ENTRY_CHANGED');
 assert.equal(got.compatibility_date,base.compatibility_date,'COMPAT_DATE_CHANGED');
 assert.equal(canonical(got.compatibility_flags||[]),canonical(base.compatibility_flags||[]),'FLAGS_CHANGED');
 assert.equal(canonical(got.assets?.config),canonical(base.assets?.config),'ASSETS_CHANGED');
 assert.equal(canonical(sort(got.bindings)),canonical(sort(base.bindings)),'BINDINGS_CHANGED');
 assert.equal(got.modules.length,base.modules.length,'MODULES_COUNT_CHANGED');
 const old=new Map(base.modules.map(m=>[m.name,m]));
 for(const m of got.modules){
  const prev=old.get(m.name);
  assert(prev,'UNEXPECTED_MODULE_'+m.name);
  assert.equal(m.content_type,prev.content_type,'MODULE_TYPE_CHANGED_'+m.name);
  assert.equal(moduleDigest(m),m.name===MODULE?replacement:moduleDigest(prev),
    'UNRELATED_MODULE_CHANGED_'+m.name);
 }
}
function checkCleanHtml(body){
 assert(body.includes('B46_STATISTICS_FAST_V1_OWNER_APPROVED_20261116'),'FAST_V1_INJECTION_MISSING');
 assert(!body.includes('<section class="sp-kpis">'),'OLD_TOP_KPI_STRIP_STILL_IN_HTML');
 assert(!body.includes('data-sp-kpi="total"'),'OLD_KPI_FIELDS_STILL_IN_HTML');
 assert(!body.includes('id="b46-statistics-visuals-20261114-runtime"'),
   'PREVIOUS_ANIMATION_REAPPEARED');
 assert(body.includes('id="b46-stats-v1-no-legacy-firstpaint-20261116"'),
   'NO_FLASH_GUARD_MISSING');
}
async function browser(host){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[ROOT+'/verify-remove-moved-kpis-browser.mjs'],{
   env:{...process.env,B46_TOP_KPI_TEST_HOST:host},stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('BROWSER_TOP_KPI_QA_TIMEOUT'))},360000);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',(code,signal)=>{clearTimeout(timer);
    if(code===0)resolve(true);
    else reject(Error('BROWSER_TOP_KPI_QA_FAILED_'+code+'_'+signal))});
 });
}
async function rollback(e){
 report.error=String(e?.stack||e).slice(0,5000);report.stage='STOPPED';
 try{
  const now=await active();
  if(baseId&&candidateId&&now.id===candidateId){
   await cf('POST','/workers/scripts/'+WORKER+'/deployments',{
    strategy:'percentage',versions:[{version_id:baseId,percentage:100}],
    annotations:{'workers/message':'Auto rollback redundant KPI row deletion after live QA failure'}});
   report.rollbackSucceeded=(await active()).id===baseId;
  }
 }catch(err){report.rollbackError=String(err)}
 await save();
 console.error('B46_REMOVE_TOP_KPIS_STOP='+JSON.stringify({
  stage:report.stage,reason:report.error.slice(0,1100),baseId,candidateId,
  activated:report.productionChanged,rolledBack:report.rollbackSucceeded||false}));
 process.exitCode=1;
}
try{
 assert.equal(process.env.B46_TOP_KPI_APPROVED,'YES','OWNER_APPROVAL_MISSING');
 assert(['candidate','activate'].includes(process.env.B46_TOP_KPI_MODE),'MODE_INVALID');
 const current=await active();baseId=current.id;
 assert.equal(baseId,EXPECTED,'ACTIVE_VERSION_CHANGED_BEFORE_RELEASE');
 report.before=current;
 const [engine,snapshot,base,settings,originalAssets]=await Promise.all([
  active(ENGINE),active(SNAPSHOT),version(WORKER,baseId),
  cf('GET','/workers/scripts/'+WORKER+'/settings'),fingerprint(DIRECT)]);
 assert.equal(base.main_module,ENTRY,'MAIN_ENTRY_DIFFERENT');
 assert(base.modules.length>=50,'INCOMPLETE_MODULE_SET');
 const original=base.modules.find(m=>m.name===MODULE);
 assert(original&&original.content_type==='application/javascript+module','MENU_MODULE_NOT_FOUND');
 const source=Buffer.from(original.content_base64,'base64').toString('utf8');
 const changed=removeMovedKpiStripFromMenu(source);
 assert(changed.source.includes(PATCH_TAG),'TOP_KPI_SOURCE_NOT_PATCHED');
 await writeFile(audit+'/statistics-menu-entry-revised.mjs',changed.source);
 const revisedHash=hash(Buffer.from(changed.source));
 assert.notEqual(revisedHash,moduleDigest(original),'MENU_UNCHANGED');
 const oldHtml=(await asset(DIRECT,'/?view=statistics')).toString();
 assert(oldHtml.includes('<section class="sp-kpis">')&&
    oldHtml.includes('id="b46-stats-v1-no-legacy-firstpaint-20261116"'),
    'MOVED_TOP_KPI_HTML_NOT_FOUND_IN_LIVE_BASE');
 const [head,chart]=await Promise.all([
   asset('https://'+SNAPSHOT+'.mccarey-supon.workers.dev','/head'),
   asset('https://'+SNAPSHOT+'.mccarey-supon.workers.dev','/chart')]);
 const h=JSON.parse(head.toString()),g=JSON.parse(chart.toString());
 assert(h.ok&&g.ok&&h.snapshotSavedAt===g.asOf,'FAST_SNAPSHOT_NOT_READY');
 report.fullPreflight={baseId,engine,snapshot,sourceAddedBytes:changed.newBytes-changed.oldBytes,
   modules:base.modules.length,fastAsOf:h.snapshotSavedAt};
 await save();
 const modules=base.modules.map(m=>m.name===MODULE?
  {...m,content_base64:Buffer.from(changed.source).toString('base64')}:m);
 const compressed=modules.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);
 assert(compressed<10*1024*1024-100*1024,'COMPRESSED_WORKER_LIMIT');
 const meta={main_module:base.main_module,compatibility_date:base.compatibility_date,
  compatibility_flags:base.compatibility_flags||[],
  bindings:base.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:'latest'}:b),
  keep_assets:true,annotations:{'workers/tag':'B46_STATS_REMOVE_MOVED_TOP_KPIS_20261117',
   'workers/message':'Owner-authorized permanent removal of top moved 8 Statistics KPI cards; only menu module changed'}};
 if(base.assets?.config)meta.assets={config:base.assets.config};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])
  if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of modules)form.set(m.name,
  new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.deepEqual(await active(),current,'CONCURRENT_PRODUCTION_EDIT');
 report.stage='CANDIDATE_UPLOAD';await save();
 candidateId=(await cf('POST','/workers/scripts/'+WORKER+'/versions?bindings_inherit=strict',form)).id;
 assert(candidateId&&candidateId!==baseId,'INVALID_INACTIVE_CANDIDATE');
 report.candidateId=candidateId;
 inspectModules(await version(WORKER,candidateId),base,revisedHash);
 const preview='https://'+candidateId.slice(0,8)+'-'+WORKER+'.mccarey-supon.workers.dev';
 report.preview=preview;report.stage='CANDIDATE_QA';await save();
 checkCleanHtml((await asset(preview,'/?view=statistics')).toString());
 assert.deepEqual(await fingerprint(preview),originalAssets,'CANDIDATE_CORE_ASSETS_DIFFERENT');
 report.candidateBrowser=await verifyBrowser(preview,'top-kpi-removed-candidate',audit);
 await browser(preview);
 report.stage='CANDIDATE_PASSED';await save();
 if(process.env.B46_TOP_KPI_MODE==='candidate'){
  report.ok=true;await save();
  console.log('B46_REMOVE_TOP_KPIS_CANDIDATE_PASS='+JSON.stringify({
   candidateId,baseId,topKpiStripRemoved:true,otherModulesUnchanged:base.modules.length-1,
   productionChanged:false}));
  process.exit(0);
 }
 assert.deepEqual(await active(),current,'ACTIVE_CHANGED_AFTER_QA');
 assert.deepEqual(await active(ENGINE),engine,'ENGINE_CHANGED_AFTER_QA');
 assert.deepEqual(await active(SNAPSHOT),snapshot,'SNAPSHOT_CHANGED_AFTER_QA');
 assert.deepEqual(await fingerprint(DIRECT),originalAssets,'LIVE_SOURCE_CHANGED_AFTER_QA');
 report.stage='ACTIVATE';await save();
 await cf('POST','/workers/scripts/'+WORKER+'/deployments',{
  strategy:'percentage',versions:[{version_id:candidateId,percentage:100}],
  annotations:{'workers/message':'Owner-approved permanent deletion of duplicate top KPI strip; full QA passed'}});
 report.productionChanged=true;await save();
 assert.equal((await active()).id,candidateId,'ACTIVE_VERSION_NOT_CANDIDATE');
 for(const host of [DIRECT,SITE]){
  let succeeded=false;
  for(let k=0;k<12;k++){
   try{checkCleanHtml((await asset(host,'/?view=statistics')).toString());succeeded=true;break}
   catch{await new Promise(r=>setTimeout(r,1500))}
  }
  assert(succeeded,'UPDATED_STATS_HTML_NOT_PROPAGATED_'+host);
 }
 report.stage='LIVE_QA';await save();
 report.liveBrowser=await verifyBrowser(DIRECT,'top-kpi-removed-live',audit);
 await browser(DIRECT);
 assert.deepEqual(await fingerprint(DIRECT),originalAssets,'OTHER_LIVE_ASSETS_CHANGED');
 assert.deepEqual(await active(ENGINE),engine,'ENGINE_VERSION_CHANGED_POST');
 assert.deepEqual(await active(SNAPSHOT),snapshot,'SNAPSHOT_VERSION_CHANGED_POST');
 inspectModules(await version(WORKER,candidateId),base,revisedHash);
 report.stage='VERIFIED_LIVE';report.ok=true;report.after=await active();await save();
 console.log('B46_REMOVE_TOP_KPIS_PRODUCTION_SUCCESS='+JSON.stringify({
  before:baseId,after:report.after.id,rollback:baseId,topKpiStripRemoved:true,
  otherModulesUnchanged:base.modules.length-1,engineLedgerWrites:0,run:report.run}));
}catch(e){await rollback(e)}
