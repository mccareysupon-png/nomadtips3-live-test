import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/eventflow-live-score-header-20261004';
const TARGET='dashboard-v2-stage3.js';
const MARK='B46_STABLE_RIGHT_SIGNAL_DOM_20261005';
const EXPECTED_BEFORE='c22c9c5899210fef66b194964bdc62799cb25c25028493747366099320b68d97';
const deploy=process.env.DEPLOY_ENABLED==='true';
const HELPER=String.raw`
/* B46_STABLE_RIGHT_SIGNAL_DOM_20261005 — keyed direct children; preserve unchanged signal DOM nodes */
function featureSignalKey(s,i){const raw=s?.id??s?.signalId??s?.signalKey??[s?.fixtureId,s?.market,s?.marketLabel,s?.selection,s?.line,s?.entryMinute,s?.createdAt].filter(v=>v!==null&&v!==undefined&&v!=='').join('|');return String(raw||('signal-'+i))}
function newFeatureSignalParts(s,key){const html=signalDetailsHtml(s),tpl=document.createElement('template');tpl.innerHTML=html;const parts=[...tpl.content.children];parts.forEach((node,i)=>{node.dataset.b46FeatureSignalKey=key;node.dataset.b46FeatureSignalPart=String(i)});if(parts[0])parts[0].dataset.b46SignalHtml=html;return parts}
function newFeatureSignalDivider(key){const node=document.createElement('div');node.className='feature-signal-divider';node.setAttribute('aria-hidden','true');node.style.cssText='height:1px;background:var(--line);margin:8px 0';node.dataset.b46FeatureSignalKey=key;node.dataset.b46FeatureSignalPart='divider';return node}
function patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];if(!rows.length){if(host.dataset.b46StableSignalState!=='empty'||host.innerHTML!==emptyHtml){host.innerHTML=emptyHtml;host.dataset.b46StableSignalState='empty'}return}let children=[...host.children];if(children.some(node=>!node.dataset?.b46FeatureSignalKey)){host.replaceChildren();children=[]}const groups=new Map();for(const node of children){const key=node.dataset.b46FeatureSignalKey;if(!groups.has(key))groups.set(key,{divider:null,parts:[]});const g=groups.get(key);if(node.dataset.b46FeatureSignalPart==='divider')g.divider=node;else g.parts.push(node)}const desiredKeys=rows.map(featureSignalKey);for(const [key,g] of groups){if(!desiredKeys.includes(key)){if(g.divider)g.divider.remove();g.parts.forEach(node=>node.remove());groups.delete(key)}}const desiredNodes=[];rows.forEach((s,i)=>{const key=desiredKeys[i];let g=groups.get(key)||{divider:null,parts:[]};const html=signalDetailsHtml(s),same=g.parts.length>0&&g.parts[0].dataset.b46SignalHtml===html;if(!same){g.parts.forEach(node=>node.remove());g.parts=newFeatureSignalParts(s,key)}if(i>0){if(!g.divider)g.divider=newFeatureSignalDivider(key);desiredNodes.push(g.divider)}else if(g.divider){g.divider.remove();g.divider=null}desiredNodes.push(...g.parts);groups.set(key,g)});desiredNodes.forEach((node,i)=>{if(host.children[i]!==node)host.insertBefore(node,host.children[i]||null)});host.dataset.b46StableSignalState=desiredKeys.join('|')}
`;
const OLD_RENDER="if(signal){signal.innerHTML=hasSignals?signalHtml:'No active signal';signal.classList.toggle('locked',hasSignals);signal.title=hasSignals?signalTitle:''}const prediction=$('[data-prediction-content]');if(prediction){prediction.innerHTML=hasSignals?signalHtml:'<div class=\"feature-empty\">WATCH · NO LIVE PICK</div>';prediction.classList.toggle('locked',hasSignals);prediction.title=hasSignals?signalTitle:'No active live prediction'}";
const NEW_RENDER="if(signal){patchFeatureSignalHost(signal,sigs,'No active signal');signal.classList.toggle('locked',hasSignals);signal.title=hasSignals?signalTitle:''}const prediction=$('[data-prediction-content]');if(prediction){patchFeatureSignalHost(prediction,sigs,'<div class=\"feature-empty\">WATCH · NO LIVE PICK</div>');prediction.classList.toggle('locked',hasSignals);prediction.title=hasSignals?signalTitle:'No active live prediction'}";
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Right-side Featured Signal DOM stability only. Preserve unchanged direct child signal nodes; insert/remove/update only affected signal DOM. No engine, odds, API, statistics, backend or unrelated asset changes.'};
const save=()=>writeFileSync('audit/right-signal-stability-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;
function checkFile(path){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_CHECK_FAILED:${r.error?.message||r.status}`)}
function patchDashboard(source){
  assert(!source.includes(MARK),'PATCH_ALREADY_PRESENT_STOP');
  const needle='function signalDetailsHtml(s)';
  assert.equal(source.split(needle).length-1,1,'SIGNAL_DETAILS_ANCHOR_COUNT_BAD');
  const start=source.indexOf(needle),lineEnd=source.indexOf('\n',start);
  assert(start>=0&&lineEnd>start,'SIGNAL_DETAILS_LINE_END_MISSING');
  assert.equal(source.split(OLD_RENDER).length-1,1,'RENDER_FEATURED_TARGET_COUNT_BAD');
  let next=source.slice(0,lineEnd)+HELPER+source.slice(lineEnd);
  next=next.replace(OLD_RENDER,NEW_RENDER);
  assert(next.includes(MARK),'PATCH_MARKER_MISSING');
  assert.equal((source.match(/\bfetch\(/g)||[]).length,(next.match(/\bfetch\(/g)||[]).length,'FETCH_COUNT_CHANGED');
  assert(!next.includes("signal.innerHTML=hasSignals?signalHtml"),'LEGACY_SIGNAL_REDRAW_REMAINS');
  assert(next.includes('patchFeatureSignalHost(signal,sigs'),'SIGNAL_PATCH_MISSING');
  assert(next.includes('patchFeatureSignalHost(prediction,sigs'),'PREDICTION_PATCH_MISSING');
  return next;
}
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback right signal stability ${report.run}`}})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:current.restore.version};save()}
try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const mod=await import('./production.mjs');current=await mod.inspect();
  const base=current.restore.version;report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'javascript'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  report.dashboardBeforeSha=beforeSha;writeFileSync('audit/dashboard-v2-stage3-before.js',before);
  assert.equal(beforeSha,EXPECTED_BEFORE,'DASHBOARD_BASELINE_MOVED_STOP');
  assert(beforeText.includes('B46_MULTI_SIGNAL_CARD_20261002'),'MULTI_SIGNAL_BASE_MISSING');
  assert(beforeText.includes('function renderFeatured()'),'RENDER_FEATURED_MISSING');
  const afterText=patchDashboard(beforeText),after=Buffer.from(afterText),afterSha=sha(after);report.dashboardAfterSha=afterSha;
  writeFileSync('audit/dashboard-v2-stage3-after.js',after);checkFile('audit/dashboard-v2-stage3-after.js');
  const lit=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(lit,'MULTI_SIGNAL_LITERAL_MISSING');assert.equal(sha(lit.value),beforeSha,'WORKER_DASHBOARD_LITERAL_NOT_PUBLIC_SOURCE');
  const patchedSource=current.source.slice(0,lit.start)+JSON.stringify(afterText)+current.source.slice(lit.end);writeFileSync('audit/index-right-signal-after.js',patchedSource);checkFile('audit/index-right-signal-after.js');
  assert(patchedSource.includes(MARK),'WORKER_PATCH_MARKER_MISSING');assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_DASHBOARD_NOT_CURRENT_PRODUCTION');report.assetCount=79;report.staticAssetsBefore=staged.hashes;save();
  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('RIGHT_SIGNAL_STABILITY_PREVIEW_PASS');process.exit(0)}
  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let publicOk=false;for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY_STOP');try{const live=await publicFile('/'+TARGET,'javascript');if(sha(live)===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(1250)}assert(publicOk,'RIGHT_SIGNAL_PATCH_NOT_PUBLIC_STOP');
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];let stable=false,lastDiff={};for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_ALL_${Object.keys(staged.hashes).length}_ASSETS_MATCH attempt=${attempt}`);break}await delay(3000)}assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const final=await publicFile('/'+TARGET,'javascript'),ft=final.toString('utf8');assert.equal(sha(final),afterSha,'FINAL_DASHBOARD_SHA_BAD');assert(ft.includes(MARK),'FINAL_MARKER_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.staticAssetsUntouched=true;report.signalLogicChanged=false;report.apiCallsAdded=0;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`RIGHT_SIGNAL_STABILITY_SHA=${afterSha}`);console.log('BALL46_RIGHT_SIGNAL_STABILITY_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
