import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('proof',{recursive:true});
const chrome='/usr/bin/google-chrome';
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
const all=[];
try{
 for(const [width,tab] of [[390,'all'],[390,'live'],[1440,'all']]){
  const page=await browser.newPage();const req=[],errors=[];
  await page.setViewport({width,height:960,isMobile:width<768,deviceScaleFactor:1});
  page.on('request',r=>{if(/flag|country|league|icon|svg/i.test(r.url()))req.push({at:Date.now(),url:r.url().slice(0,140)});});
  page.on('pageerror',e=>errors.push(String(e).slice(0,130)));
  await page.evaluateOnNewDocument(()=>{
   window.__b46FlagAudit={changes:[],getData(){return this.changes.slice(-150)},snapshot(){return []}};
   const stamp=new WeakMap();let counter=0;
   const id=n=>{if(!stamp.has(n))stamp.set(n,++counter);return stamp.get(n)};
   function sig(n){if(!n||n.nodeType!==1)return '';
    const el=n;
    const p=(el.outerHTML||'').slice(0,400);
    const name=(el.getAttribute('class')||'')+' '+(el.getAttribute('id')||'')+' '+(el.getAttribute('alt')||'')+' '+(el.getAttribute('aria-label')||'');
    const text=(el.textContent||'').slice(0,140);
    const img=el.tagName==='IMG'||el.tagName==='SVG';
    if(!img&&!/flag|country|league|featured|b46gn/i.test(name)&&!/[🇦-🇿]/u.test(text.slice(0,70)))return '';
    return {id:id(el),html:p,text:text.slice(0,70),tag:el.tagName};
   }
   function scan(node,type){if(!node||node.nodeType!==1)return;
     const xs=[node,...node.querySelectorAll('img,svg,[class*="flag"],[class*="league"],[class*="country"],[class*="featured"]')].slice(0,100);
     const list=xs.map(sig).filter(Boolean);
     if(list.length)window.__b46FlagAudit.changes.push({at:performance.now(),type,elements:list.slice(0,8)});
   }
   const observer=new MutationObserver(ms=>{
    for(const m of ms){
     if(m.type==='childList'){
      for(const n of m.removedNodes)scan(n,'removed');
      for(const n of m.addedNodes)scan(n,'added');
     }else if(m.type==='attributes'&&m.target.tagName==='IMG'){
      window.__b46FlagAudit.changes.push({at:performance.now(),type:'img-attr',el:sig(m.target),attr:m.attributeName});
     }
    }
    if(window.__b46FlagAudit.changes.length>1200)window.__b46FlagAudit.changes.splice(0,500);
   });
   document.addEventListener('DOMContentLoaded',()=>observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']}));
  });
  try{
   await page.goto('https://ball46.com/?view='+tab+'&b46_flag_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForSelector('.workspace.singlepage',{timeout:25000});
   const snapshots=[];
   const snap=async(t)=>page.evaluate(t=>{
     const matches=e=>{let cls=String(e.className||'');let alt=e.getAttribute('alt')||'';let a=e.getAttribute('aria-label')||'';return /flag|country|league/i.test(cls+' '+alt+' '+a)||e.tagName==='IMG'&&/flag|country|league/i.test(e.src)||[...e.textContent.slice(0,4)].some(ch=>ch.codePointAt(0)>=0x1f1e6&&ch.codePointAt(0)<=0x1f1ff)};
     const elems=[...document.querySelectorAll('[class*="flag" i],[class*="league" i],img,[aria-label*=flag i]')].filter(e=>matches(e)).slice(0,80);
     const toRec=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,cls:String(e.className||'').slice(0,130),html:e.outerHTML.slice(0,420),text:e.textContent.trim().slice(0,90),visible:r.width>0&&r.height>0,animation:s.animationName,opacity:s.opacity,transition:s.transitionProperty}};
     return {t,flags:elems.map(toRec),errors:[],count:elems.length,changes:window.__b46FlagAudit.changes.length,
      lastChanges:window.__b46FlagAudit.changes.slice(-18)};
   },t);
   for(let t of [1,4,8,12]){await new Promise(r=>setTimeout(r,t===1?1000:4000));snapshots.push(await snap(t));}
   const report={width,tab,snapshots,requests:req,errors};all.push(report);
   console.log('B46_FLAG_AUDIT',JSON.stringify({width,tab,requests:req,errors,flags:snapshots.map(x=>({t:x.t,count:x.count,examples:x.flags.slice(0,14),changes:x.changes})),changes:snapshots.at(-1).lastChanges}).slice(0,41000));
   await page.screenshot({path:'proof/'+width+'-'+tab+'.png',fullPage:false});
  }finally{await page.close();}
 }
}finally{await browser.close();}
writeFileSync('proof/flag-audit.json',JSON.stringify(all,null,2));