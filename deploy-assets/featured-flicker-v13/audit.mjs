import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('audit-proof',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const all=[];
try{
for(const [width,theme] of [[1440,'dark'],[390,'dark'],[390,'light']]){
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewport({width,height:1000,isMobile:width<768,deviceScaleFactor:1});
 await page.goto('https://ball46.com/?view=all&flicker_v13_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await page.waitForSelector('.featured-card[data-featured]',{timeout:45000});
 if(width<768){
   await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:50000});
   await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
   await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card'),{timeout:12000});
 }
 await page.evaluate(()=>{
   const sel=innerWidth<768?'#b46gn-detail .b46gn-featured .featured-card[data-featured]':'.right-rail > .featured-card[data-featured]';
   window.__b46v13={events:[],rootId:null};
   const root=document.querySelector(sel),ids=new WeakMap();let z=0;
   const id=n=>{if(!ids.has(n))ids.set(n,++z);return ids.get(n)};
   window.__b46v13.rootId=id(root);
   new MutationObserver(ms=>{
    for(const m of ms){
      const parent=m.target.nodeType===1?m.target:m.target.parentElement;
      if(m.type==='childList'){
       window.__b46v13.events.push({t:Math.round(performance.now()),target:String(parent?.className||parent?.tagName).slice(0,100),
        added:[...m.addedNodes].filter(n=>n.nodeType===1).slice(0,4).map(n=>({id:id(n),cl:String(n.className||''),tag:n.tagName})),
        removed:[...m.removedNodes].filter(n=>n.nodeType===1).slice(0,4).map(n=>({id:id(n),cl:String(n.className||''),tag:n.tagName}))});
      }else if(m.attributeName==='style'||m.attributeName==='class'){
       window.__b46v13.events.push({t:Math.round(performance.now()),type:'attr',name:m.attributeName,target:String(parent?.className||''),value:parent?.getAttribute(m.attributeName)?.slice(0,200)});
      }
    }
    if(window.__b46v13.events.length>2000)window.__b46v13.events.splice(0,700);
   }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
   new MutationObserver(ms=>{for(const m of ms)if([...m.removedNodes,...m.addedNodes].includes(root))
     window.__b46v13.events.push({t:Math.round(performance.now()),type:'ROOT_REPLACE'})}).observe(root.parentNode,{childList:true});
 });
 const samples=[];
 for(let i=0;i<40;i++){
  const row=await page.evaluate(()=>{
   const all=[...document.querySelectorAll('.featured-card[data-featured]')];
   const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):
        document.querySelector('.right-rail > .featured-card[data-featured]');
   const rec=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{
      x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:s.display,
      visibility:s.visibility,opacity:s.opacity,animation:s.animationName,transition:s.transitionProperty,
      bg:s.backgroundColor,shadow:s.boxShadow?.slice(0,200),transform:s.transform}};
   const flags=[...document.querySelectorAll('.league-flag-ready[data-league-flag-code]')];
   const dup=flags.filter(n=>n.querySelector('img.league-flag')&&n.querySelector('.league-globe'));
   const globe=flags.filter(n=>n.querySelector('.league-globe'));
   const img=flags.filter(n=>n.querySelector('img.league-flag'));
   return {t:Math.round(performance.now()),root:rec(root),child:[...root.children].filter(x=>x.classList?.length).map(n=>({cl:String(n.className).slice(0,55),...rec(n)})),
    score:root.querySelector('[data-featured-score]')?.textContent.trim(),facts:root.querySelector('.feature-facts')?.textContent.replace(/\s+/g,' ').slice(0,220),
    statRows:root.querySelectorAll('.feature-stats .stat-row').length,signal:root.querySelectorAll('.feature-signal-main').length,
    events:root.querySelectorAll('.feature-events .event-item').length,
    roots:all.map(n=>({parent:String(n.parentElement?.className).slice(0,80),...rec(n)})),
    flags:{count:flags.length,globe:globe.length,img:img.length,duplicate:dup.length,dup:dup.slice(0,8).map(n=>n.outerHTML.slice(0,580)),
      globeExamples:globe.slice(0,8).map(n=>n.outerHTML.slice(0,400))}};
  });
  samples.push(row);await sleep(250);
 }
 const mutation=await page.evaluate(()=>window.__b46v13);
 const counts={};for(const x of mutation.events){const a=(x.type||'child')+':'+x.target;counts[a]=(counts[a]||0)+1}
 const jumps=[];for(let i=1;i<samples.length;i++)if(samples[i].root&&samples[i-1].root&&(Math.abs(samples[i].root.h-samples[i-1].root.h)>4||
 samples[i].statRows!==samples[i-1].statRows||samples[i].flags.duplicate!==samples[i-1].flags.duplicate))jumps.push({t:samples[i].t,from:samples[i-1],to:samples[i]});
 const out={width,theme,initial:samples[0],final:samples.at(-1),jumps:jumps.slice(0,8).map(e=>({t:e.t,before:{root:e.from.root,stat:e.from.statRows,flags:e.from.flags},after:{root:e.to.root,stat:e.to.statRows,flags:e.to.flags}})),
  eventStats:counts,mutations:mutation.events.slice(-100),errors};
 all.push(out);console.log('B46_FEATURED_FLAG_V13_READONLY_AUDIT',JSON.stringify(out).slice(0,45000));
 await page.screenshot({path:'audit-proof/'+width+'-'+theme+'.png',fullPage:false});
 await page.close();
}
for(const p of ['/league-flags-343.js','/singlepage-workspace-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js','/']){
 const r=await fetch('https://ball46.com'+p+'?v13_source_readonly='+Date.now()),s=await r.text();
 console.log('B46_V13_SOURCE_META',JSON.stringify({path:p,status:r.status,len:s.length,ct:r.headers.get('content-type')}));
 const needles=p==='/league-flags-343.js'?['function flag(code)','function globe()','placeholder=globe','decorateLine','MutationObserver']:
 ['[data-featured]','feature-stats','feature-facts','data-featured-score','renderFeatured','statistics','b46-featured-faithful-v11-20261021'];
 for(const n of needles){let i=0,c=0;while((i=s.indexOf(n,i))>=0&&c++<4){console.log('B46_V13_SOURCE_SNIP',JSON.stringify({p,needle:n,pos:i,txt:s.slice(Math.max(0,i-350),i+1400)}));i+=n.length}}
}
}finally{await browser.close()}
writeFileSync('audit-proof/report.json',JSON.stringify(all,null,2));