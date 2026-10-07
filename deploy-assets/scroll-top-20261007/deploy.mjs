import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const EXPECTED_BASE='4996cd2c-988a-449f-8791-60a385e1b1b1';
const BRANCH='work/ball46-scroll-top-current-20261007';
const TARGET='singlepage-workspace-343.js';
const EXPECTED_SHA='4714763ec74b4e619ca82603763248d60600caa19a23ec55d90b98efe11331d9';
const MARK='BALL46_NAV_SCROLL_TOP_20261007';
const deployEnabled=process.env.DEPLOY_ENABLED==='true';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Reset window scroll to top only on explicit Ball46 workspace navigation clicks (MATCH STATUS, workspace views, Statistics market menus, Signal market menus). Preserve polling/data refresh behavior, Engine, Statistics calculation, EventFlow, bindings, schedules, Worker source and every unrelated static asset.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function replaceOnce(text,from,to,label){
  const i=text.indexOf(from);
  assert(i>=0,label+'_MISSING');
  assert.equal(text.indexOf(from,i+1),-1,label+'_DUPLICATE');
  return text.slice(0,i)+to+text.slice(i+from.length);
}

function patchNavigation(before){
  assert.equal(sha(before),EXPECTED_SHA,'CURRENT_NAV_ASSET_SHA_CHANGED');
  assert(!before.includes(MARK),'PATCH_ALREADY_PRESENT');
  assert(!before.includes('window.scrollTo('),'PREEXISTING_SCROLL_RESET_UNEXPECTED');

  const from="function bindNavigation(){  $$('[data-workspace-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.workspaceView)));  $$('[data-stat-market]').forEach(b=>b.addEventListener('click',()=>setView('statistics',{market:b.dataset.statMarket})));  $$('[data-signal-market]').forEach(b=>b.addEventListener('click',()=>{state.signalMarket=b.dataset.signalMarket||'all';writeRoute();dispatchSignalMarket()}));  $$('[data-status-filter]').forEach(b=>b.addEventListener('click',()=>{setView('live',{push:false});writeRoute({status:b.dataset.statusFilter||'all'})}));";
  const to="/* "+MARK+" */ function navigationTop(){window.scrollTo({top:0,left:0,behavior:'auto'})} function bindNavigation(){  $$('[data-workspace-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.workspaceView);navigationTop()}));  $$('[data-stat-market]').forEach(b=>b.addEventListener('click',()=>{setView('statistics',{market:b.dataset.statMarket});navigationTop()}));  $$('[data-signal-market]').forEach(b=>b.addEventListener('click',()=>{state.signalMarket=b.dataset.signalMarket||'all';writeRoute();dispatchSignalMarket();navigationTop()}));  $$('[data-status-filter]').forEach(b=>b.addEventListener('click',()=>{setView('live',{push:false});writeRoute({status:b.dataset.statusFilter||'all'});navigationTop()}));";
  const after=replaceOnce(before,from,to,'NAV_BINDING');
  assert(after.includes(MARK),'MARKER_MISSING');
  assert(after.includes("function navigationTop(){window.scrollTo({top:0,left:0,behavior:'auto'})}"),'SCROLL_HELPER_BAD');
  assert(after.includes("setView(b.dataset.workspaceView);navigationTop()"),'WORKSPACE_VIEW_SCROLL_MISSING');
  assert(after.includes("setView('statistics',{market:b.dataset.statMarket});navigationTop()"),'STAT_MARKET_SCROLL_MISSING');
  assert(after.includes("dispatchSignalMarket();navigationTop()"),'SIGNAL_MARKET_SCROLL_MISSING');
  assert(after.includes("writeRoute({status:b.dataset.statusFilter||'all'});navigationTop()"),'STATUS_SCROLL_MISSING');
  assert(after.includes("window.addEventListener('popstate'"),'POPSTATE_HANDLER_LOST');
  assert.equal((after.match(new RegExp(MARK,'g'))||[]).length,1,'MARKER_COUNT_BAD');
  parse(after,{ecmaVersion:'latest',sourceType:'script'});
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api('/scripts/'+script+'/deployments',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:current.restore.version,percentage:100}],
      annotations:{'workers/message':'Rollback Ball46 navigation scroll-top '+report.run}
    })
  });
  for(let i=0;i<30;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();
  assert.equal(current.restore.version,EXPECTED_BASE,'PRODUCTION_MOVED_STOP');
  report.baseVersion=current.restore.version;
  report.rollbackVersion=current.restore.version;
  report.backendBefore=current.restore.backend;
  report.workerSourceShaBefore=sha(Buffer.from(current.source));

  const settingsBefore=await api('/scripts/'+script+'/settings');
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();
  const beforeBytes=await publicFile('/'+TARGET);
  const before=beforeBytes.toString('utf8');
  assert.equal(sha(beforeBytes),EXPECTED_SHA,'PUBLIC_TARGET_SHA_MOVED');
  writeFileSync('audit/'+TARGET+'.before',beforeBytes);

  const after=patchNavigation(before);
  const patched=Buffer.from(after);
  report.beforeSha=sha(beforeBytes);
  report.afterSha=sha(patched);
  assert.notEqual(report.afterSha,report.beforeSha,'TARGET_UNCHANGED');
  writeFileSync('audit/'+TARGET+'.after',patched);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],EXPECTED_SHA,'STAGED_TARGET_NOT_CURRENT');

  const protectedAssets={...staged.hashes};
  delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),patched);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),report.afterSha,'STAGED_PATCH_SHA_BAD');
  report.protectedAssetCount=Object.keys(protectedAssets).length;
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),EXPECTED_BASE,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deployEnabled){
    report.result='PREFLIGHT_SUCCESS_NO_DEPLOY';
    report.finalVersion=EXPECTED_BASE;
    report.completedAt=new Date().toISOString();
    save();
    console.log('BALL46_SCROLL_TOP_PREFLIGHT_PASS');
    process.exit(0);
  }

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){
      const a=await activeVersion();
      if(a!==EXPECTED_BASE){candidate=a;break}
      await delay(1200);
    }
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{
        const got=await publicFile('/'+TARGET,undefined,directOrigin);
        if(sha(got)===report.afterSha){directOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(directOk,'PATCHED_NAV_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const got=await publicFile('/'+TARGET);
        const text=got.toString('utf8');
        if(sha(got)===report.afterSha&&text.includes(MARK)&&text.includes("window.scrollTo({top:0,left:0,behavior:'auto'})")){publicOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(publicOk,'PATCHED_NAV_NOT_PUBLIC');

    const changed={};
    for(const [path,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+path));
      if(got!==h)changed[path]={expected:h,got};
    }
    assert.equal(Object.keys(changed).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(changed));

    const [boardJson,signalsJson,statsJson]=await Promise.all([
      '/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1&limit=1'
    ].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,statisticsRows:statsJson.rows.length,pending:statsJson.pending};

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);
    assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64');
    assert.equal(sha(finalSource),report.workerSourceShaBefore,'WORKER_SOURCE_CHANGED');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;
    report.backendUntouched=true;
    report.workerSourceUntouched=true;
    report.settingsUntouched=true;
    report.cronsUntouched=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.changedAssets=[TARGET];
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+EXPECTED_BASE);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('TARGET_SHA='+report.afterSha);
    console.log('BALL46_SCROLL_TOP_SUCCESS');
  }catch(e){
    report.error=e.message;
    try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}
    throw e;
  }
}catch(e){
  report.result='FAIL_STOPPED';
  report.error=e.message;
  report.completedAt=new Date().toISOString();
  save();
  console.error(e.stack);
  process.exitCode=1;
}
