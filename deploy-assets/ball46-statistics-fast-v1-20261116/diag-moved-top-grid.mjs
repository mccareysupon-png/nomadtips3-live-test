import {createRequire} from 'node:module';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const host='https://0bfe2d9f-ball46-production.mccarey-supon.workers.dev';
const browser=await chromium.launch({headless:true});
try{
 const p=await browser.newPage({viewport:{width:1366,height:900}});
 await p.goto(host+'/?view=statistics&market=1x2',{waitUntil:'domcontentloaded',timeout:55000});
 await p.waitForFunction(()=>!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,null,{timeout:100000});
 const d=await p.evaluate(()=>{
   const view=e=>e?{tag:e.tagName,id:e.id,cls:e.className,outer:e.outerHTML.slice(0,500),
    display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,
    style:e.getAttribute('style'),rect:{w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}:null;
   const grid=document.querySelector('.b46v23-strip-grid');
   const ancestors=[];for(let e=grid;e&&ancestors.length<12;e=e.parentElement)ancestors.push(view(e));
   const rules=[];
   for(const ss of document.styleSheets){
     try{for(const rule of ss.cssRules)if(rule.cssText?.includes('b46v23-strip-grid')&&rules.length<16)
       rules.push({css:rule.cssText.slice(0,420),sheet:ss.href||'INLINE'});}catch{}
   }
   return{url:location.href,bodyView:document.body.dataset.workspaceView,
      oldRow:view(document.querySelector('.sp-kpis')),
      grid:view(grid),ancestors,
      finance:!!document.querySelector('#b46-finance-chart-card .b46-stage-summary-grid'),
      noFlashCSS:document.querySelector('#b46-moved-top-kpis-no-flash-20261117')?.textContent,
      rules};
 });
 console.log('B46_TOP_GRID_DIAG='+JSON.stringify(d));
}finally{await browser.close()}
