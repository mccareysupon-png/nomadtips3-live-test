import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-statistics-resilience-20261006';
const TARGET='statistics-next.js';
const MARK='B46_STATS_RESILIENCE_20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
const BT=String.fromCharCode(96);
const D='$';
mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.GITHUB_REF_NAME,
  startedAt:new Date().toISOString(),
  scope:'Statistics frontend resilience only: retry the existing Statistics fetch with a longer timeout. No Signal logic, engine, API, settlement, HTML, CSS, cron, bindings or unrelated assets may change.'
};
const save=()=>writeFileSync('audit/statistics-resilience-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function signalBlock(source){
  const expr=D+'{SIGNAL_API}?_='+D+'{stamp}';
  const start="try{const lr=await timedFetch("+BT+expr+BT+");";
  const end="}catch(err){console.warn('Statistics NEXT signals load failed',err)}";
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert(a>=0&&b>a,'SIGNAL_BLOCK_NOT_FOUND');
  return source.slice(a,b+end.length);
}
function liveFunctions(source){
  const a=source.indexOf('function groupSignals');
  const b=source.indexOf('async function timedFetch');
  assert(a>=0&&b>a,'LIVE_FUNCTIONS_BLOCK_NOT_FOUND');
  return source.slice(a,b);
}
function patchStatistics(source){
  assert(source.includes("const STAT_API='/api/engine/statistics';"),'STAT_API_MARKER_MISSING');
  assert(source.includes("const SIGNAL_API='/api/engine/signals';"),'SIGNAL_API_MARKER_MISSING');
  assert(source.includes("async function timedFetch(url,ms=8000)"),'TIMED_FETCH_SHAPE_CHANGED');
  assert(!source.includes(MARK),'RESILIENCE_MARKER_ALREADY_PRESENT');

  const beforeSignal=signalBlock(source);
  const beforeLive=liveFunctions(source);
  const statExpr=D+'{STAT_API}?_='+D+'{stamp}';
  const needle="const sr=await timedFetch("+BT+statExpr+BT+");const sj=await sr.json();if(!sr.ok||sj?.ok!==true)throw new Error('statistics unavailable');";
  assert.equal(source.split(needle).length-1,1,'STATISTICS_FETCH_PATTERN_COUNT_BAD');

  const helper=[
    '// '+MARK,
    'async function fetchStatisticsWithRetry(stamp){',
    ' let lastError;',
    ' for(let attempt=1;attempt<=2;attempt++){',
    '  try{',
    "   const expr=D+'{STAT_API}?_='+D+'{stamp}-'+D+'{attempt}';",
    '   const sr=await timedFetch(BT+expr+BT,15000);',
    '   const sj=await sr.json();',
    "   if(!sr.ok||sj?.ok!==true)throw new Error('statistics unavailable');",
    '   return sj;',
    '  }catch(err){',
    '   lastError=err;',
    '   if(attempt<2)await new Promise(r=>setTimeout(r,800));',
    '  }',
    ' }',
    " throw lastError||new Error('statistics unavailable');",
    '}',
    ''
  ].join('\n');

  const helperAnchor='async function load(){';
  assert(source.includes(helperAnchor),'LOAD_ANCHOR_MISSING');
  let after=source.replace(helperAnchor,helper+helperAnchor);
  after=after.replace(needle,'const sj=await fetchStatisticsWithRetry(stamp);');

  assert(after.includes(MARK),'RESILIENCE_MARKER_MISSING_AFTER_PATCH');
  assert.equal(signalBlock(after),beforeSignal,'SIGNAL_FETCH_LOGIC_CHANGED');
  assert.equal(liveFunctions(after),beforeLive,'SIGNAL_RENDER_LOGIC_CHANGED');
  assert(after.includes("const SIGNAL_API='/api/engine/signals';"),'SIGNAL_API_REMOVED');
  return after;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){
    report.rollback={status:'base-still-active',version:a};save();return;
  }
  if(candidate&&a!==candidate){
    report.rollback={status:'skipped-foreign-active',version:a};save();return;
  }
  await api('/scripts/'+script+'/deployments',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:current.restore.version,percentage:100}],
      annotations:{'workers/message':'Rollback Statistics resilience '+report.run}
    })
  });
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};
  save();
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.backendBefore=current.restore.backend;
  const workerBeforeSha=sha(Buffer.from(current.source));
  const beforeLiterals=literals(current.source);
  report.workerBeforeSha=workerBeforeSha;

  const settingsBefore=await api('/scripts/'+script+'/settings');
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const beforeBytes=await publicFile('/'+TARGET,'javascript');
  const before=beforeBytes.toString('utf8');
  const beforeSha=sha(beforeBytes);
  const directBefore=await publicFile('/'+TARGET,'javascript',directOrigin);
  assert.equal(sha(directBefore),beforeSha,'PUBLIC_DIRECT_STATISTICS_JS_DIFFER');
  writeFileSync('audit/statistics-next-before.js',beforeBytes);
  report.beforeSha=beforeSha;
  report.beforeBytes=beforeBytes.length;

  const beforeSignalSha=sha(Buffer.from(signalBlock(before)));
  const beforeLiveSha=sha(Buffer.from(liveFunctions(before)));
  const after=patchStatistics(before);
  const afterBytes=Buffer.from(after);
  const afterSha=sha(afterBytes);
  writeFileSync('audit/statistics-next-after.js',afterBytes);
  report.afterSha=afterSha;
  report.afterBytes=afterBytes.length;
  report.signalBlockSha=beforeSignalSha;
  report.liveFunctionsSha=beforeLiveSha;

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_STATISTICS_JS_NOT_CURRENT');
  const protectedAssets={...staged.hashes};
  delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_STATISTICS_JS_SHA_BAD');
  report.protectedAssetCount=Object.keys(protectedAssets).length;
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion=base;
    report.completedAt=new Date().toISOString();
    save();
    console.log('EXACT_ACTIVE_VERSION='+base);
    console.log('STATISTICS_JS_BEFORE_SHA='+beforeSha);
    console.log('STATISTICS_JS_AFTER_SHA='+afterSha);
    console.log('BALL46_STATISTICS_RESILIENCE_PREVIEW_PASS');
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
    report.candidateVersion=candidate;
    save();

    let directOk=false;
    for(let i=0;i<36;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{
        const b=await publicFile('/'+TARGET,'javascript',directOrigin);
        if(sha(b)===afterSha&&b.toString('utf8').includes(MARK)){directOk=true;break}
      }catch{}
      await delay(1250);
    }
    assert(directOk,'STATISTICS_RESILIENCE_NOT_DIRECT_PRODUCTION');

    let publicOk=false,lastPublicSha=null;
    for(let i=0;i<35;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const b=await publicFile('/'+TARGET,'javascript');
        lastPublicSha=sha(b);
        if(lastPublicSha===afterSha&&b.toString('utf8').includes(MARK)){publicOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(publicOk,'STATISTICS_RESILIENCE_NOT_PUBLIC');
    report.publicSha=lastPublicSha;

    const diff={};
    for(const [p,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+p));
      if(got!==h)diff[p]={expected:h,got};
    }
    assert.equal(Object.keys(diff).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(diff));

    const finalJs=(await publicFile('/'+TARGET,'javascript')).toString('utf8');
    assert.equal(sha(Buffer.from(signalBlock(finalJs))),beforeSignalSha,'FINAL_SIGNAL_FETCH_LOGIC_CHANGED');
    assert.equal(sha(Buffer.from(liveFunctions(finalJs))),beforeLiveSha,'FINAL_SIGNAL_RENDER_LOGIC_CHANGED');

    const statsJson=JSON.parse(await publicFile('/api/engine/statistics','json'));
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    assert(statsJson.rows.length>0,'STATISTICS_ROWS_EMPTY');
    report.statistics={
      total:statsJson.total,
      ledgerTotal:statsJson.ledgerTotal,
      pending:statsJson.pending,
      rows:statsJson.rows.length
    };

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate);
    const cm=cv.modules.find(m=>m.name===cv.main_module);
    assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerBeforeSha,'WORKER_SOURCE_CHANGED');
    const finalLiterals=literals(finalSource);
    for(const [name,lit] of beforeLiterals){
      const next=finalLiterals.get(name);
      assert(next,'FINAL_LITERAL_REMOVED:'+name);
      assert.equal(sha(Buffer.from(next.value)),sha(Buffer.from(lit.value)),'FINAL_LITERAL_CHANGED:'+name);
    }

    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');
    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.workerSourceUntouched=true;
    report.backendUntouched=true;
    report.signalLogicUntouched=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.completedAt=new Date().toISOString();
    save();
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('STATISTICS_JS_SHA='+afterSha);
    console.log('STATISTICS_ROWS='+statsJson.rows.length);
    console.log('BALL46_STATISTICS_RESILIENCE_SUCCESS');
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
