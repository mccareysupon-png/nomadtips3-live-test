import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.css';
const MARK='/* B46_LONGTERM_PERFORMANCE_PREMIUM_TYPE_20261012 */';
const CSS=`
/* B46_LONGTERM_PERFORMANCE_PREMIUM_TYPE_20261012 */
body[data-workspace-view="statistics"] .b46-perf-title span,
body[data-workspace-view="statistics"] .b46-perf-title h3,
body[data-workspace-view="statistics"] .b46-perf-range button{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .b46-perf-title span{
  font-size:10px!important;
  font-weight:850!important;
  line-height:1.15!important;
  letter-spacing:.085em!important;
}
body[data-workspace-view="statistics"] .b46-perf-title h3{
  font-size:18px!important;
  font-weight:900!important;
  line-height:1.12!important;
  letter-spacing:-.012em!important;
}
body[data-workspace-view="statistics"] .b46-perf-range button{
  font-size:10px!important;
  font-weight:850!important;
  line-height:1!important;
  letter-spacing:.035em!important;
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term performance title/range typography only. No color/card/chart/layout/data changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&perfTypeVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(4000);
  const r=await page.evaluate(()=>{
    const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)], cs=e=>e?getComputedStyle(e):null;
    const kicker=q('.b46-perf-title span'), h3=q('.b46-perf-title h3'), buttons=qa('.b46-perf-range button');
    return {
      ok:Boolean(kicker&&h3&&buttons.length===4),
      kicker:{text:kicker?.textContent.trim(),font:cs(kicker)?.fontFamily,size:cs(kicker)?.fontSize,weight:cs(kicker)?.fontWeight,letter:cs(kicker)?.letterSpacing},
      h3:{text:h3?.textContent.trim(),size:cs(h3)?.fontSize,weight:cs(h3)?.fontWeight},
      buttons:buttons.map(b=>({text:b.textContent.trim(),size:cs(b)?.fontSize,weight:cs(b)?.fontWeight,height:cs(b)?.height,padding:cs(b)?.padding,borderRadius:cs(b)?.borderRadius})),
      chartPresent:Boolean(q('.b46-perf-shell')),
      spacing:cs(q('.sp-results .sp-table'))?.borderSpacing
    };
  });
  report.runtime=r;save();
  assert(r.ok,'PERFORMANCE_HEADER_MISSING');
  assert(r.kicker.font.includes('IBM Plex Sans'),'FONT_NOT_ACTIVE');
  assert.equal(r.kicker.size,'10px','KICKER_SIZE_MISSING');
  assert.equal(r.kicker.weight,'850','KICKER_WEIGHT_MISSING');
  assert.equal(r.h3.size,'18px','TITLE_SIZE_MISSING');
  assert.equal(r.h3.weight,'900','TITLE_WEIGHT_MISSING');
  assert(r.buttons.every(b=>b.size==='10px'&&b.weight==='850'),'RANGE_BUTTON_TYPE_MISSING');
  assert(r.chartPresent,'PERFORMANCE_CARD_MISSING');
  assert.equal(r.spacing,'2px','TABLE_LAYOUT_CHANGED');
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
 assert.equal(base,'b99d38a7-c530-44f0-8542-8150b34812fd','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
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
  console.log('BALL46_LONGTERM_PERFORMANCE_PREMIUM_TYPE_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
