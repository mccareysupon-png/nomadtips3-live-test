import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const SOURCE='color-semantics-343.js';
const NEW_TARGET='color-semantics-stat-entry-20261011.js';
const INDEX='index.html';
const OLD_REF='color-semantics-343.js?v=343-color-semantics-20260922a';
const NEW_REF='color-semantics-stat-entry-20261011.js?v=1';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),scope:'Statistics Entry fix only: use new color-semantics asset path with Entry-preservation guard and update only its index script reference.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchColor(src){
  const old='paintScore(cells[6]);paintScore(cells[7]);';
  const neu='paintScore(cells[6]);if(!cells[7]?.querySelector(\'small\'))paintScore(cells[7]);';
  assert.equal(src.split(old).length-1,1,'WORKSPACE_STATS_SCORE_ANCHOR_COUNT');
  return src.replace(old,neu);
}
function patchIndex(src){
  assert.equal(src.split(OLD_REF).length-1,1,'COLOR_SCRIPT_REF_COUNT');
  return src.replace(OLD_REF,NEW_REF);
}
async function runtimeCheck(){
  const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
  const executablePath=candidates.find(existsSync);assert(executablePath,'NO_CHROME');
  const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-sandbox','--disable-setuid-sandbox']});
  try{
    const page=await browser.newPage();await page.setCacheEnabled(false);
    await page.goto('https://ball46.com/?view=statistics&b46verify='+encodeURIComponent(process.env.GITHUB_RUN_ID||Date.now()),{waitUntil:'networkidle2',timeout:90000});
    await delay(7000);
    const result=await page.evaluate(()=>{
      const script=[...document.scripts].map(s=>s.src).find(x=>x.includes('color-semantics-stat-entry-20261011.js'))||'';
      const rows=[...document.querySelectorAll('[data-sp-table-body] tr')];
      const cells=rows.map(r=>r.children[7]).filter(Boolean);
      const entry=cells.find(c=>/ENTRY\s+\d+['’]/.test(c.innerText||'')&&c.querySelector('small'));
      if(!entry)return {script,rowCount:rows.length,ok:false,samples:cells.slice(0,5).map(c=>({text:c.innerText,html:c.innerHTML}))};
      const div=entry.querySelector('div'),smalls=[...entry.querySelectorAll('small')];
      const style=div?getComputedStyle(div):null;
      return {script,rowCount:rows.length,ok:Boolean(div&&smalls.length>=1),text:entry.innerText,html:entry.innerHTML,rowGap:style?.rowGap||'',smallCount:smalls.length};
    });
    report.runtime=result;save();
    assert(result.script.includes(NEW_TARGET),'NEW_COLOR_SCRIPT_NOT_LOADED');
    assert(result.rowCount>0,'STATISTICS_ROWS_MISSING');
    assert(result.ok,'ENTRY_MARKUP_FLATTENED');
    assert.equal(result.rowGap,'8px','ENTRY_GAP_NOT_PRESERVED');
  }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;const active=await activeVersion();if(active===current.restore.version)return;if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback color semantics Entry fix '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  current=await inspect();const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const sourceBytes=await publicFile('/'+SOURCE),source=sourceBytes.toString('utf8');const indexBeforeBytes=await publicFile('/'+INDEX),indexBefore=indexBeforeBytes.toString('utf8');
  report.sourceSha=sha(sourceBytes);report.indexBeforeSha=sha(indexBeforeBytes);
  assert(source.includes('paintScore(cells[6]);paintScore(cells[7]);'),'EXPECTED_FLATTENING_LOGIC_MISSING');assert(indexBefore.includes(OLD_REF),'EXPECTED_COLOR_SCRIPT_REF_MISSING');
  const newColor=patchColor(source),newColorBytes=Buffer.from(newColor),newColorSha=sha(newColorBytes);const indexAfter=patchIndex(indexBefore),indexAfterBytes=Buffer.from(indexAfter),indexAfterSha=sha(indexAfterBytes);
  writeFileSync('audit/new-color.js',newColorBytes);writeFileSync('audit/index-after.html',indexAfterBytes);
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
  assert.equal(staged.hashes[INDEX],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[INDEX];
  writeFileSync(resolve(staged.runtime,'assets',NEW_TARGET),newColorBytes);writeFileSync(resolve(staged.runtime,'assets',INDEX),indexAfterBytes);
  wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let indexOk=false,newColorOk=false;
    for(let i=0;i<50;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+INDEX),t=b.toString('utf8');if(sha(b)===indexAfterSha&&t.includes(NEW_REF)){indexOk=true;break}}catch{}await delay(1000)}assert(indexOk,'INDEX_PATCH_NOT_LIVE');
    for(let i=0;i<50;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_NEW_COLOR_VERIFY');try{const b=await publicFile('/'+NEW_TARGET+'?v=1'),t=b.toString('utf8');if(sha(b)===newColorSha&&t.includes("if(!cells[7]?.querySelector('small'))paintScore(cells[7]);")){newColorOk=true;break}}catch{}await delay(1000)}assert(newColorOk,'NEW_COLOR_ASSET_NOT_LIVE');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    await runtimeCheck();
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.newColorSha=newColorSha;report.indexAfterSha=indexAfterSha;report.result='SUCCESS';save();
    console.log('BALL46_COLOR_SEMANTICS_ENTRY_FIX_SUCCESS '+JSON.stringify({base,candidate,changed:[INDEX],added:[NEW_TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
