import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.js';
const BRANCH='work/ball46-statistics-live-minute-20261011';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Statistics table only: PENDING Final cell shows mirror minute plus live score; settled rows keep final score.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchAsset(source){
  let s=source;
  const oldScope="const league=[r?.league?.country,r?.league?.name].filter(Boolean).join(' · '),res=window.BALL46_STATISTICS_DATA.isSettled(r)?(outcome(r)||'PUSH'):String(r?.status||'PENDING').toUpperCase();return";
  const newScope="const league=[r?.league?.country,r?.league?.name].filter(Boolean).join(' · '),settled=window.BALL46_STATISTICS_DATA.isSettled(r),res=settled?(outcome(r)||'PUSH'):String(r?.status||'PENDING').toUpperCase(),liveMinute=r?.mirrorMinute??r?.minute??r?.entryMinute,liveScore=r?.mirrorScore??r?.scoreAt??r?.finalScore,finalText=settled?score(r?.finalScore):[((liveMinute!==null&&liveMinute!==undefined&&Number.isFinite(Number(liveMinute)))?Math.max(0,Math.round(Number(liveMinute)))+\"'\":'LIVE'),score(liveScore)].join(' · ');return";
  assert.equal(s.split(oldScope).length-1,1,'ROW_SCOPE_ANCHOR_COUNT');
  s=s.replace(oldScope,newScope);
  const oldCell='<td>${esc(score(r?.finalScore))}</td>';
  const newCell='<td>${esc(finalText)}</td>';
  assert.equal(s.split(oldCell).length-1,1,'FINAL_CELL_ANCHOR_COUNT');
  s=s.replace(oldCell,newCell);
  parse(s,{ecmaVersion:'latest',sourceType:'script'});
  assert(s.includes('r?.mirrorMinute??r?.minute??r?.entryMinute'),'MIRROR_MINUTE_MISSING');
  assert(s.includes('r?.mirrorScore??r?.scoreAt??r?.finalScore'),'MIRROR_SCORE_MISSING');
  assert(s.includes('<td>${esc(finalText)}</td>'),'FINAL_CELL_PATCH_MISSING');
  return s;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return; const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Statistics live minute '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect(); const base=current.restore.version; report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const targetBytes=await publicFile('/'+TARGET),target=targetBytes.toString('utf8');
  report.targetBeforeSha=sha(targetBytes);
  assert(target.includes('Array.isArray(j.ledgerRows)?j.ledgerRows:j.rows'),'PENDING_DISPLAY_PATCH_NOT_ACTIVE');
  assert(target.includes('<td>${esc(score(r?.finalScore))}</td>'),'CURRENT_FINAL_CELL_CHANGED');
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
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';save();console.log('BALL46_STATISTICS_LIVE_MINUTE_PREVIEW_PASS');process.exit(0)}
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let directOk=false,publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+TARGET,undefined,directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('r?.mirrorMinute??r?.minute??r?.entryMinute')&&t.includes('r?.mirrorScore??r?.scoreAt??r?.finalScore')){directOk=true;break}}catch{}await delay(1000)}
    assert(directOk,'PATCH_NOT_DIRECT_PRODUCTION');
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/'+TARGET),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('r?.mirrorMinute??r?.minute??r?.entryMinute')&&t.includes('r?.mirrorScore??r?.scoreAt??r?.finalScore')){publicOk=true;break}}catch{}await delay(1200)}
    assert(publicOk,'PATCH_NOT_PUBLIC');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.result='SUCCESS';save();
    console.log('BALL46_STATISTICS_LIVE_MINUTE_SUCCESS '+JSON.stringify({base,candidate}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
