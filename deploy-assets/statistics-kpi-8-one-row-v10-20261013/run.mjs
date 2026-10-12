import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const CSS='singlepage-workspace-343.css',INDEX='index.html',JS='longterm-performance-343.js';
const JSMARK='B46_DAILY_DATE_AXIS_V9_20261012';
const BASECSS='B46_STAT_UNSETTLED_KPI_GRID_20261011';
const CSSMARK='B46_STAT_KPI_8_IN_ONE_ROW_V10_20261013';
const CACHE='stat-kpi-8-one-row-v10-20261013';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics KPI layout only. Keep the 8 existing KPI cards in one desktop row. No KPI values, Statistics logic, chart renderer, Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}

const cssAdd = `
/* B46_STAT_KPI_8_IN_ONE_ROW_V10_20261013 */
@media(min-width:1181px){
  body[data-workspace-view="statistics"] .workspace.singlepage .sp-kpis{
    grid-template-columns:repeat(8,minmax(0,1fr))!important;
  }
  body[data-workspace-view="statistics"] .workspace.singlepage .sp-kpis>.sp-kpi{
    min-width:0!important;
  }
  body[data-workspace-view="statistics"] .workspace.singlepage .sp-kpis>.sp-kpi:nth-child(8){
    border-right:0!important;
  }
}
`;

function patchIndex(src){
  const out=src.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);
  assert(out.includes('singlepage-workspace-343.css?v='+CACHE),'CSS_CACHE_BUST_MISSING');
  return out;
}

async function runtimeCheck(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
  const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
    await page.goto('https://ball46.com/?view=statistics&kpi8V10='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4200);
    const out=await page.evaluate(()=>{
      const grid=document.querySelector('.sp-kpis');
      const cards=[...document.querySelectorAll('.sp-kpis>.sp-kpi')];
      const labels=cards.map(c=>c.querySelector('span')?.textContent?.trim()||'');
      const rects=cards.map(c=>{const r=c.getBoundingClientRect();return{top:Math.round(r.top),left:Math.round(r.left),width:Math.round(r.width)}});
      const style=grid?getComputedStyle(grid):null;
      return{count:cards.length,labels,columns:style?.gridTemplateColumns||'',rects};
    });
    const expected=['SETTLED','UNSETTLED','WIN','LOSS','PUSH','WIN RATE','AVG ODDS','SETTLED DAYS'];
    assert.equal(out.count,8,'KPI_COUNT_NOT_8');assert.deepEqual(out.labels,expected,'KPI_ORDER_CHANGED');
    assert(out.rects.every(r=>r.top===out.rects[0].top),'KPI_NOT_ONE_ROW');
    assert.equal(out.columns.trim().split(/\s+/).length,8,'GRID_NOT_8_COLUMNS');
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
  const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
  assert(js0.includes(JSMARK),'CURRENT_UNIT_SELECTOR_V5_MISSING');assert(css0.includes(BASECSS),'CURRENT_GRAPH_STYLE_BASE_MISSING');assert(!css0.includes(CSSMARK),'STYLE_ALREADY_PATCHED');
  const c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));
  writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
  const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
  assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[CSS];delete protectedAssets[INDEX];
  writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
  wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
  wrangler(staged);
  for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const c=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(c.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'STYLE_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_STAT_KPI_8_IN_ONE_ROW_V10_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
}catch(e){
  report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}report.result='FAIL_STOPPED';save();console.error(e.stack);process.exitCode=1;
}
