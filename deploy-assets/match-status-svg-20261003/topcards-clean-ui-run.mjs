import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/ball46-topcards-clean-ui-20261004';
const TARGET='dashboard-v2-tune.css';
const OWNER='__B46_SCOREBAR_TUNE_CSS__';
const MARK='B46_TOPCARDS_CLEAN_UI_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Presentation-only redesign of the horizontal 6 settled + 4 pending scorebar cards. Patch dashboard-v2-tune.css and its proven Worker owner literal to identical bytes. No API, board, signals, statistics, settlement, polling, sorting, routing, backend, or unrelated assets.'};
const save=()=>writeFileSync('audit/topcards-clean-ui-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const node=(p,args=[])=>{const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)};
let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback topcards clean UI ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'css'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  report.assetBeforeSha=beforeSha;writeFileSync('audit/dashboard-v2-tune-before.css',before);
  for(const x of ['.workspace-scorebar-grid','.workspace-scorebar-cell','scorebar-win-20261002c.webp'])assert(beforeText.includes(x),`TOPCARDS_CSS_ANCHOR_MISSING:${x}`);
  assert(!beforeText.includes(MARK),'TOPCARDS_CLEAN_UI_ALREADY_LIVE_STOP');

  const beforeLiterals=literals(current.source),owner=beforeLiterals.get(OWNER);
  assert(owner,'SCOREBAR_CSS_WORKER_OWNER_LITERAL_MISSING');
  assert.equal(sha(Buffer.from(owner.value)),beforeSha,'SCOREBAR_CSS_WORKER_OWNER_NOT_PUBLIC_SOURCE');
  assert(current.source.includes(TARGET),'SCOREBAR_CSS_WORKER_ROUTE_REFERENCE_MISSING');
  report.ownerLiteral=OWNER;report.workerOwnerBeforeSha=sha(Buffer.from(owner.value));

  node('../../ops/ball46-topcards-clean-ui/patch-dashboard-v2-tune-20261004.js',['audit/dashboard-v2-tune-before.css','audit/dashboard-v2-tune-after.css']);
  const after=readFileSync('audit/dashboard-v2-tune-after.css'),afterText=after.toString('utf8'),afterSha=sha(after);report.assetAfterSha=afterSha;
  for(const x of [MARK,'grid-template-columns:repeat(10,minmax(136px,1fr))','--b46-card-accent:#22c55e','--b46-card-accent:#ef4444','--b46-card-accent:#f59e0b','background:#111922!important'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert.equal((beforeText.match(/@import\b/g)||[]).length,(afterText.match(/@import\b/g)||[]).length,'CSS_IMPORT_COUNT_CHANGED');

  const patchedSource=current.source.slice(0,owner.start)+JSON.stringify(afterText)+current.source.slice(owner.end);
  writeFileSync('audit/index-topcards-clean-ui-after.js',patchedSource);
  node('--check',['audit/index-topcards-clean-ui-after.js']);
  const patchedLiterals=literals(patchedSource),patchedOwner=patchedLiterals.get(OWNER);
  assert(patchedOwner,'PATCHED_SCOREBAR_CSS_OWNER_LITERAL_MISSING');
  assert.equal(sha(Buffer.from(patchedOwner.value)),afterSha,'PATCHED_SCOREBAR_CSS_OWNER_SHA_MISMATCH');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');
  for(const [name,lit] of beforeLiterals){if(name===OWNER)continue;const next=patchedLiterals.get(name);assert(next,`WORKER_LITERAL_REMOVED:${name}`);assert.equal(sha(Buffer.from(next.value)),sha(Buffer.from(lit.value)),`UNRELATED_WORKER_LITERAL_CHANGED:${name}`)}
  report.workerOwnerAfterSha=sha(Buffer.from(patchedOwner.value));

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT_PRODUCTION');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];report.assetCount=Object.keys(staged.hashes).length;report.protectedAssetCount=Object.keys(protectedAssets).length;
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_TARGET_SHA_BAD');report.workerAndStaticTargetIdentical=true;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('BALL46_TOPCARDS_CLEAN_UI_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const direct=await publicFile('/'+TARGET,'css',directOrigin);directOk=sha(direct)===afterSha&&direct.toString('utf8').includes(MARK);if(directOk)break}catch{}await delay(1250)}assert(directOk,'TOPCARDS_CLEAN_UI_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false,publicAttempts=0,lastPublicSha=null;for(let attempt=0;attempt<45;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_PROPAGATION_STOP');publicAttempts=attempt+1;try{const live=await publicFile('/'+TARGET,'css');lastPublicSha=sha(live);if(lastPublicSha===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(2000)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,attempts:publicAttempts,lastPublicSha,verificationOrigin:publicOk?'ball46.com':'direct-worker'};save();
    let stable=false,lastDiff={};for(let attempt=1;attempt<=12;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;break}await delay(2500)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);
    const candidateMain=cv.modules.find(m=>m.name===cv.main_module);assert(candidateMain,'FINAL_MAIN_MODULE_MISSING');const candidateSource=Buffer.from(candidateMain.content_base64,'base64').toString('utf8');const candidateLiterals=literals(candidateSource),candidateOwner=candidateLiterals.get(OWNER);assert(candidateOwner,'FINAL_SCOREBAR_CSS_OWNER_LITERAL_MISSING');assert.equal(sha(Buffer.from(candidateOwner.value)),afterSha,'FINAL_SCOREBAR_CSS_OWNER_LITERAL_SHA_BAD');assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(candidateSource.match(/\bfetch\(/g)||[]).length,'FINAL_WORKER_FETCH_COUNT_CHANGED');
    for(const [name,lit] of beforeLiterals){if(name===OWNER)continue;const next=candidateLiterals.get(name);assert(next,`FINAL_WORKER_LITERAL_REMOVED:${name}`);assert.equal(sha(Buffer.from(next.value)),sha(Buffer.from(lit.value)),`FINAL_UNRELATED_WORKER_LITERAL_CHANGED:${name}`)}
    const final=await publicFile('/'+TARGET,'css',verificationOrigin);assert.equal(sha(final),afterSha,'FINAL_TARGET_SHA_BAD');assert(final.toString('utf8').includes(MARK),'FINAL_TOPCARDS_MARKER_MISSING');assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    report.finalVersion=candidate;report.result='SUCCESS';report.workerChangeScope='OWNER_LITERAL_ONLY';report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.unrelatedWorkerLiteralsUntouched=true;report.apiCallsAdded=0;report.pollCadenceChanged=false;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`TOPCARDS_CSS_SHA=${afterSha}`);console.log(`WORKER_OWNER_LITERAL=${OWNER}`);console.log('BALL46_TOPCARDS_CLEAN_UI_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
