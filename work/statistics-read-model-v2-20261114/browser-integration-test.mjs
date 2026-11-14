// Controlled headless QA: same fresh captured inputs and Active assets in both modes.
// This runs only against local test HTTP servers. No votes, provider APIs or deployment.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {startPreview} from './integrated-preview-server.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{chromium}=require('playwright');
const baseline=await startPreview({port:0,mode:'baseline'}),candidate=await startPreview({port:0,mode:'candidate'}),browser=await chromium.launch({headless:true});
const results=[],images=new URL('./qa/',import.meta.url);await mkdir(images,{recursive:true});
try{
 for(const [mode,server]of [['baseline',baseline],['candidate',candidate]])for(const profile of [{name:'pc',width:1280,height:900},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},timezoneId:'Asia/Bangkok',locale:'en-GB'}),page=await context.newPage(),network=[],errors=[];
  page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/api/'))network.push({path:p,status:r.status()})});page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==server.origin||req.method()!=='GET')return route.abort();return route.continue()});
  await page.goto(server.origin+'/?view=statistics',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-b46-statistics-render-ready')==='1',{},{timeout:60000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-sp-table-body] tr').length===50);
  await page.waitForFunction(()=>{const e=document.querySelector('#b46-data-orbit-loading');return !e||getComputedStyle(e).display==='none'},null,{timeout:30000});
  if(profile.name==='mobile')await page.waitForFunction(()=>document.querySelectorAll('.b46m-hcard').length>0);
  const state=await page.evaluate(()=>({width:innerWidth,readyMs:Math.round(performance.now()),settled:Number(document.querySelector('[data-sp-kpi="total"]').textContent),days:document.querySelector('[data-sp-kpi="settled-days"]').textContent,rows:document.querySelectorAll('[data-sp-table-body] tr').length,chart:document.querySelector('.b46-perf-svg')?.getAttribute('aria-label'),loader:getComputedStyle(document.querySelector('.b46-stats-loader')).display}));
  assert.equal(state.width,profile.width);assert.equal(state.settled,server.input.first.total);assert.notEqual(state.days,'—');assert.equal(state.loader,'none');
  if(profile.name==='pc'){
   await page.getByRole('button',{name:'7D',exact:true}).click();await page.locator('[data-b46-range="d7"].active').waitFor();
   await page.getByRole('button',{name:'ROI',exact:true}).click();await page.locator('svg[aria-label="ROI % chart"]').waitFor();
  }
  for(const theme of ['light','dark']){
   // Test both theme attributes on the isolated origin; do not change user preferences.
   await page.evaluate(t=>{document.documentElement.setAttribute('data-theme',t)},theme);
   await page.screenshot({path:fileURLToPath(new URL('browser-'+mode+'-'+profile.name+'-'+theme+'.png',images)),fullPage:true});
  }
  if(mode==='candidate'){
   await page.goto(server.origin+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>/^\d+$/.test(document.querySelector('[data-b46-stat="today-win"]')?.textContent||''),{},{timeout:30000});
   const {formulas}=await import('./qa/current-formulas.mjs'),expected=formulas.aggregate(server.input.rows);
   assert.equal(await page.locator('[data-b46-stat="today-win"]').first().textContent(),String(expected.today.win));
   assert.equal(await page.locator('[data-b46-stat="yesterday-win"]').first().textContent(),String(expected.yesterday.win));
   assert.equal(network.filter(r=>r.path==='/api/engine/statistics').length,0,'LEGACY_HISTORY_DOWNLOAD_FROM_VIEWER');
  }
  assert.equal(errors.length,0,errors.join('\n'));results.push({mode,profile:profile.name,...state,statisticsRequests:network.filter(r=>r.path.includes('statistics')),pageErrors:errors});await context.close();
 }
 const report={ok:true,sourceRows:baseline.input.rows.length,controlledSnapshotTest:true,productionBenchmark:false,results,productionWrites:0};
 await writeFile(new URL('browser-integration-result.json',images),JSON.stringify(report,null,2));console.log('BROWSER_INTEGRATION',JSON.stringify(report));
}finally{await browser.close();await Promise.all([baseline.close(),candidate.close()])}
