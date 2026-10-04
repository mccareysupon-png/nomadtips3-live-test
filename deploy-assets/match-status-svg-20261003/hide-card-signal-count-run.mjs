import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/hide-card-signal-count-20261004';
const TARGET='dashboard-v2-stage3.js';
const OWNER='__B46_MULTI_SIGNAL_STAGE3_JS__';
const MARK='B46_CARD_SIGNAL_COUNT_COLLISION_FIX_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Presentation-only collision fix: prevent the global signal counter from overwriting inline match-card signal details by isolating the card-local data attribute. No API, polling, signal logic, sorting, Stable DOM lifecycle, Event Flow, Statistics, backend, routing, or unrelated assets.'};
const save=()=>writeFileSync('audit/hide-card-signal-count-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback card signal-count collision fix ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'javascript'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  assert(beforeText.includes('B46_STABLE_MATCH_CARD_DOM_20261004'),'STABLE_CARD_DOM_BASE_MISSING_STOP');
  assert(beforeText.includes('data-signal-count="${rows.length}"'),'CARD_SIGNAL_COUNT_COLLISION_ANCHOR_MISSING');
  assert(beforeText.includes("setText('[data-signal-count]',activeSignals)"),'GLOBAL_SIGNAL_COUNTER_ANCHOR_MISSING');
  assert(!beforeText.includes(MARK),'CARD_SIGNAL_COUNT_FIX_ALREADY_PRESENT_STOP');

  const owner=literals(current.source).get(OWNER);assert(owner,'DASHBOARD_WORKER_OWNER_LITERAL_MISSING');
  assert.equal(sha(Buffer.from(owner.value)),beforeSha,'DASHBOARD_WORKER_OWNER_NOT_PUBLIC_SOURCE');
  assert(current.source.includes('path === "/dashboard-v2-stage3.js" && typeof __B46_MULTI_SIGNAL_STAGE3_JS__ === "string"'),'DASHBOARD_WORKER_ROUTE_GUARD_MISSING');
  assert(current.source.includes('return new Response(__B46_MULTI_SIGNAL_STAGE3_JS__'),'DASHBOARD_WORKER_RESPONSE_GUARD_MISSING');
  report.ownerLiteral=OWNER;report.assetBeforeSha=beforeSha;writeFileSync('audit/dashboard-v2-stage3-before.js',before);

  node('../../ops/ball46-card-stability/patch-hide-card-signal-count-20261004.js',['audit/dashboard-v2-stage3-before.js','audit/dashboard-v2-stage3-after.js']);
  node('--check',['audit/dashboard-v2-stage3-after.js']);
  const after=readFileSync('audit/dashboard-v2-stage3-after.js'),afterText=after.toString('utf8'),afterSha=sha(after);report.assetAfterSha=afterSha;
  for(const x of [MARK,'data-inline-signal-count="${rows.length}"',"setText('[data-signal-count]',activeSignals)",'B46_STABLE_MATCH_CARD_DOM_20261004','syncStableMatchRow'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert(!afterText.includes('data-signal-count="${rows.length}"'),'CARD_COUNT_COLLISION_REMAINS');
  assert.equal((beforeText.match(/\bfetch\(/g)||[]).length,(afterText.match(/\bfetch\(/g)||[]).length,'FETCH_COUNT_CHANGED');
  for(const x of ["const API='/api/engine/board'","const SIGNALS_API='/api/engine/signals'","const STATISTICS_API='/api/engine/statistics'",'const POLL_MS=30_000','const SIGNAL_POLL_MS=30_000'])assert(afterText.includes(x),`DATA_OR_POLL_CONTRACT_CHANGED:${x}`);
  assert(afterText.includes("fixtures=holdLastGoodOdds(rows).slice().sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0))"),'MATCH_SORT_RULE_CHANGED_STOP');

  const patchedSource=current.source.slice(0,owner.start)+JSON.stringify(afterText)+current.source.slice(owner.end);
  writeFileSync('audit/index-hide-card-signal-count-after.js',patchedSource);node('--check',['audit/index-hide-card-signal-count-after.js']);
  const patchedOwner=literals(patchedSource).get(OWNER);assert(patchedOwner,'PATCHED_DASHBOARD_OWNER_LITERAL_MISSING');assert.equal(sha(Buffer.from(patchedOwner.value)),afterSha,'PATCHED_WORKER_OWNER_SHA_MISMATCH');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT_PRODUCTION');
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_TARGET_SHA_BAD');
  report.assetCount=79;report.staticAssetsBefore=staged.hashes;report.workerAndStaticTargetIdentical=true;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('CARD_SIGNAL_COUNT_FIX_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const direct=await publicFile('/'+TARGET,'javascript',directOrigin);directOk=sha(direct)===afterSha&&direct.toString('utf8').includes(MARK);if(directOk)break}catch{}await delay(1250)}assert(directOk,'CARD_SIGNAL_COUNT_FIX_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false,publicAttempts=0,lastPublicSha=null;for(let attempt=0;attempt<60;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_PROPAGATION_STOP');publicAttempts=attempt+1;try{const live=await publicFile('/'+TARGET,'javascript');lastPublicSha=sha(live);if(lastPublicSha===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(2000)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,attempts:publicAttempts,lastPublicSha,verificationOrigin:publicOk?'ball46.com':'direct-worker'};report.publicPropagationPending=!publicOk;save();
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_PROTECTED_${Object.keys(protectedAssets).length}_ASSETS_MATCH attempt=${attempt} origin=${publicOk?'public':'direct'}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const candidateMain=cv.modules.find(m=>m.name===cv.main_module);assert(candidateMain,'FINAL_MAIN_MODULE_MISSING');const candidateSource=Buffer.from(candidateMain.content_base64,'base64').toString('utf8');const candidateOwner=literals(candidateSource).get(OWNER);assert(candidateOwner,'FINAL_OWNER_LITERAL_MISSING');assert.equal(sha(Buffer.from(candidateOwner.value)),afterSha,'FINAL_OWNER_LITERAL_SHA_BAD');
    const final=await publicFile('/'+TARGET,'javascript',verificationOrigin),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_TARGET_SHA_BAD');assert(ft.includes(MARK),'FINAL_MARKER_MISSING');assert(!ft.includes('data-signal-count="${rows.length}"'),'FINAL_CARD_COLLISION_REMAINS');assert(ft.includes('data-inline-signal-count="${rows.length}"'),'FINAL_INLINE_COUNT_METADATA_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.apiCallsAdded=0;report.pollCadenceChanged=false;report.signalLogicChanged=false;report.sortRuleChanged=false;report.stableDomPreserved=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`DASHBOARD_SIGNAL_COUNT_FIX_SHA=${afterSha}`);console.log('BALL46_CARD_SIGNAL_COUNT_COLLISION_FIX_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
