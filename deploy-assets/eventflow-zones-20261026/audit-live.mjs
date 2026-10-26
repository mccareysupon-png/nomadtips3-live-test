import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='deploy-assets/eventflow-zones-20261026/audit-live';
await mkdir(out,{recursive:true});
const report={at:new Date().toISOString(),scope:'READ-ONLY PUBLIC BASELINE (Event Flow V2 is NOT deployed)',screens:[],script:{},errors:[]};
try{
const u='https://www.ball46.com/expanded-match-343.js';
const r=await fetch(u,{signal:AbortSignal.timeout(25000),headers:{'Cache-Control':'no-cache'}});
const body=r.ok?await r.text():'';
report.script={url:u,status:r.status,bytes:body.length,hasRenderFlow:/function renderFlow\s*\(/.test(body),hasFlowCard:/expand-flow-chart/.test(body),hasSignal:/signalMinute|signalEntries|signalCard/i.test(body)};
}catch(e){report.errors.push('SCRIPT_FETCH: '+e.message)}
let browser;
try{
browser=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const width of [360,390,768,1366]){
const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto('https://www.ball46.com/',{waitUntil:'domcontentloaded',timeout:35000});
await page.waitForTimeout(4000);
const ui=await page.evaluate(()=>{
const sels=['.expand-flow-chart','.expand-flow-card','.event-compact','.attack-chart','.b46-mf-chart','svg'];
const found=Object.fromEntries(sels.map(s=>[s,document.querySelectorAll(s).length]));
const cards=[...document.querySelectorAll('.expand-flow-card,.event-compact')].slice(0,8).map(el=>({classes:el.className,rect:(()=>{let r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()}));
return {title:document.title,found,cards,scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
});
const screenshot=out+'/baseline-'+width+'.png';
await page.screenshot({path:screenshot,fullPage:false});
report.screens.push({width,url:page.url(),...ui,pageErrors:errors,screenshot});
}catch(e){report.screens.push({width,error:e.message,pageErrors:errors});}
await page.close();
}
}catch(e){report.errors.push('BROWSER: '+e.message)}
finally{if(browser)await browser.close()}
await writeFile(out+'/report.json',JSON.stringify(report,null,2));
console.log('EVENTFLOW_LIVE_BASELINE='+JSON.stringify({script:report.script,screens:report.screens.map(x=>({width:x.width,found:x.found,error:x.error,scrollWidth:x.scrollWidth})),errors:report.errors}));
if(report.screens.some(x=>x.error)||report.errors.length)process.exitCode=1;
