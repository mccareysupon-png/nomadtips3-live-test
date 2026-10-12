import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='singlepage-workspace-343.js',INDEX='index.html';
const MARK='/* B46_SETTLED_DAYS_KPI_V1_20261012 */';
const CACHE='settled-days-kpi-v1-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics presentation only. Add SETTLED DAYS KPI to existing .sp-kpi summary row. Calculate inclusive Bangkok calendar span from first to latest settled result using existing loaded SETTLED rows. No Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}

const add = `
;(()=>{
'use strict';
/* B46_SETTLED_DAYS_KPI_V1_20261012 */
const DAY=86400000;
const dateMs=v=>{if(v===null||v===undefined||v==='')return 0;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;const p=Date.parse(String(v));return Number.isFinite(p)?p:0};
const dayNoBangkok=ms=>{
 if(!ms)return null;
 try{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
  const o={};for(const p of parts)if(p.type!=='literal')o[p.type]=Number(p.value);
  if(!o.year||!o.month||!o.day)return null;
  return Math.floor(Date.UTC(o.year,o.month-1,o.day)/DAY);
 }catch{return Math.floor(ms/DAY)}
};
const settledDays=rows=>{
 const days=(Array.isArray(rows)?rows:[]).map(r=>dayNoBangkok(dateMs(r?.settledAt??r?.createdAt))).filter(Number.isFinite);
 if(!days.length)return null;
 return Math.max(1,Math.max(...days)-Math.min(...days)+1);
};
function ensureCard(){
 const odds=document.querySelector('.sp-kpi [data-sp-kpi="odds"]')?.closest('.sp-kpi');
 if(!odds||!odds.parentElement)return null;
 let card=odds.parentElement.querySelector('[data-b46-settled-days-kpi]');
 if(!card){
  card=document.createElement('article');
  card.className='sp-kpi';
  card.setAttribute('data-b46-settled-days-kpi','1');
  card.innerHTML='<span>SETTLED DAYS</span><strong data-sp-kpi="settled-days">—</strong><small>First → latest settlement</small>';
  odds.insertAdjacentElement('afterend',card);
 }
 return card;
}
function paint(data){
 const card=ensureCard();if(!card)return;
 const value=settledDays(data?.rows);
 const strong=card.querySelector('[data-sp-kpi="settled-days"]');
 if(strong)strong.textContent=value===null?'—':String(value);
 card.dataset.b46SettledDays=String(value??'');
}
document.addEventListener('ball46:statistics-snapshot',e=>paint(e.detail));
const boot=()=>{ensureCard();const api=window.BALL46_STATISTICS_DATA;if(api?.load)api.load().then(paint).catch(()=>{})};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
`;

function patchIndex(src){
 const out=src.replace(/singlepage-workspace-343\.js\?v=[^"'<>\s]+/g,'singlepage-workspace-343.js?v='+CACHE);
 assert(out.includes('singlepage-workspace-343.js?v='+CACHE),'JS_CACHE_BUST_MISSING');
 return out;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1100});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&settledDaysV1='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const out=await page.evaluate(async()=>{
   const api=window.BALL46_STATISTICS_DATA;const data=api?.load?await api.load():null;
   const rows=Array.isArray(data?.rows)?data.rows:[];
   const DAY=86400000,dateMs=v=>{const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:0};
   const dn=ms=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));const o={};for(const p of parts)if(p.type!=='literal')o[p.type]=Number(p.value);return Math.floor(Date.UTC(o.year,o.month-1,o.day)/DAY)};
   const ds=rows.map(r=>dateMs(r?.settledAt??r?.createdAt)).filter(Boolean).map(dn);
   const expected=ds.length?Math.max(1,Math.max(...ds)-Math.min(...ds)+1):null;
   const card=document.querySelector('[data-b46-settled-days-kpi]'),value=card?.querySelector('[data-sp-kpi="settled-days"]')?.textContent?.trim();
   const labels=[...document.querySelectorAll('.sp-kpi>span')].map(x=>x.textContent.trim());
   return{expected,value,exists:!!card,labels,settled:Number(document.querySelector('[data-sp-kpi="total"]')?.textContent||0),small:card?.querySelector('small')?.textContent?.trim()};
  });
  assert(out.exists,'SETTLED_DAYS_CARD_MISSING');assert.equal(out.value,String(out.expected),'SETTLED_DAYS_VALUE_MISMATCH');assert.equal(out.small,'First → latest settlement','SETTLED_DAYS_NOTE_MISMATCH');
  for(const label of ['SETTLED','UNSETTLED','WIN','LOSS','PUSH','WIN RATE','AVG ODDS','SETTLED DAYS'])assert(out.labels.includes(label),'KPI_LABEL_MISSING:'+label);
  assert(out.settled>0,'SETTLED_TOTAL_MISSING');
  report.runtime=out;save();
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;const a=await readRetry('rollback-active',()=>activeVersion());if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await readRetry('rollback-confirm',()=>activeVersion()),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}
try{
 current=await readRetry('inspect',()=>inspect());const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await readRetry('settings-before',()=>api('/scripts/'+script+'/settings')),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await readRetry('schedules-before',()=>schedules());
 const jb=await publicFile('/'+JS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes('window.BALL46_STATISTICS_DATA'),'STATISTICS_DATA_MODULE_MISSING');assert(!js0.includes(MARK),'KPI_ALREADY_PATCHED');
 const j1=Buffer.from(js0+'\n'+add+'\n'),i1=Buffer.from(patchIndex(idx0));new Function(j1.toString('utf8'));
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
 wrangler(staged);
 for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
 let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(MARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'KPI_PATCH_NOT_LIVE');
 for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
 await runtimeCheck();
 const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
 assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
 report.finalVersion=candidate;report.changed=[JS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
 console.log('BALL46_SETTLED_DAYS_KPI_V1_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
}catch(e){
 report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}report.result='FAIL_STOPPED';save();console.error(e.stack);process.exitCode=1;
}
