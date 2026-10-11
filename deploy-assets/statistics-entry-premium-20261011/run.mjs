import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.js';
const BRANCH='work/ball46-statistics-entry-premium-20261011';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Statistics Entry cell only: force three-line spacing and premium colors. No engine, settlement, other columns, or global CSS changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchAsset(src){
  let s=src;
  const cellOld='<td>${esc(score(r?.entryScore??r?.scoreAt))}${b46StatEntryContext20261011(r)}</td>';
  const cellNew='<td style="height:62px;overflow:visible;white-space:normal"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:5px;line-height:1.15"><span style="display:block;font-size:10px;font-weight:950;color:#f5f7fb;white-space:nowrap">${esc(score(r?.entryScore??r?.scoreAt))}</span>${b46StatEntryContext20261011(r)}</div></td>';
  assert.equal(s.split(cellOld).length-1,1,'ENTRY_CELL_ANCHOR_COUNT');
  s=s.replace(cellOld,cellNew);

  const fnStart=s.indexOf('function b46StatEntryContext20261011(r){');
  const fnEnd=s.indexOf('function b46StatFinalCornersTotal20261011',fnStart);
  assert(fnStart>=0&&fnEnd>fnStart,'ENTRY_CONTEXT_FUNCTION_MISSING');
  let block=s.slice(fnStart,fnEnd);

  block=block.replace(/display:block(?:;margin-top:\d+px)?;font-size:10px;line-height:1\.(?:45|55);white-space:nowrap/g,'display:block;margin:0;font-size:10px;line-height:1.25;white-space:nowrap');
  block=block.replace(/display:block(?:;margin-top:\d+px)?;font-size:10px;line-height:1\.(?:45|55)/g,'display:block;margin:0;font-size:10px;line-height:1.25');

  const entryNeedle='>ENTRY ';
  const entryIdx=block.indexOf(entryNeedle);
  assert(entryIdx>=0,'ENTRY_TEXT_MISSING');
  const entryStylePos=block.lastIndexOf('style="',entryIdx);
  const entryStyleEnd=block.indexOf('"',entryStylePos+7);
  assert(entryStylePos>=0&&entryStyleEnd>entryStylePos,'ENTRY_STYLE_NOT_FOUND');
  let entryStyle=block.slice(entryStylePos+7,entryStyleEnd);
  if(!entryStyle.includes('color:'))entryStyle+=';color:#f3c969;font-weight:900;letter-spacing:.02em';
  block=block.slice(0,entryStylePos+7)+entryStyle+block.slice(entryStyleEnd);

  const cornerIdx=block.indexOf('Corners ');
  assert(cornerIdx>=0,'CORNERS_TEXT_MISSING');
  const cornerStylePos=block.lastIndexOf('style="',cornerIdx);
  const cornerStyleEnd=block.indexOf('"',cornerStylePos+7);
  assert(cornerStylePos>=0&&cornerStyleEnd>cornerStylePos,'CORNERS_STYLE_NOT_FOUND');
  let cornerStyle=block.slice(cornerStylePos+7,cornerStyleEnd);
  if(!cornerStyle.includes('color:'))cornerStyle+=';color:#67d7d0;font-weight:850';
  block=block.slice(0,cornerStylePos+7)+cornerStyle+block.slice(cornerStyleEnd);

  s=s.slice(0,fnStart)+block+s.slice(fnEnd);
  assert(s.includes('height:62px;overflow:visible;white-space:normal'),'ENTRY_HEIGHT_PATCH_MISSING');
  assert(s.includes('gap:5px'),'ENTRY_GAP_PATCH_MISSING');
  assert(s.includes('color:#f3c969'),'ENTRY_GOLD_MISSING');
  assert(s.includes('color:#67d7d0'),'CORNERS_PREMIUM_COLOR_MISSING');
  return s;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return; const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Statistics premium Entry '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect(); const base=current.restore.version; report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const targetBytes=await publicFile('/'+TARGET),target=targetBytes.toString('utf8');
  report.targetBeforeSha=sha(targetBytes);
  assert(target.includes('b46StatEntryContext20261011'),'ENTRY_CONTEXT_NOT_ACTIVE');
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
    let directOk=false,publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+TARGET,undefined,directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('gap:5px')&&t.includes('color:#f3c969')&&t.includes('color:#67d7d0')){directOk=true;break}}catch{}await delay(1000)}
    assert(directOk,'PATCH_NOT_DIRECT_PRODUCTION');
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/'+TARGET),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('height:62px;overflow:visible;white-space:normal')){publicOk=true;break}}catch{}await delay(1200)}
    assert(publicOk,'PATCH_NOT_PUBLIC');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.result='SUCCESS';save();
    console.log('BALL46_STATISTICS_ENTRY_PREMIUM_SUCCESS '+JSON.stringify({base,candidate}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
