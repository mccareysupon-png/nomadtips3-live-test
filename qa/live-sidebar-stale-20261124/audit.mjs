import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const ROOT='https://ball46.com';
const VIEW='/?view=live&b46ReadOnlyAudit=20261124';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},serviceWorkers:'block'});
const page=await ctx.newPage();
const requests=[],errors=[],consoleErrors=[],timeline=[];
page.on('pageerror',e=>errors.push({when:Date.now(),text:e.message.slice(0,600)}));
page.on('console',e=>{if(e.type()==='error')consoleErrors.push({when:Date.now(),text:e.text().slice(0,450)})});
page.on('response',res=>{
 const u=res.url();
 if(/\/api\//.test(u)||/statistics|snapshot|signal|count|live/i.test(u)&&!/\.(?:css|js|png|svg|woff|webp|jpg)(?:\?|$)/i.test(u)){
  const entry={t:Date.now(),status:res.status(),url:u.slice(0,250)};
  requests.push(entry);
 }
});
const started=Date.now();
const response=await page.goto(ROOT+VIEW,{waitUntil:'domcontentloaded',timeout:65000});
console.log('B46_INITIAL_HTTP '+JSON.stringify({status:response?.status(),url:page.url()}));
for(let n=0;n<10;n++){
 await page.waitForTimeout(n===0?4500:12000);
 const snap=await page.evaluate(()=>{
  const selector=['.sidebar','[class*="sidebar"]','[class*="side-nav"]','[class*="nav"]','[data-b46-stat]','[class*="prediction"]','[class*="counter"]'];
  const countElements=[...document.querySelectorAll('body *')].filter(e=>e.children.length<6&&e.textContent?.trim()&&/^(?:Total|Win Rate|WIN RATE|1X2|AH|O\/U|BTTS|Cards|Corners|Other|Live Predictions|Live Prediction|P\/L TODAY)$/i.test(e.textContent.trim())).slice(0,35).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,110),text:e.textContent.trim().slice(0,100),parent:e.parentElement?.textContent?.trim().slice(0,180)}));
  const stats=[...document.querySelectorAll('[data-b46-stat],[data-b46-rate],[data-b46-monitor],.b46-sidebar-stat,.b46-sidebar-rate')].slice(0,70).map(e=>({attr:e.getAttribute('data-b46-stat')||e.getAttribute('data-b46-rate')||e.getAttribute('data-b46-monitor'),text:e.textContent?.trim().slice(0,130),cls:String(e.className).slice(0,60)}));
  const menuparts=[...document.querySelectorAll('aside,nav,[role="navigation"]')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).slice(0,24).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,110),id:e.id,text:e.innerText?.trim().slice(0,600)}));
  const diagnostics={ready:document.readyState,visibility:document.visibilityState,htmlTheme:document.documentElement.getAttribute('data-theme'),pathname:location.pathname,fragment:location.hash,sidebarNodes:document.querySelectorAll('[class*="sidebar"]').length,matchRows:document.querySelectorAll('.match-row[data-match-id]').length,renderedLiveRows:document.querySelectorAll('[data-match-id]').length};
  const globals=Object.keys(window).filter(x=>/^__B46|^__b46/i.test(x)).slice(0,80);
  return {diagnostics,globals,countElements,stats,menuparts};
 });
 timeline.push({elapsedSeconds:Math.round((Date.now()-started)/1000),snap,newRequests:requests.splice(0),newErrors:errors.splice(0),newConsoleErrors:consoleErrors.splice(0)});
 console.log('B46_STALE_AUDIT_SAMPLE '+JSON.stringify(timeline[timeline.length-1]));
}
const additional={};
for(const path of ['/api/engine/statistics','/api/engine/health','/api/full-market/health']){
 try{
  const r=await ctx.request.get(ROOT+path,{timeout:20000});
  const s=await r.text();
  additional[path]={status:r.status(),size:s.length,preview:s.slice(0,1900)};
 }catch(e){additional[path]={error:String(e).slice(0,300)}}
}
console.log('B46_BACKEND_SNAPSHOTS '+JSON.stringify(additional));
console.log('B46_STALE_AUDIT_SUMMARY '+JSON.stringify({samples:timeline.length,totalSeconds:Math.round((Date.now()-started)/1000),errors:timeline.flatMap(x=>x.newErrors).length,consoleErrors:timeline.flatMap(x=>x.newConsoleErrors).length,totalRequests:timeline.reduce((a,x)=>a+x.newRequests.length,0),visibleFirst:timeline[0].snap.menuparts.map(x=>x.text.slice(0,180)),visibleLast:timeline.at(-1).snap.menuparts.map(x=>x.text.slice(0,180))}));
await ctx.close();await browser.close();
