import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const ROOT='https://ball46.com';
mkdirSync('sidebar-audit',{recursive:true});
const report={at:new Date().toISOString(),readOnly:true,root:ROOT};
const r=await fetch(ROOT+'/index.html?statAudit=1',{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
if(!r.ok)throw Error('HTML_HTTP_'+r.status);
const html=await r.text(); report.htmlSize=html.length;
const queries=['data-stat-market','STATISTICS','stat-win','winRate','win_rate','winrate','WIN RATE','marketWin','sidebar','statistics-summary','statistics/snapshot','engine/statistics','data-sp-table-body'];
for(const q of queries){
 let pos=-1,occ=0,contexts=[];
 while((pos=html.toLowerCase().indexOf(q.toLowerCase(),pos+1))!==-1){
  occ++; if(contexts.length<5)contexts.push(html.slice(Math.max(0,pos-200),Math.min(html.length,pos+550)).replace(/\s+/g,' ').slice(0,750));
 }
 console.log('HTML_TOKEN',JSON.stringify({token:q,count:occ,contexts}));
}
report.externalScripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi)].map(x=>x[1]).slice(0,80);
console.log('HTML_EXTERNAL_SCRIPTS',JSON.stringify(report.externalScripts));
const browser=await chromium.launch({headless:true});
const pg=await browser.newPage({viewport:{width:1440,height:920},serviceWorkers:'block'});
const calls=[],errors=[];
pg.on('request',x=>{try{const u=new URL(x.url());if(u.hostname.includes('ball46'))calls.push({method:x.method(),path:u.pathname+u.search.slice(0,80)});}catch{}});
pg.on('pageerror',e=>errors.push(String(e).slice(0,250)));
await pg.goto(ROOT+'/index.html?view=statistics',{waitUntil:'domcontentloaded',timeout:70000});
await pg.waitForTimeout(5400);
async function snapshot(label){
 const data=await pg.evaluate(()=>{
  const marketButtons=[...document.querySelectorAll('[data-stat-market]')];
  const detail=marketButtons.map((e,i)=>({i,market:e.getAttribute('data-stat-market'),text:e.textContent.trim().slice(0,140),html:e.outerHTML.slice(0,1200),visible:e.getBoundingClientRect().width>0,active:e.classList.contains('active')}));
  const side=[...document.querySelectorAll('aside,nav,[class*="sidebar"],[id*="sidebar"],[class*="stat-nav"]')].filter(e=>e.textContent?.includes('STATISTICS')).slice(0,5).map(e=>({tag:e.tagName,id:e.id,class:e.className,html:e.outerHTML.slice(0,4700)}));
  const stats=[...document.querySelectorAll('[data-stat-market], [data-workspace-panel="statistics"] [class*="rate"], [data-workspace-panel="statistics"] [id*="rate"]')].slice(0,32).map(e=>({tag:e.tagName,id:e.id,class:e.className,text:e.textContent.trim().slice(0,100)}));
  return {url:location.href,theme:document.documentElement.dataset.theme,workspace:document.body?.dataset?.workspaceView,marketButtons:detail,sidebarContainers:side,stats,statsPanelText:document.querySelector('[data-workspace-panel="statistics"]')?.innerText.slice(0,1000),scripts:[...document.scripts].map(x=>x.src).filter(Boolean).slice(0,80)};
 });
 console.log('DOM_AUDIT_'+label,JSON.stringify(data));
 return data;
}
report.initial=await snapshot('INITIAL');
report.initialCalls=calls.slice(-40);
const target=pg.locator('[data-stat-market="1x2"]').first();
if(await target.count()){
 await target.click();
 await pg.waitForTimeout(2300);
 report.after1x2=await snapshot('CLICK_1X2');
 report.afterCalls=calls.slice(-45);
}
console.log('NET_READONLY_CALLS',JSON.stringify({initial:report.initialCalls,after:report.afterCalls,errors:errors.slice(-10)}));
await pg.screenshot({path:'sidebar-audit/after.png',fullPage:false});
await browser.close();
writeFileSync('sidebar-audit/report.json',JSON.stringify({...report,errors},null,2));
console.log('BALL46_SIDEBAR_AUDIT_COMPLETE');
