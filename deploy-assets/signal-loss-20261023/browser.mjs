import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const result={at:new Date().toISOString(),mode:'read-only',cases:[]};
for(const t of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
 const context=await browser.newContext({viewport:{width:t.width,height:t.height},deviceScaleFactor:1,javaScriptEnabled:true});
 const page=await context.newPage(),errors=[],requests=[],failed=[];
 page.on('pageerror',e=>errors.push('SCRIPT: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text().slice(0,200))});
 page.on('response',r=>{if(r.status()>=400||/signal-next\.js|api\/engine\/signals|\.css(?:\?|$)/.test(r.url()))requests.push({status:r.status(),url:r.url()})});
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 const url='https://ball46.com/signal.html?signalIncidentBrowser='+Date.now();
 try{
  const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
  await page.waitForTimeout(10000);
  const data=await page.evaluate(()=>{
   const body=document.body?.innerText||'';
   const candidates=['.active-signal-card','.signal-card','[data-signal-card]','[data-live-pick]','.next-live-item','.signal-row'];
   const counts=Object.fromEntries(candidates.map(s=>[s,document.querySelectorAll(s).length]));
   const scripts=[...document.querySelectorAll('script')].map(s=>({src:s.src,async:s.async,defer:s.defer}));
   const resources=performance.getEntriesByType('resource').filter(x=>/signal-next\.js|api\/engine\/signals/i.test(x.name)).map(x=>({name:x.name,responseStatus:x.responseStatus,transferSize:x.transferSize}));
   const activeCards=[...document.querySelectorAll('.active-signal-card')].slice(0,6).map(x=>({text:x.innerText.slice(0,300),display:getComputedStyle(x).display,visibility:getComputedStyle(x).visibility}));
   return{title:document.title,bodyLength:body.length,bodyStart:body.slice(0,1800),scripts,resources,counts,activeCards,documentReady:document.readyState};
  });
  result.cases.push({name:t.name,http:r.status(),requests,failed,errors:errors.slice(0,20),...data});
 }catch(e){result.cases.push({name:t.name,error:String(e),requests,errors})}
 await context.close();
}
await browser.close();
await mkdir('audit',{recursive:true});await writeFile('audit/signal-browser.json',JSON.stringify(result,null,2));
console.log('B46_SIGNAL_BROWSER='+JSON.stringify(result).slice(0,15500));
