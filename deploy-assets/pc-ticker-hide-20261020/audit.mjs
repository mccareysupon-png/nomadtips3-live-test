import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_READ_CREDENTIALS_MISSING');
const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)});
const data=await res.json();assert(data.success,'CF_VERSION_LOOKUP_FAILED');
console.log('ACTIVE_PRODUCTION_VERSION',JSON.stringify(data.result.deployments[0].versions));
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
assert(chrome,'CHROME_MISSING');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
 for(const width of [1440,1024,390]){
  const page=await browser.newPage();
  await page.setViewport({width,height:920,isMobile:width<=767,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?pc_ticker_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await new Promise(r=>setTimeout(r,6400));
  const details=await page.evaluate(()=>{
   const sample=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,id:e.id,cls:String(e.className),txt:(e.textContent||'').replace(/\s+/g,' ').slice(0,130),outer:e.outerHTML.slice(0,750),position:s.position,opacity:s.opacity,visibility:s.visibility,display:s.display,bg:s.backgroundColor,border:s.borderColor,height:+r.height.toFixed(2),top:+r.top.toFixed(2),left:+r.left.toFixed(2),width:+r.width.toFixed(2)};};
   const list=[...document.querySelectorAll('body *')];
   const tickerCandidates=list.filter(e=>e.children.length<9&&(/AD Cofutpa|Quepos Cambute FC|PUSH 1-0|Corners OVER/.test(e.textContent||''))&&e.getBoundingClientRect().width>100).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length).slice(0,6);
   const classes=[...document.querySelectorAll('[class*="ticker"],[class*="marquee"],[id*="ticker"],[id*="marquee"],[class*="result-strip"],[class*="outcome-strip"]')].slice(0,20);
   return{width:innerWidth,title:document.title,candidates:tickerCandidates.map(e=>({self:sample(e),parent:sample(e.parentElement),grand:sample(e.parentElement?.parentElement)})),classes:classes.map(sample),topChildren:[...document.body.children].slice(0,13).map(sample)};
  });
  console.log('TICKER_SOURCE_INSPECTION',width,JSON.stringify(details));
  await page.close();
 }
}finally{await browser.close()}
console.log('READ_ONLY_TICKER_AUDIT_SUCCESS');
