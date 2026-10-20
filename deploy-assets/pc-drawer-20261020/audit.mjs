import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
if(!executablePath)throw Error('NO_CHROMIUM');
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:960,deviceScaleFactor:1});
 await page.setCacheEnabled(false);
 await page.goto('https://ball46.com/?drawer_source_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});
 await new Promise(r=>setTimeout(r,8500));
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await new Promise(r=>setTimeout(r,1300));
 const row=await page.waitForSelector('.workspace.singlepage article.match-row:not(.active)',{visible:true,timeout:20000});
 await row.click();
 await new Promise(r=>setTimeout(r,800));
 const details=await page.evaluate(()=>{
  const a=[...document.querySelectorAll('.workspace.singlepage article.match-row.active[aria-expanded="true"]')].find(el=>el.getBoundingClientRect().width>0);
  if(!a)throw Error('NO_ACTIVE_EXPANDED_ROW');
  const s=a.nextElementSibling;
  const select=el=>{
   if(!el)return null;
   const cs=getComputedStyle(el),r=el.getBoundingClientRect(),parent=el.parentElement;
   return {tag:el.tagName,cls:String(el.className).slice(0,100),attrs:Array.from(el.attributes).filter(a=>['id','data-expanded-match','aria-expanded'].includes(a.name)).map(x=>[x.name,x.value]),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,parentClass:parent?.className,display:cs.display,bg:cs.backgroundColor,image:cs.backgroundImage,borders:[cs.borderTopWidth,cs.borderRightWidth,cs.borderBottomWidth,cs.borderLeftWidth],borderColors:[cs.borderTopColor,cs.borderRightColor,cs.borderBottomColor,cs.borderLeftColor],radius:cs.borderRadius,shadow:cs.boxShadow,margin:cs.margin,padding:cs.padding,position:cs.position,boxSizing:cs.boxSizing,overflow:cs.overflow};
  };
  const container=a.closest('.league-block');
  const bc=a.getBoundingClientRect(),sc=s?.getBoundingClientRect();
  return {row:select(a),next:select(s),inner:select(s?.firstElementChild),container:select(container),siblingOK:s?.matches('section.match-expanded[data-expanded-match]'),diff:sc?{left:sc.left-bc.left,right:sc.right-bc.right,gap:sc.top-bc.bottom}:null,styleCount:document.querySelectorAll('style').length};
 });
 console.log('PC_DRAWER_REAL_BASELINE',JSON.stringify(details));
 if(!details.siblingOK)throw Error('SEAM_SELECTOR_DRIFT');
}finally{await browser.close();}
