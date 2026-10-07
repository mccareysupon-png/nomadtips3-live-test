import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-signal-activity-strip-20261007';
const INDEX='index.html';
const JS='dashboard-v2-stage3.js';
const CSS='dashboard-v2-tune.css';
const OLD_MARK='B46_FLAT_RESULT_CARDS_20261006';
const NEW_MARK='B46_SIGNAL_ACTIVITY_STRIP_20261007';
const deploy=process.env.DEPLOY_ENABLED==='true';

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Replace the current desktop 6+4 scorebar presentation with a source-level mini activity strip: 4 latest settled results plus every current pending signal. Remove the previous injected flat-card patch from index.html. Patch only current Production index.html, dashboard-v2-stage3.js and dashboard-v2-tune.css. Mobile V3, APIs, Worker source, bindings, schedules, statistics logic and every unrelated asset remain untouched.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  assert(first>=0,label+'_MISSING');
  assert.equal(text.indexOf(from,first+1),-1,label+'_DUPLICATE');
  return text.slice(0,first)+to+text.slice(first+from.length);
}

function cleanIndex(before){
  const styleRe=new RegExp('\\n?<!-- '+OLD_MARK+' STYLE START -->[\\s\\S]*?<!-- '+OLD_MARK+' STYLE END -->\\n?','g');
  const scriptRe=new RegExp('\\n?<!-- '+OLD_MARK+' SCRIPT START -->[\\s\\S]*?<!-- '+OLD_MARK+' SCRIPT END -->\\n?','g');
  const styleCount=(before.match(styleRe)||[]).length;
  const scriptCount=(before.match(scriptRe)||[]).length;
  assert.equal(styleCount,scriptCount,'OLD_FLAT_PATCH_PARTIAL');
  assert(styleCount<=1,'OLD_FLAT_PATCH_DUPLICATE');
  const after=before.replace(styleRe,'').replace(scriptRe,'');
  assert(!after.includes(OLD_MARK),'OLD_FLAT_PATCH_STILL_PRESENT');
  return {after,removed:styleCount===1};
}

function patchRenderer(before){
  assert(before.includes('function renderWorkspaceScorebar(){'),'SCOREBAR_RENDERER_MISSING');
  let after=before;
  after=replaceOnce(
    after,
    '.slice(0,6); const pending=signalRows.filter',
    '.slice(0,4); const pending=signalRows.filter',
    'RECENT_RESULT_CAP'
  );
  after=replaceOnce(
    after,
    ').slice(0,4); const makeSettled=x=>',
    '); const makeSettled=x=>',
    'PENDING_CAP'
  );

  const startNeedle='const a=recent.map(makeSettled),b=pending.map(makePending);';
  const endNeedle="} document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);";
  const start=after.indexOf(startNeedle);
  const end=after.indexOf(endNeedle,start);
  assert(start>=0&&end>start,'SCOREBAR_TAIL_NOT_FOUND');
  assert.equal(after.indexOf(startNeedle,start+1),-1,'SCOREBAR_TAIL_DUPLICATE');

  const replacement=`const a=recent.map(makeSettled),b=pending.map(makePending),items=a.concat(b);const empty='<div class="workspace-scorebar-cell workspace-scorebar-empty"><span>MONITORING SIGNALS</span></div>',itemHtml=(items.length?items:[empty]).join(''),group='<div class="workspace-scorebar-group">'+itemHtml+'</div>',markup='<div class="workspace-scorebar-grid b46-activity-strip"><div class="workspace-scorebar-track">'+group+'</div></div>';if(slot.__b46ScorebarMarkup===markup)return;slot.__b46ScorebarMarkup=markup;slot.innerHTML=markup;requestAnimationFrame(()=>{const viewport=slot.querySelector('.b46-activity-strip'),track=slot.querySelector('.workspace-scorebar-track'),first=slot.querySelector('.workspace-scorebar-group');if(!viewport||!track||!first)return;const shift=first.scrollWidth+6;if(shift>viewport.clientWidth+12){const clone=first.cloneNode(true);clone.classList.add('b46-scorebar-clone');clone.setAttribute('aria-hidden','true');track.appendChild(clone);track.style.setProperty('--b46-strip-shift','-'+shift+'px');track.style.setProperty('--b46-strip-duration',Math.max(20,Math.min(70,shift/28)).toFixed(1)+'s');track.classList.add('is-flowing')}}); `;
  after=after.slice(0,start)+replacement+after.slice(end);

  assert(after.includes('.slice(0,4); const pending=signalRows.filter'),'RECENT_4_NOT_SET');
  assert(!after.includes(').slice(0,4); const makeSettled=x=>'),'PENDING_STILL_CAPPED');
  assert(after.includes('b46-activity-strip')&&after.includes('workspace-scorebar-group')&&after.includes('is-flowing'),'ACTIVITY_RENDERER_INCOMPLETE');
  assert(!after.includes('while(a.length<6)'),'OLD_RESULT_PLACEHOLDERS_PRESENT');
  assert(!after.includes('while(b.length<4)'),'OLD_PENDING_PLACEHOLDERS_PRESENT');
  parse(after,{ecmaVersion:'latest',sourceType:'script'});
  return after;
}

function patchCss(before,newBlock){
  assert(before.includes('BALL46_SCOREBAR_DETAILS_20260929'),'CURRENT_SCOREBAR_DETAILS_MISSING');
  assert(before.includes('BALL46_SCOREBAR_IMAGES_20260929'),'CURRENT_SCOREBAR_IMAGES_MISSING');
  const re=new RegExp('/\\* '+NEW_MARK+'[\\s\\S]*?END '+NEW_MARK+' \\*/\\s*','g');
  const clean=before.replace(re,'');
  const wrapped='\\n\\n/* '+NEW_MARK+' START */\\n'+newBlock.trim()+'\\n/* END '+NEW_MARK+' */\\n';
  const after=clean+wrapped;
  assert(after.includes('#149447')&&after.includes('#d43d4f')&&after.includes('#667085'),'RESULT_COLORS_MISSING');
  assert(after.includes('background:#fff!important'),'PENDING_WHITE_MISSING');
  assert(after.includes('height:58px!important'),'MINI_HEIGHT_MISSING');
  assert(after.includes('background-image:none!important'),'LEGACY_IMAGE_OVERRIDE_MISSING');
  assert(after.includes('workspace-scorebar-track.is-flowing'),'FLOW_STYLE_MISSING');
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){
    report.rollback={status:'base-still-active',version:active};save();return;
  }
  if(candidate&&active!==candidate){
    report.rollback={status:'skipped-foreign-active',version:active};save();return;
  }
  await api(`/scripts/${script}/deployments`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:current.restore.version,percentage:100}],
      annotations:{'workers/message':`Rollback Ball46 signal activity strip ${report.run}`}
    })
  });
  for(let i=0;i<20;i++){
    if(await activeVersion()===current.restore.version)break;
    await delay(1000);
  }
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const styleBlock=readFileSync('style.css','utf8');
  assert(styleBlock.includes(NEW_MARK),'STYLE_MARKER_MISSING');

  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.rollbackVersion=base;
  report.backendBefore=current.restore.backend;

  const workerBeforeSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const before={};
  for(const p of [INDEX,JS,CSS]){
    const bytes=await publicFile('/'+p);
    before[p]={bytes,sha:sha(bytes),text:bytes.toString('utf8')};
    writeFileSync('audit/'+p.replaceAll('/','__')+'.before',bytes);
  }
  report.beforeShas=Object.fromEntries(Object.entries(before).map(([p,v])=>[p,v.sha]));

  assert(before[JS].text.includes('first 6 = latest settled Ball46 predictions; last 4 = active PENDING Ball46 signals only'),'CURRENT_RENDERER_SIGNATURE_CHANGED');
  assert(before[CSS].text.includes('scorebar-win-20261002c.webp'),'CURRENT_DESKTOP_SCOREBAR_IMAGE_SIGNATURE_CHANGED');

  const indexPatched=cleanIndex(before[INDEX].text);
  const jsPatched=patchRenderer(before[JS].text);
  const cssPatched=patchCss(before[CSS].text,styleBlock);

  const patched={
    [INDEX]:Buffer.from(indexPatched.after),
    [JS]:Buffer.from(jsPatched),
    [CSS]:Buffer.from(cssPatched)
  };
  report.removedOldInjectedPatch=indexPatched.removed;
  report.afterShas=Object.fromEntries(Object.entries(patched).map(([p,v])=>[p,sha(v)]));
  for(const [p,bytes] of Object.entries(patched)){
    assert.notEqual(sha(bytes),before[p].sha,p+'_UNCHANGED');
    writeFileSync('audit/'+p.replaceAll('/','__')+'.after',bytes);
  }

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  for(const p of [INDEX,JS,CSS])assert.equal(staged.hashes[p],before[p].sha,'STAGED_NOT_CURRENT:'+p);

  const protectedAssets={...staged.hashes};
  for(const p of [INDEX,JS,CSS])delete protectedAssets[p];

  for(const [p,bytes] of Object.entries(patched)){
    writeFileSync(resolve(staged.runtime,'assets',p),bytes);
    assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',p))),sha(bytes),'STAGED_PATCH_SHA_BAD:'+p);
  }

  report.protectedAssetCount=Object.keys(protectedAssets).length;
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion=base;
    report.completedAt=new Date().toISOString();
    save();
    console.log('BALL46_SIGNAL_ACTIVITY_STRIP_PREVIEW_PASS');
    process.exit(0);
  }

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){
      const a=await activeVersion();
      if(a!==base){candidate=a;break}
      await delay(1200);
    }
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<36;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{
        const checks=await Promise.all([INDEX,JS,CSS].map(async p=>sha(await publicFile('/'+p,undefined,directOrigin))===sha(patched[p])));
        if(checks.every(Boolean)){directOk=true;break}
      }catch{}
      await delay(1100);
    }
    assert(directOk,'PATCHED_ASSETS_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<36;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const got={};
        for(const p of [INDEX,JS,CSS])got[p]=await publicFile('/'+p);
        if([INDEX,JS,CSS].every(p=>sha(got[p])===sha(patched[p]))){
          const indexText=got[INDEX].toString('utf8'),jsText=got[JS].toString('utf8'),cssText=got[CSS].toString('utf8');
          assert(!indexText.includes(OLD_MARK),'OLD_INDEX_PATCH_PUBLIC');
          assert(jsText.includes('b46-activity-strip')&&jsText.includes('.slice(0,4); const pending=signalRows.filter'),'NEW_RENDERER_NOT_PUBLIC');
          assert(cssText.includes(NEW_MARK)&&cssText.includes('background:#fff!important'),'NEW_STYLE_NOT_PUBLIC');
          publicOk=true;break;
        }
      }catch{}
      await delay(1300);
    }
    assert(publicOk,'PATCHED_ASSETS_NOT_PUBLIC');

    const changed={};
    for(const [p,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+p));
      if(got!==h)changed[p]={expected:h,got};
    }
    assert.equal(Object.keys(changed).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(changed));

    const [boardJson,signalsJson,statsJson]=await Promise.all([
      '/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'
    ].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,statisticsRows:statsJson.rows.length,pending:statsJson.pending};

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate);
    const cm=cv.modules.find(m=>m.name===cv.main_module);
    assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerBeforeSha,'WORKER_SOURCE_CHANGED');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;
    report.workerSourceUntouched=true;
    report.backendUntouched=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.changedAssets=[INDEX,JS,CSS];
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+base);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+sha(patched[INDEX]));
    console.log('JS_SHA='+sha(patched[JS]));
    console.log('CSS_SHA='+sha(patched[CSS]));
    console.log('BALL46_SIGNAL_ACTIVITY_STRIP_SUCCESS');
  }catch(e){
    report.error=e.message;
    try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}
    throw e;
  }
}catch(e){
  report.result='FAIL_STOPPED';
  report.error=e.message;
  report.completedAt=new Date().toISOString();
  save();
  console.error(e.stack);
  process.exitCode=1;
}
