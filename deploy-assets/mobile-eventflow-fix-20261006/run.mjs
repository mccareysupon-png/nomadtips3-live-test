import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-mobile-eventflow-fix-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
const TARGETS={
  'dashboard-v2-tune.js':'targets/dashboard-v2-tune.js',
  'dashboard-v2-stage3.js':'targets/dashboard-v2-stage3.js',
  'expanded-match-343.js':'targets/expanded-match-343.js'
};
const INDEX='index.html';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,startedAt:new Date().toISOString(),scope:'Ball46 mobile-only presentation fix: one live clock + one signal on match rows; EventFlow SIGNAL marker at locked entry minute. No engine, referee, odds, settlement, worker source, bindings, crons or unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const nodeCheck=p=>{const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);assert(!r.error&&r.status===0,`NODE_CHECK_FAILED:${p}`)};
let current=null,candidate=null;

function patchIndex(html){
  const swaps=[
    ['dashboard-v2-stage3.js','343-dashboard-v2-stage3-v7-mobile-signal-eventflow-20261006'],
    ['dashboard-v2-tune.js','343-dashboard-v2-ui-tune-v5-mobile-single-status-20261006'],
    ['expanded-match-343.js','343-expand-v5-signal-marker-20261006']
  ];
  let out=html;
  for(const [name,version] of swaps){
    const re=new RegExp(name.replaceAll('.','\\.')+'\\?v=[^"\\s]+','g');
    const hits=out.match(re)||[];
    assert.equal(hits.length,1,`INDEX_SCRIPT_REFERENCE_COUNT_BAD:${name}:${hits.length}`);
    out=out.replace(re,`${name}?v=${version}&order=20261006-mobile-eventflow`);
  }
  return out;
}

async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Ball46 mobile EventFlow fix ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const targetBytes={};
  for(const [name,file] of Object.entries(TARGETS)){
    const bytes=readFileSync(file); targetBytes[name]=bytes; nodeCheck(file);
  }
  assert(targetBytes['dashboard-v2-tune.js'].toString().includes('343-dashboard-v2-ui-tune-v4-mobile-single-clock-signal'),'MOBILE_TUNE_MARKER_MISSING');
  assert(targetBytes['dashboard-v2-stage3.js'].toString().includes('getSignal:id=>signalMap.get(String(id))||null'),'READONLY_SIGNAL_BRIDGE_MISSING');
  assert(targetBytes['expanded-match-343.js'].toString().includes('343-expanded-match-v5-signal-marker'),'EVENTFLOW_MARKER_VERSION_MISSING');
  assert(targetBytes['expanded-match-343.js'].toString().includes('signalMarker(signal,w,h,pad,current)'),'EVENTFLOW_MARKER_RENDER_MISSING');

  current=await inspect();
  const targetNames=new Set([INDEX,...Object.keys(TARGETS)]);
  const activeTargetModules=current.version.modules.filter(m=>targetNames.has(String(m.name||'').replace(/^assets\//,''))).map(m=>({name:m.name,type:m.content_type,size:Buffer.from(m.content_base64,'base64').length,sha:sha(Buffer.from(m.content_base64,'base64'))}));
  console.log('ACTIVE_TARGET_MODULES='+JSON.stringify(activeTargetModules));
  const sourceRefs={};
  for(const name of targetNames){const at=current.source.indexOf(name);sourceRefs[name]=at<0?null:current.source.slice(Math.max(0,at-180),Math.min(current.source.length,at+420))}
  console.log('ACTIVE_SOURCE_TARGET_REFS='+JSON.stringify(sourceRefs));
  console.log('ACTIVE_SOURCE_OLD_MARKERS='+JSON.stringify({
    tuneOld:current.source.includes('343-dashboard-v2-ui-tune-v3-mobile-status-loop-safe'),
    tuneNew:current.source.includes('343-dashboard-v2-ui-tune-v4-mobile-single-clock-signal'),
    stageOld:current.source.includes('343-dashboard-v2-stage3-v5-default-rich-bridge'),
    stageNew:current.source.includes('343-dashboard-v2-stage3-v6-signal-readonly-bridge'),
    expandedOld:current.source.includes('343-expanded-match-v4-stable-lifecycle'),
    expandedNew:current.source.includes('343-expanded-match-v5-signal-marker')
  }));
  const base=current.restore.version;
  report.baseVersion=base;
  report.backendBefore=current.restore.backend;
  const workerBeforeSha=sha(Buffer.from(current.source)),beforeLiterals=literals(current.source);
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const indexBefore=await publicFile('/'+INDEX,'html');
  const indexAfter=Buffer.from(patchIndex(indexBefore.toString('utf8')));
  writeFileSync('audit/index-before.html',indexBefore);
  writeFileSync('audit/index-after.html',indexAfter);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[INDEX],sha(indexBefore),'STAGED_INDEX_NOT_CURRENT');
  for(const name of Object.keys(TARGETS)){
    assert(staged.hashes[name],'TARGET_NOT_ON_CONFIRMED_RAIL:'+name);
    assert.equal(staged.hashes[name],sha(await publicFile('/'+name,undefined,directOrigin)),'TARGET_MOVED_BEFORE_PATCH:'+name);
  }

  const protectedAssets={...staged.hashes};
  delete protectedAssets[INDEX];
  for(const name of Object.keys(TARGETS))delete protectedAssets[name];

  writeFileSync(resolve(staged.runtime,'assets',INDEX),indexAfter);
  for(const [name,bytes] of Object.entries(targetBytes))writeFileSync(resolve(staged.runtime,'assets',name),bytes);

  report.before={index:sha(indexBefore),targets:Object.fromEntries(Object.keys(TARGETS).map(n=>[n,staged.hashes[n]]))};
  report.after={index:sha(indexAfter),targets:Object.fromEntries(Object.entries(targetBytes).map(([n,b])=>[n,sha(b)]))};
  report.protectedAssetCount=Object.keys(protectedAssets).length;save();
  console.log('PATCH_HASHES_BEFORE='+JSON.stringify(report.before));
  console.log('PATCH_HASHES_AFTER='+JSON.stringify(report.after));

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('BALL46_MOBILE_EVENTFLOW_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const active=await activeVersion();if(active!==base){candidate=active;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    const expected={ [INDEX]:sha(indexAfter), ...Object.fromEntries(Object.entries(targetBytes).map(([n,b])=>[n,sha(b)])) };
    for(const origin of [directOrigin,'https://ball46.com']){
      for(const [name,want] of Object.entries(expected)){
        let ok=false,last='';
        for(let i=0;i<120;i++){
          assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
          try{const got=await publicFile('/'+name,undefined,origin);last=sha(got);if(last===want){ok=true;break}}catch{}
          await delay(1250);
        }
        assert(ok,`ASSET_NOT_PROPAGATED:${origin}:${name}:${last}`);
      }
    }

    const liveIndex=(await publicFile('/index.html','html')).toString('utf8');
    assert(liveIndex.includes('343-dashboard-v2-stage3-v7-mobile-signal-eventflow-20261006'),'LIVE_INDEX_DASHBOARD_REF_MISSING');
    assert(liveIndex.includes('343-dashboard-v2-ui-tune-v5-mobile-single-status-20261006'),'LIVE_INDEX_TUNE_REF_MISSING');
    assert(liveIndex.includes('343-expand-v5-signal-marker-20261006'),'LIVE_INDEX_EVENTFLOW_REF_MISSING');

    const diff={};
    for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)diff[p]={expected:h,got}}
    assert.equal(Object.keys(diff).length,0,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(diff)}`);

    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics'].map(async p=>JSON.parse(await publicFile(p,'json'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,settled:statsJson.rows.length};

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);
    assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerBeforeSha,'WORKER_SOURCE_CHANGED');
    const finalLiterals=literals(finalSource);
    for(const [name,lit] of beforeLiterals){const next=finalLiterals.get(name);assert(next,`FINAL_LITERAL_REMOVED:${name}`);assert.equal(sha(Buffer.from(next.value)),sha(Buffer.from(lit.value)),`FINAL_LITERAL_CHANGED:${name}`)}

    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');
    report.finalVersion=candidate;report.result='SUCCESS';report.workerSourceUntouched=true;report.backendUntouched=true;report.unrelatedStaticAssetsUntouched=true;report.completedAt=new Date().toISOString();save();
    console.log(`FINAL_PRODUCTION=${candidate}`);
    console.log('BALL46_MOBILE_EVENTFLOW_FIX_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
