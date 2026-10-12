import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_STATISTICS_KPI_PREMIUM_20261012 */';
const CSS=`
/* B46_STATISTICS_KPI_PREMIUM_20261012 */
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi span,
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi strong,
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi small{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi span{
  font-size:9px!important;
  font-weight:850!important;
  letter-spacing:.075em!important;
  line-height:1.15!important;
}
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi strong{
  font-size:20px!important;
  font-weight:900!important;
  line-height:1.05!important;
  letter-spacing:-.015em!important;
}
body[data-workspace-view="statistics"] .sp-kpis .sp-kpi small{
  font-size:9px!important;
  font-weight:600!important;
  line-height:1.25!important;
}

/* Dark */
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(1) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(1) strong{color:#b8c8d8!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(2) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(2) strong{color:#ff9a4d!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(3) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(3) strong{color:#7fe0ab!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(4) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(4) strong{color:#ff98a5!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(5) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(5) strong{color:#b9c5d0!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(6) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(6) strong{color:#7fd7ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(7) span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(7) strong{color:#b9b0ff!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi small{color:#8fa4b6!important}

/* Light */
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(1) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(1) strong{color:#44586a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(2) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(2) strong{color:#d96816!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(3) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(3) strong{color:#167a48!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(4) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(4) strong{color:#b23748!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(5) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(5) strong{color:#56697b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(6) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(6) strong{color:#1769aa!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(7) span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi:nth-child(7) strong{color:#5d4fc2!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-kpis .sp-kpi small{color:#607184!important}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics KPI typography and text colors only. Preserve card geometry/layout/data.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function snap(page,theme){
 await page.evaluate(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
 await page.reload({waitUntil:'networkidle2',timeout:90000});
 await delay(3000);
 return page.evaluate(()=>{
  const cards=[...document.querySelectorAll('.sp-kpis .sp-kpi')],cs=e=>getComputedStyle(e);
  return {theme:document.documentElement.dataset.theme,count:cards.length,
    values:cards.map(c=>({label:c.querySelector('span')?.textContent.trim(),labelColor:cs(c.querySelector('span')).color,strong:c.querySelector('strong')?.textContent.trim(),strongColor:cs(c.querySelector('strong')).color,strongSize:cs(c.querySelector('strong')).fontSize,strongWeight:cs(c.querySelector('strong')).fontWeight,smallColor:cs(c.querySelector('small')).color})),
    grid:cs(document.querySelector('.sp-kpis')).gridTemplateColumns
  };
 });
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&kpiVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  const light=await snap(page,'light'),dark=await snap(page,'dark');
  report.runtime={light,dark};save();
  assert.equal(light.count,7,'LIGHT_KPI_COUNT_CHANGED');assert.equal(dark.count,7,'DARK_KPI_COUNT_CHANGED');
  assert.equal(light.values[1].strongColor,'rgb(217, 104, 22)','LIGHT_UNSETTLED_NOT_ORANGE');
  assert.equal(dark.values[1].strongColor,'rgb(255, 154, 77)','DARK_UNSETTLED_NOT_ORANGE');
  assert.equal(light.values[2].strongColor,'rgb(22, 122, 72)','LIGHT_WIN_COLOR_MISSING');
  assert.equal(light.values[3].strongColor,'rgb(178, 55, 72)','LIGHT_LOSS_COLOR_MISSING');
  assert.equal(light.values[5].strongColor,'rgb(23, 105, 170)','LIGHT_WINRATE_COLOR_MISSING');
  assert.equal(light.values[6].strongColor,'rgb(93, 79, 194)','LIGHT_AVGODDS_COLOR_MISSING');
  assert.equal(light.values[0].strongSize,'20px','KPI_VALUE_SIZE_MISSING');
  assert.equal(light.values[0].strongWeight,'900','KPI_VALUE_WEIGHT_MISSING');
  assert.equal(light.grid,dark.grid,'KPI_LAYOUT_CHANGED_ACROSS_THEMES');
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
 assert.equal(base,'b9819441-1f05-4f42-a388-1e0d08720a83','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
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
  console.log('BALL46_STATISTICS_KPI_PREMIUM_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
