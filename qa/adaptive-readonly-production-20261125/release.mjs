import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const SITE='ball46-production';
const NEW_MODULE='b46-adaptive-readonly-page-20261125.mjs';
const RESEARCH_WORKER='ball46-premium-match-colors-test-20261120';
const BASE='ed321803-bc3c-488e-9552-62a464fa79cf';
const MARK='B46_ADAPTIVE_RESEARCH_READONLY_ROUTE_20261125';
const dirname='qa/adaptive-readonly-production-20261125/audit';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const mode=process.env.B46_ADAPTIVE_RELEASE_MODE;
assert(token&&account,'CLOUDFLARE_AUTH_MISSING');
assert(['stage','activate'].includes(mode),'INVALID_RELEASE_MODE');
mkdirSync(dirname,{recursive:true});
const report={task:MARK,mode,started:new Date().toISOString(),ciRun:process.env.GITHUB_RUN_ID,expectedActive:BASE};
const save=()=>writeFileSync(dirname+'/release.json',JSON.stringify(report,null,2));
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value&&typeof value==='object'?sort(value):value);
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sort(v)])):value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nonmutatingWorkers=['nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',RESEARCH_WORKER,'ball46-prematch-only-test-20261120'];
async function cf(path,method='GET',body){
 const options={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(75000)};
 if(body!=null){
  if(body instanceof FormData)options.body=body;
  else{options.headers['content-type']='application/json';options.body=JSON.stringify(body);}
 }
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,options);
 const json=await res.json();
 assert(res.ok&&json.success,'CF_HTTP_'+res.status+'_'+path+' '+JSON.stringify(json.errors||[]).slice(0,400));
 return json.result;
}
async function active(name=SITE){
 const r=await cf('/scripts/'+name+'/deployments?per_page=1');
 const d=r.deployments?.[0],versions=d?.versions;
 assert(d?.id&&versions?.length===1&&Number(versions[0].percentage)===100,'AMBIGUOUS_ACTIVE_DEPLOYMENT_'+name);
 return {version:versions[0].version_id,deployment:d.id};
}
async function protectedVersions(){
 return Object.fromEntries(await Promise.all(nonmutatingWorkers.map(async n=>[n,await active(n)])));
}
const expectedSrc=readFileSync('qa/adaptive-readonly-production-20261125/'+NEW_MODULE);
assert(expectedSrc.includes('serveAdaptiveReadOnly')&&expectedSrc.includes('B46_ADAPTIVE_OU_RESEARCH_V1'),'RESEARCH_HANDLER_NOT_VERIFIED');
async function baseline(){
 const [current,pr,settings,subdomain,schedules]=await Promise.all([
  active(),protectedVersions(),cf('/scripts/'+SITE+'/settings'),cf('/scripts/'+SITE+'/subdomain'),cf('/scripts/'+SITE+'/schedules')]);
 assert.equal(current.version,BASE,'PRODUCTION_ACTIVE_VERSION_MOVED_STOP');
 assert(subdomain.previews_enabled,'CLOUDFLARE_PREVIEWS_DISABLED');
 const v=await cf('/workers/'+SITE+'/versions/'+current.version+'?include=modules');
 assert.equal(v.main_module,'b46-frontend-seo-entry-20261124.mjs','MAIN_MODULE_DRIFT');
 assert.equal(v.modules.length,105,'CURRENT_PRODUCTION_MODULES_DRIFT');
 assert.equal(v.bindings.length,11,'CURRENT_PRODUCTION_BINDINGS_DRIFT');
 assert(v.assets?.config,'PRODUCTION_ASSETS_MISSING');
 assert(!v.modules.some(x=>x.name===NEW_MODULE),'RESEARCH_ROUTE_ALREADY_DEPLOYED');
 return {current,pr,settings,subdomain,schedules,v};
}
function replaceOnce(code,needle,replacement){
 assert.equal(code.split(needle).length,2,'PATCH_ANCHOR_NOT_UNIQUE '+needle);
 return code.replace(needle,replacement);
}
function patchMain(code){
 assert(!code.includes(MARK),'PATCH_ALREADY_INSTALLED');
 const importAnchor="import { frontendSeo, isSeoPath, usesFixtureIndex } from './seo.mjs';";
 const routeAnchor="    if (!['GET', 'HEAD'].includes(request.method) || !isSeoPath(pathname)) {";
 let out=replaceOnce(code,importAnchor,importAnchor+"\nimport {serveAdaptiveReadOnly} from './"+NEW_MODULE+"';");
 out=replaceOnce(out,routeAnchor,
  "    // "+MARK+": research UI and sanitized data; keep all other routes unchanged.\n"+
  "    if (pathname === '/research/adaptive-ou' || pathname === '/research/adaptive-ou/' || pathname === '/research/adaptive-ou/data') {\n"+
  "      return serveAdaptiveReadOnly(request,env,context);\n"+
  "    }\n"+routeAnchor);
 assert(out.includes(MARK)&&out.length-code.length<600,'PATCH_SCOPE_CHANGED');
 assert.equal(out.replace("import {serveAdaptiveReadOnly} from './"+NEW_MODULE+"';\n",'').replace(
  "    // "+MARK+": research UI and sanitized data; keep all other routes unchanged.\n"+
  "    if (pathname === '/research/adaptive-ou' || pathname === '/research/adaptive-ou/' || pathname === '/research/adaptive-ou/data') {\n"+
  "      return serveAdaptiveReadOnly(request,env,context);\n"+
  "    }\n",''),code,'MAIN_CHANGED_OUTSIDE_RESEARCH_ROUTE');
 return out;
}
function modulesHash(mods){
 return sha(canonical(mods.map(x=>[x.name,x.content_type,sha(Buffer.from(x.content_base64,'base64'))]).sort(([a],[b])=>a.localeCompare(b))));
}
async function candidateData(){
 const base=await baseline(),v=base.v;
 const modules=v.modules.map(x=>({...x}));
 const entry=modules.find(x=>x.name===v.main_module);
 const oldMain=Buffer.from(entry.content_base64,'base64').toString('utf8');
 const nextMain=patchMain(oldMain);
 entry.content_base64=Buffer.from(nextMain).toString('base64');
 modules.push({name:NEW_MODULE,content_type:'application/javascript+module',content_base64:expectedSrc.toString('base64')});
 const oldBindingNames=new Set(v.bindings.map(x=>x.name));
 assert(!oldBindingNames.has('B46_ADAPTIVE_READ'),'BINDING_NAME_COLLISION');
 const bindings=v.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:BASE}:x);
 bindings.push({name:'B46_ADAPTIVE_READ',type:'service',service:RESEARCH_WORKER});
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,
  compatibility_flags:v.compatibility_flags||[],bindings,keep_assets:true,assets:{config:v.assets.config},
  annotations:{'workers/message':'Read-only Adaptive O/U research page, no engine/ledger changes'}};
 const fields=['usage_model','logpush','limits','observability','placement','tail_consumers','tags'];
 for(const field of fields)if(base.settings[field]!=null)meta[field]=base.settings[field];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const mod of modules)form.set(mod.name,new Blob([Buffer.from(mod.content_base64,'base64')],{type:mod.content_type}),mod.name);
 return {base,modules,form,expectedModulesHash:modulesHash(modules)};
}
async function verifyCandidate(id,prepared){
 const actual=await cf('/workers/'+SITE+'/versions/'+id+'?include=modules');
 assert.equal(actual.main_module,prepared.base.v.main_module,'CANDIDATE_MAIN_DRIFT');
 assert.equal(actual.modules.length,106,'CANDIDATE_MODULE_COUNT_DRIFT');
 assert.equal(modulesHash(actual.modules),prepared.expectedModulesHash,'CANDIDATE_BINARIES_CHANGED');
 assert.equal(canonical(actual.assets?.config),canonical(prepared.base.v.assets.config),'CANDIDATE_ASSETS_CHANGED');
 assert.equal(actual.compatibility_date,prepared.base.v.compatibility_date,'CANDIDATE_COMPAT_CHANGED');
 assert.equal(canonical(actual.compatibility_flags||[]),canonical(prepared.base.v.compatibility_flags||[]),'CANDIDATE_FLAGS_CHANGED');
 assert.equal(actual.bindings.length,12,'CANDIDATE_BINDINGS_COUNT_DRIFT');
 for(const existing of prepared.base.v.bindings){
  const found=actual.bindings.find(x=>x.name===existing.name&&x.type===existing.type);
  assert(found,'MISSING_EXISTING_BINDING_'+existing.name);
  if(existing.type!=='secret_text')assert.equal(canonical(found),canonical(existing),'EXISTING_BINDING_CHANGED_'+existing.name);
 }
 const binding=actual.bindings.find(x=>x.name==='B46_ADAPTIVE_READ');
 assert(binding?.type==='service'&&binding.service===RESEARCH_WORKER,'RESEARCH_BINDING_INVALID');
 return actual;
}
async function guard(id,protectedBefore){
 assert.equal((await active()).version,id,'PRODUCTION_ACTIVE_VERSION_MOVED_STOP');
 const current=await protectedVersions();
 assert.equal(canonical(current),canonical(protectedBefore),'OTHER_WORKER_CHANGED_STOP');
}
async function assign(id,message){
 return cf('/scripts/'+SITE+'/deployments','POST',{
  strategy:'percentage',versions:[{version_id:id,percentage:100}],
  annotations:{'workers/message':message}});
}
async function inspectPublic(base){
 const host=base||'https://ball46.com';
 const page=await fetch(host+'/research/adaptive-ou/?releaseProbe='+Date.now(),{signal:AbortSignal.timeout(40000)});
 assert.equal(page.status,200,'RESEARCH_PAGE_HTTP_'+page.status);
 const text=await page.text();
 assert(text.includes('ADAPTIVE OVER/UNDER 2.5')&&text.includes('READ-ONLY RESEARCH'),'RESEARCH_PAGE_WRONG_HTML');
 const data=await fetch(host+'/research/adaptive-ou/data?releaseProbe='+Date.now(),{signal:AbortSignal.timeout(40000)});
 assert.equal(data.status,200,'RESEARCH_DATA_HTTP_'+data.status);
 const d=await data.json();
 assert(d.ok&&d.source==='ADAPTIVE_RESEARCH_TEST_READ_ONLY'&&d.formulas?.length===42,'RESEARCH_PROJECTION_NOT_VERIFIED');
 assert(!('records' in d)&&!('providerCalls' in d),'RESEARCH_RAW_DATA_EXPOSED');
 return {pageStatus:page.status,dataStatus:data.status,formulas:d.formulas.length};
}
async function healthProbes(){
 const origin='https://ball46.com';
 const [home,health,robots]=await Promise.all([
  fetch(origin+'/?view=live',{signal:AbortSignal.timeout(30000)}),
  fetch(origin+'/api/engine/health',{signal:AbortSignal.timeout(30000)}),
  fetch(origin+'/robots.txt',{signal:AbortSignal.timeout(30000)})]);
 assert(home.ok&&health.ok&&robots.ok,'CORE_PRODUCTION_ROUTE_FAILED');
 const body=await home.text();
 assert(body.includes('b46-site-footer-v1'),'ORIGINAL_FOOTER_MISSING');
 const json=await health.json();
 assert(json.ok,'PRODUCTION_ENGINE_HEALTH_NOT_OK');
 return {home:home.status,engineHealth:health.status,robots:robots.status};
}
async function main(){
 const prepared=await candidateData();
 report.rollbackVersion=prepared.base.current.version;
 report.rollbackDeployment=prepared.base.current.deployment;
 report.protectedWorkers=prepared.base.pr;
 report.assetsCount=prepared.base.v.modules.length;
 report.proposedModules=prepared.modules.length;
 report.originalSourceHash=modulesHash(prepared.base.v.modules);
 report.desiredSourceHash=prepared.expectedModulesHash;
 save();
 if(mode==='stage'){
  await guard(BASE,prepared.base.pr);
  const uploaded=await cf('/scripts/'+SITE+'/versions?bindings_inherit=strict','POST',prepared.form);
  assert(uploaded.id&&uploaded.id!==BASE,'INACTIVE_CANDIDATE_MISSING');
  report.candidate=uploaded.id;
  report.preview='https://'+uploaded.id.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';
  save();
  await verifyCandidate(uploaded.id,prepared);
  await guard(BASE,prepared.base.pr);
  for(let i=0;i<8;i++){
   try{report.previewHTTP=await inspectPublic(report.preview);break;}
   catch(err){if(i===7)throw err;await sleep(1700);}
  }
  await guard(BASE,prepared.base.pr);
  report.result='INACTIVE_PREVIEW_READY';
  save();
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
   'candidate='+uploaded.id+'\nbase='+BASE+'\npreview='+report.preview+'\n');
  console.log('B46_ADAPTIVE_RESEARCH_INACTIVE_READY '+JSON.stringify({candidate:uploaded.id,rollback:BASE,preview:report.preview,previewHTTP:report.previewHTTP,modules:106,bindings:12,productionWrites:0}));
  return;
 }
 const candidate=process.env.B46_ADAPTIVE_CANDIDATE;
 assert.match(candidate||'',/^[0-9a-f-]{36}$/,'RELEASE_CANDIDATE_REQUIRED');
 assert.equal(process.env.B46_ADAPTIVE_BASE,BASE,'BASELINE_MISMATCH');
 report.candidate=candidate;save();
 await verifyCandidate(candidate,prepared);
 await guard(BASE,prepared.base.pr);
 let activationAttempted=false;
 try{
  activationAttempted=true;
  const deployment=await assign(candidate,'Activate BALL46 read-only Adaptive research page '+MARK);
  report.productionDeployment=deployment.id;save();
  for(let i=0;i<12;i++){if((await active()).version===candidate)break;await sleep(1500);}
  assert.equal((await active()).version,candidate,'PRODUCTION_VERSION_DID_NOT_ACTIVATE');
  for(let i=0;i<12;i++){
   try{report.productionPage=await inspectPublic('https://ball46.com');break;}
   catch(err){if(i===11)throw err;await sleep(1800);}
  }
  report.productionHealth=await healthProbes();
  await guard(candidate,prepared.base.pr);
  const current=await cf('/workers/'+SITE+'/versions/'+candidate+'?include=modules');
  assert.equal(current.bindings.length,12);
  report.result='PRODUCTION_ACTIVE_PENDING_BROWSER_QA';save();
  console.log('B46_ADAPTIVE_READONLY_PRODUCTION_ACTIVATED '+JSON.stringify({version:candidate,rollback:BASE,production:report.productionPage,health:report.productionHealth,modules:106,bindings:12}));
 }catch(error){
  report.error=String(error.stack||error);
  if(activationAttempted){
   try{
    const now=await active();
    if(now.version===candidate){
     const revert=await assign(BASE,'Rollback adaptive read-only research page due to failed activation QA');
     report.rollbackDeploymentOnFailure=revert.id;
     for(let i=0;i<12;i++){if((await active()).version===BASE)break;await sleep(1500);}
     assert.equal((await active()).version,BASE,'PRODUCTION_ROLLBACK_UNCONFIRMED');
     report.rolledBack=true;
    }
   }catch(revertError){report.rollbackError=String(revertError.stack||revertError)}
  }
  save();throw error;
 }
}
main().catch(e=>{report.failure=String(e.stack||e);save();console.error(e.stack||e);process.exitCode=1;});
