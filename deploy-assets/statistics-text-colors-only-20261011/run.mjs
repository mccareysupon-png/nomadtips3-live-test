import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const OLD_MARK='/* B46_STATISTICS_PREMIUM_ROW_20261011 */';
const NEW_MARK='/* B46_STATISTICS_TEXT_COLORS_ONLY_20261011 */';
const COLORS=`
/* B46_STATISTICS_TEXT_COLORS_ONLY_20261011 */
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(1){color:#9fb4c8!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2){color:#c7d7e6!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3){color:#d9e9f6!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(4){color:#f4f7fb!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(5){color:#9fd4ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6){color:#f3c969!important;font-weight:900}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7){color:#b8c9ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>span:first-child{color:#f4f7fb!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:first-of-type{color:#f2c66b!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:nth-of-type(2){color:#62d8d1!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){color:#7fd7ff!important;font-weight:950}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics text colors only. Remove prior premium row/card styling; keep original cards/layout.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
 const executablePath=candidates.find(existsSync);assert(executablePath,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&textColorVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(5000);
  const r=await page.evaluate(()=>{
   const row=document.querySelector('[data-sp-table-body] tr'); if(!row)return {ok:false};
   const cells=[...row.children];
   const tableStyle=getComputedStyle(row.closest('table'));
   const first=getComputedStyle(cells[0]);
   const odds=getComputedStyle(cells[5]);
   const final=getComputedStyle(cells[8]);
   return {ok:true,rowCount:document.querySelectorAll('[data-sp-table-body] tr').length,borderSpacing:tableStyle.borderSpacing,firstBg:first.backgroundImage,oddsColor:odds.color,finalColor:final.color};
  });
  report.runtime=r;save();
  assert(r.ok&&r.rowCount>0,'STAT_ROWS_MISSING');
  assert.equal(r.borderSpacing,'0px 2px','ORIGINAL_ROW_SPACING_NOT_RESTORED');
  assert(!r.firstBg.includes('linear-gradient'),'PREMIUM_ROW_BACKGROUND_STILL_ACTIVE');
  assert.equal(r.oddsColor,'rgb(243, 201, 105)','ODDS_TEXT_COLOR_MISSING');
  assert.equal(r.finalColor,'rgb(127, 215, 255)','FINAL_TEXT_COLOR_MISSING');
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await inspect();
 const base=current.restore.version;report.baseVersion=base;
 assert.equal(base,'e2cbf1ca-a369-46f5-89af-55281c07d01e','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
 const workerSha=sha(Buffer.from(current.source));
 const settingsBefore=await api('/scripts/'+script+'/settings');
 const settingsSha=sha(canonical(settingsBefore));
 const cronsBefore=await schedules();
 const beforeBytes=await publicFile('/'+TARGET),before=beforeBytes.toString('utf8');
 assert(before.includes(OLD_MARK),'PREMIUM_ROW_BLOCK_NOT_FOUND');
 assert(!before.includes(NEW_MARK),'TEXT_COLORS_ALREADY_ACTIVE');
 const cut=before.indexOf(OLD_MARK);assert(cut>0,'BAD_PREMIUM_MARK_POSITION');
 const restored=before.slice(0,cut).trimEnd();
 const NL=String.fromCharCode(10);
 const after=restored+NL+NL+COLORS+NL;
 const afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
 writeFileSync('audit/css-before.css',beforeBytes);writeFileSync('audit/css-after.css',afterBytes);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
 await verifyRailBase(staged);
 assert.equal(staged.hashes[TARGET],sha(beforeBytes),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
 writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
 wrangler(staged,true);
 assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
 await verifyRailBase(staged);
 try{
  wrangler(staged);
  for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
  assert(candidate,'NO_NEW_VERSION');
  let live=false;
  for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+TARGET);const t=b.toString('utf8');if(sha(b)===afterSha&&t.includes(NEW_MARK)&&!t.includes(OLD_MARK)){live=true;break}}catch{}await delay(1000)}
  assert(live,'CSS_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_STATISTICS_TEXT_COLORS_ONLY_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
