import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const EXPECTED_BASE='dd6fe8db-a650-49f8-b903-433dcd86ac6e';
const BRANCH='work/ball46-allmatches-normal-template-20261007';
const TARGET='index.html';
const EXPECTED_SHA='6c72a80c5b8fbdc60ca80dfdbdc321097ed5b0956e8fc0d56d3862bd81dcfb63';
const MARK='B46_ALLMATCHES_TYPOGRAPHY_TEMPLATE_20261007';
const deployEnabled=process.env.DEPLOY_ENABLED==='true';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Desktop MATCH STATUS All matches typography template only. Lock All matches label to Inter 12.1px/500 and its count to Inter 9.9px/500 so normal, hover and active keep identical typography. Existing hover/active colors and state behavior remain untouched. No other MATCH STATUS row, mobile, Statistics, search, Engine or EventFlow changes.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function patchIndex(before){
  assert.equal(sha(before),EXPECTED_SHA,'CURRENT_INDEX_SHA_CHANGED');
  assert(before.includes('data-status-filter="all"'),'ALL_MATCHES_DOM_MISSING');
  assert(before.includes('B46_MATCH_STATUS_ALLMATCHES_INTER_110_20261007'),'PRIOR_ALL_MATCHES_PATCH_MISSING');
  assert(before.includes("Inter:wght@400;500;600;700;800;900"),'INTER_WEIGHT_LINK_MISSING');
  assert(!before.includes(MARK),'PATCH_ALREADY_PRESENT');
  assert(before.includes('</head>'),'HEAD_CLOSE_MISSING');

  const block=`
<!-- ${MARK} START -->
<style>
@media (min-width:761px){
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-status-filter="all"] > span{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:12.1px!important;
    font-weight:500!important;
  }
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-status-filter="all"] > b{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:9.9px!important;
    font-weight:500!important;
  }
}
</style>
<!-- ${MARK} END -->
`;

  const after=before.replace('</head>',block+'</head>');
  assert(after.includes('button[data-status-filter="all"] > span'),'ALL_LABEL_RULE_MISSING');
  assert(after.includes('font-size:12.1px!important'),'ALL_LABEL_SIZE_MISSING');
  assert(after.includes('font-size:9.9px!important'),'ALL_COUNT_SIZE_MISSING');
  assert((after.match(/font-weight:500!important/g)||[]).length>=2,'FONT_WEIGHT_LOCK_MISSING');
  assert.equal((after.match(new RegExp(MARK,'g'))||[]).length,2,'MARKER_COUNT_BAD');
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api('/scripts/'+script+'/deployments',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:current.restore.version,percentage:100}],
      annotations:{'workers/message':'Rollback Ball46 All matches typography template '+report.run}
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
  assert.equal(sha(beforeBytes),EXPECTED_SHA,'PUBLIC_INDEX_SHA_MOVED');
  const before=beforeBytes.toString('utf8');
  writeFileSync('audit/'+TARGET+'.before',beforeBytes);

  const after=patchIndex(before);
  const patched=Buffer.from(after);
  report.beforeSha=sha(beforeBytes);
  report.afterSha=sha(patched);
  writeFileSync('audit/'+TARGET+'.after',patched);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],EXPECTED_SHA,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes}; delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),patched);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),report.afterSha,'STAGED_PATCH_SHA_BAD');

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
    console.log('BALL46_ALLMATCHES_TEMPLATE_PREFLIGHT_PASS');
    process.exit(0);
  }

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==EXPECTED_BASE){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{const got=await publicFile('/'+TARGET,undefined,directOrigin);if(sha(got)===report.afterSha){directOk=true;break}}catch{}
      await delay(1500);
    }
    assert(directOk,'PATCHED_INDEX_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const got=await publicFile('/'+TARGET),txt=got.toString('utf8');
        if(sha(got)===report.afterSha&&txt.includes(MARK)&&txt.includes('button[data-status-filter="all"] > span')&&txt.includes('font-weight:500!important')){publicOk=true;break}
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
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),report.workerSourceShaBefore,'WORKER_SOURCE_CHANGED');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.backendUntouched=true;
    report.workerSourceUntouched=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.changedAssets=[TARGET];
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+EXPECTED_BASE);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+report.afterSha);
    console.log('BALL46_ALLMATCHES_TEMPLATE_SUCCESS');
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
