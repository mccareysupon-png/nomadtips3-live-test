import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/ball46-hide-no-active-signal-20261006';
const MARK='B46_HIDE_NO_ACTIVE_SIGNAL_20261006';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Featured Match presentation only: hide visible No active signal fallback; preserve signal logic, statistics, APIs, backend, and all unrelated assets.'};
const save=()=>writeFileSync('audit/featured-no-active-signal-hide-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Featured fallback hide ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}
try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
  const dashPath=`${staged.runtime}/assets/dashboard-v2-stage3.js`,indexPath=`${staged.runtime}/assets/index.html`;
  let dash=readFileSync(dashPath,'utf8'),index=readFileSync(indexPath,'utf8');
  const dashBefore=sha(dash),indexBefore=sha(index);
  assert.equal((dash.match(/if\(!s\)return['\"]No active signal['\"]/g)||[]).length>=1,true,'DASHBOARD_FALLBACK_ANCHOR_MISSING_STOP');
  assert(index.includes('data-featured-signal>No active signal</div>')||index.includes('data-featured-signal>\nNo active signal</div>'),'INDEX_FALLBACK_ANCHOR_MISSING_STOP');
  dash=dash.replace(/if\(!s\)return['\"]No active signal['\"]/g,"if(!s)return''");
  if(!dash.includes(MARK)) dash=`/* ${MARK} */\n`+dash;
  index=index.replace(/(<div class="feature-signal" data-featured-signal>)No active signal(<\/div>)/,'$1$2');
  writeFileSync(dashPath,dash);writeFileSync(indexPath,index);
  const check=spawnSync(process.execPath,['--check',dashPath],{encoding:'utf8'});assert.equal(check.status,0,`DASHBOARD_JS_SYNTAX_FAIL:${check.stderr}`);
  const dashAfter=sha(dash),indexAfter=sha(index);assert.notEqual(dashAfter,dashBefore,'DASHBOARD_NOT_CHANGED');assert.notEqual(indexAfter,indexBefore,'INDEX_NOT_CHANGED');
  const protectedAssets={...staged.hashes};delete protectedAssets['dashboard-v2-stage3.js'];delete protectedAssets['index.html'];
  report.changed={dashboard:{before:dashBefore,after:dashAfter},index:{before:indexBefore,after:indexAfter}};report.protectedAssetCount=Object.keys(protectedAssets).length;save();
  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let ok=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY_STOP');try{const d=await publicFile('/dashboard-v2-stage3.js','javascript'),h=await publicFile('/index.html','html');const dt=d.toString('utf8'),ht=h.toString('utf8');if(sha(d)===dashAfter&&sha(h)===indexAfter&&dt.includes(MARK)&&!ht.includes('data-featured-signal>No active signal</div>')){ok=true;break}}catch{}await delay(1250)}assert(ok,'FEATURED_FALLBACK_HIDE_NOT_PUBLIC_STOP');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,`UNRELATED_ASSET_CHANGED:${p}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);report.publishedModules=verifyPublishedModules(cv,current.version,current.source,Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,p==='dashboard-v2-stage3.js'?dashAfter:p==='index.html'?indexAfter:h]))).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.signalLogicChanged=false;report.statisticsUntouched=true;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log('BALL46_FEATURED_NO_ACTIVE_SIGNAL_HIDDEN_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
