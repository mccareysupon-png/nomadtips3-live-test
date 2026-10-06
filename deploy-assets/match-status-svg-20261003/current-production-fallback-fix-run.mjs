import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, literals, manifest } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/ball46-current-production-fallback-fix-20261006';
const MARK='B46_HIDE_NO_ACTIVE_SIGNAL_20261006';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'CURRENT PRODUCTION ONLY: verify and hide visible No active signal fallback without using repository presentation assets as source.'};
const save=()=>{mkdirSync('audit',{recursive:true});writeFileSync('audit/featured-no-active-signal-hide-report.json',JSON.stringify(report,null,2))};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Featured fallback hide ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}
try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const lit=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');
  assert(lit,'MULTI_SIGNAL_LITERAL_MISSING_STOP');
  const publicDash=(await publicFile('/dashboard-v2-stage3.js','javascript')).toString('utf8');
  assert.equal(sha(publicDash),sha(lit.value),'WORKER_DASHBOARD_LITERAL_NOT_PUBLIC_STOP');
  let dash=lit.value;
  const dashBefore=sha(dash);
  const fallbackCount=(dash.match(/if\(!s\)return['\"]No active signal['\"]/g)||[]).length; if(fallbackCount===0 && !publicDash.includes('No active signal')){report.result='ALREADY_FIXED_CURRENT_PRODUCTION';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('BALL46_CURRENT_PRODUCTION_ALREADY_FIXED');process.exit(0)} assert(fallbackCount>=1,'DASHBOARD_FALLBACK_ANCHOR_MISSING_STOP');
  dash=dash.replace(/if\(!s\)return['\"]No active signal['\"]/g,"if(!s)return''");
  if(!dash.includes(MARK))dash=`/* ${MARK} */\n`+dash;
  const patchedSource=current.source.slice(0,lit.start)+JSON.stringify(dash)+current.source.slice(lit.end);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  const dashPath=`${staged.runtime}/assets/dashboard-v2-stage3.js`,indexPath=`${staged.runtime}/assets/index.html`;
  let index=readFileSync(indexPath,'utf8');
  const indexBefore=sha(index);
  assert.equal(sha(readFileSync(dashPath)),dashBefore,'STAGED_DASHBOARD_NOT_CURRENT_PRODUCTION');
  assert(index.includes('data-featured-signal>No active signal</div>')||index.includes('data-featured-signal>\nNo active signal</div>'),'INDEX_FALLBACK_ANCHOR_MISSING_STOP');
  index=index.replace(/(<div class="feature-signal" data-featured-signal>)No active signal(<\/div>)/,'$1$2');
  writeFileSync(dashPath,dash);writeFileSync(indexPath,index);
  const check=spawnSync(process.execPath,['--check',dashPath],{encoding:'utf8'});assert.equal(check.status,0,`DASHBOARD_JS_SYNTAX_FAIL:${check.stderr}`);
  const workerCheck=spawnSync(process.execPath,['--check',`${staged.runtime}/index.js`],{encoding:'utf8'});assert.equal(workerCheck.status,0,`WORKER_JS_SYNTAX_FAIL:${workerCheck.stderr}`);
  const dashAfter=sha(dash),indexAfter=sha(index);assert.notEqual(dashAfter,dashBefore,'DASHBOARD_NOT_CHANGED');assert.notEqual(indexAfter,indexBefore,'INDEX_NOT_CHANGED');
  const protectedAssets={...staged.hashes};delete protectedAssets['dashboard-v2-stage3.js'];delete protectedAssets['index.html'];
  report.changed={dashboard:{before:dashBefore,after:dashAfter,literal:'__B46_MULTI_SIGNAL_STAGE3_JS__'},index:{before:indexBefore,after:indexAfter}};report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let ok=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY_STOP');try{const d=await publicFile('/dashboard-v2-stage3.js','javascript'),h=await publicFile('/index.html','html');const dt=d.toString('utf8'),ht=h.toString('utf8');if(sha(d)===dashAfter&&sha(h)===indexAfter&&dt.includes(MARK)&&!ht.includes('data-featured-signal>No active signal</div>')){ok=true;break}}catch{}await delay(1250)}assert(ok,'FEATURED_FALLBACK_HIDE_NOT_PUBLIC_STOP');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,`UNRELATED_ASSET_CHANGED:${p}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);
    const beforeModules=new Map(manifest(current.version).map(x=>[x.name,x])),afterModules=manifest(cv);assert.equal(afterModules.length,beforeModules.size,'MODULE_COUNT_CHANGED_STOP');
    for(const m of afterModules){const prev=beforeModules.get(m.name);assert(prev,`UNEXPECTED_MODULE:${m.name}`);const expected=m.name===cv.main_module?sha(patchedSource):m.name==='assets/index.html'?indexAfter:prev.sha;assert.equal(m.sha,expected,`MODULE_CHANGED:${m.name}`);assert.equal(m.type,prev.type,`MODULE_TYPE_CHANGED:${m.name}`)}
    report.publishedModules=afterModules.map(x=>x.name);
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const finalWorker=Buffer.from(cv.modules.find(m=>m.name===cv.main_module).content_base64,'base64').toString('utf8');
    const finalLit=literals(finalWorker).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(finalLit&&sha(finalLit.value)===dashAfter,'FINAL_WORKER_LITERAL_MISMATCH');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.signalLogicChanged=false;report.statisticsUntouched=true;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log('BALL46_FEATURED_NO_ACTIVE_SIGNAL_HIDDEN_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
