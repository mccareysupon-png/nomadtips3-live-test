import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, manifest } from './production.mjs';
import { rail, schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';

const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),rail,scope:'Statistics Result only: red transparent LIVE followed by mirrored live minute. No backend or unrelated asset changes.'};
const save=()=>writeFileSync('audit/live-result-minute-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback LIVE minute UI ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}
try{
  assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_PRODUCTION_BRANCH_STOP');
  assert.equal(process.env.DEPLOY_ENABLED,'true','DEPLOY_NOT_AUTHORIZED');
  current=await inspect();report.baseVersion=current.restore.version;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules(),baseManifest=manifest(current.version);
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);assert.equal(await activeVersion(),current.restore.version,'PRODUCTION_MOVED_DURING_PREFLIGHT');

  const file=resolve(staged.runtime,'assets/statistics-next.js'),before=readFileSync(file,'utf8'),beforeSha=sha(before);
  assert.equal(beforeSha,staged.hashes['statistics-next.js'],'STAGED_STATISTICS_JS_NOT_CURRENT_PRODUCTION');
  const fnAnchor="function resultTag(r){const x=String(r||'').toUpperCase(),cls=x==='WIN'||x==='HALF_WIN'?'win':x==='LOSS'||x==='HALF_LOSS'?'loss':'push';return`<span class=\"result-tag ${cls}\">${esc(x||'—')}</span>`}";
  assert.equal(before.split(fnAnchor).length-1,1,'RESULT_TAG_ANCHOR_MOVED_STOP');
  const resultCell="function resultCell(s){const x=String(s?.result||s?.displayStatus||'').toUpperCase();if(x==='LIVE'){const m=s?.mirrorMinute??s?.entryMinute??s?.minute,minute=m==null?'':(' '+esc(show(m))+\"'\");return '<span class=\"result-live-text\" style=\"color:#e53935;background:transparent!important;border:0!important;box-shadow:none!important;padding:0;font-weight:700;white-space:nowrap\">LIVE'+minute+'</span>'}return resultTag(s?.result)}";
  let after=before.replace(fnAnchor,fnAnchor+'\n'+resultCell);
  const cellAnchor='<td>${resultTag(s?.result)}</td>';assert.equal(after.split(cellAnchor).length-1,1,'RESULT_CELL_ANCHOR_MOVED_STOP');after=after.replace(cellAnchor,'<td>${resultCell(s)}</td>');
  assert(after.includes("s?.mirrorMinute??s?.entryMinute??s?.minute"),'MIRROR_MINUTE_MISSING');assert(after.includes('color:#e53935'),'RED_MISSING');assert(after.includes('background:transparent!important'),'TRANSPARENT_MISSING');
  writeFileSync(file,after);const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(check.status,0,`STATISTICS_JS_SYNTAX_FAIL:${check.stderr}`);
  const afterSha=sha(after);report.statisticsNext={beforeSha,afterSha,beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after)};
  const protectedAssets={...staged.hashes};delete protectedAssets['statistics-next.js'];report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);assert.equal(await activeVersion(),current.restore.version,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_STOP');
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const active=await activeVersion();if(active!==current.restore.version){candidate=active;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let publicOk=false;for(let i=0;i<36;i++){try{if(sha(await publicFile('/statistics-next.js','javascript'))===afterSha){publicOk=true;break}}catch{}await delay(1250)}assert(publicOk,'LIVE_MINUTE_JS_NOT_PUBLIC_STOP');
    for(const [path,expected] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+path)),expected,`UNRELATED_ASSET_CHANGED:${path}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED_STOP');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    assert.equal(canonical(manifest(await getVersion(candidate))),canonical(baseManifest),'WORKER_MODULES_CHANGED_STOP');assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const finalJs=(await publicFile('/statistics-next.js','javascript')).toString('utf8');assert(finalJs.includes('result-live-text'),'FINAL_RENDERER_MISSING');assert(finalJs.includes("mirrorMinute??s?.entryMinute??s?.minute"),'FINAL_MINUTE_MISSING');assert(finalJs.includes('background:transparent!important'),'FINAL_TRANSPARENT_MISSING');assert(finalJs.includes('color:#e53935'),'FINAL_RED_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.onlyStatisticsNextJsChanged=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`STATISTICS_NEXT_SHA=${afterSha}`);console.log('BALL46_LIVE_RESULT_MINUTE_SUCCESS');
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Statistics LIVE minute\n\nSUCCESS\n\nProduction: ${candidate}\n\nLIVE <minute>' in red transparent text; backend and ${Object.keys(protectedAssets).length} unrelated assets verified unchanged.\n`);
  }catch(error){report.error=error.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw error}
}catch(error){report.result='FAIL_STOPPED';report.error=error.message;save();console.error(error.stack);process.exitCode=1}
