import {chromium,devices} from 'playwright';

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();
await page.goto('https://ball46.com/?signal-pin-race-audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#b46gn-cards [data-b46gn-fixture]',{state:'visible',timeout:90000});
await page.waitForTimeout(2500);

const target=await page.evaluate(()=>{
 const rows=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')];
 for(const row of rows){
   const host=row.querySelector('.signal-inline-stack[data-inline-signal-count]');
   const n=Number(host?.getAttribute('data-inline-signal-count')||0);
   if(n>0){
     const star=row.querySelector('[data-b46-pin-mobile]');
     const badge=host.querySelector('.b46-league-market-signal-count');
     return {id:row.getAttribute('data-b46gn-fixture'),n,star:!!star,badge:badge?.textContent?.trim()||null,aria:badge?.getAttribute('aria-label')||null,parentClass:row.parentElement?.className||null};
   }
 }
 return null;
});
console.log('TARGET='+JSON.stringify(target));
if(!target)throw new Error('NO_SIGNAL_CARD_FOUND');

await page.evaluate(id=>{
 window.__b46audit=[];
 const row=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')].find(x=>x.getAttribute('data-b46gn-fixture')===id);
 const root=document.querySelector('#b46gn-results')||document.querySelector('#b46gn-cards');
 const snap=label=>{
   const r=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')].find(x=>x.getAttribute('data-b46gn-fixture')===id);
   const host=r?.querySelector('.signal-inline-stack[data-inline-signal-count]');
   const badge=host?.querySelector('.b46-league-market-signal-count');
   window.__b46audit.push({label,t:performance.now(),connected:!!r?.isConnected,parentClass:r?.parentElement?.className||null,section:r?.closest('[data-status-section]')?.getAttribute('data-status-section')||null,hasLeagueHead:!!r?.closest('.league-block')?.querySelector(':scope > .league-head'),count:host?.getAttribute('data-inline-signal-count')||null,badge:badge?.textContent?.trim()||null,aria:badge?.getAttribute('aria-label')||null,html:host?.outerHTML?.slice(0,900)||null});
 };
 snap('before-observer');
 const mo=new MutationObserver(()=>snap('mutation'));
 mo.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-inline-signal-count']});
 window.__b46mo=mo;
},target.id);

const star=page.locator(`[data-b46gn-fixture="${target.id}"] [data-b46-pin-mobile]`).first();
await star.tap({timeout:5000});
for(const ms of [50,150,300,600,1000,2000,4000,7000]){
 await page.waitForTimeout(ms-(globalThis.__last||0)); globalThis.__last=ms;
 await page.evaluate(({id,ms})=>{
   const r=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')].find(x=>x.getAttribute('data-b46gn-fixture')===id);
   const host=r?.querySelector('.signal-inline-stack[data-inline-signal-count]');
   const badge=host?.querySelector('.b46-league-market-signal-count');
   window.__b46audit.push({label:'timer-'+ms,t:performance.now(),connected:!!r?.isConnected,parentClass:r?.parentElement?.className||null,section:r?.closest('[data-status-section]')?.getAttribute('data-status-section')||null,hasLeagueHead:!!r?.closest('.league-block')?.querySelector(':scope > .league-head'),count:host?.getAttribute('data-inline-signal-count')||null,badge:badge?.textContent?.trim()||null,aria:badge?.getAttribute('aria-label')||null,html:host?.outerHTML?.slice(0,900)||null});
 },{id:target.id,ms});
}
const out=await page.evaluate(()=>{window.__b46mo?.disconnect();return window.__b46audit});
console.log('AUDIT='+JSON.stringify(out));
await browser.close();
