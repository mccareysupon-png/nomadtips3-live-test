import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/featured-signal-dark-card-20261004';
const TARGET='dashboard-v2-tune.css';
const OWNER='__B46_SCOREBAR_TUNE_CSS__';
const DASH='__B46_MULTI_SIGNAL_STAGE3_JS__';
const EVENT='__B46_EVENTFLOW_SIGNAL_JS_20261002__';
const MARK='B46_FEATURED_SIGNAL_DARK_CARD_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Presentation-only Featured Match active Signal card: near-black charcoal #111514, green #2ACF83 visual 1px frame and subtle glow. No Signal logic, data, API, polling, card geometry, Event Flow, Statistics, backend, routing or unrelated UI changes.'};
const save=()=>writeFileSync('audit/featured-signal-dark-card-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Featured Signal dark card ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const all=literals(current.source),owner=all.get(OWNER),dashboard=all.get(DASH),eventOwner=all.get(EVENT);
  assert(owner,'PRESENTATION_CSS_OWNER_LITERAL_MISSING');assert(dashboard,'DASHBOARD_OWNER_LITERAL_MISSING');assert(eventOwner,'EVENTFLOW_OWNER_LITERAL_MISSING');
  const before=await publicFile('/'+TARGET,'css'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  assert.equal(sha(Buffer.from(owner.value)),beforeSha,'PRESENTATION_CSS_OWNER_NOT_PUBLIC_SOURCE');
  for(const x of ['B46_EXPANDED_UNIFIED_GREEN_FRAME_20261004','B46_MATCH_CARD_THEME_CONTRAST_20261004'])assert(beforeText.includes(x),`BASE_CSS_MARKER_MISSING:${x}`);
  assert(!beforeText.includes(MARK),'FEATURED_SIGNAL_DARK_CARD_ALREADY_PRESENT_STOP');
  for(const x of ['function renderFeatured()','[data-featured-signal]','signal.classList.toggle(\'locked\',hasSignals)','signalDetailsHtml','B46_STABLE_MATCH_CARD_DOM_20261004','B46_CARD_SIGNAL_MORE_COMPACT_20261004'])assert(dashboard.value.includes(x),`FEATURED_SIGNAL_OWNER_ANCHOR_MISSING:${x}`);
  const dashboardBeforeSha=sha(Buffer.from(dashboard.value));
  const eventBefore=await publicFile('/expanded-match-343.js','javascript'),eventBeforeSha=sha(eventBefore);assert.equal(sha(Buffer.from(eventOwner.value)),eventBeforeSha,'EVENTFLOW_OWNER_NOT_PUBLIC_SOURCE');
  report.cssBeforeSha=beforeSha;report.dashboardBeforeSha=dashboardBeforeSha;report.eventFlowBeforeSha=eventBeforeSha;writeFileSync('audit/dashboard-v2-tune-before-featured-signal.css',before);save();

  node('../../ops/ball46-card-stability/patch-featured-signal-dark-card-20261004.js',['audit/dashboard-v2-tune-before-featured-signal.css','audit/dashboard-v2-tune-after-featured-signal.css']);
  const after=readFileSync('audit/dashboard-v2-tune-after-featured-signal.css'),afterText=after.toString('utf8'),afterSha=sha(after);report.cssAfterSha=afterSha;
  for(const x of [MARK,'.featured-card [data-featured-signal].locked','background: #111514 !important','border-color: #2ACF83 !important','inset 0 0 0 1px #2ACF83'])assert(afterText.includes(x),`PATCH_VERIFY_MISSING:${x}`);
  assert.equal((afterText.match(new RegExp(MARK,'g'))||[]).length,1,'MARKER_COUNT_BAD');
  const delta=afterText.slice(beforeText.length);for(const bad of ['padding:','margin:','width:','height:','border-width:','border-style:','transform:','display:','position:'])assert(!delta.includes(bad),`GEOMETRY_OR_LAYOUT_CHANGE_STOP:${bad}`);

  const patchedSource=current.source.slice(0,owner.start)+JSON.stringify(afterText)+current.source.slice(owner.end);
  writeFileSync('audit/index-featured-signal-dark-card-after.js',patchedSource);node('--check',['audit/index-featured-signal-dark-card-after.js']);
  const patchedAll=literals(patchedSource),patchedOwner=patchedAll.get(OWNER);assert(patchedOwner,'PATCHED_CSS_OWNER_MISSING');assert.equal(sha(Buffer.from(patchedOwner.value)),afterSha,'PATCHED_CSS_OWNER_SHA_MISMATCH');
  assert.equal(sha(Buffer.from(patchedAll.get(DASH).value)),dashboardBeforeSha,'DASHBOARD_JS_CHANGED_STOP');
  assert.equal(sha(Buffer.from(patchedAll.get(EVENT).value)),eventBeforeSha,'EVENTFLOW_JS_CHANGED_STOP');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT_PRODUCTION');assert.equal(staged.hashes['dashboard-v2-stage3.js'],dashboardBeforeSha,'STAGED_DASHBOARD_NOT_CURRENT_PRODUCTION');assert.equal(staged.hashes['expanded-match-343.js'],eventBeforeSha,'STAGED_EVENTFLOW_NOT_CURRENT_PRODUCTION');
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_TARGET_SHA_BAD');
  report.assetCount=79;report.protectedAssetCount=78;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('FEATURED_SIGNAL_DARK_CARD_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const live=await publicFile('/'+TARGET,'css',directOrigin);if(sha(live)===afterSha&&live.toString('utf8').includes(MARK)){directOk=true;break}}catch{}await delay(1250)}assert(directOk,'FEATURED_SIGNAL_DARK_CARD_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY_STOP');try{const live=await publicFile('/'+TARGET,'css');if(sha(live)===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(1500)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,verificationOrigin:publicOk?'ball46.com':'direct-worker'};
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_PROTECTED_${Object.keys(protectedAssets).length}_ASSETS_MATCH attempt=${attempt} origin=${publicOk?'public':'direct'}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MODULE_MISSING');const finalSource=Buffer.from(main.content_base64,'base64').toString('utf8'),finalAll=literals(finalSource);assert.equal(sha(Buffer.from(finalAll.get(OWNER).value)),afterSha,'FINAL_CSS_OWNER_SHA_BAD');assert.equal(sha(Buffer.from(finalAll.get(DASH).value)),dashboardBeforeSha,'FINAL_DASHBOARD_CHANGED');assert.equal(sha(Buffer.from(finalAll.get(EVENT).value)),eventBeforeSha,'FINAL_EVENTFLOW_CHANGED');
    const final=await publicFile('/'+TARGET,'css',verificationOrigin),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_TARGET_SHA_BAD');for(const x of [MARK,'.featured-card [data-featured-signal].locked','#111514','#2ACF83'])assert(ft.includes(x),`FINAL_VERIFY_MISSING:${x}`);
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.dashboardJsUntouched=true;report.eventFlowUntouched=true;report.apiCallsAdded=0;report.statisticsChanged=false;report.geometryChanged=false;report.signalLogicChanged=false;report.style={surface:'#111514',frame:'#2ACF83',frameVisualPx:1,glow:'subtle'};report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`FEATURED_SIGNAL_CSS_SHA=${afterSha}`);console.log('BALL46_FEATURED_SIGNAL_DARK_CARD_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}