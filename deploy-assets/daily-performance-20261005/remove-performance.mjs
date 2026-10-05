import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals } from './production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from './rail.mjs';

const TARGET='index.html';
const MARK='B46_DAILY_PERFORMANCE_20261005';
mkdirSync('audit-remove-performance',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),scope:'Remove only Daily Performance injected STYLE/SCRIPT blocks from current Production index.html. Preserve Worker, engine, APIs, scorebar and all other 78 assets.'};
const save=()=>writeFileSync('audit-remove-performance/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;

function stripPerformance(before){
  const styleRe=new RegExp(`\\n?<!-- ${MARK} STYLE START -->[\\s\\S]*?<!-- ${MARK} STYLE END -->\\n?`,'g');
  const scriptRe=new RegExp(`\\n?<!-- ${MARK} SCRIPT START -->[\\s\\S]*?<!-- ${MARK} SCRIPT END -->\\n?`,'g');
  const styles=(before.match(styleRe)||[]).length;
  const scripts=(before.match(scriptRe)||[]).length;
  assert.equal(styles,1,`PERFORMANCE_STYLE_BLOCK_COUNT:${styles}`);
  assert.equal(scripts,1,`PERFORMANCE_SCRIPT_BLOCK_COUNT:${scripts}`);
  const after=before.replace(styleRe,'\n').replace(scriptRe,'\n');
  assert(!after.includes(`${MARK} STYLE START`),'PERFORMANCE_STYLE_STILL_PRESENT');
  assert(!after.includes(`${MARK} SCRIPT START`),'PERFORMANCE_SCRIPT_STILL_PRESENT');
  assert(!after.includes('id="ball46-daily-performance"'),'PERFORMANCE_NODE_LITERAL_STILL_PRESENT');
  return after;
}

async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version)return;
  if(candidate&&a!==candidate)return;
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Performance removal ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.backendBefore=current.restore.backend;
  const workerBeforeSha=sha(Buffer.from(current.source));
  const beforeLiterals=literals(current.source);
  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html');
  const before=beforeBytes.toString('utf8');
  assert(before.includes(MARK),'PERFORMANCE_MARKER_NOT_LIVE_STOP');
  const beforeSha=sha(beforeBytes);
  writeFileSync('audit-remove-performance/index-before.html',beforeBytes);

  const after=stripPerformance(before);
  const afterBytes=Buffer.from(after);
  const afterSha=sha(afterBytes);
  assert.notEqual(afterSha,beforeSha,'INDEX_UNCHANGED_STOP');
  writeFileSync('audit-remove-performance/index-after.html',afterBytes);
  report.indexBeforeSha=beforeSha;
  report.indexAfterSha=afterSha;

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes}; delete protectedAssets[TARGET];
  assert.equal(Object.keys(protectedAssets).length,78,'PROTECTED_ASSET_COUNT_BAD');
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_INDEX_SHA_BAD');
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1000)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    let directOk=false;
    for(let i=0;i<30;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');
      try{const b=await publicFile('/index.html','html',directOrigin);const t=b.toString('utf8');if(sha(b)===afterSha&&!t.includes(MARK)&&!t.includes('ball46-daily-performance')){directOk=true;break}}catch{}
      await delay(1000);
    }
    assert(directOk,'PERFORMANCE_REMOVAL_NOT_DIRECT');

    let publicOk=false;
    for(let i=0;i<30;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{const b=await publicFile('/index.html','html');const t=b.toString('utf8');if(sha(b)===afterSha&&!t.includes(MARK)&&!t.includes('ball46-daily-performance')){publicOk=true;break}}catch{}
      await delay(1000);
    }
    assert(publicOk,'PERFORMANCE_REMOVAL_NOT_PUBLIC');

    const diff={};
    for(const [p,h] of Object.entries(protectedAssets)){const got=sha(await publicFile('/'+p));if(got!==h)diff[p]={expected:h,got}}
    assert.equal(Object.keys(diff).length,0,`UNRELATED_ASSETS_CHANGED:${JSON.stringify(diff)}`);

    const [boardJson,signalsJson]=await Promise.all(['/api/engine/board','/api/engine/signals'].map(async p=>JSON.parse((await publicFile(p,'json')).toString('utf8'))));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');

    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);
    assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerBeforeSha,'WORKER_SOURCE_CHANGED');
    const finalLiterals=literals(finalSource);
    for(const [name,lit] of beforeLiterals){const next=finalLiterals.get(name);assert(next,`FINAL_LITERAL_REMOVED:${name}`);assert.equal(sha(Buffer.from(next.value)),sha(Buffer.from(lit.value)),`FINAL_LITERAL_CHANGED:${name}`)}

    report.finalVersion=candidate;
    report.signalsCount=signalsJson.signals.length;
    report.fixturesCount=boardJson.fixtures.length;
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log(`FINAL_PRODUCTION=${candidate}`);
    console.log(`INDEX_SHA=${afterSha}`);
    console.log(`SIGNALS_COUNT=${signalsJson.signals.length}`);
    console.log(`FIXTURES_COUNT=${boardJson.fixtures.length}`);
    console.log('BALL46_PERFORMANCE_REMOVED_SIGNAL_UI_RESTORE_SUCCESS');
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
