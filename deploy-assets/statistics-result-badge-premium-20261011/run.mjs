import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_STATISTICS_RESULT_BADGE_PREMIUM_20261011 */';
const CSS=`
/* B46_STATISTICS_RESULT_BADGE_PREMIUM_20261011 */
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:58px!important;
  padding:4px 9px!important;
  border-radius:999px!important;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:9px!important;
  font-weight:900!important;
  line-height:1.1!important;
  letter-spacing:.055em!important;
  text-transform:uppercase!important;
  border:1px solid rgba(164,184,204,.22)!important;
  background:rgba(116,137,158,.10)!important;
  color:#d9e4ee!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 2px 8px rgba(0,0,0,.14)!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.win,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-win,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result[class*="half_win"],
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result[class*="half-win"]{
  color:#87e7b3!important;
  border-color:rgba(70,220,139,.38)!important;
  background:linear-gradient(180deg,rgba(31,118,75,.30),rgba(17,70,49,.24))!important;
  box-shadow:inset 0 1px 0 rgba(160,255,203,.07),0 0 10px rgba(42,193,114,.09)!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.loss,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-loss,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result[class*="half_loss"],
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result[class*="half-loss"]{
  color:#ff9ca7!important;
  border-color:rgba(239,82,101,.38)!important;
  background:linear-gradient(180deg,rgba(122,38,50,.31),rgba(76,25,35,.24))!important;
  box-shadow:inset 0 1px 0 rgba(255,184,193,.05),0 0 10px rgba(222,62,83,.07)!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.push,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-push{
  color:#c3d0dc!important;
  border-color:rgba(172,193,214,.30)!important;
  background:linear-gradient(180deg,rgba(82,103,124,.22),rgba(49,65,82,.20))!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.pending,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.is-pending,
body[data-workspace-view="statistics"] .sp-results .sp-table tbody td:nth-child(10) .sp-result.null{
  color:#f2ca72!important;
  border-color:rgba(242,198,107,.34)!important;
  background:linear-gradient(180deg,rgba(120,91,30,.28),rgba(77,58,21,.22))!important;
  box-shadow:inset 0 1px 0 rgba(255,226,151,.05),0 0 10px rgba(232,184,72,.06)!important;
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Result badge styling only in Statistics table. No data, other columns, table layout, engine or settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&resultBadgeVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(5000);
  const r=await page.evaluate(()=>{
    const badges=[...document.querySelectorAll('.sp-results .sp-table tbody td:nth-child(10) .sp-result')];
    const cs=e=>getComputedStyle(e);
    const samples=badges.slice(0,20).map(e=>({text:e.textContent.trim(),cls:e.className,color:cs(e).color,bg:cs(e).backgroundImage,border:cs(e).borderColor,radius:cs(e).borderRadius,font:cs(e).fontFamily,size:cs(e).fontSize,weight:cs(e).fontWeight,minWidth:cs(e).minWidth,padding:cs(e).padding}));
    const pending=badges.find(e=>e.textContent.trim()==='PENDING');
    const win=badges.find(e=>/WIN/.test(e.textContent.trim()));
    const loss=badges.find(e=>/LOSS/.test(e.textContent.trim()));
    const push=badges.find(e=>/PUSH|DRAW/.test(e.textContent.trim()));
    return {
      ok:badges.length>0,count:badges.length,tableSpacing:cs(document.querySelector('.sp-results .sp-table')).borderSpacing,
      first:samples[0],samples,
      pending:pending?{text:pending.textContent.trim(),cls:pending.className,color:cs(pending).color,bg:cs(pending).backgroundImage,radius:cs(pending).borderRadius}:null,
      win:win?{text:win.textContent.trim(),cls:win.className,color:cs(win).color,bg:cs(win).backgroundImage}:null,
      loss:loss?{text:loss.textContent.trim(),cls:loss.className,color:cs(loss).color,bg:cs(loss).backgroundImage}:null,
      push:push?{text:push.textContent.trim(),cls:push.className,color:cs(push).color,bg:cs(push).backgroundImage}:null
    };
  });
  report.runtime=r;save();
  assert(r.ok,'RESULT_BADGES_MISSING');
  assert.equal(r.first.radius,'999px','PILL_RADIUS_MISSING');
  assert(r.first.font.includes('IBM Plex Sans'),'RESULT_FONT_NOT_ACTIVE');
  assert.equal(r.first.size,'9px','RESULT_FONT_SIZE_MISSING');
  assert.equal(r.first.weight,'900','RESULT_FONT_WEIGHT_MISSING');
  assert.equal(r.first.minWidth,'58px','RESULT_MIN_WIDTH_MISSING');
  assert.equal(r.tableSpacing,'2px','TABLE_LAYOUT_CHANGED');
  if(r.pending) assert.equal(r.pending.color,'rgb(242, 202, 114)','PENDING_COLOR_MISSING');
  if(r.win) assert.equal(r.win.color,'rgb(135, 231, 179)','WIN_COLOR_MISSING');
  if(r.loss) assert.equal(r.loss.color,'rgb(255, 156, 167)','LOSS_COLOR_MISSING');
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
 assert.equal(base,'ff1a81eb-7435-4743-9395-a20c58ce8667','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
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
  console.log('BALL46_STATISTICS_RESULT_BADGE_PREMIUM_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
