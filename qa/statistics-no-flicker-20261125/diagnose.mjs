import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
for(const device of [{name:'pc',width:1440,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],navigations=[],responses=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url())});
 page.on('response',r=>{if(/statistics|performance|snapshot|daily/i.test(r.url()))responses.push({url:r.url().slice(0,160),status:r.status()})});
 try{
  const res=await page.goto('https://ball46.com/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3200);
  const before=await page.evaluate(()=>{
   const text=(x)=>x?.textContent?.trim().slice(0,110);
   const buttons=[...document.querySelectorAll('button,a,[role=button]')].filter(b=>/^(7D|30D|90D|ALL|7 Days|30 Days|90 Days)$/i.test(b.textContent.trim())||/7D|30D|90D/i.test((b.getAttribute('data-range')||'')+' '+(b.getAttribute('data-period')||'')));
   const parents=buttons.map(b=>({text:text(b),html:b.outerHTML.slice(0,420),parent:b.parentElement?.outerHTML.slice(0,650)}));
   const graphs=[...document.querySelectorAll('svg,canvas')].map(x=>({tag:x.tagName,cls:typeof x.className==='string'?x.className:x.className?.baseVal,id:x.id,near:text(x.closest('section,article,.card')?.querySelector('h2,h3,.title'))})).slice(0,20);
   return {url:location.href,title:document.title,buttons:parents,graphs,rootIDs:[...document.querySelectorAll('main, .view, [data-view], #statistics-view, .statistics-root')].slice(0,20).map(x=>({tag:x.tagName,id:x.id,cls:typeof x.className==='string'?x.className:'',dataView:x.dataset?.view,child:x.children.length})),text:document.body.textContent.slice(0,1000)};
  });
  console.log('B46_PROD_STAT_BEFORE '+JSON.stringify({device:device.name,http:res.status(),before}));
  await page.evaluate(()=>{
   document.documentElement.dataset.b46DocMark='doc-'+Date.now();
   window.__b46stat={removed:[],tracked:[...document.querySelectorAll('svg,canvas')].slice(0,20),root:document.querySelector('main')||document.body};
   new MutationObserver(recs=>{for(const r of recs)for(const el of r.removedNodes){
    if(el.nodeType!==1)continue;
    if(el===window.__b46stat.root||el.contains(window.__b46stat.root)||window.__b46stat.tracked.some(x=>x===el||el.contains(x)))
     window.__b46stat.removed.push({tag:el.tagName,id:el.id,cls:typeof el.className==='string'?el.className.slice(0,70):'',html:el.outerHTML?.slice(0,150)});
   }}).observe(document.documentElement,{subtree:true,childList:true});
  });
  const buttons=page.locator('button').filter({hasText:/^(7D|30D|90D)$/});
  const count=await buttons.count();
  if(count){
   const pick=page.getByRole('button',{name:'90D',exact:true});
   if(await pick.count())await pick.first().click({timeout:15000});
   await page.waitForTimeout(1200);
  }
  const after=await page.evaluate(()=>({url:location.href,docMark:document.documentElement.dataset.b46DocMark,removed:window.__b46stat?.removed,rootPreserved:window.__b46stat?.root?.isConnected,graphPreserved:window.__b46stat?.tracked?.map(x=>x.isConnected),selected:[...document.querySelectorAll('button')].filter(x=>/^(7D|30D|90D)$/.test(x.textContent.trim())).map(x=>({text:x.textContent.trim(),pressed:x.getAttribute('aria-pressed'),cls:x.className}))}));
  console.log('B46_PROD_STAT_AFTER '+JSON.stringify({device:device.name,count,after,errors,navigations,responses:responses.slice(-14)}));
 }catch(e){console.log('B46_PROD_STAT_ERROR '+JSON.stringify({device:device.name,error:String(e),errors,navigations}));}
 await ctx.close();
}
await browser.close();
