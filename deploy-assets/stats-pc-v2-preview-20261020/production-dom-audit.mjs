import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const info=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());assert(info.success);
console.log('ACTUAL_WORKER',JSON.stringify(info.result.deployments[0].versions));
const browser=await puppeteer.launch({executablePath:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync),headless:true,args:['--no-sandbox']});
try{
 for(const width of [1440,1024,390]){
  for(const initial of ['untouched','dark','light']){
   const page=await browser.newPage(),errs=[];page.on('pageerror',e=>errs.push(String(e).slice(0,250)));
   await page.setViewport({width,height:900,isMobile:width<768,deviceScaleFactor:1});await page.setCacheEnabled(false);
   const url='https://ball46.com/?view=statistics&realuserdiag='+Date.now();
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
   if(initial!=='untouched')await page.evaluate(t=>{document.documentElement.setAttribute('data-theme',t)},initial);
   await new Promise(r=>setTimeout(r,9500));
   const data=await page.evaluate(()=>{
    const root=document.querySelector('.sp-stats-content'),sp=document.querySelector('.sp-kpis'),ribbon=document.querySelector('.b46v23-strip'),perf=document.querySelector('.b46-perf-kpis');
    const snap=e=>{if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return{display:c.display,w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top)}};
    return {href:location.href,theme:document.documentElement.getAttribute('data-theme'),marker:!!document.querySelector('#b46-statistics-pc-single-row-v23-preview-20261020'),script:!!window.__b46StatisticsV23SingleRowInstalled,
      root:!!root,rootReady:root?.classList.contains('b46v23-ready'),sourceKPIs:root?.querySelectorAll('.sp-kpi').length,sourcePerf:root?.querySelectorAll('.b46-perf-kpi').length,ribbonKPIs:root?.querySelectorAll('.b46v23-micro-card').length,
      ribbon:snap(ribbon),top:snap(sp),perf:snap(perf),data:root?.textContent?.replace(/\s+/g,' ').slice(0,320)};
   });
   console.log('REAL_USER_PC_STATS',JSON.stringify({width,initial,...data,errors:errs}));
   await page.close();
  }
 }
}finally{await browser.close();}
