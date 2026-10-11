import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='color-semantics-343.js';
const INDEX='index.html';
const OLD_REF='color-semantics-343.js?v=343-color-semantics-20260922a';
const NEW_REF='color-semantics-343.js?v=343-color-semantics-stat-entry-preserve-20261011a';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Statistics Entry fix only: guard color-semantics Entry paintScore and cache-bust that exact script reference in index.html.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchColor(src){
  const old='paintScore(cells[6]);paintScore(cells[7]);';
  const neu='paintScore(cells[6]);if(!cells[7]?.querySelector(\'small\'))paintScore(cells[7]);';
  assert.equal(src.split(old).length-1,1,'WORKSPACE_STATS_SCORE_ANCHOR_COUNT');
  return src.replace(old,neu);
}
function patchIndex(src){
  assert.equal(src.split(OLD_REF).length-1,1,'COLOR_SCRIPT_REF_COUNT');
  return src.replace(OLD_REF,NEW_REF);
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback color semantics Entry fix '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  current=await inspect();
  const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings');
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();
  const colorBeforeBytes=await publicFile('/'+TARGET),colorBefore=colorBeforeBytes.toString('utf8');
  const indexBeforeBytes=await publicFile('/'+INDEX),indexBefore=indexBeforeBytes.toString('utf8');
  report.colorBeforeSha=sha(colorBeforeBytes);report.indexBeforeSha=sha(indexBeforeBytes);
  assert(colorBefore.includes('paintScore(cells[6]);paintScore(cells[7]);'),'EXPECTED_FLATTENING_LOGIC_MISSING');
  assert(indexBefore.includes(OLD_REF),'EXPECTED_COLOR_SCRIPT_REF_MISSING');
  const colorAfter=patchColor(colorBefore),colorAfterBytes=Buffer.from(colorAfter),colorAfterSha=sha(colorAfterBytes);
  const indexAfter=patchIndex(indexBefore),indexAfterBytes=Buffer.from(indexAfter),indexAfterSha=sha(indexAfterBytes);
  writeFileSync('audit/color-before.js',colorBeforeBytes);writeFileSync('audit/color-after.js',colorAfterBytes);
  writeFileSync('audit/index-before.html',indexBeforeBytes);writeFileSync('audit/index-after.html',indexAfterBytes);
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.colorBeforeSha,'STAGED_COLOR_NOT_CURRENT');
  assert.equal(staged.hashes[INDEX],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];delete protectedAssets[INDEX];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),colorAfterBytes);
  writeFileSync(resolve(staged.runtime,'assets',INDEX),indexAfterBytes);
  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let indexOk=false,colorOk=false;
    for(let i=0;i<50;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{const b=await publicFile('/'+INDEX),t=b.toString('utf8');if(sha(b)===indexAfterSha&&t.includes(NEW_REF)){indexOk=true;break}}catch{}
      await delay(1000);
    }
    assert(indexOk,'INDEX_PATCH_NOT_LIVE');
    for(let i=0;i<50;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_COLOR_VERIFY');
      try{const b=await publicFile('/'+TARGET+'?v=343-color-semantics-stat-entry-preserve-20261011a'),t=b.toString('utf8');if(sha(b)===colorAfterSha&&t.includes("if(!cells[7]?.querySelector('small'))paintScore(cells[7]);")){colorOk=true;break}}catch{}
      await delay(1000);
    }
    assert(colorOk,'COLOR_PATCH_NOT_LIVE');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.colorAfterSha=colorAfterSha;report.indexAfterSha=indexAfterSha;report.result='SUCCESS';save();
    console.log('BALL46_COLOR_SEMANTICS_ENTRY_FIX_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET,INDEX],unchangedAssets:Object.keys(protectedAssets).length}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
