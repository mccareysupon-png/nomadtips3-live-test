import puppeteer from 'puppeteer-core';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN,acct=process.env.CLOUDFLARE_ACCOUNT_ID;
if(token&&acct){try{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token}});const j=await r.json();console.log('FEATURED_FLASH_ACTIVE',JSON.stringify(j.result?.deployments?.[0]?.versions))}catch(e){console.log('FEATURED_FLASH_CF_ERROR',String(e))}}
const browser=await puppeteer.launch({headless:true,executablePath:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync),args:['--no-sandbox']});
mkdirSync('audit-featured/flash',{recursive:true});
try{
for(const [domain,label] of [['https://ball46.com','production'],['https://c7eb36c0-ball46-production.mccarey-supon.workers.dev','existing-inplace-preview'],['https://a2bfde32-ball46-production.mccarey-supon.workers.dev','old-unrelated-preview']]){
const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});await p.setCacheEnabled(false);
try{
 await p.goto(domain+'/?view=live&flash_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
 const history=[];
 for(let i=0;i<10;i++){
  await new Promise(r=>setTimeout(r,450));
  const state=await p.evaluate(()=>{
   const card=document.querySelector('.featured-card[data-featured]'),rail=document.querySelector('.right-rail'),clones=[...document.querySelectorAll('.b46fm-preview-mobile,.b46fm-preview-pc,.b46fm,[data-b46-featured-preview]')];
   const box=e=>{if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return{display:s.display,vis:s.visibility,w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)}};
   const xs=[...document.querySelectorAll('style[id],script[id]')].filter(e=>/featured|b46fm/i.test(e.id)).map(e=>e.id);
   return{stamp:performance.now().toFixed(0),theme:document.documentElement.getAttribute('data-theme'),featureCount:document.querySelectorAll('.featured-card').length,
    clones:clones.length,cloneClasses:clones.map(x=>x.className),rail:box(rail),card:box(card),addedClass:card?.classList.contains('b46fm-inplace'),
    previewMarker:!!window.__b46FeaturedCleanPreviewV2Installed,oldCloneMarker:!!window.__b46FeaturedCleanPreviewV1,styleIds:xs,
    featuredTopContent:(card?.textContent||'').replace(/\s+/g,' ').slice(0,110)};
  });
  history.push(state);
 }
 console.log('FEATURED_FLASH_PUBLIC_AUDIT',label,JSON.stringify(history));
 writeFileSync('audit-featured/flash/'+label+'.json',JSON.stringify(history,null,2));
} catch(e){console.log('FEATURED_FLASH_AUDIT_ERROR',label,String(e))}
finally{await p.close()}
}
}finally{await browser.close()}
