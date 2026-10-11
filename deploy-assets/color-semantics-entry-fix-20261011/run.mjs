import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='color-semantics-343.js';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Only prevent color-semantics from flattening Statistics Entry cell. Preserve all other color semantics behavior.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patch(src){
  const old='paintScore(cells[6]);paintScore(cells[7]);';
  const neu='paintScore(cells[6]);if(!cells[7]?.querySelector(\'small\'))paintScore(cells[7]);';
  assert.equal(src.split(old).length-1,1,'WORKSPACE_STATS_SCORE_ANCHOR_COUNT');
  const out=src.replace(old,neu);
  assert(out.includes("if(!cells[7]?.querySelector('small'))paintScore(cells[7]);"),'GUARD_MISSING');
  return out;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback color semantics Entry guard '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  current=await inspect();
  const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings');
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();
  const beforeBytes=await publicFile('/'+TARGET);
  const before=beforeBytes.toString('utf8');
  report.targetBeforeSha=sha(beforeBytes);
  assert(before.includes('function processWorkspaceStatsRow(row)'),'WORKSPACE_STATS_HANDLER_MISSING');
  assert(before.includes('paintScore(cells[6]);paintScore(cells[7]);'),'EXPECTED_FLATTENING_LOGIC_MISSING');
  const after=patch(before),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
  writeFileSync('audit/target-before.js',beforeBytes);writeFileSync('audit/target-after.js',afterBytes);
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.targetBeforeSha,'STAGED_TARGET_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let ok=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{const b=await publicFile('/'+TARGET,undefined,directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes("if(!cells[7]?.querySelector('small'))paintScore(cells[7]);")){ok=true;break}}catch{}
      await delay(1000);
    }
    assert(ok,'PATCH_NOT_LIVE');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.result='SUCCESS';save();
    console.log('BALL46_COLOR_SEMANTICS_ENTRY_GUARD_SUCCESS '+JSON.stringify({base,candidate}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
