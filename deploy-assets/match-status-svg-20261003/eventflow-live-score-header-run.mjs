import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/eventflow-live-score-header-20261004';
const MARK='B46_EVENTFLOW_LIVE_SCORE_HEADER_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Event Flow presentation only: mirror board goals.home/goals.away in header after live minute; preserve expanded mode, signals, API, statistics, backend and all unrelated assets.'};
const save=()=>writeFileSync('audit/eventflow-live-score-header-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Event Flow live score header ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const eventBefore=await publicFile('/expanded-match-343.js','javascript'),beforeText=eventBefore.toString('utf8'),beforeSha=sha(eventBefore);
  assert(beforeText.includes('B46_EVENTFLOW_EXPAND_MODE_20261004'),'EXPANDED_MODE_BASE_MISSING');
  assert(beforeText.includes('B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004'),'SIGNAL_ANNOTATION_BASE_MISSING');
  assert(!beforeText.includes(MARK),'LIVE_SCORE_HEADER_ALREADY_PRESENT_STOP');
  report.eventFlowBeforeSha=beforeSha;writeFileSync('audit/eventflow-live-score-before.js',eventBefore);

  node('../../ops/ball46-eventflow/patch-expanded-match-live-score-header-20261004.js',['audit/eventflow-live-score-before.js','audit/eventflow-live-score-after.js']);
  node('--check',['audit/eventflow-live-score-after.js']);
  const eventAfter=readFileSync('audit/eventflow-live-score-after.js'),afterText=eventAfter.toString('utf8'),afterSha=sha(eventAfter);report.eventFlowAfterSha=afterSha;
  for(const x of [MARK,'f?.goals?.home','f?.goals?.away','${scoreText}'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert.equal((beforeText.match(/\bfetch\(/g)||[]).length,(afterText.match(/\bfetch\(/g)||[]).length,'EVENTFLOW_FETCH_COUNT_CHANGED');

  const lit=literals(current.source).get('__B46_EVENTFLOW_SIGNAL_JS_20261002__');assert(lit,'EVENTFLOW_LITERAL_MISSING');
  assert.equal(sha(lit.value),beforeSha,'WORKER_EVENTFLOW_LITERAL_NOT_PUBLIC_SOURCE');
  const patchedSource=current.source.slice(0,lit.start)+JSON.stringify(afterText)+current.source.slice(lit.end);
  writeFileSync('audit/index-live-score-after.js',patchedSource);node('--check',['audit/index-live-score-after.js']);
  assert(patchedSource.includes(MARK),'WORKER_SCORE_MARKER_MISSING');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes['expanded-match-343.js'],beforeSha,'STAGED_EVENTFLOW_NOT_CURRENT_PRODUCTION');report.assetCount=79;report.staticAssetsBefore=staged.hashes;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('EVENTFLOW_LIVE_SCORE_HEADER_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let publicOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_EVENTFLOW_VERIFY_STOP');try{const live=await publicFile('/expanded-match-343.js','javascript');if(sha(live)===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(1250)}assert(publicOk,'LIVE_SCORE_HEADER_NOT_PUBLIC_STOP');
    const protectedAssets={...staged.hashes};delete protectedAssets['expanded-match-343.js'];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_ALL_${Object.keys(staged.hashes).length}_ASSETS_MATCH attempt=${attempt}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const final=await publicFile('/expanded-match-343.js','javascript'),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_EVENTFLOW_SHA_BAD');for(const x of [MARK,'f?.goals?.home','f?.goals?.away','${scoreText}'])assert(ft.includes(x),`FINAL_MARKER_MISSING:${x}`);
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.staticAssetsUntouched=true;report.signalLogicChanged=false;report.apiCallsAdded=0;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`EVENTFLOW_LIVE_SCORE_HEADER_SHA=${afterSha}`);console.log('BALL46_EVENTFLOW_LIVE_SCORE_HEADER_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
