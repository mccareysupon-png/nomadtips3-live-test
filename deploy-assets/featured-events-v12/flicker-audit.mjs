import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('flicker-audit',{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const all=[];
try{
for(const [width,theme] of [[390,'dark'],[390,'light'],[1440,'dark']]){
const page=await browser.newPage();
const errors=[];
await page.setViewport({width,height:980,isMobile:width<768,deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e).slice(0,320)));
await page.evaluateOnNewDocument(()=>{
window.__b46FlickerAudit={mutations:[],shifts:[],get(){return this.mutations},summary(){return {mutations:this.mutations.slice(-250),shifts:this.shifts.slice(-80)}}};
const rootSelector=innerWidth<768?'#b46gn-detail .b46gn-featured .featured-card[data-featured]':'.right-rail > .featured-card[data-featured]';
const nodeId=new WeakMap();let next=0;
function id(node){if(!node)return 0;if(!nodeId.has(node))nodeId.set(node,++next);return nodeId.get(node)}
function init(){
 const audit=window.__b46FlickerAudit;
 const matchingRoot=()=>document.querySelector(rootSelector);
 const target=matchingRoot();
 if(!target)return;
 const timing=()=>Math.round(performance.now());
 const area=n=>{const r=n.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)}};
 const describe=n=>n?.nodeType===1?{id:id(n),tag:n.tagName,cls:String(n.className||'').slice(0,100),data:n.textContent?.replace(/\s+/g,' ').slice(0,80),size:area(n)}:{nodeType:n?.nodeType||0};
 const obs=new MutationObserver(ms=>{
   for(const m of ms){
    if(m.type==='childList'){
     const record={t:timing(),kind:'childList',parent:describe(m.target),
      removed:[...m.removedNodes].slice(0,3).map(describe),
      added:[...m.addedNodes].slice(0,3).map(describe)};
     audit.mutations.push(record);
    }else if(m.type==='attributes')audit.mutations.push({
       t:timing(),kind:'attr',attr:m.attributeName,node:describe(m.target),
       value:m.target.getAttribute(m.attributeName)?.slice(0,130)});
    else if(m.type==='characterData')audit.mutations.push({t:timing(),kind:'text',parent:describe(m.target.parentElement)});
   }
   if(audit.mutations.length>2500)audit.mutations.splice(0,600);
 });
 obs.observe(target,{attributes:true,subtree:true,attributeFilter:['style','class','data-v11-count','data-v11-kind','data-v11-label','data-v11-value','data-v11-event','data-v11-side'],childList:true,characterData:true});
 const rootParent=target.parentNode;
 new MutationObserver(ms=>{
  for(const m of ms)if([...m.addedNodes,...m.removedNodes].some(n=>n===target)){
    audit.mutations.push({t:timing(),kind:'ROOT_REPLACED',parent:describe(m.target)});
  }
 }).observe(rootParent,{childList:true});
 audit.rootIdentity=id(target);
 audit.started=performance.now();
 try{
  new PerformanceObserver(l=>{for(const entry of l.getEntries()){
   const s={t:Math.round(entry.startTime),value:entry.value,hadRecentInput:entry.hadRecentInput,
    sources:(entry.sources||[]).slice(0,8).map(x=>({tag:x.node?.tagName,cls:String(x.node?.className||''),previous:x.previousRect,current:x.currentRect}))};
   audit.shifts.push(s);
  }}).observe({type:'layout-shift',buffered:true});
 }catch(e){audit.perfObserverError=String(e)}
}
let n=0;const t=setInterval(()=>{if(document.querySelector(rootSelector)){clearInterval(t);init()}else if(++n>150)clearInterval(t)},200);
});
await page.goto('https://ball46.com/?view=all&b46_flicker_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
await page.waitForSelector('.featured-card[data-featured]',{timeout:50000});
if(width<768){
 await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:55000});
 await page.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]')?.click());
 await page.waitForSelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card',{timeout:18000});
}
const samples=[];
for(let i=0;i<80;i++){
 const s=await page.evaluate(i=>{
  const root=innerWidth<768?document.querySelector('#b46gn-detail .b46gn-featured .featured-card[data-featured]'):document.querySelector('.right-rail > .featured-card[data-featured]');
  if(!root)return {i,missing:true};
  const selectors=['.card-title','.feature-score','.feature-facts','.feature-signal','.feature-stats','.feature-events'];
  const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),css=getComputedStyle(e);
    return {x:Math.round(r.x*10)/10,y:Math.round(r.y*10)/10,w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,
       display:css.display,visibility:css.visibility,opacity:css.opacity,animation:css.animationName,transition:css.transitionProperty,
       transform:css.transform,background:css.backgroundColor,margin:css.margin}};
  const sections=Object.fromEntries(selectors.map(k=>[k,box(root.querySelector(':scope>'+k))]));
  const active=root.querySelector('.feature-signal');
  const totals={facts:root.querySelectorAll('.feature-facts>div').length,signal:active?.querySelectorAll(':scope>.feature-signal-main').length,
   signalBadge:active?.dataset.v11Count,stats:root.querySelectorAll('.feature-stats .stat-row').length,
   events:root.querySelectorAll('.feature-events .event-item').length,legends:root.querySelectorAll('.b46v11-legend').length};
  return {i,t:Math.round(performance.now()),root:box(root),sections,totals,
   score:root.querySelector('[data-featured-score]')?.textContent.trim(),
   href:location.href,theme:document.documentElement.dataset.theme,
   docHeight:document.documentElement.scrollHeight,docWidth:document.documentElement.scrollWidth};
 },i);
 samples.push(s);
 await pause(210);
}
const extra=await page.evaluate(()=>({
  audit:window.__b46FlickerAudit?.summary(),
  rootIdentity:window.__b46FlickerAudit?.rootIdentity,
  intervalAttached:!!window.__b46FeaturedFaithfulV11,
  styleTags:[...document.querySelectorAll('style[id]')].filter(s=>/native|featured|v10|v11/i.test(s.id)).map(s=>({id:s.id,length:s.textContent.length})),
  scriptTags:[...document.querySelectorAll('script[id]')].filter(s=>/featured|v11/i.test(s.id)).map(s=>s.id)
}));
const movement=[];
for(let i=1;i<samples.length;i++){
 const a=samples[i-1],b=samples[i]; if(!a?.root||!b?.root)continue;
 if(Math.abs(a.root.h-b.root.h)>=2||Math.abs(a.root.y-b.root.y)>=2||a.totals.events!==b.totals.events||
 a.totals.stats!==b.totals.stats||a.totals.signal!==b.totals.signal||a.totals.legends!==b.totals.legends)
 movement.push({t:b.t,from:{root:a.root,totals:a.totals},to:{root:b.root,totals:b.totals}});
}
const summary={width,theme,
 samples:samples.length,initial:samples[0],final:samples.at(-1),
 movement,mutations:extra.audit?.mutations?.slice(0,250),
 layoutShifts:extra.audit?.shifts,
 rootIdentity:extra.rootIdentity,intervalAttached:extra.intervalAttached,
 styles:extra.styleTags,scripts:extra.scriptTags,errors};
console.log('B46_FLICKER_MOTION_AUDIT',JSON.stringify({...summary,mutations:summary.mutations?.slice(0,75)}).slice(0,50000));
all.push(summary);
await page.screenshot({path:'flicker-audit/'+width+'-'+theme+'.png',fullPage:false});
await page.close();
}
}finally{await browser.close();}
writeFileSync('flicker-audit/report.json',JSON.stringify(all,null,2));