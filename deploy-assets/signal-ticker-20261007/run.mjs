import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-signal-ticker-20261007';
const JS='dashboard-v2-stage3.js';
const CSS='dashboard-v2-tune.css';
const OLD_MARK='B46_SIGNAL_ACTIVITY_STRIP_20261007';
const NEW_MARK='B46_SIGNAL_TICKER_20261007';
const deploy=process.env.DEPLOY_ENABLED==='true';

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Convert the current desktop Ball46 activity strip into a 100% transparent stock-style one-line ticker. Keep the existing data fields and 4 latest settled + all pending logic. Remove MONITORING SIGNALS placeholder. Patch only dashboard-v2-stage3.js, dashboard-v2-tune.css and their matching Worker literals. No Engine, Signal, Statistics, bindings, cron, mobile V3 or unrelated asset changes.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchRenderer(before){
  assert(before.includes('function renderWorkspaceScorebar(){'),'SCOREBAR_RENDERER_MISSING');
  assert(before.includes('b46-activity-strip'),'CURRENT_ACTIVITY_STRIP_MISSING');
  assert(before.includes('MONITORING SIGNALS'),'CURRENT_MONITORING_PLACEHOLDER_MISSING');
  assert(/\.slice\(0,4\);\s*const pending=signalRows\.filter/.test(before),'CURRENT_RECENT_4_SIGNATURE_MISSING');
  assert(!/\)\.slice\(0,4\);\s*const makeSettled=x=>/.test(before),'CURRENT_PENDING_STILL_CAPPED');

  const startNeedle='const a=recent.map(makeSettled),b=pending.map(makePending),items=a.concat(b);';
  const eventNeedle="document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);";
  const start=before.indexOf(startNeedle);
  const eventIndex=before.indexOf(eventNeedle,start);
  const end=before.lastIndexOf('}',eventIndex);
  assert(start>=0&&eventIndex>start&&end>start,'CURRENT_ACTIVITY_TAIL_NOT_FOUND');
  assert.equal(before.indexOf(startNeedle,start+1),-1,'CURRENT_ACTIVITY_TAIL_DUPLICATE');

  const replacement=`const a=recent.map(makeSettled),b=pending.map(makePending),items=a.concat(b);if(!items.length){slot.__b46ScorebarMarkup='';slot.innerHTML='';return}const itemHtml=items.join(''),group='<div class="workspace-scorebar-group">'+itemHtml+'</div>',markup='<div class="workspace-scorebar-grid b46-activity-strip"><div class="workspace-scorebar-track">'+group+'</div></div>';if(slot.__b46ScorebarMarkup===markup)return;slot.__b46ScorebarMarkup=markup;slot.innerHTML=markup;requestAnimationFrame(()=>{const viewport=slot.querySelector('.b46-activity-strip'),track=slot.querySelector('.workspace-scorebar-track'),first=slot.querySelector('.workspace-scorebar-group');if(!viewport||!track||!first||items.length<2)return;const shift=Math.max(1,first.scrollWidth);let clones=0;do{const clone=first.cloneNode(true);clone.classList.add('b46-scorebar-clone');clone.setAttribute('aria-hidden','true');track.appendChild(clone);clones++}while(track.scrollWidth<viewport.clientWidth+shift&&clones<12);track.style.setProperty('--b46-ticker-shift','-'+shift+'px');track.style.setProperty('--b46-ticker-duration',Math.max(18,Math.min(80,shift/34)).toFixed(1)+'s');track.classList.add('is-flowing')}); `;
  const after=before.slice(0,start)+replacement+before.slice(end);

  assert(!after.includes('MONITORING SIGNALS'),'MONITORING_PLACEHOLDER_STILL_PRESENT');
  assert(after.includes("if(!items.length){slot.__b46ScorebarMarkup='';slot.innerHTML='';return}"),'EMPTY_STATE_NOT_REMOVED');
  assert(after.includes('items.length<2'),'MULTI_ITEM_FLOW_GUARD_MISSING');
  assert(after.includes('while(track.scrollWidth<viewport.clientWidth+shift&&clones<12)'),'SEAMLESS_CLONE_LOOP_MISSING');
  assert(after.includes('--b46-ticker-duration'),'TICKER_DURATION_MISSING');
  assert(after.includes('b46-activity-strip')&&after.includes('is-flowing'),'TICKER_RENDERER_INCOMPLETE');
  parse(after,{ecmaVersion:'latest',sourceType:'script'});
  return after;
}

function patchCss(before,newBlock){
  assert(before.includes('BALL46_SCOREBAR_DETAILS_20260929'),'CURRENT_SCOREBAR_DETAILS_MISSING');
  assert(before.includes('BALL46_SCOREBAR_IMAGES_20260929'),'CURRENT_SCOREBAR_IMAGES_MISSING');
  assert(before.includes('/* '+OLD_MARK+' START */'),'CURRENT_ACTIVITY_STYLE_MARKER_MISSING');
  assert(before.includes('/* END '+OLD_MARK+' */'),'CURRENT_ACTIVITY_STYLE_END_MISSING');
  const oldRe=new RegExp('/\\* '+OLD_MARK+' START \\*/[\\s\\S]*?/\\* END '+OLD_MARK+' \\*/\\s*','g');
  const matches=before.match(oldRe)||[];
  assert.equal(matches.length,1,'CURRENT_ACTIVITY_STYLE_MARKER_COUNT_'+matches.length);
  const clean=before.replace(oldRe,'');
  const wrapped='\\n\\n/* '+NEW_MARK+' START */\\n'+newBlock.trim()+'\\n/* END '+NEW_MARK+' */\\n';
  const after=clean+wrapped;
  assert(!after.includes('/* '+OLD_MARK+' START */'),'OLD_ACTIVITY_STYLE_STILL_PRESENT');
  assert(after.includes('background:transparent!important'),'TRANSPARENT_BACKGROUND_MISSING');
  assert(after.includes('background-color:transparent!important'),'TRANSPARENT_COLOR_MISSING');
  assert(after.includes('background-image:none!important'),'BACKGROUND_IMAGE_CLEAR_MISSING');
  assert(after.includes('height:36px!important'),'TICKER_HEIGHT_MISSING');
  assert(after.includes('content:"│"!important'),'ITEM_SEPARATOR_MISSING');
  assert(after.includes('#22c55e')&&after.includes('#ef4444')&&after.includes('#98a2b3')&&after.includes('#ffffff'),'STATUS_COLORS_MISSING');
  assert(after.includes('b46SignalTickerFlow'),'TICKER_KEYFRAMES_MISSING');
  return after;
}

function patchWorkerSource(source,replacements){
  const before=literals(source);
  const targets=Object.keys(replacements);
  for(const name of targets)assert(before.has(name),'WORKER_LITERAL_MISSING:'+name);
  const edits=targets.map(name=>({name,...before.get(name),value:replacements[name]})).sort((a,b)=>b.start-a.start);
  let afterSource=source;
  for(const e of edits)afterSource=afterSource.slice(0,e.start)+JSON.stringify(e.value)+afterSource.slice(e.end);
  parse(afterSource,{ecmaVersion:'latest',sourceType:'module'});
  const after=literals(afterSource);
  assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort(),'WORKER_LITERAL_SET_CHANGED');
  const changed=[];
  for(const [name,entry] of before){
    const next=after.get(name);
    assert(next,'WORKER_LITERAL_LOST:'+name);
    if(entry.value!==next.value)changed.push(name);
    if(!targets.includes(name))assert.equal(next.value,entry.value,'UNRELATED_WORKER_LITERAL_CHANGED:'+name);
  }
  assert.deepEqual(changed.sort(),targets.sort(),'WORKER_CHANGED_LITERAL_SET_BAD');
  for(const name of targets)assert.equal(after.get(name).value,replacements[name],'WORKER_LITERAL_PATCH_BAD:'+name);
  return {source:afterSource,before,after,changed};
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
      annotations:{'workers/message':`Rollback Ball46 signal ticker ${report.run}`}
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

  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const before={};
  for(const p of [JS,CSS]){
    const bytes=await publicFile('/'+p);
    before[p]={bytes,sha:sha(bytes),text:bytes.toString('utf8')};
    writeFileSync('audit/'+p+'.before',bytes);
  }
  report.beforeShas=Object.fromEntries(Object.entries(before).map(([p,v])=>[p,v.sha]));

  const jsPatched=patchRenderer(before[JS].text);
  const cssPatched=patchCss(before[CSS].text,styleBlock);

  const sourceBeforeLiterals=literals(current.source);
  assert(sourceBeforeLiterals.has('__B46_MULTI_SIGNAL_STAGE3_JS__'),'CURRENT_WORKER_STAGE3_LITERAL_MISSING');
  assert(sourceBeforeLiterals.has('__B46_SCOREBAR_TUNE_CSS__'),'CURRENT_WORKER_SCOREBAR_CSS_LITERAL_MISSING');
  assert.equal(sha(Buffer.from(sourceBeforeLiterals.get('__B46_MULTI_SIGNAL_STAGE3_JS__').value)),before[JS].sha,'CURRENT_WORKER_STAGE3_NOT_PUBLIC');
  assert.equal(sha(Buffer.from(sourceBeforeLiterals.get('__B46_SCOREBAR_TUNE_CSS__').value)),before[CSS].sha,'CURRENT_WORKER_SCOREBAR_CSS_NOT_PUBLIC');

  const workerPatch=patchWorkerSource(current.source,{
    '__B46_MULTI_SIGNAL_STAGE3_JS__':jsPatched,
    '__B46_SCOREBAR_TUNE_CSS__':cssPatched
  });
  const patchedSource=workerPatch.source;
  report.changedWorkerLiterals=workerPatch.changed;

  const patched={
    [JS]:Buffer.from(jsPatched),
    [CSS]:Buffer.from(cssPatched)
  };
  report.afterShas=Object.fromEntries(Object.entries(patched).map(([p,v])=>[p,sha(v)]));
  for(const [p,bytes] of Object.entries(patched)){
    assert.notEqual(sha(bytes),before[p].sha,p+'_UNCHANGED');
    writeFileSync('audit/'+p+'.after',bytes);
  }

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);
  await verifyRailBase(staged);
  for(const p of [JS,CSS])assert.equal(staged.hashes[p],before[p].sha,'STAGED_NOT_CURRENT:'+p);

  const protectedAssets={...staged.hashes};
  delete protectedAssets[JS];
  delete protectedAssets[CSS];

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
    console.log('BALL46_SIGNAL_TICKER_PREVIEW_PASS');
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
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{
        const checks=await Promise.all([JS,CSS].map(async p=>sha(await publicFile('/'+p,undefined,directOrigin))===sha(patched[p])));
        if(checks.every(Boolean)){directOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(directOk,'PATCHED_ASSETS_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const got={};
        for(const p of [JS,CSS])got[p]=await publicFile('/'+p);
        if([JS,CSS].every(p=>sha(got[p])===sha(patched[p]))){
          const jsText=got[JS].toString('utf8'),cssText=got[CSS].toString('utf8');
          assert(!jsText.includes('MONITORING SIGNALS'),'MONITORING_PLACEHOLDER_PUBLIC');
          assert(jsText.includes('--b46-ticker-duration')&&jsText.includes('items.length<2'),'TICKER_RENDERER_NOT_PUBLIC');
          assert(cssText.includes(NEW_MARK)&&!cssText.includes('/* '+OLD_MARK+' START */'),'TICKER_STYLE_MARKER_NOT_PUBLIC');
          assert(cssText.includes('background:transparent!important')&&cssText.includes('content:"│"!important'),'TICKER_TRANSPARENCY_OR_SEPARATOR_NOT_PUBLIC');
          publicOk=true;break;
        }
      }catch{}
      await delay(1500);
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
    assert.equal(sha(Buffer.from(finalSource)),sha(Buffer.from(patchedSource)),'FINAL_WORKER_SOURCE_NOT_PATCHED_SOURCE');
    const finalLiterals=literals(finalSource);
    assert.equal(finalLiterals.get('__B46_MULTI_SIGNAL_STAGE3_JS__')?.value,jsPatched,'FINAL_STAGE3_LITERAL_BAD');
    assert.equal(finalLiterals.get('__B46_SCOREBAR_TUNE_CSS__')?.value,cssPatched,'FINAL_SCOREBAR_CSS_LITERAL_BAD');
    for(const [name,entry] of sourceBeforeLiterals){
      if(name==='__B46_MULTI_SIGNAL_STAGE3_JS__'||name==='__B46_SCOREBAR_TUNE_CSS__')continue;
      assert.equal(finalLiterals.get(name)?.value,entry.value,'FINAL_UNRELATED_WORKER_LITERAL_CHANGED:'+name);
    }
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;
    report.workerSourceChangedOnlyLiterals=['__B46_MULTI_SIGNAL_STAGE3_JS__','__B46_SCOREBAR_TUNE_CSS__'];
    report.backendUntouched=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.changedAssets=[JS,CSS];
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+base);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('JS_SHA='+sha(patched[JS]));
    console.log('CSS_SHA='+sha(patched[CSS]));
    console.log('BALL46_SIGNAL_TICKER_SUCCESS');
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
