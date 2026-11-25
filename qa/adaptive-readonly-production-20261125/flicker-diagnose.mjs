import {chromium} from 'playwright';
const urls={
 productionResearch:'https://ball46.com/research/adaptive-ou/',
 productionPrematch:'https://ball46.com/?b46pm=ou',
 testPrematch:'https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou',
 stageResearch:'https://ball46-adaptive-readonly-page-test-20261125.mccarey-supon.workers.dev/research/adaptive-ou/'
};
const browser=await chromium.launch({headless:true});
for(const [name,url] of Object.entries(urls)){
 const ctx=await browser.newContext({viewport:{width:1360,height:860},serviceWorkers:'block'});
 const page=await ctx.newPage();const errors=[],nav=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('framenavigated',f=>{if(f===page.mainFrame())nav.push({when:Date.now(),url:f.url()})});
 page.on('request',r=>{if(r.isNavigationRequest())requests.push({when:Date.now(),method:r.method(),url:r.url()})});
 const started=Date.now();
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(2400);
  const before=await page.evaluate(()=>{
   const adaptive=document.querySelector('#b46-adaptive-native');
   const research=document.querySelector('#equity-panel');
   const choices=[...document.querySelectorAll('button')].filter(b=>/^(7D|30D|90D)$/.test(b.textContent.trim())).map(b=>({
    text:b.textContent.trim(),html:b.outerHTML.slice(0,350),ancestor:b.parentElement?.parentElement?.outerHTML.slice(0,170)
   }));
   document.documentElement.dataset.b46QaPageId='qa-retained-'+Date.now();
   window.__b46Qa={panel:adaptive||research,graph:document.querySelector('#b46-adaptive-research-equity')||document.querySelector('#equity-panel'),table:adaptive?.querySelector('table')||document.querySelector('#results'),removes:0};
   new MutationObserver(changes=>{for(const change of changes)for(const el of change.removedNodes)if(el===window.__b46Qa.panel||el===window.__b46Qa.graph||el===window.__b46Qa.table||el.contains?.(window.__b46Qa.panel)||el.contains?.(window.__b46Qa.graph))window.__b46Qa.removes++}).observe(document.documentElement,{subtree:true,childList:true});
   return {url:location.href,heading:document.title,htmlLength:document.documentElement.outerHTML.length,choices,adaptive:!!adaptive,research:!!research,frameId:document.documentElement.dataset.b46QaPageId,tableRows:window.__b46Qa.table?.rows?.length};
  });
  console.log('B46_FLICKER_BEFORE '+JSON.stringify({name,http:response?.status(),before}));
  const found=page.getByRole('button',{name:'90D',exact:true});
  const count=await found.count();
  if(count){
    await found.last().click({timeout:12000});
    await page.waitForTimeout(700);
  }
  const after=await page.evaluate(()=>{
   const now=window.__b46Qa;
   return {url:location.href,retainedMarker:document.documentElement.dataset.b46QaPageId,
    samePanel:now?.panel===document.querySelector('#b46-adaptive-native')||now?.panel===document.querySelector('#equity-panel'),
    sameGraph:now?.graph===document.querySelector('#b46-adaptive-research-equity')||now?.graph===document.querySelector('#equity-panel'),
    sameTable:now?.table===document.querySelector('#b46-adaptive-native table')||now?.table===document.querySelector('#results'),
    removes:now?.removes,buttons:[...document.querySelectorAll('button')].filter(b=>/^(7D|30D|90D)$/.test(b.textContent.trim())).map(b=>({text:b.textContent.trim(),pressed:b.getAttribute('aria-pressed'),class:b.className})).slice(0,14),
    caption:document.querySelector('#b46-adaptive-research-equity p.b46pm-stats-cutoff')?.textContent||document.querySelector('#detail')?.textContent};
  });
  console.log('B46_FLICKER_AFTER '+JSON.stringify({name,url:page.url(),clickedCount:count,after,nav,requests,errors,elapsed:Date.now()-started}));
 }catch(e){console.log('B46_FLICKER_ERROR '+JSON.stringify({name,message:String(e),nav,errors}));}
 await ctx.close();
}
await browser.close();
