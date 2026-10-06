import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const BRANCH='fix/ball46-remove-flat-scan-20261006';
const MARK='B46_FLAT_RESULT_CARDS_20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),
scope:'Remove only the experimental flat-result-card style/runtime scanner that did not visibly affect cards and may repeatedly scan the main board. Preserve current Performance fast-window logic and all engine/statistics/signal/settlement state.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function strip(html){
  const styleRe=new RegExp(`\\n?<!-- ${MARK} STYLE START -->[\\s\\S]*?<!-- ${MARK} STYLE END -->\\n?`,'g');
  const scriptRe=new RegExp(`\\n?<!-- ${MARK} SCRIPT START -->[\\s\\S]*?<!-- ${MARK} SCRIPT END -->\\n?`,'g');
  assert(styleRe.test(html),'FLAT_STYLE_BLOCK_MISSING');
  styleRe.lastIndex=0;
  assert(scriptRe.test(html),'FLAT_SCRIPT_BLOCK_MISSING');
  styleRe.lastIndex=0;scriptRe.lastIndex=0;
  const after=html.replace(styleRe,'').replace(scriptRe,'');
  assert(!after.includes('b46-flat-result-cards-runtime'),'FLAT_RUNTIME_STILL_PRESENT');
  assert(!after.includes('b46-flat-result-cards-style'),'FLAT_STYLE_STILL_PRESENT');
  assert(after.includes('PERFORMANCE_WINDOW_NOT_COVERED'),'PERFORMANCE_FAST_WINDOW_MISSING');
  assert(after.includes('b46-daily-performance-runtime'),'PERFORMANCE_RUNTIME_MISSING');
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback remove flat scanner ${report.run}`}})});
  for(let i=0;i<20;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;report.rollbackVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html');
  const before=beforeBytes.toString('utf8');
  report.indexBeforeSha=sha(beforeBytes);
  assert(before.includes('b46-flat-result-cards-runtime'),'CURRENT_FLAT_RUNTIME_NOT_FOUND');
  assert(before.includes('PERFORMANCE_WINDOW_NOT_COVERED'),'CURRENT_FAST_WINDOW_NOT_FOUND');
  writeFileSync('audit/index-before.html',beforeBytes);

  const after=strip(before);
  const afterBytes=Buffer.from(after);
  const afterSha=sha(afterBytes);
  assert.notEqual(afterSha,report.indexBeforeSha,'INDEX_UNCHANGED');
  report.indexAfterSha=afterSha;
  writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  report.protectedAssetCount=Object.keys(protectedAssets).length;
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('BALL46_REMOVE_FLAT_SCAN_PREVIEW_PASS');process.exit(0)
  }

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{
        const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');
        if(sha(b)===afterSha&&!t.includes('b46-flat-result-cards-runtime')&&t.includes('PERFORMANCE_WINDOW_NOT_COVERED')){directOk=true;break}
      }catch{}
      await delay(1000);
    }
    assert(directOk,'REMOVE_FLAT_SCAN_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const b=await publicFile('/index.html','html'),t=b.toString('utf8');
        if(sha(b)===afterSha&&!t.includes('b46-flat-result-cards-runtime')&&t.includes('PERFORMANCE_WINDOW_NOT_COVERED')){publicOk=true;break}
      }catch{}
      await delay(1200);
    }
    assert(publicOk,'REMOVE_FLAT_SCAN_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const [boardJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/statistics?paged=1'].map(async p=>JSON.parse((await publicFile(p,'json')).toString?.()||'{}')));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.result='SUCCESS';report.workerSourceUntouched=true;report.engineUntouched=true;report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('INDEX_SHA='+afterSha);console.log('BALL46_REMOVE_FLAT_SCAN_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}