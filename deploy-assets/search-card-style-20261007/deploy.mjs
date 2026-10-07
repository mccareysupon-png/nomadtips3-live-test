import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const EXPECTED_BASE='c653bdb9-d700-4aee-ad4c-2c90fd00e365';
const BRANCH='work/ball46-search-card-style-20261007';
const TARGET='index.html';
const EXPECTED_SHA='8b44bb1c3bc2c7467f68eb66adb68c73f440ec7c81f8ad95ccfa6820d66dd1d4';
const MARK='B46_SEARCH_CARD_INTER_DARK_20261007';
const deployEnabled=process.env.DEPLOY_ENABLED==='true';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Search card presentation only: load Inter for the search input, hide the idle placeholder so only the existing magnifying-glass icon remains, and use a near-black gray search-card background. Search behavior, board data, Engine, Statistics, EventFlow, Worker source and all unrelated assets remain unchanged.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function patchIndex(before){
  assert.equal(sha(before),EXPECTED_SHA,'CURRENT_INDEX_SHA_CHANGED');
  assert(!before.includes(MARK),'PATCH_ALREADY_PRESENT');
  assert(before.includes('<input type="search" data-search placeholder="Search teams or leagues…" autocomplete="off">'),'CURRENT_SEARCH_INPUT_CHANGED');
  assert(before.includes('<label class="search-box"><span>⌕</span>'),'CURRENT_SEARCH_ICON_CHANGED');
  assert(before.includes('</head>'),'HEAD_CLOSE_MISSING');

  const block=`
<!-- ${MARK} START -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body .workspace.singlepage .workspace-stable-toolbar-host .search-box,
body .workspace.singlepage .workspace-stable-toolbar-host .search-box:focus-within{
  background:#222426!important;
  border-color:#34383c!important;
  box-shadow:none!important;
}
body .workspace.singlepage .workspace-stable-toolbar-host .search-box>span{
  color:#f2f4f5!important;
  font-size:18px!important;
}
body .workspace.singlepage .workspace-stable-toolbar-host .search-box input{
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
  font-weight:500!important;
  color:#f5f6f7!important;
  caret-color:#f5f6f7!important;
}
body .workspace.singlepage .workspace-stable-toolbar-host .search-box input::placeholder{
  color:transparent!important;
  opacity:0!important;
}
</style>
<!-- ${MARK} END -->
`;
  const after=before.replace('</head>',block+'</head>');
  assert(after.includes("font-family:'Inter'"),'INTER_FONT_MISSING');
  assert(after.includes('background:#222426!important'),'DARK_GRAY_MISSING');
  assert(after.includes('input::placeholder'),'PLACEHOLDER_RULE_MISSING');
  assert(after.includes('color:transparent!important'),'PLACEHOLDER_NOT_HIDDEN');
  assert.equal((after.match(new RegExp(MARK,'g'))||[]).length,2,'MARKER_COUNT_BAD');
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
      annotations:{'workers/message':'Rollback Ball46 search-card style '+report.run}
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
  assert.equal(sha(beforeBytes),EXPECTED_SHA,'PUBLIC_INDEX_SHA_MOVED');
  writeFileSync('audit/'+TARGET+'.before',beforeBytes);

  const after=patchIndex(before);
  const patched=Buffer.from(after);
  report.beforeSha=sha(beforeBytes);
  report.afterSha=sha(patched);
  writeFileSync('audit/'+TARGET+'.after',patched);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],EXPECTED_SHA,'STAGED_INDEX_NOT_CURRENT');
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
    console.log('BALL46_SEARCH_CARD_STYLE_PREFLIGHT_PASS');
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
    assert(directOk,'PATCHED_INDEX_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const got=await publicFile('/'+TARGET);
        const txt=got.toString('utf8');
        if(sha(got)===report.afterSha&&txt.includes(MARK)&&txt.includes("font-family:'Inter'")&&txt.includes('background:#222426!important')&&txt.includes('input::placeholder')){publicOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(publicOk,'PATCHED_INDEX_NOT_PUBLIC');

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
    report.unrelatedStaticAssetsUntouched=true;
    report.changedAssets=[TARGET];
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+EXPECTED_BASE);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+report.afterSha);
    console.log('BALL46_SEARCH_CARD_STYLE_SUCCESS');
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
