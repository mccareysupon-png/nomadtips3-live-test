// BALL46 read-only stability audit. No POST, no Cloudflare write, no deploy.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const dir='deploy-assets/eventflow-zones-20261026/audit-refresh';
await mkdir(dir,{recursive:true});
const hosts=['https://ball46.com','https://www.ball46.com'];
const apiPaths=['/api/engine/board','/api/engine/signals'];
const report={at:new Date().toISOString(),mode:'READ_ONLY',tests:[],browser:[],warnings:[]};
function inspect(path,text){let json;try{json=JSON.parse(text)}catch{return {validJson:false,bytes:text.length};}
 const f=Array.isArray(json?.fixtures)?json.fixtures.length:null,s=Array.isArray(json?.signals)?json.signals.length:null;
 return {validJson:true,bytes:text.length,fixtures:f,signals:s,rootKeys:json&&typeof json==='object'?Object.keys(json).slice(0,15):[]};
}
for(const host of hosts){
 for(const path of apiPaths)for(let i=0;i<5;i++){
 const start=Date.now(),url=host+path;
 try{const r=await fetch(url,{method:'GET',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(18000)});const t=await r.text();report.tests.push({host,path,iteration:i+1,ms:Date.now()-start,status:r.status,cache:r.headers.get('cf-cache-status'),age:r.headers.get('age'),retryAfter:r.headers.get('retry-after'),...inspect(path,t)});}
 catch(e){report.tests.push({host,path,iteration:i+1,ms:Date.now()-start,error:String(e.message)});}
 }
}
let browser;
try{
 browser=await chromium.launch({args:['--no-sandbox']});
 for(const width of [390,1366]){
  const page=await browser.newPage({viewport:{width,height:940}});
  const errors=[],responses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const u=r.url();if(/\/api\/engine\/|expanded-match-343/.test(u))responses.push({path:new URL(u).pathname,status:r.status(),at:Date.now()});});
  for(let i=0;i<3;i++){const started=Date.now();try{
   await page.goto('https://www.ball46.com/',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForTimeout(2500);
   const state=await page.evaluate(()=>({title:document.title,ready:document.readyState,flow:document.querySelectorAll('.expand-flow-chart,.expand-flow-card').length,visibleText:document.body?.innerText?.slice(0,600),scrollWidth:document.documentElement.scrollWidth}));
   report.browser.push({width,iteration:i+1,ms:Date.now()-started,state,errors:[...errors],responses:responses.slice(-25)});
  }catch(e){report.browser.push({width,iteration:i+1,ms:Date.now()-started,error:String(e.message)});}
  }
  await page.close();
 }
}catch(e){report.warnings.push('BROWSER: '+e.message)}finally{if(browser)await browser.close()}
const mismatches=[];
for(const host of hosts)for(const path of apiPaths){const set=report.tests.filter(x=>x.host===host&&x.path===path);if(set.some(x=>x.error||x.status!==200||!x.validJson))mismatches.push(host+path+': HTTP/JSON instability');if(new Set(set.map(x=>x.fixtures??x.signals).filter(Number.isFinite)).size>1)mismatches.push(host+path+': row counts vary; may be legitimate live update');}
report.warnings.push(...mismatches);
await writeFile(dir+'/report.json',JSON.stringify(report,null,2));
console.log('BALL46_REFRESH_DIAGNOSTIC_SUMMARY='+JSON.stringify({samples:report.tests.length,browser:report.browser.length,warnings:report.warnings,api:report.tests.map(x=>({path:x.path,iteration:x.iteration,status:x.status,ms:x.ms,fixtures:x.fixtures,signals:x.signals,error:x.error})).slice(0,20)}));
