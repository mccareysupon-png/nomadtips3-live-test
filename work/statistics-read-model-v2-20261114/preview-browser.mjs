import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadModel} from './read-model.mjs';
import {startPreview} from './preview-server.mjs';
import {registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
const require=createRequire(resolve('work/statistics-summary-shadow-20261113/.runtime/resolve.cjs')),{chromium}=require('playwright');
const D='work/statistics-read-model-v2-20261114',recorded=JSON.parse(await readFile('work/statistics-summary-shadow-20261113/reference/ui-proof/qa/verified-full-ledger.json','utf8'));
const model=createReadModel(recorded.rows,{contentRevision:42,asOf:recorded.asOf,registry,now:Date.now()});
const server=await startPreview(model),b=await chromium.launch({headless:true}),metrics=[];
try{
 for(const [name,width,height]of [['pc',1440,900],['mobile',390,844]]){
  const ctx=await b.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));const start=performance.now();
  await p.goto(server.origin+'/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>document.body.dataset.ready==='1',{timeout:25000});
  const readyMs=performance.now()-start;
  assert.equal(await p.locator('#history tr').count(),50);assert((await p.locator('#count').textContent()).includes('14,998'));
  assert((await p.locator('#state').textContent()).includes('revision 42'));
  await p.locator('[data-market="ou"]').click();await p.waitForFunction(expected=>document.body.dataset.ready==='1'&&document.querySelector('#count').textContent.includes(expected),model.summary.marketCounts.ou.toLocaleString('en-US'));
  assert((await p.locator('#count').textContent()).includes(String(model.summary.marketCounts.ou.toLocaleString('en-US'))));
  await p.locator('#next').click();await p.waitForFunction(()=>document.body.dataset.ready==='1'&&document.querySelector('#pagerStatus').textContent.startsWith('Page 2'));
  assert.equal(await p.locator('#history tr').count(),50);
  await p.locator('[data-range="30"]').click();await p.waitForFunction(()=>document.body.dataset.ready==='1');assert((await p.locator('#chart path').getAttribute('d')).startsWith('M'));
  assert.deepEqual(errors,[]);
  await p.screenshot({path:D+'/qa/preview-'+name+'.png',fullPage:true});
  metrics.push({name,width,readyMs,firstPageRows:50,globalRecords:model.summary.ledgerTotal,network:server.requests.filter(x=>x.startsWith('/api/'))});
  await ctx.close();
 }
 assert(!server.requests.some(x=>x.includes('/api/engine/')));
 await mkdir(D+'/qa',{recursive:true});await writeFile(D+'/qa/preview-browser.json',JSON.stringify({ok:true,metrics},null,2));
 console.log('FAST_PREVIEW_BROWSER '+JSON.stringify({ok:true,metrics}));
}finally{await b.close();await server.close();}
