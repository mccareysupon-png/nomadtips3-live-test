import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const auth=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const j=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+auth}}).then(r=>r.json());
assert(j.success);console.log('MOBILE_STATS_ACTIVE_WORKER',JSON.stringify(j.result.deployments[0].versions));
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
const b=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
for(const width of [390,430,360,1440]){
 const p=await b.newPage();await p.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});await p.setCacheEnabled(false);
 await p.goto('https://ball46.com/?view=statistics&mobile_stats_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:75000});
 await p.waitForFunction(()=>{const s=document.querySelector('.sp-stats-content'),k=document.querySelector('[data-sp-kpi="total"]');return !!s&&Number.parseInt(k?.textContent?.replace(/[^0-9]/g,''),10)>0},{timeout:50000,polling:550});
 await p.evaluate(()=>document.documentElement.dataset.theme='dark');await new Promise(r=>setTimeout(r,1400));
 const inspect=await p.evaluate(()=>{
  const stat=document.querySelector('.sp-stats-content');
  const relevant=['.sp-stats-content','.sp-stat-hero','.sp-kpis','.sp-kpi','.sp-trend','.b46-perf-shell','.b46-perf-head','.b46-perf-kpis','.b46-perf-kpi','.b46-perf-toolbar','.b46-perf-chart-wrap','.b46-perf-unit-nav','.sp-filters','.sp-results','.sp-table-wrap','.sp-table','.sp-table thead','.sp-table tbody tr','.sp-table tbody td','.sp-match','.sp-match strong','.sp-match small'];
  const snapshot=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,cls:String(e.className).slice(0,120),text:(e.textContent||'').trim().replace(/\s+/g,' ').slice(0,180),rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],display:s.display,grid:s.gridTemplateColumns,flex:s.flexDirection,font:s.fontSize,line:s.lineHeight,bg:s.backgroundColor,pad:s.padding,margin:s.margin,overflow:s.overflow,whiteSpace:s.whiteSpace,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,html:e.outerHTML.slice(0,320)};};
  const out={width:innerWidth,theme:document.documentElement.dataset.theme,docScrollWidth:document.documentElement.scrollWidth,stats:!!stat,
   nodes:Object.fromEntries(relevant.map(sel=>[sel,[...document.querySelectorAll(sel)].slice(0,3).map(snapshot)])),
   kpis:[...document.querySelectorAll('.sp-kpis .sp-kpi')].map(x=>({label:x.querySelector('span')?.textContent.trim(),number:x.querySelector('strong')?.textContent.trim()})),
   perf:[...document.querySelectorAll('.b46-perf-kpis .b46-perf-kpi')].map(x=>({label:x.querySelector('span')?.textContent.trim(),number:x.querySelector('b')?.textContent.trim()})),
   tableHeaders:[...document.querySelectorAll('.sp-table th')].map(x=>x.textContent.trim()),
   tableFirstRows:[...document.querySelectorAll('.sp-table tbody tr')].slice(0,2).map(x=>({outer:x.outerHTML.slice(0,6400),text:x.textContent.trim().replace(/\s+/g,' ').slice(0,600)})),
   filterButtons:[...document.querySelectorAll('.sp-filter-chip')].map(x=>({label:x.textContent.trim(),outer:x.outerHTML.slice(0,300)})),
   sidebar:document.querySelector('.b46m-header')?.outerHTML.slice(0,300)
  };return out;
 });
 console.log('MOBILE_STATS_DOM_AUDIT',width,JSON.stringify(inspect));
 await p.close();
}
}finally{await b.close();}
console.log('MOBILE_STATS_READ_ONLY_COMPLETE');
