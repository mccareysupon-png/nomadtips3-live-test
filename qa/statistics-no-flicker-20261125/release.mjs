import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDENTIALS_REQUIRED');
const worker='ball46-production',baseline='df9f8726-d653-44f6-8fd4-43a4b7b94696';
const main='b46-frontend-seo-entry-20261124.mjs',moduleName='b46-statistics-inplace.mjs';
const mode=process.env.B46_STATISTICS_RELEASE_MODE;assert(['stage','activate'].includes(mode),'UNKNOWN_RELEASE_MODE');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const dirname='qa/statistics-no-flicker-20261125/audit';mkdirSync(dirname,{recursive:true});
const report={task:'B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125',baseline,mode};
const save=()=>writeFileSync(dirname+'/release.json',JSON.stringify(report,null,2));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=t=>new Promise(r=>setTimeout(r,t));
function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return x}
function moduleHash(mods){return sha(JSON.stringify(stable(mods.map(m=>[m.name,m.content_type,sha(Buffer.from(m.content_base64,'base64'))]).sort((a,b)=>a[0].localeCompare(b[0])))))}
async function cf(path,method='GET',body){
 const opts={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(90000)};
 if(body){if(body instanceof FormData)opts.body=body;else{opts.headers['content-type']='application/json';opts.body=JSON.stringify(body)}}
 const r=await fetch(root+path,opts),json=await r.json();
 assert(r.ok&&json.success,'CF_'+path+'_'+r.status+'_'+JSON.stringify(json.errors||[]).slice(0,500));return json.result;
}
async function active(name){
 const j=await cf('/scripts/'+name+'/deployments?per_page=1');
 const deployment=j.deployments?.[0],versions=deployment?.versions;
 assert(deployment?.id&&versions?.length===1&&Number(versions[0].percentage)===100,'AMBIGUOUS_DEPLOY_'+name);
 return versions[0].version_id;
}
const protectedNames=['ball46-premium-match-colors-test-20261120','ball46-prematch-only-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
async function protect(){return Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await active(n)])))}
const originalImport="import {isOriginalOuRoute,isOriginalOuAsset,originalOuHandler} from './b46-original-ou-proxy.mjs';";
const routeAnchor="    if (!['GET', 'HEAD'].includes(request.method) || !isSeoPath(pathname)) {";
function once(s,anchor,replacement){assert.equal(s.split(anchor).length,2,'PATCH_MAIN_ANCHOR_DRIFT_'+anchor.slice(0,80));return s.replace(anchor,replacement)}
function patchMain(code){
 assert(!code.includes('B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125'),'ALREADY_PATCHED');
 let out=once(code,originalImport,originalImport+"\nimport {servePatchedStatistics} from './"+moduleName+"';");
 const route="    // B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125: original Statistics view only.\n"+
 "    if (pathname === '/longterm-performance-343.js' && request.method === 'GET') {\n"+
 "      return servePatchedStatistics(request,original,env,context);\n"+
 "    }\n";
 out=once(out,routeAnchor,route+routeAnchor);
 assert(out.length-code.length<520,'UNEXPECTED_MAIN_DIFF');
 return out;
}
function form(mods,metadata){
 const f=new FormData();f.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of mods)f.append(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type||'application/javascript+module'}),m.name);
 return f;
}
async function prepare(){
 assert.equal(await active(worker),baseline,'PRODUCTION_MOVED_PREPARE');
 const [v,settings,snapshot]=await Promise.all([
  cf('/workers/'+worker+'/versions/'+baseline+'?include=modules'),
  cf('/scripts/'+worker+'/settings'),protect()
 ]);
 assert.equal(v.main_module,main);
 assert.equal(v.modules.length,106,'PRODUCTION_MODULE_COUNT_CHANGED');
 assert.equal(v.bindings.length,12,'PRODUCTION_BINDING_COUNT_CHANGED');
 assert(v.assets?.config,'PRODUCTION_ASSETS_CONFIG_MISSING');
 assert(!v.modules.some(x=>x.name===moduleName),'PATCH_MODULE_EXISTS');
 const oldMain=v.modules.find(m=>m.name===main);
 const patchedMain=patchMain(Buffer.from(oldMain.content_base64,'base64').toString());
 const moduleFile=await import('node:fs').then(fs=>fs.readFileSync('qa/statistics-no-flicker-20261125/b46-statistics-inplace.mjs'));
 const mods=v.modules.map(m=>m.name===main?{...m,content_base64:Buffer.from(patchedMain).toString('base64')}:m);
 mods.push({name:moduleName,content_type:'application/javascript+module',content_base64:moduleFile.toString('base64')});
 const meta={main_module:main,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],
  keep_assets:true,assets:{config:v.assets.config},
  bindings:v.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:baseline}:b),
  annotations:{'workers/message':'Fix 7D/30D/90D flicker on REAL /?view=statistics using DOM reconciliation'}};
 for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers','tags'])
  if(settings[k]!=null)meta[k]=settings[k];
 report.before={version:baseline,modules:v.modules.length,bindings:v.bindings.length};report.protected=snapshot;save();
 return {v,mods,meta,hash:moduleHash(mods),snapshot};
}
async function guard(expected,plan){
 assert.equal(await active(worker),expected,'CONCURRENT_PRODUCTION_DEPLOY_ABORT');
 assert.deepEqual(await protect(),plan.snapshot,'PROTECTED_WORKER_CHANGED');
}
async function check(candidate,plan){
 const v=await cf('/workers/'+worker+'/versions/'+candidate+'?include=modules');
 assert.equal(v.main_module,main);assert.equal(v.modules.length,107);assert.equal(v.bindings.length,12);
 assert.equal(moduleHash(v.modules),plan.hash,'CANDIDATE_MODULE_BYTES_CHANGED');
 assert.deepEqual(stable(v.assets?.config),stable(plan.v.assets.config),'ASSETS_CONFIG_DRIFT');
 for(const b of plan.v.bindings){
  const actual=v.bindings.find(x=>x.name===b.name&&x.type===b.type);
  assert(actual,'ORIGINAL_BINDING_MISSING_'+b.name);
  if(b.type!=='secret_text')assert.deepEqual(stable(actual),stable(b),'BINDING_CHANGED_'+b.name);
 }
 assert.equal(v.compatibility_date,plan.v.compatibility_date);
}
async function probe(origin){
 const page=await fetch(origin+'/?view=statistics',{signal:AbortSignal.timeout(40000)});assert.equal(page.status,200);
 const asset=await fetch(origin+'/longterm-performance-343.js?_=stat-fix',{signal:AbortSignal.timeout(45000)});
 assert.equal(asset.status,200,'CHART_ASSET_UNAVAILABLE');
 assert.equal(asset.headers.get('x-b46-statistics-inplace'),'production-statistics-20261125','NOT_PATCHED_ROUTE');
 const source=await asset.text();
 assert(source.includes('B46_PRODUCTION_STATISTICS_STABLE_CHART_20261125'));
 const originalOU=await fetch(origin+'/?b46pm=ou',{signal:AbortSignal.timeout(45000)});
 assert.equal(originalOU.status,200,'O_U_ROUTE_BROKEN');
 return {stats:page.status,chart:asset.status,marker:true,originalOU:originalOU.status};
}
async function activate(id,message){return cf('/scripts/'+worker+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})}
async function mainRun(){
 const plan=await prepare();await guard(baseline,plan);
 if(mode==='stage'){
  const r=await cf('/scripts/'+worker+'/versions?bindings_inherit=strict','POST',form(plan.mods,plan.meta));
  assert(r.id&&r.id!==baseline);
  report.candidate=r.id;report.preview='https://'+r.id.slice(0,8)+'-'+worker+'.mccarey-supon.workers.dev';save();
  await check(r.id,plan);await guard(baseline,plan);
  for(let i=0;i<12;i++){try{report.previewCheck=await probe(report.preview);break}catch(e){if(i===11)throw e;await sleep(1200)}}
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'candidate='+r.id+'\npreview='+report.preview+'\n');
  report.status='STAGED_INACTIVE_FOR_BROWSER_QA';save();
  console.log('B46_STATISTICS_PRODUCTION_STAGED '+JSON.stringify({candidate:r.id,preview:report.preview,rollback:baseline,probe:report.previewCheck}));
  return;
 }
 const id=process.env.B46_STATISTICS_CANDIDATE;
 assert(/^[a-f0-9-]{36}$/.test(id||''),'CANDIDATE_MISSING');
 await check(id,plan);await guard(baseline,plan);
 let attempted=false;
 try{
  attempted=true;
  const deployed=await activate(id,'Deploy REAL Statistics 7D/30D/90D no-flicker chart fix');
  report.deployment=deployed.id;report.candidate=id;save();
  for(let i=0;i<15;i++){if(await active(worker)===id)break;await sleep(1000)}
  assert.equal(await active(worker),id,'PRODUCTION_NOT_ACTIVE');
  for(let i=0;i<14;i++){try{report.liveCheck=await probe('https://ball46.com');break}catch(e){if(i===13)throw e;await sleep(1400)}}
  await guard(id,plan);report.status='PRODUCTION_ACTIVE_PENDING_BROWSER_QA';save();
  console.log('B46_REAL_STATISTICS_DEPLOYED '+JSON.stringify({version:id,rollback:baseline,route:'https://ball46.com/?view=statistics',probe:report.liveCheck}));
 }catch(e){
  report.error=String(e.stack||e);
  if(attempted)try{
   if(await active(worker)===id){
    const reverted=await activate(baseline,'Rollback failed Statistics no-flicker patch');
    report.reverted=reverted.id;
    for(let i=0;i<15;i++){if(await active(worker)===baseline)break;await sleep(1100)}
    assert.equal(await active(worker),baseline,'ROLLBACK_NOT_CONFIRMED');
   }
  }catch(error){report.rollbackError=String(error.stack||error)}
  save();throw e;
 }
}
mainRun().catch(e=>{report.failure=String(e.stack||e);save();console.error(e.stack||e);process.exitCode=1});
