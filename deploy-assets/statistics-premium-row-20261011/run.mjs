import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='B46_STATISTICS_PREMIUM_ROW_20261011';
const CSS=`
/* B46_STATISTICS_PREMIUM_ROW_20261011 */
body[data-workspace-view="statistics"] .sp-results .sp-table{border-collapse:separate!important;border-spacing:0 7px!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody tr{transition:transform .16s ease,filter .16s ease}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody tr:hover{transform:translateY(-1px);filter:brightness(1.05)}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td{
 background:linear-gradient(180deg,rgba(10,25,43,.96),rgba(5,17,31,.96))!important;
 border-top:1px solid rgba(122,168,207,.16)!important;
 border-bottom:1px solid rgba(122,168,207,.13)!important;
 box-shadow:0 7px 18px rgba(0,0,0,.16);
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:first-child{border-left:1px solid rgba(122,168,207,.16)!important;border-radius:10px 0 0 10px}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:last-child{border-right:1px solid rgba(122,168,207,.16)!important;border-radius:0 10px 10px 0}

body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7),
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){
 position:relative;
 background:linear-gradient(180deg,rgba(17,38,59,.98),rgba(8,24,40,.98))!important;
 box-shadow:inset 0 0 0 1px rgba(122,184,229,.18),0 6px 16px rgba(0,0,0,.14)!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(3){color:#d9e9f6!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(6){color:#f3c969!important;font-weight:900}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(7){color:#b8c9ff!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(9){color:#7fd7ff!important;font-weight:950}

body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div{
 border:1px solid rgba(73,184,225,.28)!important;
 border-radius:9px!important;
 padding:7px 9px!important;
 background:linear-gradient(180deg,rgba(9,34,50,.96),rgba(5,23,37,.96))!important;
 box-shadow:inset 0 0 18px rgba(39,161,207,.06),0 5px 14px rgba(0,0,0,.16)!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>span:first-child{color:#f4f7fb!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:first-of-type{color:#f2c66b!important}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div>small:nth-of-type(2){color:#62d8d1!important}

body[data-workspace-view="statistics"] .sp-results .sp-table .sp-result{
 min-width:66px;display:inline-flex;align-items:center;justify-content:center;
 padding:6px 10px;border-radius:8px!important;font-weight:950;letter-spacing:.02em;
 box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 4px 14px rgba(0,0,0,.16);
}
body[data-workspace-view="statistics"] .sp-results .sp-table .sp-result.is-win{box-shadow:inset 0 0 0 1px rgba(69,229,142,.30),0 0 16px rgba(47,204,124,.12)!important}
body[data-workspace-view="statistics"] .sp-results .sp-table .sp-result.is-loss{box-shadow:inset 0 0 0 1px rgba(255,94,109,.30),0 0 16px rgba(224,53,70,.10)!important}
body[data-workspace-view="statistics"] .sp-results .sp-table .sp-result.is-push{box-shadow:inset 0 0 0 1px rgba(171,190,214,.24)!important}
body[data-workspace-view="statistics"] .sp-results .sp-table .sp-result.is-pending{box-shadow:inset 0 0 0 1px rgba(242,198,107,.28),0 0 15px rgba(242,198,107,.08)!important}

@media(max-width:820px){
 body[data-workspace-view="statistics"] .sp-results .sp-table{border-spacing:0 5px!important}
 body[data-workspace-view="statistics"] .sp-results .sp-table tbody td{box-shadow:none}
 body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(8)>div{padding:6px 7px!important}
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics premium row styling only. No JS/data/engine/settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
 const executablePath=candidates.find(existsSync);assert(executablePath,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&premiumRowVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(5000);
  const r=await page.evaluate(()=>{
   const row=document.querySelector('[data-sp-table-body] tr'); if(!row)return {ok:false};
   const cells=[...row.children], entry=cells[7]?.querySelector('div');
   const rowCell=getComputedStyle(cells[0]), odds=cells[5]?getComputedStyle(cells[5]):null, final=cells[8]?getComputedStyle(cells[8]):null, entryStyle=entry?getComputedStyle(entry):null;
   return {ok:true,rowCount:document.querySelectorAll('[data-sp-table-body] tr').length,borderSpacing:getComputedStyle(row.closest('table')).borderSpacing,firstBg:rowCell.backgroundImage,oddsColor:odds?.color||'',finalColor:final?.color||'',entryRadius:entryStyle?.borderRadius||'',entryBg:entryStyle?.backgroundImage||''};
  });
  report.runtime=r;save();
  assert(r.ok&&r.rowCount>0,'STAT_ROWS_MISSING');assert(r.borderSpacing.includes('7px'),'ROW_SPACING_MISSING');assert(r.entryRadius==='9px','ENTRY_MINICARD_MISSING');
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;assert.equal(base,'87157f1d-04af-41e6-9f5a-fed6f23e443a','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const beforeBytes=await publicFile('/'+TARGET),before=beforeBytes.toString('utf8');assert(!before.includes(MARK),'ALREADY_DEPLOYED_STOP');const after=before+'\n'+CSS+'\n',afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
 writeFileSync('audit/css-before.css',beforeBytes);writeFileSync('audit/css-after.css',afterBytes);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],sha(beforeBytes),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/'+TARGET);if(sha(b)===afterSha&&b.toString('utf8').includes(MARK)){live=true;break}}catch{}await delay(1000)}assert(live,'CSS_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();console.log('BALL46_STATISTICS_PREMIUM_ROW_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
