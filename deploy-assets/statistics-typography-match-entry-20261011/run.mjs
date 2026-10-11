import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_STATISTICS_TYPOGRAPHY_MATCH_ENTRY_20261011 */';
const CSS=`
/* B46_STATISTICS_TYPOGRAPHY_MATCH_ENTRY_20261011 */
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(1),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(4),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(5),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){
  font-size:10px!important;
  line-height:1.25!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(1),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(4),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(5),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7){
  font-weight:700!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2){
  font-size:10px!important;
  line-height:1.25!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>strong{
  font-size:10px!important;
  font-weight:850!important;
  line-height:1.25!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>small{
  font-size:9px!important;
  font-weight:600!important;
  line-height:1.25!important;
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics typography only: match detail typography to Entry. No color/card/layout/data changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&fontVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(5000);
  const r=await page.evaluate(()=>{
    const row=document.querySelector('[data-sp-table-body] tr'); if(!row)return {ok:false};
    const cells=[...row.children], cs=e=>e?getComputedStyle(e):null;
    return {
      ok:true,rowCount:document.querySelectorAll('[data-sp-table-body] tr').length,
      font:cs(cells[0])?.fontFamily||'',
      dateSize:cs(cells[0])?.fontSize||'', dateWeight:cs(cells[0])?.fontWeight||'',
      marketSize:cs(cells[2])?.fontSize||'', marketWeight:cs(cells[2])?.fontWeight||'',
      matchStrongSize:cs(cells[1]?.querySelector('strong'))?.fontSize||'', matchStrongWeight:cs(cells[1]?.querySelector('strong'))?.fontWeight||'',
      leagueSize:cs(cells[1]?.querySelector('small'))?.fontSize||'', leagueWeight:cs(cells[1]?.querySelector('small'))?.fontWeight||'',
      tableSpacing:cs(row.closest('table'))?.borderSpacing||''
    };
  });
  report.runtime=r;save();
  assert(r.ok&&r.rowCount>0,'STAT_ROWS_MISSING');
  assert(r.font.includes('IBM Plex Sans'),'IBM_PLEX_NOT_ACTIVE');
  assert.equal(r.dateSize,'10px','DETAIL_SIZE_NOT_MATCHED');
  assert.equal(r.dateWeight,'700','DETAIL_WEIGHT_NOT_MATCHED');
  assert.equal(r.matchStrongSize,'10px','MATCH_SIZE_NOT_MATCHED');
  assert(['800','850'].includes(r.matchStrongWeight),'MATCH_WEIGHT_NOT_MATCHED');
  assert.equal(r.leagueSize,'9px','LEAGUE_SIZE_CHANGED');
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
  console.log('BALL46_STATISTICS_TYPOGRAPHY_MATCH_ENTRY_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
