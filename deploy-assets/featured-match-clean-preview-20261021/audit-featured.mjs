import puppeteer from 'puppeteer-core';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN,acct=process.env.CLOUDFLARE_ACCOUNT_ID;
if(token&&acct){
try{
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
 console.log('FEATURED_ACTIVE_WORKER',JSON.stringify(res.result?.deployments?.[0]?.versions));
}catch(e){console.log('FEATURED_WORKER_FETCH_ERROR',String(e))}
}
const browser=await puppeteer.launch({executablePath:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync),headless:true,args:['--no-sandbox']});
mkdirSync('audit-featured',{recursive:true});
try{
for(const width of [390,1440]){
 const page=await browser.newPage();await page.setViewport({width,height:960,deviceScaleFactor:1,isMobile:width<768});
 await page.setCacheEnabled(false);const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,260)));
 await page.goto('https://ball46.com/?featured_audit='+width+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await new Promise(r=>setTimeout(r,7500));
 const obj=await page.evaluate(()=>{
  const all=[...document.querySelectorAll('*')];
  const candidates=all.filter(e=>/featured match/i.test(e.textContent||'')&&e.children.length<12).sort((a,b)=>(a.textContent?.length||0)-(b.textContent?.length||0)).slice(0,14);
  let element=document.querySelector('.featured-card')||document.querySelector('.feature-card')||candidates.find(e=>e.closest('.featured-card'))||candidates[0];
  const lineage=[];for(let x=element,n=0;x&&n<7;x=x.parentElement,n++)lineage.push({tag:x.tagName,id:x.id,classes:String(x.className),dataset:x.dataset,html:x.outerHTML.slice(0,n===0?18000:900)});
  const selectors=['.featured-card','.feature-score','.feature-facts','.feature-status','.feature-signal','.featured-match','.featured-events','.feature-event','.feature-bars','.featured-stats','.featured-match-card','.featured-match .team','.feature-league'];
  const snap=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,classes:String(e.className),text:(e.textContent||'').replace(/\s+/g,' ').slice(0,200),x:r.x,y:r.y,w:r.width,h:r.height,font:s.fontSize,background:s.backgroundColor,display:s.display,position:s.position}};
  return {
   width:innerWidth,theme:document.documentElement.dataset.theme,
   bodyScrollWidth:document.documentElement.scrollWidth,
   selectors:Object.fromEntries(selectors.map(x=>[x,[...document.querySelectorAll(x)].slice(0,3).map(snap)])),
   lineage,
   css:[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href),
   script:[...document.querySelectorAll('script[src]')].map(e=>e.src),
   foundByText:candidates.map(e=>({tag:e.tagName,id:e.id,cls:String(e.className),text:e.textContent?.replace(/\s+/g,' ').slice(0,250)})),
  };
 });
 console.log('FEATURED_CARD_READONLY_DOM',width,JSON.stringify({...obj,lineage:obj.lineage?.map((e,i)=>({...e,html:e.html.slice(0,i===0?17000:650)}))}));
 const candidate=await page.evaluate(()=>{
  const node=document.querySelector('.featured-card');
  if(!node)return null;
  const r=node.getBoundingClientRect();
  return{HTML:node.outerHTML,rect:{w:r.width,h:r.height},parent:node.parentElement?.outerHTML.slice(0,2500)};
 });
 if(candidate){writeFileSync('audit-featured/featured-'+width+'.json',JSON.stringify(candidate,null,2));}
 await page.screenshot({path:'audit-featured/current-'+width+'.png',fullPage:false});
 console.log('FEATURED_BROWSER_ERRORS',width,JSON.stringify(errors));
 await page.close();
}
}finally{await browser.close();}
console.log('FEATURED_READONLY_COMPLETE');
