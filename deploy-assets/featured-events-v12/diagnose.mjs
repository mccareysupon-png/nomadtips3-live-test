import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('audit',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const result=[];
try{
 for(const width of [390,1440]){
 const page=await browser.newPage();
 await page.setViewport({width,height:980,isMobile:width<768,deviceScaleFactor:1});
 await page.goto('https://ball46.com/?view=all&v12_events_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForSelector('.workspace.singlepage',{timeout:35000});
 await page.waitForFunction(()=>document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length>0,{timeout:50000});
 if(width<768){
   const e=await page.$('#b46gn-cards [data-b46gn-fixture]');
   await e.click();
   await page.waitForSelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card',{timeout:18000});
 }else{
   const e=await page.$('article.match-row[data-match-id]');
   if(e)await e.click();
 }
 await new Promise(r=>setTimeout(r,1000));
 const d=await page.evaluate(()=>{
  const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):
   document.querySelector('.right-rail > .featured-card');
  const host=root.querySelector('.feature-events');
  const rows=[...host.querySelectorAll(':scope>.event-item')];
  const props=e=>{if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return{html:e.outerHTML.slice(0,1200),css:{display:c.display,gridTemplateColumns:c.gridTemplateColumns,gridTemplateRows:c.gridTemplateRows,gridColumn:c.gridColumn,gridRow:c.gridRow,alignItems:c.alignItems,justifyContent:c.justifyContent,lineHeight:c.lineHeight,fontSize:c.fontSize,whiteSpace:c.whiteSpace,height:c.height,padding:c.padding},box:[r.x,r.y,r.width,r.height]}};
  const pseudo=(e,p)=>{const s=getComputedStyle(e,p);return {content:s.content,display:s.display,gridRow:s.gridRow,gridColumn:s.gridColumn,width:s.width,height:s.height,fontSize:s.fontSize,whiteSpace:s.whiteSpace}};
  return {width:innerWidth,htmlTheme:document.documentElement.dataset.theme,host:props(host),len:rows.length,
   rows:rows.slice(0,4).map(r=>({row:props(r),time:props(r.querySelector('time')),span:props(r.querySelector('span')),dot:pseudo(r,'::before'),event:pseudo(r.querySelector('span'),'::before'),side:pseudo(r.querySelector('span'),'::after')}))};
 });
 result.push(d);
 console.log('B46_EVENTS_V12_CURRENT_DOM',JSON.stringify(d).slice(0,22000));
 await page.evaluate(()=>{
  const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card'):document.querySelector('.right-rail > .featured-card');
  root.querySelector('.feature-events')?.scrollIntoView({block:'center'});
  for(const n of document.querySelectorAll('[role=dialog]'))if(n!==document.querySelector('#b46gn-detail')&&getComputedStyle(n).position==='fixed')n.style.display='none';
 });
 await page.screenshot({path:'audit/'+width+'.png',fullPage:false});
 await page.close();
 }
}finally{await browser.close();}
writeFileSync('audit/report.json',JSON.stringify(result,null,2));