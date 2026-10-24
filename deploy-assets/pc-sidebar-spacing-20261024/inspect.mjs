import{chromium}from'playwright-core';
import{createHash}from'node:crypto';
const base='https://ball46.com/';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
for(const viewport of[{label:'desktop',width:1366,height:900},{label:'mobile',width:390,height:844}]){
 const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.goto(base+'?spacingInspect='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
 await page.waitForTimeout(8000);
 const info=await page.evaluate(()=>{
  const elems=[...document.querySelectorAll('.workspace.singlepage>.left-rail *')];
  const selected=elems.filter(e=>e.matches('button,.rail-title,.workspace-brand-card,.workspace-brand-meta,.rail-card,.status-head,h1,h2,h3,.brand,.member-card,[data-status-filter],[data-workspace-view]'))
    .filter(x=>{const r=x.getBoundingClientRect();return r.width>5&&r.height>1}).slice(0,72)
    .map(x=>{const rect=x.getBoundingClientRect(),sty=getComputedStyle(x);return{tag:x.tagName,cls:String(x.className).slice(0,115),txt:(x.innerText||'').trim().replace(/\s+/g,' ').slice(0,75),dataStatus:x.getAttribute('data-status-filter'),css:{display:sty.display,marginTop:sty.marginTop,marginBottom:sty.marginBottom,paddingTop:sty.paddingTop,paddingBottom:sty.paddingBottom,gap:sty.gap,rowGap:sty.rowGap,height:sty.height},rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},parent:String(x.parentElement?.className||'').slice(0,65)}});
  const rail=document.querySelector('.workspace.singlepage>.left-rail');
  return{body:document.body.dataset,railOuter:rail?.outerHTML.slice(0,18000),selected};
 });
 console.log('B46_SPACING_INSPECT='+JSON.stringify({viewport,info,errors:errs}).slice(0,44000));
 await page.close();
}
await browser.close();
