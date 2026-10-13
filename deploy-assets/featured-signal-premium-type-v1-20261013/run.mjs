import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const TARGET='dashboard-v2.css', INDEX='index.html';
const MARK='B46_FEATURED_SIGNAL_PREMIUM_TYPE_V1_20261013';
const CACHE='343-featured-premium-type-v1-20261013';
const CSS="/* B46_FEATURED_SIGNAL_PREMIUM_TYPE_V1_20261013 */\\nbody .workspace.singlepage .featured-card,\\nbody .workspace.singlepage .featured-card *{\\n  font-family:\"IBM Plex Sans\",\"IBM Plex Sans Thai\",Inter,Arial,sans-serif!important;\\n  font-variant-numeric:tabular-nums!important;\\n}\\nbody .workspace.singlepage .featured-card .card-title .kicker{font-weight:800!important;letter-spacing:.085em!important}\\nbody .workspace.singlepage .featured-card [data-featured-league]{font-weight:700!important;letter-spacing:-.01em!important}\\nbody .workspace.singlepage .featured-card .feature-status{font-weight:800!important;letter-spacing:.025em!important}\\nbody .workspace.singlepage .featured-card .feature-score>div>span,\\nbody .workspace.singlepage .featured-card .feature-facts span{font-weight:700!important;letter-spacing:.055em!important}\\nbody .workspace.singlepage .featured-card .feature-score b{font-weight:750!important;letter-spacing:-.01em!important}\\nbody .workspace.singlepage .featured-card .feature-score>strong{font-weight:800!important;letter-spacing:-.035em!important}\\nbody .workspace.singlepage .featured-card [data-featured-away]{color:#ff9f43!important}";
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Featured Signal typography only; orange away-team name. No layout/data/engine changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
 await page.goto('https://ball46.com/?featuredType='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4000);
 const r=await page.evaluate(()=>{const c=document.querySelector('.featured-card'),a=document.querySelector('[data-featured-away]'),h=document.querySelector('[data-featured-home]'),s=document.querySelector('[data-featured-score]');const cs=x=>x?getComputedStyle(x):null;return{ok:!!(c&&a&&h&&s),font:cs(c)?.fontFamily||'',awayFont:cs(a)?.fontFamily||'',awayColor:cs(a)?.color||'',homeColor:cs(h)?.color||'',scoreFont:cs(s)?.fontFamily||''}});
 report.runtime=r;save();assert(r.ok,'FEATURED_CARD_MISSING');assert(/IBM Plex Sans/i.test(r.font),'FONT_NOT_ACTIVE');assert(/255, 159, 67|255 159 67/i.test(r.awayColor),'AWAY_NOT_ORANGE');assert(/IBM Plex Sans/i.test(r.awayFont)&&/IBM Plex Sans/i.test(r.scoreFont),'CHILD_FONT_NOT_ACTIVE');
 }finally{await browser.close()}
}
let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}
try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const tb=await publicFile('/'+TARGET),ib=await publicFile('/'+INDEX),t0=tb.toString('utf8'),i0=ib.toString('utf8');
 assert(t0.includes('.featured-card')&&t0.includes('.feature-score'),'FEATURED_STYLE_BASE_MISSING');assert(!t0.includes(MARK),'ALREADY_DEPLOYED_STOP');
 const t1=Buffer.from(t0+'\n'+CSS+'\n');const i1=Buffer.from(i0.replace(/dashboard-v2\.css\?v=[^\"\'<>\s]+/g,'dashboard-v2.css?v='+CACHE));assert(i1.toString('utf8').includes('dashboard-v2.css?v='+CACHE),'CACHE_BUST_MISSING');
 writeFileSync('audit/css-before.css',tb);writeFileSync('audit/css-after.css',t1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],sha(tb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',TARGET),t1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
 let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=(await publicFile('/'+TARGET)).toString('utf8'),x=(await publicFile('/'+INDEX)).toString('utf8');if(b.includes(MARK)&&x.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
 for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);await runtimeCheck();
 const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
 report.finalVersion=candidate;report.result='SUCCESS';save();console.log('BALL46_FEATURED_SIGNAL_PREMIUM_TYPE_V1_SUCCESS '+JSON.stringify({base,candidate,changed:[TARGET,INDEX],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}