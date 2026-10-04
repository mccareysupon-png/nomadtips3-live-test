import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const EXPECTED_BRANCH='work/eventflow-signal-annotation-surgical-20261004';
const EXPECTED_BASE_VERSION='63d5661f-8094-4635-b5ef-a076033a513f';
const EXPECTED_EVENTFLOW_SHA='bb8dae6fd2984c4b98ec7b59aa45f3e02ebf9ee66cb58a6386996305e54de0d2';
const EXPECTED_PATCHED_SHA='5d874f4d1dc2bbec0b9aedf20557c70a61f1dea15e387c7a1ebb8880658c2321';
const OLD_MARKER='B46_EVENTFLOW_SIGNAL_ENTRY_20261002';
const NEW_MARKER='B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004';
const NEW_REVISION='eventflow-signal-annotation-20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),deploy,branch:process.env.GITHUB_REF_NAME,scope:'Event Flow Signal annotation presentation only: keep true signal anchor; add edge-aware detail box and connector; preserve all static assets/backend/config.'};
const save=()=>writeFileSync('audit/eventflow-signal-annotation-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;

function node(scriptPath,args=[]){
  const r=spawnSync(process.execPath,[scriptPath,...args],{encoding:'utf8'});
  if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
  assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${scriptPath}:${r.error?.message||r.status}`);
}
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return;}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return;}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Event Flow Signal annotation Wrangler ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,EXPECTED_BRANCH,'UNCONFIRMED_PRODUCTION_BRANCH_STOP');
  current=await inspect();
  assert.equal(current.restore.version,EXPECTED_BASE_VERSION,'PRODUCTION_BASE_VERSION_MOVED_STOP');
  report.baseVersion=current.restore.version;report.backendBefore=current.restore.backend;

  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsShaBefore=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();
  const eventBefore=await publicFile('/expanded-match-343.js','javascript');
  const eventBeforeText=eventBefore.toString('utf8');
  assert.equal(sha(eventBefore),EXPECTED_EVENTFLOW_SHA,'EVENTFLOW_SOURCE_MOVED_STOP');
  assert(eventBeforeText.includes(OLD_MARKER),'EVENTFLOW_SIGNAL_BASE_MARKER_MISSING');
  assert(!eventBeforeText.includes(NEW_MARKER),'EVENTFLOW_ANNOTATION_ALREADY_PRESENT_UNEXPECTED');
  report.eventFlowBeforeSha=sha(eventBefore);

  writeFileSync('audit/eventflow-before.js',eventBefore);
  node('../../ops/ball46-eventflow/patch-expanded-match-signal-annotation-20261004.js',['audit/eventflow-before.js','audit/eventflow-after.js']);
  node('--check',['audit/eventflow-after.js']);
  const eventAfter=readFileSync('audit/eventflow-after.js');
  const eventAfterText=eventAfter.toString('utf8');
  assert.equal(sha(eventAfter),EXPECTED_PATCHED_SHA,'PATCH_OUTPUT_SHA_CHANGED_STOP');
  assert(eventAfterText.includes(NEW_MARKER),'PATCH_MARKER_MISSING');
  assert(eventAfterText.includes('data-annotation-side'),'EDGE_AWARE_SIDE_MISSING');
  assert(eventAfterText.includes('<polyline points='),'CONNECTOR_LINE_MISSING');
  assert(eventAfterText.includes('signalAnnotationLines'),'SIGNAL_DETAIL_RENDERER_MISSING');
  report.eventFlowAfterSha=sha(eventAfter);

  writeFileSync('audit/index-before.js',current.source);
  writeFileSync('audit/index-after.js',current.source);
  node('../../ops/ball46-eventflow/patch-worker-eventflow-annotation-route-20261004.js',['audit/index-after.js','audit/eventflow-after.js']);
  node('--check',['audit/index-after.js']);
  const patchedSource=readFileSync('audit/index-after.js','utf8');
  assert(patchedSource.includes(NEW_MARKER),'WORKER_PATCH_MARKER_MISSING');
  assert(patchedSource.includes(NEW_REVISION),'WORKER_REVISION_MISSING');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');
  report.workerBeforeSha=sha(current.source);report.workerAfterSha=sha(patchedSource);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);
  await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'CURRENT_RAIL_ASSET_COUNT_CHANGED');
  assert.equal(staged.hashes['expanded-match-343.js'],EXPECTED_EVENTFLOW_SHA,'STAGED_EVENTFLOW_ASSET_NOT_CURRENT_PRODUCTION');
  report.assetCount=Object.keys(staged.hashes).length;
  report.staticAssetsBefore=staged.hashes;
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),EXPECTED_BASE_VERSION,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsShaBefore,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=EXPECTED_BASE_VERSION;report.completedAt=new Date().toISOString();save();console.log('EVENTFLOW_SIGNAL_ANNOTATION_WRANGLER_PREVIEW_PASS');process.exit(0);}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const active=await activeVersion();if(active!==EXPECTED_BASE_VERSION){candidate=active;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();

    let eventPublicOk=false;
    for(let i=0;i<36;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_EVENTFLOW_VERIFY_STOP');
      try{const live=await publicFile('/expanded-match-343.js','javascript');if(sha(live)===EXPECTED_PATCHED_SHA&&live.toString('utf8').includes(NEW_MARKER)){eventPublicOk=true;break}}catch{}
      await delay(1250);
    }
    assert(eventPublicOk,'EVENTFLOW_ANNOTATION_NOT_PUBLIC_STOP');

    const protectedAssets={...staged.hashes};delete protectedAssets['expanded-match-343.js'];
    let assetsStable=false,lastDiff={};
    for(let attempt=1;attempt<=16;attempt++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');
      const diff={};
      for(const [path,expected] of Object.entries(protectedAssets)){
        const got=sha(await publicFile('/'+path));if(got!==expected)diff[path]={expected,got};
      }
      lastDiff=diff;report.assetConvergence={attempt,stable:Object.keys(diff).length===0,lastDiff:diff};save();
      if(Object.keys(diff).length===0){assetsStable=true;console.log(`POST_ALL_${Object.keys(staged.hashes).length}_ASSETS_MATCH attempt=${attempt}`);break}
      console.log(`ASSET_CONVERGENCE_WAIT attempt=${attempt} diff=${JSON.stringify(diff)}`);await delay(3000);
    }
    assert(assetsStable,`UNRELATED_ASSETS_DID_NOT_MATCH:${JSON.stringify(lastDiff)}`);

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const candidateVersion=await getVersion(candidate);
    report.versionConfiguration=verifyVersionConfiguration(current.version,candidateVersion);
    const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));
    report.publishedModules=verifyPublishedModules(candidateVersion,current.version,patchedSource,protectedPublic).map(x=>x.name);
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');

    const finalEvent=await publicFile('/expanded-match-343.js','javascript');
    const finalText=finalEvent.toString('utf8');
    assert.equal(sha(finalEvent),EXPECTED_PATCHED_SHA,'FINAL_EVENTFLOW_SHA_BAD');
    assert(finalText.includes(NEW_MARKER),'FINAL_ANNOTATION_MARKER_MISSING');
    assert(finalText.includes('data-annotation-side'),'FINAL_EDGE_AWARE_MISSING');
    assert(finalText.includes('<polyline points='),'FINAL_CONNECTOR_MISSING');
    assert(finalText.includes('signalAnnotationLines'),'FINAL_DETAILS_MISSING');

    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.staticAssetsUntouched=true;report.signalLogicChanged=false;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`EVENTFLOW_SIGNAL_ANNOTATION_SHA=${EXPECTED_PATCHED_SHA}`);console.log('BALL46_EVENTFLOW_SIGNAL_ANNOTATION_SUCCESS');
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Event Flow Signal annotation\n\nSUCCESS\n\nProduction: ${candidate}\n\nEdge-aware detail box + connector added; true Signal anchor preserved.\n\n79-asset rail preserved, backend/config/crons unchanged.\n`);
  }catch(error){report.error=error.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw error}
}catch(error){report.result='FAIL_STOPPED';report.error=error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack);process.exitCode=1}
