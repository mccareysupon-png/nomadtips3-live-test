import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/card-flicker-scout-20261004';
const TARGET='dashboard-v2-stage3.js';
const MARK='B46_STABLE_MATCH_CARD_DOM_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Match-card presentation lifecycle only: preserve keyed card DOM across board and rich-odds refreshes. No API, polling cadence, signal logic, sorting rules, backend, Event Flow, Statistics, routing, or unrelated assets.'};
const save=()=>writeFileSync('audit/card-flicker-stable-dom-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback stable match-card DOM ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'javascript'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  assert(beforeText.includes("const API='/api/engine/board'"),'BOARD_API_ANCHOR_MISSING');
  assert(beforeText.includes('const POLL_MS=30_000'),'BOARD_POLL_ANCHOR_MISSING');
  assert(beforeText.includes('function renderBoard(){'),'RENDER_BOARD_ANCHOR_MISSING');
  assert(beforeText.includes('host.innerHTML='),'CURRENT_FULL_BOARD_REBUILD_ANCHOR_MISSING');
  assert(!beforeText.includes(MARK),'STABLE_CARD_DOM_ALREADY_PRESENT_STOP');
  report.assetBeforeSha=beforeSha;writeFileSync('audit/dashboard-v2-stage3-before.js',before);

  node('../../ops/ball46-card-stability/patch-dashboard-v2-stage3-20261004.js',['audit/dashboard-v2-stage3-before.js','audit/dashboard-v2-stage3-after.js']);
  node('--check',['audit/dashboard-v2-stage3-after.js']);
  const after=readFileSync('audit/dashboard-v2-stage3-after.js'),afterText=after.toString('utf8'),afterSha=sha(after);report.assetAfterSha=afterSha;
  for(const x of [MARK,'stableBoardStructureKey','syncStableMatchRow','stableMarkupKey','host.replaceChildren(template.content)'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert.equal((beforeText.match(/\bfetch\(/g)||[]).length,(afterText.match(/\bfetch\(/g)||[]).length,'FETCH_COUNT_CHANGED');
  for(const x of ["const API='/api/engine/board'","const SIGNALS_API='/api/engine/signals'","const STATISTICS_API='/api/engine/statistics'",'const POLL_MS=30_000','const SIGNAL_POLL_MS=30_000'])assert(afterText.includes(x),`DATA_OR_POLL_CONTRACT_CHANGED:${x}`);
  assert(afterText.includes("fixtures=holdLastGoodOdds(rows).slice().sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0))"),'MATCH_SORT_RULE_CHANGED_STOP');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT_PRODUCTION');
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);
  report.assetCount=79;report.staticAssetsBefore=staged.hashes;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('CARD_FLICKER_STABLE_DOM_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const direct=await publicFile('/'+TARGET,'javascript',directOrigin);directOk=sha(direct)===afterSha&&direct.toString('utf8').includes(MARK);if(directOk)break}catch{}await delay(1250)}assert(directOk,'STABLE_CARD_DOM_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false,publicAttempts=0,lastPublicSha=null;for(let attempt=0;attempt<60;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_PROPAGATION_STOP');publicAttempts=attempt+1;try{const live=await publicFile('/'+TARGET,'javascript');lastPublicSha=sha(live);if(lastPublicSha===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(2000)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,attempts:publicAttempts,lastPublicSha,verificationOrigin:publicOk?'ball46.com':'direct-worker'};report.publicPropagationPending=!publicOk;save();
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_PROTECTED_${Object.keys(protectedAssets).length}_ASSETS_MATCH attempt=${attempt} origin=${publicOk?'public':'direct'}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,current.source,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const final=await publicFile('/'+TARGET,'javascript',verificationOrigin),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_TARGET_SHA_BAD');assert(ft.includes(MARK),'FINAL_STABLE_DOM_MARKER_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.apiCallsAdded=0;report.pollCadenceChanged=false;report.signalLogicChanged=false;report.sortRuleChanged=false;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`DASHBOARD_STABLE_DOM_SHA=${afterSha}`);console.log('BALL46_CARD_FLICKER_STABLE_DOM_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
