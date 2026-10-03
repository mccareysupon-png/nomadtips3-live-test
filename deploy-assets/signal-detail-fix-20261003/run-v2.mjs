import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const origin='https://ball46.com';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const route='/ui-sync-fixes-343-v2.js';
const marker='B46_SIGNAL_DETAIL_PERSIST_20261003';
const beforeSelector="document.querySelectorAll('[data-signal-count],[data-workspace-signal-count]').forEach(el=>el.textContent=String(count))";
const afterSelector="document.querySelectorAll('[data-signal-count]:not(.signal-inline-stack),[data-workspace-signal-count]').forEach(el=>el.textContent=String(count))";
const routeAnchor="if(url.pathname==='/odds-format-343.js')return __b46OddsFormatForStatistics(request,env);";
const exportAnchor='export default {...__B46_BASE_WORKER__,async fetch(request,env,ctx)';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',commit:process.env.GITHUB_SHA||'local',deploy,scope:'Signal Detail persistence only: exclude .signal-inline-stack from global signal-count textContent writer; static asset collection remains attached and unchanged'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=value=>JSON.stringify(value,(_,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry);
const count=(text,needle)=>text.split(needle).length-1;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const response=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(60000)});
  const json=await response.json();
  assert(response.ok&&json.success===true,`CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors||[])}`);
  return json.result;
}
async function activeVersion(){
  const result=await api(`/scripts/${script}/deployments?per_page=3`);
  const versions=result.deployments?.[0]?.versions;
  assert(versions?.length===1&&Number(versions[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  assert(versions[0].version_id,'ACTIVE_VERSION_MISSING');
  return versions[0].version_id;
}
async function getVersion(id){
  const version=await api(`/workers/${script}/versions/${id}?include=modules`);
  assert(version.main_module&&version.modules?.length,'ACTIVE_MODULES_MISSING');
  return version;
}
function safeBindings(bindings=[]){
  return bindings.map(b=>({name:b.name,type:b.type,service:b.service??null,environment:b.environment??null,namespace_id:b.namespace_id??null,dataset:b.dataset??null})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function functionalSettings(s={}){
  return {
    placement:s.placement??{},
    compatibility_date:s.compatibility_date??null,
    compatibility_flags:s.compatibility_flags??[],
    usage_model:s.usage_model??null,
    tags:s.tags??[],
    tail_consumers:s.tail_consumers??[],
    logpush:s.logpush??false,
    bindings:safeBindings(s.bindings||[])
  };
}
function functionalVersion(v={}){
  return {
    main_module:v.main_module??null,
    compatibility_date:v.compatibility_date??null,
    compatibility_flags:v.compatibility_flags??[],
    usage_model:v.usage_model??null,
    placement:v.placement??{},
    bindings:safeBindings(v.bindings||[]),
    assets:v.assets??null
  };
}
function moduleManifest(version){
  return version.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
}
async function publicBytes(path,type){
  const url=new URL(path,origin);url.searchParams.set('signalDetailFix',`${report.run}-${Date.now()}-${Math.random()}`);
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(response.ok,`PUBLIC_HTTP:${path}:${response.status}`);
  if(type)assert((response.headers.get('content-type')||'').includes(type),`PUBLIC_TYPE:${path}:${response.headers.get('content-type')}`);
  return {bytes:Buffer.from(await response.arrayBuffer()),headers:Object.fromEntries(response.headers)};
}
async function backend(){
  const out={};
  for(const [name,path] of [['engine','/api/engine/health'],['market','/api/full-market/health'],['statistics','/api/engine/statistics']]){
    const {bytes}=await publicBytes(path,'json');const json=JSON.parse(bytes.toString());
    assert(json.ok===true,`BACKEND_NOT_OK:${name}`);
    out[name]=name==='statistics'?json.settlementRevision:json.version;
    assert(out[name]!==undefined,`BACKEND_REVISION_MISSING:${name}`);
  }
  return out;
}

let base,mainModule,expectedManifest,baselineVersionConfig,baselineSettingsConfig;
async function owned(id){
  const v=await getVersion(id);
  return v.main_module===mainModule&&canonical(moduleManifest(v))===canonical(expectedManifest)&&canonical(functionalVersion(v))===canonical(baselineVersionConfig);
}
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return;}
  if(!expectedManifest||!await owned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return;}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Signal Detail persistence ${report.run}`}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

try{
  base=await activeVersion();report.baseVersion=base;
  const version=await getVersion(base);mainModule=version.main_module;
  baselineVersionConfig=functionalVersion(version);
  report.versionConfigBeforeSha=sha(canonical(baselineVersionConfig));
  const settingsBefore=await api(`/scripts/${script}/settings`);
  baselineSettingsConfig=functionalSettings(settingsBefore);
  report.functionalSettingsBeforeSha=sha(canonical(baselineSettingsConfig));
  report.annotationBeforeSha=sha(canonical(settingsBefore.annotations??{}));
  const main=version.modules.find(m=>m.name===mainModule);assert(main?.content_base64,'MAIN_MODULE_MISSING');
  const source=Buffer.from(main.content_base64,'base64').toString('utf8');
  report.backendBefore=await backend();
  const targetBefore=await publicBytes(route,'javascript');const targetText=targetBefore.bytes.toString('utf8');
  report.targetBeforeSha=sha(targetBefore.bytes);

  if(source.includes(marker)){
    assert.equal(count(targetText,beforeSelector),0,'MARKER_PRESENT_BUT_OLD_PUBLIC_SELECTOR_STILL_PRESENT');
    assert.equal(count(targetText,afterSelector),1,'MARKER_PRESENT_BUT_FIXED_PUBLIC_SELECTOR_MISSING');
    report.result='ALREADY_FIXED';report.finalVersion=base;report.completedAt=new Date().toISOString();save();
    console.log(`ALREADY_FIXED_PRODUCTION=${base}`);process.exit(0);
  }

  assert.equal(count(targetText,beforeSelector),1,'TARGET_OLD_SELECTOR_COUNT_CHANGED_STOP');
  assert.equal(count(targetText,afterSelector),0,'TARGET_ALREADY_HAS_NEW_SELECTOR_WITHOUT_MARKER_STOP');
  assert.equal(count(source,exportAnchor),1,'FINAL_EXPORT_ANCHOR_COUNT_CHANGED_STOP');
  assert.equal(count(source,routeAnchor),1,'ROUTE_ANCHOR_COUNT_CHANGED_STOP');

  const protectedPaths=['/index.html','/dashboard-v2-stage3.js','/odds-format-343.js','/signal.js','/statistics.js','/singlepage-workspace-343.js','/dashboard-v2-tune.css','/about.html','/privacy.html','/terms.html'];
  const protectedBefore={};for(const path of protectedPaths)protectedBefore[path]=sha((await publicBytes(path)).bytes);report.protectedBefore=protectedBefore;

  const helper=`\n/* ${marker}: response-only patch for legacy static ui-sync selector. Static asset collection is not replaced. */\nasync function __b46SignalDetailPersist(request,env){\n  const response=await env.ASSETS.fetch(request);\n  if(!response.ok)return response;\n  const source=await response.text();\n  const before=${JSON.stringify(beforeSelector)};\n  const after=${JSON.stringify(afterSelector)};\n  const hits=source.split(before).length-1;\n  const body=hits===1?source.replace(before,after):source;\n  const headers=new Headers(response.headers);\n  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');\n  headers.set('pragma','no-cache');\n  headers.set('expires','0');\n  headers.set('x-ball46-signal-detail-persist','${marker}');\n  headers.set('x-ball46-signal-detail-source',hits===1?'patched':'source-mismatch');\n  headers.delete('content-length');\n  return new Response(body,{status:response.status,statusText:response.statusText,headers});\n}\n`;
  let afterSource=source.replace(exportAnchor,helper+exportAnchor);
  afterSource=afterSource.replace(routeAnchor,routeAnchor+"if(url.pathname==='/ui-sync-fixes-343-v2.js')return __b46SignalDetailPersist(request,env);");
  assert(afterSource.includes(marker),'PATCH_MARKER_MISSING');
  assert.equal(count(afterSource,'__b46SignalDetailPersist(request,env)'),2,'PATCH_HELPER_REFERENCE_COUNT_BAD');
  assert.notEqual(sha(afterSource),sha(source),'MAIN_MODULE_NOT_CHANGED');

  const expectedPublic=targetText.replace(beforeSelector,afterSelector);
  report.expectedTargetAfterSha=sha(expectedPublic);report.mainBeforeSha=sha(source);report.mainAfterSha=sha(afterSource);
  writeFileSync('audit/target-before.js',targetText);writeFileSync('audit/target-expected-after.js',expectedPublic);writeFileSync('audit/main-after.mjs',afterSource);
  expectedManifest=moduleManifest(version).map(m=>m.name===mainModule?{...m,sha:sha(afterSource)}:m);
  save();

  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_COMMIT_STOP');
  assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),report.functionalSettingsBeforeSha,'FUNCTIONAL_SETTINGS_CHANGED_BEFORE_DEPLOY_STOP');
  assert.equal(sha(canonical(functionalVersion(await getVersion(base)))),report.versionConfigBeforeSha,'BASE_VERSION_CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
  assert.equal(sha((await publicBytes(route,'javascript')).bytes),report.targetBeforeSha,'TARGET_ASSET_CHANGED_BEFORE_DEPLOY_STOP');

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('PREVIEW_SUCCESS_NO_DEPLOY');process.exit(0);}

  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify({main_module:mainModule})],{type:'application/json'}));
  for(const module of version.modules){const bytes=module.name===mainModule?Buffer.from(afterSource):Buffer.from(module.content_base64,'base64');form.set(module.name,new Blob([bytes],{type:module.content_type}),module.name);}

  try{
    await api(`/scripts/${script}/content`,{method:'PUT',body:form});
    let candidate;
    for(let attempt=0;attempt<30;attempt++){
      const now=await activeVersion();
      if(now!==base){assert(await owned(now),'FOREIGN_OR_CONFIG_CHANGED_ACTIVE_VERSION_STOP');candidate=now;break;}
      await delay(1000);
    }
    assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');report.candidateVersion=candidate;save();

    let targetAfter,patched=false;
    for(let attempt=0;attempt<20;attempt++){
      targetAfter=await publicBytes(route,'javascript');
      if(sha(targetAfter.bytes)===report.expectedTargetAfterSha&&targetAfter.headers['x-ball46-signal-detail-source']==='patched'){patched=true;break;}
      await delay(1000);
    }
    assert(patched,'PUBLIC_SIGNAL_DETAIL_PATCH_NOT_VISIBLE');
    const targetAfterText=targetAfter.bytes.toString('utf8');
    assert.equal(count(targetAfterText,beforeSelector),0,'OLD_SELECTOR_STILL_PUBLIC');
    assert.equal(count(targetAfterText,afterSelector),1,'NEW_SELECTOR_NOT_PUBLIC_ONCE');
    assert.equal(targetAfter.headers['x-ball46-signal-detail-persist'],marker,'PATCH_HEADER_MISSING');

    for(const [path,expected] of Object.entries(protectedBefore))assert.equal(sha((await publicBytes(path)).bytes),expected,`UNRELATED_PUBLIC_FILE_CHANGED:${path}`);
    report.backendAfter=await backend();assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_REVISION_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);
    report.functionalSettingsAfterSha=sha(canonical(functionalSettings(settingsAfter)));
    report.annotationAfterSha=sha(canonical(settingsAfter.annotations??{}));
    assert.equal(report.functionalSettingsAfterSha,report.functionalSettingsBeforeSha,'FUNCTIONAL_SETTINGS_CHANGED_AFTER_DEPLOY_STOP');
    const candidateVersion=await getVersion(candidate);report.versionConfigAfterSha=sha(canonical(functionalVersion(candidateVersion)));
    assert.equal(report.versionConfigAfterSha,report.versionConfigBeforeSha,'VERSION_CONFIG_CHANGED_AFTER_DEPLOY_STOP');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');assert(await owned(candidate),'FINAL_OWNERSHIP_OR_CONFIG_CHANGED_STOP');

    report.finalVersion=candidate;report.result='SUCCESS';report.targetAfterSha=sha(targetAfter.bytes);report.staticAssetsReplaced=false;report.backendAndFunctionalConfigUnchanged=true;report.annotationMetadataMayChange=true;report.completedAt=new Date().toISOString();save();
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Signal Detail persistence\n\nResult: SUCCESS\n\nBase: ${base}\n\nFinal: ${candidate}\n\nStatic assets replaced: no\n\nFunctional config unchanged: yes\n`);
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log('SIGNAL_DETAIL_PERSIST_DEPLOY_SUCCESS');
  }catch(error){
    report.deployError=error.message;
    try{await rollback();}catch(rollbackError){report.rollbackError=rollbackError.message;}
    throw error;
  }
}catch(error){
  report.result='FAIL_STOPPED';report.error=error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack);process.exitCode=1;
}
