import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PersistedReadStore} from './persisted-read-store.mjs';
import {TestDurableStorage} from './test-storage.mjs';
import {startPersistedPreview} from './persisted-preview-server.mjs';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
const require=createRequire(resolve('work/statistics-summary-shadow-20261113/.runtime/resolve.cjs')),{chromium}=require('playwright');
const D='work/statistics-read-model-v2-20261114';
const input=JSON.parse(await readFile('work/statistics-summary-shadow-20261113/reference/ui-proof/qa/verified-full-ledger.json','utf8'));
const storage=new TestDurableStorage(),writer=new PersistedReadStore(storage);
const publication=await writer.publish(input.rows,{contentRevision:101,asOf:input.asOf,registry,formulas});
const store=new PersistedReadStore(storage);assert.equal((await store.summary()).ledgerTotal,input.rows.length);
const server=await startPersistedPreview(store),browserInstance=await chromium.launch({headless:true}),profiles=[],errors=[];
try{
 for(const [name,width,height,theme]of[['pc-dark',1440,900,'dark'],['pc-light',1440,900,'light'],['mobile-dark',390,844,'dark'],['mobile-light',390,844,'light']]){
  const ctx=await browserInstance.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390,colorScheme:theme});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push({profile:name,message:e.message}));
  const started=performance.now();await page.goto(server.origin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.ready==='1',{timeout:20000});
  const readyMs=performance.now()-started;
  assert.equal(await page.locator('#history tr').count(),50);
  const counter=await page.locator('#count').textContent();assert(counter.includes(input.rows.length.toLocaleString('en-US')));
  assert((await page.locator('#state').textContent()).includes('revision 101'));
  await page.locator('[data-market="ou"]').click();
  await page.waitForFunction(expected=>document.body.dataset.ready==='1'&&document.querySelector('#count').textContent.includes(expected),publication.summary.marketCounts.ou.toLocaleString('en-US'));
  assert.equal(await page.locator('#history tr').count(),50);
  await page.locator('#next').click();
  await page.waitForFunction(()=>document.body.dataset.ready==='1'&&document.querySelector('#pagerStatus').textContent.startsWith('Page 2'));
  const pageTwoIds=await page.locator('#history tr').count();assert.equal(pageTwoIds,50);
  await page.locator('[data-range="30"]').click();await page.waitForFunction(()=>document.body.dataset.ready==='1');
  assert((await page.locator('#chart path').getAttribute('d')).startsWith('M'));
  await page.locator('[data-range="90"]').click();await page.waitForFunction(()=>document.body.dataset.ready==='1');
  await page.locator('[data-market="all"]').click();await page.waitForFunction(()=>document.body.dataset.ready==='1');
  assert((await page.locator('#count').textContent()).includes(input.rows.length.toLocaleString('en-US')));
  await page.screenshot({path:D+'/qa/stage-'+name+'.png'});
  profiles.push({profile:name,width,height,readyMs,firstPage:50,globalRows:input.rows.length});
  await ctx.close();
 }
 assert.deepEqual(errors,[]);assert(server.requests.every(r=>r.path==='/'||r.path==='/api/statistics/fast-summary'||r.path==='/api/statistics/fast-view'));
 const report={ok:true,kind:'LOCAL_PERSISTED_STAGING',profiles,persistedSourceRows:publication.sourceRows,persistedPages:publication.pages,stagedRevision:publication.contentRevision,apiRequests:server.requests.length,engineApiCalls:0,productionWrites:0,providerRequests:0,limitations:['Local Playwright and simulated durable storage, not public field latency','Projection UI isolated from active BALL46 page','No Production engine or website writes']};
 await writeFile(D+'/qa/stage-browser.json',JSON.stringify(report,null,2));
 console.log('PERSISTED_STATISTICS_BROWSER '+JSON.stringify(report));
}finally{await browserInstance.close();await server.close();}
