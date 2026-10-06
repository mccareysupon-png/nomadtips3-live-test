import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const BRANCH='work/ball46-hide-total-picks-20261006';
const STYLE_ID='b46-hide-total-picks-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Hide the two TOTAL PICKS labels/values in Performance Card only. No data-path, totals, engine, statistics, signals, worker source, bindings or schedules changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patch(html){
  assert.equal((html.match(/TOTAL PICKS/g)||[]).length,2,'TOTAL_PICKS_COUNT_NOT_TWO');
  assert(html.includes('class="b46-perf-total"'),'TOTAL_PICKS_CLASS_MISSING');
  assert(!html.includes(`id="${STYLE_ID}"`),'HIDE_STYLE_ALREADY_PRESENT');
  const anchor='<script id="b46-daily-performance-runtime">';
  const pos=html.indexOf(anchor);
  assert(pos>=0,'PERFORMANCE_RUNTIME_MISSING');
  const style=`<style id="${STYLE_ID}">#ball46-daily-performance .b46-perf-total{display:none!important}</style>\n`;
  return html.slice(0,pos)+style+html.slice(pos);
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback hide TOTAL PICKS ${report.run}`}})});
  for(let i=0;i<20;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.rollbackVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html'),before=beforeBytes.toString('utf8');report.indexBeforeSha=sha(beforeBytes);writeFileSync('audit/index-before.html',beforeBytes);
  const after=patch(before),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);assert.notEqual(afterSha,report.indexBeforeSha,'INDEX_UNCHANGED');report.indexAfterSha=afterSha;writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('ROLLBACK_VERSION='+base);console.log('BALL46_HIDE_TOTAL_PICKS_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');try{const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes(STYLE_ID)&&(t.match(/TOTAL PICKS/g)||[]).length===2){directOk=true;break}}catch{}await delay(1000)}assert(directOk,'HIDE_TOTAL_PICKS_NOT_DIRECT_PRODUCTION');
    let publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/index.html','html'),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes(STYLE_ID)){publicOk=true;break}}catch{}await delay(1200)}assert(publicOk,'HIDE_TOTAL_PICKS_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.workerSourceUntouched=true;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('INDEX_SHA='+afterSha);console.log('BALL46_HIDE_TOTAL_PICKS_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}