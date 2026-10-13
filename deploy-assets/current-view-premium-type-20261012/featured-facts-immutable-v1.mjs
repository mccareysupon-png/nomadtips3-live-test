import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin,origin} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const SOURCE_JS='dashboard-v2-stage3.js',INDEX='index.html';
const NEW_JS='dashboard-v2-stage3-featured-facts-20261013a.js';
const NEW_CSS='featured-facts-premium-20261013a.css';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Featured Signal facts presentation only. Add immutable versioned JS/CSS assets and switch index refs. Existing 79-asset rail otherwise unchanged; no engine/API/data/settlement/signal logic changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

const OLD="function cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{},hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return`${hy??0}Y/${hr??0}R · ${ay??0}Y/${ar??0}R`}";
const NEW="function cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{},hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return`${hy??0} Yellow / ${hr??0} Red · ${ay??0} Yellow / ${ar??0} Red`}";
const CSS=`/* B46_FEATURED_FACTS_PREMIUM_IMMUTABLE_V1_20261013 */
body .featured-card .feature-facts,
body .featured-card .feature-facts span,
body .featured-card .feature-facts b{font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;font-variant-numeric:tabular-nums!important}
body .featured-card .feature-facts span{font-size:7.5px!important;font-weight:750!important;letter-spacing:.065em!important;line-height:1.2!important}
body .featured-card .feature-facts b{font-size:10px!important;font-weight:700!important;letter-spacing:-.005em!important;line-height:1.35!important;white-space:normal!important}
`;

function patchIndex(src){
 const jsRe=/dashboard-v2-stage3\.js\?v=[^\"'<>\s]+/g;
 assert.equal((src.match(jsRe)||[]).length,1,'DASHBOARD_STAGE3_REF_COUNT');
 let out=src.replace(jsRe,NEW_JS+'?v=1');
 assert(!out.includes(NEW_CSS),'NEW_CSS_ALREADY_REFERENCED');
 const cssTag=out.match(/<link[^>]+href=[\"'][^\"']*dashboard-v2\.css[^\"']*[\"'][^>]*>/i);
 assert(cssTag,'DASHBOARD_CSS_LINK_MISSING');
 out=out.replace(cssTag[0],cssTag[0]+'<link rel="stylesheet" href="/'+NEW_CSS+'?v=1">');
 assert(out.includes(NEW_JS+'?v=1'),'NEW_JS_REF_MISSING');assert(out.includes('/'+NEW_CSS+'?v=1'),'NEW_CSS_REF_MISSING');
 return out;
}

async function browserCheck(base,label){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);await page.setExtraHTTPHeaders({'Cache-Control':'no-cache'});
 await page.goto(base+'/?featuredFactsImmutable='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
 const r=await page.evaluate(()=>{const facts=document.querySelector('[data-featured-facts]'),vals=facts?[...facts.querySelectorAll('b')]:[],sp=facts?.querySelector('span'),bp=facts?.querySelector('b');const scripts=[...document.scripts].map(x=>x.src);const styles=[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href);return{ok:!!facts,scripts,styles,labels:facts?[...facts.querySelectorAll('span')].map(x=>x.textContent.trim()):[],values:vals.map(x=>x.textContent.trim()),cardText:vals[2]?.textContent?.trim()||'',fontSpan:sp?getComputedStyle(sp).fontFamily:'',fontValue:bp?getComputedStyle(bp).fontFamily:''}});
 assert(r.ok,label+':FEATURED_FACTS_MISSING');assert(r.scripts.some(x=>x.includes(NEW_JS)),label+':NEW_JS_NOT_LOADED');assert(r.styles.some(x=>x.includes(NEW_CSS)),label+':NEW_CSS_NOT_LOADED');assert.deepEqual(r.labels,['HALF-TIME','CORNERS','CARDS H · A','ODDS AGE'],label+':FACT_LABELS_CHANGED');assert(/IBM Plex Sans/i.test(r.fontSpan)&&/IBM Plex Sans/i.test(r.fontValue),label+':PREMIUM_FONT_NOT_ACTIVE');if(r.cardText&&r.cardText!=='—'){assert(/Yellow/.test(r.cardText)&&/Red/.test(r.cardText),label+':FULL_CARD_WORDS_NOT_RENDERED');assert(!/\dY\//.test(r.cardText),label+':SHORT_CARD_WORDS_STILL_RENDERED')}return r;
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const jb=await publicFile('/'+SOURCE_JS,undefined,directOrigin),ib=await publicFile('/'+INDEX,undefined,directOrigin),j0=jb.toString('utf8'),i0=ib.toString('utf8');
 assert.equal(j0.split(OLD).length-1,1,'CARDS_LABEL_ANCHOR_COUNT');assert(!i0.includes(NEW_JS)&&!i0.includes(NEW_CSS),'IMMUTABLE_REFS_ALREADY_LIVE');
 const j1=Buffer.from(j0.replace(OLD,NEW)),c1=Buffer.from(CSS),i1=Buffer.from(patchIndex(i0));
 writeFileSync('audit/new-js.js',j1);writeFileSync('audit/new-css.css',c1);writeFileSync('audit/index-after.html',i1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',NEW_JS),j1);writeFileSync(resolve(staged.runtime,'assets',NEW_CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const j=(await publicFile('/'+NEW_JS,undefined,directOrigin)).toString('utf8'),c=(await publicFile('/'+NEW_CSS,undefined,directOrigin)).toString('utf8'),x=(await publicFile('/'+INDEX,undefined,directOrigin)).toString('utf8');if(j.includes(' Yellow / ')&&j.includes(' Red · ')&&c.includes('B46_FEATURED_FACTS_PREMIUM_IMMUTABLE_V1_20261013')&&x.includes(NEW_JS)&&x.includes(NEW_CSS)){live=true;break}}catch{}await delay(1000)}assert(live,'IMMUTABLE_ASSETS_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,'UNRELATED_ASSET_CHANGED:'+p);
  report.directRuntime=await browserCheck(directOrigin,'DIRECT');
  let custom=null;for(let i=0;i<15;i++){try{custom=await browserCheck(origin,'CUSTOM');break}catch(e){report.customLastError=e.message;await delay(2000)}}report.customRuntime=custom;
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[INDEX];report.added=[NEW_JS,NEW_CSS];report.unchangedAssets=Object.keys(protectedAssets).length;report.result=custom?'SUCCESS':'SUCCESS_DIRECT_CUSTOM_PROPAGATING';save();
  console.log('BALL46_FEATURED_FACTS_IMMUTABLE_V1_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,added:report.added,unchangedAssets:report.unchangedAssets,direct:report.directRuntime,custom:report.customRuntime,customLastError:report.customLastError}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}