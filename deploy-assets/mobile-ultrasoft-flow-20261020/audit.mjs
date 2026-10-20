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
  const k=s.indexOf('function renderMobileFlow(');
  if(k>0)console.log('MOBILE_FLOW_SOURCE',s.slice(k,k+12500));
  for(const q of ['function mobileFlowPoints(', 'function mobilePathLine(', 'mobileFlowQuery', 'function pathLine(', 'function flowPoints(']){
    const p=s.indexOf(q);if(p>=0)console.log('CHART_FN',q,s.slice(p,p+1650));
  }
  const k2=s.indexOf('function renderFlow(');
  if(k2>0)console.log('RENDER_FLOW_SOURCE',s.slice(k2,k2+950));
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
  const h=await page.evaluate(()=>({mobileCards:[...document.querySelectorAll('.b46gn-card')].slice(0,2).map(e=>e.outerHTML.slice(0,600)),desktopRows:[...document.querySelectorAll('.workspace.singlepage article.match-row')].slice(0,2).map(e=>e.outerHTML.slice(0,400))}));console.log('BUTTON_HTML',width,JSON.stringify(h));
  if(buttons.length){
   await buttons[0].click();await new Promise(r=>setTimeout(r,3300));
   const output=await page.evaluate(()=>{
    const e=[...document.querySelectorAll('.expand-flow-chart, .b46gn-flow-chart, .expand-flow-mobile-chart')].filter(x=>x.getBoundingClientRect().width>0);
    const chart=e[0],svg=chart?.querySelector('svg'),p=svg?.querySelector('.expand-flow-line.home');
    const a=svg?.querySelector('.expand-flow-area'),rect=chart?.getBoundingClientRect();
    const computed=chart?getComputedStyle(chart):null;
    return {visibleFlows:e.length,chart:chart?.outerHTML.slice(0,1650),svg:svg?.outerHTML.slice(0,2800),d:p?.getAttribute('d')?.slice(0,1100),area:a?.getAttribute('d')?.slice(0,240),attrs:p?.getAttributeNames().map(x=>[x,p.getAttribute(x)]),chartWidth:rect?.width,chartHeight:rect?.height,svgViewbox:svg?.getAttribute('viewBox'),svgAspect:svg?.getAttribute('preserveAspectRatio'),svgCSS:svg?{height:getComputedStyle(svg).height,width:getComputedStyle(svg).width}:null,bg:computed?.backgroundColor};
   });
   console.log('CHART_DOM',width,JSON.stringify(output));
   console.log('EXPANDED_DOM',width,JSON.stringify(await page.evaluate(()=>({rows:[...document.querySelectorAll('.match-expanded, .expand-flow-card, .b46gn-expanded, .b46gn-flow')].filter(x=>x.getBoundingClientRect().width>0).slice(0,8).map(x=>x.outerHTML.slice(0,1800)), svgs:[...document.querySelectorAll('svg')].filter(x=>x.getBoundingClientRect().width>0).slice(0,9).map(x=>x.outerHTML.slice(0,360))}))));
  }
  await page.close();
 }
}finally{await browser.close()}
console.log('READ_ONLY_FLOW_AUDIT_DONE');
