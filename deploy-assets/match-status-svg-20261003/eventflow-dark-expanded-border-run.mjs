import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, directOrigin, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/eventflow-dark-expanded-border-20261004';
const LOCKED_BASE='0f4a94b4-d676-4d62-b4dd-aa409f23f678';
const CSS_TARGET='dashboard-v2-tune.css';
const CSS_OWNER='__B46_SCOREBAR_TUNE_CSS__';
const EVENT_OWNER='__B46_EVENTFLOW_SIGNAL_JS_20261002__';
const CSS_MARK='B46_MATCH_EXPANDED_OUTLINE_20261004';
const EVENT_MARK='B46_EVENTFLOW_DARK_SURFACE_20261004';
const deploy=process.env.DEPLOY_ENABLED==='true';
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Presentation only: extend the selected Dark match green edge around its inserted expanded panel, and make Event Flow/graph surface near-black in Dark Mode. Preserve layout geometry, Stable DOM, +More, Signal detection/annotations, API/fetch cadence, Statistics, backend, routing and unrelated assets.'};
const save=()=>writeFileSync('audit/eventflow-dark-expanded-border-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function node(p,args=[]){const r=spawnSync(process.execPath,[p,...args],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_STEP_FAILED:${p}:${r.error?.message||r.status}`)}
function replaceLiterals(source,replacements){let out=source;for(const {entry,text} of [...replacements].sort((a,b)=>b.entry.start-a.entry.start))out=out.slice(0,entry.start)+JSON.stringify(text)+out.slice(entry.end);return out}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Event Flow dark + expanded outline ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;assert.equal(base,LOCKED_BASE,'PRODUCTION_MOVED_SINCE_READ_ONLY_SCOUT_STOP');report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const ls=literals(current.source),cssOwner=ls.get(CSS_OWNER),eventOwner=ls.get(EVENT_OWNER);assert(cssOwner,'PRESENTATION_CSS_OWNER_LITERAL_MISSING');assert(eventOwner,'EVENTFLOW_LITERAL_MISSING');
  const cssBefore=await publicFile('/'+CSS_TARGET,'css'),cssBeforeText=cssBefore.toString('utf8'),cssBeforeSha=sha(cssBefore);
  const eventBefore=await publicFile('/expanded-match-343.js','javascript'),eventBeforeText=eventBefore.toString('utf8'),eventBeforeSha=sha(eventBefore);
  assert.equal(sha(Buffer.from(cssOwner.value)),cssBeforeSha,'PRESENTATION_CSS_OWNER_NOT_PUBLIC_SOURCE');assert.equal(sha(Buffer.from(eventOwner.value)),eventBeforeSha,'EVENTFLOW_OWNER_NOT_PUBLIC_SOURCE');
  for(const x of ['B46_MATCH_CARD_ACTIVE_DARK_GLOW_20261004','B46_MATCH_CARD_THEME_CONTRAST_20261004','.match-row.active'])assert(cssBeforeText.includes(x),`CSS_BASE_MISSING:${x}`);
  for(const x of ['B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004','B46_EVENTFLOW_EXPAND_MODE_20261004','B46_EVENTFLOW_LIVE_SCORE_HEADER_20261004','expand-flow-card','expand-flow-chart'])assert(eventBeforeText.includes(x),`EVENTFLOW_BASE_MISSING:${x}`);
  assert(!cssBeforeText.includes(CSS_MARK),'EXPANDED_OUTLINE_ALREADY_PRESENT_STOP');assert(!eventBeforeText.includes(EVENT_MARK),'EVENTFLOW_DARK_ALREADY_PRESENT_STOP');
  const dashboard=ls.get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(dashboard,'DASHBOARD_OWNER_LITERAL_MISSING');for(const x of ['B46_STABLE_MATCH_CARD_DOM_20261004','B46_CARD_SIGNAL_COUNT_COLLISION_FIX_20261004','B46_CARD_SIGNAL_MORE_COMPACT_20261004'])assert(dashboard.value.includes(x),`RECENT_CARD_BEHAVIOR_MISSING_STOP:${x}`);
  writeFileSync('audit/dashboard-v2-tune-before.css',cssBefore);writeFileSync('audit/expanded-match-before.js',eventBefore);report.cssBeforeSha=cssBeforeSha;report.eventBeforeSha=eventBeforeSha;save();

  node('../../ops/ball46-card-stability/patch-match-expanded-outline-20261004.js',['audit/dashboard-v2-tune-before.css','audit/dashboard-v2-tune-after.css']);
  node('../../ops/ball46-eventflow/patch-eventflow-dark-surface-20261004.js',['audit/expanded-match-before.js','audit/expanded-match-after.js']);node('--check',['audit/expanded-match-after.js']);
  const cssAfter=readFileSync('audit/dashboard-v2-tune-after.css'),cssAfterText=cssAfter.toString('utf8'),cssAfterSha=sha(cssAfter);
  const eventAfter=readFileSync('audit/expanded-match-after.js'),eventAfterText=eventAfter.toString('utf8'),eventAfterSha=sha(eventAfter);
  for(const x of [CSS_MARK,'.match-row[aria-expanded="true"] + .match-expanded','rgba(42,207,131,.34)'])assert(cssAfterText.includes(x),`CSS_PATCH_VERIFY_MISSING:${x}`);
  for(const x of [EVENT_MARK,'ensureEventFlowDarkSurfaceStyle','background:#030605!important','.expand-flow-card.b46-eventflow-viewport-expanded'])assert(eventAfterText.includes(x),`EVENT_PATCH_VERIFY_MISSING:${x}`);
  assert.equal((eventBeforeText.match(/\bfetch\(/g)||[]).length,(eventAfterText.match(/\bfetch\(/g)||[]).length,'EVENTFLOW_FETCH_COUNT_CHANGED');
  const cssDelta=cssAfterText.slice(cssBeforeText.length);for(const bad of ['padding:','margin:','width:','height:','border-width:','border-style:','transform:'])assert(!cssDelta.includes(bad),`GEOMETRY_CHANGE_STOP:${bad}`);

  const patchedSource=replaceLiterals(current.source,[{entry:cssOwner,text:cssAfterText},{entry:eventOwner,text:eventAfterText}]);writeFileSync('audit/index-eventflow-dark-expanded-border-after.js',patchedSource);node('--check',['audit/index-eventflow-dark-expanded-border-after.js']);
  const pls=literals(patchedSource),pc=pls.get(CSS_OWNER),pe=pls.get(EVENT_OWNER),pd=pls.get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(pc&&pe&&pd,'PATCHED_OWNER_MISSING');assert.equal(sha(Buffer.from(pc.value)),cssAfterSha,'PATCHED_CSS_OWNER_SHA_MISMATCH');assert.equal(sha(Buffer.from(pe.value)),eventAfterSha,'PATCHED_EVENT_OWNER_SHA_MISMATCH');assert.equal(sha(Buffer.from(pd.value)),sha(Buffer.from(dashboard.value)),'DASHBOARD_JS_CHANGED_STOP');assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes[CSS_TARGET],cssBeforeSha,'STAGED_CSS_NOT_CURRENT_PRODUCTION');assert.equal(staged.hashes['expanded-match-343.js'],eventBeforeSha,'STAGED_EVENTFLOW_ROUTE_NOT_CURRENT_PRODUCTION');
  writeFileSync(resolve(staged.runtime,'assets',CSS_TARGET),cssAfter);assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',CSS_TARGET))),cssAfterSha,'STAGED_CSS_SHA_BAD');report.assetCount=79;report.protectedAssetCount=77;report.cssAfterSha=cssAfterSha;report.eventAfterSha=eventAfterSha;save();

  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('EVENTFLOW_DARK_EXPANDED_BORDER_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_TARGET_VERIFY_STOP');try{const dc=await publicFile('/'+CSS_TARGET,'css',directOrigin),de=await publicFile('/expanded-match-343.js','javascript',directOrigin);directOk=sha(dc)===cssAfterSha&&sha(de)===eventAfterSha&&dc.toString('utf8').includes(CSS_MARK)&&de.toString('utf8').includes(EVENT_MARK);if(directOk)break}catch{}await delay(1250)}assert(directOk,'TARGETS_NOT_DIRECT_PRODUCTION_STOP');
    let publicOk=false,publicAttempts=0;for(let attempt=0;attempt<60;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_PROPAGATION_STOP');publicAttempts=attempt+1;try{const pcLive=await publicFile('/'+CSS_TARGET,'css'),peLive=await publicFile('/expanded-match-343.js','javascript');if(sha(pcLive)===cssAfterSha&&sha(peLive)===eventAfterSha&&pcLive.toString('utf8').includes(CSS_MARK)&&peLive.toString('utf8').includes(EVENT_MARK)){publicOk=true;break}}catch{}await delay(2000)}
    const verificationOrigin=publicOk?undefined:directOrigin;report.publicPropagation={published:publicOk,attempts:publicAttempts,verificationOrigin:publicOk?'ball46.com':'direct-worker'};report.publicPropagationPending=!publicOk;save();
    const protectedAssets={...staged.hashes};delete protectedAssets[CSS_TARGET];delete protectedAssets['expanded-match-343.js'];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p,undefined,verificationOrigin));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_PROTECTED_${Object.keys(protectedAssets).length}_ASSETS_MATCH attempt=${attempt} origin=${publicOk?'public':'direct'}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const candidateMain=cv.modules.find(m=>m.name===cv.main_module);assert(candidateMain,'FINAL_MAIN_MODULE_MISSING');const candidateSource=Buffer.from(candidateMain.content_base64,'base64').toString('utf8'),fl=literals(candidateSource);assert.equal(sha(Buffer.from(fl.get(CSS_OWNER)?.value||'')),cssAfterSha,'FINAL_CSS_OWNER_SHA_BAD');assert.equal(sha(Buffer.from(fl.get(EVENT_OWNER)?.value||'')),eventAfterSha,'FINAL_EVENT_OWNER_SHA_BAD');assert.equal(sha(Buffer.from(fl.get('__B46_MULTI_SIGNAL_STAGE3_JS__')?.value||'')),sha(Buffer.from(dashboard.value)),'FINAL_DASHBOARD_JS_CHANGED_STOP');
    const fc=await publicFile('/'+CSS_TARGET,'css',verificationOrigin),fe=await publicFile('/expanded-match-343.js','javascript',verificationOrigin);assert.equal(sha(fc),cssAfterSha,'FINAL_CSS_SHA_BAD');assert.equal(sha(fe),eventAfterSha,'FINAL_EVENTFLOW_SHA_BAD');assert(fc.toString('utf8').includes(CSS_MARK),'FINAL_CSS_MARKER_MISSING');assert(fe.toString('utf8').includes(EVENT_MARK),'FINAL_EVENT_MARKER_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.dashboardJsUntouched=true;report.apiCallsAdded=0;report.signalLogicChanged=false;report.statisticsChanged=false;report.stableDomPreserved=true;report.signalMorePreserved=true;report.geometryChanged=false;report.unrelatedPublicAssetsUntouched=true;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`MATCH_EXPANDED_OUTLINE_CSS_SHA=${cssAfterSha}`);console.log(`EVENTFLOW_DARK_SURFACE_SHA=${eventAfterSha}`);console.log('BALL46_EVENTFLOW_DARK_EXPANDED_BORDER_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
