import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const sleep=t=>new Promise(r=>setTimeout(r,t));
const results=[];
try{
for(const [width,mode,route] of [[1440,'dark','direct'],[390,'dark','direct'],[1440,'light','direct'],[390,'light','direct'],[1440,'dark','click']]){
 const p=await browser.newPage();await p.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
 const req=[],err=[];
 p.on('requestfinished',r=>{if(/css|singlepage|stats|statistics|script|index/i.test(r.url()))req.push({type:'finished',url:r.url().slice(-150),t:Date.now()});});
 p.on('pageerror',e=>err.push(String(e).slice(0,170)));
 await p.evaluateOnNewDocument(()=>{
  window.__flashAudit={events:[],mutations:[],start:Date.now()};
  const log=(kind,detail)=>window.__flashAudit.events.push({t:performance.now(),kind,detail});
  document.addEventListener('readystatechange',()=>log('readyState',document.readyState));
  document.addEventListener('DOMContentLoaded',()=>log('domready',{statVisible:!!document.querySelector('[data-workspace-panel="statistics"]:not([hidden])')}));
  window.addEventListener('load',()=>log('load',''));
  new MutationObserver(ms=>{for(const m of ms){
    if(!m.target?.closest?.('[data-workspace-panel="statistics"],[data-workspace-view],.workspace,.statistics-stage,.stats-stage')&&!/body|html/i.test(m.target?.tagName||''))continue;
    window.__flashAudit.mutations.push({t:Math.round(performance.now()),kind:m.type,target:m.target?.tagName+':'+String(m.target?.className||'').slice(0,90),
     attr:m.attributeName||'',add:[...m.addedNodes].slice(0,2).map(x=>String(x.className||x.nodeName).slice(0,80)),
     rem:[...m.removedNodes].slice(0,2).map(x=>String(x.className||x.nodeName).slice(0,80))});
  }if(window.__flashAudit.mutations.length>650)window.__flashAudit.mutations.splice(0,200)})
    .observe(document,{attributes:true,childList:true,subtree:true,attributeFilter:['style','class','hidden','aria-hidden','data-workspace-view','data-theme']});
 });
 const uri='https://ball46.com/?view='+(route==='click'?'all':'statistics')+'&stats_flash_audit='+Date.now();
 const start=Date.now();
 await p.goto(uri,{waitUntil:'domcontentloaded',timeout:90000});
 await p.evaluate(x=>document.documentElement.dataset.theme=x,mode);
 const snap=async(stage)=>p.evaluate(stage=>{
   const all=[...document.querySelectorAll('[class*=stat i],[data-workspace-panel],.workspace-stage,.main-board,.left-rail')];
   const els=all.filter(e=>/statistic|performance|win.*loss|statistics/i.test((e.textContent||'').slice(0,220))||/statistic|stat-stage/i.test(e.className||'')).slice(0,14);
   const rec=e=>{const css=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,cl:String(e.className).slice(0,110),
      txt:e.textContent.replace(/\s+/g,' ').slice(0,110),html:e.outerHTML.slice(0,350),
      display:css.display,visibility:css.visibility,opacity:css.opacity,
      bg:css.backgroundColor,animation:css.animationName,transition:css.transitionProperty,
      r:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}};
   return {stage,t:Math.round(performance.now()),href:location.href,
     ready:document.readyState,view:document.body.dataset.workspaceView,
     theme:document.documentElement.dataset.theme,
     bodyClasses:document.body.className,
     statElements:els.map(rec),
     statCount:document.querySelectorAll('[data-workspace-panel="statistics"]').length,
     activeStatsPanel:[...document.querySelectorAll('[data-workspace-panel="statistics"]')].map(rec),
     oldUI:[...document.querySelectorAll('[class*=legacy i],[class*=old-ui i],[class*=statistic i]')].slice(0,6).map(rec),
     styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>({url:x.href,loaded:!!x.sheet})).slice(-16),
     injectStyles:[...document.querySelectorAll('style[id]')].filter(x=>/stats|statistic|workspace|loading|v12/i.test(x.id)).map(x=>({id:x.id,len:x.textContent.length})).slice(-25),
     overlay:[...document.querySelectorAll('body *')].filter(x=>x.id&&/loading|splash|orbit/i.test(x.id)).slice(0,8).map(rec)};
 },stage);
 const rows=[];
 for(let [step,delay] of [['dom',0],['100ms',100],['250ms',150],['500ms',250],['800ms',300],['1400ms',600],['2200ms',800],['4000ms',1800]]){
  if(delay)await sleep(delay);
  const d=await snap(step);rows.push(d);
  if(['dom','250ms','800ms','2200ms','4000ms'].includes(step)){
   await p.screenshot({path:'proof/'+width+'-'+mode+'-'+route+'-'+step+'.png',fullPage:false});
  }
 }
 if(route==='click'){
  const click=await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('button,a,[role=tab]')].find(x=>/^\s*statistics\s*$/i.test(x.innerText||''));
    if(btn){btn.click();return {clicked:true,html:btn.outerHTML.slice(0,300)}}return {clicked:false};
  });
  await sleep(400);
  rows.push(await snap('after click 400ms'));
  await p.screenshot({path:'proof/'+width+'-'+mode+'-clicked.png',fullPage:false});
  rows.push({click});
 }
 const final=await p.evaluate(()=>({events:window.__flashAudit.events.slice(-60),mutations:window.__flashAudit.mutations.slice(-230),
    paint:performance.getEntriesByType('paint').map(x=>({name:x.name,t:Math.round(x.startTime)})),
    resources:performance.getEntriesByType('resource').filter(x=>/css|stat|singlepage|workspace/i.test(x.name)).slice(0,20).map(x=>({name:x.name.slice(-140),start:Math.round(x.startTime),end:Math.round(x.responseEnd)}))}));
 const result={width,mode,route,rows,final,errors:err,requests:req.slice(-40),wall:Date.now()-start};
 results.push(result);
 console.log('B46_STATS_FLASH_TIMELINE',JSON.stringify({width,mode,route,rows:rows.map(x=>({stage:x.stage,t:x.t,view:x.view,bodyClasses:x.bodyClasses,
    statCount:x.statCount,active:x.activeStatsPanel?.map(y=>({display:y.display,bg:y.bg,cl:y.cl,r:y.r})),oldUI:x.oldUI?.map(y=>({cl:y.cl,display:y.display})),
    injected:x.injectStyles?.map(z=>z.id)})),events:final.events,mutations:final.mutations.slice(-50),paint:final.paint,resources:final.resources,errors:err}).slice(0,50000));
 await p.close();
}
}finally{await browser.close();}
writeFileSync('proof/flash-timeline.json',JSON.stringify(results,null,2));
// Inspect public production assets. Output targeted snippets rather than huge logs.
for(const path of ['/','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/dashboard-v2-stage3-featured-facts-20261013a.js']){
 const r=await fetch('https://ball46.com'+path+'?stats_source_readonly='+Date.now(),{cache:'no-store'}),src=await r.text();
 console.log('B46_STATS_SOURCE_META',JSON.stringify({path,status:r.status,len:src.length,ctype:r.headers.get('content-type')}));
 const terms=path==='/'?['data-workspace-panel="statistics"','statistics-stage','data-workspace-view','statistics-card','stats-panel','statistics-tab']:
 ['data-workspace-panel','statistics','style.display','dataset.workspaceView','data-status-filter','stats','classList.add','innerHTML='];
 for(const t of terms){let start=0,n=0;while((start=src.indexOf(t,start))>=0&&n++<7){
  console.log('B46_STATS_SOURCE',JSON.stringify({path,needle:t,pos:start,body:src.slice(Math.max(0,start-350),start+1050)}).slice(0,1900));
  start+=t.length;
 }}
}
