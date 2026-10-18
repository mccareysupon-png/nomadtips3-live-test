import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='deploy-assets/ball46-mobile-deep-teal-20261018/audit-measure';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={startedAt:new Date().toISOString(),screens:[]};
async function boxes(page){
 return page.evaluate(()=>{
  const terms=['.dash-shell','.workspace.singlepage','.workspace-body','.workspace-main','.workspace-content','.workspace-layout','.workspace-panel[data-workspace-panel="signal"]','.workspace-panel[data-workspace-panel="statistics"]','.workspace-panel[data-workspace-panel="live"]','#b46gn-results','#b46gn-cards','#b46m-drawer','#b46m-drawer .b46m-menucontent','#b46m-drawer .b46m-item','#b46m-drawer .b46m-grouplabel'];
  const info=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,classes:e.className?.toString().slice(0,150),id:e.id,x:+r.x.toFixed(1),r:+r.right.toFixed(1),width:+r.width.toFixed(1),left:s.paddingLeft,right:s.paddingRight,display:s.display,visibility:s.visibility,position:s.position,margin:s.marginLeft,overflow:s.overflowX}};
  let selectors={};for(const x of terms)selectors[x]=info(document.querySelector(x));
  let panes={};
  for(const view of ['signal','statistics']){
    const e=document.querySelector('[data-workspace-panel="'+view+'"]');
    if(!e)continue;
    const parents=[];for(let p=e,i=0;p&&i<8;p=p.parentElement,i++)parents.push(info(p));
    const visible=[...e.querySelectorAll('*')].filter(c=>{const s=getComputedStyle(c),r=c.getBoundingClientRect();return s.display!=='none'&&s.visibility==='visible'&&r.width>0&&r.height>0&&r.width>50}).slice(0,30).map(info);
    panes[view]={parents,visible:visible.slice(0,14)};
  }
  const drawer=document.querySelector('#b46m-drawer');
  const labels=drawer?[...drawer.querySelectorAll('.b46m-grouplabel')].map(e=>({text:e.textContent,box:info(e),next:info(e.nextElementSibling)})):[];
  return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,selectors,panes,labels};
 });
}
try{
 for(const width of [320,390,430]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://ball46.com/?_widthdiag='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#b46m-teal-shell').waitFor({state:'visible',timeout:20000});
   const entries=[];
   const measure=async name=>{const data=await boxes(page);entries.push({name,data});console.log('MEASURE',JSON.stringify({width,name,scrollWidth:data.scrollWidth,selectors:data.selectors,labels:data.labels,panes:Object.fromEntries(Object.entries(data.panes).map(([k,v])=>[k,{parents:v.parents,visible:v.visible.slice(0,5)}]))}).slice(0,13000));};
   await measure('live');
   await page.locator('[data-b46m-open]').click();
   await measure('drawer-open');
   const vals=['ah','1x2','ou','corners','cards','other'];
   for(const key of vals){
     await page.locator('[data-b46m-market="'+key+'"]').click();
     await page.waitForTimeout(350);
     await measure('market-'+key);
     if(width===390&&key==='ah')await page.screenshot({path:out+'/market-ah-390.png',fullPage:true});
     await page.locator('[data-b46m-open]').click();
   }
   for(const view of ['signal','statistics']){
     await page.locator('[data-b46m-page="'+view+'"]').click();
     await page.waitForTimeout(400);
     await measure('tools-'+view);
     if(width===390)await page.screenshot({path:out+'/tools-'+view+'-390.png',fullPage:true});
     await page.locator('[data-b46m-open]').click();
   }
   report.screens.push({width,entries,errors});
   await page.close();
 }
}finally{await browser.close();}
writeFileSync(out+'/measure.json',JSON.stringify(report,null,2));
console.log('DIAGNOSTIC_DONE',JSON.stringify(report.screens.map(x=>({width:x.width,count:x.entries.length,errors:x.errors}))));
