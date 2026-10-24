import{chromium}from'playwright-core';
const r=await fetch('https://ball46.com/live-prediction-343.js',{signal:AbortSignal.timeout(60000)}),s=await r.text();const hits=[];
for(const t of ['Live match outlook','data-prediction-card','data-prediction-content','prediction-card','render','api/engine/','fetch(','pick','live match','away edge','history']){let i=-1,n=0;while((i=s.toLowerCase().indexOf(t.toLowerCase(),i+1))>=0&&n++<2)hits.push({term:t,offset:i,excerpt:s.slice(Math.max(0,i-120),i+950)})}
console.log('B46_V5_PRED_SCRIPT='+JSON.stringify({status:r.status,length:s.length,hits}).slice(0,17000));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});try{
for(const d of[{width:1366,height:768,name:'PC'},{width:390,height:844,name:'mobile'}]){
 const page=await browser.newPage({viewport:{width:d.width,height:d.height}}),errs=[],req=[];page.on('pageerror',e=>errs.push(e.message));page.on('response',x=>{if(x.url().includes('prediction'))req.push({url:x.url().slice(0,140),status:x.status()})});
 const nav=await page.goto('https://ball46.com/?predictionAudit='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(10500);
 const dom=await page.evaluate(()=>{
 const c=document.querySelector('[data-prediction-card]'),f=document.querySelector('[data-featured]'),m=document.querySelector('[data-board-sections]');
 return{prediction:c?.outerHTML.slice(0,3500),predVisible:c?{display:getComputedStyle(c).display,width:c.getBoundingClientRect().width}:null,featured:f?.outerHTML.slice(0,1400),boardButtons:[...m?.querySelectorAll('button')||[]].slice(0,5).map(x=>({html:x.outerHTML.slice(0,700)})),bodyClass:document.body.className,bodyDataset:document.body.dataset,script:!!document.querySelector('script[data-live-prediction-343]')};
 });
 console.log('B46_V5_BROWSER='+JSON.stringify({name:d.name,status:nav.status(),errors:errs.slice(0,6),requests:req,dom}).slice(0,11200));await page.close();
}
}finally{await browser.close()}
