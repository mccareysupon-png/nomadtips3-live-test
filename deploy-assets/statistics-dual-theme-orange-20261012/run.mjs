import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_STATISTICS_DUAL_THEME_ORANGE_20261012 */';
const CSS=`
/* B46_STATISTICS_DUAL_THEME_ORANGE_20261012 */

/* ===== DARK MODE ===== */
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(1){color:#afc1d1!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2){color:#f2f6fa!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>strong{color:#f4f7fb!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>small{color:#91a8bd!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3){color:#6fd7e8!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(4){color:#c7b8ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(5){color:#8ed8b8!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6){color:#ff9a4d!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7){color:#afc1ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>span:first-child{color:#f4f7fb!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:first-of-type{color:#ff9a4d!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:nth-of-type(2){color:#62d8d1!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){color:#7fd7ff!important}

/* ===== LIGHT MODE ===== */
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(1){color:#4a5a68!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2){color:#17212b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>strong{color:#111b25!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(2) .sp-match>small{color:#566879!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3){color:#0d6c78!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(4){color:#5b4ab8!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(5){color:#287a5b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6){color:#d96816!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7){color:#4059a8!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>span:first-child{color:#1a2733!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:first-of-type{color:#d96816!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:nth-of-type(2){color:#08776f!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){color:#1769aa!important}

/* ===== SETTLED SIGNAL HISTORY HEADING / HEADERS ===== */
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results-head h3{color:#f5f7fb!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results-head p{color:#91a8bd!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results-head .sp-record-count{color:#ff9a4d!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results-head h3{color:#15202b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results-head p{color:#5b6d7d!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results-head .sp-record-count{color:#d96816!important}

html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(1){color:#aabed1!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(2){color:#f2f6fa!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(3){color:#79d7e8!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(4){color:#c5b8ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(5){color:#9bd6c2!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(6){color:#ff9a4d!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(7){color:#b9c7ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(8){color:#ff9a4d!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(9){color:#7fd7ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(10){color:#83dfae!important}

html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(1){color:#526575!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(2){color:#1b2630!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(3){color:#0d6c78!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(4){color:#5b4ab8!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(5){color:#287a5b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(6){color:#d96816!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(7){color:#4059a8!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(8){color:#d96816!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(9){color:#1769aa!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table thead th:nth-child(10){color:#167a48!important}

/* ===== RESULT BADGES / DARK ===== */
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.win,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-win{color:#87e7b3!important;border-color:rgba(70,220,139,.38)!important;background:linear-gradient(180deg,rgba(31,118,75,.30),rgba(17,70,49,.24))!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.loss,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-loss{color:#ff9ca7!important;border-color:rgba(239,82,101,.38)!important;background:linear-gradient(180deg,rgba(122,38,50,.31),rgba(76,25,35,.24))!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.push,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-push{color:#c3d0dc!important;border-color:rgba(172,193,214,.30)!important;background:linear-gradient(180deg,rgba(82,103,124,.22),rgba(49,65,82,.20))!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.pending,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-pending,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.null{color:#ffad66!important;border-color:rgba(255,154,77,.42)!important;background:linear-gradient(180deg,rgba(139,69,24,.30),rgba(87,43,19,.24))!important}

/* ===== RESULT BADGES / LIGHT ===== */
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.win,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-win{color:#12663b!important;border-color:rgba(22,122,72,.30)!important;background:#e6f5ec!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.loss,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-loss{color:#a72f40!important;border-color:rgba(167,47,64,.27)!important;background:#fbeaed!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.push,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-push{color:#506477!important;border-color:rgba(80,100,119,.25)!important;background:#edf1f4!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.pending,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-pending,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.null{color:#b34f0f!important;border-color:rgba(217,104,22,.30)!important;background:#fff0e4!important}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics dual-theme text palette + orange replacement only. Preserve typography, cards, layout, data, engine, settlement.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function snapshot(page,theme){
 await page.evaluate(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
 await page.reload({waitUntil:'networkidle2',timeout:90000});
 await delay(3500);
 return await page.evaluate(()=>{
  const row=document.querySelector('[data-sp-table-body] tr'); if(!row)return {ok:false};
  const c=[...row.children], th=[...document.querySelectorAll('.sp-results .sp-table thead th')];
  const cs=e=>e?getComputedStyle(e):null;
  const badge=c[9]?.querySelector('.sp-result');
  return {
   ok:true,theme:document.documentElement.dataset.theme,rowCount:document.querySelectorAll('[data-sp-table-body] tr').length,
   date:cs(c[0])?.color,match:cs(c[1]?.querySelector('.sp-match>strong'))?.color,league:cs(c[1]?.querySelector('.sp-match>small'))?.color,
   market:cs(c[2])?.color,pick:cs(c[3])?.color,line:cs(c[4])?.color,odds:cs(c[5])?.color,referee:cs(c[6])?.color,
   entryScore:cs(c[7]?.querySelector('div>span:first-child'))?.color,entryMinute:cs(c[7]?.querySelector('div>small:first-of-type'))?.color,corners:cs(c[7]?.querySelector('div>small:nth-of-type(2)'))?.color,
   final:cs(c[8])?.color,recordCount:cs(document.querySelector('.sp-record-count'))?.color,oddsHead:cs(th[5])?.color,entryHead:cs(th[7])?.color,
   badge:badge?{text:badge.textContent.trim(),color:cs(badge).color,bg:cs(badge).backgroundColor,bgImage:cs(badge).backgroundImage,radius:cs(badge).borderRadius}:null,
   spacing:cs(row.closest('table'))?.borderSpacing
  };
 });
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&dualThemeVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  const light=await snapshot(page,'light');
  const dark=await snapshot(page,'dark');
  report.runtime={light,dark};save();
  assert(light.ok&&dark.ok,'STAT_ROWS_MISSING');
  assert.equal(light.theme,'light','LIGHT_THEME_NOT_ACTIVE');
  assert.equal(dark.theme,'dark','DARK_THEME_NOT_ACTIVE');
  assert.equal(light.odds,'rgb(217, 104, 22)','LIGHT_ODDS_NOT_ORANGE');
  assert.equal(dark.odds,'rgb(255, 154, 77)','DARK_ODDS_NOT_ORANGE');
  assert.equal(light.entryMinute,'rgb(217, 104, 22)','LIGHT_ENTRY_NOT_ORANGE');
  assert.equal(dark.entryMinute,'rgb(255, 154, 77)','DARK_ENTRY_NOT_ORANGE');
  assert.equal(light.recordCount,'rgb(217, 104, 22)','LIGHT_RECORD_NOT_ORANGE');
  assert.equal(dark.recordCount,'rgb(255, 154, 77)','DARK_RECORD_NOT_ORANGE');
  assert.equal(light.entryScore,'rgb(26, 39, 51)','LIGHT_ENTRY_SCORE_LOW_CONTRAST');
  assert.equal(dark.entryScore,'rgb(244, 247, 251)','DARK_ENTRY_SCORE_WRONG');
  assert.equal(light.spacing,'2px','LIGHT_LAYOUT_CHANGED');
  assert.equal(dark.spacing,'2px','DARK_LAYOUT_CHANGED');
  assert(light.badge?.radius==='999px'&&dark.badge?.radius==='999px','RESULT_BADGE_GEOMETRY_CHANGED');
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
  console.log('BALL46_STATISTICS_DUAL_THEME_ORANGE_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
