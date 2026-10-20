import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_READ_ENV_MISSING');
async function cloud(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)});const x=await r.json();assert(r.ok&&x.success,'CF_FAIL '+path+' '+JSON.stringify(x.errors));return x.result;}
const deployments=await cloud('/workers/scripts/ball46-production/deployments?per_page=1');
const active=deployments.deployments[0];console.log('STAT_AUDIT_PRODUCTION',JSON.stringify({version:active.versions[0],deployment:active.id}));
const domains=await cloud('/workers/domains');console.log('STAT_AUDIT_DOMAINS',JSON.stringify(domains.filter(x=>x.service==='ball46-production')));
const script=await cloud('/workers/workers/ball46-production/versions/'+active.versions[0].version_id+'?include=modules');
console.log('STAT_AUDIT_MODULES',JSON.stringify({module:script.main_module,assets:script.assets,modules:script.modules.map(x=>({name:x.name,content_type:x.content_type,bytes:x.content_base64?.length}))}));
for(const path of ['/','/statistics','/index.html','/statistics.html','/statistics.js','/dashboard-v2-tune.css']){
try{const r=await fetch('https://ball46.com'+path+'?stats_audit='+Date.now(),{signal:AbortSignal.timeout(35000)});const t=await r.text();console.log('STAT_HTTP',path,JSON.stringify({status:r.status,contentType:r.headers.get('content-type'),size:t.length,start:t.slice(0,140)}))}catch(e){console.log('STAT_HTTP_ERROR',path,String(e))}}
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
assert(chrome,'NO_CHROME');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
const page=await browser.newPage();
await page.setViewport({width:1440,height:930,deviceScaleFactor:1});
await page.setCacheEnabled(false);
await page.goto('https://ball46.com/?view=statistics&stats_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});
await new Promise(r=>setTimeout(r,7200));
const first=await page.evaluate(()=>{
const txt=e=>(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,170);
const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
return {href:location.href,title:document.title,headerText:document.body.innerText.slice(0,1700),scripts:[...document.scripts].map(e=>e.src?new URL(e.src).pathname:'inline:'+e.textContent.slice(0,80)).slice(0,40),tabs:[...document.querySelectorAll('a,button,[role="tab"]')].filter(visible).slice(0,95).map(e=>({tag:e.tagName,label:txt(e),id:e.id,cls:String(e.className).slice(0,100),href:e.getAttribute('href')})),sections:[...document.querySelectorAll('section,main,article')].filter(visible).slice(0,35).map(e=>({tag:e.tagName,id:e.id,cls:String(e.className).slice(0,120),txt:txt(e)}))};
});
console.log('STAT_BROWSER_FIRST',JSON.stringify(first));
const click=await page.evaluate(()=>{
const nodes=[...document.querySelectorAll('a,button,[role="tab"],[role="button"]')].filter(e=>e.getBoundingClientRect().width>0);
const el=nodes.find(e=>/^(statistics|stats)$/i.test((e.textContent||'').trim()));
if(!el)return{found:false};el.click();return{found:true,html:el.outerHTML.slice(0,600)};
});
console.log('STAT_MENU_CLICK',JSON.stringify(click));
await new Promise(r=>setTimeout(r,5000));
const detail=await page.evaluate(()=>{
const txt=e=>(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,150);
const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
const get=s=>[...document.querySelectorAll(s)].filter(visible).slice(0,6).map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return{tag:e.tagName,cls:String(e.className).slice(0,180),id:e.id,txt:txt(e),top:+r.top.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),bg:c.backgroundColor,image:c.backgroundImage,shadow:c.boxShadow,border:c.borderColor,html:e.outerHTML.slice(0,600)}});
return {href:location.href,bodyText:document.body.innerText.slice(0,4200),bodyClass:document.body.className,htmlAttrs:[...document.documentElement.attributes].map(x=>[x.name,x.value]),ids:[...document.querySelectorAll('[id]')].map(e=>e.id).filter(x=>/stat|perf|roi|settle|history|chart|filter/i.test(x)).slice(0,80),classes:[...new Set([...document.querySelectorAll('[class]')].flatMap(e=>String(e.className).split(' ')).filter(x=>/stat|perf|roi|settle|history|chart|filter|signal/i.test(x)))].slice(0,140),headers:get('h1,h2,h3,h4'),main:get('main'),section:get('section'),tables:get('table'),nav:[...document.querySelectorAll('a,button,[role="tab"]')].filter(visible).map(e=>({label:txt(e),cls:String(e.className).slice(0,80)})).filter(x=>/statistics|stats|7d|30d|90d|all|candles|line|roi|units|win rate|filter/i.test(x.label)).slice(0,65)};
});
console.log('STAT_BROWSER_DETAIL',JSON.stringify(detail));
await page.close();
}finally{await browser.close()}
console.log('STATS_READ_ONLY_AUDIT_SUCCESS');
