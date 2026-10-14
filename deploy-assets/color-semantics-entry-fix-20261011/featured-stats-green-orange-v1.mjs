import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const TARGET='color-semantics-343.css', INDEX='index.html';
const MARK='B46_FEATURED_STATS_GREEN_ORANGE_V1_20261014';
const CACHE='343-featured-stats-green-orange-v1-20261014';
const CSS=`
/* B46_FEATURED_STATS_GREEN_ORANGE_V1_20261014 */
body .workspace.singlepage .featured-card .feature-stats .stat-row>b:first-child{
  color:#137a50!important;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-weight:800!important;
}
body .workspace.singlepage .featured-card .feature-stats .stat-row>b:last-child{
  color:#ff9f43!important;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-weight:800!important;
}
body .workspace.singlepage .featured-card .feature-stats .stat-row>span{
  color:var(--muted)!important;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-weight:700!important;
  letter-spacing:.025em!important;
}
body .workspace.singlepage .featured-card .feature-stats .stat-track.home i{background:#31b878!important}
body .workspace.singlepage .featured-card .feature-stats .stat-track.away i{background:#ff9f43!important}
`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Featured Signal typography only; orange away-team name. No layout/data/engine changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
 await page.goto('https://ball46.com/?featuredType='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4000);
 const r=await page.evaluate(()=>{const rows=[...document.querySelectorAll('.feature-stats .stat-row')];const first=rows[0],hb=first?.querySelector('b:first-child'),ab=first?.querySelector('b:last-child'),ht=first?.querySelector('.stat-track.home i'),at=first?.querySelector('.stat-track.away i'),label=first?.querySelector('span');const cs=x=>x?getComputedStyle(x):null;return{ok:!!(hb&&ab&&ht&&at&&label),homeColor:cs(hb)?.color||'',awayColor:cs(ab)?.color||'',homeBar:cs(ht)?.backgroundColor||'',awayBar:cs(at)?.backgroundColor||'',labelColor:cs(label)?.color||'',font:cs(label)?.fontFamily||''}});
 report.runtime=r;save();assert(r.ok,'FEATURED_STATS_MISSING');assert(/IBM Plex Sans/i.test(r.font),'FONT_NOT_ACTIVE');assert(/19, 122, 80|19 122 80/i.test(r.homeColor),'HOME_NOT_GREEN');assert(/255, 159, 67|255 159 67/i.test(r.awayColor),'AWAY_NOT_ORANGE');assert(/49, 184, 120|49 184 120/i.test(r.homeBar),'HOME_BAR_NOT_GREEN');assert(/255, 159, 67|255 159 67/i.test(r.awayBar),'AWAY_BAR_NOT_ORANGE');
 }finally{await browser.close()}
}
let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}
try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const tb=await publicFile('/'+TARGET),ib=await publicFile('/'+INDEX),t0=tb.toString('utf8'),i0=ib.toString('utf8');
 assert(t0.length>500,'COLOR_SEMANTICS_BASE_MISSING');assert(!t0.includes(MARK),'ALREADY_DEPLOYED_STOP');
 const t1=Buffer.from(t0+'\n'+CSS+'\n');const i1=Buffer.from(i0.replace(/color-semantics-343\.css\?v=[^\"\'<>\s]+/g,'color-semantics-343.css?v='+CACHE));assert(i1.toString('utf8').includes('color-semantics-343.css?v='+CACHE),'CACHE_BUST_MISSING');
 writeFileSync('audit/css-before.css',tb);writeFileSync('audit/css-after.css',t1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],sha(tb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',TARGET),t1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
 let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=(await publicFile('/'+TARGET)).toString('utf8'),x=(await publicFile('/'+INDEX)).toString('utf8');if(b.includes(MARK)&&x.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
 for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);await runtimeCheck();
 const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
 report.finalVersion=candidate;report.result='SUCCESS';save();console.log('BALL46_FEATURED_STATS_GREEN_ORANGE_V1_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET,INDEX],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}