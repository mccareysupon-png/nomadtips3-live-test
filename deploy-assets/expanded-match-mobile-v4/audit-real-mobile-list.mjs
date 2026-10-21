import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('mobile-proof',{recursive:true});
const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
const p=await b.newPage();await p.setViewport({width:390,height:1000,isMobile:true,deviceScaleFactor:1});
await p.goto('https://ball46.com/?view=live&mobile-real-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,6500));
const before=await p.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>100&&r.height>20&&getComputedStyle(e).display!=='none'};
 const names=[...document.querySelectorAll('[class*="b46m"]')].filter(visible);
 const summary=names.map(e=>({cl:String(e.className).slice(0,100),tag:e.tagName,txt:e.innerText?.slice(0,95),h:Math.round(e.getBoundingClientRect().height),html:e.outerHTML.slice(0,1300)}));
 const candidates=summary.filter(x=>/malacateco|comunicaciones|green shield|solomon/i.test(x.txt||''));
 const scripts=[...document.scripts].map((s,i)=>({i,src:s.src,length:s.textContent.length,b46m:s.textContent.includes('b46m'),match:s.textContent.includes('match-expanded')}));
 const native=document.querySelector('section.match-expanded'),nativeRect=native?.getBoundingClientRect();
 return {screen:innerWidth,docWidth:document.documentElement.scrollWidth,all:summary.slice(0,48),candidates:candidates.slice(-22),scripts,
  boardVis:(()=>{const e=document.querySelector('[data-board-sections]');return e?{cl:e.className,visible:visible(e),parent:e.parentElement?.className}:null})(),
  native:native?{className:native.className,visible:visible(native),rect:{y:nativeRect.y,w:nativeRect.width,h:nativeRect.height}}:null};
});
console.log('B46_MOBILE_REAL_BEFORE',JSON.stringify(before).slice(0,43000));
writeFileSync('mobile-proof/before.json',JSON.stringify(before,null,2));
const texts=await p.evaluate(()=>[...document.scripts].filter(s=>!s.src&&s.textContent.includes('b46m')).map((s,i)=>({i,len:s.textContent.length,text:s.textContent})));
for(const t of texts)if(t.len>300)writeFileSync('mobile-proof/inline-b46m-'+t.i+'.js',t.text);
let clicked=false;
for(const selector of ['.b46m-match-card','.b46m-card','[class*="b46m-match"]','[data-b46m-match-id]']){
 const e=await p.$(selector);
 if(e){const r=await e.boundingBox();if(r&&r.width>200){await e.click();clicked=true;console.log('MOBILE_REAL_CLICK_SELECTOR',selector);break;}}
}
if(!clicked) {
 const click=await p.evaluate(()=>{
  const names=[...document.querySelectorAll('[class*="b46m"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>45&&r.height<450&&/malacateco|comunicaciones/i.test(e.innerText||'')});
  names.sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height);
  const e=names[0];if(e){e.click();return{clicked:true,selector:e.className,html:e.outerHTML.slice(0,1000)}}return{clicked:false};
 });console.log('MOBILE_REAL_FALLBACK_CLICK',JSON.stringify(click));
}
await new Promise(r=>setTimeout(r,2600));
const after=await p.evaluate(()=>{
 const nodes=[...document.querySelectorAll('[class*="b46m"],.match-expanded')].filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.height>35&&getComputedStyle(e).display!=='none'});
 const hits=nodes.filter(e=>/malacateco|comunicaciones|half-time|event flow|full market|signal/i.test(e.innerText||'')).slice(-30);
 return{selected:[...document.querySelectorAll('[aria-expanded=true]')].map(e=>({cl:e.className,html:e.outerHTML.slice(0,1400)})),details:hits.map(e=>({cl:String(e.className),tag:e.tagName,html:e.outerHTML.slice(0,12000)})).slice(-20),
  nativeExpanded:[...document.querySelectorAll('.match-expanded')].map(e=>({p:e.parentElement?.className,display:getComputedStyle(e).display,rect:e.getBoundingClientRect().width,html:e.outerHTML.slice(0,2200)})), scrollY};
});
console.log('B46_MOBILE_REAL_AFTER',JSON.stringify(after).slice(0,51000));
writeFileSync('mobile-proof/after.json',JSON.stringify(after,null,2));
await p.screenshot({path:'mobile-proof/after.png',fullPage:false});
await p.close();
}finally{await b.close()}