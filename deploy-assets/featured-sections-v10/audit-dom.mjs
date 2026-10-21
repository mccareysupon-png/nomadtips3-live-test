import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('audit-proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light']]){
  const p=await browser.newPage();
  await p.setViewport({width,height:960,isMobile:width<768,deviceScaleFactor:1});
  await p.goto('https://ball46.com/?view=all&v10read='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await p.waitForSelector('.featured-card[data-featured]',{timeout:40000});
  await new Promise(r=>setTimeout(r,4700));
  if(width<768){
   const fixture=await p.$('#b46gn-cards [data-b46gn-fixture]');
   if(fixture)await fixture.click();
   await new Promise(r=>setTimeout(r,1300));
  }
  const report=await p.evaluate(()=>{
   const host=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):document.querySelector('.right-rail > .featured-card[data-featured]');
   const root=document.querySelector('.right-rail > .featured-card[data-featured]');
   const st=e=>{if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return{html:e.outerHTML.slice(0,11000),tag:e.tagName,cl:String(e.className).slice(0,140),css:{display:c.display,background:c.backgroundColor,backgroundImage:c.backgroundImage,boxShadow:c.boxShadow,color:c.color,margin:c.margin,padding:c.padding,width:r.width,height:r.height}}};
   const select={};
   for(const a of ['.card-title','.feature-score','.feature-facts','.feature-signal','.feature-stats','.feature-events','.feature-facts>div','.feature-signal>div','.feature-stats>div','.feature-events>div'])select[a]=[...host?.querySelectorAll(a)||[]].slice(0,5).map(st);
   return {viewport:innerWidth,mode:document.documentElement.dataset.theme,host:st(host),root:st(root),select,
     scripts:[...document.querySelectorAll('script[src]')].map(x=>x.src).filter(x=>/featured|stage3|singlepage/i.test(x)),
     styles:[...document.querySelectorAll('style[id]')].filter(x=>/native|featured|mobile|PC/i.test(x.id)).map(x=>({id:x.id,len:x.textContent.length})),
     hasFlow:!!document.querySelector('.expand-flow-card'),hasDialog:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden')};
  });
  console.log('B46_V10_DOM',JSON.stringify({width,theme,...report}).slice(0,53000));
  await p.screenshot({path:'audit-proof/'+width+'-'+theme+'.png',fullPage:false});
  await p.close();
 }
}finally{await browser.close()}