import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { activeVersion, getVersion, api, script, sha, canonical, publicFile, backend, literals } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

const BRANCH='work/eventflow-live-score-header-20261004';
const MARK='B46_STABLE_RIGHT_SIGNAL_DOM_20261005';
const EXPECTED_BEFORE='dc09030bdc94b89874386d4b894fd5b9232bb4afc5522a493b1be60da75095a9';
const TARGET='dashboard-v2-stage3.js';
const deploy=process.env.DEPLOY_ENABLED==='true';
const ANCHOR="function signalDetailsHtml(s){if(!s)return'No active signal';const selection=String(s?.selection||'—').toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL'),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'—'),entryMin=num(s?.entryMinute??s?.minute),liveMin=num(s?.mirrorMinute),entry=pair(s?.entryScore??s?.scoreAt),live=pair(s?.mirrorScore),lineText=line===null?'—':`${line>0?'+':''}${show(line,2)}`,entryScore=entry.home===null||entry.away===null?'—':`${show(entry.home)}–${show(entry.away)}`,liveScore=live.home===null||live.away===null?'—':`${show(live.home)}–${show(live.away)}`;return `<div class=\"feature-signal-main\"><b>${esc(selection)}</b><span>${esc(market)}</span></div><div class=\"feature-signal-meta\"><span>Line ${esc(lineText)}</span><span>Odds ${esc(odds===null?'—':odds.toFixed(2))}</span><span>${esc(book)}</span></div><div class=\"feature-signal-meta\"><span>Signal ${esc(entryMin===null?'—':`${Math.round(entryMin)}'`)}</span><span>Entry ${esc(entryScore)}</span><span>Live ${esc(liveMin===null?'—':`${Math.round(liveMin)}'`)} · ${esc(liveScore)}</span></div>`}";
const INSERT="function signalDetailsHtml(s){if(!s)return'No active signal';const selection=String(s?.selection||'—').toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL'),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'—'),entryMin=num(s?.entryMinute??s?.minute),liveMin=num(s?.mirrorMinute),entry=pair(s?.entryScore??s?.scoreAt),live=pair(s?.mirrorScore),lineText=line===null?'—':`${line>0?'+':''}${show(line,2)}`,entryScore=entry.home===null||entry.away===null?'—':`${show(entry.home)}–${show(entry.away)}`,liveScore=live.home===null||live.away===null?'—':`${show(live.home)}–${show(live.away)}`;return `<div class=\"feature-signal-main\"><b>${esc(selection)}</b><span>${esc(market)}</span></div><div class=\"feature-signal-meta\"><span>Line ${esc(lineText)}</span><span>Odds ${esc(odds===null?'—':odds.toFixed(2))}</span><span>${esc(book)}</span></div><div class=\"feature-signal-meta\"><span>Signal ${esc(entryMin===null?'—':`${Math.round(entryMin)}'`)}</span><span>Entry ${esc(entryScore)}</span><span>Live ${esc(liveMin===null?'—':`${Math.round(liveMin)}'`)} · ${esc(liveScore)}</span></div>`}\n/* B46_STABLE_RIGHT_SIGNAL_DOM_20261005 — keep existing signal nodes; add/remove only changed signals */\nfunction featureSignalKey(s,i){const raw=s?.id??s?.signalId??s?.signalKey??[s?.fixtureId,s?.market,s?.marketLabel,s?.selection,s?.line,s?.entryMinute,s?.createdAt].filter(v=>v!==null&&v!==undefined&&v!=='').join('|');return String(raw||`signal-${i}`)}\nfunction patchFeatureSignalHost(host,sigs,emptyHtml){if(!host)return;const rows=Array.isArray(sigs)?sigs:[];if(!rows.length){if(host.dataset.b46StableSignalState!=='empty'||host.innerHTML!==emptyHtml){host.innerHTML=emptyHtml;host.dataset.b46StableSignalState='empty'}return}const children=[...host.children],existing=new Map();let stable=true;for(const child of children){const key=child.dataset?.b46FeatureSignalKey;if(!key){stable=false;break}existing.set(key,child)}if(!stable){host.replaceChildren();existing.clear()}const desired=[];rows.forEach((s,i)=>{const key=featureSignalKey(s,i);let node=existing.get(key);if(!node){node=document.createElement('div');node.dataset.b46FeatureSignalKey=key;node.style.display='contents'}const html=(i?'<div class=\"feature-signal-divider\" aria-hidden=\"true\" style=\"height:1px;background:var(--line);margin:8px 0\"></div>':'')+signalDetailsHtml(s);if(node.innerHTML!==html)node.innerHTML=html;desired.push(node)});for(const [key,node] of existing){if(!desired.includes(node))node.remove()}desired.forEach((node,i)=>{if(host.children[i]!==node)host.insertBefore(node,host.children[i]||null)});host.dataset.b46StableSignalState=desired.map(n=>n.dataset.b46FeatureSignalKey).join('|')}";
const OLD_RENDER="if(signal){signal.innerHTML=hasSignals?signalHtml:'No active signal';signal.classList.toggle('locked',hasSignals);signal.title=hasSignals?signalTitle:''}const prediction=$('[data-prediction-content]');if(prediction){prediction.innerHTML=hasSignals?signalHtml:'<div class=\"feature-empty\">WATCH · NO LIVE PICK</div>';prediction.classList.toggle('locked',hasSignals);prediction.title=hasSignals?signalTitle:'No active live prediction'}";
const NEW_RENDER="if(signal){patchFeatureSignalHost(signal,sigs,'No active signal');signal.classList.toggle('locked',hasSignals);signal.title=hasSignals?signalTitle:''}const prediction=$('[data-prediction-content]');if(prediction){patchFeatureSignalHost(prediction,sigs,'<div class=\"feature-empty\">WATCH · NO LIVE PICK</div>');prediction.classList.toggle('locked',hasSignals);prediction.title=hasSignals?signalTitle:'No active live prediction'}";
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Right-side Featured Signal DOM stability only: preserve existing signal nodes and insert/remove keyed signal nodes; no engine, odds, API, statistics, backend or unrelated asset changes.'};
const save=()=>writeFileSync('audit/right-signal-stability-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;

function patchDashboard(source){
  assert.equal((source.match(new RegExp(MARK,'g'))||[]).length,0,'PATCH_ALREADY_PRESENT_STOP');
  assert.equal(source.split(ANCHOR).length-1,1,'SIGNAL_DETAILS_ANCHOR_COUNT_BAD');
  assert.equal(source.split(OLD_RENDER).length-1,1,'RENDER_FEATURED_TARGET_COUNT_BAD');
  const next=source.replace(ANCHOR,INSERT).replace(OLD_RENDER,NEW_RENDER);
  assert(next.includes(MARK),'PATCH_MARKER_MISSING');
  assert(next.includes('patchFeatureSignalHost(signal,sigs'), 'SIGNAL_HOST_PATCH_MISSING');
  assert(next.includes('patchFeatureSignalHost(prediction,sigs'), 'PREDICTION_HOST_PATCH_MISSING');
  assert.equal((source.match(/\bfetch\(/g)||[]).length,(next.match(/\bfetch\(/g)||[]).length,'FETCH_COUNT_CHANGED');
  return next;
}

async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback right signal stability ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspectProduction();
  const base=current.restore.version;
  report.baseVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'javascript'),beforeText=before.toString('utf8'),beforeSha=sha(before);
  report.dashboardBeforeSha=beforeSha;
  assert.equal(beforeSha,EXPECTED_BEFORE,'DASHBOARD_BASELINE_MOVED_STOP');
  assert(beforeText.includes('B46_MULTI_SIGNAL_CARD_20261002'),'MULTI_SIGNAL_BASE_MISSING');
  assert(beforeText.includes("function renderFeatured()"),'RENDER_FEATURED_MISSING');
  writeFileSync('audit/dashboard-v2-stage3-before.js',before);
  const afterText=patchDashboard(beforeText),after=Buffer.from(afterText),afterSha=sha(after);
  report.dashboardAfterSha=afterSha;writeFileSync('audit/dashboard-v2-stage3-after.js',after);
  const lit=literals(current.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');
  assert(lit,'MULTI_SIGNAL_LITERAL_MISSING');
  assert.equal(sha(lit.value),beforeSha,'WORKER_DASHBOARD_LITERAL_NOT_PUBLIC_SOURCE');
  const patchedSource=current.source.slice(0,lit.start)+JSON.stringify(afterText)+current.source.slice(lit.end);
  writeFileSync('audit/index-right-signal-after.js',patchedSource);
  assert(patchedSource.includes(MARK),'WORKER_PATCH_MARKER_MISSING');
  assert.equal((current.source.match(/\bfetch\(/g)||[]).length,(patchedSource.match(/\bfetch\(/g)||[]).length,'WORKER_FETCH_COUNT_CHANGED');
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);
  await verifyRailBase(staged);
  assert.equal(Object.keys(staged.hashes).length,79,'ASSET_COUNT_CHANGED');
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_DASHBOARD_NOT_CURRENT_PRODUCTION');
  report.assetCount=79;report.staticAssetsBefore=staged.hashes;save();
  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY_STOP');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('RIGHT_SIGNAL_STABILITY_PREVIEW_PASS');process.exit(0)}
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();
    let publicOk=false;
    for(let i=0;i<36;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY_STOP');try{const live=await publicFile('/'+TARGET,'javascript');if(sha(live)===afterSha&&live.toString('utf8').includes(MARK)){publicOk=true;break}}catch{}await delay(1250)}
    assert(publicOk,'RIGHT_SIGNAL_PATCH_NOT_PUBLIC_STOP');
    const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
    let stable=false,lastDiff={};
    for(let attempt=1;attempt<=16;attempt++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ASSET_VERIFY_STOP');const diff={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)diff[p]={expected:h,got}}lastDiff=diff;if(!Object.keys(diff).length){stable=true;console.log(`POST_ALL_${Object.keys(staged.hashes).length}_ASSETS_MATCH attempt=${attempt}`);break}await delay(3000)}
    assert(stable,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(lastDiff)}`);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configuration=verifyConfiguration(settingsBefore,settingsAfter);
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED_STOP');
    const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);
    const protectedPublic=Object.fromEntries(Object.entries(staged.hashes).map(([p,h])=>['/'+p,h]));
    report.publishedModules=verifyPublishedModules(cv,current.version,patchedSource,protectedPublic).map(x=>x.name);
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED_STOP');
    const final=await publicFile('/'+TARGET,'javascript'),ft=final.toString('utf8');
    assert.equal(sha(final),afterSha,'FINAL_DASHBOARD_SHA_BAD');assert(ft.includes(MARK),'FINAL_MARKER_MISSING');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.staticAssetsUntouched=true;report.signalLogicChanged=false;report.apiCallsAdded=0;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log(`RIGHT_SIGNAL_STABILITY_SHA=${afterSha}`);console.log('BALL46_RIGHT_SIGNAL_STABILITY_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}

async function inspectProduction(){
  const mod=await import('./production.mjs');
  return mod.inspect();
}
