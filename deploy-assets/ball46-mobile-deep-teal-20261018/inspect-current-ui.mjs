import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const out='deploy-assets/ball46-mobile-deep-teal-20261018/audit-before';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const entries=[];
try{
 for(const width of [320,390,430,760,761,1280]){
  const page=await browser.newPage({viewport:{width,height:860},deviceScaleFactor:1});
  let errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://ball46.com/?_b46styleaudit='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('body').waitFor();
  if(width<=760)await page.locator('#b46m-teal-shell').waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(2500);
  const r=await page.evaluate(()=>{
    const selectors=['#b46m-teal-shell','[data-b46m-open]','[data-b46m-searchbutton]','.b46m-menu-toggle','.b46m-searchbutton','.b46gn-card','#b46gn-cards [data-b46gn-fixture]','#b46gn-cards .b46gn-card','#b46gn-results','#b46gn-detail .b46gn-sheet'];
    const styles=(el,pseudo)=>{if(!el)return null;const s=getComputedStyle(el,pseudo),r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,classes:typeof el.className==='string'?el.className.slice(0,180):'',html:el.outerHTML.slice(0,470),box:{x:r.x,y:r.y,width:r.width,height:r.height},style:{display:s.display,border:s.border,borderWidth:s.borderWidth,borderColor:s.borderColor,background:s.background,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,boxShadow:s.boxShadow,outline:s.outline,outlineWidth:s.outlineWidth,filter:s.filter,opacity:s.opacity,borderRadius:s.borderRadius,transform:s.transform},count:el.children.length}};
    const values={};
    for(const selector of selectors){const el=document.querySelector(selector);values[selector]={count:document.querySelectorAll(selector).length,normal:styles(el),before:styles(el,'::before'),after:styles(el,'::after')}}
    return {pageScrollWidth:document.documentElement.scrollWidth,values,bodyClass:document.body.className,htmlClass:document.documentElement.className};
  });
  entries.push({width,...r,errors});
  if(width===390){await page.screenshot({path:out+'/mobile-before.png'});}
  if(width===1280){await page.screenshot({path:out+'/desktop-before.png'});}
  console.log('UI_INSPECTION',JSON.stringify({width,pageScrollWidth:r.pageScrollWidth,values:Object.fromEntries(Object.entries(r.values).map(([k,v])=>[k,{count:v.count,normal:v.normal,after:v.after?.style,before:v.before?.style}])),errors}).slice(0,11000));
  await page.close();
 }
}finally{await browser.close();}
writeFileSync(out+'/computed-styles.json',JSON.stringify({timestamp:new Date().toISOString(),entries},null,2));
console.log('AUDIT_READY',entries.length);
