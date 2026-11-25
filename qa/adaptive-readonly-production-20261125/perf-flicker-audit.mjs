import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
for(const device of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:device,serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('#b46-adaptive-native',{timeout:45000});
 const before=await page.evaluate(()=>{
  const parent=document.querySelector('#b46-prematch-panel');
  const range=document.querySelector('[data-b46pm-perf-range="90D"]');
  const adaptive=document.querySelector('#b46-adaptive-native');
  const perf=document.querySelector('.b46pm-performance');
  const table=adaptive?.querySelector('table'),graph=document.querySelector('#b46-adaptive-research-equity');
  window.__flicker={parent,range,adaptive,perf,table,graph,removed:[]};
  new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes){
    if(node===parent||node===adaptive||node===perf||node===table||node===graph||node.contains?.(adaptive)||node.contains?.(perf)){
      window.__flicker.removed.push({tag:node.tagName,cls:String(node.className).slice(0,130),id:node.id,contentLength:node.textContent?.length});
    }
  }}).observe(document.documentElement,{subtree:true,childList:true});
  return {range:range?.outerHTML,visible:!!range&&!!range.getBoundingClientRect().width,perf:!!perf,adaptive:!!adaptive,
   graph:!!graph,tableRows:table?.rows.length};
 });
 const button=page.locator('[data-b46pm-perf-range="90D"]').first();
 if(await button.count())await button.click({timeout:20000});
 await page.waitForTimeout(1400);
 const after=await page.evaluate(()=>{
  const x=window.__flicker;
  return {sameParent:x.parent===document.querySelector('#b46-prematch-panel'),
   sameAdaptive:x.adaptive===document.querySelector('#b46-adaptive-native'),
   samePerformance:x.perf===document.querySelector('.b46pm-performance'),
   sameTable:x.table===document.querySelector('#b46-adaptive-native table'),
   sameGraph:x.graph===document.querySelector('#b46-adaptive-research-equity'),
   removed:x.removed.slice(0,18),removedCount:x.removed.length,
   count:document.querySelectorAll('[data-b46pm-perf-range]').length};
 });
 console.log('B46_PREMATCH_PERF_FLICKER_VERIFIED '+JSON.stringify({device:device.name,before,after,errors,url:page.url()}));
 await ctx.close();
}
await browser.close();
