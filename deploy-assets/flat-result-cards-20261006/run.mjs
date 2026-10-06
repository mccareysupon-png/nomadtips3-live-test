import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-flat-result-cards-20261006';
const TARGET='index.html';
const MARK='B46_FLAT_RESULT_CARDS_20261006';
const STYLE_ID='b46-flat-result-cards-style';
const SCRIPT_ID='b46-flat-result-cards-runtime';
const deploy=process.env.DEPLOY_ENABLED==='true';

mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  commit:process.env.GITHUB_SHA,
  branch:process.env.PATCH_SOURCE_BRANCH,
  startedAt:new Date().toISOString(),
  scope:'Visual-only refresh of detailed WIN/LOSS/DRAW(PUSH)/PENDING cards below the current Ball46 search toolbar. Preserve card dimensions, match details, data logic, statistics, engine, bindings, schedules, Worker source and every unrelated static asset.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function blocks(css,js){
  return {
    style:`\n<!-- ${MARK} STYLE START -->\n<style id="${STYLE_ID}">\n${css}\n</style>\n<!-- ${MARK} STYLE END -->\n`,
    scriptBlock:`\n<!-- ${MARK} SCRIPT START -->\n<script id="${SCRIPT_ID}">\n${js}\n</script>\n<!-- ${MARK} SCRIPT END -->\n`
  };
}
function patchIndex(before,css,js){
  assert(before.includes('<div class="board-toolbar">'),'SEARCH_TOOLBAR_ANCHOR_MISSING');
  assert(before.includes('main-board'),'MAIN_BOARD_ANCHOR_MISSING');
  assert.equal((before.match(/<\/head>/g)||[]).length,1,'HEAD_CLOSE_COUNT_BAD');
  assert.equal((before.match(/<\/body>/g)||[]).length,1,'BODY_CLOSE_COUNT_BAD');

  const styleRe=new RegExp(`\\n?<!-- ${MARK} STYLE START -->[\\s\\S]*?<!-- ${MARK} STYLE END -->\\n?`);
  const scriptRe=new RegExp(`\\n?<!-- ${MARK} SCRIPT START -->[\\s\\S]*?<!-- ${MARK} SCRIPT END -->\\n?`);
  const hadStyle=styleRe.test(before),hadScript=scriptRe.test(before);
  assert.equal(hadStyle,hadScript,'PARTIAL_EXISTING_FLAT_CARD_BLOCK');
  const clean=before.replace(styleRe,'').replace(scriptRe,'');
  const {style,scriptBlock}=blocks(css,js);
  const after=clean.replace('</head>',style+'</head>').replace('</body>',scriptBlock+'</body>');
  assert(after.includes(STYLE_ID)&&after.includes(SCRIPT_ID),'INJECTION_MISSING');
  assert.equal((after.match(new RegExp(MARK+' STYLE START','g'))||[]).length,1,'STYLE_BLOCK_COUNT_BAD');
  assert.equal((after.match(new RegExp(MARK+' SCRIPT START','g'))||[]).length,1,'SCRIPT_BLOCK_COUNT_BAD');
  return {after,mode:hadStyle?'replace':'insert'};
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
      annotations:{'workers/message':`Rollback Ball46 flat result cards ${report.run}`}
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
  const css=readFileSync('style.css','utf8');
  const js=readFileSync('runtime.js','utf8');
  assert(css.includes(MARK),'CSS_MARKER_MISSING');
  assert(js.includes(MARK),'JS_MARKER_MISSING');
  assert(css.includes('"Nunito Sans"'),'NUNITO_SANS_MISSING');
  assert(css.includes('box-shadow:none!important'),'NO_GLOW_RULE_MISSING');
  assert(css.includes('border:0!important'),'NO_BORDER_RULE_MISSING');
  assert(css.includes('#0f8f4f')&&css.includes('#c8323e')&&css.includes('#5a6a7b')&&css.includes('#d97706'),'STATUS_COLORS_MISSING');
  assert(js.includes('b46-flat-status-icon'),'ICON_RUNTIME_MISSING');
  parse(js,{ecmaVersion:'latest',sourceType:'script'});
  writeFileSync('audit/style.css',css);
  writeFileSync('audit/runtime.js',js);

  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.rollbackVersion=base;
  report.backendBefore=current.restore.backend;

  const workerBeforeSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html');
  const before=beforeBytes.toString('utf8');
  const beforeSha=sha(beforeBytes);
  report.indexBeforeSha=beforeSha;
  writeFileSync('audit/index-before.html',beforeBytes);

  const patched=patchIndex(before,css,js);
  report.injectionMode=patched.mode;
  const afterBytes=Buffer.from(patched.after);
  const afterSha=sha(afterBytes);
  assert.notEqual(afterSha,beforeSha,'INDEX_UNCHANGED');
  report.indexAfterSha=afterSha;
  writeFileSync('audit/index-after.html',afterBytes);

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
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion=base;
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+base);
    console.log('BALL46_FLAT_RESULT_CARDS_PREVIEW_PASS');
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
        const b=await publicFile('/index.html','html',directOrigin);
        const t=b.toString('utf8');
        if(sha(b)===afterSha&&t.includes(STYLE_ID)&&t.includes(SCRIPT_ID)&&t.includes('Nunito Sans')&&t.includes('b46-flat-status-icon')){directOk=true;break}
      }catch{}
      await delay(1100);
    }
    assert(directOk,'FLAT_RESULT_CARDS_NOT_DIRECT_PRODUCTION');

    let publicOk=false,lastPublicSha=null;
    for(let i=0;i<36;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const b=await publicFile('/index.html','html');
        const t=b.toString('utf8');
        lastPublicSha=sha(b);
        if(lastPublicSha===afterSha&&t.includes(STYLE_ID)&&t.includes(SCRIPT_ID)&&t.includes('#0f8f4f')&&t.includes('#d97706')){publicOk=true;break}
      }catch{}
      await delay(1300);
    }
    assert(publicOk,'FLAT_RESULT_CARDS_NOT_PUBLIC');
    report.publicSha=lastPublicSha;

    const changed={};
    for(const [p,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+p));
      if(got!==h)changed[p]={expected:h,got};
    }
    assert.equal(Object.keys(changed).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(changed));

    const [boardJson,signalsJson,statsJson]=await Promise.all([
      '/api/engine/board','/api/engine/signals','/api/engine/statistics'
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
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log('ROLLBACK_VERSION='+base);
    console.log('FINAL_PRODUCTION='+candidate);
    console.log('INDEX_SHA='+afterSha);
    console.log('BALL46_FLAT_RESULT_CARDS_SUCCESS');
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