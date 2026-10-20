import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_ACCESS_MISSING');
const j=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(50000)}).then(r=>r.json());
assert(j.success,'CF_ACTIVE_FAIL');console.log('ACTIVE_WORKER',JSON.stringify(j.result.deployments[0].versions));
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome);
const b=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
for(const width of [390,1440]){
const page=await b.newPage();await page.setViewport({width,height:900,isMobile:width<767,deviceScaleFactor:1});
await page.setCacheEnabled(false);await page.goto('https://ball46.com/?signal_mobile_css_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,7500));await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await new Promise(r=>setTimeout(r,1000));
const dump=()=>page.evaluate(()=>{
const visible=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
const get=s=>[...document.querySelectorAll(s)].filter(visible).slice(0,3).map(el=>{
const r=el.getBoundingClientRect(),c=getComputedStyle(el);
return{tag:el.tagName,id:el.id,cls:String(el.className),html:el.outerHTML.slice(0,520),height:+r.height.toFixed(1),width:+r.width.toFixed(1),bg:c.backgroundColor,image:c.backgroundImage,border:c.borderColor,shadow:c.boxShadow,parent:el.parentElement?.className,grand:el.parentElement?.parentElement?.className};
});
return{location:location.href,width:innerWidth,title:document.title,htmlAttrs:document.documentElement.outerHTML.slice(0,220),
menus:[...document.querySelectorAll('button,a,[role="tab"],[role="button"]')].filter(visible).slice(0,85).map(e=>({label:e.textContent.trim().replace(/\s+/g,' ').slice(0,65),cls:String(e.className).slice(0,100),aria:e.getAttribute('aria-label')})),
signalText:[...document.querySelectorAll('h1,h2,h3,header')].filter(visible).map(e=>e.textContent.trim().slice(0,100)).filter(x=>/signal|all matches/i.test(x)).slice(0,20),
cards:get('.b46gn-card'),head:get('.b46gn-cardhead'),pc:get('.match-row'),signalCandidates:get('[class*="signal"]'),bodyClass:document.body.className,
nested:[...document.querySelectorAll('.b46gn-card')].filter(visible).slice(0,2).map(e=>Array.from({length:5},(_,i)=>{let t=e;for(let k=0;k<=i;k++)t=t?.parentElement;return t?{i,tag:t.tagName,id:t.id,cls:String(t.className).slice(0,170),data:[...t.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]).slice(0,8)}:null}))};
});
console.log('SIGNAL_BEFORE',width,JSON.stringify(await dump()));
const menuClick=await page.evaluate(()=>{
const nodes=[...document.querySelectorAll('button,a,[role="tab"],[role="button"]')].filter(x=>x.getBoundingClientRect().width>0);
let el=nodes.find(x=>/^signals?$/i.test((x.textContent||'').trim()));
if(!el)el=nodes.find(x=>/active signals/i.test(x.textContent||'')&&x.closest('nav'));
if(el){el.click();return{clicked:true,html:el.outerHTML.slice(0,320)}}return{clicked:false};
});
console.log('SIGNAL_CLICK',width,JSON.stringify(menuClick));
await new Promise(r=>setTimeout(r,2800));console.log('SIGNAL_AFTER',width,JSON.stringify(await dump()));
await page.close();
}
}finally{await b.close()}
console.log('SIGNAL_READ_ONLY_AUDIT_DONE');
