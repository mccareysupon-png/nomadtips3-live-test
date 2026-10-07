import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-signal-ticker-align-fix-20261007';
const JS='dashboard-v2-stage3.js';
const CSS='dashboard-v2-tune.css';
const OLD_MARK='B46_SIGNAL_TICKER_20261007';
const NEW_MARK='B46_SIGNAL_TICKER_ALIGN_FIX_20261007';
const deploy=process.env.DEPLOY_ENABLED==='true';

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Replace legacy scorebar-card DOM used by the desktop signal ticker with dedicated b46 ticker DOM. Constrain ticker viewport so content cannot widen the page, align every item on one line, make item width equal content width, keep background 100% transparent, and auto-scroll continuously whenever data exists. Patch only dashboard-v2-stage3.js, dashboard-v2-tune.css and their matching Worker literals.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchRenderer(before){
  assert(before.includes('function renderWorkspaceScorebar(){'),'SCOREBAR_RENDERER_MISSING');
  assert(before.includes('b46-activity-strip'),'CURRENT_TICKER_RENDERER_SIGNATURE_MISSING');
  assert(before.includes('--b46-ticker-duration'),'CURRENT_TICKER_DURATION_MISSING');
  assert(!before.includes('MONITORING SIGNALS'),'MONITORING_PLACEHOLDER_REAPPEARED');
  const start=before.indexOf('function renderWorkspaceScorebar(){');
  const eventNeedle="document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);";
  const eventIndex=before.indexOf(eventNeedle,start);
  assert(start>=0&&eventIndex>start,'SCOREBAR_FUNCTION_RANGE_MISSING');

  const nextFunction=[
"function renderWorkspaceScorebar(){",
" const slot=document.querySelector('[data-workspace-scorebar-slot]');if(!slot)return;",
" const resultMeta=raw=>{const r=String(raw||'').trim().toUpperCase();if(r==='WIN')return{cls:'win',label:'WIN'};if(r==='HALF_WIN')return{cls:'win',label:'WIN ½'};if(r==='LOSS')return{cls:'loss',label:'LOSS'};if(r==='HALF_LOSS')return{cls:'loss',label:'LOSS ½'};if(r==='PUSH'||r==='DRAW')return{cls:'draw',label:r==='PUSH'?'PUSH':'DRAW'};return{cls:'draw',label:r||'DRAW'}};",
" const scoreText=v=>{const p=pair(v);return p.home===null||p.away===null?'—':show(p.home)+'–'+show(p.away)};",
" const liveScoreText=x=>scoreText(x?.mirrorScore??x?.scoreAt??x?.entryScore);",
" const lineText=x=>{const n=num(x?.line??x?.selectionLine);if(n===null)return'';const m=String(x?.market||x?.marketLabel||'').toLowerCase();return(/ah|handicap/.test(m)&&n>0?'+':'')+show(n,2)};",
" const pickText=x=>[String(x?.selection||'').trim().toUpperCase(),lineText(x)].filter(Boolean).join(' ')||'SIGNAL';",
" const marketText=x=>String(x?.marketLabel||x?.market||'SIGNAL').replaceAll('_',' ').replace(/\\s+/g,' ').trim();",
" const matchText=x=>[x?.home?.name,x?.away?.name].filter(Boolean).join(' – ')||'—';",
" const recent=settledSignalRows.filter(x=>String(x?.status||'').toUpperCase()==='SETTLED'&&['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'].includes(String(x?.result||'').toUpperCase())).slice().sort((a,b)=>Number(b?.settledAt||b?.createdAt||0)-Number(a?.settledAt||a?.createdAt||0)).slice(0,4);",
" const pending=signalRows.filter(x=>String(x?.status||'').toUpperCase()==='PENDING').slice().sort((a,b)=>(num(b?.mirrorMinute??b?.minute??b?.entryMinute)??-1)-(num(a?.mirrorMinute??a?.minute??a?.entryMinute)??-1)||Number(b?.createdAt||0)-Number(a?.createdAt||0));",
" const makeSettled=x=>{const r=resultMeta(x?.result),score=scoreText(x?.finalScore),odds=num(x?.odds),league=String(x?.league?.name||'').trim(),market=marketText(x),pick=pickText(x)+(odds===null?'':' @ '+odds.toFixed(2));return '<span class=\"b46-ticker-item is-'+esc(r.cls)+'\" data-b46-ticker-status=\"'+esc(r.label)+'\" title=\"'+esc([league,market,pick].filter(Boolean).join(' · '))+'\"><b class=\"b46-ticker-status\">'+esc(r.label)+'</b><span class=\"b46-ticker-score\">'+esc(score)+'</span><span class=\"b46-ticker-sep\">·</span><span class=\"b46-ticker-match\">'+esc(matchText(x))+'</span><span class=\"b46-ticker-sep\">·</span><span class=\"b46-ticker-market\">'+esc(market)+'</span><span class=\"b46-ticker-pick\">'+esc(pick)+'</span></span>'};",
" const makePending=x=>{const minute=num(x?.mirrorMinute??x?.minute??x?.entryMinute),score=liveScoreText(x),odds=num(x?.odds),league=String(x?.league?.name||'').trim(),market=marketText(x),pick=pickText(x)+(odds===null?'':' @ '+odds.toFixed(2)),minuteText=minute===null?'':Math.max(0,Math.round(minute))+\"'\";return '<span class=\"b46-ticker-item is-pending\" data-b46-ticker-status=\"PENDING\" title=\"'+esc([league,market,pick].filter(Boolean).join(' · '))+'\"><b class=\"b46-ticker-status\">PENDING</b>'+(minuteText?'<span class=\"b46-ticker-minute\">'+esc(minuteText)+'</span>':'')+'<span class=\"b46-ticker-score\">'+esc(score)+'</span><span class=\"b46-ticker-sep\">·</span><span class=\"b46-ticker-match\">'+esc(matchText(x))+'</span><span class=\"b46-ticker-sep\">·</span><span class=\"b46-ticker-market\">'+esc(market)+'</span><span class=\"b46-ticker-pick\">'+esc(pick)+'</span></span>'};",
" const items=recent.map(makeSettled).concat(pending.map(makePending));",
" if(!items.length){slot.__b46ScorebarMarkup='';slot.innerHTML='';return}",
" const group='<div class=\"b46-ticker-group\">'+items.join('')+'</div>';",
" const markup='<div class=\"b46-signal-ticker\" aria-label=\"Live signal activity\"><div class=\"b46-ticker-track\">'+group+'</div></div>';",
" if(slot.__b46ScorebarMarkup===markup)return;",
" slot.__b46ScorebarMarkup=markup;slot.innerHTML=markup;",
" requestAnimationFrame(()=>{const viewport=slot.querySelector('.b46-signal-ticker'),track=slot.querySelector('.b46-ticker-track'),first=slot.querySelector('.b46-ticker-group');if(!viewport||!track||!first)return;const shift=Math.max(1,first.getBoundingClientRect().width);let clones=0;do{const clone=first.cloneNode(true);clone.classList.add('b46-ticker-clone');clone.setAttribute('aria-hidden','true');track.appendChild(clone);clones++}while(track.scrollWidth<viewport.clientWidth+shift&&clones<16);track.style.setProperty('--b46-ticker-shift','-'+shift+'px');track.style.setProperty('--b46-ticker-duration',Math.max(18,Math.min(90,shift/34)).toFixed(1)+'s');track.classList.add('is-flowing')});",
"}",
""
  ].join('\n');

  const after=before.slice(0,start)+nextFunction+before.slice(eventIndex);
  assert(!after.includes('workspace-scorebar-cell workspace-scorebar-signal-result'),'LEGACY_RESULT_CARD_DOM_STILL_PRESENT');
  assert(!after.includes('workspace-scorebar-cell workspace-scorebar-pending'),'LEGACY_PENDING_CARD_DOM_STILL_PRESENT');
  assert(after.includes('b46-ticker-item')&&after.includes('b46-signal-ticker')&&after.includes('b46-ticker-track'),'DEDICATED_TICKER_DOM_MISSING');
  assert(after.includes("track.classList.add('is-flowing')"),'AUTO_FLOW_MISSING');
  assert(after.includes('first.getBoundingClientRect().width'),'CONTENT_WIDTH_SHIFT_MISSING');
  parse(after,{ecmaVersion:'latest',sourceType:'script'});
  return after;
}

function patchCss(before,newBlock){
  assert(before.includes('/* '+OLD_MARK+' START */'),'CURRENT_TICKER_STYLE_START_MISSING');
  assert(before.includes('/* END '+OLD_MARK+' */'),'CURRENT_TICKER_STYLE_END_MISSING');
  const oldRe=new RegExp('/\\* '+OLD_MARK+' START \\*/[\\s\\S]*?/\\* END '+OLD_MARK+' \\*/\\s*','g');
  const matches=before.match(oldRe)||[];
  assert.equal(matches.length,1,'CURRENT_TICKER_STYLE_MARKER_COUNT_'+matches.length);
  const clean=before.replace(oldRe,'');
  const wrapped='\n\n/* '+NEW_MARK+' START */\n'+newBlock.trim()+'\n/* END '+NEW_MARK+' */\n';
  const after=clean+wrapped;
  assert(!after.includes('/* '+OLD_MARK+' START */'),'OLD_TICKER_STYLE_STILL_PRESENT');
  assert(after.includes('contain:inline-size paint!important'),'INLINE_CONTAINMENT_MISSING');
  assert(after.includes('position:absolute!important'),'ABSOLUTE_TRACK_MISSING');
  assert(after.includes('width:max-content!important'),'FIT_CONTENT_WIDTH_MISSING');
  assert(after.includes('background:transparent!important'),'TRANSPARENT_BACKGROUND_MISSING');
  assert(after.includes('height:32px!important'),'COMPACT_HEIGHT_MISSING');
  assert(after.includes('b46-ticker-item.is-pending .b46-ticker-status'),'PENDING_STATUS_ALIGNMENT_STYLE_MISSING');
  return after;
}

function patchWorkerSource(source,replacements){
  const before=literals(source),targets=Object.keys(replacements);
  for(const name of targets)assert(before.has(name),'WORKER_LITERAL_MISSING:'+name);
  const edits=targets.map(name=>({name,...before.get(name),value:replacements[name]})).sort((a,b)=>b.start-a.start);
  let afterSource=source;
  for(const e of edits)afterSource=afterSource.slice(0,e.start)+JSON.stringify(e.value)+afterSource.slice(e.end);
  parse(afterSource,{ecmaVersion:'latest',sourceType:'module'});
  const after=literals(afterSource),changed=[];
  assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort(),'WORKER_LITERAL_SET_CHANGED');
  for(const [name,entry] of before){const next=after.get(name);assert(next,'WORKER_LITERAL_LOST:'+name);if(entry.value!==next.value)changed.push(name);if(!targets.includes(name))assert.equal(next.value,entry.value,'UNRELATED_WORKER_LITERAL_CHANGED:'+name)}
  assert.deepEqual(changed.sort(),targets.sort(),'WORKER_CHANGED_LITERAL_SET_BAD');
  return {source:afterSource,before,after,changed};
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Ball46 ticker align fix '+report.run}})});
  for(let i=0;i<20;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const styleBlock=readFileSync('style.css','utf8');assert(styleBlock.includes(NEW_MARK),'STYLE_MARKER_MISSING');
  current=await inspect();
  const base=current.restore.version;report.baseVersion=base;report.rollbackVersion=base;report.backendBefore=current.restore.backend;
  const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const before={};
  for(const p of [JS,CSS]){const bytes=await publicFile('/'+p);before[p]={bytes,sha:sha(bytes),text:bytes.toString('utf8')};writeFileSync('audit/'+p+'.before',bytes)}
  report.beforeShas=Object.fromEntries(Object.entries(before).map(([p,v])=>[p,v.sha]));
  assert(before[JS].text.includes('b46-activity-strip'),'CURRENT_PUBLIC_TICKER_JS_CHANGED');
  assert(before[CSS].text.includes('/* '+OLD_MARK+' START */'),'CURRENT_PUBLIC_TICKER_CSS_CHANGED');

  const jsPatched=patchRenderer(before[JS].text),cssPatched=patchCss(before[CSS].text,styleBlock);
  const sourceBeforeLiterals=literals(current.source);
  assert.equal(sha(Buffer.from(sourceBeforeLiterals.get('__B46_MULTI_SIGNAL_STAGE3_JS__')?.value||'')),before[JS].sha,'CURRENT_WORKER_STAGE3_NOT_PUBLIC');
  assert.equal(sha(Buffer.from(sourceBeforeLiterals.get('__B46_SCOREBAR_TUNE_CSS__')?.value||'')),before[CSS].sha,'CURRENT_WORKER_SCOREBAR_CSS_NOT_PUBLIC');
  const workerPatch=patchWorkerSource(current.source,{'__B46_MULTI_SIGNAL_STAGE3_JS__':jsPatched,'__B46_SCOREBAR_TUNE_CSS__':cssPatched}),patchedSource=workerPatch.source;
  const patched={[JS]:Buffer.from(jsPatched),[CSS]:Buffer.from(cssPatched)};
  report.changedWorkerLiterals=workerPatch.changed;report.afterShas=Object.fromEntries(Object.entries(patched).map(([p,v])=>[p,sha(v)]));
  for(const [p,bytes] of Object.entries(patched)){assert.notEqual(sha(bytes),before[p].sha,p+'_UNCHANGED');writeFileSync('audit/'+p+'.after',bytes)}

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);await verifyRailBase(staged);
  for(const p of [JS,CSS])assert.equal(staged.hashes[p],before[p].sha,'STAGED_NOT_CURRENT:'+p);
  const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];
  for(const [p,bytes] of Object.entries(patched)){writeFileSync(resolve(staged.runtime,'assets',p),bytes);assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',p))),sha(bytes),'STAGED_PATCH_SHA_BAD:'+p)}

  save();wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('BALL46_SIGNAL_TICKER_ALIGN_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<80;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');try{const checks=await Promise.all([JS,CSS].map(async p=>sha(await publicFile('/'+p,undefined,directOrigin))===sha(patched[p])));if(checks.every(Boolean)){directOk=true;break}}catch{}await delay(1500)}
    assert(directOk,'PATCHED_ASSETS_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<80;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const got={};for(const p of [JS,CSS])got[p]=await publicFile('/'+p);if([JS,CSS].every(p=>sha(got[p])===sha(patched[p]))){const jsText=got[JS].toString('utf8'),cssText=got[CSS].toString('utf8');assert(jsText.includes('b46-ticker-item')&&!jsText.includes('workspace-scorebar-cell workspace-scorebar-signal-result'),'LEGACY_CARD_DOM_PUBLIC');assert(cssText.includes(NEW_MARK)&&cssText.includes('contain:inline-size paint!important')&&cssText.includes('position:absolute!important'),'CONSTRAINED_TICKER_STYLE_NOT_PUBLIC');publicOk=true;break}}catch{}await delay(1500)}
    assert(publicOk,'PATCHED_ASSETS_NOT_PUBLIC');

    const changed={};for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)changed[p]={expected:h,got}}assert.equal(Object.keys(changed).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(changed));
    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,statisticsRows:statsJson.rows.length,pending:statsJson.pending};
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(finalSource)),sha(Buffer.from(patchedSource)),'FINAL_WORKER_SOURCE_NOT_PATCHED_SOURCE');
    const finalLiterals=literals(finalSource);assert.equal(finalLiterals.get('__B46_MULTI_SIGNAL_STAGE3_JS__')?.value,jsPatched,'FINAL_STAGE3_LITERAL_BAD');assert.equal(finalLiterals.get('__B46_SCOREBAR_TUNE_CSS__')?.value,cssPatched,'FINAL_SCOREBAR_CSS_LITERAL_BAD');
    for(const [name,entry] of sourceBeforeLiterals){if(name==='__B46_MULTI_SIGNAL_STAGE3_JS__'||name==='__B46_SCOREBAR_TUNE_CSS__')continue;assert.equal(finalLiterals.get(name)?.value,entry.value,'FINAL_UNRELATED_WORKER_LITERAL_CHANGED:'+name)}
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

    report.finalVersion=candidate;report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.changedAssets=[JS,CSS];report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('JS_SHA='+sha(patched[JS]));console.log('CSS_SHA='+sha(patched[CSS]));console.log('BALL46_SIGNAL_TICKER_ALIGN_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
