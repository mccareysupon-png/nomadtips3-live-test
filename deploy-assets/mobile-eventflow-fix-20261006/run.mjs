import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-mobile-eventflow-fix-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
const TARGETS={
  '__B46_THEME_TOOLBAR_JS__':{path:'dashboard-v2-tune.js',file:'targets/dashboard-v2-tune.js',marker:'343-dashboard-v2-ui-tune-v4-mobile-single-clock-signal'},
  '__B46_MULTI_SIGNAL_STAGE3_JS__':{path:'dashboard-v2-stage3.js',file:'targets/dashboard-v2-stage3.js',marker:'343-dashboard-v2-stage3-v6-signal-readonly-bridge'},
  '__B46_EVENTFLOW_SIGNAL_JS_20261002__':{path:'expanded-match-343.js',file:'targets/expanded-match-343.js',marker:'343-expanded-match-v5-signal-marker'}
};
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Patch exactly three current-production Worker UI literals that own Ball46 mobile match-row signal/clock rendering and EventFlow signal marker. Preserve all static assets, APIs, bindings, schedules, engine/referee/odds/statistics behavior and every unrelated Worker literal.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const nodeCheck=p=>{const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_CHECK_FAILED:${p}`)};
let current=null,candidate=null;

function patchLiterals(source,replacements){
  const found=literals(source),edits=[];
  for(const [name,value] of replacements){
    const hit=found.get(name);assert(hit,`TARGET_LITERAL_MISSING:${name}`);
    edits.push({name,start:hit.start,end:hit.end,text:JSON.stringify(value),beforeSha:sha(Buffer.from(hit.value)),afterSha:sha(Buffer.from(value))});
  }
  edits.sort((a,b)=>b.start-a.start);
  let out=source;
  for(const e of edits)out=out.slice(0,e.start)+e.text+out.slice(e.end);
  return{out,edits};
}
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Ball46 mobile EventFlow literal fix ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const replacementMap=new Map();
  for(const [literal,t] of Object.entries(TARGETS)){
    const value=readFileSync(t.file,'utf8');nodeCheck(t.file);assert(value.includes(t.marker),`TARGET_MARKER_MISSING:${literal}`);replacementMap.set(literal,value);
  }
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;report.backendBefore=current.restore.backend;
  const beforeLiterals=literals(current.source);
  const {out:patchedSource,edits}=patchLiterals(current.source,replacementMap);
  assert.notEqual(sha(Buffer.from(patchedSource)),sha(Buffer.from(current.source)),'PATCHED_SOURCE_UNCHANGED');
  const afterLiterals=literals(patchedSource);
  for(const [name,before] of beforeLiterals){
    const after=afterLiterals.get(name);assert(after,`LITERAL_REMOVED:${name}`);
    if(replacementMap.has(name))assert.equal(sha(Buffer.from(after.value)),sha(Buffer.from(replacementMap.get(name))),`TARGET_LITERAL_PATCH_BAD:${name}`);
    else assert.equal(sha(Buffer.from(after.value)),sha(Buffer.from(before.value)),`UNRELATED_LITERAL_CHANGED:${name}`);
  }
  report.literalEdits=edits.map(e=>({name:e.name,beforeSha:e.beforeSha,afterSha:e.afterSha}));
  report.workerBeforeSha=sha(Buffer.from(current.source));report.workerAfterSha=sha(Buffer.from(patchedSource));

  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);
  await verifyRailBase(staged);
  report.assetCount=Object.keys(staged.hashes).length;report.assetHashes=staged.hashes;save();
  console.log('LITERAL_PATCHES='+JSON.stringify(report.literalEdits));

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('BALL46_MOBILE_EVENTFLOW_LITERAL_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const active=await activeVersion();if(active!==base){candidate=active;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();

    for(const [literal,t] of Object.entries(TARGETS)){
      const want=sha(Buffer.from(replacementMap.get(literal)));
      for(const origin of [directOrigin,'https://ball46.com']){
        let ok=false,last='';
        for(let i=0;i<45;i++){
          assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
          try{const got=await publicFile('/'+t.path,undefined,origin);last=sha(got);if(last===want){ok=true;break}}catch{}
          await delay(1000);
        }
        assert(ok,`LITERAL_ROUTE_NOT_LIVE:${origin}:${t.path}:${last}`);
      }
    }

    const liveIndex=(await publicFile('/index.html','html')).toString('utf8');
    assert(liveIndex.includes('343-dashboard-v2-stage3-v7-mobile-signal-eventflow-20261006'),'LIVE_INDEX_DASHBOARD_REF_MISSING');
    assert(liveIndex.includes('343-dashboard-v2-ui-tune-v5-mobile-single-status-20261006'),'LIVE_INDEX_TUNE_REF_MISSING');
    assert(liveIndex.includes('343-expand-v5-signal-marker-20261006'),'LIVE_INDEX_EVENTFLOW_REF_MISSING');

    for(const [p,h] of Object.entries(staged.hashes))assert.equal(sha(await publicFile('/'+p)),h,`STATIC_ASSET_CHANGED:${p}`);
    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics'].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,settled:statsJson.rows.length};

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),sha(Buffer.from(patchedSource)),'FINAL_WORKER_SOURCE_NOT_EXACT_PATCH');
    const finalLiterals=literals(finalSource);
    for(const [name,before] of beforeLiterals){
      const final=finalLiterals.get(name);assert(final,`FINAL_LITERAL_REMOVED:${name}`);
      if(replacementMap.has(name))assert.equal(sha(Buffer.from(final.value)),sha(Buffer.from(replacementMap.get(name))),`FINAL_TARGET_LITERAL_BAD:${name}`);
      else assert.equal(sha(Buffer.from(final.value)),sha(Buffer.from(before.value)),`FINAL_UNRELATED_LITERAL_CHANGED:${name}`);
    }
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');
    report.finalVersion=candidate;report.result='SUCCESS';report.backendUntouched=true;report.staticAssetsUntouched=true;report.onlyTargetLiteralsChanged=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);
    console.log('BALL46_MOBILE_EVENTFLOW_LITERAL_FIX_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
