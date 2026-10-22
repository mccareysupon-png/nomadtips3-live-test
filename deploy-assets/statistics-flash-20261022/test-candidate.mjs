import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('candidate-proof',{recursive:true});
const CSS=readFileSync('stats-no-flash.css','utf8'),JS=readFileSync('stats-ready.js','utf8');
const wrapper='<style id="b46-statistics-no-old-flash-candidate-20261022">'+CSS+'</style><script id="b46-statistics-ready-candidate-20261022">'+JS+'</script>';
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), reports=[];
const path='https://ball46.com/';
const headers={cache:'no-store'};
try{
for(const [width,theme,view] of [[1440,'dark','statistics'],[1440,'light','statistics'],[390,'dark','statistics'],[390,'light','statistics'],[1440,'dark','all']]){
 const p=await browser.newPage();await p.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
 const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const url=path+'?view='+view+'&stats_candidate='+Date.now();
 const r=await fetch(url,{headers});
 assert(r.status===200,'HTML_NOT_AVAILABLE');let source=await r.text();
 assert(source.includes('data-sp-feed-state')&&source.includes('<\\/head>'.replace('\\','')),'STAT_HTML_CHANGED');
 source=source.replace(/<\/head>/i,()=>wrapper+'</head>');
 assert(source.includes(wrapper),'WRAPPER_MISSING_FROM_CANDIDATE');
 await p.setRequestInterception(true);
 p.on('request',request=>{
  if(request.isNavigationRequest()&&request.url().startsWith(path))request.respond({status:200,contentType:'text/html; charset=utf-8',body:source});
  else request.continue();
 });
 try{
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const frames=[];
  for(let [tag,wait] of [['dom',0],['300ms',300],['1000ms',700],['2000ms',1000],['4000ms',2000],['8000ms',4000],['14000ms',6000]]){
   if(wait)await sleep(wait);
   const f=await p.evaluate(tag=>{
    const panel=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]'),content=panel?.querySelector(':scope>.sp-stats-content');
    const st=panel?.querySelector('[data-sp-feed-state]'),kpi=panel?.querySelector('.sp-kpis');
    const css=content?getComputedStyle(content):null;
    return {tag,t:Math.round(performance.now()),view:document.body.dataset.workspaceView,
      ready:document.documentElement.getAttribute('data-b46-statistics-render-ready'),
      error:document.documentElement.getAttribute('data-b46-statistics-render-error'),
      status:st?.textContent.trim().slice(0,150),kpiCount:kpi?.querySelectorAll('.sp-kpi').length,
      statContentDisplay:css?.display,statContentHeight:content?.getBoundingClientRect().height,
      pseudo:getComputedStyle(panel,'::after').content,
      allMatchCount:document.querySelectorAll('article.match-row[data-match-id]').length,
      docWidth:document.documentElement.scrollWidth};
   },tag);
   frames.push(f);
   if(['300ms','2000ms','8000ms','14000ms'].includes(tag))await p.screenshot({path:'candidate-proof/'+width+'-'+theme+'-'+view+'-'+tag+'.png',fullPage:false});
   if(tag==='14000ms'&&view==='statistics'){
    assert(f.ready==='1','DATA_LOADED_BUT_GATE_NOT_OPEN: '+JSON.stringify(f));
    assert(f.statContentDisplay!=='none','STAT_DATA_STILL_HIDDEN '+JSON.stringify(f));
   }
  }
  if(view==='statistics'){
   const pre=frames.filter(x=>x.ready!=='1');
   assert(pre.every(x=>x.statContentDisplay==='none'),'OLD_STATISTICS_VISIBLE_DURING_HYDRATION '+JSON.stringify(pre));
   const now=frames.find(x=>x.ready==='1');
   assert(now&&now.kpiCount>=7,'RENDERED_STATISTICS_NOT_LOADED '+JSON.stringify(frames));
  }else assert(frames.every(x=>x.view==='live'),'OTHER_VIEW_CHANGED');
  assert.deepEqual(errors,[],'UNCUGHT_CLIENT_ERRORS');
  const record={width,theme,view,frames};
  reports.push(record);console.log('B46_STATS_NO_OLD_UI_CANDIDATE_QA_PASS',JSON.stringify(record));
 }finally{await p.close();}
}
}finally{await browser.close();}
writeFileSync('candidate-proof/report.json',JSON.stringify(reports,null,2));