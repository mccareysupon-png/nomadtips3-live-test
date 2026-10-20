import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';
const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
if(!exe)throw Error('CHROME_NOT_FOUND');
const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox']});
const origin='https://ball46.com/';
const styles=()=> {
 const targets=['.workspace.singlepage .match-row','.workspace.singlepage .match-row.active','.workspace.singlepage .league-head','.workspace.singlepage .match-expanded','.b46gn-card'];
 const out={theme:document.documentElement.dataset.theme,screen:innerWidth,url:location.href};
 for(const sel of targets){
   const all=[...document.querySelectorAll(sel)];
   out[sel]={total:all.length,first:all.filter(el=>el.getBoundingClientRect().width>0).slice(0,3).map(el=>{
     const st=getComputedStyle(el),r=el.getBoundingClientRect();
     return{cls:String(el.className),ariaExpanded:el.getAttribute('aria-expanded'),id:el.getAttribute('data-match-id'),bg:st.backgroundColor,gradient:st.backgroundImage,border:st.borderColor,shadow:st.boxShadow,visibility:st.visibility,h:Math.round(r.height),w:Math.round(r.width)};
   })};
 }
 return out;
};
try{
 for(const width of [1440,390]){
  const page=await browser.newPage();await page.setViewport({width,height:960,isMobile:width<500});
  await page.setCacheEnabled(false);await page.goto(origin+'?hover_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});await new Promise(r=>setTimeout(r,7000));
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await new Promise(r=>setTimeout(r,1100));
  console.log('AUDIT_BEFORE',JSON.stringify(await page.evaluate(styles)));
  if(width===1440){
   const rows=await page.$$('.workspace.singlepage .match-row');
   let selected=null;
   for(const row of rows){if(await row.evaluate(el=>el.getBoundingClientRect().width>0&&!el.classList.contains('active'))){selected=row;break;}}
   if(!selected)throw Error('NO_VISIBLE_PC_MATCH_FOR_HOVER');
   await selected.hover();await new Promise(r=>setTimeout(r,400));
   console.log('AUDIT_HOVER',JSON.stringify(await page.evaluate(styles)));
   await selected.click();await new Promise(r=>setTimeout(r,950));
   console.log('AUDIT_ACTIVE',JSON.stringify(await page.evaluate(styles)));
  } else {
   const cards=await page.$$('.b46gn-card');if(!cards.length)throw Error('MOBILE_CARDS_MISSING');
   await cards[0].click();await new Promise(r=>setTimeout(r,750));
   console.log('AUDIT_MOBILE_EXPANDED',JSON.stringify(await page.evaluate(styles)));
  }
  await page.close();
 }
}finally{await browser.close();}
console.log('READONLY_HOVER_ACTIVE_AUDIT_SUCCESS');
