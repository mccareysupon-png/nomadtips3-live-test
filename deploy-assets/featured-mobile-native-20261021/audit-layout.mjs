import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('proof',{recursive:true});
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
for(const width of [390,1440]){
const page=await browser.newPage();
await page.setViewport({width,height:980,isMobile:width<768,deviceScaleFactor:1});
await page.goto('https://ball46.com/?audit_featured_native='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,3500));
const state=await page.evaluate(()=>{
const q=s=>document.querySelector(s),card=q('.featured-card[data-featured]'),rail=card?.closest('.right-rail');
const styles=e=>{if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,cls:e.className,id:e.id,display:s.display,position:s.position,order:s.order,gridColumn:s.gridColumn,gridArea:s.gridArea,overflow:s.overflow,width:r.width,height:r.height,margin:s.margin,flex:s.flex}};
const chain=[];let z=card;while(z&&chain.length<8){chain.push(styles(z));z=z.parentElement}
const tree=e=>e?[...e.children].slice(0,16).map(z=>({tag:z.tagName,cls:z.className,id:z.id,text:z.textContent?.trim().slice(0,45),css:styles(z)})):null;
return{viewport:innerWidth,docWidth:document.documentElement.scrollWidth,chain,railChildren:tree(rail),liveGridChildren:tree(q('.live-stage-grid')),panelChildren:tree(rail?.closest('.workspace-panel')),stageChildren:tree(q('.workspace-stage')),workspaceChildren:tree(q('.workspace.singlepage')),cardHtml:card?.outerHTML.slice(0,3200),stylesheets:[...document.styleSheets].map(s=>s.href).filter(Boolean).filter(x=>/workspace|feature|ball46/.test(x)).slice(0,30)};
});
writeFileSync('proof/layout-'+width+'.json',JSON.stringify(state,null,2));
await page.screenshot({path:'proof/before-'+width+'.png',fullPage:false});
console.log('B46_NATIVE_AUDIT_'+width,JSON.stringify(state).slice(0,16500));
await page.close();
}
}finally{await browser.close()}