import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'Cloudflare CI secrets unavailable');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const SITE='ball46-production',TEST='ball46-premium-match-colors-test-20261120';
const PIN='ball46-prematch-ou-ui-pinned-20261125';
const PROD_BASE='f3461d97-d22e-4bc3-9295-340d7b9a0b16';
const TEST_BASE='753e3a3b-3236-4d0d-885f-0209729a9e16';
const MARK='B46_PREMATCH_OU_SINGLE_PRODUCTION_VIEW_20261125';
const MODULE='b46-prematch-unified-view.mjs';
const dirname='qa/prematch-unified-release-20261125/audit';
const mode=process.env.B46_UNIFIED_MODE;
assert(['stage','activate'].includes(mode),'INVALID_MODE');
mkdirSync(dirname,{recursive:true});
let report={marker:MARK,mode,run:process.env.GITHUB_RUN_ID,productionBaseline:PROD_BASE,initialTestVersion:TEST_BASE};
const save=()=>writeFileSync(dirname+'/release.json',JSON.stringify(report,null,2));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=t=>new Promise(r=>setTimeout(r,t));
function canonical(o){if(Array.isArray(o))return o.map(canonical);if(o&&typeof o==='object')return Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return o;}
const stable=o=>JSON.stringify(canonical(o));
async function cf(path,method='GET',body){
 const headers={authorization:'Bearer '+token};
 const options={method,headers,signal:AbortSignal.timeout(100000)};
 if(body){if(body instanceof FormData)options.body=body;else{headers['content-type']='application/json';options.body=JSON.stringify(body);}}
 const res=await fetch(ROOT+path,options),json=await res.json();
 assert(res.ok&&json.success,'CF '+method+' '+path+' HTTP '+res.status+' '+JSON.stringify(json.errors||[]).slice(0,1000));
 return json.result;
}
async function active(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1'),live=d.deployments?.[0];
 assert(live?.id&&live.versions?.length===1&&Number(live.versions[0].percentage)===100,'AMBIGUOUS_DEPLOYMENT_'+name);
 return {version:live.versions[0].version_id,deployment:live.id};
}
const protectedNames=['nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46','ball46-prematch-only-test-20261120',TEST];
async function protectedVersions(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])));}
const moduleHash=mods=>sha(Buffer.from(stable(mods.map(m=>[m.name,m.content_type,sha(Buffer.from(m.content_base64,'base64'))]).sort(([a],[b])=>a.localeCompare(b)))));
async function version(name,id){return cf('/workers/'+name+'/versions/'+id+'?include=modules')}
const gatewayPath='qa/prematch-unified-release-20261125/'+MODULE;
const gatewayBytes=readFileSync(gatewayPath);
assert(gatewayBytes.toString().includes(MARK)&&gatewayBytes.length>2000);
const originalImport="import {serveAdaptiveReadOnly} from './b46-adaptive-readonly-page-20261125.mjs';";
const firstRoute="    if (pathname === '/research/adaptive-ou' || pathname === '/research/adaptive-ou/' || pathname === '/research/adaptive-ou/data') {";
function once(text,old,newValue){assert.equal(text.split(old).length,2,'MAIN_PATCH_ANCHOR_NOT_UNIQUE: '+old);return text.replace(old,newValue);}
function patchMain(code){
 assert(!code.includes(MARK),'UNIFIED_ALREADY_PRESENT');
 let out=once(code,originalImport,originalImport+"\nimport {serveUnifiedPrematch,isPrematchUnifiedAsset} from './"+MODULE+"';");
 const prefix="    // "+MARK+": use one pinned PreMatch UI across the entire 7D/30D/90D view.\n"+
 "    if (pathname === '/prematch/over-under' || pathname === '/prematch/over-under/' || isPrematchUnifiedAsset(pathname)) {\n"+
 "      return serveUnifiedPrematch(request,env,context);\n"+
 "    }\n"+
 "    if ((pathname === '/research/adaptive-ou' || pathname === '/research/adaptive-ou/') && ['GET','HEAD'].includes(request.method)) {\n"+
 "      return Response.redirect(new URL('/prematch/over-under/?b46pm=ou',request.url),302);\n"+
 "    }\n";
 out=once(out,firstRoute,prefix+firstRoute);
 assert(out.includes(MARK)&&out.length-code.length<1600);
 return out;
}
function formFor(mods,metadata){
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of mods)form.append(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type||'application/javascript+module'}),m.name);
 return form;
}
async function pinWorker(testBase){
 const module=testBase.modules.find(x=>x.name===testBase.main_module);
 assert(testBase.modules.length===1&&testBase.main_module==='worker.js'&&module?.content_base64,'TEST_SCRIPT_STRUCTURE_CHANGED');
 const original=Buffer.from(module.content_base64,'base64'),src=original.toString('utf8');
 for(const term of ['B46_PERFORMANCE_RANGE_INPLACE_20261125','B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125','b46pm-adaptive-range-btn','function b46UpdatePerformanceOnly()'])assert(src.includes(term),'TEST_MISSING_FIX_'+term);
 assert.equal(testBase.bindings.length,3,'TEST_BINDINGS_CHANGED');
 const required=['B46_PRODUCTION_READ','PREMATCH_PERF_RECEIVER','PREMATCH_STORE'];
 assert(required.every(n=>testBase.bindings.some(b=>b.name===n)),'TEST_SOURCE_BINDING_DRIFT');
 const bindings=testBase.bindings.map(b=>{
  assert.equal(b.type,'service','TEST_CONTAINS_UNSAFE_BINDING_'+b.name);
  return {name:b.name,type:'service',service:b.service,environment:b.environment??'production'};
 });
 const expected=sha(original);
 let pinned;
 try{pinned=await active(PIN);}
 catch(err){
  if(!String(err).includes('404'))throw err;
  const meta={main_module:'worker.js',compatibility_date:testBase.compatibility_date??'2026-11-20',compatibility_flags:testBase.compatibility_flags??[],bindings};
  const uploaded=await cf('/scripts/'+PIN,'PUT',formFor([{name:'worker.js',content_type:'application/javascript+module',content_base64:original.toString('base64')}],meta));
  report.pinnedCreated=true;report.pinnedUpload=uploaded?.id||null;save();
  for(let i=0;i<12;i++){try{pinned=await active(PIN);break;}catch(e){if(i===11)throw e;await sleep(1300);}}
 }
 const p=await version(PIN,pinned.version);
 assert.equal(p.main_module,'worker.js');assert.equal(p.modules?.length,1,'PIN_MODULES_CHANGED');
 assert.equal(sha(Buffer.from(p.modules[0].content_base64,'base64')),expected,'PIN_SCRIPT_MISMATCH');
 assert.equal(p.bindings?.length,3,'PIN_BINDINGS_MISMATCH');
 for(const old of bindings){const b=p.bindings.find(v=>v.name===old.name);assert(b?.service===old.service,'PIN_UPSTREAM_CHANGED_'+old.name);}
 return {active:pinned,sha:expected,bytes:original.length};
}
async function prepare(){
 const [prod,latestTest,protectedBase,settings,subdomain,schedules]=await Promise.all([
  active(SITE),active(TEST),protectedVersions(),cf('/scripts/'+SITE+'/settings'),
  cf('/scripts/'+SITE+'/subdomain'),cf('/scripts/'+SITE+'/schedules')
 ]);
 assert.equal(prod.version,PROD_BASE,'PRODUCTION_MOVED_STOP');
 assert.equal(latestTest.version,TEST_BASE,'TEST_MOVED_STOP_USE_LATEST_AND_REQA');
 assert(subdomain.previews_enabled,'PRODUCTION_PREVIEWS_DISABLED');
 const [baseline,testBase]=await Promise.all([version(SITE,prod.version),version(TEST,latestTest.version)]);
 assert.equal(baseline.main_module,'b46-frontend-seo-entry-20261124.mjs');
 assert.equal(baseline.modules.length,106,'PRODUCTION_MODULE_COUNT_CHANGED');
 assert.equal(baseline.bindings.length,12,'PRODUCTION_BINDINGS_CHANGED');
 assert(baseline.assets?.config,'PRODUCTION_ASSETS_UNAVAILABLE');
 assert(!baseline.modules.some(m=>m.name===MODULE));
 assert(!baseline.bindings.some(b=>b.name==='B46_PREMATCH_UNIFIED_UI'));
 const pin=await pinWorker(testBase);
 const old=baseline.modules.find(m=>m.name===baseline.main_module);
 const patched=patchMain(Buffer.from(old.content_base64,'base64').toString('utf8'));
 const mods=baseline.modules.map(m=>m===old?{...m,content_base64:Buffer.from(patched).toString('base64')}:m);
 mods.push({name:MODULE,content_type:'application/javascript+module',content_base64:gatewayBytes.toString('base64')});
 const newBinding={name:'B46_PREMATCH_UNIFIED_UI',type:'service',service:PIN,environment:'production'};
 const bindings=baseline.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:PROD_BASE}:b);
 bindings.push(newBinding);
 const meta={main_module:baseline.main_module,compatibility_date:baseline.compatibility_date,
  compatibility_flags:baseline.compatibility_flags??[],keep_assets:true,assets:{config:baseline.assets.config},
  bindings,annotations:{'workers/message':'Unified tested PreMatch O/U no-flicker page '+MARK}};
 for(const key of ['usage_model','logpush','limits','observability','placement','tail_consumers','tags'])
  if(settings[key]!=null)meta[key]=settings[key];
 const combined={baseline,prod,latestTest,protectedBase,pin,mods,meta,expectedHash:moduleHash(mods)};
 report.before=prod;report.test=latestTest;report.protected=protectedBase;
 report.pinned=pin;report.expectedModules=mods.length;report.expectedBindings=bindings.length;save();
 return combined;
}
async function guard(plan,expectedVersion){
 assert.equal((await active(SITE)).version,expectedVersion,'PRODUCTION_VERSION_CHANGED');
 assert.equal((await active(TEST)).version,TEST_BASE,'TEST_SOURCE_VERSION_CHANGED');
 assert.equal((await active(PIN)).version,plan.pin.active.version,'PIN_VERSION_CHANGED');
 assert.equal(stable(await protectedVersions()),stable(plan.protectedBase),'PROTECTED_WORKER_CHANGED');
}
async function verifyCandidate(id,plan){
 const x=await version(SITE,id);
 assert.equal(x.main_module,plan.baseline.main_module);
 assert.equal(x.modules.length,107,'CANDIDATE_MODULE_COUNT');
 assert.equal(moduleHash(x.modules),plan.expectedHash,'CANDIDATE_MODULE_HASH_CHANGED');
 assert.equal(x.bindings.length,13,'CANDIDATE_BINDING_COUNT');
 assert.equal(stable(x.assets?.config),stable(plan.baseline.assets.config),'ASSET_SETTINGS_DRIFT');
 assert.equal(x.compatibility_date,plan.baseline.compatibility_date);
 assert.equal(stable(x.compatibility_flags??[]),stable(plan.baseline.compatibility_flags??[]));
 for(const b of plan.baseline.bindings){
  const v=x.bindings.find(x=>x.name===b.name&&x.type===b.type);
  assert(v,'BASE_BINDING_MISSING_'+b.name);
  if(b.type!=='secret_text')assert.equal(stable(v),stable(b),'BASE_BINDING_CHANGED_'+b.name);
 }
 const gw=x.bindings.find(b=>b.name==='B46_PREMATCH_UNIFIED_UI');
 assert(gw?.type==='service'&&gw.service===PIN,'UNIFIED_GATEWAY_BINDING_MISSING');
}
async function publicProbe(origin){
 const page=await fetch(origin+'/prematch/over-under/?b46pm=ou',{signal:AbortSignal.timeout(35000)});
 const text=await page.text();
 assert.equal(page.status,200,'O_U_PAGE_HTTP_'+page.status);
 assert(page.headers.get('x-b46-prematch-unified')==='readonly-pinned-20261125','WRONG_GATEWAY');
 assert(text.includes('/__b46_prematch_client.js'),'PREMATCH_CLIENT_NOT_BOOTSTRAPPED');
 const script=await fetch(origin+'/__b46_prematch_client.js',{signal:AbortSignal.timeout(30000)});
 assert.equal(script.status,200,'PREMATCH_SCRIPT_HTTP_'+script.status);
 const body=await script.text();
 assert(body.includes('B46_PERFORMANCE_RANGE_INPLACE_20261125')&&body.includes('B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125'),'MISSING_INPLACE_SCRIPT_MARKERS');
 const forbidden=await fetch(origin+'/__b46_prematch_data',{method:'POST',signal:AbortSignal.timeout(10000)});
 assert.equal(forbidden.status,405,'PRODUCTION_GATEWAY_ACCEPTS_POST');
 return {page:page.status,script:script.status,postDenied:forbidden.status,hasBothFixes:true};
}
async function health(){
 const host='https://ball46.com';
 const r=await Promise.all(['/','/api/engine/health','/robots.txt','/research/adaptive-ou/data'].map(path=>fetch(host+path,{signal:AbortSignal.timeout(30000)})));
 assert(r.every(x=>x.ok),'PRODUCTION_EXISTING_ROUTE_FAILURE_'+r.map(x=>x.status));
 return Object.fromEntries(['home','engine','robots','sanitizedResearchApi'].map((k,i)=>[k,r[i].status]));
}
async function assign(id,message){return cf('/scripts/'+SITE+'/deployments','POST',{
 strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}
});}
async function main(){
 const plan=await prepare();
 await guard(plan,PROD_BASE);
 if(mode==='stage'){
  const out=await cf('/scripts/'+SITE+'/versions?bindings_inherit=strict','POST',formFor(plan.mods,plan.meta));
  assert(out.id&&out.id!==PROD_BASE);
  report.candidate=out.id;report.preview='https://'+out.id.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';save();
  await verifyCandidate(out.id,plan);await guard(plan,PROD_BASE);
  for(let i=0;i<12;i++){try{report.previewProbe=await publicProbe(report.preview);break;}catch(e){if(i===11)throw e;await sleep(1500);}}
  await guard(plan,PROD_BASE);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'candidate='+out.id+'\npreview='+report.preview+'\nbase='+PROD_BASE+'\n');
  report.result='INACTIVE_PREVIEW_READY';save();
  console.log('B46_PREMATCH_UNIFIED_INACTIVE_READY '+JSON.stringify({candidate:out.id,preview:report.preview,rollback:PROD_BASE,pinned:plan.pin.active.version,uiSource:TEST_BASE,modules:107,bindings:13,productionWrites:0,probe:report.previewProbe}));
  return;
 }
 const candidate=process.env.B46_UNIFIED_CANDIDATE;
 assert.match(candidate??'',/^[a-f0-9-]{36}$/,'CANDIDATE_NOT_SUPPLIED');
 await verifyCandidate(candidate,plan);await guard(plan,PROD_BASE);
 let attempted=false;
 try{
  attempted=true;
  const deployed=await assign(candidate,'Deploy unified pre-match O/U research view with in-place range no-flicker patch');
  report.productionDeployment=deployed.id;report.candidate=candidate;save();
  for(let i=0;i<14;i++){if((await active(SITE)).version===candidate)break;await sleep(1200);}
  assert.equal((await active(SITE)).version,candidate,'ACTIVATION_NOT_CURRENT');
  for(let i=0;i<14;i++){try{report.productionProbe=await publicProbe('https://ball46.com');break;}catch(e){if(i===13)throw e;await sleep(1400);}}
  report.health=await health();await guard(plan,candidate);
  report.result='PRODUCTION_ACTIVE_PENDING_BROWSER_QA';save();
  console.log('B46_PREMATCH_UNIFIED_PRODUCTION_ACTIVATED '+JSON.stringify({version:candidate,rollback:PROD_BASE,pinned:plan.pin.active.version,route:'https://ball46.com/prematch/over-under/?b46pm=ou',probe:report.productionProbe,health:report.health}));
 }catch(err){
  report.failure=String(err.stack||err);
  if(attempted)try{
   const current=await active(SITE);
   if(current.version===candidate){
    const restored=await assign(PROD_BASE,'Rollback failed unified PreMatch O/U release');
    report.rolledBack=restored.id;
    for(let i=0;i<14;i++){if((await active(SITE)).version===PROD_BASE)break;await sleep(1200);}
    assert.equal((await active(SITE)).version,PROD_BASE,'ROLLBACK_VERSION_UNCONFIRMED');
   }
  }catch(revertError){report.rollbackError=String(revertError.stack||revertError);}
  save();throw err;
 }
}
main().catch(e=>{report.error=String(e.stack||e);save();console.error(e.stack||e);process.exitCode=1;});
