import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const API='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN; assert(token&&process.env.CLOUDFLARE_ACCOUNT_ID);
const request=await fetch(API+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token}}),j=await request.json();
assert(j.success&&j.result?.deployments?.[0]?.versions?.length===1);
console.log('ACTUAL_PRODUCTION_VERSION',j.result.deployments[0].versions[0].version_id);
for(const path of ['/expanded-match-343.js','/index.html','/app.css','/dashboard-v2-tune.css']){
 const r=await fetch('https://ball46.com'+path+'?mobile_flow_source='+Date.now(),{signal:AbortSignal.timeout(40000)});
 const s=await r.text();
 console.log('PUBLIC_SCRIPT',path,'status',r.status,'chars',s.length,'markers',Object.fromEntries(['function flowPoints','function pathLine','function renderFlow','expand-flow-chart','expand-flow-line','preserveAspectRatio','viewBox','@media'].map(a=>[a,s.includes(a)])));
 if(path.endsWith('.js')){
  const k=s.indexOf('function renderFlow(');
  if(k>0)console.log('RENDER_FLOW_SOURCE',s.slice(k,k+3300));
 }
}
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(executablePath,'CHROME_UNAVAILABLE');
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage();await page.setViewport({width,height:900,isMobile:width<500,deviceScaleFactor:1});
  await page.setCacheEnabled(false);await page.goto('https://ball46.com/?eventflow_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});
  await new Promise(r=>setTimeout(r,7500));
  const buttons=width<500?await page.$$('.b46gn-card'):await page.$$('.workspace.singlepage article.match-row:not(.active)');
  console.log('VISIBLE_MATCH_COUNT',width,buttons.length);
  if(buttons.length){
   await buttons[0].click();await new Promise(r=>setTimeout(r,3300));
   const output=await page.evaluate(()=>{
    const e=[...document.querySelectorAll('.expand-flow-chart')].filter(x=>x.getBoundingClientRect().width>0);
    const chart=e[0],svg=chart?.querySelector('svg'),p=svg?.querySelector('.expand-flow-line.home');
    const a=svg?.querySelector('.expand-flow-area'),rect=chart?.getBoundingClientRect();
    const computed=chart?getComputedStyle(chart):null;
    return {visibleFlows:e.length,chart:chart?.outerHTML.slice(0,1650),svg:svg?.outerHTML.slice(0,2800),d:p?.getAttribute('d')?.slice(0,1100),area:a?.getAttribute('d')?.slice(0,240),attrs:p?.getAttributeNames().map(x=>[x,p.getAttribute(x)]),chartWidth:rect?.width,chartHeight:rect?.height,svgViewbox:svg?.getAttribute('viewBox'),svgAspect:svg?.getAttribute('preserveAspectRatio'),svgCSS:svg?{height:getComputedStyle(svg).height,width:getComputedStyle(svg).width}:null,bg:computed?.backgroundColor};
   });
   console.log('CHART_DOM',width,JSON.stringify(output));
  }
  await page.close();
 }
}finally{await browser.close()}
console.log('READ_ONLY_FLOW_AUDIT_DONE');
