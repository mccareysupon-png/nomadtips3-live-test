import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_STATISTICS_HISTORY_HEADING_PREMIUM_20261011 */';
const CSS=`
/* B46_STATISTICS_HISTORY_HEADING_PREMIUM_20261011 */
body[data-workspace-view="statistics"] .sp-results-head,
body[data-workspace-view="statistics"] .sp-results .sp-table thead th{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .sp-results-head h3{
  margin:0!important;
  color:#f5f7fb!important;
  font-size:18px!important;
  font-weight:900!important;
  line-height:1.15!important;
  letter-spacing:-.01em!important;
}
body[data-workspace-view="statistics"] .sp-results-head p{
  margin-top:6px!important;
  color:#91a8bd!important;
  font-size:11px!important;
  font-weight:600!important;
  line-height:1.35!important;
}
body[data-workspace-view="statistics"] .sp-results-head .sp-record-count{
  color:#f2c66b!important;
  font-size:11px!important;
  font-weight:900!important;
  letter-spacing:.02em!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th{
  font-size:10px!important;
  font-weight:850!important;
  line-height:1.2!important;
  letter-spacing:.025em!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(1){color:#aabed1!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(2){color:#f2f6fa!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(3){color:#79d7e8!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(4){color:#c5b8ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(5){color:#9bd6c2!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(6){color:#f3c969!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(7){color:#b9c7ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(8){color:#f0b96c!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(9){color:#7fd7ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(10){color:#83dfae!important}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Settled Signal History heading/description/record count/table header typography and text colors only. No cards/layout/data changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&historyStyleVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(5000);
  const r=await page.evaluate(()=>{
    const head=document.querySelector('.sp-results-head'), h3=head?.querySelector('h3'), p=head?.querySelector('p'), count=head?.querySelector('.sp-record-count');
    const th=[...document.querySelectorAll('.sp-results .sp-table thead th')];
    const cs=e=>e?getComputedStyle(e):null;
    return {
      ok:Boolean(head&&h3&&p&&count&&th.length===10),
      h3Font:cs(h3)?.fontFamily||'',h3Size:cs(h3)?.fontSize||'',h3Weight:cs(h3)?.fontWeight||'',h3Color:cs(h3)?.color||'',
      pSize:cs(p)?.fontSize||'',pColor:cs(p)?.color||'',
      countColor:cs(count)?.color||'',countWeight:cs(count)?.fontWeight||'',
      thSize:cs(th[0])?.fontSize||'',thWeight:cs(th[0])?.fontWeight||'',
      oddsColor:cs(th[5])?.color||'',entryColor:cs(th[7])?.color||'',finalColor:cs(th[8])?.color||'',resultColor:cs(th[9])?.color||'',
      tableSpacing:cs(document.querySelector('.sp-results .sp-table'))?.borderSpacing||''
    };
  });
  report.runtime=r;save();
  assert(r.ok,'HISTORY_BLOCK_MISSING');
  assert(r.h3Font.includes('IBM Plex Sans'),'FONT_NOT_ACTIVE');
  assert.equal(r.h3Size,'18px','TITLE_SIZE_MISSING');
  assert.equal(r.countColor,'rgb(242, 198, 107)','COUNT_COLOR_MISSING');
  assert.equal(r.oddsColor,'rgb(243, 201, 105)','ODDS_HEADER_COLOR_MISSING');
  assert.equal(r.entryColor,'rgb(240, 185, 108)','ENTRY_HEADER_COLOR_MISSING');
  assert.equal(r.finalColor,'rgb(127, 215, 255)','FINAL_HEADER_COLOR_MISSING');
  assert.equal(r.resultColor,'rgb(131, 223, 174)','RESULT_HEADER_COLOR_MISSING');
  assert.equal(r.tableSpacing,'2px','LAYOUT_CHANGED');
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const beforeBytes=await publicFile('/'+TARGET),before=beforeBytes.toString('utf8');
 assert(!before.includes(MARK),'ALREADY_DEPLOYED_STOP');
 const after=before+'\n'+CSS+'\n',afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
 writeFileSync('audit/css-before.css',beforeBytes);writeFileSync('audit/css-after.css',afterBytes);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[TARGET],sha(beforeBytes),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
 writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+TARGET);if(sha(b)===afterSha&&b.toString('utf8').includes(MARK)){live=true;break}}catch{}await delay(1000)}assert(live,'CSS_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_STATISTICS_HISTORY_PREMIUM_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
