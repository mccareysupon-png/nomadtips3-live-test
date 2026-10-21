import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('pc-proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try{
 for(const [width,height,mode] of [[1440,1050,'dark'],[1440,1050,'light'],[390,950,'dark']]){
  const page=await browser.newPage();
  await page.setViewport({width,height,deviceScaleFactor:1,isMobile:width<768});
  await page.goto('https://ball46.com/?pc_featured_readonly_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.evaluate(m=>{document.documentElement.dataset.theme=m},mode);
  await page.waitForSelector('.featured-card[data-featured]',{timeout:50000});
  await new Promise(r=>setTimeout(r,2300));
  const detail=await page.evaluate(()=>{
    const el=document.querySelector('.featured-card[data-featured]'),data=el.querySelector('.feature-facts');
    const props=['display','background','backgroundImage','backgroundColor','boxShadow','padding','margin','border','gap','gridTemplateColumns','width','minHeight','height','color','fontSize','opacity'];
    const styles=e=>{if(!e)return null;const st=getComputedStyle(e),r=e.getBoundingClientRect();return {selector:e.tagName+'.'+String(e.className||''),styles:Object.fromEntries(props.map(k=>[k,st[k]])),rect:{x:r.x,y:r.y,w:r.width,h:r.height},html:e.outerHTML.slice(0,1500)}};
    const hrefs=[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href).filter(v=>/featured|singlepage|dashboard|style/i.test(v));
    const imgs=[...data.querySelectorAll(':scope>div')].map(styles);
    return {title:el.querySelector('.card-title')?.textContent?.trim(),card:styles(el),factLayout:styles(data),facts:imgs,stylesheets:hrefs,
      inlineStyles:[...document.querySelectorAll('style[id]')].map(x=>x.id).filter(x=>/featured|match|b46|pc|statistics/i.test(x)).slice(-50),
      v4:!!document.getElementById('b46-expanded-only-v4'),v5Summary:document.querySelectorAll('.b46-native-summary').length,
      viewport:innerWidth};
  });
  await page.evaluate(()=>document.querySelector('.featured-card[data-featured]')?.scrollIntoView({behavior:'instant',block:'center'}));
  await page.screenshot({path:'pc-proof/'+width+'-'+mode+'.png',fullPage:false});
  console.log('B46_PC_FORENSIC',JSON.stringify({width,mode,...detail}));
  results.push({width,mode,detail});
  await page.close();
 }
}finally{await browser.close();}
writeFileSync('pc-proof/report.json',JSON.stringify(results,null,2));