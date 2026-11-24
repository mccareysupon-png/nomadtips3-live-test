import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
const page=await ctx.newPage();const start=Date.now(),events=[],errors=[];let first=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('response',async res=>{
 const u=res.url();if(!/\/api\/engine\/statistics|__b46_sidebar_initial_snapshot/.test(u))return;
 const at=(Date.now()-start)/1000;
 const entry={time:Math.round(at*10)/10,status:res.status(),path:u.replace(/^https?:\/\/[^/]+/,'').slice(0,170)};
 try{
  const buf=await res.body();entry.bytes=buf.length;
  if(u.includes('__b46_sidebar_initial_snapshot'))entry.preview=buf.toString().slice(0,2000);
  else if(u.includes('?paged=1'))entry.preview=buf.toString().slice(0,1200);
 }catch(e){entry.error=String(e).slice(0,160)}
 events.push(entry);
});
const response=await page.goto('https://ball46.com/?view=live&sidebarTimingAudit=20261124',{waitUntil:'domcontentloaded',timeout:65000});
const firstAt=(Date.now()-start)/1000;
console.log('B46_TIMING_HTTP '+JSON.stringify({status:response?.status(),firstAt}));
let previous='';
for(let i=0;i<46;i++){
 const value=await page.evaluate(()=>{
  const rail=document.querySelector('.left-rail'),a=[...rail?.querySelectorAll('*')||[]].find(x=>x.children.length===0&&x.textContent?.trim()==='Total');
  const row=a?.parentElement;const match=[...rail?.querySelectorAll('*')||[]].find(x=>x.children.length===0&&x.textContent?.trim()==='Live Predictions');
  return {total:row?.textContent?.trim().slice(0,70),totalHTML:row?.outerHTML.slice(0,450),live:match?.parentElement?.textContent?.trim().slice(0,80)};
 });
 const encoded=JSON.stringify(value);
 if(encoded!==previous){console.log('B46_TIMING_DOM_CHANGE '+JSON.stringify({sec:Math.round((Date.now()-start)/100)/10,value}));previous=encoded}
 await page.waitForTimeout(500);
}
console.log('B46_TIMING_NETWORK '+JSON.stringify({events:events.slice(0,55),eventCount:events.length,errors}));
await browser.close();