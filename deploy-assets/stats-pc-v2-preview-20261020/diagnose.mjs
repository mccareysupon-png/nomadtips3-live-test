import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome);
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try {
 for(const [label,url] of [['production','https://ball46.com/?view=statistics'],['preview','https://65983c98-ball46-production.mccarey-supon.workers.dev/?view=statistics']]){
  const page=await browser.newPage();await page.setViewport({width:1366,height:900,deviceScaleFactor:1});await page.setCacheEnabled(false);
  const seen=[],errors=[];
  page.on('response',r=>{const u=r.url();if(/api|stat|settle|history|performance|signals/i.test(u)&&!u.includes('fonts'))seen.push({status:r.status(),url:u.slice(0,240)});});
  page.on('requestfailed',r=>errors.push({url:r.url(),reason:r.failure()?.errorText}));
  page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:80000});
  await new Promise(r=>setTimeout(r,10000));
  const state=await page.evaluate(()=>{
   const e=document.querySelector('.sp-stat-hero');return {href:location.href,theme:document.documentElement.dataset.theme,marker:!!document.querySelector('#b46-statistics-pc-premium-v2-preview-20261020'),title:document.title,bodyText:document.body.innerText.slice(-2800),numbers:{settled:document.querySelector('[data-sp-kpi="total"]')?.textContent,results:document.querySelectorAll('.sp-table tbody tr').length,chart:document.querySelector('.b46-perf-chart-wrap')?.innerText.slice(0,150)},requests:performance.getEntriesByType('resource').filter(e=>/api|stat|settle|history|performance/i.test(e.name)).slice(-40).map(e=>({url:e.name,ms:e.duration})),apiSummary:[...document.querySelectorAll('[data-sp-kpi]')].map(x=>[x.dataset.spKpi,x.textContent])};
  });
  console.log('STATS_PREVIEW_DIAG',label,JSON.stringify({state,seen,errors}).slice(0,23000));
  await page.close();
 }
} finally { await browser.close();}
