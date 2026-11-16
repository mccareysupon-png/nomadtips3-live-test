// BALL46 owner-approved Statistics presentation ONLY (PC). Exact live version -> inactive candidate -> QA -> activate -> rollback.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {verifyBrowser} from './verify-browser.mjs';

const WORKER='ball46-production',ENGINE='nomadtips3-engine-343',
  ACCOUNT='62cb0db544160e6591342abd6b4f35cc',
  EXPECTED='98be2d5a-b5f6-4226-8ee0-3f7270b03533',
  SITE='https://www.ball46.com',DIRECT='https://ball46-production.mccarey-supon.workers.dev',
  DIR='deploy-assets/ball46-statistics-card-prod-20261116',
  ENTRY='statistics-card-release-20261116.mjs',
  STYLE_MODULE='statistics-card-ui-css-20261116.txt',
  SCRIPT_MODULE='statistics-card-ui-js-20261116.txt',
  STYLE_PATH='/b46-statistics-card-20261116.css',
  SCRIPT_PATH='/b46-statistics-card-20261116.js',
  MARKER='B46_STATISTICS_CARD_VISUAL_20261116';
const digest=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const report={run:process.env.GITHUB_RUN_ID,scope:'Production DESKTOP Statistics UI only; original Worker/Engine/Ledger/KV/API/formulas/mobile preserved',
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
  for(const p of ['/singlepage-workspace-343.js','/longterm-performance-343.js']){
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
    "import css from './"+STYLE_MODULE+"';",
    "import js from './"+SCRIPT_MODULE+"';",
    'const marker='+JSON.stringify(MARKER)+';',
    'const cssPath='+JSON.stringify(STYLE_PATH)+';',
    'const jsPath='+JSON.stringify(SCRIPT_PATH)+';',
    'export default {...original,async fetch(request,env,ctx){',
    'const u=new URL(request.url);',
    "if(['GET','HEAD'].includes(request.method)&&u.pathname===cssPath)return new Response(request.method==='HEAD'?null:css,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=900','x-content-type-options':'nosniff'}});",
    "if(['GET','HEAD'].includes(request.method)&&u.pathname===jsPath)return new Response(request.method==='HEAD'?null:js,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'public, max-age=900','x-content-type-options':'nosniff'}});",
    'const res=await original.fetch(request,env,ctx);',
    "if(request.method!=='GET'||!['/','/index.html'].includes(u.pathname)||res.status!==200||!res.headers.get('content-type')?.includes('text/html'))return res;",
    'const h=await res.text();',
    'if(h.includes(marker)||!h.includes("</head>"))return new Response(h,{status:res.status,headers:res.headers});',
    'const inject="<!-- "+marker+" --><link rel=\\"stylesheet\\" href=\\""+cssPath+"\\"><script defer src=\\""+jsPath+"\\"></script>";',
    'const head=new Headers(res.headers);',
    "for(const k of ['content-length','content-encoding','etag'])head.delete(k);",
    "head.set('cache-control','no-store, max-age=0');",
    'return new Response(h.replace("</head>",inject+"</head>"),{status:res.status,headers:head});',
    '}};'
  ].join('\n');
}
async function ensureCandidate(made,base){
  assert.equal(made.main_module,ENTRY,'CANDIDATE_MAIN_WRONG');
  assert.equal(canonical(made.bindings),canonical(base.bindings),'BINDING_DRIFT');
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
  assert.equal(process.env.B46_APPROVED_DESKTOP_UI,'YES','OWNER_APPROVAL_MISSING');
  const css=await readFile(DIR+'/statistics-card.css','utf8');
  const js=await readFile(DIR+'/statistics-card.js','utf8');
  assert(css.includes('min-width:851px')&&css.includes('b46-stage-outcomes'),'DESKTOP_CSS_MISSING');
  assert(!css.includes('b46-stats-loader')&&!css.includes('Loading statistics…'),'UNAPPROVED_LOADING_CHANGE');
  assert(js.includes('SIGNAL OUTCOMES')&&js.includes("['WIN','win']"),'METRIC_SOURCE_MISSING');
  new Function(js);report.cssHash=digest(css);report.jsHash=digest(js);
  report.before=await active();baseId=report.before.id;
  assert.equal(baseId,EXPECTED,'PRODUCTION_MOVED_STOP_AND_READ_BACK');
  const engineBefore=await active(ENGINE);report.engineBefore=engineBefore;
  const base=await version(WORKER,baseId);
  assert.equal(base.main_module,'finance-line-entry-20261114.mjs','BASE_MAIN_MODULE_CHANGED');
  assert(base.modules.length>=40,'ACTIVE_MODULE_SET_INCOMPLETE');
  assert(!base.modules.some(x=>[ENTRY,STYLE_MODULE,SCRIPT_MODULE].includes(x.name)),'ALREADY_DEPLOYED_STOP');
  assert(base.bindings.some(x=>x.name==='ENGINE'&&x.type==='service'),'ENGINE_BINDING_MISSING');
  assert(base.bindings.some(x=>x.type==='assets'),'ASSET_BINDING_MISSING');
  const settings=await cf('GET','/workers/scripts/'+WORKER+'/settings');
  report.beforeAssets=await existingAssets(DIRECT);
  report.originalModuleCount=base.modules.length;
  await save();
  const extra=[
    {name:ENTRY,content_type:'application/javascript+module',content_base64:Buffer.from(newWrapper(base.main_module)).toString('base64')},
    {name:STYLE_MODULE,content_type:'text/plain',content_base64:Buffer.from(css).toString('base64')},
    {name:SCRIPT_MODULE,content_type:'text/plain',content_base64:Buffer.from(js).toString('base64')}
  ];
  const all=[...base.modules,...extra];
  report.gzipSize=all.reduce((sum,m)=>sum+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);
  assert(report.gzipSize<10*1024*1024-100*1024,'COMPRESSED_WORKER_TOO_LARGE');
  const meta={main_module:ENTRY,compatibility_date:base.compatibility_date,
    compatibility_flags:base.compatibility_flags||[],
    bindings:base.bindings.map(x=>x.type==='secret_text'?{name:x.name,type:'inherit',version_id:'latest'}:x),
    keep_assets:true,annotations:{'workers/tag':MARKER,
      'workers/message':'OWNER APPROVED PC statistics UI only; preserve formulas, Engine, Ledger, KV and mobile'}};
  if(base.assets?.config)meta.assets={config:base.assets.config};
  for(const k of ['usage_model','logpush','limits','observability','placement','tail_consumers'])
    if(settings[k]!=null)meta[k]=settings[k];
  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  for(const m of all)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
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
  assert(candidateHtml.includes(MARKER)&&candidateHtml.includes(STYLE_PATH)&&candidateHtml.includes(SCRIPT_PATH),'PREVIEW_UI_NOT_INJECTED');
  assert.equal(digest(await asset(report.preview,STYLE_PATH)),report.cssHash,'PREVIEW_CSS_SHA_DRIFT');
  assert.equal(digest(await asset(report.preview,SCRIPT_PATH)),report.jsHash,'PREVIEW_JS_SHA_DRIFT');
  assert.deepEqual(await existingAssets(report.preview),report.beforeAssets,'OTHER_PREVIEW_ASSETS_CHANGED');
  report.candidateBrowser=await verifyBrowser(report.preview,'preview',audit);
  await save();
  assert.deepEqual(await active(),report.before,'CONCURRENT_PRODUCTION_DEPLOY_STOP');
  assert.deepEqual(await active(ENGINE),engineBefore,'CONCURRENT_ENGINE_DEPLOY_STOP');
  assert.deepEqual(await existingAssets(DIRECT),report.beforeAssets,'PRODUCTION_STATIC_ASSET_DRIFT');
  report.stage='ACTIVATE';await save();
  await cf('POST','/workers/scripts/'+WORKER+'/deployments',{strategy:'percentage',
    versions:[{version_id:candidateId,percentage:100}],
    annotations:{'workers/message':'Owner-approved desktop Statistics card visual, validated preview'}});
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
    assert.equal(digest(await asset(host,STYLE_PATH)),report.cssHash,'LIVE_CSS_MISMATCH_'+host);
    assert.equal(digest(await asset(host,SCRIPT_PATH)),report.jsHash,'LIVE_JS_MISMATCH_'+host);
  }
  assert.deepEqual(await existingAssets(DIRECT),report.beforeAssets,'OTHER_LIVE_ASSETS_CHANGED');
  report.liveBrowser=await verifyBrowser(DIRECT,'live',audit);
  assert.deepEqual(await active(ENGINE),engineBefore,'ENGINE_ACTIVE_VERSION_CHANGED');
  await ensureCandidate(await version(WORKER,(await active()).id),base);
  report.after=await active();report.stage='VERIFIED-LIVE';report.ok=true;await save();
  console.log('B46_PRODUCTION_UI_RELEASE_SUCCESS='+JSON.stringify({
    before:report.before,after:report.after,oldModules:report.originalModuleCount,
    candidateBrowser:report.candidateBrowser,liveBrowser:report.liveBrowser,
    noEngineOrLedgerWrites:true,rollbackPoint:baseId}));
}catch(e){await rollback(e)}
