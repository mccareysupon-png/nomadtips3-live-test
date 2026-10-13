import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const TARGET='color-semantics-343.css',INDEX='index.html';
const OLD='[data-featured-away]{color:var(--b46-away)!important}';
const MARK='B46_FEATURED_AWAY_OWNER_CLEAN_V3_20261013';
const CACHE='343-featured-away-owner-clean-v3-20261013';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Remove the legacy Featured away-team semantic color owner, then apply premium Featured Signal typography and orange away-team text. No data/layout/engine/settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

const CSS=`
/* ${MARK} */
body .workspace.singlepage .featured-card,
body .workspace.singlepage .featured-card *{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-variant-numeric:tabular-nums!important;
}
body .workspace.singlepage .featured-card .card-title .kicker{font-weight:800!important;letter-spacing:.085em!important}
body .workspace.singlepage .featured-card [data-featured-league]{font-weight:700!important;letter-spacing:-.01em!important}
body .workspace.singlepage .featured-card .feature-status{font-weight:800!important;letter-spacing:.025em!important}
body .workspace.singlepage .featured-card .feature-score>div>span,
body .workspace.singlepage .featured-card .feature-facts span{font-weight:700!important;letter-spacing:.055em!important}
body .workspace.singlepage .featured-card .feature-score b{font-weight:750!important;letter-spacing:-.01em!important}
body .workspace.singlepage .featured-card .feature-score>strong{font-weight:800!important;letter-spacing:-.035em!important}
body .workspace.singlepage .featured-card [data-featured-away]{color:#ff9f43!important}
`;

function patchCss(src){
  assert.equal(src.split(OLD).length-1,1,'LEGACY_AWAY_OWNER_COUNT_CHANGED');
  const stripped=src.replace(OLD,'');
  assert(!stripped.includes(OLD),'LEGACY_AWAY_OWNER_STILL_PRESENT');
  assert(!stripped.includes(MARK),'PATCH_ALREADY_PRESENT');
  return stripped+'\n'+CSS+'\n';
}
function patchIndex(src){
  const out=src.replace(/color-semantics-343\.css\?v=[^"'<>\s]+/g,'color-semantics-343.css?v='+CACHE);
  assert(out.includes('color-semantics-343.css?v='+CACHE),'CACHE_BUST_MISSING');
  return out;
}
async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?featuredAwayV3='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const r=await page.evaluate(()=>{
    const q=s=>document.querySelector(s),cs=e=>e?getComputedStyle(e):null;
    const card=q('.featured-card'),away=q('[data-featured-away]'),home=q('[data-featured-home]'),score=q('[data-featured-score]');
    return{ok:!!(card&&away&&home&&score),font:cs(card)?.fontFamily||'',awayColor:cs(away)?.color||'',awayFont:cs(away)?.fontFamily||'',homeColor:cs(home)?.color||'',scoreFont:cs(score)?.fontFamily||'',awayText:away?.textContent?.trim()||''};
  });
  report.runtime=r;save();
  assert(r.ok,'FEATURED_CARD_MISSING');
  assert(/IBM Plex Sans/i.test(r.font)&&/IBM Plex Sans/i.test(r.awayFont)&&/IBM Plex Sans/i.test(r.scoreFont),'PREMIUM_FONT_NOT_ACTIVE');
  assert(/255, 159, 67|255 159 67/i.test(r.awayColor),'AWAY_NOT_ORANGE');
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
 assert.equal(base,'caf91337-8d13-4b44-8ee2-4146ee7149e3','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const tb=await publicFile('/'+TARGET),ib=await publicFile('/'+INDEX),t0=tb.toString('utf8'),i0=ib.toString('utf8');
 const t1=Buffer.from(patchCss(t0)),i1=Buffer.from(patchIndex(i0));
 writeFileSync('audit/css-before.css',tb);writeFileSync('audit/css-after.css',t1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[TARGET],sha(tb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',TARGET),t1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const c=(await publicFile('/'+TARGET)).toString('utf8'),x=(await publicFile('/'+INDEX)).toString('utf8');if(!c.includes(OLD)&&c.includes(MARK)&&x.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'OWNER_CLEAN_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[TARGET,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_FEATURED_AWAY_OWNER_CLEAN_V3_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
