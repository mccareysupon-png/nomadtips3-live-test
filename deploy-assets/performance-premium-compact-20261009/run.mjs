import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin,literals} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-performance-premium-compact-20261009';
const TARGET='index.html';
const MARK='B46_PERFORMANCE_PREMIUM_COMPACT_20261009';
const OLD_MARK='B46_DAILY_PERFORMANCE_20261005';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});

const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.GITHUB_REF_NAME,
  startedAt:new Date().toISOString(),
  scope:'Daily Performance presentation only: approved Premium Compact / Clean Sci-Fi design on PC, remove embedded stadium image payload, reduce visual height, preserve card runtime/data logic, mobile hide, engine, APIs, Statistics and Signal.'
};
const save=()=>writeFileSync('audit/performance-premium-compact-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function extract(html,start,end,label){
  const a=html.indexOf(start);
  const b=html.indexOf(end,a+start.length);
  assert(a>=0&&b>a,label+'_BLOCK_MISSING');
  return html.slice(a,b+end.length);
}
function runtimeBlock(html){
  return extract(
    html,
    '<!-- B46_DAILY_PERFORMANCE_20261005 SCRIPT START -->',
    '<!-- B46_DAILY_PERFORMANCE_20261005 SCRIPT END -->',
    'PERFORMANCE_RUNTIME'
  );
}
function baseStyleBlock(html){
  return extract(
    html,
    '<!-- B46_DAILY_PERFORMANCE_20261005 STYLE START -->',
    '<!-- B46_DAILY_PERFORMANCE_20261005 STYLE END -->',
    'PERFORMANCE_BASE_STYLE'
  );
}
function premiumBlock(css){
  return '\n<!-- '+MARK+' START -->\n<style id="b46-performance-premium-compact-20261009">\n'+css+'\n</style>\n<!-- '+MARK+' END -->\n';
}
function patchCurrent(before,css){
  assert(before.includes(OLD_MARK),'DAILY_PERFORMANCE_BASE_MISSING');
  assert(before.includes('id="ball46-daily-performance-runtime"'),'DAILY_PERFORMANCE_RUNTIME_MISSING');
  assert(before.includes('@media(max-width:760px){#ball46-daily-performance{display:none!important'),'MOBILE_HIDE_GUARD_MISSING');
  assert(before.includes('b46-performance-summary-only-20261006'),'SUMMARY_ONLY_GUARD_MISSING');
  assert(before.includes('b46-hide-total-picks-20261006'),'TOTAL_PICKS_HIDE_GUARD_MISSING');

  const runtimeBefore=runtimeBlock(before);
  const styleBefore=baseStyleBlock(before);

  const imgRe=/background-image:url\("data:image\/webp;base64,[A-Za-z0-9+/=]+"\)!important;/g;
  const matches=before.match(imgRe)||[];
  assert.equal(matches.length,1,'EMBEDDED_STADIUM_IMAGE_COUNT_BAD');

  const premiumRe=new RegExp('\\n?<!-- '+MARK+' START -->[\\s\\S]*?<!-- '+MARK+' END -->\\n?','g');
  const withoutOldPremium=before.replace(premiumRe,'\n');
  const imageRemoved=withoutOldPremium.replace(imgRe,'background-image:none!important;');
  assert.notEqual(imageRemoved,withoutOldPremium,'STADIUM_IMAGE_NOT_REMOVED');
  assert(!imageRemoved.includes('data:image/webp;base64,'),'EMBEDDED_STADIUM_PAYLOAD_STILL_PRESENT');

  const block=premiumBlock(css);
  assert.equal((imageRemoved.match(/<\/head>/g)||[]).length,1,'HEAD_CLOSE_COUNT_BAD');
  const after=imageRemoved.replace('</head>',block+'</head>');

  assert(after.includes(MARK),'PREMIUM_MARKER_MISSING');
  assert(after.includes('BALL46 PERFORMANCE'),'PREMIUM_TOPBAR_RULE_MISSING');
  assert(after.includes('background-image:none!important;'),'BASE_STADIUM_IMAGE_DISABLE_MISSING');
  assert(!after.includes('data:image/webp;base64,'),'STADIUM_PAYLOAD_REINTRODUCED');
  assert.equal(runtimeBlock(after),runtimeBefore,'PERFORMANCE_RUNTIME_CHANGED');
  const styleAfter=baseStyleBlock(after);
  assert(styleAfter.includes('background-image:none!important;'),'BASE_STYLE_STADIUM_IMAGE_NOT_DISABLED');

  return{
    after,
    runtimeSha:sha(Buffer.from(runtimeBefore)),
    baseStyleBeforeSha:sha(Buffer.from(styleBefore)),
    baseStyleAfterSha:sha(Buffer.from(styleAfter)),
    imagePayloadBytesRemoved:Buffer.byteLength(before)-Buffer.byteLength(imageRemoved)
  };
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
  await api('/scripts/'+script+'/deployments',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:current.restore.version,percentage:100}],
      annotations:{'workers/message':'Rollback Premium Compact Performance '+report.run}
    })
  });
  for(let i=0;i<20;i++){
    if(await activeVersion()===current.restore.version)break;
    await delay(1200);
  }
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};
  save();
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  const css=readFileSync('premium.css','utf8');
  assert(css.includes(MARK),'PREMIUM_CSS_MARKER_MISSING');
  assert(css.includes('@media(min-width:761px)'),'PC_ONLY_GUARD_MISSING');
  assert(css.includes('background-image:'),'CLEAN_BACKGROUND_RULE_MISSING');
  assert(css.includes('grid-template-columns:1fr 1fr'),'TWO_SIDE_LAYOUT_RULE_MISSING');
  assert(css.includes('color:#ffd35c!important'),'YELLOW_ACCENT_RULE_MISSING');

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

  const beforeBytes=await publicFile('/'+TARGET,'html');
  const directBefore=await publicFile('/'+TARGET,'html',directOrigin);
  assert.equal(sha(beforeBytes),sha(directBefore),'PUBLIC_DIRECT_INDEX_DIFFER');
  const before=beforeBytes.toString('utf8');
  const beforeSha=sha(beforeBytes);
  writeFileSync('audit/index-before.html',beforeBytes);
  report.indexBeforeSha=beforeSha;
  report.indexBeforeBytes=beforeBytes.length;

  const patched=patchCurrent(before,css);
  const afterBytes=Buffer.from(patched.after);
  const afterSha=sha(afterBytes);
  writeFileSync('audit/index-after.html',afterBytes);
  report.indexAfterSha=afterSha;
  report.indexAfterBytes=afterBytes.length;
  report.performanceRuntimeSha=patched.runtimeSha;
  report.baseStyleBeforeSha=patched.baseStyleBeforeSha;
  report.baseStyleAfterSha=patched.baseStyleAfterSha;
  report.imagePayloadBytesRemoved=patched.imagePayloadBytesRemoved;
  report.netIndexBytesChange=afterBytes.length-beforeBytes.length;

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};
  delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',TARGET))),afterSha,'STAGED_INDEX_SHA_BAD');
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
    console.log('INDEX_BEFORE_SHA='+beforeSha);
    console.log('INDEX_AFTER_SHA='+afterSha);
    console.log('PERFORMANCE_RUNTIME_SHA='+patched.runtimeSha);
    console.log('IMAGE_PAYLOAD_BYTES_REMOVED='+patched.imagePayloadBytesRemoved);
    console.log('NET_INDEX_BYTES_CHANGE='+report.netIndexBytesChange);
    console.log('BALL46_PERFORMANCE_PREMIUM_COMPACT_PREVIEW_PASS');
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
        const b=await publicFile('/'+TARGET,'html',directOrigin);
        const t=b.toString('utf8');
        if(
          sha(b)===afterSha &&
          t.includes(MARK) &&
          !t.includes('data:image/webp;base64,') &&
          sha(Buffer.from(runtimeBlock(t)))===patched.runtimeSha
        ){directOk=true;break}
      }catch{}
      await delay(1250);
    }
    assert(directOk,'PREMIUM_COMPACT_NOT_DIRECT_PRODUCTION');

    let publicOk=false,lastPublicSha=null;
    for(let i=0;i<35;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const b=await publicFile('/'+TARGET,'html');
        const t=b.toString('utf8');
        lastPublicSha=sha(b);
        if(
          lastPublicSha===afterSha &&
          t.includes(MARK) &&
          t.includes('BALL46 PERFORMANCE') &&
          !t.includes('data:image/webp;base64,') &&
          t.includes('@media(max-width:760px){#ball46-daily-performance{display:none!important') &&
          sha(Buffer.from(runtimeBlock(t)))===patched.runtimeSha
        ){publicOk=true;break}
      }catch{}
      await delay(1500);
    }
    assert(publicOk,'PREMIUM_COMPACT_NOT_PUBLIC');
    report.publicSha=lastPublicSha;

    const diff={};
    for(const [p,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+p));
      if(got!==h)diff[p]={expected:h,got};
    }
    assert.equal(Object.keys(diff).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(diff));

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
    report.performanceRuntimeUntouched=true;
    report.backendUntouched=true;
    report.signalUntouched=true;
    report.statisticsUntouched=true;
    report.mobileHidePreserved=true;
    report.unrelatedStaticAssetsUntouched=true;
    report.completedAt=new Date().toISOString();
    save();

    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+afterSha);
    console.log('INDEX_BYTES='+afterBytes.length);
    console.log('IMAGE_PAYLOAD_BYTES_REMOVED='+patched.imagePayloadBytesRemoved);
    console.log('PERFORMANCE_RUNTIME_SHA='+patched.runtimeSha);
    console.log('BALL46_PERFORMANCE_PREMIUM_COMPACT_SUCCESS');
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
