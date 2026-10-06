import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const EXPECTED_ACTIVE='58569c5a-57f9-47f7-aad5-df81789897da';
const EXPECTED_INDEX_SHA='42bd94b8e3e8a6ceebc51970dc3453ce5f924a434d576fdabf263bade8e4baf6';
const TARGET='index.html';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Recover Ball46 single-page Statistics V2 by forcing fresh browser fetch of the three existing Statistics runtime assets. No engine/data/UI logic changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

const from=[
  'singlepage-workspace-343.js?v=statistics-no-total-cap-20261005',
  'ui-sync-fixes-343-v2.js?v=statistics-no-total-cap-20261005',
  '/longterm-performance-343.js?v=statistics-no-total-cap-20261005'
];
const to=[
  'singlepage-workspace-343.js?v=statistics-recover-20261006-1634',
  'ui-sync-fixes-343-v2.js?v=statistics-recover-20261006-1634',
  '/longterm-performance-343.js?v=statistics-recover-20261006-1634'
];

let current=null,candidate=null;
try{
  current=await inspect();
  report.baseVersion=current.restore.version;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html');
  assert.equal(sha(beforeBytes),EXPECTED_INDEX_SHA,'STOP_PUBLIC_INDEX_MOVED');
  let html=beforeBytes.toString('utf8');
  const original=html;
  for(let i=0;i<from.length;i++){
    const count=html.split(from[i]).length-1;
    assert.equal(count,1,'EXPECTED_REFERENCE_COUNT:'+from[i]+':'+count);
    html=html.replace(from[i],to[i]);
  }
  assert.notEqual(html,original,'INDEX_NOT_PATCHED');
  for(const old of from) assert(!html.includes(old),'OLD_CACHE_KEY_REMAINS:'+old);
  for(const next of to) assert(html.includes(next),'NEW_CACHE_KEY_MISSING:'+next);

  const afterBytes=Buffer.from(html);
  const afterSha=sha(afterBytes);
  report.indexBeforeSha=EXPECTED_INDEX_SHA;
  report.indexAfterSha=afterSha;
  report.changedReferences=to;
  writeFileSync('audit/index-before.html',beforeBytes);
  writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],EXPECTED_INDEX_SHA,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};
  delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);

  wrangler(staged,true);
  assert.equal(await activeVersion(),current.restore.version,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';
    report.completedAt=new Date().toISOString();
    save();
    console.log('BALL46_STATISTICS_CACHEBUST_PREVIEW_PASS',JSON.stringify({afterSha}));
    process.exit(0);
  }

  wrangler(staged);
  for(let i=0;i<30;i++){
    const a=await activeVersion();
    if(a!==current.restore.version){candidate=a;break}
    await delay(1200);
  }
  assert(candidate,'NO_NEW_PRODUCTION_VERSION');

  let directOk=false,publicOk=false;
  for(let i=0;i<40;i++){
    assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
    try{
      const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');
      if(sha(b)===afterSha&&to.every(x=>t.includes(x))){directOk=true;break}
    }catch{}
    await delay(1000);
  }
  assert(directOk,'CACHEBUST_NOT_DIRECT_PRODUCTION');
  for(let i=0;i<40;i++){
    assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
    try{
      const b=await publicFile('/index.html','html'),t=b.toString('utf8');
      if(sha(b)===afterSha&&to.every(x=>t.includes(x))){publicOk=true;break}
    }catch{}
    await delay(1200);
  }
  assert(publicOk,'CACHEBUST_NOT_PUBLIC');

  for(const [p,h] of Object.entries(protectedAssets)){
    assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  }

  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);
  assert(cm,'FINAL_MAIN_MISSING');
  const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
  assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

  report.finalVersion=candidate;
  report.workerSourceUntouched=true;
  report.protectedAssetCount=Object.keys(protectedAssets).length;
  report.result='SUCCESS';
  report.completedAt=new Date().toISOString();
  save();
  console.log('BALL46_STATISTICS_CACHEBUST_SUCCESS',JSON.stringify({from:current.restore.version,to:candidate,afterSha}));
}catch(e){
  report.result='FAIL_STOPPED';
  report.error=e.message;
  report.completedAt=new Date().toISOString();
  save();
  console.error(e.stack);
  process.exitCode=1;
}
