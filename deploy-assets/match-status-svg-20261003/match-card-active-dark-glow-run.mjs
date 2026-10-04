import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/match-card-active-dark-glow-20261004';
const TARGET='dashboard-v2-tune.css';
const OWNER='__B46_SCOREBAR_TUNE_CSS__';
const MARK='B46_MATCH_CARD_ACTIVE_DARK_GLOW_20261004';
const PREV='B46_MATCH_CARD_THEME_CONTRAST_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Presentation-only Dark Mode active match card: keep selected card black and add restrained green edge/glow. Light Mode active styling, geometry/layout, Stable DOM, Signal/+More UI and logic, API, polling, sorting, Event Flow, Statistics, backend, routing and unrelated assets remain untouched.'};
const save=()=>writeFileSync('audit/match-card-active-dark-glow-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback match-card active dark glow ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const owner=literals(current.source).get(OWNER);assert(owner,'PRESENTATION_CSS_OWNER_LITERAL_MISSING');
  const before=await publicFile('/'+TARGET,'css'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  assert.equal(sha(Buffer.from(owner.value)),beforeSha,'PRESENTATION_CSS_OWNER_NOT_PUBLIC_SOURCE');
  assert.equal(current.restore.presentationCssSha,beforeSha,'SCOUT_CSS_SHA_MISMATCH');
  for(const x of [PREV,'B46_MAIN_CARDS_SQUARE_20261003','B46_MATCH_CLOCK_COLORS_20261003','.match-row','background: #030605 !important'])assert(beforeText.includes(x),`BASE_CSS_ANCHOR_MISSING:${x}`);
  assert(!beforeText.includes(MARK),'MATCH_CARD_ACTIVE_DARK_GLOW_ALREADY_PRESENT_STOP');
  const dashboard=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(dashboard,'DASHBOARD_OWNER_LITERAL_MISSING');
  for(const x of ['B46_STABLE_MATCH_CARD_DOM_20261004','B46_CARD_SIGNAL_COUNT_COLLISION_FIX_20261004','B46_CARD_SIGNAL_MORE_COMPACT_20261004'])assert(dashboard.value.includes(x),`RECENT_CARD_BEHAVIOR_MISSING_STOP:${x}`);
  report.ownerLiteral=OWNER;report.cssBeforeSha=beforeSha;report.recentCardBehaviorPreservedBefore=true;writeFileSync('audit/dashboard-v2-tune-before-active-glow.css',before);save();

  node('../../ops/ball46-card-stability/patch-match-card-active-dark-glow-20261004.js',['audit/dashboard-v2-tune-before-active-glow.css','audit/dashboard-v2-tune-after-active-glow.css']);
  const after=readFileSync('audit/dashboard-v2-tune-after-active-glow.css'),afterText=after.toString('utf8'),afterSha=sha(after);report.cssAfterSha=afterSha;
  for(const x of [PREV,MARK,'html[data-theme="dark"] body .workspace.singlepage .match-row.active','background: #030605 !important','#2ACF83','rgba(42,207,131,.16)'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert.equal((afterText.match(new RegExp(MARK,'g'))||[]).length,1,'MARKER_COUNT_BAD');
  const delta=afterText.slice(beforeText.length);
  for(const bad of ['padding:','margin:','width:','height:','border-width:','border-style:','transform:'])assert(!delta.includes(bad),`GEOMETRY_CHANGE_STOP:${bad}`);

  const patchedSource=current.source.slice(0,owner.start)+JSON.stringify(afterText)+current.source.slice(owner.end);
  writeFileSync('audit/index-match-card-active-dark-glow-after.js',patchedSource);node('--check',['audit/index-match-card-active-dark-glow-after.js']);
  const patchedOwner=literals(patchedSource).get(OWNER);assert(patchedOwner,'PATCHED_CSS_OWNER_LITERAL_MISSING');assert.equal(sha(Buffer.from(patchedOwner.value)),afterSha,'PATCHED_CSS_OWNER_SHA_MISMATCH');
  const patchedDashboard=literals(patchedSource).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(patchedDashboard,'PATCHED_DASHBOARD_OWNER_MISSING');assert.equal(sha(Buffer.from(patchedDashboard.value)),sha(Buffer.from(dashboard.value)),'DASHBOARD_JS_CHANGED_STOP');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  const assetCount=Object.keys(staged.hashes).length;assert(assetCount>1,'ASSET_COUNT_INVALID');assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT_PRODUCTION');
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_TARGET_SHA_BAD');
  report.assetCount=assetCount;report.protectedAssetCount=assetCount-1;report.staticAssetsBefore=staged.hashes;report.workerAndStaticTargetIdentical=true;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('MATCH_CARD_ACTIVE_DARK_GLOW_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const direct=await publicFile('/'+TARGET,'css',directOrigin);const dt=direct.toString('utf8');directOk=sha(direct)===afterSha&&dt.includes(MARK);if(directOk)break}catch{}await delay(1250)}assert(directOk,'MATCH_CARD_ACTIVE_DARK_GLOW_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false,publicAttempts=0,lastPublicSha=null;for(let attempt=0;attempt<60;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_PROPAGATION_STOP');publicAttempts=attempt+1;try{const live=await publicFile('/'+TARGET,'css');lastPublicSha=sha(live);if(lastPublicSha===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(2000)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,attempts:publicAttempts,lastPublicSha,verificationOrigin:publicOk?'ball46.com':'direct-worker'};report.publicPropagationPending=!publicOk;save();
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_PROTECTED_${Object.keys(protectedAssets).length}_ASSETS_MATCH attempt=${attempt} origin=${publicOk?'public':'direct'}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const candidateMain=cv.modules.find(m=>m.name===cv.main_module);assert(candidateMain,'FINAL_MAIN_MODULE_MISSING');const candidateSource=Buffer.from(candidateMain.content_base64,'base64').toString('utf8');const finalCssOwner=literals(candidateSource).get(OWNER);assert(finalCssOwner,'FINAL_CSS_OWNER_LITERAL_MISSING');assert.equal(sha(Buffer.from(finalCssOwner.value)),afterSha,'FINAL_CSS_OWNER_SHA_BAD');const finalDashboard=literals(candidateSource).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(finalDashboard,'FINAL_DASHBOARD_OWNER_MISSING');assert.equal(sha(Buffer.from(finalDashboard.value)),sha(Buffer.from(dashboard.value)),'FINAL_DASHBOARD_JS_CHANGED_STOP');
    const final=await publicFile('/'+TARGET,'css',verificationOrigin),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_TARGET_SHA_BAD');for(const x of [PREV,MARK,'html[data-theme="dark"] body .workspace.singlepage .match-row.active','background: #030605 !important','#2ACF83','rgba(42,207,131,.16)'])assert(ft.includes(x),`FINAL_VERIFY_MISSING:${x}`);
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.dashboardJsUntouched=true;report.apiCallsAdded=0;report.signalLogicChanged=false;report.statisticsChanged=false;report.eventFlowChanged=false;report.stableDomPreserved=true;report.signalMorePreserved=true;report.geometryChanged=false;report.lightActiveStateUntouched=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`MATCH_CARD_ACTIVE_DARK_GLOW_CSS_SHA=${afterSha}`);console.log('BALL46_MATCH_CARD_ACTIVE_DARK_GLOW_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
