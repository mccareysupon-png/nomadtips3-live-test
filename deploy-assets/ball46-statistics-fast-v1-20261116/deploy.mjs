// BALL46 owner-approved Statistics V1 FAST READ PATH. Existing 49 modules immutable.
// Fresh isolated snapshot service -> inactive candidate -> PC/mobile QA -> atomic activate / rollback.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {verifyBrowser} from './verify-fast-browser.mjs';
import {patchProdStatistics,patchProdChart} from './prod-lazy-patch.mjs';

const WORKER='ball46-production',ENGINE='nomadtips3-engine-343',
  ACCOUNT='62cb0db544160e6591342abd6b4f35cc',
  EXPECTED='828ddb27-bec4-47f8-a41f-fc7469b0152a',
  SITE='https://www.ball46.com',DIRECT='https://ball46-production.mccarey-supon.workers.dev',
  DIR='deploy-assets/ball46-statistics-fast-v1-20261116',
  ENTRY='statistics-fast-v1-release-20261116.mjs',
  PATCH_MODULE='statistics-fast-v1-patch-20261116.mjs',
  SCRIPT_MODULE='statistics-fast-v1-js-20261116.txt',
  SCRIPT_PATH='/b46-statistics-fast-v1-20261116.js',
  SNAPSHOT_SERVICE='b46-stats-fast-v1-snapshot-20261116',
  MARKER='B46_STATISTICS_FAST_V1_OWNER_APPROVED_20261116';
const digest=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const report={run:process.env.GITHUB_RUN_ID,scope:'Production Statistics V1 first-paint read path; original Worker/Engine/Ledger/original KV/formulas preserved',
  stage:'preflight',activated:false,writes:[],engineWrites:0,ledgerWrites:0};
const audit=DIR+'/audit';await mkdir(audit,{recursive:true});
const save=()=>writeFile(audit+'/deployment.json',JSON.stringify(report,null,2));
let baseId=null,candidateId=null;

async function cf(method,path,data){
  if(method!=='GET'){
    assert.equal(method,'POST','NON_POST_WRITE_BLOCKED');
    assert(['/workers/scripts/'+WORKER+'/versions','/workers/scripts/'+WORKER+'/deployments'].includes(path.split('?')[0]),
      'NON_VERSION_WRITE_BLOCKED:'+path);
    report.writes.push({method,path});await save();
  }
  const token=process.env.CLOUDFLARE_API_TOKEN;
  assert(token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
    method,headers:{authorization:'Bearer '+token,
      ...(data instanceof FormData?{}:data?{'content-type':'application/json'}:{})},
    body:data instanceof FormData?data:data?JSON.stringify(data):undefined,
    signal:AbortSignal.timeout(90000)
  });
  const j=await r.json();
  assert(r.ok&&j.success===true,'CF_'+r.status+':'+JSON.stringify(j.errors||[]));
  return j.result;
}
async function active(worker=WORKER){
  const d=(await cf('GET','/workers/scripts/'+worker+'/deployments?per_page=1')).deployments?.[0];
  assert(d?.versions?.length===1&&Number(d.versions[0].percentage)===100,'SPLIT_TRAFFIC_'+worker);
  return {id:d.versions[0].version_id,deploymentId:d.id};
}
const version=(worker,id)=>cf('GET','/workers/workers/'+worker+'/versions/'+id+'?include=modules');
const moduleHashes=v=>v.modules.map(m=>({name:m.name,type:m.content_type,hash:digest(Buffer.from(m.content_base64,'base64'))}))
  .sort((a,b)=>a.name.localeCompare(b.name));
async function asset(host,path){
  const r=await fetch(new URL(path,host),{headers:{'cache-control':'no-cache'},redirect:'error',
    signal:AbortSignal.timeout(50000)});
  const b=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200,'ASSET_HTTP_'+host+path+'_'+r.status);
  assert(b.length,'ASSET_EMPTY_'+path);
  return b;
}
async function existingAssets(host){
  const output={};
  for(const p of ['/dashboard-v2-stage3-featured-facts-20261013a.js','/bulk-odds-compat-343.js']){
    output[p]=digest(await asset(host,p));
  }
  const health=JSON.parse(await asset(host,'/api/engine/health'));
  assert(health.ok===true,'ENGINE_HEALTH_FAILED');
  return output;
}
function newWrapper(main){
  assert(/^[\w.-]+\.mjs$/.test(main),'UNSAFE_CURRENT_MAIN');
  return [
    'import original from '+JSON.stringify('./'+main)+';',
    'export * from '+JSON.stringify('./'+main)+';',
    'import fastClient from '+JSON.stringify('./'+SCRIPT_MODULE)+';',
    'import {patchProdStatistics,patchProdChart} from '+JSON.stringify('./'+PATCH_MODULE)+';',
    'const marker='+JSON.stringify(MARKER)+';',
    'const jsPath='+JSON.stringify(SCRIPT_PATH)+';',
    'const safeHeaders={"cache-control":"no-store, max-age=0","x-content-type-options":"nosniff"};',
    'export default {...original,async fetch(request,env,ctx){',
    'const u=new URL(request.url);',
    "if(['GET','HEAD'].includes(request.method)&&u.pathname===jsPath)return new Response(request.method==='HEAD'?null:fastClient,{headers:{...safeHeaders,'content-type':'application/javascript; charset=utf-8'}});",
    "if(['GET','HEAD'].includes(request.method)&&['/b46-fast-v1/head','/b46-fast-v1/chart'].includes(u.pathname)){",
    "try { if(!env.B46_FAST_SNAPSHOT)throw Error('FAST_BINDING_MISSING');",
    "const target=u.pathname.endsWith('/head')?'/head':'/chart';",
    "const upstream=await env.B46_FAST_SNAPSHOT.fetch(new Request('https://b46-stats-fast-v1-snapshot-20261116.mccarey-supon.workers.dev'+target,{method:'GET'}));",
    "const h=new Headers(upstream.headers);for(const key of ['content-length','content-encoding','etag','set-cookie'])h.delete(key);",
    "h.set('cache-control','no-store, max-age=0');h.set('x-b46-fast-v1','VERIFIED_SNAPSHOT_PROXY');",
    "return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});",
    "}catch{return new Response(JSON.stringify({ok:false,error:'FAST_SNAPSHOT_UNAVAILABLE'}),{status:503,headers:{'content-type':'application/json',...safeHeaders}})}",
    "}",
    "const res=await original.fetch(request,env,ctx);",
    "if(request.method==='GET'&&res.status===200&&u.pathname==='/singlepage-workspace-343.js'){",
    "const source=await res.text();const result=patchProdStatistics(source);",
    "const h=new Headers(res.headers);for(const key of ['content-length','content-encoding','etag'])h.delete(key);",
    "h.set('x-b46-fast-lazy',result.status);h.set('cache-control','no-store, max-age=0');",
    "return new Response(result.source,{status:200,headers:h});",
    "}",
    "if(request.method==='GET'&&res.status===200&&u.pathname==='/longterm-performance-343.js'){",
    "const source=await res.text();const result=patchProdChart(source);",
    "const h=new Headers(res.headers);for(const key of ['content-length','content-encoding','etag'])h.delete(key);",
    "h.set('x-b46-fast-chart-lazy',result.status);h.set('cache-control','no-store, max-age=0');",
    "return new Response(result.source,{status:200,headers:h});",
    "}",
    "if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||res.status!==200||",
    "!res.headers.get('content-type')?.includes('text/html'))return res;",
    "const body=await res.text();",
    "if(body.includes(marker)||!body.includes('</head>'))return new Response(body,{status:res.status,headers:res.headers});",
    "const inject='<!-- '+marker+' --><script defer src=\"'+jsPath+'\"></script>';",
    "const h=new Headers(res.headers);for(const key of ['content-length','content-encoding','etag'])h.delete(key);",
    "h.set('cache-control','no-store, max-age=0');",
    "return new Response(body.replace('</head>',inject+'</head>'),{status:res.status,headers:h});",
    '}};'
  ].join('\n');
}

async function ensureCandidate(made,base){
  assert.equal(made.main_module,ENTRY,'CANDIDATE_MAIN_WRONG');
  const expectedBindings=[...base.bindings,{name:'B46_FAST_SNAPSHOT',type:'service',
    service:SNAPSHOT_SERVICE,environment:'production'}];
  const byName=b=>canonical([...b].sort((a,c)=>a.name.localeCompare(c.name)));
  assert.equal(byName(made.bindings),byName(expectedBindings),'UNAPPROVED_BINDING_DRIFT');
  assert.equal(canonical(made.assets?.config),canonical(base.assets?.config),'ASSET_CONFIG_DRIFT');
  assert.equal(made.compatibility_date,base.compatibility_date,'COMPATIBILITY_DRIFT');
  assert.equal(canonical(made.compatibility_flags||[]),canonical(base.compatibility_flags||[]),'FLAGS_DRIFT');
  const original=new Map(moduleHashes(base).map(m=>[m.name,m]));
  for(const m of moduleHashes(made))if(original.has(m.name))assert.deepEqual(m,original.get(m.name),'SOURCE_MODULE_MUTATED:'+m.name);
  assert.equal(made.modules.length,base.modules.length+3,'EXTRA_MODULE_COUNT_WRONG');
}
async function rollback(error){
  report.error=String(error?.stack||error).slice(0,6000);report.stage='failure';
  try{
    const current=await active();
    if(candidateId&&current.id===candidateId&&baseId){
      await cf('POST','/workers/scripts/'+WORKER+'/deployments',{
        strategy:'percentage',versions:[{version_id:baseId,percentage:100}],
        annotations:{'workers/message':'Automatic rollback: Statistics card release failed verification'}});
      report.rolledBack=(await active()).id===baseId;
    }
  }catch(e){report.rollbackError=String(e)}
  await save();
  console.error('B46_PRODUCTION_UI_RELEASE_STOP='+JSON.stringify({error:report.error.slice(0,350),
    stage:report.stage,activated:report.activated,rolledBack:report.rolledBack||false,candidateId,baseId}));
  process.exitCode=1;
}
try{
  assert.equal(process.env.B46_APPROVED_FAST_V1,'YES','OWNER_APPROVAL_MISSING');
  const js=await readFile(DIR+'/fast-client.js','utf8');
  const patch=await readFile(DIR+'/prod-lazy-patch.mjs','utf8');
  assert(js.includes('SIGNAL OUTCOMES')&&js.includes('b46-fast-v1-preview'),'FAST_UI_MISSING');
  assert(!js.includes('/_b46_stage_stats_'),'STAGING_URL_REFERENCED');
  assert(patch.includes('PATCHED_FULL_LEDGER_LAZY'),'PRODUCTION_LAZY_PATCH_MISSING');
  new Function(js);report.jsHash=digest(js);report.patchHash=digest(patch);
  report.before=await active();baseId=report.before.id;
  assert.equal(baseId,EXPECTED,'PRODUCTION_MOVED_STOP_AND_READ_BACK');
  const engineBefore=await active(ENGINE);report.engineBefore=engineBefore;
  const base=await version(WORKER,baseId);
  assert.equal(base.main_module,'statistics-card-release-20261116.mjs','BASE_MAIN_MODULE_CHANGED');
  assert(base.modules.length>=40,'ACTIVE_MODULE_SET_INCOMPLETE');
  assert(!base.modules.some(x=>[ENTRY,PATCH_MODULE,SCRIPT_MODULE].includes(x.name)),'ALREADY_DEPLOYED_STOP');
  assert(base.bindings.some(x=>x.name==='ENGINE'&&x.type==='service'),'ENGINE_BINDING_MISSING');
  assert(base.bindings.some(x=>x.type==='assets'),'ASSET_BINDING_MISSING');
  const settings=await cf('GET','/workers/scripts/'+WORKER+'/settings');
  report.beforeAssets=await existingAssets(DIRECT);
  report.originalModuleCount=base.modules.length;
  await save();
  const extra=[
    {name:ENTRY,content_type:'application/javascript+module',content_base64:Buffer.from(newWrapper(base.main_module)).toString('base64')},
    {name:PATCH_MODULE,content_type:'application/javascript+module',content_base64:Buffer.from(patch).toString('base64')},
    {name:SCRIPT_MODULE,content_type:'text/plain',content_base64:Buffer.from(js).toString('base64')}
  ];
  const all=[...base.modules,...extra];
  report.gzipSize=all.reduce((sum,m)=>sum+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);
  assert(report.gzipSize<10*1024*1024-100*1024,'COMPRESSED_WORKER_TOO_LARGE');
  const meta={main_module:ENTRY,compatibility_date:base.compatibility_date,
    compatibility_flags:base.compatibility_flags||[],
    bindings:[...base.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:'latest'}:x),
      {name:'B46_FAST_SNAPSHOT',type:'service',service:SNAPSHOT_SERVICE,environment:'production'}],
    keep_assets:true,annotations:{'workers/tag':MARKER,
      'workers/message':'OWNER APPROVED V1 verified read-only Stats fast path; preserve all modules Engine, Ledger and original KV'}};
  if(base.assets?.config)meta.assets={config:base.assets.config};
  for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])
    if(settings[k]!=null)meta[k]=settings[k];
  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  for(const m of all)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  const snapshotWorker=await active(SNAPSHOT_SERVICE);
  report.snapshotWorkerBefore=snapshotWorker;
  const auxHead=JSON.parse(await asset('https://'+SNAPSHOT_SERVICE+'.mccarey-supon.workers.dev','/head'));
  const auxGraph=JSON.parse(await asset('https://'+SNAPSHOT_SERVICE+'.mccarey-supon.workers.dev','/chart'));
  assert(auxHead.ok&&auxGraph.ok&&auxHead.total===auxGraph.summary.rows &&
    auxHead.snapshotSavedAt===auxGraph.asOf,'SNAPSHOT_SERVICE_UNVERIFIED');
  assert(Date.now()-auxHead.snapshotSavedAt<60*60*1000,'SNAPSHOT_SERVICE_TOO_OLD');
  assert.deepEqual(await active(),report.before,'ACTIVE_VERSION_CHANGED_BEFORE_UPLOAD');
  assert.deepEqual(await active(ENGINE),engineBefore,'ENGINE_VERSION_CHANGED_BEFORE_UPLOAD');
  report.stage='upload-INACTIVE-preview';await save();
  candidateId=(await cf('POST','/workers/scripts/'+WORKER+'/versions?bindings_inherit=strict',form)).id;
  assert(candidateId&&candidateId!==baseId,'CANDIDATE_NOT_CREATED');
  report.candidate=candidateId;
  const made=await version(WORKER,candidateId);
  await ensureCandidate(made,base);
  report.preview='https://'+candidateId.slice(0,8)+'-'+WORKER+'.mccarey-supon.workers.dev';
  report.stage='candidate-QA';await save();
  const candidateHtml=(await asset(report.preview,'/?view=statistics')).toString('utf8');
  assert(candidateHtml.includes(MARKER)&&candidateHtml.includes(SCRIPT_PATH),'PREVIEW_UI_NOT_INJECTED');
  assert.equal(digest(await asset(report.preview,SCRIPT_PATH)),report.jsHash,'PREVIEW_JS_SHA_DRIFT');
  for(const [path,expected] of [['/singlepage-workspace-343.js','PATCHED_FULL_LEDGER_LAZY'],['/longterm-performance-343.js','PATCHED_GRAPH_LEDGER_LAZY']]){
    const r=await fetch(report.preview+path,{signal:AbortSignal.timeout(30000)});
    assert.equal(r.status,200,'PREVIEW_JS_HTTP_'+path);
    assert.equal(r.headers.get(path.includes('singlepage')?'x-b46-fast-lazy':'x-b46-fast-chart-lazy'),expected,'PREVIEW_LAZY_PATCH_DRIFT');
  }
  const h=JSON.parse(await asset(report.preview,'/b46-fast-v1/head'));
  const g=JSON.parse(await asset(report.preview,'/b46-fast-v1/chart'));
  assert(h.ok&&g.ok&&h.total===g.summary.rows&&h.snapshotSavedAt===g.asOf,'FAST_CANDIDATE_SNAPSHOT_PARITY');
  assert.deepEqual(await existingAssets(report.preview),report.beforeAssets,'OTHER_PREVIEW_ASSETS_CHANGED');
  report.candidateBrowser=await verifyBrowser(report.preview,'preview',audit);
  await save();
  if(process.env.B46_V1_MODE==='candidate'){
    report.stage='CANDIDATE_VERIFIED_INACTIVE';report.ok=true;await save();
    console.log('B46_FAST_V1_CANDIDATE_VERIFIED='+JSON.stringify({
      baseId,candidateId,preview:report.preview,checks:report.candidateBrowser,
      productionChanged:false,rollbackPoint:baseId}));
    process.exit(0);
  }
  assert.equal(process.env.B46_V1_MODE,'activate','MISSING_ACTIVATION_MODE');
  assert.deepEqual(await active(),report.before,'CONCURRENT_PRODUCTION_DEPLOY_STOP');
  assert.deepEqual(await active(ENGINE),engineBefore,'CONCURRENT_ENGINE_DEPLOY_STOP');
  assert.deepEqual(await active(SNAPSHOT_SERVICE),snapshotWorker,'CONCURRENT_SNAPSHOT_SERVICE_DEPLOY_STOP');
  assert.deepEqual(await existingAssets(DIRECT),report.beforeAssets,'PRODUCTION_STATIC_ASSET_DRIFT');
  report.stage='ACTIVATE';await save();
  await cf('POST','/workers/scripts/'+WORKER+'/deployments',{strategy:'percentage',
    versions:[{version_id:candidateId,percentage:100}],
    annotations:{'workers/message':'Owner-approved verified Statistics V1 fast first-paint, validated inactive candidate'}});
  report.activated=true;await save();
  assert.equal((await active()).id,candidateId,'DEPLOYED_VERSION_NOT_ACTIVE');
  report.stage='verify-PRODUCTION';await save();
  for(const host of [DIRECT,SITE]){
    let html=null;
    for(let attempt=0;attempt<16;attempt++){
      try{html=(await asset(host,'/?view=statistics')).toString('utf8')}catch{}
      if(html?.includes(MARKER))break;
      await new Promise(resolve=>setTimeout(resolve,1800));
    }
    assert(html?.includes(MARKER),'PRODUCTION_HTML_PROPAGATION_FAIL_'+host);
    assert.equal(digest(await asset(host,SCRIPT_PATH)),report.jsHash,'LIVE_JS_MISMATCH_'+host);
  }
  assert.deepEqual(await existingAssets(DIRECT),report.beforeAssets,'OTHER_LIVE_ASSETS_CHANGED');
  report.liveBrowser=await verifyBrowser(DIRECT,'live',audit);
  assert.deepEqual(await active(ENGINE),engineBefore,'ENGINE_ACTIVE_VERSION_CHANGED');
  assert.deepEqual(await active(SNAPSHOT_SERVICE),snapshotWorker,'SNAPSHOT_SERVICE_ACTIVE_VERSION_CHANGED');
  await ensureCandidate(await version(WORKER,(await active()).id),base);
  report.after=await active();report.stage='VERIFIED-LIVE';report.ok=true;await save();
  console.log('B46_PRODUCTION_UI_RELEASE_SUCCESS='+JSON.stringify({
    before:report.before,after:report.after,oldModules:report.originalModuleCount,
    candidateBrowser:report.candidateBrowser,liveBrowser:report.liveBrowser,
    noEngineOrLedgerWrites:true,rollbackPoint:baseId}));
}catch(e){await rollback(e)}
