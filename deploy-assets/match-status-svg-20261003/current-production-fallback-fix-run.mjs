import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, literals, manifest } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/ball46-current-production-fallback-fix-20261006';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'CURRENT PRODUCTION ONLY: patch exact public assets and matching embedded literal by hash; no repository UI source used.'};
const save=()=>{mkdirSync('audit',{recursive:true});writeFileSync('audit/current-production-fallback-fix-report.json',JSON.stringify(report,null,2))};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let base=null,candidate=null;
async function rollback(){if(!base)return;const a=await activeVersion();if(a===base){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback current-production fallback fix ${report.run}`}})});assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:base};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  base=await activeVersion();
  const version=await getVersion(base);
  const main=version.modules.find(m=>m.name===version.main_module);assert(main,'MAIN_MODULE_MISSING');
  const source=Buffer.from(main.content_base64,'base64').toString('utf8');
  report.baseVersion=base;report.mainModule=version.main_module;

  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules(),backendBefore=await backend();
  report.backendBefore=backendBefore;

  const publicDashBytes=await publicFile('/dashboard-v2-stage3.js','javascript');
  const publicIndexBytes=await publicFile('/index.html','html');
  const publicDash=publicDashBytes.toString('utf8'),publicIndex=publicIndexBytes.toString('utf8');
  const dashBefore=sha(publicDashBytes),indexBefore=sha(publicIndexBytes);

  const dashFallback=(publicDash.match(/if\(!s\)return['"]No active signal['"]/g)||[]).length;
  const indexFallback=/data-featured-signal>No active signal<\/div>/.test(publicIndex);
  report.detected={dashFallback,indexFallback,dashSha:dashBefore,indexSha:indexBefore};

  if(dashFallback===0&&!indexFallback){
    report.result='ALREADY_FIXED_CURRENT_PRODUCTION';report.finalVersion=base;report.completedAt=new Date().toISOString();save();
    console.log(`CURRENT_PRODUCTION=${base}`);console.log('BALL46_CURRENT_PRODUCTION_ALREADY_FIXED');process.exit(0);
  }

  let dash=publicDash.replace(/if\(!s\)return['"]No active signal['"]/g,"if(!s)return''");
  let index=publicIndex.replace(/(<div class="feature-signal" data-featured-signal>)No active signal(<\/div>)/g,'$1$2');

  const lits=literals(source);
  let matchedLiteral=null;
  for(const [name,entry] of lits){if(sha(entry.value)===dashBefore){matchedLiteral={name,...entry};break}}
  let patchedSource=source;
  if(matchedLiteral){
    patchedSource=source.slice(0,matchedLiteral.start)+JSON.stringify(dash)+source.slice(matchedLiteral.end);
    report.matchedWorkerLiteral=matchedLiteral.name;
  }else report.matchedWorkerLiteral=null;

  const staged=await stageCurrentRail(version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  const dashPath=`${staged.runtime}/assets/dashboard-v2-stage3.js`,indexPath=`${staged.runtime}/assets/index.html`;
  assert.equal(sha(readFileSync(dashPath)),dashBefore,'STAGED_DASHBOARD_NOT_CURRENT_PRODUCTION');
  assert.equal(sha(readFileSync(indexPath)),indexBefore,'STAGED_INDEX_NOT_CURRENT_PRODUCTION');
  writeFileSync(dashPath,dash);writeFileSync(indexPath,index);

  const dashAfter=sha(dash),indexAfter=sha(index);
  if(dashAfter!==dashBefore){const ck=spawnSync(process.execPath,['--check',dashPath],{encoding:'utf8'});assert.equal(ck.status,0,`DASHBOARD_JS_SYNTAX_FAIL:${ck.stderr}`)}
  if(patchedSource!==source){const workerPath=`${staged.runtime}/index.js`;const wk=spawnSync(process.execPath,['--check',workerPath],{encoding:'utf8'});assert.equal(wk.status,0,`WORKER_JS_SYNTAX_FAIL:${wk.stderr}`)}
  const changedAssets=[];if(dashAfter!==dashBefore)changedAssets.push('dashboard-v2-stage3.js');if(indexAfter!==indexBefore)changedAssets.push('index.html');assert(changedAssets.length,'NO_CHANGE_AFTER_PATCH_STOP');
  const protectedAssets={...staged.hashes};for(const p of changedAssets)delete protectedAssets[p];
  report.changedAssets=changedAssets;report.after={dashSha:dashAfter,indexSha:indexAfter};report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();

    let publicOk=false;
    for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY_STOP');try{const d=await publicFile('/dashboard-v2-stage3.js','javascript'),h=await publicFile('/index.html','html');if(sha(d)===dashAfter&&sha(h)===indexAfter&&!d.toString('utf8').includes("return'No active signal'")&&!d.toString('utf8').includes('return"No active signal"')&&!/data-featured-signal>No active signal<\/div>/.test(h.toString('utf8'))){publicOk=true;break}}catch{}await delay(1250)}
    assert(publicOk,'CURRENT_PRODUCTION_FALLBACK_FIX_NOT_PUBLIC_STOP');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,`UNRELATED_ASSET_CHANGED:${p}`);
    assert.equal(canonical(await backend()),canonical(backendBefore),'BACKEND_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');

    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(version,cv);
    const beforeModules=new Map(manifest(version).map(x=>[x.name,x])),afterModules=manifest(cv);assert.equal(afterModules.length,beforeModules.size,'MODULE_COUNT_CHANGED_STOP');
    for(const m of afterModules){const prev=beforeModules.get(m.name);assert(prev,`UNEXPECTED_MODULE:${m.name}`);let expected=prev.sha;if(m.name===cv.main_module&&patchedSource!==source)expected=sha(patchedSource);if(m.name==='assets/index.html'&&indexAfter!==indexBefore)expected=indexAfter;assert.equal(m.sha,expected,`MODULE_CHANGED:${m.name}`);assert.equal(m.type,prev.type,`MODULE_TYPE_CHANGED:${m.name}`)}

    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    if(matchedLiteral){const fm=cv.modules.find(m=>m.name===cv.main_module);const fs=Buffer.from(fm.content_base64,'base64').toString('utf8');const fl=literals(fs).get(matchedLiteral.name);assert(fl&&sha(fl.value)===dashAfter,'FINAL_MATCHED_LITERAL_MISMATCH')}

    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log('BALL46_CURRENT_PRODUCTION_FALLBACK_FIX_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
