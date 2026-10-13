import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='dashboard-v2-stage3.js',CSS='dashboard-v2.css',INDEX='index.html';
const JSMARK='B46_FEATURED_FACTS_FULL_CARD_WORDS_V1_20261013';
const CSSMARK='B46_FEATURED_FACTS_PREMIUM_TYPE_V1_20261013';
const JSCACHE='343-dashboard-v2-featured-facts-full-words-20261013';
const CSSCACHE='343-featured-facts-premium-type-20261013';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Featured Signal facts presentation only: premium typography and full Yellow/Red card words. No API, data, signal, settlement, engine or layout changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

const OLD="function cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{},hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return`${hy??0}Y/${hr??0}R · ${ay??0}Y/${ar??0}R`}";
const NEW="/* "+JSMARK+" */\nfunction cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{},hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return`${hy??0} Yellow / ${hr??0} Red · ${ay??0} Yellow / ${ar??0} Red`}";
const CSSADD=`
/* B46_FEATURED_FACTS_PREMIUM_TYPE_V1_20261013 */
body .featured-card .feature-facts,
body .featured-card .feature-facts span,
body .featured-card .feature-facts b{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-variant-numeric:tabular-nums!important;
}
body .featured-card .feature-facts span{
  font-size:7.5px!important;
  font-weight:750!important;
  letter-spacing:.065em!important;
  line-height:1.2!important;
}
body .featured-card .feature-facts b{
  font-size:10px!important;
  font-weight:700!important;
  letter-spacing:-.005em!important;
  line-height:1.35!important;
  white-space:normal!important;
}
`;

function patchIndex(s){
 let o=s.replace(/dashboard-v2-stage3\.js\?v=[^\"'<>\s]+/g,'dashboard-v2-stage3.js?v='+JSCACHE);
 o=o.replace(/dashboard-v2\.css\?v=[^\"'<>\s]+/g,'dashboard-v2.css?v='+CSSCACHE);
 assert(o.includes('dashboard-v2-stage3.js?v='+JSCACHE),'JS_CACHE_BUST_MISSING');
 assert(o.includes('dashboard-v2.css?v='+CSSCACHE),'CSS_CACHE_BUST_MISSING');
 return o;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?factsV1='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const r=await page.evaluate(()=>{
   const host=document.querySelector('[data-featured-facts]');
   const spans=host?[...host.querySelectorAll('span')]:[];const vals=host?[...host.querySelectorAll('b')]:[];
   const cardVal=vals[2];const cs=cardVal?getComputedStyle(cardVal):null;
   return{ok:!!host,labels:spans.map(x=>x.textContent.trim()),values:vals.map(x=>x.textContent.trim()),cardText:cardVal?.textContent?.trim()||'',font:cs?.fontFamily||'',weight:cs?.fontWeight||'',size:cs?.fontSize||''};
  });
  assert(r.ok,'FEATURED_FACTS_MISSING');assert.deepEqual(r.labels,['HALF-TIME','CORNERS','CARDS H · A','ODDS AGE'],'FACT_LABELS_CHANGED');
  assert(/IBM Plex Sans/i.test(r.font),'FACT_FONT_NOT_ACTIVE');
  if(r.cardText&&r.cardText!=='—'){assert(/Yellow/.test(r.cardText)&&/Red/.test(r.cardText),'FULL_CARD_WORDS_NOT_RENDERED');assert(!/\dY\//.test(r.cardText),'SHORT_CARD_WORDS_STILL_RENDERED')}
  report.runtime=r;save();
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),j0=jb.toString('utf8'),c0=cb.toString('utf8'),i0=ib.toString('utf8');
 assert.equal(j0.split(OLD).length-1,1,'CARDS_LABEL_ANCHOR_COUNT');assert(!j0.includes(JSMARK),'JS_ALREADY_PATCHED');assert(!c0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
 const j1=Buffer.from(j0.replace(OLD,NEW)),c1=Buffer.from(c0+'\n'+CSSADD+'\n'),i1=Buffer.from(patchIndex(i0));
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const j=(await publicFile('/'+JS)).toString('utf8'),c=(await publicFile('/'+CSS)).toString('utf8'),x=(await publicFile('/'+INDEX)).toString('utf8');if(j.includes(JSMARK)&&c.includes(CSSMARK)&&x.includes(JSCACHE)&&x.includes(CSSCACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'FEATURED_FACTS_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_FEATURED_FACTS_FULL_WORDS_V1_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}