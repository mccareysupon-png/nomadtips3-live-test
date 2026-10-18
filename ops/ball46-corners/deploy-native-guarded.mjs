import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchNative} from './patch-native.mjs';

/**
 * BALL46 5USD / verified Corners ONLY. Explicitly approved Production deploy.
 * Abort on version/hash drift; never deploy the independent Goaloo sidecar.
 */
const WORKER='nomadtips3-engine-343';
const EXPECTED_VERSION='9b363777-64fc-4a48-a10a-0fad822640cb';
const EXPECTED_OLD_HASH='97b814f6955951d07aabbc13bcf33828b30b27c22b2dd1402b2849655c46e940';
const EXPECTED_NEW_HASH='1008c06d4ab705f904b49408fd4e5c347478afae633a499147f3106dfffd2b69';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const workerUrl='https://nomadtips3-engine-343.mccarey-supon.workers.dev';
const bridgeUrl='https://www.ball46.com/api/engine/bridge-health';
const sha=x=>createHash('sha256').update(x).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const normalize=x=>JSON.stringify(x,(key,value)=>key==='annotations'?undefined:
  value&&typeof value==='object'&&!Array.isArray(value)?
  Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
mkdirSync('ops/ball46-corners/deployment-evidence',{recursive:true});
const evidence=(name,x)=>writeFileSync('ops/ball46-corners/deployment-evidence/'+name,JSON.stringify(x,null,2));
const log=(name,x)=>console.log(name+' '+JSON.stringify(x));

async function api(path,opts={}){
  assert(account&&token,'CLOUDFLARE_CREDENTIALS_MISSING');
  const r=await fetch(root+path,{...opts,
    headers:{authorization:'Bearer '+token,...(opts.headers||{})},
    signal:AbortSignal.timeout(30000)});
  const j=await r.json().catch(()=>null);
  if(!r.ok||j?.success!==true)throw Error('CF_API_ERROR_'+r.status+'_'+path+'_'+JSON.stringify(j?.errors||[]).slice(0,200));
  return j.result;
}
async function activeId(){
  const d=await api('/scripts/'+WORKER+'/deployments?per_page=1');
  const v=d.deployments?.[0]?.versions||[];
  assert(v.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_100_PERCENT');
  return v[0].version_id;
}
const version=id=>api('/workers/'+WORKER+'/versions/'+id+'?include=modules');
const settings=()=>api('/scripts/'+WORKER+'/settings');
const schedules=()=>api('/scripts/'+WORKER+'/schedules');
const bindingView=v=>normalize((v.bindings||[]).map(x=>({...x})).sort((a,b)=>a.name.localeCompare(b.name)));
const settingView=s=>normalize(Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations')));
async function publicHealth(url){
  const r=await fetch(url+'?deploy_check='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(18000)});
  const j=await r.json().catch(()=>null);
  assert(r.ok&&j?.ok===true,'PUBLIC_HEALTH_FAILED_'+r.status+'_'+url);
  return {
    version:j.version||null,component:j.component||null,
    statisticsLedgerVersion:j.statisticsLedgerVersion||null,
    workingStoreVersion:j.workingStoreVersion||null,
    finalReconcileVersion:j.finalReconcileVersion||null
  };
}
async function activate(id,message){
  return api('/scripts/'+WORKER+'/deployments',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],
      annotations:{'workers/message':message}})
  });
}
async function waitActive(id){
  for(let i=0;i<12;i++){
    if(await activeId()===id)return;
    await delay(2500);
  }
  throw Error('DEPLOYMENT_NOT_ACTIVE');
}
let prior=null,candidate=null,activated=false;
try {
  execFileSync(process.execPath,['--test','ops/ball46-corners/patch-native.test.mjs'],{stdio:'inherit'});
  prior=await activeId();
  assert.equal(prior,EXPECTED_VERSION,'PRODUCTION_VERSION_CHANGED_STOP');
  const [before, beforeSettings,beforeSchedules,beforeEngine,beforeBridge]=await Promise.all([
    version(prior),settings(),schedules(),publicHealth(workerUrl+'/health'),publicHealth(bridgeUrl)
  ]);
  assert(before.main_module==='index-bulk-recovery.js','UNKNOWN_PRODUCTION_ENTRYPOINT');
  const main=before.modules?.find(m=>m.name===before.main_module);
  assert(main?.content_base64,'ACTIVE_MODULE_NOT_AVAILABLE');
  const original=Buffer.from(main.content_base64,'base64').toString('utf8');
  assert.equal(sha(original),EXPECTED_OLD_HASH,'PRODUCTION_SOURCE_HASH_CHANGED_STOP');
  const modified=patchNative(original);
  assert.equal(sha(modified),EXPECTED_NEW_HASH,'TESTED_CANDIDATE_HASH_CHANGED_STOP');
  const local='ops/ball46-corners/deployment-evidence/candidate-check.mjs';
  writeFileSync(local,modified);
  execFileSync(process.execPath,['--check',local],{stdio:'inherit'});
  assert.equal(modified.split('B46_CORNERS_FAIR_QUEUE_AND_RECHECK_20261018').length-1,1,'PATCH_MULTIPLIED');
  for(const mark of [
    'BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2',
    'BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3',
    'FINAL_RECHECK_MAX_PER_SCAN = 3',
    'FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3',
    'signal-ledger-v2-longterm',
    'isVerifiedCornerMarket(sig?.market) && sig?.status === "UNRESOLVED"'
  ])assert(modified.includes(mark),'PATCH_VIOLATED_'+mark);
  evidence('preflight.json',{
    worker:WORKER,previousVersion:prior,oldHash:sha(original),candidateHash:sha(modified),
    originalBytes:original.length,candidateBytes:modified.length,unitTests:'PASS',syntax:'PASS',
    beforeEngine,beforeBridge,rollbackVersion:prior,whatChanges:[
      '5USD Corners fair verified history queue, maximum two requests per scan',
      'Corners UNRESOLVED 5USD native final-recheck eligibility'
    ],
    unchanged:['5USD provider','Goaloo','Multi-Source','other markets','rules','90-second price window','Ledger V2','routes']
  });
  log('CORNERS_DEPLOY_PREFLIGHT_PASS',{prior,hash:sha(modified),beforeEngine,beforeBridge});
  assert.equal(await activeId(),prior,'CONCURRENT_DEPLOY_STOP');
  const meta={
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags||[],
    bindings:(before.bindings||[]).map(b=>b.type==='secret_text'?
      {name:b.name,type:'inherit',version_id:'latest'}:{...b}),
    annotations:{'workers/message':'BALL46 verified 5USD Corners fair queue and native UNRESOLVED recovery ONLY',
      'workers/commit_sha':process.env.GITHUB_SHA||''}
  };
  for(const key of ['logpush','observability','limits','placement','tail_consumers'])
    if(beforeSettings[key]!=null)meta[key]=beforeSettings[key];
  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  for(const module of before.modules){
    const content=module.name===before.main_module?Buffer.from(modified):Buffer.from(module.content_base64,'base64');
    form.set(module.name,new Blob([content],{type:module.content_type}),module.name);
  }
  const upload=await api('/scripts/'+WORKER+'/versions?bindings_inherit=strict',{method:'POST',body:form});
  candidate=upload.id;
  assert(candidate,'NO_UPLOAD_CANDIDATE');
  const staged=await version(candidate);
  const stagedMain=staged.modules?.find(x=>x.name===staged.main_module);
  assert(stagedMain?.content_base64,'UPLOADED_MAIN_UNREADABLE');
  assert.equal(sha(Buffer.from(stagedMain.content_base64,'base64')),sha(modified),'UPLOADED_CODE_CHANGED');
  assert.equal(staged.main_module,before.main_module,'ENTRYPOINT_CHANGED');
  assert.equal(staged.modules.length,before.modules.length,'MODULE_COUNT_CHANGED');
  assert.equal(bindingView(staged),bindingView(before),'BINDINGS_CHANGED');
  assert.equal(staged.compatibility_date,before.compatibility_date,'COMPAT_DATE_CHANGED');
  assert.equal(await activeId(),prior,'ANOTHER_DEPLOY_INTERVENED_STOP');
  log('CORNERS_CANDIDATE_VERIFIED',{previous:prior,candidate,candidateSHA:sha(modified)});
  await activate(candidate,'Deploy isolated 5USD Corners fair queue and native result recovery');
  activated=true;
  await waitActive(candidate);
  const after=await version(candidate);
  const afterMain=after.modules.find(x=>x.name===after.main_module);
  assert.equal(sha(Buffer.from(afterMain.content_base64,'base64')),sha(modified),'LIVE_SOURCE_DIFFERS');
  assert.equal(bindingView(after),bindingView(before),'LIVE_BINDINGS_CHANGED');
  assert.equal(settingView(await settings()),settingView(beforeSettings),'LIVE_SETTINGS_CHANGED');
  assert.equal(normalize(await schedules()),normalize(beforeSchedules),'LIVE_SCHEDULES_CHANGED');
  const afterEngine=await publicHealth(workerUrl+'/health');
  const afterBridge=await publicHealth(bridgeUrl);
  assert.equal(afterEngine.version,beforeEngine.version,'ENGINE_VERSION_LABEL_CHANGED');
  assert.equal(normalize(afterBridge),normalize(beforeBridge),'PUBLIC_BRIDGE_CONTRACT_CHANGED');
  const success={deployed:true,worker:WORKER,previousVersion:prior,deployedVersion:candidate,
    oldSHA:sha(original),newSHA:sha(modified),unitTests:'PASS',syntax:'PASS',
    settingsUnchanged:true,bindingsUnchanged:true,cronsUnchanged:true,
    beforeEngine,afterEngine,beforeBridge,afterBridge,otherMarketsModified:false};
  evidence('success.json',success);
  log('BALL46_CORNERS_ONLY_DEPLOY_SUCCESS',success);
}catch(e){
  evidence('failure.json',{error:String(e?.message||e),previousVersion:prior,candidate,activated});
  console.error('BALL46_CORNERS_ONLY_DEPLOY_FAILED',e?.stack||String(e));
  if(activated&&candidate&&prior){
    try{
      if(await activeId()===candidate){
        await activate(prior,'Rollback ONLY new BALL46 5USD Corners patch after post-deploy failure');
        await waitActive(prior);
        evidence('rollback.json',{restoredVersion:prior,candidateRolledBack:candidate});
        log('BALL46_CORNERS_ROLLBACK_SUCCESS',{restoredVersion:prior});
      }else{
        console.error('ROLLBACK_SKIPPED_CONCURRENT_DEPLOY_DETECTED');
      }
    }catch(r){console.error('BALL46_CORNERS_ROLLBACK_FAILED',String(r?.message||r));}
  }
  process.exitCode=1;
}
