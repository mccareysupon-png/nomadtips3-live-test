import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.js';
const BRANCH='work/ball46-statistics-entry-spacing-20261011';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Statistics Entry cell spacing only: separate score, ENTRY minute and Corners lines. No data/engine/settlement/layout-column changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchAsset(src){
  const start=src.indexOf('function b46StatEntryContext20261011(r){');
  const end=src.indexOf('function b46StatFinalCornersTotal20261011',start);
  assert(start>=0&&end>start,'ENTRY_CONTEXT_FUNCTION_MISSING');
  const before=src.slice(start,end);
  let block=before;
  const entryOld='display:block;font-size:10px;line-height:1.45;white-space:nowrap';
  const entryNew='display:block;margin-top:4px;font-size:10px;line-height:1.55;white-space:nowrap';
  assert(block.includes(entryOld),'ENTRY_STYLE_ANCHOR_MISSING');
  block=block.replace(entryOld,entryNew);
  const cornerCandidates=[
    'display:block;font-size:10px;line-height:1.45;white-space:nowrap',
    'display:block;font-size:10px;line-height:1.45'
  ];
  let changed=false;
  for(const a of cornerCandidates){
    const idx=block.indexOf(a);
    if(idx>=0){
      const repl=a.includes('white-space')?'display:block;margin-top:3px;font-size:10px;line-height:1.55;white-space:nowrap':'display:block;margin-top:3px;font-size:10px;line-height:1.55';
      block=block.slice(0,idx)+block.slice(idx).replace(a,repl);changed=true;break;
    }
  }
  assert(changed,'CORNERS_STYLE_ANCHOR_MISSING');
  assert.notEqual(block,before,'ENTRY_CONTEXT_UNCHANGED');
  return src.slice(0,start)+block+src.slice(end);
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Statistics entry spacing '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect(); const base=current.restore.version; report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const targetBytes=await publicFile('/'+TARGET),target=targetBytes.toString('utf8');
  report.targetBeforeSha=sha(targetBytes);
  const after=patchAsset(target),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
  writeFileSync('audit/target-before.js',targetBytes); writeFileSync('audit/target-after.js',afterBytes);
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.targetBeforeSha,'STAGED_TARGET_NOT_CURRENT');
  const protectedAssets={...staged.hashes}; delete protectedAssets[TARGET];
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
      try{const b=await publicFile('/'+TARGET,undefined,directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('margin-top:4px;font-size:10px;line-height:1.55')&&t.includes('margin-top:3px;font-size:10px;line-height:1.55')){ok=true;break}}catch{}
      await delay(1000);
    }
    assert(ok,'PATCH_NOT_LIVE');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.targetAfterSha=afterSha;report.result='SUCCESS';save();
    console.log('BALL46_STATISTICS_ENTRY_SPACING_SUCCESS '+JSON.stringify({base,candidate}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
