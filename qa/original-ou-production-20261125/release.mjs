import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const auth=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(auth&&account,'CLOUDFLARE_CREDENTIALS_MISSING');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const SITE='ball46-production',TEST='ball46-premium-match-colors-test-20261120';
const BASE='ed321803-bc3c-488e-9552-62a464fa79cf',TEST_BASE='753e3a3b-3236-4d0d-885f-0209729a9e16';
const MODULE='b46-original-ou-proxy.mjs',MARK='B46_ORIGINAL_OU_PRODUCTION_20261125';
const dir='qa/original-ou-production-20261125/audit',mode=process.env.B46_ORIGINAL_PRODUCTION_MODE;
assert(['stage','activate'].includes(mode),'INVALID_MODE');
mkdirSync(dir,{recursive:true});
const report={mode,marker:MARK,expectedProduction:BASE,expectedTest:TEST_BASE};
const save=()=>writeFileSync(dir+'/release.json',JSON.stringify(report,null,2));
const sha=t=>createHash('sha256').update(t).digest('hex');
const sort=o=>Array.isArray(o)?o.map(sort):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sort(v)])):o;
const stable=x=>JSON.stringify(sort(x));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function cf(path,method='GET',body){
 const headers={authorization:'Bearer '+auth},options={method,headers,signal:AbortSignal.timeout(70000)};
 if(body){if(body instanceof FormData)options.body=body;else{headers['content-type']='application/json';options.body=JSON.stringify(body);}}
 const r=await fetch(api+path,options),d=await r.json();
 assert(r.ok&&d.success,'CLOUDFLARE_'+method+'_'+path+'_'+r.status+'_'+JSON.stringify(d.errors||[]).slice(0,500));
 return d.result;
}
async function active(n){
 const r=await cf('/scripts/'+n+'/deployments?per_page=1');
 const d=r.deployments?.[0],v=d?.versions;
 assert(d?.id&&v?.length===1&&v[0].percentage===100,'AMBIGUOUS_ACTIVE_'+n);
 return {version:v[0].version_id,deployment:d.id};
}
const critical=['ball46-prematch-only-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46',TEST];
async function snapshot(){return Object.fromEntries(await Promise.all(critical.map(async n=>[n,await active(n)])));}
async function guard(expected,protectedBaseline){
 assert.equal((await active(SITE)).version,expected,'PRODUCTION_CHANGED_ABORT');
 assert.equal((await active(TEST)).version,TEST_BASE,'TEST_FRONTEND_CHANGED_ABORT');
 for(const [name,prior] of Object.entries(protectedBaseline)){
  if(name===TEST)continue;
  const after=await active(name);
  assert.equal(after.version,prior.version,'ENGINE_OR_BACKEND_CHANGED_ABORT_'+name);
 }
}
function modulesHash(mods){return sha(Buffer.from(stable(mods.map(x=>[x.name,x.content_type,sha(Buffer.from(x.content_base64,'base64'))]).sort(([a],[b])=>a.localeCompare(b)))));}
const proxy=readFileSync('qa/original-ou-production-20261125/'+MODULE);
assert(proxy.toString().includes(MARK));
const importAnchor="import { frontendSeo, isSeoPath, usesFixtureIndex } from './seo.mjs';";
const routeAnchor="    if (!['GET', 'HEAD'].includes(request.method) || !isSeoPath(pathname)) {";
function replaceOnce(s,a,b){assert.equal(s.split(a).length,2,'PRODUCTION_ANCHOR_MISSING_OR_AMBIGUOUS');return s.replace(a,b);}
function patchMain(s){
 assert(!s.includes(MARK),'PRODUCTION_ALREADY_HAS_ROUTE');
 let out=replaceOnce(s,importAnchor,importAnchor+"\nimport {isOriginalOuRoute,isOriginalOuAsset,originalOuHandler} from './"+MODULE+"';");
 const logic="    // "+MARK+": original 2026-11-22 O/U URL, read-only TEST UI, no new public page.\n"+
 "    if (isOriginalOuRoute(new URL(request.url)) || isOriginalOuAsset(pathname)) {\n"+
 "      return originalOuHandler(request,env,context);\n"+
 "    }\n";
 out=replaceOnce(out,routeAnchor,logic+routeAnchor);
 assert(out.length-s.length<650,'UNEXPECTED_MAIN_CHANGE');
 return out;
}
function form(mods,meta){
 const f=new FormData();
 f.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of mods)f.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type||'application/javascript+module'}),m.name);
 return f;
}
async function prepared(){
 const [prod,test,snapshot0,settings]=await Promise.all([active(SITE),active(TEST),snapshot(),cf('/scripts/'+SITE+'/settings')]);
 assert.equal(prod.version,BASE,'BASE_PRODUCTION_MOVED');
 assert.equal(test.version,TEST_BASE,'BASE_TEST_MOVED');
 const v=await cf('/workers/'+SITE+'/versions/'+BASE+'?include=modules');
 assert.equal(v.main_module,'b46-frontend-seo-entry-20261124.mjs');
 assert.equal(v.modules.length,105,'BASE_105_MODULE_COUNT_CHANGED');
 assert.equal(v.bindings.length,11,'BASE_11_BINDINGS_CHANGED');
 assert(v.assets?.config,'PRODUCTION_ASSETS_MISSING');
 assert(!v.modules.some(m=>m.name===MODULE),'MODULE_ALREADY_DEPLOYED');
 const src=v.modules.find(m=>m.name===v.main_module),old=Buffer.from(src.content_base64,'base64').toString();
 const edited=patchMain(old);
 const ms=v.modules.map(m=>m===src?{...m,content_base64:Buffer.from(edited).toString('base64')}:m);
 ms.push({name:MODULE,content_type:'application/javascript+module',content_base64:proxy.toString('base64')});
 assert(v.bindings.every(b=>b.name!=='B46_ORIGINAL_OU_TEST_UI'));
 const bindings=v.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:BASE}:b);
 bindings.push({name:'B46_ORIGINAL_OU_TEST_UI',type:'service',service:TEST,environment:'production'});
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],
   keep_assets:true,assets:{config:v.assets.config},bindings,
   annotations:{'workers/message':'Original O/U TEST-verified 7D 30D 90D on ball46.com existing route'}};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers','tags'])
  if(settings[k]!=null)meta[k]=settings[k];
 report.previousProduction=prod;report.testFrontend=test;report.snapshot=snapshot0;
 report.modules={before:v.modules.length,after:ms.length};
 report.bindings={before:v.bindings.length,after:bindings.length};save();
 return {v,prod,test,snapshot:snapshot0,ms,meta,hash:modulesHash(ms)};
}
async function verifyCandidate(id,plan){
 const current=await cf('/workers/'+SITE+'/versions/'+id+'?include=modules');
 assert.equal(current.modules.length,106);
 assert.equal(current.main_module,plan.v.main_module);
 assert.equal(modulesHash(current.modules),plan.hash,'CANDIDATE_MODULE_BINARY_MISMATCH');
 assert.equal(current.bindings.length,12);
 assert.equal(stable(current.assets?.config),stable(plan.v.assets.config),'ASSET_SETTINGS_CHANGED');
 assert.equal(current.compatibility_date,plan.v.compatibility_date);
 for(const b of plan.v.bindings){
  const matched=current.bindings.find(x=>x.name===b.name&&x.type===b.type);
  assert(matched,'PRODUCTION_EXISTING_BINDING_CHANGED_'+b.name);
  if(b.type!=='secret_text')assert.equal(stable(matched),stable(b),'BINDING_CHANGED_'+b.name);
 }
 const newBinding=current.bindings.find(x=>x.name==='B46_ORIGINAL_OU_TEST_UI');
 assert(newBinding?.type==='service'&&newBinding.service===TEST);
}
async function probe(origin){
 const link=origin+'/?b46pm=ou';
 const r=await fetch(link,{signal:AbortSignal.timeout(45000)});
 assert.equal(r.status,200,'ORIGINAL_OU_HTTP_'+r.status);
 assert.equal(r.headers.get('x-b46-original-ou-view'),'original-path-no-flicker','ORIGINAL_PATH_NOT_ACTIVE');
 const html=await r.text();
 assert(html.includes('/__b46_prematch_client.js'),'TEST_UI_NOT_INJECTED');
 const js=await fetch(origin+'/__b46_prematch_client.js',{signal:AbortSignal.timeout(30000)});
 assert.equal(js.status,200,'ORIGINAL_ASSET_ROUTE_MISSING');
 const code=await js.text();
 assert(code.includes('B46_PERFORMANCE_RANGE_INPLACE_20261125'));
 assert(code.includes('B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125'));
 const post=await fetch(origin+'/__b46_prematch_data',{method:'POST',signal:AbortSignal.timeout(30000)});
 assert.equal(post.status,405,'READONLY_POST_GUARD_FAILED');
 return {url:link,http:r.status,script:js.status,post:post.status};
}
async function assign(version,message){
 return cf('/scripts/'+SITE+'/deployments','POST',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':message}});
}
async function health(){
 const checks=['/','/api/engine/health','/robots.txt'];
 const statuses=await Promise.all(checks.map(async path=>{
  const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(30000)});
  return {path,status:r.status,ok:r.ok};
 }));
 assert(statuses.every(x=>x.ok),'PRODUCTION_HEALTH_FAILED_'+JSON.stringify(statuses));
 return statuses;
}
async function main(){
 const plan=await prepared();
 await guard(BASE,plan.snapshot);
 if(mode==='stage'){
  const uploaded=await cf('/scripts/'+SITE+'/versions?bindings_inherit=strict','POST',form(plan.ms,plan.meta));
  assert(uploaded.id&&uploaded.id!==BASE,'CANDIDATE_ID_MISSING');
  report.candidate=uploaded.id;report.preview='https://'+uploaded.id.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';save();
  await verifyCandidate(uploaded.id,plan);await guard(BASE,plan.snapshot);
  for(let i=0;i<12;i++){try{report.previewCheck=await probe(report.preview);break;}catch(e){if(i===11)throw e;await delay(1700);}}
  await guard(BASE,plan.snapshot);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'candidate='+uploaded.id+'\npreview='+report.preview+'\nbase='+BASE+'\n');
  report.status='PREVIEW_TEST_READY';save();
  console.log('B46_ORIGINAL_OU_PREVIEW_READY '+JSON.stringify({candidate:uploaded.id,preview:report.preview,rollback:BASE,probe:report.previewCheck,modules:106,bindings:12}));
  return;
 }
 const id=process.env.B46_ORIGINAL_CANDIDATE;
 assert.match(id||'',/^[0-9a-f-]{36}$/);
 await verifyCandidate(id,plan);await guard(BASE,plan.snapshot);
 let attempted=false;
 try{
  attempted=true;
  const result=await assign(id,'Original PreMatch O/U restored route 7D 30D 90D no-flicker after original TEST QA');
  report.activeDeployment=result.id;report.candidate=id;save();
  for(let i=0;i<15;i++){if((await active(SITE)).version===id)break;await delay(1100);}
  assert.equal((await active(SITE)).version,id,'PRODUCTION_VERSION_NOT_ACTIVE');
  for(let i=0;i<15;i++){try{report.productionProbe=await probe('https://ball46.com');break;}catch(e){if(i===14)throw e;await delay(1400);}}
  report.productionHealth=await health();await guard(id,plan.snapshot);
  report.status='ACTIVE_PENDING_FULL_BROWSER_QA';save();
  console.log('B46_ORIGINAL_OU_PRODUCTION_DEPLOYED '+JSON.stringify({active:id,rollback:BASE,probe:report.productionProbe,health:report.productionHealth,modules:106,bindings:12}));
 }catch(error){
  report.activateError=String(error.stack||error);
  if(attempted)try{
   if((await active(SITE)).version===id){
    const reverted=await assign(BASE,'Automatic rollback original O/U due to failed Production test');
    report.revertedDeployment=reverted.id;
    for(let i=0;i<15;i++){if((await active(SITE)).version===BASE)break;await delay(1200);}
    assert.equal((await active(SITE)).version,BASE,'ROLLBACK_NOT_CONFIRMED');
   }
  }catch(e){report.rollbackError=String(e.stack||e);}
  save();throw error;
 }
}
main().catch(e=>{report.failure=String(e.stack||e);save();console.error(e.stack||e);process.exitCode=1;});
