import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const EXPECTED_BASE='d8246eb6-4dbb-4a47-8c01-b9a3e89e2017';
const BRANCH='work/ball46-match-status-inter-110-20261007';
const TARGET='index.html';
const EXPECTED_SHA='0cf80c92cff99d5da49d9962d7da5a4dde7885ebf86ec320f32e62e051d4bff9';
const MARK='B46_MATCH_STATUS_INTER_110_20261007';
const deployEnabled=process.env.DEPLOY_ENABLED==='true';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Desktop MATCH STATUS typography only: Inter font for MATCH STATUS heading, All matches, Live, Signal, Upcoming, Waiting, Finished and their counts; each existing desktop font size increased exactly 10%. Mobile, Statistics, stable header, search, Engine, EventFlow and all unrelated assets untouched.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function patchIndex(before){
  assert.equal(sha(before),EXPECTED_SHA,'CURRENT_INDEX_SHA_CHANGED');
  assert(!before.includes(MARK),'PATCH_ALREADY_PRESENT');
  assert(before.includes('<div class="rail-title">MATCH STATUS</div>'),'MATCH_STATUS_DOM_CHANGED');
  assert(before.includes('data-status-filter="all"'),'STATUS_FILTER_DOM_CHANGED');
  assert(before.includes('data-workspace-view="signal"'),'SIGNAL_DOM_CHANGED');
  const oldFont='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  const newFont='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
  assert(before.includes(oldFont),'INTER_LINK_CHANGED');
  let after=before.replace(oldFont,newFont);
  const block=`
<!-- ${MARK} START -->
<style>
@media (min-width:761px){
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > .rail-title{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:9.9px!important;
  }
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-status-filter]{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:12.1px!important;
  }
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-status-filter] > b{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:9.9px!important;
  }
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-workspace-view="signal"]{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:11px!important;
  }
  body .workspace.singlepage > .left-rail > .rail-card:has(> button[data-status-filter]) > button[data-workspace-view="signal"] > b{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif!important;
    font-size:8.8px!important;
  }
}
</style>
<!-- ${MARK} END -->
`;
  assert(after.includes('</head>'),'HEAD_CLOSE_MISSING');
  after=after.replace('</head>',block+'</head>');
  for(const sig of ['font-size:9.9px!important','font-size:12.1px!important','font-size:11px!important','font-size:8.8px!important',':has(> button[data-status-filter])']) assert(after.includes(sig),'PATCH_SIGNATURE_MISSING_'+sig);
  assert.equal((after.match(new RegExp(MARK,'g'))||[]).length,2,'MARKER_COUNT_BAD');
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Ball46 MATCH STATUS typography '+report.run}})});
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

  const after=patchIndex(before),patched=Buffer.from(after);
  report.beforeSha=sha(beforeBytes); report.afterSha=sha(patched);
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
    report.result='PREFLIGHT_SUCCESS_NO_DEPLOY';report.finalVersion=EXPECTED_BASE;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_MATCH_STATUS_INTER_110_PREFLIGHT_PASS');process.exit(0);
  }

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==EXPECTED_BASE){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<80;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');try{const got=await publicFile('/'+TARGET,undefined,directOrigin);if(sha(got)===report.afterSha){directOk=true;break}}catch{}await delay(1500)}
    assert(directOk,'PATCHED_INDEX_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const got=await publicFile('/'+TARGET),txt=got.toString('utf8');if(sha(got)===report.afterSha&&txt.includes(MARK)&&txt.includes('font-size:12.1px!important')&&txt.includes('font-size:8.8px!important')&&txt.includes('Inter:wght@400;500;600;700;800;900')){publicOk=true;break}}catch{}await delay(1500)}
    assert(publicOk,'PATCHED_INDEX_NOT_PUBLIC');

    const changed={};
    for(const [path,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+path));if(got!==h)changed[path]={expected:h,got}}
    assert.equal(Object.keys(changed).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(changed));

    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1&limit=1'].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),report.workerSourceShaBefore,'WORKER_SOURCE_CHANGED');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;report.backendUntouched=true;report.workerSourceUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.changedAssets=[TARGET];report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+EXPECTED_BASE);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+report.afterSha);
    console.log('BALL46_MATCH_STATUS_INTER_110_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
